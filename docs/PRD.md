# PlantPulse — Product Requirements Document
**Multi-Cloud Industrial Reliability and Auto-Remediation Platform**

> Version 1.0 · July 28, 2026

---

## 1. Executive Summary

PlantPulse is a production-grade Site Reliability Engineering (SRE) platform built for industrial manufacturing environments. It ingests simulated factory-equipment telemetry through Apache Kafka, processes and validates the stream with Python microservices, calculates machine health scores, detects operational anomalies, and automatically responds to defined failure conditions — all running on Kubernetes across multiple cloud providers.

The project is designed to demonstrate what a strong SRE Software Engineer candidate actually builds: not a technology checklist, but a living, measured, failure-tested distributed system with defined SLOs, automated remediation, and blameless postmortems.

---

## 2. Problem Statement

Modern industrial facilities generate massive volumes of machine telemetry. Without reliable ingestion, real-time health assessment, and automated response, problems escalate before operators notice. This platform solves:

- **Visibility**: real-time equipment health across hundreds of devices and sites
- **Reliability**: measured SLOs with error-budget tracking and burn-rate alerts
- **Resilience**: automatic remediation of predictable failure modes
- **Portability**: the same system deploys to Azure (primary), GCP (DR), and Alibaba (portability layer) using identical Helm charts

---

## 3. Target Users

| User | Primary Need |
|------|-------------|
| Plant Operations Manager | Live equipment health dashboard, active incident list |
| SRE / On-Call Engineer | Alert routing, runbook access, audit trail of automated actions |
| Reliability Architect | SLO compliance, error-budget burn rate, trend analysis |
| Recruiter / Technical Evaluator | Evidence of engineering depth: failure tests, postmortems, real measurements |

---

## 4. Service-Level Objectives (SLOs)

These are contractual targets, not aspirational ones. Every dashboard and alert must be anchored to one of them.

| Service-Level Indicator | Target |
|------------------------|--------|
| API availability | 99.9% |
| P95 API response latency | ≤ 300 ms |
| Valid events processed | 99.95% |
| Telemetry processing delay (end-to-end) | ≤ 10 seconds |
| Critical incident detection time | ≤ 30 seconds |
| Recovery after worker failure | ≤ 2 minutes |
| Recovery after failed deployment | ≤ 5 minutes |

**Error budget (monthly, 99.9% availability):**
- Allowed downtime: ~43 minutes/month
- System must track: successful requests, failed requests, current availability, budget consumption, burn rate, and time-to-budget-exhaustion

---

## 5. Architecture

### 5.1 Data Flow

```
Industrial Equipment Simulators (Python)
           │
           ▼
     Kafka: telemetry.raw
           │
           ▼
  Validation & Ingestion Service
           │
     ┌─────┴──────┐
     ▼            ▼
telemetry.valid  telemetry.dlq (dead-letter)
     │
     ▼
Health Processing Workers
     │
     ├──────────────┐
     ▼              ▼
PostgreSQL    incidents.detected (Kafka topic)
                    │
                    ▼
           Incident API Service
                    │
                    ▼
         Operations UI (React/Vite)

Reliability Controller ──watches──▶ Prometheus metrics
     │
     ├──▶ Scale workers (HPA trigger)
     ├──▶ Quarantine poison messages (route to DLQ)
     ├──▶ Roll back broken deployments
     ├──▶ Create incident records
     └──▶ Write audit log (every automated action)

Prometheus ◀── all services + Kubernetes
     │
     ├──▶ Grafana Dashboards (4 dashboards)
     └──▶ Alertmanager ──▶ PagerDuty / Slack (simulated)
```

### 5.2 Multi-Cloud Layout

| Cloud | Role | Services |
|-------|------|----------|
| **Azure (primary)** | Full production | AKS, Azure Container Registry, Azure Database for PostgreSQL, Azure Blob Storage |
| **GCP (disaster recovery)** | Standby deployment | GKE, Artifact Registry, Cloud SQL, Cloud Storage |
| **Alibaba (portability)** | Terraform module + docs | ACK, OSS, RAM roles, Container Registry |

Same Helm charts deploy to all providers. Provider-specific differences are isolated to `values-<provider>.yaml` files.

---

## 6. Python Microservices (Core Software)

### 6.1 Equipment Simulator (`services/equipment-simulator`)

Generates realistic telemetry from hundreds of simulated devices.

**Configurable behaviors:**
- Normal operating mode (baseline readings with natural variance)
- Abnormal modes:
  - Sudden temperature spike
  - Gradually increasing vibration
  - Malformed / schema-invalid messages
  - Offline equipment (no events for N seconds)
  - Duplicate and out-of-order events
  - Simulated network delay
- Configurable event rate (100 → 2,000+ events/sec)
- Multi-site support (`site_id`, `machine_id`, `plant_id`)

**Output schema (per event):**
```json
{
  "machine_id": "compressor-104",
  "site_id": "plant-atlanta-01",
  "timestamp": "2026-07-28T13:30:00Z",
  "temperature_c": 92.4,
  "pressure_psi": 147.8,
  "vibration_mm_s": 8.2,
  "status": "running"
}
```

### 6.2 Validation & Ingestion Service (`services/ingestion-service`)

Consumes `telemetry.raw`, performs:
- JSON schema validation (reject unknowns, missing fields, wrong types)
- Duplicate detection (dedup window: configurable, default 60 s)
- Metadata enrichment (ingestion timestamp, source region)
- Poison-message isolation → `telemetry.dlq`
- Valid events → `telemetry.valid`
- Prometheus metric exposure

### 6.3 Health Processing Service (`services/health-processor`)

Consumes `telemetry.valid`, calculates per-machine health score using transparent threshold rules:

```python
if temperature_c > 90 and vibration_mm_s > 7:
    severity = "critical"
elif temperature_c > 80 or vibration_mm_s > 5:
    severity = "warning"
else:
    severity = "normal"
```

Writes:
- Current machine state → PostgreSQL (`machine_health` table)
- Historical readings → PostgreSQL (`telemetry_history` table)
- Incident events (on severity change to `critical`) → `incidents.detected` Kafka topic

### 6.4 Incident API Service (`services/incident-api`)

RESTful API (FastAPI) providing:
- `GET /plant/{site_id}/status` — current health of all machines at a site
- `GET /machines/{machine_id}` — single machine health + recent history
- `GET /incidents` — list with filters (severity, site, time range, status)
- `GET /incidents/{id}` — detail with timeline
- `PATCH /incidents/{id}` — update status (acknowledge, resolve)
- `GET /slo/status` — current SLO compliance and error-budget metrics
- `GET /remediation/audit` — log of all automated controller actions
- `GET /healthz` (liveness), `GET /readyz` (readiness)

All endpoints: authenticated (JWT or API key), rate-limited, input-validated, Prometheus-instrumented.

### 6.5 Reliability Controller (`services/reliability-controller`)

**The most impressive component.** A Python service that watches Prometheus metrics and takes guarded, audited automated actions:

| Trigger | Action | Safety Guard |
|---------|--------|-------------|
| Kafka consumer lag > threshold for > 2 min | Trigger HPA scale-up | Max 5 attempts per rolling window |
| DLQ growth rate > N msg/min | Pause retry loop, route to DLQ | Alert sent, action logged |
| API error rate > SLO threshold | Open incident, page on-call | Requires metric for 3 consecutive scrapes |
| Health endpoint failure > 3 times | Trigger deployment rollback | Cooldown period after rollback |
| Remediation loop reached max attempts | Disable auto-remediation, require human | Audit log + alert required |

Every action writes an audit log record: timestamp, trigger metric value, action taken, outcome, operator (always `reliability-controller/v{version}`).

---

## 7. Frontend Operations UI

React + Vite single-page application served under `/` on the platform.

### Pages

| Route | Purpose |
|-------|---------|
| `/` | Executive reliability overview: SLO compliance, error budget, active incident count |
| `/plants` | Plant map — all sites with live health rollup |
| `/plants/:siteId` | Site detail — all machines, real-time readings, severity badges |
| `/machines/:machineId` | Machine detail — history chart, health timeline, raw readings |
| `/incidents` | Incident list with filter/sort by severity, site, status |
| `/incidents/:id` | Incident detail — timeline, linked runbook, assigned actions |
| `/slo` | SLO dashboard — per-indicator compliance, burn rate, budget calendar |
| `/remediation` | Audit log of all automated controller actions |
| `/experiments` | Failure experiment control panel — trigger/monitor chaos scenarios |
| `/settings` | API config, notification routing |

### Data Strategy
- Polls Incident API every 5 s for live data
- WebSocket (or SSE) for real-time machine health feed
- No mock data — all UI wires to real API hooks from codegen

---

## 8. Observability Stack

### 8.1 Application Metrics (Prometheus)

```
telemetry_events_received_total
telemetry_events_processed_total
telemetry_events_invalid_total
telemetry_processing_duration_seconds (histogram)
telemetry_processing_lag_seconds (gauge)
incidents_created_total
remediation_actions_total
remediation_failures_total
api_requests_total (by endpoint, method, status)
api_request_duration_seconds (histogram)
slo_error_budget_remaining_ratio (gauge)
slo_burn_rate (gauge)
```

### 8.2 Kafka Metrics
Producer/consumer throughput, consumer lag per group/partition, failed deliveries, DLQ growth rate, rebalancing events.

### 8.3 Kubernetes Metrics
Pod restarts, unavailable replicas, CPU throttling, memory pressure, pending pods, deployment rollout status, node health.

### 8.4 Grafana Dashboards (4 targeted)

| Dashboard | Key Panels |
|-----------|-----------|
| **Executive Reliability** | SLO compliance %, error budget remaining, active incidents, burn rate trend |
| **Event Processing Health** | Events/sec, error rate, latency percentiles, DLQ rate, processing lag |
| **Kafka Operations** | Consumer lag per group, partition health, DLQ message count, throughput |
| **Kubernetes Operations** | Pod health, resource utilization, restart counts, HPA scaling events |

### 8.5 Alertmanager Rules

| Alert | Condition | Severity |
|-------|-----------|---------|
| `HighConsumerLag` | lag > 10k for 2 min | warning |
| `CriticalConsumerLag` | lag > 50k for 1 min | critical |
| `APIErrorRateHigh` | error rate > 5% for 5 min | critical |
| `SLOBurnRateFast` | burn rate > 6x for 1 h | warning |
| `SLOBurnRateCritical` | burn rate > 14.4x for 5 min | page |
| `DeadLetterGrowing` | DLQ > 100 msg/min | warning |
| `PodRestartLooping` | restarts > 5 in 10 min | warning |
| `WorkerUnavailable` | replicas < desired for 3 min | critical |

---

## 9. Kubernetes Resources

Every resource below must exist with a documented reason (not just a checklist):

| Resource | Purpose |
|----------|---------|
| `Deployment` | Stateless services (ingestion, health-processor, incident-api, reliability-controller) |
| `StatefulSet` | Kafka (if self-hosted), any stateful worker |
| `HorizontalPodAutoscaler` | health-processor workers scale on CPU **and** Kafka consumer lag (custom metric via KEDA or Prometheus adapter) |
| `PodDisruptionBudget` | Ingestion service: max 1 unavailable during maintenance |
| Resource requests/limits | All containers; prevents runaway services and over-throttling |
| Readiness probe | Block traffic until Kafka + DB connections confirmed healthy |
| Liveness probe | Restart permanently stuck services |
| Startup probe | Give slow-starting services extra time before liveness kicks in |
| `NetworkPolicy` | Deny all by default; allow only documented inter-service paths |
| `ServiceAccount` + RBAC | Least-privilege; reliability-controller gets only what it needs |
| `ConfigMap` | Non-secret configuration (thresholds, event rates) |
| `Secret` (sealed) | DB credentials, Kafka credentials, API keys |
| `Ingress` | TLS termination, path-based routing |
| `Job` | Database migrations run as pre-upgrade hooks |
| `Namespace` | Isolate: `plantpulse`, `monitoring`, `kafka` |
| Helm charts | All resources templated; values files per environment |

---

## 10. Failure Experiments

Six repeatable, documented chaos experiments:

| # | Experiment | Expected Result | Measured Outcomes |
|---|-----------|----------------|-------------------|
| 1 | Kill ingestion pod | K8s replaces it; SLO intact; Kafka retains events; lag recovers | Detection time, recovery time, events lost |
| 2 | Kafka backlog (100 → 2,000 events/sec) | Lag alert fires; HPA scales workers; lag recovers; scale-down safe | Time to alert, time to scale, lag curve |
| 3 | Deploy broken health endpoint | Readiness fails; pipeline rolls back; incident created | Time to detect, time to rollback |
| 4 | Malformed event injection | Valid events unaffected; invalid → DLQ; no retry loop; DLQ alert fires | DLQ rate, valid-event throughput unaffected |
| 5 | Database latency injection | API latency spikes; Prometheus identifies DB bottleneck; circuit-breaker/timeout prevents pileup; recovery clean | P95 latency delta, recovery time |
| 6 | Simulate cloud outage | GCP DR comes online; RTO measured; services restored | RTO, RPO, data loss |

Each experiment records: detection time, alert time, mitigation time, recovery time, data loss (if any), root cause, preventive improvement.

---

## 11. CI/CD Pipeline (GitHub Actions)

```
PR opened
  → Format & lint (ruff, black, isort)
  → Unit tests (pytest)
  → Integration tests (Kafka + PostgreSQL via docker-compose)
  → Build Docker images
  → Dependency + image security scan (Trivy, Grype)
  → Push versioned images (immutable tags: git SHA)
  → Deploy to staging (AKS staging namespace)
  → Smoke tests + load tests (k6)
  → Manual production approval (GitHub environment protection)
  → Canary deployment (10% traffic)
  → Evaluate health metrics for 5 min
  → Healthy → promote full rollout
  → Unhealthy → automatic rollback + incident created
```

**Features:**
- Protected `main` branch — all changes via PR
- OIDC cloud authentication (no stored cloud keys)
- Database migration as pre-upgrade Job
- Immutable image tags
- Environment-specific values files
- Release notes auto-generated from conventional commits
- Test reports uploaded as artifacts

---

## 12. Ansible — On-Premises Edge Layer

Ansible manages 2–3 Linux VMs representing industrial-site gateway machines. This creates a credible hybrid-cloud story:

```
Factory / on-premise edge (Ansible-managed VMs)
        │
        │  Kafka-compatible, TLS-secured connection
        ▼
Cloud Kubernetes platform (AKS / GKE)
```

**Ansible playbooks cover:**
- Create service users (least-privilege)
- Install Docker + required packages
- Configure system limits (`ulimit`, `sysctl`)
- Install equipment simulator as a systemd service
- Configure TLS certificates (mTLS to cloud Kafka)
- Install Prometheus node exporter
- Configure log rotation
- Install and configure NGINX reverse proxy
- Apply security hardening (CIS-inspired)
- Perform rolling updates (zero-downtime)

---

## 13. Security Requirements

| Area | Implementation |
|------|---------------|
| Kubernetes access | RBAC; each service gets a scoped `ServiceAccount` |
| Cloud identity | Least-privilege workload identity (AKS workload identity, GKE Workload Identity) |
| Network | `NetworkPolicy` deny-all default; explicit allow rules per service |
| Transport | TLS between all major components; mTLS for edge-to-cloud Kafka |
| Secrets | Kubernetes Secrets (sealed-secrets or Azure Key Vault CSI); zero credentials in Git |
| Container security | Trivy/Grype image scanning in CI; non-root containers; read-only root filesystem |
| Dependency scanning | pip-audit / Safety in CI |
| API security | JWT/API-key authentication; rate limiting; input validation (Pydantic) |
| Audit logging | Every automated remediation action logged with actor, trigger, action, outcome |
| Admin endpoints | Restricted by `NetworkPolicy` and RBAC |
| Backups | Encrypted at rest; encrypted in transit; access-logged |

**Threat model** covers: compromised simulator, malicious telemetry payload, exposed Kafka credentials, container escape, over-privileged service account, unauthorized remediation request, supply-chain compromise.

---

## 14. Documentation Deliverables

| Document | Contents |
|----------|---------|
| `docs/architecture.md` | Full architecture diagram (data flow, trust boundaries, cloud resources, failure points, observability flow) |
| `docs/slo.md` | What users care about, how each SLI is calculated, why each target was chosen, error-budget policy |
| `docs/disaster-recovery.md` | GCP DR runbook, RTO/RPO targets, tested recovery procedure |
| `docs/threat-model.md` | Attack scenarios, mitigations, residual risks |
| `docs/runbooks/` | 7 runbooks: consumer lag, API error rate, pod restarts, PG connection exhaustion, DLQ growth, rollback failure, cloud outage |
| `docs/postmortems/` | Minimum 2 blameless postmortems from real failure experiments |
| `docs/architecture-decisions/` | ADRs: Kafka selection, PostgreSQL selection, Azure primary, remediation safety limits, Helm choice, multi-cloud trade-offs |

---

## 15. Repository Structure

```
plantpulse/
├── services/
│   ├── equipment-simulator/     # Python; configurable telemetry generator
│   ├── ingestion-service/       # Python; Kafka consumer → validate → route
│   ├── health-processor/        # Python; health score + incident events
│   ├── incident-api/            # FastAPI; REST API + WebSocket feed
│   └── reliability-controller/  # Python; watches metrics, takes guarded action
├── shared/
│   ├── event-schemas/           # JSON Schema / Pydantic models (shared)
│   └── python-libraries/        # Shared utilities (Kafka client, logging, metrics)
├── frontend/                    # React + Vite operations UI
├── infrastructure/
│   ├── terraform/
│   │   ├── modules/             # Reusable: networking, k8s-cluster, database
│   │   ├── azure/               # AKS primary environment
│   │   ├── gcp/                 # GKE disaster-recovery environment
│   │   └── alibaba/             # Portability layer + docs
│   ├── ansible/                 # Edge-node provisioning playbooks
│   ├── kubernetes/              # Raw manifests (reference; Helm is primary)
│   └── helm/
│       ├── plantpulse/          # Main application chart
│       └── values/              # values-azure.yaml, values-gcp.yaml, values-local.yaml
├── observability/
│   ├── prometheus/              # scrape configs, recording rules
│   ├── grafana/                 # dashboard JSON provisioning
│   └── alerts/                  # Alertmanager rules
├── tests/
│   ├── unit/                    # pytest per-service
│   ├── integration/             # docker-compose; Kafka + PostgreSQL
│   ├── performance/             # k6 load tests
│   └── resilience/              # Chaos experiment scripts
├── experiments/
│   ├── pod-failure/
│   ├── kafka-backlog/
│   ├── database-latency/
│   ├── malformed-events/
│   ├── failed-deployment/
│   └── cloud-outage/
├── docs/                        # See §14
└── .github/workflows/           # CI/CD pipeline (see §11)
```

---

## 16. Tech Stack Summary

| Layer | Technology |
|-------|-----------|
| **Telemetry transport** | Apache Kafka (topics: `telemetry.raw`, `telemetry.valid`, `telemetry.dlq`, `incidents.detected`) |
| **Backend services** | Python 3.12, FastAPI, confluent-kafka-python, Pydantic v2 |
| **Database** | PostgreSQL 16 (Azure Database for PostgreSQL / Cloud SQL) |
| **ORM / migrations** | SQLAlchemy 2 + Alembic |
| **Frontend** | React 18 + Vite, TypeScript, TanStack Query (from OpenAPI codegen), Recharts |
| **API contract** | OpenAPI 3.1 → Orval codegen (React Query hooks + Zod schemas) |
| **Container runtime** | Docker; images pushed to ACR / Artifact Registry |
| **Orchestration** | Kubernetes 1.29+; Helm 3 charts |
| **Autoscaling** | HPA + KEDA (Kafka consumer lag metric) |
| **Observability** | Prometheus, Grafana, Alertmanager, OpenTelemetry (traces + logs) |
| **Infrastructure as Code** | Terraform (Azure + GCP + Alibaba modules) |
| **Edge provisioning** | Ansible |
| **CI/CD** | GitHub Actions; OIDC cloud auth; Trivy/Grype scanning |
| **Secret management** | Sealed Secrets (cluster) / Azure Key Vault CSI |
| **Primary cloud** | Azure (AKS) |
| **DR cloud** | GCP (GKE) |
| **Portability layer** | Alibaba Cloud (Terraform module + documentation) |

---

## 17. Build Phases

### Phase 1 — Strong Minimum (6–8 weeks)
- Python simulator + ingestion service + health processor
- Kafka pipeline (raw → valid → DLQ)
- PostgreSQL schema + Alembic migrations
- Incident API (CRUD + SLO endpoint)
- Local Kubernetes (kind or minikube) with Helm
- Prometheus + Grafana (all 4 dashboards)
- GitHub Actions CI (lint, test, build, push)
- Azure AKS deployment
- 3 failure experiments (pod kill, backlog, malformed events)
- SLO document + 2 runbooks + 1 postmortem

### Phase 2 — Standout (10–14 weeks, add on top of Phase 1)
- Python reliability controller (full guarded-action loop)
- KEDA-based Kafka-lag autoscaling
- Canary deployment + automatic rollback
- Ansible-managed edge nodes
- GCP disaster-recovery environment
- Alibaba Terraform module
- Security hardening (mTLS, sealed secrets, NetworkPolicy)
- All 6 failure experiments
- k6 load testing + resilience reports
- OpenTelemetry distributed tracing
- Multiple postmortems
- Recorded 5-minute technical demo

---

## 18. Measurable Performance Targets

Run experiments and report **actual numbers** (the table below shows example targets to beat):

| Test | Minimum Target | Stretch Target |
|------|---------------|---------------|
| Sustained ingestion rate | 400 events/sec | 1,600 events/sec |
| P95 processing latency | < 2 sec | < 500 ms |
| Worker-failure recovery | < 4 min | < 60 sec |
| Kafka backlog recovery | < 15 min | < 5 min |
| Failed-release detection | < 5 min | < 2 min (automatic rollback) |
| GCP DR recovery (RTO) | < 30 min | < 15 min |
| Events lost during pod failure | 0 (Kafka guarantees) | 0 |

---

## 19. What Success Looks Like

At demo time, a 5-minute walkthrough should show:

1. Architecture diagram — trust boundaries, data flow, cloud layout
2. Operations dashboard — live telemetry flowing, SLO status green
3. Event rate spike — consumer lag alert fires, HPA scales workers, lag recovers
4. Broken deployment — readiness probes fail, pipeline rolls back, incident created
5. Incident record — timeline, linked runbook, automated action audit log
6. Postmortem — from a previous real failure experiment

The complete story: **"I built it, measured it, broke it, detected the failure, recovered it, and documented how to prevent recurrence."**
