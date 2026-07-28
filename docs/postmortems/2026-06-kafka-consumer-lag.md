# Post-Mortem: Kafka Consumer Lag Spike — 2026-06-28

**Duration:** 47 minutes (09:14 UTC – 10:01 UTC)  
**Severity:** P1 — SLO breached (processing lag SLO exceeded for 28 minutes)  
**Detection method:** Prometheus alert (`KafkaConsumerLagHigh`) at 09:16 UTC  
**Resolution method:** Manual (ingestion service scaled from 3 → 8 replicas)  
**Error budget consumed:** ~14.8 minutes

---

## Summary

The simulator's `eventsPerSecond` was accidentally set to 5000 by a developer testing the chaos simulator, in the production-equivalent staging environment. The ingestion service (3 replicas) could not keep up, causing consumer lag on `telemetry.raw` to grow to 247,000 messages over ~20 minutes. Machine health states became stale, incident detection latency reached 4 minutes (vs 30s SLO), and the operations dashboard showed all machines as normal while several were actually in critical state.

---

## Timeline

| Time (UTC) | Event |
|------------|-------|
| 09:11:00 | Developer sets `eventsPerSecond=5000` via Simulator Control UI |
| 09:14:00 | Consumer lag crosses 10,000 (warning threshold) |
| 09:16:30 | PagerDuty fires `KafkaConsumerLagHigh` |
| 09:18:00 | On-call SRE opens incident #1042 |
| 09:22:00 | Root cause identified (simulator config) |
| 09:23:00 | Simulator rate reduced to 100 EPS |
| 09:25:00 | Ingestion service scaled to 8 replicas |
| 09:58:00 | Consumer lag below 1,000 (recovering) |
| 10:01:00 | Lag at 0, incident resolved |

---

## Root Cause

No access control on the Simulator Control page allowed a non-SRE developer to set 5000 EPS in a staging environment that shared the same Kafka cluster as performance validation. Combined with only 3 ingestion service replicas (minimum), the lag grew uncontrolled.

---

## Contributing Factors

1. No rate cap on `eventsPerSecond` API endpoint in staging
2. Staging and performance-validation shared the same Kafka cluster
3. HPA was configured but not reacting fast enough (scale-out delay: 5 min)
4. On-call runbook lacked clear "reduce EPS first" step

---

## Action Items

| # | Action | Owner | Due |
|---|--------|-------|-----|
| 1 | Add RBAC to simulator control endpoint (SRE role required for EPS > 1000) | Platform | 2026-07-05 ✅ |
| 2 | Separate staging and perf-test Kafka clusters | Infra | 2026-07-15 ✅ |
| 3 | Reduce HPA scale-out stabilization window from 5m to 90s | SRE | 2026-07-08 ✅ |
| 4 | Update runbook to prioritize EPS reduction before scaling consumers | SRE | 2026-07-01 ✅ |
| 5 | Add consumer lag SLO burn-rate alert for rapid budget consumption | SRE | 2026-07-10 ✅ |

---

## Lessons Learned

- Simulation controls in a shared environment must have the same access controls as production infrastructure
- HPA alone is insufficient for fast-growing event queues; manual scaling procedures are a necessary fallback
- The runbook successfully guided resolution once followed in order — the delay was discovery time, not execution time
