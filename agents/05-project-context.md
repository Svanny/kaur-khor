# AGENTS.md - Project Context

## 10. Project context

**Kaur Khor is a desktop-first, local-first Electron inventory workspace with a React renderer and bundled Rust analysis/runtime crates.**

### Stack
- Language and version: TypeScript targeting ES2022, React 19, Rust 2021 edition.
- Framework(s): Electron 30 via `electron-vite`, Vite 7, React Router 7, Tailwind CSS 4, shadcn-style UI components with Radix primitives.
- Package manager: `pnpm` 10.32.1, recorded in `package.json`.
- Runtime / deployment target: local desktop app for macOS, Windows, and Linux. Development data lives in `.kaur-khor-dev-data`; packaged builds use Electron `userData`.

### Commands
- Install: `pnpm install`
- Build: `pnpm build`
- Test (all TypeScript/React/Electron): `pnpm test`
- Test (single TypeScript file): `pnpm test -- src/path/to/file.test.ts`
- Test (single TSX file): `pnpm test -- src/path/to/file.test.tsx`
- Test (Rust desktop runtime): `cargo test --manifest-path apps/desktop-core/Cargo.toml`
- Test (Rust SENA engine): `cargo test --manifest-path apps/sena-core/Cargo.toml`
- Startup benchmark: `pnpm bench:startup`
- Power User startup benchmark: `KAUR_KHOR_BENCHMARK_FIXTURE_SIZE=power-user pnpm bench:startup`
- Navigation benchmark: `pnpm bench:navigation`
- Work benchmark: `pnpm bench:work`
- Capture benchmark: `pnpm bench:capture`
- Detail-pages benchmark: `pnpm bench:detail-pages`
- Stability benchmark: `pnpm bench:stability`
- Security gate: `bash tool/security/run_security_checks.sh`
- Typecheck: `pnpm exec tsc --build tsconfig.json`
- Lint: no repo lint script is configured; do not invent one.
- Run locally: `pnpm dev`
- Package: `pnpm package:mac`, `pnpm package:linux`, or `pnpm package:win:native`

Prefer single-file or single-test runs during iteration. Full suites are for the final verification pass.

### Layout
- `src/main`: Electron main process, app boot, IPC handlers, local data paths, backup/restore, preferences, benchmark runner, and platform security.
- `src/preload`: preload bridge that exposes the narrow renderer-facing desktop API.
- `src/renderer/src`: React app, routes, state, components, hooks, dev bridge, assets, and test setup.
- `src/renderer/src/routes`: route-level product surfaces, including overview, dashboard, record update, performance, financials, SKU/service detail, settings, and help.
- `src/renderer/src/components/ui`: shadcn/Radix-style UI primitives.
- `src/renderer/src/components/system`: Kaur Khor-specific reusable product components.
- `src/renderer/src/lib`: renderer business logic, formatting, validation, command palette, catalog helpers, SENA adapters, export helpers, and navigation helpers.
- `src/shared`: IPC contracts and shared TypeScript data types.
- `src/icons`: shared icon wrappers and native icon boundaries.
- `apps/desktop-core`: Rust desktop persistence/runtime crate used by the Electron app.
- `apps/sena-core`: Rust SENA analysis engine crate.
- `bench`: Playwright benchmark scenarios and helpers.
- `docs`: contributor docs, security docs, user guides, and readme screenshots.
- `tool/security`: security gate scripts and platform hardening checks.
- `scripts`: packaging, benchmark, tree-refresh, data-generation, and icon-build helpers.
- Tests live next to source as `*.test.ts` or `*.test.tsx`; Rust integration tests live under `apps/desktop-core/tests`.
- Do not modify generated or local-output paths unless the task explicitly requires it: `node_modules`, `out`, `build`, `release`, `bench-results`, `.kaur-khor-dev-data`, `.pnpm-store`, `.playwright-cli`, `apps/*/target`, `*.tsbuildinfo`, `tree.txt`, `tree_dir.txt`, `src/renderer/src/routes/*.bak.*`.

### Conventions specific to this repo
- Import style: use configured aliases where they already fit: `@/` and `@renderer/` for renderer code, `@shared/` for shared IPC/types, `@icons/` for icon modules. Main/preload code only has `@shared/` and `@icons/`.
- TypeScript is strict. Keep shared contracts in `src/shared` when main, preload, and renderer need the same shape.
- Renderer tests use Vitest with jsdom, Testing Library, and `src/renderer/src/test/setup.ts`.
- Rust crates are not in a root Cargo workspace. Run crate tests with `--manifest-path`.
- UI primitives follow `components.json`: shadcn `new-york` style, Tailwind CSS in `src/renderer/src/globals.css`, lucide icons, and aliases under `@/components`, `@/components/ui`, `@/lib`, and `@/hooks`.
- Keep user-facing Help behavior aligned with `docs/user-guide.md` and `docs/user-guide.km.md` when changing in-app help copy or product behavior.
- Update `docs/` when changing contributor setup, local commands, IPC behavior, local storage/backup/restore/clear-data behavior, SENA export shapes, settings flows, security gate expectations, or user-visible product behavior.
- For UI changes, verify visually with the app or browser when practical, especially for layout states, collapsed/expanded sidebars, drawers, modals, and route-level surfaces.

### Startup and read-path architecture
- Startup readiness is based on `sena.getStartupWorkspace()`: catalog, compact workspace summary, latest run, and observation fingerprint. Do not add full observation hydration or route-specific detail reads back into the blocking startup path.
- The renderer should request observation history explicitly through paged reads or compact context commands. Keep `sena.listObservations()` as a compatibility/export path, not a startup/session default.
- Main-process SENA cache freshness uses `sena.getObservationFingerprint`; do not reintroduce per-read `sena.listObservations()` freshness scans.
- The backend has a writer core plus a read-worker pool. Mutations must route to the writer; read-only commands may route to read workers and should remain globally coalesced when identical.
- Deferred read-only commands should wait briefly for a ready read worker before falling back to the writer. Keep startup-critical reads on the immediate path.
- Hot startup summary data lives in normalized SQLite tables. Keep legacy JSON read models only as compatibility/detail storage unless benchmark evidence justifies another shape.
- `sena.getRecordUpdateContext()` is backed by normalized anchor rows, not a full observation scan. Keep latest stock, sale, order, and receipt anchors incremental on write.
- `InventoryProvider.reload()` should not automatically fan out diagnostics, record-update context, or order batches right after readiness. Diagnostics are idle work; record-update context and order batches are route-driven support reads.
- Checkpoint payloads live as compressed files under `sena-checkpoints/` with SQLite metadata. Do not put large checkpoint JSON blobs back into the hot SQLite path.
- Benchmark fixtures are `minimal`, `medium`, `heavy`, and `power-user`; Power User means 10 years, 1 day interval, 3,653 observations.

### Ticketing architecture
- Kaur Khor removes the legacy batch update system in favor of ticket-backed operations. New customer orders, supplier orders, receipts, and adjustments must write ticket events with stable ticket identity instead of only grouped batch aggregates.
- Supplier receipt is not a separate primary Record Update wizard. Receipt capture belongs inside Supplier order updates against an existing supplier ticket.
- Customer and supplier order wizards must ask whether the operator is creating a new ticket or editing/updating an existing ticket before continuing.
- Customer channel, name, and phone live in the Record Update notes section for UI placement, but must still be stored as structured ticket party metadata. Normalize channel/name/phone lookup keys case-insensitively.
- Overview keeps top-level ticket-family toggles for Customer and Supplier. Default the queue to Supplier, and keep customer-family filtering inside the customer queue.

### Forbidden
- Do not run or document `pnpm run build --silent`; `electron-vite build` rejects the forwarded `--silent` flag.
- Do not treat renderer-visible calculation changes as copy-only. Trace the model/data path, update the underlying calculation, and add or update focused tests.
- Do not bypass `src/preload` by exposing Electron or Node APIs directly to the renderer.
- Do not add remote scripts, disable context isolation, or enable renderer Node integration.
- Do not edit generated build outputs or local runtime data as part of source changes.
- Do not make Electron reloads steal macOS focus. Use inactive/background loading behavior unless the user explicitly asks to focus the app.
