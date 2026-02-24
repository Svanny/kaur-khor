# Environment Template Policy

Files in this folder are tracked templates for `dev`, `staging`, and `prod`.

## Rules
- Tracked templates must not contain real credentials or tokens.
- Secret-valued keys may only be:
  - `__SET_IN_PLATFORM_SECRET__`, or
  - empty (only when explicitly documented as optional).
- Runtime secret values are sourced from platform secret stores (Railway service/env vars).
- CI/deploy secret values are sourced from GitHub Environment secrets.

## Secret Keys (platform-only)
- `DATABASE_RUNTIME_URL`
- `DATABASE_MIGRATION_URL` (CI/deploy migration step only)
- `REDIS_URL`
- `RABBIT_URL`
- `OBJECT_STORAGE_ACCESS_KEY`
- `OBJECT_STORAGE_SECRET_KEY`
- `OTEL_HEADERS` (when credential-bearing)
- `OTEL_EXPORTER_OTLP_HEADERS` (preferred OTLP auth header key)
- service integration keys (for example `STRIPE_API_KEY`, `SENDGRID_API_KEY`)

## Observability Baseline (OTel)
- Official OTEL variables are supported first:
  - `OTEL_ENABLED`
  - `OTEL_EXPORTER_OTLP_ENDPOINT`
  - `OTEL_EXPORTER_OTLP_HEADERS`
  - `OTEL_SERVICE_NAME`
  - `OTEL_RESOURCE_ATTRIBUTES`
  - `OTEL_TRACES_SAMPLER`
  - `OTEL_TRACES_SAMPLER_ARG`
  - `OTEL_METRICS_EXPORT_INTERVAL`
- Backward-compatibility alias:
  - `OTEL_HEADERS` is used if `OTEL_EXPORTER_OTLP_HEADERS` is unset.
- When `OTEL_ENABLED=true`, endpoint + headers must be set in platform secrets/config.

## Service Access Matrix (Current + Near-Term)
- `api`: `DATABASE_RUNTIME_URL`, optional `REDIS_URL`, optional `RABBIT_URL`, integration secrets, optional telemetry auth
- `worker`: `DATABASE_RUNTIME_URL`, `RABBIT_URL`, optional `REDIS_URL`, integration secrets, optional telemetry auth
- `scheduler`: minimal `RABBIT_URL`, scheduler-specific integration secrets, optional telemetry auth
- `projection-consumer`: `DATABASE_RUNTIME_URL`, optional telemetry auth
- `outbox-relay` (current phase): `DATABASE_RUNTIME_URL`, optional telemetry auth

Runtime services must not receive `DATABASE_MIGRATION_URL`.
