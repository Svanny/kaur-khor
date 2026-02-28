# CI/CD and Release Gates (Rust Backend)

## Scope
This document defines required merge gates, artifact traceability rules, migration enforcement, and deployment promotion for the Rust backend under `apps/api`.

## Required PR Checks
Branch protection on `main` must require:
- `rust-ci / fmt`
- `rust-ci / clippy`
- `rust-ci / test`
- `rust-ci / build`
- `rust-ci / migration-validate`
- `rust-ci / container-build-check`

`release-build` is post-merge and must not be a PR merge gate.

## Artifact Policy
Each merge to `main` must:
- Produce a repo state that Railway can build from the `apps/api` service root
- Keep the Rust release build command stable:
  - `cargo build --release`
- Keep deployment entrypoint configuration under version control:
  - [`apps/api/railway.toml`](/Users/svanny/banji/apps/api/railway.toml)
  - [`apps/api/start.sh`](/Users/svanny/banji/apps/api/start.sh)
- Upload `build-metadata.json` only if a future CI release flow is re-enabled for traceability

## Deployment Policy
- Deploy from the connected repository via Railway Railpack config-as-code.
- Promotion flow: staging then approved production.
- One deployment at a time per environment via workflow concurrency.
- Migration is a required pre-rollout step in each environment (`sqlx migrate run`).
- `staging` and `prod` must each deploy the same runtime role set:
  - `api`
  - `event-relay`
  - `projection-consumer`
  - `worker`
- Every role in an environment must run the same deployed revision.
- Deploy sequencing is explicit and mandatory:
  1. run migrations (single runner with advisory lock)
  2. deploy `event-relay`
  3. deploy `projection-consumer`
  4. deploy `worker`
  5. deploy `api`
  6. verify same-revision parity across roles
  7. finalize traffic shift
- If migrations fail or do not run, deployment must abort before rollout.

## Database and Migration Safety
- Credentials are split:
  - `DATABASE_MIGRATION_URL`: schema-change privileges
  - `DATABASE_RUNTIME_URL`: least privilege runtime access
- Migrations use advisory lock to avoid concurrent runners.
- Expand/contract release discipline is mandatory:
  - additive, backward-compatible changes first
  - destructive/tightening changes only after code cutover in later release
- Long-running migration safety rules:
  - use low-blocking index creation patterns where supported
  - run large backfills as controlled background jobs, not inside deploy-time migration
  - split risky changes across schema introduction, backfill, and later constraint tighten/drop

## SQLx Policy
- SQLx offline mode is enforced with committed `apps/api/sqlx-data.json`.
- CI verifies metadata freshness via `cargo sqlx prepare --check`.

## Railway Deployment Requirements
For each deployable Railway service:
- Service must deploy from the connected repository via Railpack config-as-code.
- Service root must be `apps/api` so Railpack provisions the Rust toolchain from the detected service source.
- Build command must remain:
  - `cargo build --release`
- Start command must remain:
  - `./start.sh`
- `start.sh` must translate Railway `PORT` into `API_BIND_ADDR` for `APP_ROLE=api`.
- Non-HTTP roles (`event-relay`, `projection-consumer`, `worker`) must share the same `start.sh` without synthesizing `API_BIND_ADDR`.
- [`apps/api/Dockerfile`](/Users/svanny/banji/apps/api/Dockerfile) is retained for legacy/local-only use and is no longer the Railway deployment contract.
- API image builds in GitHub Actions should use Docker buildx with `apps/api` as the context and persistent GHA cache scopes for release and PR validation paths.
- Docker dependency caching uses `cargo-chef` inside [`apps/api/Dockerfile`](/Users/svanny/banji/apps/api/Dockerfile) and GitHub Actions `type=gha` cache backends in CI.

## Additional Hardening
- Workflows use explicit permissions with least privilege.
- Actions are pinned to commit SHAs.
- Cargo dependency/cache reuse is enabled.
- Wall-tier gates are implemented as non-blocking signals:
  - `cargo audit` in `rust-ci`
  - container vulnerability scan (`trivy`) in `release-build`

## Secrets and Config Gates
- Secret scan (`tool/security/check_secret_patterns.sh`) is a required CI gate.
- Tracked env templates may only use approved secret placeholders (`__SET_IN_PLATFORM_SECRET__`) for secret keys.
- Deploy preflight must assert required deploy secrets are present.
- `DATABASE_MIGRATION_URL` is scoped to migration step only and must not be injected into runtime service environments.
- Runtime and migration database credentials must remain distinct.
- Runtime auth preflight in `staging` and `prod` must assert:
  - `AUTH_ENABLED=true`
  - `AUTH_JWKS_URL`
  - `AUTH_ISSUER`
  - `AUTH_AUDIENCE`
- Runtime DB pooling preflight in `staging` and `prod` must assert:
  - `DATABASE_RUNTIME_ENDPOINT_KIND=pgbouncer`
  - `PGBOUNCER_POOL_MODE=transaction`
- If `OTEL_ENABLED=true`, deploy preflight must require:
  - `OTEL_EXPORTER_OTLP_ENDPOINT`
  - `OTEL_EXPORTER_OTLP_HEADERS`
- Edge preflight in `staging` and `prod` must assert:
  - `EDGE_ENFORCEMENT_ENABLED=true`
  - `EDGE_PROVIDER=cloudflare`
  - `EDGE_ORIGIN_AUTH_HEADER_NAME` is present
  - `EDGE_ORIGIN_AUTH_SECRET` is present
  - `EDGE_CORS_ALLOWED_ORIGINS` is present
  - `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ZONE_ID` are present for verification
- Deploy preflight must run `tool/edge/cloudflare_verify.sh` against the target environment fingerprint.
- Deploy preflight must run `tool/ci/check_topology_parity.sh` and fail on role-set drift or duplicated Railway service ids.
- Railway runtime configuration for each service must still satisfy:
  - `APP_ROLE`
  - `BANJI_SERVICE`
  - `DATABASE_RUNTIME_ENDPOINT_KIND`
  - `PGBOUNCER_POOL_MODE`
  - `EDGE_ENFORCEMENT_ENABLED`
  - `EDGE_PROVIDER`
  - `EDGE_ORIGIN_AUTH_HEADER_NAME`
  - `EDGE_CORS_ALLOWED_ORIGINS`
- Deploy must also enforce role-specific forbidden variables so least-privilege secrets are not sprayed across services.
- If a future deploy automation reintroduces image or runtime mutation, it must fail closed when Railway runtime values cannot be read or differ from expected deploy inputs.

## Runtime Readiness and Drain Contract
- Runtime startup must:
  1. build SQLx pool
  2. run DB warmup query (`SELECT 1`)
  3. accept traffic only after warmup success
- Runtime shutdown must:
  1. stop accepting new requests
  2. drain in-flight requests
  3. close SQLx pool
  4. exit

## Edge Runtime Contract
- In `staging` and `prod`, API ingress must be edge-enforced via Cloudflare front door.
- Middleware order is locked:
  - origin guard -> request size limit -> rate limit -> CORS -> observability -> handlers
- Origin guard must accept current and next auth secret during rotation.
- Forwarded client IP trust (`CF-Connecting-IP`) is valid only when origin guard passed.
- Rate-limiter key must use matched route template, never raw path/query.
- Shared API rate limiting uses Redis in normal operation and may degrade to per-instance fallback during Redis incidents when failover is enabled.
- `/v1/*` routes require `x-banji-device-id` except `OPTIONS`; this is an app-install identifier, not a hardware fingerprint.

## Redis Correctness Contract
- Redis outages must not block correctness or write completion.
- Correctness idempotency enforcement is Postgres-backed (`app.idempotency_request`), not Redis-backed.
- Redis is fail-open and fail-fast, with circuit-breaking and timeout controls.
- Idempotency key scope is `(caller_sub, idempotency_key)` and request hash includes method + route + canonical JSON body.

## Event Log Current-Fix Contract
- Kafka is optional/future; current event stream transport is Postgres `app.event_log`.
- Canonical write transactions persist event intent in `app.event_outbox` (not direct `event_log` insert).
- `event-relay` role is the only publisher from `app.event_outbox` to `app.event_log`.
- Event insertion is deterministic under retries via `publish_key` dedupe.
- `publish_key` is derived from `producer_service|event_type|aggregate_type|aggregate_id|causation_id`.
- Event vocabulary and schema are code-authoritative and full-record validated (envelope + payload) before outbox enqueue and before relay publish.
- Payload schema changes require explicit `event_version` increment; silent shape drift is forbidden.
- Consumer lag is stream-scoped and must not use global max event id across streams.
- Replay order contract is `ORDER BY id ASC`.
- Retention/export/prune maintenance uses id watermarks, stream advisory locks, and manifest verification gates (rowcount + size/hash).
- Event-log maintenance workflow is defined in `.github/workflows/event-log-maintenance.yml`.
- Operational runtime logs are platform-sink first (Railway/log drain); Postgres event stream is for audit/replay, not primary operational log sink.

## RabbitMQ Reliability Contract
- RabbitMQ is the current async job transport.
- Postgres `app.job_outbox` is canonical enqueue intent; relay publishes with confirms.
- Producers must also create `app.job_run` in the same transaction as `app.job_outbox`.
- Publish confirms are mandatory before acknowledging original messages on retry/DLQ republish.
- Worker ack contract: acknowledge only after side effects are committed and confirmed handoff is complete.
- Retry/poison behavior is deterministic:
  - attempt is envelope-owned and increments only on code routing decisions
  - permanent errors route directly to DLQ
  - transient errors follow retry ladder and terminate at DLQ ceiling
- DLQ replay is copy-first and operator-audited; destructive cleanup is a separate explicit step.
- Worker startup contract:
  - `APP_ROLE=worker` requires `DATABASE_RUNTIME_URL`, `RABBIT_URL`, and object-storage config/secrets
  - `ALGORITHM_ROLLOUT_HASH_SALT` and `ALGORITHM_ROLLOUT_HASH_SALT_VERSION` are required in `staging` and `prod`
  - `JOB_RESULT_KAFKA_ENABLED=true` must fail startup until a future Kafka publisher milestone exists
- Replay queue consumers must use `RABBIT_REPLAY_PREFETCH_FAST` / `RABBIT_REPLAY_PREFETCH_HEAVY`, not the primary queue prefetch values.
- API backpressure must reject new async-producing writes with `503` + `Retry-After` before opening DB transactions when sampled outbox/run pressure breaches thresholds.

## Object Storage Artifact Contract
- Worker artifact storage is S3-compatible and metadata-only from Postgres.
- Deploy preflight for worker services must assert:
  - `OBJECT_STORAGE_ENABLED=true`
  - `OBJECT_STORAGE_ENDPOINT`
  - `OBJECT_STORAGE_REGION`
  - `OBJECT_STORAGE_BUCKET_ARTIFACTS`
  - `OBJECT_STORAGE_ACCESS_KEY`
  - `OBJECT_STORAGE_SECRET_KEY`
  - `ARTIFACT_TMP_DIR`
- Bucket provisioning is external and must exist before deploy.
- The configured artifact prefix must have a lifecycle rule that expires objects after `OBJECT_STORAGE_ARTIFACT_RETENTION_DAYS`.
