import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, incidentsTable, remediationActionsTable } from "@workspace/db";
import {
  CreateIncidentBody,
  GetIncidentParams,
  ListIncidentsQueryParams,
  UpdateIncidentBody,
  UpdateIncidentParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/incidents", async (req, res): Promise<void> => {
  const parsed = ListIncidentsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { siteId, machineId, severity, status, limit = 50, offset = 0 } = parsed.data;

  const conditions = [];
  if (siteId) conditions.push(eq(incidentsTable.siteId, siteId));
  if (machineId) conditions.push(eq(incidentsTable.machineId, machineId));
  if (severity) conditions.push(eq(incidentsTable.severity, severity));
  if (status) conditions.push(eq(incidentsTable.status, status));

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(incidentsTable)
    .where(conditions.length ? and(...conditions) : undefined);

  const incidents = await db
    .select()
    .from(incidentsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(incidentsTable.detectedAt))
    .limit(limit)
    .offset(offset);

  // Get remediation count per incident
  const counts = await db
    .select({
      trigger: remediationActionsTable.trigger,
      count: sql<number>`count(*)::int`,
    })
    .from(remediationActionsTable)
    .groupBy(remediationActionsTable.trigger);

  res.json({
    incidents: incidents.map((i) => toIncident(i, 0)),
    total: total ?? 0,
  });
});

router.post("/incidents", async (req, res): Promise<void> => {
  const parsed = CreateIncidentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [incident] = await db
    .insert(incidentsTable)
    .values({
      machineId: parsed.data.machineId,
      siteId: parsed.data.siteId,
      severity: parsed.data.severity,
      title: parsed.data.title,
      description: parsed.data.description,
      status: "open",
      detectedAt: new Date(),
    })
    .returning();

  res.status(201).json(toIncident(incident, 0));
});

router.get("/incidents/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetIncidentParams.safeParse({ id: Number(raw) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [incident] = await db
    .select()
    .from(incidentsTable)
    .where(eq(incidentsTable.id, params.data.id))
    .limit(1);

  if (!incident) {
    res.status(404).json({ error: "Incident not found" });
    return;
  }

  res.json(toIncident(incident, 0));
});

router.patch("/incidents/:id", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = UpdateIncidentParams.safeParse({ id: Number(rawId) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = UpdateIncidentBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (body.data.status) {
    updates.status = body.data.status;
    if (body.data.status === "acknowledged") updates.acknowledgedAt = new Date();
    if (body.data.status === "resolved") updates.resolvedAt = new Date();
  }
  if (body.data.description !== undefined) updates.description = body.data.description;

  const [updated] = await db
    .update(incidentsTable)
    .set(updates)
    .where(eq(incidentsTable.id, params.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Incident not found" });
    return;
  }

  res.json(toIncident(updated, 0));
});

function toIncident(i: typeof incidentsTable.$inferSelect, remediationCount: number) {
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
    remediationCount,
  };
}

export default router;
