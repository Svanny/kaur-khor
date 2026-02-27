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
- `EDGE_ORIGIN_AUTH_SECRET`
- `EDGE_ORIGIN_AUTH_SECRET_NEXT` (optional overlap secret for rotation)
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ZONE_ID`
- `CLOUDFLARE_ACCOUNT_ID`
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
- `event-relay`: `DATABASE_RUNTIME_URL`, optional telemetry auth

Runtime services must not receive `DATABASE_MIGRATION_URL`.

## Pooling and DB Boundary Keys (Non-Secret)
- `APP_ROLE=api|event-relay|projection-consumer|worker`
- `DATABASE_RUNTIME_ENDPOINT_KIND=direct|pgbouncer`
- `PGBOUNCER_POOL_MODE=transaction|session`
- `AUTH_ENABLED`
- `AUTH_JWKS_URL`
- `AUTH_ISSUER`
- `AUTH_AUDIENCE`
- `AUTH_JWKS_CACHE_TTL_SECONDS`
- `AUTH_JWKS_TIMEOUT_MS`
- `AUTH_CLOCK_SKEW_SECONDS`
- `IDEMPOTENCY_RETENTION_DAYS`
- `SQLX_POOL_MAX_CONNECTIONS`
- `SQLX_POOL_MIN_CONNECTIONS`
- `SQLX_POOL_ACQUIRE_TIMEOUT_MS`
- `SQLX_POOL_CONNECT_TIMEOUT_MS`
- `SQLX_POOL_IDLE_TIMEOUT_SECONDS`
- `SQLX_POOL_MAX_LIFETIME_SECONDS`
- `POSTGRES_CONNECTION_BUDGET_TOTAL`
- `EVENT_RELAY_BATCH_SIZE`
- `EVENT_RELAY_POLL_INTERVAL_MS`
- `EVENT_RELAY_RETRY_BACKOFF_MS`
- `EVENT_RELAY_MAX_BACKOFF_MS`
- `EVENT_RELAY_BLOCK_AFTER_ATTEMPTS`
- `EVENT_OUTBOX_PUBLISHED_RETENTION_DAYS`
- `WORKER_ID`
- `WORKER_ENABLED_CLASSES`
- `WORKER_POLL_INTERVAL_MS`
- `WORKER_SHUTDOWN_GRACE_SECONDS`
- `JOB_ATTEMPT_LEASE_SECONDS`
- `JOB_ATTEMPT_HEARTBEAT_SECONDS`
- `JOB_HANDLER_MAX_RUNTIME_SECONDS`
- `JOB_RESULT_KAFKA_ENABLED`
- `JOB_RESULT_KAFKA_TOPIC_PREFIX`
- `WORKER_CONSUME_REPLAY_QUEUES`
- `WORKER_JOB_RELAY_BATCH_SIZE`

`staging` and `prod` must use:
- `DATABASE_RUNTIME_ENDPOINT_KIND=pgbouncer`
- `PGBOUNCER_POOL_MODE=transaction`
- `AUTH_ENABLED=true`
- `AUTH_JWKS_URL`, `AUTH_ISSUER`, and `AUTH_AUDIENCE` must be set

`APP_ROLE=event-relay` startup contract:
- `DATABASE_RUNTIME_URL` is required
- HTTP-edge/auth keys are optional for this role

`APP_ROLE=projection-consumer` startup contract:
- `DATABASE_RUNTIME_URL` is required
- HTTP-edge/auth keys are optional for this role
- projection runtime contract is driven by:
  - `EVENT_CONSUMER_SERVICE_NAME`
  - `EVENT_CONSUMER_NAME`
  - `EVENT_CONSUMER_STREAM_NAME`
  - `EVENT_CONSUMER_BATCH_SIZE`
  - `EVENT_CONSUMER_POLL_INTERVAL_MS`
  - `EVENT_CONSUMER_INVALID_POLICY`
  - `EVENT_CONSUMER_RUN_MODE`
  - `EVENT_CONSUMER_REPLAY_FROM_ID`
  - `EVENT_CONSUMER_REPLAY_TO_ID`
  - `EVENT_CONSUMER_REPLAY_RESET_CHECKPOINT`
  - `EVENT_CONSUMER_REPLAY_TRUNCATE_PROJECTION`

`APP_ROLE=worker` startup contract:
- `DATABASE_RUNTIME_URL` is required
- `RABBIT_URL` is required
- HTTP-edge/auth keys are optional for this role
- Kafka result publication remains disabled by default in this milestone
- worker runtime contract is driven by:
  - `WORKER_ID`
  - `WORKER_ENABLED_CLASSES`
  - `WORKER_POLL_INTERVAL_MS`
  - `WORKER_SHUTDOWN_GRACE_SECONDS`
  - `JOB_ATTEMPT_LEASE_SECONDS`
  - `JOB_ATTEMPT_HEARTBEAT_SECONDS`
  - `JOB_HANDLER_MAX_RUNTIME_SECONDS`
  - `JOB_RESULT_KAFKA_ENABLED`
  - `JOB_RESULT_KAFKA_TOPIC_PREFIX`
  - `WORKER_CONSUME_REPLAY_QUEUES`
  - `WORKER_JOB_RELAY_BATCH_SIZE`

## Edge Protection Keys (Non-Secret)
- `EDGE_ENFORCEMENT_ENABLED`
- `EDGE_PROVIDER=cloudflare|none`
- `EDGE_ORIGIN_AUTH_HEADER_NAME`
- `EDGE_RATE_LIMIT_ENABLED`
- `EDGE_RATE_LIMIT_WINDOW_SECONDS`
- `EDGE_RATE_LIMIT_READ_MAX`
- `EDGE_RATE_LIMIT_WRITE_MAX`
- `EDGE_RATE_LIMIT_MAX_KEYS`
- `EDGE_RATE_LIMIT_KEY_TTL_SECONDS`
- `EDGE_REQUEST_MAX_BYTES`
- `EDGE_WRITE_REQUEST_MAX_BYTES`
- `EDGE_CORS_ALLOWED_ORIGINS`
- `EDGE_TRUST_CF_CONNECTING_IP`

`staging` and `prod` contract:
- `EDGE_ENFORCEMENT_ENABLED=true`
- `EDGE_PROVIDER=cloudflare`
- `EDGE_CORS_ALLOWED_ORIGINS` must be explicit `https://` origins only
- `EDGE_CORS_ALLOWED_ORIGINS` must not include localhost entries

## RabbitMQ Replay Keys (Non-Secret)
- `RABBIT_REPLAY_PREFETCH_FAST`
- `RABBIT_REPLAY_PREFETCH_HEAVY`
- `RABBIT_EXCHANGE_JOBS_REPLAY`
- `RABBIT_REPLAY_MAX_MESSAGES`
- `RABBIT_REPLAY_RATE_PER_MIN`
- `RABBIT_REPLAY_RETAIN_ATTEMPT`
- `RABBIT_REPLAY_TARGET_EXCHANGE`
- `RABBIT_REPLAY_TARGET_ROUTING_KEY`

Replay tooling rejects legacy names (`MAX_MESSAGES`, `REPLAY_RATE_PER_MIN`, `RETAIN_ATTEMPT`, `TARGET_ROUTING_KEY`) to prevent config drift.
`BANJI_ENV` is required for all replay and cleanup operations.

Worker replay consumption uses:
- `RABBIT_REPLAY_PREFETCH_FAST`
- `RABBIT_REPLAY_PREFETCH_HEAVY`

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
