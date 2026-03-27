# Banji Desktop

`desktop/` is the new primary frontend/runtime surface for Banji on macOS.

## What It Does

- Launches an Electron shell with a React + TypeScript renderer.
- Starts the local Rust API automatically on app boot.
- Waits for `GET /health` before marking the desktop app ready.
- Persists inventory, stock updates, and ranking through the Rust API’s local desktop endpoints.
- Stores local inventory state in the Electron user-data directory via `BANJI_DESKTOP_DATA_PATH`.

## Dev Flow

1. Install dependencies:

```bash
pnpm --dir desktop install
```

2. Start the Electron app:

```bash
pnpm --dir desktop dev
```

The Electron main process reads [`config/env/dev.env`](/Users/svanny/banji/config/env/dev.env), strips placeholder secret values, forces a local desktop-safe API posture (`AUTH_ENABLED=false`, `APP_ROLE=api`, local bind address, desktop data path), and then spawns the Rust API with `cargo run --manifest-path apps/api/Cargo.toml`.

Hot reload behavior during `pnpm --dir desktop dev`:
- renderer changes use Vite HMR
- preload changes rebuild and reload the renderer
- main-process changes rebuild and restart the Electron app

## macOS App Icon Pipeline

- Canonical source asset: [`desktop/resources/mac/master-1024.png`](/Users/svanny/banji/desktop/resources/mac/master-1024.png)
- Generated dev Dock assets:
  - [`desktop/resources/mac/icon.png`](/Users/svanny/banji/desktop/resources/mac/icon.png)
  - [`desktop/resources/mac/icon@2x.png`](/Users/svanny/banji/desktop/resources/mac/icon@2x.png)
- Generated packaged asset:
  - [`desktop/resources/mac/banji.icns`](/Users/svanny/banji/desktop/resources/mac/banji.icns)

Rebuild the macOS icon assets with:

```bash
pnpm --dir desktop build:icon
```

Future macOS packaging should point to `desktop/resources/mac/banji.icns`.

## Tests

```bash
pnpm --dir desktop test
```

This runs:
- renderer validation tests
- Electron backend helper tests

## Design System

- Active desktop tokens and theme roles live in [`desktop/src/renderer/src/globals.css`](/Users/svanny/banji/desktop/src/renderer/src/globals.css).
- Reusable desktop UI primitives live in [`desktop/src/renderer/src/components/ui`](/Users/svanny/banji/desktop/src/renderer/src/components/ui).
- Banji-specific compositions live in [`desktop/src/renderer/src/components/system`](/Users/svanny/banji/desktop/src/renderer/src/components/system).
- Reference guide: [`desktop/DESIGN_SYSTEM.md`](/Users/svanny/banji/desktop/DESIGN_SYSTEM.md)

## Notes

- Flutter stays in-repo as a migration reference for now.
- Flutter theme token sync via `lib/theme/app_theme.dart` is now legacy-only reference material for desktop work.
- Packaging is intentionally deferred; the first milestone is local desktop development on macOS.
