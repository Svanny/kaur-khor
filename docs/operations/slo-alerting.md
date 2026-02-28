# SLO Alerting

## Purpose
This document defines Banji's user-pain SLOs and the predictive alert rules that back them.

Current defaults:
- API availability SLO: `99.5%` over 30 days for `/v1/*`
- API latency SLO: `95%` of eligible `/v1/*` requests under `750ms` over 30 days

## SLI Semantics
Availability SLI classifications:
- `success`: non-`5xx` responses
- `failure_server`: generic `5xx`
- `failure_backpressure`: `503` returned by dependency backpressure
- `rate_limited`: `429`, counted separately as a fairness signal

Latency SLI classifications:
- `within_slo`
- `over_slo`

Latency denominator excludes:
- `429` rate-limited requests
- `503` dependency backpressure requests

Rationale:
- `429` is visible to users but is part of abuse control and fairness, not availability failure
- `503 DEPENDENCY_BACKPRESSURE` is visible user pain and should count against availability, but must alert separately from generic server failures

## Multi-Instance Samplers
Shared dependency samplers run in every API instance.

Query semantics:
- use `max` across `service.instance.id` for shared absolute-value gauges
- use `sum` across instances for additive counters

Examples:
- Rabbit queue depth: `max by (workload_class, queue_kind) (...)`
- Postgres blocking sessions: `max(...)`
- Backpressure rejects: `sum(rate(...))`

This avoids a singleton blind spot and avoids leader-election complexity.

## Metrics
SLI counters:
- `banji.sli.api.availability.total{classification=...}`
- `banji.sli.api.latency.total{classification=...}`

Shared dependency gauges:
- `banji.rabbit.queue.ready`
- `banji.rabbit.queue.unacked`
- `banji.rabbit.queue.depth`
- `banji.postgres.lock.waiting_sessions`
- `banji.postgres.lock.blocking_sessions`
- `banji.postgres.lock.oldest_wait_seconds`
- `banji.jobs.attempt.running`
- `banji.jobs.attempt.oldest_running_age_seconds`
- `banji.jobs.attempt.stale_heartbeat`

Cache effectiveness:
- `banji.cache.lookup.total{surface="item_read",result="hit|miss|error|disabled"}`

Existing corroborating metrics:
- `http.server.request.duration`
- `banji.db.pool.acquire.wait.duration`
- `banji.db.pool.acquire.failures.total`
- `banji.edge.backpressure.reject.total`
- `banji.edge.rate_limit.reject.total`

## Alerting Policy
Paging in prod:
- SLO burn-rate alerts
- backpressure critical
- Rabbit backlog critical
- Rabbit stuck-in-flight critical
- DLQ critical
- Postgres lock critical
- DB pool saturation critical

Non-paging by default:
- `429` fairness alerts
- cache hit-rate warnings in staging
- dev-only observability signals

## Kafka
Kafka lag alerting is intentionally deferred.

Reason:
- `JOB_RESULT_KAFKA_ENABLED=true` is still rejected at startup in the current milestone
- adding live Kafka alerts before the optional Kafka track exists would create dead config and noisy expectations

The alert rules file contains a documented future placeholder instead of an active Kafka alert.
