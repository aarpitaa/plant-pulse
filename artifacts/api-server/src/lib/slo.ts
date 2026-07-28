/**
 * SLO calculation helpers.
 * Computes current compliance against the defined service-level objectives.
 */
import { getApiMetrics, getSimulatorMemoryState } from "./simulator";

export interface SloIndicator {
  name: string;
  description: string;
  target: number;
  actual: number;
  compliant: boolean;
  errorBudgetUsed: number;
}

export interface SloStatusResult {
  indicators: SloIndicator[];
  overallCompliance: number;
  errorBudgetRemaining: number;
  burnRate: number;
  allowedDowntimeMinutes: number;
  usedDowntimeMinutes: number;
  calculatedAt: string;
}

// Monthly error budget constants
const MONTHLY_MINUTES = 30 * 24 * 60;
const API_AVAILABILITY_TARGET = 0.999;       // 99.9%
const API_LATENCY_P95_TARGET_MS = 300;       // 300 ms
const VALID_EVENTS_RATE_TARGET = 0.9995;     // 99.95%
const PROCESSING_LAG_TARGET_S = 10;          // ≤10 s
const INCIDENT_DETECTION_TARGET_S = 30;      // ≤30 s

export function computeSloStatus(): SloStatusResult {
  const api = getApiMetrics();
  const sim = getSimulatorMemoryState();

  // ── API Availability ────────────────────────────────────────────────────────
  const apiAvailability = api.availability;
  const availBudgetUsed = Math.max(0, 1 - apiAvailability) / (1 - API_AVAILABILITY_TARGET);

  // ── P95 API Latency ─────────────────────────────────────────────────────────
  const p95Ms = api.p95LatencyMs;
  // Map latency compliance: 0ms = 100% compliant, 300ms = target, >600ms = 0% compliant
  const latencyCompliance = Math.max(0, 1 - Math.max(0, p95Ms - API_LATENCY_P95_TARGET_MS) / API_LATENCY_P95_TARGET_MS);
  const latencyBudgetUsed = 1 - latencyCompliance;

  // ── Valid Event Processing Rate ─────────────────────────────────────────────
  const validRate =
    sim.totalGenerated > 0
      ? sim.totalProcessed / (sim.totalGenerated - sim.totalDlq > 0 ? sim.totalGenerated : 1)
      : 1;
  const validBudgetUsed = Math.max(0, 1 - validRate) / (1 - VALID_EVENTS_RATE_TARGET);

  // ── Processing Lag ──────────────────────────────────────────────────────────
  const lagSeconds = sim.kafkaLag > 0 ? Math.min(sim.kafkaLag / 1000, 60) : 0.5;
  const lagCompliance = Math.max(0, 1 - lagSeconds / PROCESSING_LAG_TARGET_S);
  const lagBudgetUsed = 1 - lagCompliance;

  // ── Incident Detection ──────────────────────────────────────────────────────
  // Simulated: we always detect within 30s because the controller tick runs every second
  const detectionS = 8; // ~ 8 second detection time in simulation
  const detectionCompliance = detectionS <= INCIDENT_DETECTION_TARGET_S ? 1 : 0;
  const detectionBudgetUsed = 1 - detectionCompliance;

  const indicators: SloIndicator[] = [
    {
      name: "API Availability",
      description: "Percentage of API requests that succeed",
      target: API_AVAILABILITY_TARGET * 100,
      actual: Math.round(apiAvailability * 10000) / 100,
      compliant: apiAvailability >= API_AVAILABILITY_TARGET,
      errorBudgetUsed: Math.min(100, availBudgetUsed * 100),
    },
    {
      name: "P95 API Latency",
      description: "95th-percentile API response time under 300ms",
      target: API_LATENCY_P95_TARGET_MS,
      actual: p95Ms,
      compliant: p95Ms <= API_LATENCY_P95_TARGET_MS,
      errorBudgetUsed: Math.min(100, latencyBudgetUsed * 100),
    },
    {
      name: "Valid Events Processed",
      description: "Percentage of valid events successfully processed",
      target: VALID_EVENTS_RATE_TARGET * 100,
      actual: Math.round(validRate * 10000) / 100,
      compliant: validRate >= VALID_EVENTS_RATE_TARGET,
      errorBudgetUsed: Math.min(100, validBudgetUsed * 100),
    },
    {
      name: "Processing Lag",
      description: "End-to-end telemetry processing delay under 10 seconds",
      target: PROCESSING_LAG_TARGET_S,
      actual: Math.round(lagSeconds * 10) / 10,
      compliant: lagSeconds <= PROCESSING_LAG_TARGET_S,
      errorBudgetUsed: Math.min(100, lagBudgetUsed * 100),
    },
    {
      name: "Incident Detection",
      description: "Critical incidents detected within 30 seconds",
      target: INCIDENT_DETECTION_TARGET_S,
      actual: detectionS,
      compliant: detectionCompliance === 1,
      errorBudgetUsed: Math.min(100, detectionBudgetUsed * 100),
    },
  ];

  const compliantCount = indicators.filter((i) => i.compliant).length;
  const overallCompliance = (compliantCount / indicators.length) * 100;
  const avgBudgetUsed = indicators.reduce((s, i) => s + i.errorBudgetUsed, 0) / indicators.length;
  const errorBudgetRemaining = Math.max(0, 100 - avgBudgetUsed);

  // Burn rate: how fast we're consuming the monthly budget (1.0 = normal rate)
  const burnRate = avgBudgetUsed / 100 / (1 / (30 * 24)); // simplified daily burn
  const allowedDowntimeMinutes = MONTHLY_MINUTES * (1 - API_AVAILABILITY_TARGET);
  const usedDowntimeMinutes = api.total > 0
    ? allowedDowntimeMinutes * Math.min(1, availBudgetUsed)
    : 0;

  return {
    indicators,
    overallCompliance: Math.round(overallCompliance * 10) / 10,
    errorBudgetRemaining: Math.round(errorBudgetRemaining * 10) / 10,
    burnRate: Math.round(burnRate * 100) / 100,
    allowedDowntimeMinutes: Math.round(allowedDowntimeMinutes * 10) / 10,
    usedDowntimeMinutes: Math.round(usedDowntimeMinutes * 10) / 10,
    calculatedAt: new Date().toISOString(),
  };
}
