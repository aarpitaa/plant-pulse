import { Router, type IRouter } from "express";
import { getKafkaMetricsLive, getSimulatorMemoryState } from "../lib/simulator";

const router: IRouter = Router();

router.get("/kafka/metrics", async (_req, res): Promise<void> => {
  const live = getKafkaMetricsLive();
  const sim = getSimulatorMemoryState();
  const eps = sim.running ? sim.eventsPerSecond : 0;

  const topics = [
    {
      topic: "telemetry.raw",
      messagesIn: live.eventsPerSecond,
      messagesOut: Math.floor(live.eventsPerSecond * 0.97),
      consumerLag: Math.floor(live.totalConsumerLag * 0.6),
      partitions: 6,
    },
    {
      topic: "telemetry.valid",
      messagesIn: Math.floor(live.eventsPerSecond * 0.97),
      messagesOut: Math.floor(live.eventsPerSecond * 0.97),
      consumerLag: Math.floor(live.totalConsumerLag * 0.3),
      partitions: 6,
    },
    {
      topic: "telemetry.dlq",
      messagesIn: Math.floor(eps * (sim.anomalyMode === "malformed" ? 0.2 : 0.02)),
      messagesOut: 0,
      consumerLag: live.dlqSize,
      partitions: 2,
    },
    {
      topic: "incidents.detected",
      messagesIn: 0,
      messagesOut: 0,
      consumerLag: Math.floor(live.totalConsumerLag * 0.1),
      partitions: 2,
    },
  ];

  res.json({
    topics,
    totalEventsPerSecond: live.eventsPerSecond,
    totalConsumerLag: live.totalConsumerLag,
    dlqSize: live.dlqSize,
    dlqGrowthRate: live.dlqGrowthRate,
    brokerHealthy: live.brokerHealthy,
    updatedAt: new Date().toISOString(),
  });
});

export default router;
