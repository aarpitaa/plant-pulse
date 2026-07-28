# Runbook: High Critical Machine Count

**Alert name:** `CriticalMachinesHigh`  
**Severity:** Critical  
**Audience:** Operations + SRE on-call

---

## Context

This alert fires when > 5 machines are simultaneously in `critical` severity state.  
A single critical machine is a routine event handled by the reliability controller.  
Multiple simultaneous criticals indicate a site-wide event or simulator anomaly.

## Triage

```bash
# Get all critical machines grouped by site
curl https://api.plantpulse.internal/api/machines?severity=critical | \
  jq '.machines | group_by(.siteId) | map({site: .[0].siteId, count: length, machines: map(.machineId)})'

# Check if anomaly mode is active
curl https://api.plantpulse.internal/api/simulator/status | jq '{anomalyMode, eventsPerSecond}'
```

## Remediation

### If caused by simulator anomaly mode:
```bash
curl -X PATCH https://api.plantpulse.internal/api/simulator/config \
  -H 'Content-Type: application/json' \
  -d '{"anomalyMode": "none"}'
```

### If caused by a real site event:
1. Notify site operations manager via Slack `#ops-alerts`
2. Check SCADA system for the affected plant
3. Consider isolating the affected site machines for manual inspection
4. Do NOT resolve incidents until physical inspection confirms safe state

### Acknowledge all open incidents for affected site:
```bash
# Get open incidents for site
SITE="plant-atlanta-01"
curl "https://api.plantpulse.internal/api/incidents?siteId=$SITE&status=open" | \
  jq '.incidents[].id' | \
  xargs -I{} curl -X PATCH "https://api.plantpulse.internal/api/incidents/{}" \
    -H 'Content-Type: application/json' \
    -d '{"status": "acknowledged"}'
```
