# PlantPulse

**Multi-Cloud Industrial Reliability & Auto-Remediation Platform**

PlantPulse is a full-stack SRE operations platform for monitoring industrial manufacturing equipment in real time. It ingests continuous telemetry from machines across multiple plant sites, detects anomalies, tracks Service Level Objectives with error budgets, automatically remediates failure conditions, and surfaces everything through a dark-mode operations control-room UI.

---

## Screenshots

| Executive Dashboard | Plant Registry | Chaos Simulator |
|---|---|---|
| Live SLO compliance, error budget, machine health matrix, incident feed | 3 plant sites × 15 machines with severity breakdown | Start/stop engine, inject anomalies, fire chaos experiments |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          PlantPulse Platform                            │
│                                                                         │
│   Equipment          Kafka Pipeline          Health / Control           │
│   Simulator  ──►  telemetry.raw   ──►  Ingestion Service                │
│   (Node.js)         │                        │                          │
│                     ├──► telemetry.valid ──► Health Processor ──► DB    │
│                     └──► telemetry.dlq        │                         │
│                                          Reliability Controller         │
│                                               │                         │
│                                          remediation_actions            │
│                                                                         │
│   Operations UI (React + Recharts + TanStack Query)                     │
│   10 pages ← REST API (Express 5, 19 endpoints) ← PostgreSQL            │
└─────────────────────────────────────────────────────────────────────────┘
```

### Data flow

1. **Equipment Simulator** generates synthetic telemetry (temperature, pressure, vibration) for every machine once per second
2. **Ingestion Service** validates each event — valid readings go to `telemetry.valid`, malformed ones to `telemetry.dlq`
3. **Health Processor** consumes valid events, computes severity (`normal / warning / critical`), updates machine state, and opens incidents when thresholds are crossed
4. **Reliability Controller** watches for incidents and Kafka lag, logs automated remediation actions (scaling workers, quarantining DLQ events, alerting on-call)
5. **Operations UI** polls the REST API every 3–5 seconds, rendering live telemetry charts, SLO compliance, incident timelines, and pipeline health

---

## Monorepo structure

```
plantpulse/
├── artifacts/
│   ├── api-server/           Express 5 REST API — 19 endpoints + simulator engine
│   └── operations-ui/        React Vite dark-mode control UI — 10 pages
│
├── lib/
│   ├── api-spec/             Single OpenAPI 3.1 spec (source of truth)
│   ├── api-client-react/     Orval-generated React Query hooks
│   ├── api-zod/              Orval-generated Zod validators (used server-side)
│   └── db/                   Drizzle ORM schema + migrations (7 tables)
│
├── services/
│   ├── equipment-simulator/  Python: generates telemetry events → Kafka
│   ├── ingestion-service/    Python: validates + routes valid/DLQ
│   ├── health-processor/     Python: computes severity, opens incidents
│   ├── reliability-controller/ Python: automated remediation
│   └── incident-api/         Python FastAPI: external incident integration
│
├── infrastructure/
│   ├── helm/plantpulse/      Helm chart (AKS + GKE deployment)
│   ├── terraform/azure/      Azure AKS + PostgreSQL + Event Hubs
│   ├── terraform/gcp/        GCP GKE Autopilot + Cloud SQL
│   ├── ansible/              Edge node provisioning playbooks
│   ├── prometheus/           Scrape configs + 5 alert rules
│   └── grafana/dashboards/   4 dashboard JSON files
│
├── docs/
│   ├── PRD.md
│   ├── slo-spec.md
│   ├── disaster-recovery.md
│   ├── runbooks/             4 operational runbooks
│   ├── postmortems/          2 post-mortem reports
│   └── adrs/                 3 Architecture Decision Records
│
└── .github/workflows/ci.yml  7-stage CI/CD pipeline
```

---

## Features

### Operations UI — 10 pages

| Page | Path | Description |
|------|------|-------------|
| Executive Dashboard | `/` | SLO %, error budget bar, machine health matrix, burn rate, incident feed — polls every 3s |
| Plant Registry | `/plants` | Card grid of all sites with severity breakdown |
| Plant Detail | `/plants/:siteId` | All machines for a site with live readings |
| Machine Detail | `/machines/:machineId` | Multi-line Recharts telemetry chart, anomaly highlights, readings table |
| Incidents | `/incidents` | Filterable table by severity / status / site |
| Incident Detail | `/incidents/:id` | Timeline, acknowledge / resolve actions |
| SLO Dashboard | `/slo` | Per-indicator compliance, error budget bars, burn rate |
| Remediation Audit | `/remediation` | Log of every automated controller action |
| Chaos Simulator | `/simulator` | Start/stop engine, set events/sec, inject anomalies, fire experiments |
| Event Pipeline | `/kafka` | Per-topic throughput, consumer lag, DLQ size, broker health |

### API — 19 endpoints

```
GET  /api/healthz
GET  /api/dashboard/summary
GET  /api/sites
GET  /api/sites/:siteId
GET  /api/machines
GET  /api/machines/:machineId
GET  /api/telemetry?machineId=...
GET  /api/incidents
POST /api/incidents
GET  /api/incidents/:id
PATCH /api/incidents/:id
GET  /api/slo/status
GET  /api/remediation/audit
POST /api/remediation/actions
GET  /api/simulator/status
POST /api/simulator/start
POST /api/simulator/stop
PATCH /api/simulator/config
POST /api/simulator/experiments/:experiment
GET  /api/kafka/metrics
```

### Chaos experiments

Fire via the Simulator page or directly via API:

| Experiment | Effect |
|------------|--------|
| `pod-failure` | All machines → offline/critical for 15s, auto-recovery triggers |
| `kafka-backlog` | Injects +75k consumer lag, auto-scales workers |
| `malformed-events` | 20% of events become malformed, DLQ grows for 30s |
| `database-latency` | Logs a latency remediation action |
| `failed-deployment` | Creates a deployment failure incident + rollback action |

### SLOs tracked (5 indicators)

| Indicator | Target |
|-----------|--------|
| API Availability | 99.9% |
| P95 API Latency | ≤ 300ms |
| Valid Event Processing Rate | 99.95% |
| End-to-End Processing Lag | ≤ 10s |
| Incident Detection Latency | ≤ 30s |

---

## Getting started

### Prerequisites

- [Node.js 22+](https://nodejs.org/)
- [pnpm 9+](https://pnpm.io/)
- PostgreSQL 16 (provided automatically in Replit)

### Run locally

```bash
# 1. Install dependencies
pnpm install

# 2. Set environment variables
export DATABASE_URL="postgresql://user:pass@localhost:5432/plantpulse"
export SESSION_SECRET="your-secret-here"

# 3. Push database schema
pnpm --filter @workspace/db run push

# 4. Start the API server
PORT=8080 pnpm --filter @workspace/api-server run dev

# 5. In a second terminal, start the UI
pnpm --filter @workspace/operations-ui run dev
```

The UI is available at `http://localhost:5173` and the API at `http://localhost:8080/api`.

### Regenerate API client (after editing the OpenAPI spec)

```bash
pnpm --filter @workspace/api-spec run codegen
```

> **Important:** Always use `type: number` (not `type: integer`) in the spec. Orval 8.23 generates `zod.int()` for integer types, which is a Zod v4 method incompatible with the v3 API used here. See `docs/adrs/003-orval-codegen.md`.

---

## Database schema

| Table | Purpose |
|-------|---------|
| `sites` | Plant sites (seeded: Atlanta, Chicago, Houston) |
| `machines` | Machine health state — updated every simulator tick |
| `telemetry_history` | Raw readings, pruned to last 2 hours |
| `event_queue` | Simulated Kafka event log |
| `incidents` | Auto-opened when severity → critical |
| `remediation_actions` | Controller action audit trail |
| `simulator_state` | Single-row config + counters |

---

## Infrastructure

### Kubernetes (Helm)

```bash
helm upgrade --install plantpulse ./infrastructure/helm/plantpulse \
  --namespace plantpulse-prod \
  --create-namespace \
  --values infrastructure/helm/plantpulse/values.yaml \
  --values infrastructure/helm/plantpulse/values-prod.yaml \
  --wait
```

### Terraform — Azure (primary)

```bash
cd infrastructure/terraform/azure
terraform init
terraform plan -var="subscription_id=<id>" -var="postgres_password=<pw>"
terraform apply
```

### Terraform — GCP (DR)

```bash
cd infrastructure/terraform/gcp
terraform init
terraform plan -var="project_id=<id>"
terraform apply
```

### Edge nodes (Ansible)

```bash
ansible-playbook -i inventory/edge-nodes infrastructure/ansible/edge-nodes.yml \
  --extra-vars "kafka_bootstrap=kafka.plantpulse.internal:9092"
```

---

## CI/CD pipeline

Seven stages defined in `.github/workflows/ci.yml`:

```
Lint & Type-check
       │
       ▼
 Unit & Integration Tests  ──►  Security Scan (Trivy)
       │
       ▼
 Build & Push Docker Images (7 services, matrix)
       │
       ▼
 Deploy to Staging  (Helm, atomic, smoke test)
       │
       ▼
 Canary Deploy (10% traffic, 5-min error rate monitoring)
       │
       ▼
 Promote to Production (100%) + remove canary
```

Required secrets: `KUBE_CONFIG_STAGING`, `KUBE_CONFIG_PROD`

---

## Observability

### Prometheus

- Scrape config: `infrastructure/prometheus/scrape-configs.yml`
- Alert rules: `infrastructure/prometheus/alert-rules.yml`
- Key alerts: `HighErrorBudgetBurnRate`, `KafkaConsumerLagHigh`, `KafkaDLQGrowing`, `CriticalMachinesHigh`, `TelemetryIngestionStopped`, `PodCrashLooping`

### Grafana dashboards

| Dashboard | UID | Description |
|-----------|-----|-------------|
| Executive Overview | `plantpulse-executive` | SLO compliance, burn rate, machine health over time |
| Kafka Event Pipeline | `plantpulse-kafka` | Per-topic throughput, consumer lag by group |
| Machine Health | `plantpulse-machines` | Per-machine temperature / pressure / vibration |
| SLO Detail | `plantpulse-slo` | Error budget burn rate, 7-day indicator breakdown |

---

## Documentation

| Document | Path |
|----------|------|
| Product Requirements | `docs/PRD.md` |
| SLO Specification | `docs/slo-spec.md` |
| Disaster Recovery Runbook | `docs/disaster-recovery.md` |
| Runbook: High Error Budget Burn | `docs/runbooks/high-error-budget-burn.md` |
| Runbook: Kafka Consumer Lag | `docs/runbooks/kafka-consumer-lag.md` |
| Runbook: Telemetry Ingestion Stopped | `docs/runbooks/telemetry-ingestion-stopped.md` |
| Runbook: Critical Machines High | `docs/runbooks/critical-machines-high.md` |
| Post-mortem: Pod Failure Experiment | `docs/postmortems/2026-07-pod-failure-experiment.md` |
| Post-mortem: Kafka Consumer Lag Spike | `docs/postmortems/2026-06-kafka-consumer-lag.md` |
| ADR-001: Kafka over RabbitMQ | `docs/adrs/001-kafka-over-rabbitmq.md` |
| ADR-002: Drizzle over Prisma | `docs/adrs/002-drizzle-over-prisma.md` |
| ADR-003: Orval for codegen | `docs/adrs/003-orval-codegen.md` |

---

## Technology stack

**Frontend**
- React 18 + Vite 7
- TanStack Query (React Query) — API hooks generated by Orval
- Recharts — telemetry charts
- Tailwind CSS + Radix UI primitives
- Wouter — client-side routing
- date-fns, lucide-react

**Backend**
- Express 5 (TypeScript, ESM)
- Drizzle ORM + drizzle-zod
- PostgreSQL 16
- Pino — structured logging

**Python microservices** (production equivalents)
- aiokafka — async Kafka producer/consumer
- asyncpg — async PostgreSQL
- Pydantic v2 — event schema validation
- FastAPI — incident API service

**Infrastructure**
- Kubernetes + Strimzi (Kafka operator)
- Helm 3
- Terraform (Azure + GCP providers)
- Ansible
- Prometheus + Grafana
- GitHub Actions

---

## License

MIT
