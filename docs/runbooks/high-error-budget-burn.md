# Runbook: High Error Budget Burn Rate

**Alert name:** `HighErrorBudgetBurnRate`  
**Severity:** Critical  
**Owner:** SRE Team  
**Last updated:** 2026-07

---

## Symptoms

- Alert fires: `HighErrorBudgetBurnRate` in PagerDuty
- Grafana SLO dashboard shows burn rate > 2x
- Error budget remaining drops rapidly on executive dashboard

## Quick triage (5 minutes)

```bash
# Check current error rate
kubectl exec -n plantpulse-prod deploy/plantpulse-api-server -- \
  curl -s localhost:8080/api/healthz

# Check API server logs for error patterns
kubectl logs -n plantpulse-prod -l app.kubernetes.io/component=api-server \
  --since=10m | grep '"statusCode":5'

# Check Prometheus for error sources
curl 'http://prometheus.plantpulse.internal/api/v1/query?query=sum(rate(http_requests_total{status=~"5..",job="plantpulse-api"}[5m]))by(path)'
```

## Investigation steps

### Step 1: Identify the failing endpoint
```bash
# Top 5 error-generating endpoints (last 5m)
curl 'http://prometheus.plantpulse.internal/api/v1/query?query=topk(5,rate(http_requests_total{status=~"5.."}[5m]))&deduplicated=true'
```

### Step 2: Check database connectivity
```bash
kubectl exec -n plantpulse-prod deploy/plantpulse-api-server -- \
  node -e "const {db}=require('./dist/index.mjs'); db.execute('SELECT 1').then(()=>console.log('OK')).catch(console.error)"
```

### Step 3: Check for recent deployments
```bash
kubectl rollout history deployment/plantpulse-api-server -n plantpulse-prod
```

### Step 4: Check Kafka consumer lag (can cause API timeouts)
```bash
kubectl exec -n plantpulse-prod kafka-0 -- \
  bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
  --describe --all-groups
```

## Remediation

### If caused by a bad deployment:
```bash
kubectl rollout undo deployment/plantpulse-api-server -n plantpulse-prod
kubectl rollout status deployment/plantpulse-api-server -n plantpulse-prod
```

### If caused by database issues:
```bash
# Restart connection pool
kubectl rollout restart deployment/plantpulse-api-server -n plantpulse-prod

# If DB is overloaded, check connections
kubectl exec -n plantpulse-prod deploy/plantpulse-api-server -- \
  psql $DATABASE_URL -c "SELECT count(*) FROM pg_stat_activity"
```

### If caused by memory pressure:
```bash
# Scale up API server
kubectl scale deployment/plantpulse-api-server -n plantpulse-prod --replicas=4
```

## Escalation

- **15 min** no resolution: escalate to platform lead
- **30 min** no resolution: declare P0 incident, page engineering manager

## Post-incident

After resolution, file a post-mortem within 48 hours at `docs/postmortems/`.
