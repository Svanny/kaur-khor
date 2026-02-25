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

## Pooling and DB Boundary Keys (Non-Secret)
- `DATABASE_RUNTIME_ENDPOINT_KIND=direct|pgbouncer`
- `PGBOUNCER_POOL_MODE=transaction|session`
- `SQLX_POOL_MAX_CONNECTIONS`
- `SQLX_POOL_MIN_CONNECTIONS`
- `SQLX_POOL_ACQUIRE_TIMEOUT_MS`
- `SQLX_POOL_CONNECT_TIMEOUT_MS`
- `SQLX_POOL_IDLE_TIMEOUT_SECONDS`
- `SQLX_POOL_MAX_LIFETIME_SECONDS`
- `POSTGRES_CONNECTION_BUDGET_TOTAL`

`staging` and `prod` must use:
- `DATABASE_RUNTIME_ENDPOINT_KIND=pgbouncer`
- `PGBOUNCER_POOL_MODE=transaction`

## Event Log Retention / Archive Keys (Non-Secret)
- `EVENT_LOG_RETENTION_DAYS`
- `EVENT_LOG_PRUNE_BATCH_SIZE`
- `EVENT_LOG_REPLAY_BATCH_SIZE`
- `EVENT_LOG_ARCHIVE_PREFIX`
- `EVENT_LOG_ARCHIVE_RETENTION_DAYS`
- `EVENT_LOG_ARCHIVE_ENCRYPTION_REQUIRED`

Defaults for current fix:
- hot retention: `EVENT_LOG_RETENTION_DAYS=30`
- archive retention: `EVENT_LOG_ARCHIVE_RETENTION_DAYS=365`
- prune/replay batch size: `1000`

## Archive Upload Secrets (Platform-Only)
- `OBJECT_STORAGE_ACCESS_KEY`
- `OBJECT_STORAGE_SECRET_KEY`
- provider-specific bucket/endpoint secret keys where required by deployment platform
