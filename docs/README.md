# banji Developer Docs

This directory is the contributor-facing entrypoint for banji as a local Electron app. It documents the desktop runtime, local workspace data, automation and SENA flows, security expectations, and the product behavior exposed in the app itself.

## Start Here

- [Contributor quickstart](/Users/svanny/banji/docs/development/contributor-quickstart.md)
- [Desktop runtime and local data](/Users/svanny/banji/docs/development/desktop-runtime-and-local-data.md)
- [Automation workspace](/Users/svanny/banji/docs/development/automation-workspace.md)
- [Ticketing architecture](/Users/svanny/banji/docs/development/ticketing-architecture.md)
- [Intent-first UI overhaul](/Users/svanny/banji/docs/development/intent-first-ui-overhaul.md)
- [UI design system](/Users/svanny/banji/docs/development/ui-design-system.md)
- [Analysis workspace and exports](/Users/svanny/banji/docs/development/analysis-workspace-and-exports.md)
- [Startup architecture](/Users/svanny/banji/docs/development/startup-architecture.mmd)
- [Startup flowchart](/Users/svanny/banji/docs/development/startup-flowchart.mmd)
- [Navigation architecture](/Users/svanny/banji/docs/development/navigation-architecture.mmd)
- [Navigation flowchart](/Users/svanny/banji/docs/development/navigation-flowchart.mmd)
- [User decision tree markmap source](/Users/svanny/banji/docs/development/user-decision-tree.markmap.md)
- [User decision tree interactive markmap](/Users/svanny/banji/docs/development/user-decision-tree.markmap.html)
- [Overview architecture](/Users/svanny/banji/docs/development/overview-architecture.mmd)
- [Overview flowchart](/Users/svanny/banji/docs/development/overview-flowchart.mmd)
- [Automations architecture](/Users/svanny/banji/docs/development/automations-architecture.mmd)
- [Automations flowchart](/Users/svanny/banji/docs/development/automations-flowchart.mmd)
- [Capture architecture](/Users/svanny/banji/docs/development/record-update-architecture.mmd)
- [Capture flowchart](/Users/svanny/banji/docs/development/record-update-flowchart.mmd)
- [Detail pages architecture](/Users/svanny/banji/docs/development/detail-pages-architecture.mmd)
- [Detail pages flowchart](/Users/svanny/banji/docs/development/detail-pages-flowchart.mmd)
- [Stability architecture](/Users/svanny/banji/docs/development/stability-architecture.mmd)
- [Stability flowchart](/Users/svanny/banji/docs/development/stability-flowchart.mmd)
- [Benchmark guide](/Users/svanny/banji/bench/README.md)

## Repo Map

banji is a desktop-first Electron app with a local Rust runtime:

- `src/main`: Electron main-process boot, IPC handlers, local data paths, desktop backup/restore flow
- `src/preload`: preload bridge exposed to the renderer
- `src/renderer`: React UI, routes, command palette, settings flows, automation workspace, exported workspace actions
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
- [Desktop runtime and local data](/Users/svanny/banji/docs/development/desktop-runtime-and-local-data.md): Electron layers, user data paths, automation storage, backup snapshots, restore, and clear-data behavior
- [Automation workspace](/Users/svanny/banji/docs/development/automation-workspace.md): Telegram transport, automation staging store, route sections, promotion flow, and focused verification commands
- [Ticketing architecture](/Users/svanny/banji/docs/development/ticketing-architecture.md): ticket event model, Work capture authoring contract, Work queue behavior, and downstream projections
- [Intent-first UI overhaul](/Users/svanny/banji/docs/development/intent-first-ui-overhaul.md): canonical Home, Work, Catalog, Insights, Settings IA and legacy redirect boundaries
- [UI design system](/Users/svanny/banji/docs/development/ui-design-system.md): brand rules for renderer UI controls, including strict button icon requirements
- [Analysis workspace and exports](/Users/svanny/banji/docs/development/analysis-workspace-and-exports.md): SENA runtime surfaces, cached reads, settings actions, and export formats
- [Startup architecture](/Users/svanny/banji/docs/development/startup-architecture.mmd): boot sequence, compact startup workspace IPC, read-worker pool, and startup benchmark targets
- [Startup flowchart](/Users/svanny/banji/docs/development/startup-flowchart.mmd): control/data-flow map for startup, cache validation, route-scoped deferred reads, and benchmark summaries
- [Navigation architecture](/Users/svanny/banji/docs/development/navigation-architecture.mmd): benchmark route-click sequence, route readiness, IPC/cache behavior, and navigation summary generation
- [Navigation flowchart](/Users/svanny/banji/docs/development/navigation-flowchart.mmd): post-startup route flow, automation and financials navigation, read-pool readiness, route-scoped support reads, and navigation benchmark targets
- [User decision tree markmap source](/Users/svanny/banji/docs/development/user-decision-tree.markmap.md): editable Markmap Markdown hierarchy for user intent ranking, workflows, and the simplified app IA target
- [User decision tree interactive markmap](/Users/svanny/banji/docs/development/user-decision-tree.markmap.html): offline interactive Markmap render generated with `pnpm run markmap:user-decision-tree`
- [Overview architecture](/Users/svanny/banji/docs/development/overview-architecture.mmd): dashboard overview route architecture for supplier and customer queues, drawer flows, detail hydration, order-batch reads, and overview benchmark targets
- [Overview flowchart](/Users/svanny/banji/docs/development/overview-flowchart.mmd): overview benchmark control/data flow for workflow toggles, drawers, model builders, and summary targets
- [Automations architecture](/Users/svanny/banji/docs/development/automations-architecture.mmd): automation seed, connection, catalog exposure, live intake, drawer, exceptions, and target metrics
- [Automations flowchart](/Users/svanny/banji/docs/development/automations-flowchart.mmd): automations benchmark control/data flow across tabs, intake drawer reads, and queue metrics
- [Capture architecture](/Users/svanny/banji/docs/development/record-update-architecture.mmd): hub lane navigation, ticket-backed prompts, stock count save, supplier receipt save, and ticket mutations
- [Capture flowchart](/Users/svanny/banji/docs/development/record-update-flowchart.mmd): capture benchmark control/data flow for lane opens, saves, Work readiness, and memory snapshots
- [Detail pages architecture](/Users/svanny/banji/docs/development/detail-pages-architecture.mmd): catalog target selection, SKU/service first and repeat detail loads, cache behavior, and memory metrics
- [Detail pages flowchart](/Users/svanny/banji/docs/development/detail-pages-flowchart.mmd): detail-pages benchmark control/data flow for catalog, SKU, service, repeat loads, and cache reads
- [Stability architecture](/Users/svanny/banji/docs/development/stability-architecture.mmd): repeated sidebar cycle, ready-event coverage, shared route reads, and memory-slope inputs
- [Stability flowchart](/Users/svanny/banji/docs/development/stability-flowchart.mmd): stability benchmark control/data flow across four route cycles and memory snapshots
- [Benchmark guide](/Users/svanny/banji/bench/README.md): scenario commands, fixture sizes, deterministic seed rules, and tiered target budgets

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
3. [Automation workspace](/Users/svanny/banji/docs/development/automation-workspace.md)
4. [Ticketing architecture](/Users/svanny/banji/docs/development/ticketing-architecture.md)
5. [UI design system](/Users/svanny/banji/docs/development/ui-design-system.md)
6. [Analysis workspace and exports](/Users/svanny/banji/docs/development/analysis-workspace-and-exports.md)
7. [Security standards](/Users/svanny/banji/docs/security/SECURITY_STANDARDS.md)
8. [User guide (English)](/Users/svanny/banji/docs/user-guide.md)
