# ADR-001: Apache Kafka for Event Streaming

**Status:** Accepted  
**Date:** 2026-03-12  
**Author:** Platform Architecture Team  
**Deciders:** CTO, Platform Lead, SRE Lead

---

## Context

PlantPulse generates high-frequency telemetry from 450+ machines across 3 plants, targeting 5,000 events/second at peak load. We need a durable, replay-capable event streaming platform that can handle:

- High throughput (5K+ events/sec)
- At-least-once delivery semantics
- Replay capability for debugging and backfill
- Dead Letter Queue (DLQ) for malformed events
- Multiple independent consumer groups (ingestion, health processor, reliability controller)

Candidates evaluated: Apache Kafka, RabbitMQ, AWS SQS+SNS, Azure Service Bus.

---

## Decision

We will use **Apache Kafka** (via Strimzi operator on Kubernetes) as the central event streaming platform.

---

## Rationale

| Criterion | Kafka | RabbitMQ | SQS/SNS |
|-----------|-------|----------|---------|
| Throughput at 5K msg/s | ✅ Trivial | ✅ Possible | ✅ Possible |
| Log replay / reprocessing | ✅ Native | ❌ Requires plugins | ❌ No |
| Multiple consumer groups | ✅ Native | ⚠️ Complex | ⚠️ Fan-out required |
| Kafka-compatible APIs (Azure Event Hubs) | ✅ Portable | ❌ N/A | ❌ N/A |
| Strimzi K8s operator | ✅ Mature | ❌ N/A | ❌ N/A |
| Team expertise | ✅ Strong | ⚠️ Limited | ⚠️ Limited |

The ability to use Kafka-compatible APIs across Azure (Event Hubs), GCP (Confluent Cloud), and on-prem (Strimzi) was decisive for our multi-cloud strategy.

---

## Consequences

**Positive:**
- Consistent API across all cloud providers
- Log replay enables backfill after ingestion bugs
- Separate consumer groups for each service without coupling

**Negative:**
- Higher operational complexity than RabbitMQ
- Requires ZooKeeper (or KRaft) management
- Cold-start latency higher than SQS

**Risks:**
- Consumer lag can grow unboundedly under load — mitigated by HPA and monitoring
