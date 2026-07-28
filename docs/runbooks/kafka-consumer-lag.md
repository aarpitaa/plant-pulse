# Runbook: Kafka Consumer Lag

**Alert name:** `KafkaConsumerLagHigh`  
**Severity:** Warning → Critical (if lag > 100k)  
**Owner:** SRE / Platform Team  

---

## Symptoms

- Consumer lag on `telemetry.raw` or `telemetry.valid` exceeds 50,000 messages
- Machine health updates are stale (last reading timestamps fall behind)
- Operations dashboard shows processing lag > 30s

## Triage

```bash
# Check consumer group lag for all groups
kubectl exec -n plantpulse-prod kafka-0 -- \
  bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
  --describe --group ingestion-service

# Check running consumer instances
kubectl get pods -n plantpulse-prod -l app.kubernetes.io/component=ingestion-service
```

## Common causes

| Cause | Indicator | Fix |
|-------|-----------|-----|
| Simulator rate too high | `eventsPerSecond` >> consumer throughput | Reduce EPS or scale consumers |
| Consumer crash-loop | Pod restarts > 3 | Check logs, fix code |
| Partition imbalance | One partition has all lag | Trigger rebalance |
| DB write bottleneck | High DB latency | Scale DB or add read replicas |

## Remediation

### Scale consumers
```bash
kubectl scale deployment/plantpulse-ingestion-service -n plantpulse-prod --replicas=8
# Wait for lag to decrease
kubectl exec -n plantpulse-prod kafka-0 -- \
  bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
  --describe --group ingestion-service
```

### Trigger consumer group rebalance
```bash
kubectl rollout restart deployment/plantpulse-ingestion-service -n plantpulse-prod
```

### Emergency: throttle the simulator
```bash
curl -X PATCH https://api.plantpulse.internal/api/simulator/config \
  -H 'Content-Type: application/json' \
  -d '{"eventsPerSecond": 50}'
```

### Verify recovery
```bash
# Watch lag decrease
watch -n5 'kubectl exec -n plantpulse-prod kafka-0 -- \
  bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
  --describe --group ingestion-service | grep TOPIC'
```
