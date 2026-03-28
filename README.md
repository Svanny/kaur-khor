# Banji

Banji is a macOS-first inventory platform prototype with:
- A root Electron app built with Vite, React, and TypeScript.
- A Rust API workstream in `apps/api`.
- A Rust desktop-core runtime in `apps/desktop-core` for local inventory persistence and desktop IPC-backed workflows.

## What Is Implemented

- Electron main/preload/renderer runtime at the repo root.
- Dashboard, catalog, operations, planning, and settings workspaces.
- SKU and service create/edit flows with shared validation and opaque ID generation.
- Local stock update history plus guided update sessions.
- Planning handoff for merchandising/ranking decisions.
- Desktop-backed local persistence and ranking/state management through Rust desktop endpoints.

## Tech Stack

- Frontend: Electron, Vite, React, TypeScript
- Backend/runtime: Rust (`axum`, `sqlx`, `tokio`)
- Data and infra workstreams: PostgreSQL, Redis, RabbitMQ, object storage

## Project Structure

- `src/main/`: Electron lifecycle, desktop-core bootstrap, preferences, and main-process tests
- `src/preload/`: preload bridge exposed to the renderer
- `src/renderer/src/`: routes, state providers, UI primitives, and renderer tests
- `src/shared/`: IPC and desktop inventory types shared across main/preload/renderer
- `resources/mac/`: canonical macOS icon assets
- `apps/api/`: Rust API service and backend modules
- `apps/desktop-core/`: local desktop-core runtime used by Electron
- `tool/security/`: secret scanning and Electron hardening checks
- `docs/`: architecture, operations, and security contracts

## System Architecture

![Banji System Architecture](SYSTEM_ARCHITECTURE.svg)

Source:
- `SYSTEM_ARCHITECTURE.mmd`

## State and Contracts

- Electron owns window lifecycle, preload IPC, and local desktop-core startup/shutdown.
- The renderer uses the `banjiDesktop` preload bridge for inventory and preferences operations.
- Canonical workspace routes:
  - `/`
  - `/catalog`
  - `/catalog/skus/:skuId`
  - `/catalog/services/:serviceId`
  - `/operations`
  - `/operations/session`
  - `/planning`
  - `/settings`
- Legacy `/inventory*` deep links are preserved as redirects during the cutover.
- Rust desktop endpoints remain:
  - `GET /v1/desktop/inventory`
  - `POST /v1/desktop/skus`
  - `PUT /v1/desktop/skus/:sku_id`
  - `POST /v1/desktop/services`
  - `PUT /v1/desktop/services/:service_id`
  - `POST /v1/desktop/stock-reports`
  - `POST /v1/desktop/stock-updates`
  - `GET /v1/desktop/ranking`
  - `PUT /v1/desktop/ranking`
  - `GET /v1/desktop/sist/sku/:sku_id`
  - `PUT /v1/desktop/sist/settings`

## Localization and Currency

- Locales: English (`en`) and Khmer (`km`)
- Currency switch: `USD` / `KHR`
- Desktop translations live in [`src/renderer/src/lib/translations.ts`](/Users/svanny/banji/src/renderer/src/lib/translations.ts)

## Getting Started

### Prerequisites

- Node.js 20+
- `pnpm`
- Rust toolchain
- macOS for the current desktop-first workflow

### Install

```bash
pnpm install
```

### Run

```bash
pnpm dev
```

The Electron main process:
- boots the renderer
- starts the Rust desktop-core locally
- exposes the desktop bridge through preload IPC

### Rebuild macOS icon assets

```bash
pnpm build:icon
```

## Testing

Run the Electron app test suite:

```bash
pnpm test
```

Run desktop-core tests:

```bash
cargo test --manifest-path apps/desktop-core/Cargo.toml
```

Run desktop-backed API tests:

```bash
cargo test --manifest-path apps/api/Cargo.toml desktop_inventory
```

## Security Gate

```bash
bash tool/security/run_security_checks.sh
```

This gate runs:
1. `pnpm test`
2. `cargo test --manifest-path apps/desktop-core/Cargo.toml`
3. secret pattern checks
4. Electron platform hardening checks

## Design System

- Active tokens live in [`src/renderer/src/globals.css`](/Users/svanny/banji/src/renderer/src/globals.css)
- UI primitives live in [`src/renderer/src/components/ui`](/Users/svanny/banji/src/renderer/src/components/ui)
- Banji-specific compositions live in [`src/renderer/src/components/system`](/Users/svanny/banji/src/renderer/src/components/system)
- Reference guide: [`DESIGN_SYSTEM.md`](/Users/svanny/banji/DESIGN_SYSTEM.md)

## Current Status

- Electron is the only maintained app surface in this repository.
- The Rust desktop-core provides local inventory CRUD, stock report history, ranking, and SIST settings persistence for the desktop app.
- Backend architecture and infrastructure contracts continue to evolve in `apps/api` and the operations docs.
