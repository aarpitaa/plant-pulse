"""
PlantPulse Equipment Simulator Service
=====================================
Production Python microservice that generates synthetic telemetry events for
all machines across all plant sites and publishes them to the Kafka topic
``telemetry.raw``.

In the Replit demo environment this logic runs inside the Express server
(src/lib/simulator.ts). This file represents how the production service
would be implemented.

Usage:
    python main.py

Environment variables:
    KAFKA_BOOTSTRAP_SERVERS   Kafka broker(s), default: localhost:9092
    POSTGRES_URL              Database connection string
    EVENTS_PER_SECOND         Target event rate, default: 10
    ANOMALY_MODE              none | temperature-spike | vibration-drift |
                              malformed | offline | mixed
    LOG_LEVEL                 DEBUG | INFO | WARNING | ERROR
"""
from __future__ import annotations

import asyncio
import json
import logging
import math
import os
import random
import time
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from typing import Literal

import asyncpg
from aiokafka import AIOKafkaProducer

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)
log = logging.getLogger("equipment-simulator")

AnomalyMode = Literal["none", "temperature-spike", "vibration-drift", "malformed", "offline", "mixed"]

# ─── Configuration ────────────────────────────────────────────────────────────

KAFKA_BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
POSTGRES_URL = os.getenv("POSTGRES_URL", "postgresql://localhost/plantpulse")
EVENTS_PER_SECOND: int = int(os.getenv("EVENTS_PER_SECOND", "10"))
ANOMALY_MODE: AnomalyMode = os.getenv("ANOMALY_MODE", "none")  # type: ignore
TOPIC = "telemetry.raw"
TICK_INTERVAL = 1.0  # seconds

# ─── Data model ───────────────────────────────────────────────────────────────

@dataclass
class TelemetryEvent:
    machine_id: str
    site_id: str
    timestamp: str
    temperature_c: float
    pressure_psi: float
    vibration_mm_s: float
    status: str
    schema_version: str = "1.0"

# ─── Telemetry generation ─────────────────────────────────────────────────────

def _hash(s: str) -> int:
    return sum(ord(c) for c in s)

def base_reading(machine_id: str, site_id: str) -> TelemetryEvent:
    h = _hash(machine_id)
    jitter = lambda scale: (random.random() - 0.5) * scale
    return TelemetryEvent(
        machine_id=machine_id,
        site_id=site_id,
        timestamp=datetime.now(timezone.utc).isoformat(),
        temperature_c=55 + (h % 20) + jitter(4),
        pressure_psi=100 + (h % 30) + jitter(6),
        vibration_mm_s=1.5 + (h % 3) + jitter(0.5),
        status="running",
    )

def apply_anomaly(
    event: TelemetryEvent, mode: AnomalyMode, machine_index: int
) -> tuple[TelemetryEvent, bool]:
    """Apply anomaly injection. Returns (modified_event, is_anomaly)."""
    modes = ["temperature-spike", "vibration-drift", "malformed", "offline"]
    effective = modes[machine_index % 4] if mode == "mixed" else mode

    if effective == "temperature-spike":
        event.temperature_c = 88 + random.random() * 10
        return event, True
    if effective == "vibration-drift":
        event.vibration_mm_s = 5.5 + random.random() * 4
        return event, True
    if effective == "malformed" and machine_index % 5 == 0:
        event.temperature_c = float("nan")
        event.vibration_mm_s = -999.0
        return event, True
    if effective == "offline":
        event.status = "offline"
        return event, True
    return event, False

# ─── Main loop ────────────────────────────────────────────────────────────────

async def load_machines(pool: asyncpg.Pool) -> list[dict]:
    rows = await pool.fetch("SELECT machine_id, site_id FROM machines ORDER BY machine_id")
    return [dict(r) for r in rows]

async def run(producer: AIOKafkaProducer, pool: asyncpg.Pool) -> None:
    machines = await load_machines(pool)
    if not machines:
        log.warning("No machines found in database — will retry in 10s")
        await asyncio.sleep(10)
        return

    batch_size = min(EVENTS_PER_SECOND, len(machines))
    selected = machines[:batch_size]
    tick_start = time.monotonic()

    for i, m in enumerate(selected):
        event = base_reading(m["machine_id"], m["site_id"])
        event, _ = apply_anomaly(event, ANOMALY_MODE, i)  # type: ignore

        payload = asdict(event)
        # Replace NaN with None for JSON serialisation
        for k, v in payload.items():
            if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
                payload[k] = None

        await producer.send_and_wait(
            TOPIC,
            key=m["machine_id"].encode(),
            value=json.dumps(payload).encode(),
        )

    elapsed = time.monotonic() - tick_start
    sleep_for = max(0.0, TICK_INTERVAL - elapsed)
    await asyncio.sleep(sleep_for)

async def main() -> None:
    log.info("Starting equipment simulator", extra={"events_per_second": EVENTS_PER_SECOND, "anomaly_mode": ANOMALY_MODE})
    pool = await asyncpg.create_pool(POSTGRES_URL, min_size=2, max_size=5)
    producer = AIOKafkaProducer(bootstrap_servers=KAFKA_BOOTSTRAP)
    await producer.start()
    try:
        while True:
            try:
                await run(producer, pool)
            except Exception as exc:
                log.exception("Tick error, continuing", exc_info=exc)
                await asyncio.sleep(1)
    finally:
        await producer.stop()
        await pool.close()

if __name__ == "__main__":
    asyncio.run(main())
