import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, simulatorStateTable } from "@workspace/db";
import { UpdateSimulatorConfigBody, RunExperimentParams } from "@workspace/api-zod";
import {
  startSimulator,
  stopSimulator,
  updateSimulatorConfig,
  getSimulatorMemoryState,
  runExperiment,
  type AnomalyMode,
} from "../lib/simulator";

const router: IRouter = Router();

async function getFullStatus() {
  const mem = getSimulatorMemoryState();
  const [dbState] = await db.select().from(simulatorStateTable).limit(1);
  const machines = mem.running ? (dbState?.eventsPerSecond ?? 10) : 0;

  return {
    running: mem.running,
    eventsPerSecond: mem.eventsPerSecond,
    machineCount: 45, // seeded: 3 sites × 15 machines
    anomalyMode: mem.anomalyMode,
    dlqEnabled: mem.dlqEnabled,
    startedAt: dbState?.startedAt?.toISOString() ?? null,
    totalEventsGenerated: mem.totalGenerated,
    totalEventsProcessed: mem.totalProcessed,
    totalEventsDlq: mem.totalDlq,
  };
}

router.get("/simulator/status", async (_req, res): Promise<void> => {
  res.json(await getFullStatus());
});

router.post("/simulator/start", async (_req, res): Promise<void> => {
  await startSimulator();
  res.json(await getFullStatus());
});

router.post("/simulator/stop", async (_req, res): Promise<void> => {
  await stopSimulator();
  res.json(await getFullStatus());
});

router.patch("/simulator/config", async (req, res): Promise<void> => {
  const parsed = UpdateSimulatorConfigBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  await updateSimulatorConfig({
    eventsPerSecond: parsed.data.eventsPerSecond,
    anomalyMode: parsed.data.anomalyMode as AnomalyMode | undefined,
    dlqEnabled: parsed.data.dlqEnabled,
  });

  res.json(await getFullStatus());
});

router.post("/simulator/experiments/:experiment", async (req, res): Promise<void> => {
  const rawExp = Array.isArray(req.params.experiment)
    ? req.params.experiment[0]
    : req.params.experiment;
  const params = RunExperimentParams.safeParse({ experiment: rawExp });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const message = await runExperiment(
    params.data.experiment as Parameters<typeof runExperiment>[0]
  );

  res.json({ experiment: params.data.experiment, triggered: true, message });
});

export default router;
