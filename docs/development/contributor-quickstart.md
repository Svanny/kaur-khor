# Contributor Quickstart

Back to the docs index: [banji developer docs](/Users/svanny/banji/docs/README.md)

## What banji Is

banji is a desktop-first Electron app for local inventory work. The primary development loop is a local Electron shell, a React renderer, and a bundled Rust desktop runtime that persists workspace data on-device.

## Environment Setup

Install:

- Node.js 20+
- `pnpm`
- Rust toolchain

Main commands:

```bash
pnpm install
pnpm dev
pnpm test
cargo test --manifest-path apps/desktop-core/Cargo.toml
```

Packaging commands:

```bash
pnpm package:mac
pnpm package:linux
pnpm package:win:native
```

## Repo Shape

The paths that matter most during normal contributor work:

- `src/main`
  Electron main process. This is where app boot, IPC handlers, desktop-local file paths, backup/restore, and runtime orchestration live.
- `src/preload`
  Narrow bridge between Electron main and the React renderer.
- `src/renderer`
  React UI, route-level screens, settings flows, shared workspace components, command palette, and translations.
- `src/shared`
  TypeScript source of truth for IPC contracts and shared data types.
- `apps/desktop-core`
  Rust runtime used by the desktop app for local storage and core workflows.
- `apps/sena-core`
  Rust SENA analysis engine.
- `tool/security`
  Security gate and platform-hardening checks.
- `tool/sync_design_tokens.sh`
  Design-token sync helper for the renderer.

## Day-One Reading Order

1. [Desktop runtime and local data](/Users/svanny/banji/docs/development/desktop-runtime-and-local-data.md)
2. [Analysis workspace and exports](/Users/svanny/banji/docs/development/analysis-workspace-and-exports.md)
3. [UI design system](/Users/svanny/banji/docs/development/ui-design-system.md)
4. [Security standards](/Users/svanny/banji/docs/security/SECURITY_STANDARDS.md)
5. [User guide](/Users/svanny/banji/docs/user-guide.md)

## Typical Change Paths

For renderer or settings work:

- start in `src/renderer/src/routes`
- inspect shared UI contracts in `src/shared`
- inspect IPC handlers in `src/main/index.ts`

For desktop-local data changes:

- start in `src/main/index.ts`
- inspect backup and restore behavior in `src/main/local-backup.ts`
- inspect preference persistence in `src/main/preferences.ts`

For SENA analysis changes:

- inspect `apps/sena-core`
- inspect the renderer screens under `src/renderer/src/routes`
- inspect settings/export helpers in `src/renderer/src/lib/settings-workspace-actions.ts`

## Tests and Checks

Primary contributor checks:

- `pnpm test`
- `cargo test --manifest-path apps/desktop-core/Cargo.toml`

Security gate:

- `bash tool/security/run_security_checks.sh`

## When To Update Docs

Update `docs/` when you change:

- contributor setup or local commands
- IPC surfaces that change how the desktop app behaves
- local workspace storage, backup, restore, or clear-data behavior
- SENA export shapes or settings flows
- security gate expectations or user-visible product behavior
