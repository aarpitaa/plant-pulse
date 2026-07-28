# PlantPulse Service Level Objectives (SLOs)

> Version: 1.0 | Owner: SRE Team | Review cycle: Quarterly

## Overview

This document defines the Service Level Objectives (SLOs) for the PlantPulse Industrial Reliability Platform. These objectives represent the reliability guarantees made to internal operations teams and site managers.

---

## SLO Definitions

### SLO 1 — API Availability

| Field | Value |
|-------|-------|
| **Indicator** | HTTP requests returning 2xx or 3xx / total requests |
| **Target** | 99.9% over a rolling 30-day window |
| **Measurement window** | 30 days rolling |
| **Error budget** | 43.8 minutes/month |
| **Alert threshold** | Burn rate > 14.4x over 1h (1h burn) |
| **Tool** | Prometheus `http_requests_total` |

**Definition:**  
`availability = 1 - (errors / total_requests)`  
where errors are responses with HTTP status 5xx.

---

### SLO 2 — P95 API Latency

| Field | Value |
|-------|-------|
| **Indicator** | 95th-percentile end-to-end API response time |
| **Target** | ≤ 300ms |
| **Measurement window** | 30 days rolling |
| **Alert threshold** | P95 > 300ms for 5+ minutes |
| **Tool** | Prometheus `http_request_duration_seconds` histogram |

---

### SLO 3 — Valid Event Processing Rate

| Field | Value |
|-------|-------|
| **Indicator** | Events routed to `telemetry.valid` / events received on `telemetry.raw` |
| **Target** | 99.95% |
| **Error budget** | 0.05% of events may be DLQ'd per month |
| **Alert threshold** | DLQ rate > 0.5% for 5 minutes |
| **Tool** | Kafka consumer lag metrics |

---

### SLO 4 — End-to-End Processing Lag

| Field | Value |
|-------|-------|
| **Indicator** | Time from event received on `telemetry.raw` to machine health state updated |
| **Target** | ≤ 10 seconds at P95 |
| **Alert threshold** | Consumer lag on `telemetry.valid` > 50,000 messages |
| **Tool** | Kafka consumer group lag |

---

### SLO 5 — Incident Detection Latency

| Field | Value |
|-------|-------|
| **Indicator** | Time from anomalous reading to open incident created |
| **Target** | ≤ 30 seconds |
| **Measurement method** | Timestamp diff: `incidents.detected_at - first_anomalous_reading_at` |

---

## Error Budget Policy

| Budget Remaining | Action |
|------------------|--------|
| > 50% | Normal development velocity |
| 25–50% | Review reliability work in next sprint |
| 10–25% | Feature freeze, reliability work only |
| < 10% | Reliability emergency: P0 freeze, incident review required |
| 0% | Post-mortem required within 48 hours |

---

## Exclusions

The following are excluded from SLO measurement windows:

- Planned maintenance windows (≥ 24h notice required)
- Force majeure events (datacenter-wide outages)
- Customer-caused failures (direct DB access, unauthorized API usage)

---

## Review Process

SLOs are reviewed quarterly by the SRE team and operations management. Any proposed change to targets requires:
1. Data analysis of the previous quarter
2. Stakeholder sign-off from operations and engineering leads
3. 2-week notice period before target change takes effect
