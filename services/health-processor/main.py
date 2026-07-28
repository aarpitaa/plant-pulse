"""
PlantPulse Health Processor Service
====================================
Consumes validated telemetry from ``telemetry.valid``, computes machine health
severity (normal / warning / critical), updates the ``machines`` table, and
publishes ``incidents.detected`` events when thresholds are crossed.

Thresholds:
    Critical: temperature_c > 90 AND vibration_mm_s > 7
    Warning:  temperature_c > 80 OR vibration_mm_s > 5
    Normal:   otherwise

Environment variables:
    KAFKA_BOOTSTRAP_SERVERS
    POSTGRES_URL
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
from aiokafka import AIOKafkaConsumer, AIOKafkaProducer

log = logging.getLogger("health-processor")
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"), format="%(asctime)s %(name)s %(levelname)s %(message)s")

KAFKA_BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
POSTGRES_URL = os.getenv("POSTGRES_URL", "postgresql://localhost/plantpulse")
SOURCE_TOPIC = "telemetry.valid"
INCIDENTS_TOPIC = "incidents.detected"
GROUP_ID = "health-processor"

Severity = Literal["normal", "warning", "critical"]

# Cache to avoid opening duplicate incidents within a 5-minute window
_recent_incidents: dict[str, float] = {}
_INCIDENT_COOLDOWN = 5 * 60  # seconds

def compute_severity(temp: float, vib: float) -> Severity:
    if temp > 90 and vib > 7:
        return "critical"
    if temp > 80 or vib > 5:
        return "warning"
    return "normal"

async def maybe_open_incident(
    pool: asyncpg.Pool,
    producer: AIOKafkaProducer,
    machine_id: str,
    site_id: str,
    temp: float,
    vib: float,
) -> None:
    now = datetime.now(timezone.utc).timestamp()
    last = _recent_incidents.get(machine_id, 0)
    if now - last < _INCIDENT_COOLDOWN:
        return

    existing = await pool.fetchrow(
        "SELECT id FROM incidents WHERE machine_id = $1 AND status = 'open' LIMIT 1",
        machine_id,
    )
    if existing:
        return

    row = await pool.fetchrow(
        """
        INSERT INTO incidents (machine_id, site_id, severity, status, title, description, detected_at)
        VALUES ($1, $2, 'critical', 'open', $3, $4, NOW())
        RETURNING id
        """,
        machine_id,
        site_id,
        f"Critical condition on {machine_id}",
        f"Temperature {temp:.1f}°C, Vibration {vib:.1f} mm/s",
    )
    if row:
        _recent_incidents[machine_id] = now
        event = {
            "incident_id": row["id"],
            "machine_id": machine_id,
            "site_id": site_id,
            "severity": "critical",
            "detected_at": datetime.now(timezone.utc).isoformat(),
        }
        await producer.send_and_wait(INCIDENTS_TOPIC, key=machine_id.encode(), value=json.dumps(event).encode())
        log.info("Incident %d opened for machine %s", row["id"], machine_id)

async def main() -> None:
    pool = await asyncpg.create_pool(POSTGRES_URL, min_size=4, max_size=16)
    consumer = AIOKafkaConsumer(
        SOURCE_TOPIC,
        bootstrap_servers=KAFKA_BOOTSTRAP,
        group_id=GROUP_ID,
        auto_offset_reset="latest",
        enable_auto_commit=True,
    )
    producer = AIOKafkaProducer(bootstrap_servers=KAFKA_BOOTSTRAP)
    await consumer.start()
    await producer.start()
    log.info("Health processor ready — consuming %s", SOURCE_TOPIC)

    try:
        async for msg in consumer:
            try:
                event = json.loads(msg.value)
                machine_id = event["machine_id"]
                site_id = event["site_id"]
                temp = float(event["temperature_c"])
                psi = float(event["pressure_psi"])
                vib = float(event["vibration_mm_s"])
                status = event.get("status", "running")

                severity = compute_severity(temp, vib)

                await pool.execute(
                    """
                    UPDATE machines
                    SET severity = $1, temperature_c = $2, pressure_psi = $3,
                        vibration_mm_s = $4, status = $5, last_reading_at = NOW(), updated_at = NOW()
                    WHERE machine_id = $6
                    """,
                    severity, temp, psi, vib, status, machine_id,
                )

                if severity == "critical":
                    await maybe_open_incident(pool, producer, machine_id, site_id, temp, vib)
                elif severity == "normal":
                    await pool.execute(
                        "UPDATE incidents SET status = 'resolved', resolved_at = NOW() WHERE machine_id = $1 AND status = 'open'",
                        machine_id,
                    )

            except Exception as exc:
                log.exception("Health processor error", exc_info=exc)
    finally:
        await consumer.stop()
        await producer.stop()
        await pool.close()

if __name__ == "__main__":
    asyncio.run(main())
