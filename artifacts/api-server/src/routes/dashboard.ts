import { Router, type IRouter } from "express";
import { desc, eq, sql } from "drizzle-orm";
import { db, incidentsTable, machinesTable } from "@workspace/db";
import { getSimulatorMemoryState } from "../lib/simulator";
import { computeSloStatus } from "../lib/slo";

const router: IRouter = Router();

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const [healthCounts] = await db
    .select({
      total: sql<number>`count(*)::int`,
      critical: sql<number>`count(*) filter (where severity = 'critical')::int`,
      warning: sql<number>`count(*) filter (where severity = 'warning')::int`,
      normal: sql<number>`count(*) filter (where severity = 'normal')::int`,
    })
    .from(machinesTable);

  const [incidentCounts] = await db
    .select({
      open: sql<number>`count(*) filter (where status = 'open')::int`,
      critical: sql<number>`count(*) filter (where status = 'open' and severity = 'critical')::int`,
    })
    .from(incidentsTable);

  const recentIncidents = await db
    .select()
    .from(incidentsTable)
    .where(eq(incidentsTable.status, "open"))
    .orderBy(desc(incidentsTable.detectedAt))
    .limit(5);

  const slo = computeSloStatus();
  const sim = getSimulatorMemoryState();

  res.json({
    totalMachines: healthCounts?.total ?? 0,
    criticalCount: healthCounts?.critical ?? 0,
    warningCount: healthCounts?.warning ?? 0,
    normalCount: healthCounts?.normal ?? 0,
    openIncidents: incidentCounts?.open ?? 0,
    criticalIncidents: incidentCounts?.critical ?? 0,
    sloCompliance: slo.overallCompliance,
    errorBudgetRemaining: slo.errorBudgetRemaining,
    burnRate: slo.burnRate,
    eventsPerSecond: sim.running ? sim.eventsPerSecond : 0,
    processingLagSeconds: sim.kafkaLag / 1000,
    recentIncidents: recentIncidents.map((i) => ({
      ...i,
      detectedAt: i.detectedAt.toISOString(),
      acknowledgedAt: i.acknowledgedAt?.toISOString() ?? null,
      resolvedAt: i.resolvedAt?.toISOString() ?? null,
      createdAt: i.createdAt.toISOString(),
      remediationCount: 0,
    })),
  });
});

export default router;
