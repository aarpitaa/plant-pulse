# Post-Mortem: Pod Failure Experiment — 2026-07-15

**Duration:** 15 minutes (14:32 UTC – 14:47 UTC)  
**Severity:** P2 — partial service degradation  
**Detection method:** Automated (reliability controller)  
**Resolution method:** Automated (controller restart)  
**Error budget consumed:** ~2.1 minutes (4.8% of monthly budget)

---

## Summary

A scheduled chaos experiment (`pod-failure`) was executed via the Simulator Control panel at 14:32 UTC. The experiment set all 45 machines to `offline` / `critical` status simultaneously, triggering the reliability controller to open 45 individual critical incidents. The controller's per-machine cooldown prevented flood, but the open incident count temporarily reached 9 before automated resolution kicked in.

The `operations-ui` showed degraded dashboard data for ~3 minutes while the health processor reconciled real-state from the DB. The incident detection SLO was **not** breached (all incidents detected within 8s).

---

## Timeline

| Time (UTC) | Event |
|------------|-------|
| 14:32:00 | Chaos experiment `pod-failure` triggered |
| 14:32:01 | All machines set to `status=offline, severity=critical` |
| 14:32:04 | Reliability controller detects 9 open critical incidents |
| 14:32:05 | Controller records `open-site-incident` remediation |
| 14:32:08 | PagerDuty alert fires for on-call SRE |
| 14:33:10 | On-call acknowledges — recognizes it is a planned experiment |
| 14:47:00 | Auto-recovery completes, machines return to `running` |
| 14:47:15 | All incidents auto-resolved by health processor |

---

## Root Cause

The experiment intentionally simulates pod failure by setting machine state in the database. The 15-second recovery timer was functioning correctly, but the notification volume (45 incident webhooks) was not rate-limited.

---

## Action Items

| # | Action | Owner | Due |
|---|--------|-------|-----|
| 1 | Add webhook rate-limiting (max 5 alerts/site/minute) in reliability controller | Platform | 2026-08-01 |
| 2 | Add "experiment in progress" context to PagerDuty alert title | SRE | 2026-07-20 |
| 3 | Suppress duplicate site-wide incidents (only 1 per site per 10 min) | Platform | 2026-08-01 |

---

## Lessons Learned

- Chaos experiments should set a "suppression flag" before triggering to prevent on-call pages during planned tests
- Automated recovery worked correctly — no human intervention required for state restoration
- Incident webhook rate limiting is a production necessity before high-frequency experiments
