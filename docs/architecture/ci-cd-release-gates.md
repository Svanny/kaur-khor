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
- Build and publish `ghcr.io/svanny/banji-api:<commit_sha>`
- Publish rolling trace tag `ghcr.io/svanny/banji-api:main-<run_number>`
- Resolve and record immutable digest
- Upload `build-metadata.json` containing commit SHA, run ID, image digest/ref, migration checksum

## Deployment Policy
- Deploy exact digest (`ghcr.io/...@sha256:...`), never moving tags.
- Promotion flow: staging then approved production.
- One deployment at a time per environment via workflow concurrency.
- Migration is a required pre-rollout step in each environment (`sqlx migrate run`).
- Deploy sequencing is explicit and mandatory:
  1. run migrations (single runner with advisory lock)
  2. deploy API image
  3. finalize traffic shift
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
- Service must deploy from external GHCR image, not build-from-repo.
- Service image must be pinned by digest.
- If GHCR image is private, Railway must have valid registry pull credentials.

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
- Runtime DB pooling preflight in `staging` and `prod` must assert:
  - `DATABASE_RUNTIME_ENDPOINT_KIND=pgbouncer`
  - `PGBOUNCER_POOL_MODE=transaction`
- If `OTEL_ENABLED=true`, deploy preflight must require:
  - `OTEL_EXPORTER_OTLP_ENDPOINT`
  - `OTEL_EXPORTER_OTLP_HEADERS`

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

## Redis Correctness Contract
- Redis outages must not block correctness or write completion.
- Correctness idempotency enforcement is Postgres-backed (`app.idempotency_request`), not Redis-backed.
- Redis is fail-open and fail-fast, with circuit-breaking and timeout controls.

## Event Log Current-Fix Contract
- Kafka is optional/future; current event stream transport is Postgres `app.event_log`.
- Event publish must occur in the same transaction as canonical write/idempotency completion.
- Event insertion is deterministic under retries via `(producer_service, idempotency_key)` dedupe rule.
- Consumer lag is stream-scoped and must not use global max event id across streams.
- Replay order contract is `ORDER BY id ASC`.
- Retention/export/prune maintenance uses id watermarks, stream advisory locks, and manifest verification gates (rowcount + size/hash).
- Event-log maintenance workflow exists as a disabled template (`event-log-maintenance.yml.disabled`) until explicitly enabled.
- Operational runtime logs are platform-sink first (Railway/log drain); Postgres event stream is for audit/replay, not primary operational log sink.

## RabbitMQ Reliability Contract
- RabbitMQ is the current async job transport.
- Postgres `app.job_outbox` is canonical enqueue intent; relay publishes with confirms.
- Publish confirms are mandatory before acknowledging original messages on retry/DLQ republish.
- Worker ack contract: acknowledge only after side effects are committed and confirmed handoff is complete.
