# Environment Template Policy

Files in this folder are tracked templates for `dev`, `staging`, and `prod`.

## Rules
- Tracked templates must not contain real credentials or tokens.
- Secret-valued keys may only be `__SET_IN_PLATFORM_SECRET__` or empty when explicitly documented as optional.
- Runtime secret values come from Railway service variables or another platform secret store.
- CI/deploy secret values come from GitHub Environment secrets.
- Railway is the only tracked deployment/runtime platform contract in this repo.

## Secret Keys
- `DATABASE_RUNTIME_URL`
- `RESTORE_DATABASE_URL`
- `DATABASE_MIGRATION_URL`
- `REDIS_URL`
- `RABBIT_URL`
- `RABBIT_MANAGEMENT_USERNAME`
- `RABBIT_MANAGEMENT_PASSWORD`
- `OBJECT_STORAGE_ACCESS_KEY`
- `OBJECT_STORAGE_SECRET_KEY`
- `ALGORITHM_ROLLOUT_HASH_SALT`
- `OTEL_HEADERS`
- `OTEL_EXPORTER_OTLP_HEADERS`
- `EDGE_ORIGIN_AUTH_SECRET`
- `EDGE_ORIGIN_AUTH_SECRET_NEXT`
- service integration keys such as `STRIPE_API_KEY` or `SENDGRID_API_KEY`

## Railway Runtime Startup
- Railway deploys the Rust service from `apps/api`.
- GitHub Actions syncs managed Railway service variables before each deploy and uploads `apps/api` with `railway up`.
- [`apps/api/railway.toml`](/Users/svanny/banji/apps/api/railway.toml) is the tracked build/start contract.
- [`apps/api/start.sh`](/Users/svanny/banji/apps/api/start.sh) is the shared runtime entrypoint for all Railway roles.
- `start.sh` maps Railway `PORT` to `API_BIND_ADDR` only for `APP_ROLE=api`.
- `BANJI_SERVICE` defaults to `APP_ROLE` when not explicitly set.

## Role Topology
- `APP_ROLE=api|event-relay|projection-consumer|worker|backfill-controller`
- `api` is the only HTTP role.
- `event-relay`, `projection-consumer`, and `worker` are Railway runtime roles, not separate platform-owned processes.
- `backfill-controller` is an on-demand operational role.

## Least-Privilege Access Matrix
- `api`: `DATABASE_RUNTIME_URL`, optional `REDIS_URL`, optional `RABBIT_URL`, auth config, edge runtime config, optional telemetry auth
- `event-relay`: `DATABASE_RUNTIME_URL`, optional telemetry auth
- `projection-consumer`: `DATABASE_RUNTIME_URL`, projection-consumer config, optional telemetry auth
- `worker`: `DATABASE_RUNTIME_URL`, `RABBIT_URL`, object-storage config and secrets, rollout salt, optional telemetry auth
- `backfill-controller`: `DATABASE_RUNTIME_URL` for primary runs and `RESTORE_DATABASE_URL` for restore validation runs

Runtime services must not receive `DATABASE_MIGRATION_URL`.

## Core Non-Secret Runtime Keys
- `BANJI_INSTANCE_ID`
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
- `RABBIT_MANAGEMENT_API_BASE_URL`
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
- `ALGORITHM_ROLLOUT_HASH_SALT_VERSION`
- `OBJECT_STORAGE_ENABLED`
- `OBJECT_STORAGE_ENDPOINT`
- `OBJECT_STORAGE_REGION`
- `OBJECT_STORAGE_BUCKET_ARTIFACTS`
- `OBJECT_STORAGE_FORCE_PATH_STYLE`
- `OBJECT_STORAGE_ARTIFACT_PREFIX`
- `OBJECT_STORAGE_ARTIFACT_RETENTION_DAYS`
- `OBJECT_STORAGE_CONNECT_TIMEOUT_MS`
- `OBJECT_STORAGE_REQUEST_TIMEOUT_MS`
- `OBJECT_STORAGE_MAX_ARTIFACT_BYTES`
- `ARTIFACT_TMP_DIR`
- `OBSERVABILITY_RABBIT_QUEUE_POLL_INTERVAL_MS`
- `OBSERVABILITY_POSTGRES_LOCK_POLL_INTERVAL_MS`
- `OBSERVABILITY_JOB_PRESSURE_POLL_INTERVAL_MS`

## Edge Runtime Keys
- `EDGE_ENFORCEMENT_ENABLED`
- `EDGE_ORIGIN_AUTH_HEADER_NAME`
- `EDGE_RATE_LIMIT_ENABLED`
- `EDGE_RATE_LIMIT_WINDOW_SECONDS`
- `EDGE_RATE_LIMIT_READ_MAX`
- `EDGE_RATE_LIMIT_USER_READ_MAX`
- `EDGE_RATE_LIMIT_USER_WRITE_MAX`
- `EDGE_RATE_LIMIT_DEVICE_READ_MAX`
- `EDGE_RATE_LIMIT_DEVICE_WRITE_MAX`
- `EDGE_RATE_LIMIT_FALLBACK_MAX_KEYS`
- `EDGE_RATE_LIMIT_KEY_TTL_SECONDS`
- `EDGE_RATE_LIMIT_REDIS_PREFIX`
- `EDGE_RATE_LIMIT_FAILOVER_ENABLED`
- `EDGE_BACKPRESSURE_ENABLED`
- `EDGE_BACKPRESSURE_POLL_INTERVAL_MS`
- `EDGE_BACKPRESSURE_RETRY_AFTER_SECONDS`
- `EDGE_BACKPRESSURE_CONSECUTIVE_UNHEALTHY`
- `EDGE_BACKPRESSURE_CONSECUTIVE_HEALTHY`
- `EDGE_BACKPRESSURE_JOB_OUTBOX_PENDING_MAX`
- `EDGE_BACKPRESSURE_JOB_OUTBOX_OLDEST_AGE_SECONDS_MAX`
- `EDGE_BACKPRESSURE_JOB_RUN_PENDING_MAX`
- `EDGE_BACKPRESSURE_JOB_RUN_OLDEST_AGE_SECONDS_MAX`
- `EDGE_BACKPRESSURE_KAFKA_PENDING_MAX`
- `EDGE_BACKPRESSURE_KAFKA_OLDEST_AGE_SECONDS_MAX`
- `EDGE_REQUEST_MAX_BYTES`
- `EDGE_WRITE_REQUEST_MAX_BYTES`
- `EDGE_CORS_ALLOWED_ORIGINS`
- `EDGE_TRUST_FORWARDED_CLIENT_IP`

## Environment Contracts
`staging` and `prod` must use:
- `DATABASE_RUNTIME_ENDPOINT_KIND=pgbouncer`
- `PGBOUNCER_POOL_MODE=transaction`
- `AUTH_ENABLED=true`
- `AUTH_JWKS_URL`, `AUTH_ISSUER`, and `AUTH_AUDIENCE`
- `EDGE_ENFORCEMENT_ENABLED=true`
- `EDGE_ORIGIN_AUTH_SECRET`
- explicit `EDGE_CORS_ALLOWED_ORIGINS` entries that start with `https://`

`EDGE_TRUST_FORWARDED_CLIENT_IP` is optional and defaults to `false` in every environment.

## Route Contract
- `/v1/*` requests require `x-banji-device-id` except `OPTIONS`.
- `x-banji-device-id` is a client-generated app installation identifier, not a hardware identifier.
- When `APP_ROLE=api`, `AUTH_ENABLED=false` is supported only in `dev`.

## Worker Artifact Storage
- Worker artifacts use S3-compatible object storage and PostgreSQL stores metadata only.
- `OBJECT_STORAGE_BUCKET_ARTIFACTS` must exist before worker startup.
- The configured artifact prefix must have an external lifecycle rule that expires objects after `OBJECT_STORAGE_ARTIFACT_RETENTION_DAYS`.
- `bucket_name + object_key` is the authoritative object identity.
