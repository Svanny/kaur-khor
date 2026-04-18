# Analysis Workspace and Exports

Back to the docs index: [banji developer docs](/Users/svanny/banji/docs/README.md)

## SENA in the Desktop App

banji uses SENA as the local analysis engine. The Electron app asks the managed Rust runtime for catalog state, observations, workspace summaries, diagnostics, and run results, then renders those results in the React UI.

Relevant code paths:

- renderer routes and UI: `src/renderer/src/routes`
- settings export helpers: [`src/renderer/src/lib/settings-workspace-actions.ts`](/Users/svanny/banji/src/renderer/src/lib/settings-workspace-actions.ts)
- main-process runtime orchestration: [`src/main/index.ts`](/Users/svanny/banji/src/main/index.ts)
- shared type contracts: [`src/shared/ipc.ts`](/Users/svanny/banji/src/shared/ipc.ts)
- desktop runtime: `apps/desktop-core`
- Rust analysis engine: `apps/sena-core`

## Read and Cache Behavior

The main process keeps a persisted read cache for selected SENA reads.

Current cache characteristics:

- stored in `desktop-sena-read-cache.json`
- keyed by query-specific identifiers such as detail or run-status requests
- invalidated when the observation fingerprint changes
- invalidated after write-side mutations such as catalog updates, observation changes, run triggers, retries, restore, and clear-data

This keeps renderer reads responsive without letting cached analysis survive known workspace mutations.

## Settings Surface

The Settings route is the main contributor-facing screen for workspace-level maintenance. It currently combines:

- app preferences such as language and currency behavior
- SENA parameter editing
- planning reruns
- local workspace path inspection
- backup snapshot creation and restore
- clear-current-data action
- log export and planning-data export

The route implementation lives in [`src/renderer/src/routes/settings.tsx`](/Users/svanny/banji/src/renderer/src/routes/settings.tsx).

The route reaches runtime and filesystem-affecting actions through `window.banjiDesktop`, with the bridge shape defined in [`src/shared/ipc.ts`](/Users/svanny/banji/src/shared/ipc.ts).

## Exported Data

Two export actions are currently wired through Settings helpers:

- `exportLogsAction`
- `exportPlanningDataAction`

Supported export formats:

- `excel`
- `csv`
- `json`

### Logs Export

The logs export serializes observation records from `window.banjiDesktop.sena.listObservations()` and writes a timestamped file named like `banji-logs-<timestamp>.<ext>`.

The exported rows include:

- observation identity fields
- counts for stock, rankings, stockouts, order signals, prices, lead times, adjustments, and recipe usage hints
- regime hint and notes
- the full input payload

### Planning Data Export

The planning-data export collects a wider workspace snapshot:

- catalog SKUs
- catalog services
- catalog bundles
- catalog sharing mask
- observation logs
- workspace summary
- SKU summaries
- diagnostics
- latest run

The Excel export writes one sheet per section. The CSV export writes title-delimited sections into one file. The JSON export emits a structured object with the raw payloads.

## Contributor Notes

- If you change the exported sections or field names, update this page and the related Settings tests.
- If you add a new SENA maintenance action, prefer keeping it in `settings-workspace-actions.ts` when the logic is shared between the route and the command palette.
- If you change a write path that should invalidate analysis reads, update the main-process cache invalidation flow in [`src/main/index.ts`](/Users/svanny/banji/src/main/index.ts).
