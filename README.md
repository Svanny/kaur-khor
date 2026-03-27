# Banji

Banji is an inventory platform prototype with:
- A macOS-first Electron desktop app (`desktop/`) built with Vite, React, and TypeScript.
- A Rust API workstream (`apps/api`) implementing backend contracts plus desktop-focused local inventory APIs.
- The legacy Flutter app retained temporarily as a migration reference.

## What Is Implemented

- Electron desktop shell that starts and stops the Rust API as a managed local subprocess.
- Dashboard shell with key metrics, current ranking, and local runtime status.
- Inventory list with filtering, search, and add/edit flows for SKUs and services.
- SKU and Service editors with validation and SKU-linking for services.
- Local stock update flow backed by Rust desktop API mutations.
- Product ranking flow backed by Rust desktop API persistence.
- App settings for language (English, Khmer) and currency (USD, KHR).
- Security utilities for input normalization/validation and opaque ID generation.

## Tech Stack

- Frontend:
  - Electron
  - Vite
  - React
  - TypeScript
- Backend:
  - Rust (`axum`, `sqlx`, `tokio`)
  - PostgreSQL
  - Redis (optional cache/coordination)
  - RabbitMQ (jobs; outbox relay pattern)

## Project Structure

- `desktop/`: Electron main/preload, React renderer, shared desktop types, and desktop tests.
- `desktop/src/main/`: Electron process lifecycle and Rust API bootstrap logic.
- `desktop/src/renderer/src/`: React routes, desktop state providers, and UI utilities.
- `desktop/resources/mac/`: canonical macOS icon source plus generated Dock and `.icns` assets.
- `tool/security/`: merge-gate security checks.
- `apps/api/`: Rust API service and backend modules.
- `apps/api/src/desktop_inventory/`: local inventory store and desktop CRUD/ranking logic.
- `apps/api/migrations/`: SQLx schema migrations.
- `config/env/`: tracked local environment template and config policy notes.
- `docs/architecture/`: canonical backend contracts and architecture decisions.
- `tool/`: operational scripts for naming, DB operations, and RabbitMQ operations.
- `tool/otel/`: OpenTelemetry collector config for traces/metrics export pipeline.
- `lib/` and `test/`: retained Flutter implementation/reference during migration.

## Root Docs Index

Root markdown files are intentionally prefixed for grouping and stable sorting:

- `README.md`: project overview and usage.
- `SECURITY.md`: security policy and baseline.
- `20_ARCH_backend-process-diagram.md`: backend process diagram notes.
- `30_RISK_banji-threat-model.md`: threat model.
- `30_RISK_ownership-map-fallback.md`: ownership map fallback analysis.
- `30_RISK_security-best-practices-report.md`: security best-practices report.
- `40_PLAN_todo-backend.md`: backend delivery todo and future considerations.

## System Architecture

![Banji System Architecture](SYSTEM_ARCHITECTURE.svg)

Source:
- `SYSTEM_ARCHITECTURE.mmd`

## State and Architecture Notes

- Electron owns window lifecycle, preload IPC, and local Rust API startup/shutdown.
- The React renderer talks to the Rust API over local HTTP.
- Desktop renderer state separates persisted server data from transient form state:
  - preferences provider for language/currency
  - inventory provider for async API-backed inventory snapshot and mutations
- Rust desktop routes:
  - `GET /v1/desktop/inventory`
  - `POST /v1/desktop/skus`
  - `PUT /v1/desktop/skus/:sku_id`
  - `POST /v1/desktop/services`
  - `PUT /v1/desktop/services/:service_id`
  - `POST /v1/desktop/stock-updates`
  - `GET /v1/desktop/ranking`
  - `PUT /v1/desktop/ranking`

## Localization and Currency

- Locales: English (`en`) and Khmer (`km`).
- Currency switch: `USD` / `KHR`.
- Desktop translations live in `desktop/src/renderer/src/lib/translations.ts`.
- Flutter ARB files remain in-repo as migration reference assets.

## Security Baseline

Banji enforces a secure-by-default baseline for this prototype:

- Shared validators for text and numeric inputs.
- Hard limits for inventory and monetary values.
- Opaque non-timestamp IDs via secure randomness.
- Secret scanning and platform hardening checks in the security gate.

Primary references:

- `SECURITY.md`
- `docs/security/SECURITY_STANDARDS.md`
- `docs/security/THREAT_MODEL.md`
- `docs/security/SECURITY_TEST_MATRIX.md`

## Getting Started

### Prerequisites

- Node.js 20+
- `pnpm`
- Rust toolchain
- macOS for the current desktop-first workflow

### Install Dependencies

```bash
pnpm --dir desktop install
```

### Run

```bash
pnpm --dir desktop dev
```

The Electron main process will:

- boot the renderer
- start the Rust API locally
- wait for `/health`
- expose the resolved API base URL to the renderer through preload IPC

Regenerate macOS icon assets when the desktop icon changes:

```bash
pnpm --dir desktop build:icon
```

Flutter remains available as a reference implementation, but Electron is now the primary local app surface.

## Testing

Run desktop tests:

```bash
pnpm --dir desktop test
```

Run desktop-backed Rust API tests:

```bash
cargo test --manifest-path apps/api/Cargo.toml desktop_inventory_endpoints_support_local_crud_and_ranking
```

Legacy Flutter tests are still available during migration:

```bash
flutter test
```

## Security Gate (Pre-Merge)

```bash
bash tool/security/run_security_checks.sh
```

This gate runs:

1. Flutter and Rust checks that remain wired in the repo
2. Desktop unit tests for the new Electron workspace
3. Secret pattern checks
4. Platform hardening checks

## Desktop Design System

- Desktop theme tokens now live in [`desktop/src/renderer/src/globals.css`](/Users/svanny/banji/desktop/src/renderer/src/globals.css).
- Desktop component and composition guidance now lives in [`desktop/DESIGN_SYSTEM.md`](/Users/svanny/banji/desktop/DESIGN_SYSTEM.md).
- The older Flutter theme source [`lib/theme/app_theme.dart`](/Users/svanny/banji/lib/theme/app_theme.dart) and `tool/sync_design_tokens.sh` remain migration-reference assets, not the active desktop token source.

## Current Status

This repository is an actively evolving prototype.

- Electron is now the primary local UI/runtime path for dashboard, inventory, stock update, ranking, and settings flows.
- The Rust API now exposes desktop-focused local inventory CRUD/ranking endpoints backed by a persisted local JSON store for the desktop app.
- Flutter UI flows remain in-repo as a migration reference and fallback while cleanup is staged.
- Backend architecture and infrastructure contracts are being implemented incrementally in the Rust API workstream.
- Rust API milestone baseline includes JWT-authenticated owner-scoped item APIs (`POST /v1/items`, `GET /v1/items/:item_id`) with Postgres-backed idempotent writes and read-through cache behavior.
- Event delivery now uses Postgres outbox-first intent (`app.event_outbox`) with a dedicated relay role (`APP_ROLE=event-relay`) that publishes idempotently into `app.event_log`.
- Inventory projections now use a dedicated `APP_ROLE=projection-consumer` worker that reads `app.event_log`, updates `app.inventory_item_projection`, and resumes from durable checkpoints with single-instance advisory locking.
- Projection replay is now built into the Rust `projection-consumer` runtime (`continuous`, `replay-preview`, `replay-apply`), while public `GET /v1/items/:item_id` still reads the canonical `app.inventory_item` table.
- Controlled replay/backfill is now available via `APP_ROLE=backfill-controller`, which records preview/apply runs in `app.backfill_run`, supports projection rebuilds from `app.event_log`, and schedules replay-scoped jobs into the Rabbit replay exchange.
- Job execution now uses a dedicated `APP_ROLE=worker` runtime that consumes RabbitMQ deliveries, writes `app.job_run` / `app.job_run_attempt` / `app.job_result` accountability records in Postgres, and enforces deterministic `job_key` identity plus duplicate-delivery-safe attempt leases.
- The Rust backend keeps a single binary with role-based entrypoints: `api`, `event-relay`, `projection-consumer`, `worker`, and `backfill-controller`.
- Worker job algorithms now use Postgres-backed rollout policy keyed by `job_type`, with sticky `job_run.algorithm_version` decisions so retries stay consistent while new jobs can ramp or roll back immediately.
- Worker artifacts now use S3-compatible object storage with deterministic `artifact_key` / object-key derivation, `HEAD`-first idempotent uploads, and Postgres metadata-only tracking in `app.object_artifact` / `app.job_result_artifact`.
- Observability baseline uses OpenTelemetry semantic-convention HTTP metrics, correlation IDs, and a collector-forwarded traces/metrics path.
- Rust API container builds use a multi-stage Dockerfile with `cargo-chef` dependency caching for local containerized runs.
- Postgres restore drill routine is documented in `docs/operations/postgres-restore-drill.md`.
- Postgres event-log lifecycle (retention/archive/replay) is defined via `docs/architecture/postgres-event-log.md` and `docs/operations/postgres-event-log-maintenance.md`.
- Event vocabulary and schema discipline is defined via `docs/architecture/event-vocabulary-schema-discipline.md`.
- Job worker operations are defined via `docs/operations/job-worker-runbook.md`.
- Backfill controller operations are defined via `docs/operations/backfill-runbook.md`.
- Object storage artifact contracts are defined via `docs/architecture/object-storage-artifacts.md` and `docs/operations/object-storage-runbook.md`.
- Edge protection baseline is defined via `docs/architecture/edge-protections.md`.
- Some integration paths remain intentionally staged while contracts and operational tooling are finalized.
