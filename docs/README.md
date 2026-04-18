# banji Developer Docs

This directory is the contributor-facing entrypoint for banji as a local Electron app. It documents the desktop runtime, local workspace data, SENA analysis flows, security expectations, and the product behavior exposed in the app itself.

## Start Here

- [Contributor quickstart](/Users/svanny/banji/docs/development/contributor-quickstart.md)
- [Desktop runtime and local data](/Users/svanny/banji/docs/development/desktop-runtime-and-local-data.md)
- [Analysis workspace and exports](/Users/svanny/banji/docs/development/analysis-workspace-and-exports.md)

## Repo Map

banji is a desktop-first Electron app with a local Rust runtime:

- `src/main`: Electron main-process boot, IPC handlers, local data paths, desktop backup/restore flow
- `src/preload`: preload bridge exposed to the renderer
- `src/renderer`: React UI, routes, command palette, settings flows, exported workspace actions
- `src/shared`: IPC contracts and shared TypeScript types
- `apps/desktop-core`: Rust desktop persistence/runtime
- `apps/sena-core`: Rust SENA analysis engine
- `tool/security`: security gate and hardening checks for the desktop app
- `tool/sync_design_tokens.sh`: design-token sync helper for the renderer

## Local Workflow

Core commands:

```bash
pnpm install
pnpm dev
pnpm test
cargo test --manifest-path apps/desktop-core/Cargo.toml
```

Useful packaging commands:

```bash
pnpm package:mac
pnpm package:linux
pnpm package:win:native
```

## Documentation Map

### Development

- [Contributor quickstart](/Users/svanny/banji/docs/development/contributor-quickstart.md): environment setup, repo shape, and day-one workflow
- [Desktop runtime and local data](/Users/svanny/banji/docs/development/desktop-runtime-and-local-data.md): Electron layers, user data paths, backup snapshots, restore, and clear-data behavior
- [Analysis workspace and exports](/Users/svanny/banji/docs/development/analysis-workspace-and-exports.md): SENA runtime surfaces, cached reads, settings actions, and export formats

### Security

- [Security standards](/Users/svanny/banji/docs/security/SECURITY_STANDARDS.md)
- [Security test matrix](/Users/svanny/banji/docs/security/SECURITY_TEST_MATRIX.md)
- [Threat model](/Users/svanny/banji/docs/security/THREAT_MODEL.md)

### Product Reference

- [User guide (English)](/Users/svanny/banji/docs/user-guide.md)
- [User guide (Khmer)](/Users/svanny/banji/docs/user-guide.km.md)

The banji in-app `Help` page is sourced from these product-reference guides and should stay aligned with them.

## Reading Order

If you are new to the repo, read the docs in this order:

1. [Contributor quickstart](/Users/svanny/banji/docs/development/contributor-quickstart.md)
2. [Desktop runtime and local data](/Users/svanny/banji/docs/development/desktop-runtime-and-local-data.md)
3. [Analysis workspace and exports](/Users/svanny/banji/docs/development/analysis-workspace-and-exports.md)
4. [Security standards](/Users/svanny/banji/docs/security/SECURITY_STANDARDS.md)
5. [User guide (English)](/Users/svanny/banji/docs/user-guide.md)
