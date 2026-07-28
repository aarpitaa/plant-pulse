import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, machinesTable, sitesTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/sites", async (_req, res): Promise<void> => {
  const sites = await db.select().from(sitesTable).orderBy(sitesTable.name);

  const result = await Promise.all(
    sites.map(async (site) => {
      const [counts] = await db
        .select({
          total: sql<number>`count(*)::int`,
          critical: sql<number>`count(*) filter (where severity = 'critical')::int`,
          warning: sql<number>`count(*) filter (where severity = 'warning')::int`,
          normal: sql<number>`count(*) filter (where severity = 'normal')::int`,
        })
        .from(machinesTable)
        .where(eq(machinesTable.siteId, site.siteId));

      return {
        id: site.id,
        siteId: site.siteId,
        name: site.name,
        location: site.location,
        totalMachines: counts?.total ?? 0,
        criticalCount: counts?.critical ?? 0,
        warningCount: counts?.warning ?? 0,
        normalCount: counts?.normal ?? 0,
        createdAt: site.createdAt.toISOString(),
      };
    })
  );

  res.json(result);
});

router.get("/sites/:siteId", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.siteId) ? req.params.siteId[0] : req.params.siteId;

  const [site] = await db
    .select()
    .from(sitesTable)
    .where(eq(sitesTable.siteId, rawId))
    .limit(1);

  if (!site) {
    res.status(404).json({ error: "Site not found" });
    return;
  }

  const machines = await db
    .select()
    .from(machinesTable)
    .where(eq(machinesTable.siteId, rawId))
    .orderBy(machinesTable.name);

  res.json({
    id: site.id,
    siteId: site.siteId,
    name: site.name,
    location: site.location,
    createdAt: site.createdAt.toISOString(),
    machines: machines.map((m) => ({
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
    })),
  });
});

export default router;
