"""
PlantPulse Incident API Service
=================================
FastAPI microservice that exposes the incidents resource for external
integration (ITSM, PagerDuty escalation, mobile apps). In the Replit demo this
is handled by the Express server; this file represents the production service.

Run:
    uvicorn main:app --host 0.0.0.0 --port 8001 --reload

Environment variables:
    POSTGRES_URL
    JWT_SECRET     For Bearer token auth (production only)
    LOG_LEVEL
"""
from __future__ import annotations

import logging
import os
from datetime import datetime
from typing import Literal, Optional

import asyncpg
from fastapi import FastAPI, HTTPException, Query, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

log = logging.getLogger("incident-api")
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))

POSTGRES_URL = os.getenv("POSTGRES_URL", "postgresql://localhost/plantpulse")

app = FastAPI(title="PlantPulse Incident API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

_pool: asyncpg.Pool | None = None

# ─── Startup / Shutdown ────────────────────────────────────────────────────────

@app.on_event("startup")
async def startup() -> None:
    global _pool
    _pool = await asyncpg.create_pool(POSTGRES_URL, min_size=2, max_size=10)

@app.on_event("shutdown")
async def shutdown() -> None:
    if _pool:
        await _pool.close()

def get_pool() -> asyncpg.Pool:
    assert _pool is not None
    return _pool

# ─── Models ───────────────────────────────────────────────────────────────────

class Incident(BaseModel):
    id: int
    machine_id: str
    site_id: str
    severity: str
    status: str
    title: str
    description: Optional[str]
    detected_at: datetime
    acknowledged_at: Optional[datetime]
    resolved_at: Optional[datetime]

class CreateIncident(BaseModel):
    machine_id: str
    site_id: str
    severity: Literal["warning", "critical"]
    title: str
    description: Optional[str] = None

class UpdateIncident(BaseModel):
    status: Optional[Literal["open", "acknowledged", "resolved"]] = None
    description: Optional[str] = None

# ─── Routes ───────────────────────────────────────────────────────────────────

@app.get("/incidents", response_model=list[Incident])
async def list_incidents(
    site_id: Optional[str] = Query(None),
    machine_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    pool: asyncpg.Pool = Depends(get_pool),
):
    conditions = ["1=1"]
    params: list = []
    i = 1
    if site_id:
        conditions.append(f"site_id = ${i}"); params.append(site_id); i += 1
    if machine_id:
        conditions.append(f"machine_id = ${i}"); params.append(machine_id); i += 1
    if status:
        conditions.append(f"status = ${i}"); params.append(status); i += 1

    where = " AND ".join(conditions)
    rows = await pool.fetch(
        f"SELECT * FROM incidents WHERE {where} ORDER BY detected_at DESC LIMIT ${i} OFFSET ${i+1}",
        *params, limit, offset
    )
    return [Incident(**dict(r)) for r in rows]

@app.post("/incidents", response_model=Incident, status_code=201)
async def create_incident(body: CreateIncident, pool: asyncpg.Pool = Depends(get_pool)):
    row = await pool.fetchrow(
        """INSERT INTO incidents (machine_id, site_id, severity, title, description, status, detected_at)
           VALUES ($1, $2, $3, $4, $5, 'open', NOW()) RETURNING *""",
        body.machine_id, body.site_id, body.severity, body.title, body.description,
    )
    return Incident(**dict(row))

@app.get("/incidents/{incident_id}", response_model=Incident)
async def get_incident(incident_id: int, pool: asyncpg.Pool = Depends(get_pool)):
    row = await pool.fetchrow("SELECT * FROM incidents WHERE id = $1", incident_id)
    if not row:
        raise HTTPException(status_code=404, detail="Incident not found")
    return Incident(**dict(row))

@app.patch("/incidents/{incident_id}", response_model=Incident)
async def update_incident(incident_id: int, body: UpdateIncident, pool: asyncpg.Pool = Depends(get_pool)):
    updates = {}
    if body.status:
        updates["status"] = body.status
        if body.status == "acknowledged":
            updates["acknowledged_at"] = datetime.utcnow()
        if body.status == "resolved":
            updates["resolved_at"] = datetime.utcnow()
    if body.description is not None:
        updates["description"] = body.description

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    set_clause = ", ".join(f"{k} = ${i+2}" for i, k in enumerate(updates.keys()))
    vals = list(updates.values())
    row = await pool.fetchrow(
        f"UPDATE incidents SET {set_clause} WHERE id = $1 RETURNING *",
        incident_id, *vals
    )
    if not row:
        raise HTTPException(status_code=404, detail="Incident not found")
    return Incident(**dict(row))

@app.get("/healthz")
async def health():
    return {"status": "ok"}
