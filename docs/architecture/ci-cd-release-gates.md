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

## Redis Correctness Contract
- Redis outages must not block correctness or write completion.
- Correctness idempotency enforcement is Postgres-backed (`app.idempotency_request`), not Redis-backed.
- Redis is fail-open and fail-fast, with circuit-breaking and timeout controls.

## Event Log Current-Fix Contract
- Kafka is optional/future; current event stream transport is Postgres `app.event_log`.
- Event publish must occur in the same transaction as canonical write/idempotency completion.
- Event insertion is deterministic under retries via `(producer_service, idempotency_key)` dedupe rule.
- Consumer lag is stream-scoped and must not use global max event id across streams.
