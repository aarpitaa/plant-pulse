# Runbook: Telemetry Ingestion Stopped

**Alert name:** `TelemetryIngestionStopped`  
**Severity:** Critical — operations impact  
**SLO impact:** Processing lag SLO immediately breached

---

## Symptoms

- Zero events processed for > 3 minutes
- `plantpulse_telemetry_events_processed_total` counter flat
- All machine `lastReadingAt` timestamps stale

## Immediate actions (2 minutes)

```bash
# 1. Check simulator is running
curl https://api.plantpulse.internal/api/simulator/status

# 2. Check Kafka topic for messages
kubectl exec -n plantpulse-prod kafka-0 -- \
  bin/kafka-console-consumer.sh --bootstrap-server localhost:9092 \
  --topic telemetry.raw --max-messages 3 --timeout-ms 5000

# 3. Check ingestion service health
kubectl get pods -n plantpulse-prod -l app.kubernetes.io/component=ingestion-service
kubectl logs -n plantpulse-prod -l app.kubernetes.io/component=ingestion-service --since=5m
```

## Resolution paths

### Path A: Ingestion service is down
```bash
kubectl rollout restart deployment/plantpulse-ingestion-service -n plantpulse-prod
kubectl rollout status deployment/plantpulse-ingestion-service -n plantpulse-prod --timeout=120s
```

### Path B: Simulator is stopped
```bash
curl -X POST https://api.plantpulse.internal/api/simulator/start
```

### Path C: Kafka broker down
```bash
kubectl get pods -n plantpulse-prod -l strimzi.io/kind=Kafka
# If brokers are unhealthy, follow kafka-broker-recovery runbook
```

### Path D: Database unavailable
```bash
# Check DB connectivity from ingestion service
kubectl exec -n plantpulse-prod deploy/plantpulse-ingestion-service -- \
  python -c "import asyncpg, asyncio; asyncio.run(asyncpg.connect(os.environ['POSTGRES_URL']))"
```
