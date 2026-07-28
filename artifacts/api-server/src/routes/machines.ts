import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, incidentsTable, machinesTable, telemetryHistoryTable } from "@workspace/db";
import { ListMachinesQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/machines", async (req, res): Promise<void> => {
  const parsed = ListMachinesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { siteId, severity, limit = 50, offset = 0 } = parsed.data;

  const conditions = [];
  if (siteId) conditions.push(eq(machinesTable.siteId, siteId));
  if (severity) conditions.push(eq(machinesTable.severity, severity));

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(machinesTable)
    .where(conditions.length ? and(...conditions) : undefined);

  const machines = await db
    .select()
    .from(machinesTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(machinesTable.severity, machinesTable.machineId)
    .limit(limit)
    .offset(offset);

  res.json({
    machines: machines.map(toMachineHealth),
    total: total ?? 0,
  });
});

router.get("/machines/:machineId", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.machineId)
    ? req.params.machineId[0]
    : req.params.machineId;

  const [machine] = await db
    .select()
    .from(machinesTable)
    .where(eq(machinesTable.machineId, rawId))
    .limit(1);

  if (!machine) {
    res.status(404).json({ error: "Machine not found" });
    return;
  }

  const recentTelemetry = await db
    .select()
    .from(telemetryHistoryTable)
    .where(eq(telemetryHistoryTable.machineId, rawId))
    .orderBy(desc(telemetryHistoryTable.timestamp))
    .limit(60);

  const activeIncidents = await db
    .select()
    .from(incidentsTable)
    .where(
      and(
        eq(incidentsTable.machineId, rawId),
        eq(incidentsTable.status, "open")
      )
    )
    .orderBy(desc(incidentsTable.detectedAt))
    .limit(5);

  res.json({
    machine: toMachineHealth(machine),
    recentTelemetry: recentTelemetry.map((t) => ({
      id: t.id,
      machineId: t.machineId,
      siteId: t.siteId,
      timestamp: t.timestamp.toISOString(),
      temperatureC: t.temperatureC,
      pressurePsi: t.pressurePsi,
      vibrationMmS: t.vibrationMmS,
      status: t.status,
      isAnomaly: t.isAnomaly,
    })),
    activeIncidents: activeIncidents.map(toIncident),
  });
});

router.get("/telemetry", async (req, res): Promise<void> => {
  const machineId = Array.isArray(req.query.machineId)
    ? req.query.machineId[0]
    : req.query.machineId;
  const limitRaw = Number(req.query.limit ?? 100);
  const limit = isNaN(limitRaw) ? 100 : Math.min(limitRaw, 500);
  const since = req.query.since ? new Date(req.query.since as string) : undefined;

  if (!machineId || typeof machineId !== "string") {
    res.status(400).json({ error: "machineId query param required" });
    return;
  }

  let query = db
    .select()
    .from(telemetryHistoryTable)
    .where(eq(telemetryHistoryTable.machineId, machineId))
    .orderBy(desc(telemetryHistoryTable.timestamp))
    .limit(limit);

  const rows = await query;

  res.json(
    rows.map((t) => ({
      id: t.id,
      machineId: t.machineId,
      siteId: t.siteId,
      timestamp: t.timestamp.toISOString(),
      temperatureC: t.temperatureC,
      pressurePsi: t.pressurePsi,
      vibrationMmS: t.vibrationMmS,
      status: t.status,
      isAnomaly: t.isAnomaly,
    }))
  );
});

function toMachineHealth(m: typeof machinesTable.$inferSelect) {
  return {
    id: m.id,
    machineId: m.machineId,
    siteId: m.siteId,
    name: m.name,
    machineType: m.machineType,
    status: m.status,
    severity: m.severity,
    temperatureC: m.temperatureC,
    pressurePsi: m.pressurePsi,
    vibrationMmS: m.vibrationMmS,
    lastReadingAt: m.lastReadingAt.toISOString(),
  };
}

function toIncident(i: typeof incidentsTable.$inferSelect) {
  return {
    id: i.id,
    machineId: i.machineId,
    siteId: i.siteId,
    severity: i.severity,
    status: i.status,
    title: i.title,
    description: i.description ?? null,
    detectedAt: i.detectedAt.toISOString(),
    acknowledgedAt: i.acknowledgedAt?.toISOString() ?? null,
    resolvedAt: i.resolvedAt?.toISOString() ?? null,
    createdAt: i.createdAt.toISOString(),
    remediationCount: 0,
  };
}

export default router;
