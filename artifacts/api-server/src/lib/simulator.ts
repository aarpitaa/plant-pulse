/**
 * PlantPulse Equipment Simulator + Health Processor + Reliability Controller
 *
 * Runs as a background loop inside the Express server, simulating the full
 * Kafka pipeline: generate → validate → compute health → detect incidents →
 * automated remediation. In production these would be separate Python services.
 */
import { and, desc, eq, lt, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  eventQueueTable,
  incidentsTable,
  machinesTable,
  remediationActionsTable,
  simulatorStateTable,
  telemetryHistoryTable,
} from "@workspace/db";
import { logger } from "./logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TelemetryEvent {
  machine_id: string;
  site_id: string;
  timestamp: string;
  temperature_c: number;
  pressure_psi: number;
  vibration_mm_s: number;
  status: string;
}

export type AnomalyMode =
  | "none"
  | "temperature-spike"
  | "vibration-drift"
  | "malformed"
  | "offline"
  | "mixed";

export type Severity = "normal" | "warning" | "critical";

// ─── In-memory state ──────────────────────────────────────────────────────────

let simulatorInterval: ReturnType<typeof setInterval> | null = null;
let controllerInterval: ReturnType<typeof setInterval> | null = null;
let eventsPerSecond = 10;
let anomalyMode: AnomalyMode = "none";
let dlqEnabled = true;

// Lightweight counters (synced to DB periodically)
let totalGenerated = 0;
let totalProcessed = 0;
let totalDlq = 0;

// Rolling window for metrics
const recentProcessingTimes: number[] = [];
let lastKafkaLag = 0;
let workerReplicas = 2;

// API metrics for SLO tracking
let apiRequestsTotal = 0;
let apiRequestsSuccess = 0;
let apiLatencies: number[] = []; // last 1000

export function recordApiRequest(success: boolean, latencyMs: number) {
  apiRequestsTotal++;
  if (success) apiRequestsSuccess++;
  apiLatencies.push(latencyMs);
  if (apiLatencies.length > 1000) apiLatencies.shift();
}

// ─── Telemetry generation ─────────────────────────────────────────────────────

function baseReading(machineId: string, siteId: string): TelemetryEvent {
  const hash = Array.from(machineId).reduce((a, c) => a + c.charCodeAt(0), 0);
  return {
    machine_id: machineId,
    site_id: siteId,
    timestamp: new Date().toISOString(),
    temperature_c: 55 + (hash % 20) + (Math.random() - 0.5) * 4,
    pressure_psi: 100 + (hash % 30) + (Math.random() - 0.5) * 6,
    vibration_mm_s: 1.5 + (hash % 3) + (Math.random() - 0.5) * 0.5,
    status: "running",
  };
}

function applyAnomaly(
  event: TelemetryEvent,
  mode: AnomalyMode,
  machineIndex: number
): { event: TelemetryEvent; isAnomaly: boolean; sendToDlq: boolean } {
  const eff =
    mode === "mixed"
      ? (["temperature-spike", "vibration-drift", "malformed", "offline"] as const)[
          machineIndex % 4
        ]
      : mode;

  switch (eff) {
    case "temperature-spike":
      return {
        event: { ...event, temperature_c: 88 + Math.random() * 10 },
        isAnomaly: true,
        sendToDlq: false,
      };
    case "vibration-drift":
      return {
        event: { ...event, vibration_mm_s: 5.5 + Math.random() * 4 },
        isAnomaly: true,
        sendToDlq: false,
      };
    case "malformed":
      if (dlqEnabled && machineIndex % 5 === 0) {
        // Return a bad event that fails validation
        return {
          event: { ...event, temperature_c: NaN, vibration_mm_s: -999 },
          isAnomaly: true,
          sendToDlq: true,
        };
      }
      return { event, isAnomaly: false, sendToDlq: false };
    case "offline":
      return {
        event: { ...event, status: "offline" },
        isAnomaly: true,
        sendToDlq: false,
      };
    default:
      return { event, isAnomaly: false, sendToDlq: false };
  }
}

// ─── Health computation ───────────────────────────────────────────────────────

export function computeSeverity(temp: number, vib: number): Severity {
  if (temp > 90 && vib > 7) return "critical";
  if (temp > 80 || vib > 5) return "warning";
  return "normal";
}

// ─── Simulator tick ───────────────────────────────────────────────────────────

async function runTick() {
  try {
    const machines = await db
      .select({ machineId: machinesTable.machineId, siteId: machinesTable.siteId })
      .from(machinesTable);

    if (machines.length === 0) return;

    const batchSize = Math.max(1, Math.min(eventsPerSecond, machines.length));
    const selectedMachines = machines.slice(0, batchSize);

    const telemetryRows: typeof telemetryHistoryTable.$inferInsert[] = [];
    const machineUpdates: { machineId: string; severity: Severity; temp: number; psi: number; vib: number; status: string }[] = [];

    let tickGenerated = 0;
    let tickProcessed = 0;
    let tickDlq = 0;

    for (let i = 0; i < selectedMachines.length; i++) {
      const { machineId, siteId } = selectedMachines[i];
      const base = baseReading(machineId, siteId);
      const { event, isAnomaly, sendToDlq } = applyAnomaly(base, anomalyMode, i);
      tickGenerated++;

      if (sendToDlq) {
        tickDlq++;
        continue; // skip processing malformed events
      }

      // Validate
      if (
        !isFinite(event.temperature_c) ||
        !isFinite(event.vibration_mm_s) ||
        event.temperature_c < -50 ||
        event.temperature_c > 300
      ) {
        tickDlq++;
        continue;
      }

      const startMs = Date.now();
      const severity = computeSeverity(event.temperature_c, event.vibration_mm_s);
      recentProcessingTimes.push(Date.now() - startMs);
      if (recentProcessingTimes.length > 500) recentProcessingTimes.shift();

      telemetryRows.push({
        machineId: event.machine_id,
        siteId: event.site_id,
        timestamp: new Date(event.timestamp),
        temperatureC: event.temperature_c,
        pressurePsi: event.pressure_psi,
        vibrationMmS: event.vibration_mm_s,
        status: event.status,
        isAnomaly,
      });

      machineUpdates.push({
        machineId: event.machine_id,
        severity,
        temp: event.temperature_c,
        psi: event.pressure_psi,
        vib: event.vibration_mm_s,
        status: event.status,
      });

      tickProcessed++;
    }

    // Batch-insert telemetry
    if (telemetryRows.length > 0) {
      await db.insert(telemetryHistoryTable).values(telemetryRows);
    }

    // Batch-update machine health
    for (const upd of machineUpdates) {
      await db
        .update(machinesTable)
        .set({
          severity: upd.severity,
          temperatureC: upd.temp,
          pressurePsi: upd.psi,
          vibrationMmS: upd.vib,
          status: upd.status,
          lastReadingAt: new Date(),
        })
        .where(eq(machinesTable.machineId, upd.machineId));

      // Incident detection: if severity is critical, check for open incident
      if (upd.severity === "critical") {
        await maybeOpenIncident(upd.machineId, machines.find((m) => m.machineId === upd.machineId)?.siteId ?? "", upd.temp, upd.vib);
      } else if (upd.severity === "normal") {
        await maybeResolveIncident(upd.machineId);
      }
    }

    totalGenerated += tickGenerated;
    totalProcessed += tickProcessed;
    totalDlq += tickDlq;

    // Update consumer lag metric (queued - processed)
    lastKafkaLag = Math.max(0, lastKafkaLag + tickGenerated - tickProcessed * 1.05);

    // Prune old telemetry (keep last 2 hours)
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await db
      .delete(telemetryHistoryTable)
      .where(lt(telemetryHistoryTable.timestamp, twoHoursAgo));
  } catch (err) {
    logger.error({ err }, "Simulator tick error");
  }
}

// ─── Incident management ──────────────────────────────────────────────────────

const recentlyOpenedIncidents = new Map<string, number>(); // machineId → last opened timestamp

async function maybeOpenIncident(machineId: string, siteId: string, temp: number, vib: number) {
  const lastOpened = recentlyOpenedIncidents.get(machineId) ?? 0;
  if (Date.now() - lastOpened < 5 * 60 * 1000) return; // don't re-open within 5 min

  const [existing] = await db
    .select({ id: incidentsTable.id })
    .from(incidentsTable)
    .where(
      and(
        eq(incidentsTable.machineId, machineId),
        eq(incidentsTable.status, "open")
      )
    )
    .limit(1);

  if (!existing) {
    await db.insert(incidentsTable).values({
      machineId,
      siteId,
      severity: "critical",
      status: "open",
      title: `Critical condition on ${machineId}`,
      description: `Temperature ${temp.toFixed(1)}°C, Vibration ${vib.toFixed(1)} mm/s`,
      detectedAt: new Date(),
    });
    recentlyOpenedIncidents.set(machineId, Date.now());
    logger.info({ machineId }, "Incident opened");
  }
}

async function maybeResolveIncident(machineId: string) {
  await db
    .update(incidentsTable)
    .set({ status: "resolved", resolvedAt: new Date() })
    .where(
      and(
        eq(incidentsTable.machineId, machineId),
        eq(incidentsTable.status, "open")
      )
    );
}

// ─── Reliability controller ───────────────────────────────────────────────────

let controllerAttempts = 0;
const MAX_CONTROLLER_ATTEMPTS = 5;

async function runControllerChecks() {
  try {
    if (controllerAttempts >= MAX_CONTROLLER_ATTEMPTS) {
      logger.warn("Reliability controller: max attempts reached, disabled");
      return;
    }

    // Check 1: High consumer lag → scale workers
    if (lastKafkaLag > 50000) {
      workerReplicas = Math.min(workerReplicas + 1, 8);
      await logRemediation(
        `kafka_consumer_lag=${lastKafkaLag}`,
        "scale-workers",
        "success",
        JSON.stringify({ targetReplicas: workerReplicas, lagTrigger: lastKafkaLag })
      );
      controllerAttempts++;
    }

    // Check 2: DLQ growth rate too high → quarantine events
    if (totalDlq > 0 && totalGenerated > 0 && totalDlq / totalGenerated > 0.1) {
      await logRemediation(
        `dlq_rate=${((totalDlq / totalGenerated) * 100).toFixed(1)}%`,
        "quarantine-events",
        "success",
        JSON.stringify({ dlqTotal: totalDlq, totalGenerated })
      );
      controllerAttempts++;
    }

    // Check 3: Too many open critical incidents → open aggregate incident
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(incidentsTable)
      .where(and(eq(incidentsTable.status, "open"), eq(incidentsTable.severity, "critical")));

    if (count > 5) {
      await logRemediation(
        `critical_incidents=${count}`,
        "open-incident",
        "success",
        JSON.stringify({ openCriticalIncidents: count })
      );
      controllerAttempts++;
    }

    // Reset counter if system is healthy
    if (lastKafkaLag < 10000 && count < 2) {
      controllerAttempts = Math.max(0, controllerAttempts - 1);
    }
  } catch (err) {
    logger.error({ err }, "Controller check error");
  }
}

async function logRemediation(
  trigger: string,
  action: string,
  outcome: "success" | "failure" | "skipped",
  metadata?: string
) {
  await db.insert(remediationActionsTable).values({ trigger, action, outcome, metadata });
  logger.info({ trigger, action, outcome }, "Remediation action recorded");
}

// ─── Public control interface ─────────────────────────────────────────────────

export async function startSimulator() {
  if (simulatorInterval) return;

  // Sync state from DB
  const [state] = await db.select().from(simulatorStateTable).limit(1);
  if (state) {
    eventsPerSecond = state.eventsPerSecond;
    anomalyMode = state.anomalyMode as AnomalyMode;
    dlqEnabled = state.dlqEnabled;
    totalGenerated = state.totalEventsGenerated;
    totalProcessed = state.totalEventsProcessed;
    totalDlq = state.totalEventsDlq;
  }

  simulatorInterval = setInterval(runTick, 1000);
  controllerInterval = setInterval(runControllerChecks, 30_000);

  await db
    .update(simulatorStateTable)
    .set({ running: true, startedAt: new Date() })
    .where(eq(simulatorStateTable.id, 1));

  logger.info({ eventsPerSecond, anomalyMode }, "Simulator started");
}

export async function stopSimulator() {
  if (simulatorInterval) {
    clearInterval(simulatorInterval);
    simulatorInterval = null;
  }
  if (controllerInterval) {
    clearInterval(controllerInterval);
    controllerInterval = null;
  }
  await persistCounters();
  await db
    .update(simulatorStateTable)
    .set({ running: false })
    .where(eq(simulatorStateTable.id, 1));
  logger.info("Simulator stopped");
}

export async function updateSimulatorConfig(config: {
  eventsPerSecond?: number;
  anomalyMode?: AnomalyMode;
  dlqEnabled?: boolean;
}) {
  if (config.eventsPerSecond !== undefined) eventsPerSecond = config.eventsPerSecond;
  if (config.anomalyMode !== undefined) anomalyMode = config.anomalyMode;
  if (config.dlqEnabled !== undefined) dlqEnabled = config.dlqEnabled;

  await db
    .update(simulatorStateTable)
    .set({
      eventsPerSecond,
      anomalyMode,
      dlqEnabled,
    })
    .where(eq(simulatorStateTable.id, 1));
}

export async function persistCounters() {
  await db
    .update(simulatorStateTable)
    .set({
      totalEventsGenerated: totalGenerated,
      totalEventsProcessed: totalProcessed,
      totalEventsDlq: totalDlq,
    })
    .where(eq(simulatorStateTable.id, 1));
}

export function getSimulatorMemoryState() {
  return {
    running: simulatorInterval !== null,
    eventsPerSecond,
    anomalyMode,
    dlqEnabled,
    totalGenerated,
    totalProcessed,
    totalDlq,
    kafkaLag: lastKafkaLag,
    workerReplicas,
  };
}

export function getKafkaMetricsLive() {
  return {
    eventsPerSecond: totalProcessed > 0 ? eventsPerSecond : 0,
    totalConsumerLag: Math.floor(lastKafkaLag),
    dlqSize: totalDlq,
    dlqGrowthRate: totalGenerated > 0 ? (totalDlq / totalGenerated) * 60 : 0,
    brokerHealthy: lastKafkaLag < 100000,
  };
}

export function getP95Latency(): number {
  if (recentProcessingTimes.length === 0) return 0;
  const sorted = [...recentProcessingTimes].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * 0.95);
  return sorted[idx] ?? sorted[sorted.length - 1];
}

export function getApiMetrics() {
  return {
    total: apiRequestsTotal,
    success: apiRequestsSuccess,
    availability: apiRequestsTotal > 0 ? apiRequestsSuccess / apiRequestsTotal : 1,
    p95LatencyMs: getP95Latency(),
    latencies: apiLatencies,
  };
}

// ─── Experiment injection ─────────────────────────────────────────────────────

export async function runExperiment(
  experiment: "pod-failure" | "kafka-backlog" | "malformed-events" | "database-latency" | "failed-deployment"
): Promise<string> {
  switch (experiment) {
    case "pod-failure":
      // Simulate by temporarily making all machines go offline
      await db.update(machinesTable).set({ status: "offline", severity: "critical" });
      await logRemediation("experiment:pod-failure", "open-incident", "success", JSON.stringify({ experiment }));
      setTimeout(async () => {
        await db.update(machinesTable).set({ status: "running" });
      }, 15_000);
      return "Pod failure injected: all machines offline for 15s, auto-recovery triggered";

    case "kafka-backlog":
      lastKafkaLag += 75000;
      await logRemediation("experiment:kafka-backlog", "scale-workers", "success", JSON.stringify({ lagInjected: 75000, newWorkers: ++workerReplicas }));
      return `Kafka backlog injected: consumer lag +75k, workers scaled to ${workerReplicas}`;

    case "malformed-events":
      anomalyMode = "malformed";
      await updateSimulatorConfig({ anomalyMode: "malformed" });
      setTimeout(() => updateSimulatorConfig({ anomalyMode: "none" }), 30_000);
      return "Malformed event injection started for 30s, DLQ will grow";

    case "database-latency":
      await logRemediation("experiment:database-latency", "open-incident", "success", JSON.stringify({ experiment, latencySimulated: "500ms" }));
      return "Database latency experiment recorded (Prometheus would detect P95 spike)";

    case "failed-deployment":
      await logRemediation("experiment:failed-deployment", "rollback-deployment", "success", JSON.stringify({ experiment, rollbackTarget: "v1.2.3" }));
      await db.insert(incidentsTable).values({
        machineId: "deployment-controller",
        siteId: "platform",
        severity: "critical",
        status: "open",
        title: "Deployment health check failure — rollback triggered",
        description: "Readiness probe failed 3 consecutive checks. Pipeline rolled back to last stable image.",
        detectedAt: new Date(),
      });
      return "Failed deployment experiment: incident created, rollback action logged";

    default:
      return "Unknown experiment";
  }
}
