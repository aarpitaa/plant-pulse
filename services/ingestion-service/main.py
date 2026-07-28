"""
PlantPulse Ingestion Service
============================
Consumes from ``telemetry.raw``, validates each event, and routes valid events
to ``telemetry.valid`` or malformed events to ``telemetry.dlq``.

Environment variables:
    KAFKA_BOOTSTRAP_SERVERS
    POSTGRES_URL
    LOG_LEVEL
"""
from __future__ import annotations

import asyncio
import json
import logging
import math
import os
from datetime import datetime, timezone

import asyncpg
from aiokafka import AIOKafkaConsumer, AIOKafkaProducer
from pydantic import BaseModel, field_validator, ValidationError

log = logging.getLogger("ingestion-service")
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"), format="%(asctime)s %(name)s %(levelname)s %(message)s")

KAFKA_BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
POSTGRES_URL = os.getenv("POSTGRES_URL", "postgresql://localhost/plantpulse")
SOURCE_TOPIC = "telemetry.raw"
VALID_TOPIC = "telemetry.valid"
DLQ_TOPIC = "telemetry.dlq"
GROUP_ID = "ingestion-service"

# ─── Schema ───────────────────────────────────────────────────────────────────

class TelemetryEvent(BaseModel):
    machine_id: str
    site_id: str
    timestamp: str
    temperature_c: float
    pressure_psi: float
    vibration_mm_s: float
    status: str

    @field_validator("temperature_c")
    @classmethod
    def validate_temperature(cls, v: float) -> float:
        if math.isnan(v) or math.isinf(v) or not (-50 <= v <= 300):
            raise ValueError(f"temperature_c out of range: {v}")
        return v

    @field_validator("vibration_mm_s")
    @classmethod
    def validate_vibration(cls, v: float) -> float:
        if math.isnan(v) or math.isinf(v) or v < 0:
            raise ValueError(f"vibration_mm_s invalid: {v}")
        return v

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        if v not in ("running", "stopped", "maintenance", "offline"):
            raise ValueError(f"unknown status: {v}")
        return v

# ─── Main ─────────────────────────────────────────────────────────────────────

async def main() -> None:
    pool = await asyncpg.create_pool(POSTGRES_URL, min_size=2, max_size=8)

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
    log.info("Ingestion service ready — consuming %s", SOURCE_TOPIC)

    try:
        async for msg in consumer:
            try:
                raw = json.loads(msg.value)
                event = TelemetryEvent.model_validate(raw)

                payload = event.model_dump_json().encode()
                await producer.send_and_wait(VALID_TOPIC, key=msg.key, value=payload)

                # Persist to telemetry_history
                await pool.execute(
                    """
                    INSERT INTO telemetry_history
                        (machine_id, site_id, timestamp, temperature_c, pressure_psi, vibration_mm_s, status, is_anomaly)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, false)
                    """,
                    event.machine_id,
                    event.site_id,
                    datetime.fromisoformat(event.timestamp),
                    event.temperature_c,
                    event.pressure_psi,
                    event.vibration_mm_s,
                    event.status,
                )

            except (ValidationError, json.JSONDecodeError, ValueError) as exc:
                log.warning("Validation failure — routing to DLQ: %s", exc)
                dlq_payload = json.dumps({
                    "original": msg.value.decode(errors="replace"),
                    "error": str(exc),
                    "dlq_at": datetime.now(timezone.utc).isoformat(),
                }).encode()
                await producer.send_and_wait(DLQ_TOPIC, key=msg.key, value=dlq_payload)

            except Exception as exc:
                log.exception("Unexpected processing error", exc_info=exc)

    finally:
        await consumer.stop()
        await producer.stop()
        await pool.close()

if __name__ == "__main__":
    asyncio.run(main())
