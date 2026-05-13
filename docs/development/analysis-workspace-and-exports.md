# Analysis Workspace and Exports

Back to the docs index: [Kaur Khor developer docs](../README.md)

## SENA in the Desktop App

Kaur Khor uses SENA as the local analysis engine. The Electron app asks the managed Rust runtime for catalog state, observations, workspace summaries, diagnostics, and run results, then renders those results in the React UI.

Relevant code paths:

- renderer routes and UI: `src/renderer/src/routes`
- settings export helpers: [`src/renderer/src/lib/settings-workspace-actions.ts`](../../src/renderer/src/lib/settings-workspace-actions.ts)
- main-process runtime orchestration: [`src/main/index.ts`](../../src/main/index.ts)
- shared type contracts: [`src/shared/ipc.ts`](../../src/shared/ipc.ts)
- desktop runtime: `apps/desktop-core`
- Rust analysis engine: `apps/sena-core`

## Read and Cache Behavior

The main process keeps a persisted read cache for selected SENA reads. Startup
uses a compact command, `sena.getStartupWorkspace()`, rather than a fanout of
catalog, workspace summary, diagnostics, observations, and order-batch reads.

Current cache characteristics:

- stored in `desktop-sena-read-cache.json`
- keyed by query-specific identifiers such as detail or run-status requests
- excludes oversized list payloads such as full observation arrays and observation pages
- invalidated when the observation fingerprint changes
- validates freshness through `sena.getObservationFingerprint()` instead of scanning full observations
- invalidated after write-side mutations such as catalog updates, observation changes, run triggers, retries, restore, and clear-data

This keeps renderer reads responsive without letting cached analysis survive known workspace mutations.

Routes that need observation history should request explicit pages through
`sena.listObservationPage()`. Routes that only need "latest known value" anchors
should use `sena.getRecordUpdateContext()`.
The analysis route should request a bounded initial observation page when
startup supplied only compact metadata and that metadata proves saved
observations exist. The workbench can use the compact count immediately, but
full rows should remain route-hydrated instead of blocking startup.

Work surfaces are route-scoped support-read users. `/work/queue`,
`/work/capture`, and Record Update session routes should call the renderer
inventory support loader instead of relying on startup hydration. That loader
combines `sena.getRecordUpdateContext()`, `sena.listOrderBatches()`, and a
bounded `sena.listObservationPage()` when the route needs history-derived
tasks. Do not move this fanout back into `InventoryProvider.reload()` or
startup readiness.

SENA analysis requires at least two observations. The first saved observation in
a new workspace is only the inventory anchor, so Record Update should not trigger
a planning run until the second observation exists. Capture save starts
persistence in the global inventory saving scope and leaves the session after
local validation passes; any post-save SENA run belongs to that background task
and must not block route exit. If a run command does fail inside the desktop
core, the response must keep the original request id so the main-process pending
request rejects immediately instead of waiting for the long-running mutation
timeout.

Workspace summaries are stored in normalized hot SQLite tables for startup reads.
Legacy JSON read models remain available for compatibility and detail-oriented
surfaces.

Ticket-backed operational updates are stored on observations as structured
`ticketEvents`. These events are evidence for SKU, service, performance,
analysis, and financial projections. They should remain distinct from legacy
order-signal and order-batch compatibility reads so new operational facts keep a
stable ticket identity and event revision trail. SENA validation rejects ticket
events that do not include a non-empty ticket id, kind, status, and at least one
SKU or service line, so malformed ticket payloads cannot enter the analysis
ledger as empty evidence.

Catalog editor saves update current catalog defaults. When an existing SKU or
service variable changes, the renderer also appends a narrow observation so
history and analysis can see the change: SKU cost writes a stock snapshot with
the latest known units, SKU retail price writes a retail price signal, SKU
ETA days or uncertainty writes an ETA hint, and service price writes
a service price signal. Name, description, image, supplier, linked-SKU, archive,
and create-new-item saves remain catalog-only unless one of those variable
fields also changes. SKU and service identity changes also rewrite matching
entity references inside ticket-event lines so renamed catalog items continue to
resolve in ticket-backed history and compact activity.

Compact record activity is append-style over bounded recent observation payloads
and ticket events. Latest anchors remain backed by normalized hot rows, but
user-visible history should not be derived only from one latest anchor per
ticket or entity.

SENA checkpoints are stored as compressed payload files under
`sena-checkpoints/`, with SQLite rows holding metadata such as codec, path, byte
size, owner, algorithm version, and catalog fingerprint.

Checkpoint payload paths read from SQLite are treated as untrusted local data.
Before a checkpoint is read or deleted, the Rust repository canonicalizes the
path and verifies that it remains under the active `sena-checkpoints/` root.
Rows that point outside that root, including symlink escapes, are skipped rather
than read or removed.

## Settings Surface

The Settings route is the main contributor-facing screen for workspace-level maintenance. It currently combines:

- app preferences such as language and currency behavior
- SENA parameter editing
- planning reruns
- local workspace path inspection
- backup snapshot creation and restore
- clear-current-data action
- log export and planning-data export

The route implementation lives in [`src/renderer/src/routes/settings.tsx`](../../src/renderer/src/routes/settings.tsx).

The route reaches runtime and filesystem-affecting actions through `window.kaurKhorDesktop`, with the bridge shape defined in [`src/shared/ipc.ts`](../../src/shared/ipc.ts).

## Exported Data

Two export actions are currently wired through Settings helpers:

- `exportLogsAction`
- `exportPlanningDataAction`

Supported export formats:

- `excel`
- `csv`
- `json`

### Logs Export

The logs export serializes observation records from `window.kaurKhorDesktop.sena.listObservations()` and writes a timestamped file named like `Kaur Khor-logs-<timestamp>.<ext>`.

`listObservations()` is used here because export needs the full log. It should
not be copied into startup or route-first-render paths.

The exported rows include:

- observation identity fields
- counts for stock, rankings, stockouts, order signals, ticket events, prices, ETA, adjustments, and recipe usage hints
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

CSV export cells that begin with spreadsheet formula prefixes (`=`, `+`, `-`,
or `@`) are prefixed with a single quote before normal CSV quoting. This keeps
operator-entered names, notes, and payload fields from being interpreted as
formulas when opened in spreadsheet tools.

## Contributor Notes

- If you change the exported sections or field names, update this page and the related Settings tests.
- If you add a new SENA maintenance action, prefer keeping it in `settings-workspace-actions.ts` when the logic is shared between the route and the command palette.
- If you change a write path that should invalidate analysis reads, update the main-process cache invalidation flow in [`src/main/index.ts`](../../src/main/index.ts).
