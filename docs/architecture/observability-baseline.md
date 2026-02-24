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
  2. `x-request-id`
  3. trace id from current context
  4. generated UUID
- HTTP responses always include `x-correlation-id`.
- Rabbit publish/consume must carry:
  - `x-correlation-id`
  - W3C trace headers
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
- Never use user ids, payload fields, or free-text errors as metric labels.

## Configuration Contract
Supported OTEL variables:
- `OTEL_ENABLED`
- `OTEL_EXPORTER_OTLP_ENDPOINT`
- `OTEL_EXPORTER_OTLP_HEADERS` (preferred)
- `OTEL_SERVICE_NAME`
- `OTEL_RESOURCE_ATTRIBUTES`
- `OTEL_TRACES_SAMPLER`
- `OTEL_TRACES_SAMPLER_ARG`
- `OTEL_METRICS_EXPORT_INTERVAL`

Compatibility alias:
- `OTEL_HEADERS` fallback when `OTEL_EXPORTER_OTLP_HEADERS` is unset.

If `OTEL_ENABLED=true`, endpoint + headers are mandatory.

