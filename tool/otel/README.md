# OTel Collector (Grafana Cloud Export)

## Purpose
Provide a resilient telemetry hop inside Railway:
- services send OTLP to collector
- collector batches/retries and forwards to Grafana Cloud

## Required Runtime Env (collector service)
- `GRAFANA_OTLP_ENDPOINT`
- `GRAFANA_OTLP_AUTH_HEADER`

Example `GRAFANA_OTLP_AUTH_HEADER`:
- `Basic <base64(instance_id:api_key)>`

## App-Side Env
Set in service environments:
- `OTEL_ENABLED=true`
- `OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317`
- `OTEL_EXPORTER_OTLP_HEADERS=__SET_IN_PLATFORM_SECRET__`

`OTEL_HEADERS` remains backward-compatible fallback if official OTEL header var is unset.

## Notes
- Logs are not exported via this collector in current phase.
- Operational logs remain platform-first (Railway/log drain).
