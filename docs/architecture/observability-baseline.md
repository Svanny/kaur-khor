# Observability Baseline (Milestone 8)

## Scope
This baseline establishes traces + metrics with OpenTelemetry and keeps operational logs platform-first.

Current target:
- services -> OTLP -> in-platform collector -> Grafana Cloud
- operational logs -> Railway/log drain
- audit/replay events -> Postgres `app.event_log`

## Transport Topology
1. Rust services emit OTLP traces and metrics to the collector (`OTEL_EXPORTER_OTLP_ENDPOINT`).
2. Collector performs retry/batching/memory limiting.
3. Collector exports to Grafana Cloud OTLP endpoint with auth headers.

No OTEL log pipeline is enabled in this phase.

## Correlation and Propagation Contract
- Human key: `x-correlation-id`
- Trace continuity: `traceparent`, `tracestate`, `baggage`
- Incoming correlation precedence:
  1. `x-correlation-id`
  2. trace id extracted from valid `traceparent`
  3. generated UUID
- HTTP responses always include `x-correlation-id`.
- Persisted observability metadata lives only under `metadata.observability`.
- Allowed persisted keys:
  - `x-correlation-id`
  - `traceparent`
  - `tracestate`
  - optional `baggage`
- Missing optional keys are omitted, never stored as empty strings.
- Length caps:
  - `x-correlation-id`: 64
  - `traceparent`: 128
  - `tracestate`: 512
  - `baggage`: 512
- Rabbit publish/consume must carry:
  - `x-correlation-id`
  - W3C trace headers
- AMQP `correlation_id` must match the envelope `correlation_id`.
- Relay runtimes reconstruct async parent context from persisted metadata, not from ambient loop context.
- Future Kafka publication reuses the same header names but remains disabled in this milestone.
- Structured logs include:
  - `correlation_id`, `trace_id`, `span_id`, `deployment_id`, `service`, `env`

## Metric Vocabulary
HTTP semantic-convention metrics:
- `http.server.request.duration` (seconds)
- `http.server.active_requests` (requests)

Application metrics:
- `banji.jobs.outbox.pending`
- `banji.jobs.publish.total`
- `banji.jobs.run.duration`
- `banji.jobs.retry.total`
- `banji.jobs.dlq.total`
- `banji.events.consumer.lag`
- `banji.events.consumer.errors.total`

## Cardinality Budget
Hard constraints:
- `http.route` must use templated route labels, never raw paths.
- `job_type`, `workload_class`, `consumer_name`, `stream_name` come from bounded sets.
- Trace span attributes must not include raw payloads, aggregate ids, user ids, or object keys.
- Never use user ids, payload fields, or free-text errors as metric labels.

## Configuration Contract
Supported OTEL variables:
- `OTEL_ENABLED`
- `OTEL_EXPORTER_OTLP_ENDPOINT`
- `OTEL_EXPORTER_OTLP_HEADERS`
- `OTEL_SERVICE_NAME`
- `OTEL_RESOURCE_ATTRIBUTES`
- `OTEL_TRACES_SAMPLER`
- `OTEL_TRACES_SAMPLER_ARG`
- `OTEL_METRIC_EXPORT_INTERVAL`

Compatibility alias:
- `OTEL_HEADERS` fallback when `OTEL_EXPORTER_OTLP_HEADERS` is unset.
- `OTEL_METRICS_EXPORT_INTERVAL` fallback when `OTEL_METRIC_EXPORT_INTERVAL` is unset during the compatibility window.

Blank OTEL env values are treated as unset.
OTLP headers are optional.
If `OTEL_ENABLED=true` and `OTEL_EXPORTER_OTLP_ENDPOINT` is unset, the SDK exporter default endpoint is used.
