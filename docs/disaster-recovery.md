# PlantPulse Disaster Recovery Runbook

**Version:** 1.0  
**Owner:** SRE Team  
**RTO target:** 4 hours  
**RPO target:** 15 minutes  
**Last tested:** 2026-06-15

---

## Overview

PlantPulse runs across Azure (primary) and GCP (DR). PostgreSQL backups run every 15 minutes. Kafka topic data is retained for 7 days.

---

## Scenario 1: Primary Region (Azure East US) Total Loss

### Detection
- All Azure health checks fail
- PagerDuty fires `AzureRegionDown`

### Steps

#### 1. Declare DR event (< 5 min)
```bash
# Notify the team
./scripts/declare-dr-event.sh --region azure-eastus --severity P0

# Update status page
./scripts/update-statuspage.sh --incident "Primary region degraded, failing over to GCP"
```

#### 2. Activate GCP cluster (< 30 min)
```bash
# Switch kubectl context to GCP
gcloud container clusters get-credentials plantpulse-prod --region us-central1 --project $GCP_PROJECT

# Deploy all services from latest images
helm upgrade --install plantpulse ./infrastructure/helm/plantpulse \
  --namespace plantpulse-prod \
  --create-namespace \
  --values ./infrastructure/helm/plantpulse/values.yaml \
  --values ./infrastructure/helm/plantpulse/values-gcp.yaml \
  --wait --timeout 10m
```

#### 3. Restore PostgreSQL from backup (< 1 hour)
```bash
# List available backups
gcloud sql backups list --instance=plantpulse-prod

# Restore latest backup
BACKUP_ID=$(gcloud sql backups list --instance=plantpulse-prod --format='value(id)' | head -1)
gcloud sql instances restore-backup plantpulse-dr \
  --backup-instance=plantpulse-prod \
  --backup-id=$BACKUP_ID
```

#### 4. Update DNS failover (< 15 min)
```bash
# Azure Traffic Manager or Route 53 failover
az network traffic-manager endpoint update \
  --name azure-primary \
  --profile-name plantpulse-tm \
  --resource-group rg-plantpulse-prod \
  --type externalEndpoints \
  --endpoint-status Disabled

az network traffic-manager endpoint update \
  --name gcp-dr \
  --profile-name plantpulse-tm \
  --resource-group rg-plantpulse-prod \
  --type externalEndpoints \
  --endpoint-status Enabled
```

#### 5. Verify recovery
```bash
curl -sf https://api.plantpulse.internal/api/healthz
curl -sf https://plantpulse.internal
```

---

## Scenario 2: Database Corruption or Accidental Data Deletion

### Detection
- API errors referencing missing tables or corrupted rows
- Operations team reports unexpected data loss

### Steps

#### 1. Identify the incident scope
```bash
# Check for recent DDL/DML operations
psql $DATABASE_URL -c "
  SELECT query, query_start, state
  FROM pg_stat_activity
  WHERE state != 'idle'
  ORDER BY query_start DESC
  LIMIT 20;"
```

#### 2. Stop writes immediately
```bash
kubectl scale deployment/plantpulse-api-server -n plantpulse-prod --replicas=0
kubectl scale deployment/plantpulse-ingestion-service -n plantpulse-prod --replicas=0
```

#### 3. Point-in-time recovery
```bash
# Azure: restore to specific point in time
az postgres flexible-server restore \
  --resource-group rg-plantpulse-prod \
  --name psql-plantpulse-prod-restored \
  --source-server psql-plantpulse-prod \
  --restore-time "2026-07-28T12:00:00Z"
```

#### 4. Validate and promote
```bash
# Test the restored instance
psql $RESTORED_DB_URL -c "SELECT count(*) FROM machines;"
psql $RESTORED_DB_URL -c "SELECT count(*) FROM incidents;"

# Update connection string in secrets
kubectl create secret generic plantpulse-pg-credentials \
  --from-literal=connection-string=$RESTORED_DB_URL \
  --dry-run=client -o yaml | kubectl apply -f -

# Restart services
kubectl scale deployment/plantpulse-api-server -n plantpulse-prod --replicas=2
kubectl scale deployment/plantpulse-ingestion-service -n plantpulse-prod --replicas=3
```

---

## Scenario 3: Kafka Cluster Loss

### Recovery from consumer offset reset

```bash
# Reset all consumer groups to beginning (replay all available messages)
kubectl exec -n plantpulse-prod kafka-0 -- \
  bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
  --group ingestion-service \
  --topic telemetry.raw \
  --reset-offsets --to-earliest --execute

# Restart consumers
kubectl rollout restart deployment/plantpulse-ingestion-service -n plantpulse-prod
```

---

## DR Contact List

| Role | Name | Contact |
|------|------|---------|
| SRE On-call | Rotation | PagerDuty escalation policy |
| Platform Lead | TBD | Slack `@platform-lead` |
| Database Admin | TBD | Slack `@dba` |
| Engineering Manager | TBD | Direct mobile |
