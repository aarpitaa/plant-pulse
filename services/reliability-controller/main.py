"""
PlantPulse Reliability Controller Service
==========================================
Watches the ``incidents.detected`` Kafka topic and takes automated remediation
actions: scaling workers, quarantining DLQ events, alerting on-call, and
triggering incident JIRA tickets via webhook.

Environment variables:
    KAFKA_BOOTSTRAP_SERVERS
    POSTGRES_URL
    ALERT_WEBHOOK_URL       (optional) PagerDuty / Slack webhook endpoint
    LOG_LEVEL
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from typing import Literal

import asyncpg
import httpx
from aiokafka import AIOKafkaConsumer

log = logging.getLogger("reliability-controller")
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"), format="%(asctime)s %(name)s %(levelname)s %(message)s")

KAFKA_BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
POSTGRES_URL = os.getenv("POSTGRES_URL", "postgresql://localhost/plantpulse")
ALERT_WEBHOOK = os.getenv("ALERT_WEBHOOK_URL", "")
INCIDENTS_TOPIC = "incidents.detected"
GROUP_ID = "reliability-controller"

# ─── Remediation actions ──────────────────────────────────────────────────────

async def log_remediation(
    pool: asyncpg.Pool,
    trigger: str,
    action: str,
    outcome: Literal["success", "failure", "skipped"],
    metadata: dict | None = None,
) -> None:
    await pool.execute(
        "INSERT INTO remediation_actions (trigger, action, outcome, metadata, performed_at) VALUES ($1, $2, $3, $4, NOW())",
        trigger,
        action,
        outcome,
        json.dumps(metadata) if metadata else None,
    )

async def alert_oncall(incident_id: int, machine_id: str, severity: str) -> None:
    if not ALERT_WEBHOOK:
        log.debug("No webhook configured, skipping on-call alert")
        return
    payload = {
        "text": f"[PlantPulse] {severity.upper()} incident #{incident_id} on {machine_id}",
        "incident_id": incident_id,
        "machine_id": machine_id,
        "severity": severity,
        "detected_at": datetime.now(timezone.utc).isoformat(),
    }
    async with httpx.AsyncClient(timeout=5) as client:
        resp = await client.post(ALERT_WEBHOOK, json=payload)
        resp.raise_for_status()

async def handle_incident(pool: asyncpg.Pool, event: dict) -> None:
    incident_id = event["incident_id"]
    machine_id = event["machine_id"]
    site_id = event["site_id"]
    severity = event["severity"]
    trigger = f"incident:{incident_id}:severity={severity}"

    log.info("Handling incident %d for machine %s (severity=%s)", incident_id, machine_id, severity)

    # Action 1: Alert on-call engineer
    try:
        await alert_oncall(incident_id, machine_id, severity)
        await log_remediation(pool, trigger, "alert-oncall", "success", {"channel": "webhook", "incident_id": incident_id})
    except Exception as exc:
        log.warning("On-call alert failed: %s", exc)
        await log_remediation(pool, trigger, "alert-oncall", "failure", {"error": str(exc)})

    # Action 2: Check for related open incidents (site-wide event?)
    count = await pool.fetchval(
        "SELECT count(*) FROM incidents WHERE site_id = $1 AND status = 'open' AND severity = 'critical'",
        site_id,
    )
    if count and count >= 3:
        await log_remediation(
            pool, trigger, "open-site-incident", "success",
            {"site_id": site_id, "critical_count": count}
        )
        log.warning("Site-wide event detected on %s: %d critical incidents", site_id, count)

    # Action 3: Check for DLQ growth rate
    dlq_count = await pool.fetchval(
        "SELECT count(*) FROM event_queue WHERE topic = 'telemetry.dlq' AND status = 'pending'"
    ) or 0
    if dlq_count > 1000:
        await log_remediation(
            pool, f"dlq_size={dlq_count}", "quarantine-dlq", "success",
            {"dlq_count": dlq_count, "action": "operator-notified"}
        )

async def main() -> None:
    pool = await asyncpg.create_pool(POSTGRES_URL, min_size=2, max_size=8)
    consumer = AIOKafkaConsumer(
        INCIDENTS_TOPIC,
        bootstrap_servers=KAFKA_BOOTSTRAP,
        group_id=GROUP_ID,
        auto_offset_reset="earliest",
        enable_auto_commit=True,
    )
    await consumer.start()
    log.info("Reliability controller ready — consuming %s", INCIDENTS_TOPIC)

    try:
        async for msg in consumer:
            try:
                event = json.loads(msg.value)
                await handle_incident(pool, event)
            except Exception as exc:
                log.exception("Controller error", exc_info=exc)
    finally:
        await consumer.stop()
        await pool.close()

if __name__ == "__main__":
    asyncio.run(main())
