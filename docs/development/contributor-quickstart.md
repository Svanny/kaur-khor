# Contributor Quickstart

Back to the docs index: [Kaur Khor developer docs](../README.md)

## What Kaur Khor Is

Kaur Khor is a desktop-first Electron app for local inventory work. The primary development loop is a local Electron shell, a React renderer, and a bundled Rust desktop runtime that persists workspace data on-device.

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
pnpm build
cargo test --manifest-path apps/desktop-core/Cargo.toml
cargo test --manifest-path apps/sena-core/Cargo.toml
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

1. [Desktop runtime and local data](desktop-runtime-and-local-data.md)
2. [Automation workspace](automation-workspace.md)
3. [Analysis workspace and exports](analysis-workspace-and-exports.md)
4. [UI design system](ui-design-system.md)
5. [Security standards](../security/SECURITY_STANDARDS.md)
6. [User guide](../user-guide.md)

## Typical Change Paths

For renderer or settings work:

- start in `src/renderer/src/routes`
- inspect shared UI contracts in `src/shared`
- inspect IPC handlers in `src/main/index.ts`

For desktop-local data changes:

- start in `src/main/index.ts`
- inspect backup and restore behavior in `src/main/local-backup.ts`
- inspect preference persistence in `src/main/preferences.ts`
- inspect automation state and Telegram orchestration in `src/main/automation-store.ts` and `src/main/automation-telegram.ts`

For SENA analysis changes:

- inspect `apps/sena-core`
- inspect the renderer screens under `src/renderer/src/routes`
- inspect settings/export helpers in `src/renderer/src/lib/settings-workspace-actions.ts`

## Tests and Checks

Primary contributor checks:

- `pnpm test`
- `pnpm build`
- `cargo test --manifest-path apps/desktop-core/Cargo.toml`
- `cargo test --manifest-path apps/sena-core/Cargo.toml`

Security gate:

- `bash tool/security/run_security_checks.sh`

## When To Update Docs

Update `docs/` when you change:

- contributor setup or local commands
- IPC surfaces that change how the desktop app behaves
- local workspace storage, backup, restore, or clear-data behavior
- automation transport, staging, exposure, or promotion behavior
- SENA export shapes or settings flows
- security gate expectations or user-visible product behavior

## Generated Output Boundary

TypeScript source files are the reviewed surface. Do not commit compiled
`.js` or `.d.ts` siblings emitted beside `src/` files; those are build
artifacts and are ignored. The node and web TypeScript configs keep `noEmit`
enabled so type-check style commands do not recreate source-adjacent outputs.
