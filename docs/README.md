# Kaur Khor Developer Docs

This directory is the contributor-facing entrypoint for Kaur Khor as a local Electron app. It documents the desktop runtime, local workspace data, automation and SENA flows, security expectations, and the product behavior exposed in the app itself.

## Start Here

- [Contributor quickstart](development/contributor-quickstart.md)
- [Desktop runtime and local data](development/desktop-runtime-and-local-data.md)
- [Browser app](browser-app.md)
- [Install guide](install-guide.md)
- [Web runtime and OPFS](development/web-runtime-and-opfs.md)
- [GitHub Pages](development/github-pages.md)
- [Automation workspace](development/automation-workspace.md)
- [Ticketing architecture](development/ticketing-architecture.md)
- [Intent-first UI overhaul](development/intent-first-ui-overhaul.md)
- [UI design system](development/ui-design-system.md)
- [Analysis workspace and exports](development/analysis-workspace-and-exports.md)
- [Startup architecture](development/startup-architecture.mmd)
- [Startup flowchart](development/startup-flowchart.mmd)
- [Navigation architecture](development/navigation-architecture.mmd)
- [Navigation flowchart](development/navigation-flowchart.mmd)
- [User decision tree markmap source](development/user-decision-tree.markmap.md)
- [User decision tree interactive markmap](development/user-decision-tree.markmap.html)
- [Overview architecture](development/overview-architecture.mmd)
- [Overview flowchart](development/overview-flowchart.mmd)
- [Automations architecture](development/automations-architecture.mmd)
- [Automations flowchart](development/automations-flowchart.mmd)
- [Capture architecture](development/record-update-architecture.mmd)
- [Capture flowchart](development/record-update-flowchart.mmd)
- [Detail pages architecture](development/detail-pages-architecture.mmd)
- [Detail pages flowchart](development/detail-pages-flowchart.mmd)
- [Stability architecture](development/stability-architecture.mmd)
- [Stability flowchart](development/stability-flowchart.mmd)
- [Benchmark guide](../bench/README.md)

## Repo Map

Kaur Khor is a desktop-first Electron app with a local Rust runtime:

- `src/main`: Electron main-process boot, IPC handlers, local data paths, desktop backup/restore flow
- `src/preload`: preload bridge exposed to the renderer
- `src/renderer`: React UI, routes, command palette, settings flows, automation workspace, exported workspace actions
- `src/renderer/src/routes/web`: GitHub Pages public routes and browser-app mounting shell
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
pnpm build
pnpm run build:web
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

- [Contributor quickstart](development/contributor-quickstart.md): environment setup, repo shape, and day-one workflow
- [Desktop runtime and local data](development/desktop-runtime-and-local-data.md): Electron layers, user data paths, automation storage, backup snapshots, restore, and clear-data behavior
- [Browser app](browser-app.md): public browser routes, demo behavior, and browser storage warnings
- [Install guide](install-guide.md): release downloads, checksum verification, and safe unsigned-build launch flows
- [Web runtime and OPFS](development/web-runtime-and-opfs.md): browser entrypoint, HashRouter boundary, runtime bridge, and OPFS expectations
- [GitHub Pages](development/github-pages.md): Pages workflow, build output, SPA fallback, and `/kaur-khor/` route contract
- [Automation workspace](development/automation-workspace.md): Telegram transport, automation staging store, route sections, promotion flow, and focused verification commands
- [Ticketing architecture](development/ticketing-architecture.md): ticket event model, Work capture authoring contract, Work queue behavior, and downstream projections
- [Intent-first UI overhaul](development/intent-first-ui-overhaul.md): canonical Home, Work, Products, Insights, Settings IA and legacy redirect boundaries
- [UI design system](development/ui-design-system.md): brand rules for renderer UI controls, including strict button icon requirements
- [Analysis workspace and exports](development/analysis-workspace-and-exports.md): SENA runtime surfaces, cached reads, settings actions, and export formats
- [Startup architecture](development/startup-architecture.mmd): boot sequence, compact startup workspace IPC, read-worker pool, and startup benchmark targets
- [Startup flowchart](development/startup-flowchart.mmd): control/data-flow map for startup, cache validation, route-scoped deferred reads, and benchmark summaries
- [Navigation architecture](development/navigation-architecture.mmd): benchmark route-click sequence, route readiness, IPC/cache behavior, and navigation summary generation
- [Navigation flowchart](development/navigation-flowchart.mmd): post-startup route flow, automation and financials navigation, read-pool readiness, route-scoped support reads, and navigation benchmark targets
- [User decision tree markmap source](development/user-decision-tree.markmap.md): editable Markmap Markdown hierarchy for user intent ranking, workflows, and the simplified app IA target
- [User decision tree interactive markmap](development/user-decision-tree.markmap.html): offline interactive Markmap render generated with `pnpm run markmap:user-decision-tree`
- [Overview architecture](development/overview-architecture.mmd): dashboard overview route architecture for supplier and customer queues, drawer flows, detail hydration, order-batch reads, and overview benchmark targets
- [Overview flowchart](development/overview-flowchart.mmd): overview benchmark control/data flow for workflow toggles, drawers, model builders, and summary targets
- [Automations architecture](development/automations-architecture.mmd): automation seed, connection, products exposure, live intake, drawer, exceptions, and target metrics
- [Automations flowchart](development/automations-flowchart.mmd): automations benchmark control/data flow across tabs, intake drawer reads, and queue metrics
- [Capture architecture](development/record-update-architecture.mmd): hub lane navigation, ticket-backed prompts, stock count save, supplier receipt save, and ticket mutations
- [Capture flowchart](development/record-update-flowchart.mmd): capture benchmark control/data flow for lane opens, saves, Work readiness, and memory snapshots
- [Detail pages architecture](development/detail-pages-architecture.mmd): products target selection, SKU/service first and repeat detail loads, cache behavior, and memory metrics
- [Detail pages flowchart](development/detail-pages-flowchart.mmd): detail-pages benchmark control/data flow for products, SKU, service, repeat loads, and cache reads
- [Stability architecture](development/stability-architecture.mmd): repeated sidebar cycle, ready-event coverage, shared route reads, and memory-slope inputs
- [Stability flowchart](development/stability-flowchart.mmd): stability benchmark control/data flow across four route cycles and memory snapshots
- [Benchmark guide](../bench/README.md): scenario commands, fixture sizes, deterministic seed rules, and tiered target budgets

### Security

- [Security standards](security/SECURITY_STANDARDS.md)
- [Security test matrix](security/SECURITY_TEST_MATRIX.md)
- [Threat model](security/THREAT_MODEL.md)

### Product Reference

- [User guide (English)](user-guide.md)
- [User guide (Khmer)](user-guide.km.md)

The Kaur Khor in-app `Help` page is sourced from these product-reference guides and should stay aligned with them.

## Reading Order

If you are new to the repo, read the docs in this order:

1. [Contributor quickstart](development/contributor-quickstart.md)
2. [Desktop runtime and local data](development/desktop-runtime-and-local-data.md)
3. [Automation workspace](development/automation-workspace.md)
4. [Ticketing architecture](development/ticketing-architecture.md)
5. [UI design system](development/ui-design-system.md)
6. [Analysis workspace and exports](development/analysis-workspace-and-exports.md)
7. [Security standards](security/SECURITY_STANDARDS.md)
8. [User guide (English)](user-guide.md)
