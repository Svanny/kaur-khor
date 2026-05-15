# Desktop Runtime and Local Data

Back to the docs index: [Kaur Khor developer docs](../README.md)

## Runtime Layers

Kaur Khor’s desktop app is split into four layers:

- `src/main`: Electron main process, desktop boot, IPC handlers, local file paths, backup/restore, runtime lifecycle
- `src/preload`: preload bridge that exposes `window.kaurKhorDesktop`
- `src/renderer`: React UI that calls the preload bridge
- `src/shared`: shared IPC contracts and result types

The canonical IPC shape is defined in [`src/shared/ipc.ts`](../../src/shared/ipc.ts).

The main process starts and coordinates the bundled desktop runtime, while the renderer talks to that runtime only through the preload bridge and the typed IPC contracts.

## Local Data Paths

The desktop app reports the current local-data layout through `window.kaurKhorDesktop.system.getLocalDataInfo()`.

Current fields:

- `dataDirectoryPath`
- `workspaceStorePath`
- `preferencesPath`
- `backupDirectoryPath`
- `storageFormat`

Current storage files exposed by the main process:

- `desktop-sena-store.sqlite3`: local workspace store
- `desktop-automation-store.json`: persisted Telegram automation connection, command/menu registration state, catalog exposure, conversation history, customer wizard draft sessions, and intake state
- `desktop-preferences.json`: persisted settings and preferences
- `desktop-sena-read-cache.json`: persisted read cache for compact SENA UI reads; oversized list payloads such as full observations are intentionally excluded
- `sena-checkpoints/`: compressed SENA checkpoint payload files referenced by SQLite metadata
- `backup-snapshots/`: snapshot directories created by the backup system

In development, the app uses `.kaur-khor-dev-data` in the repo root. Packaged builds use Electron `userData`.

Development boot prefers the generated-history seed path when the repo-local
workspace is empty or already carries `desktop-sena-dev-history.json`. That
keeps benchmark fixtures and normal dev boot on the same seed generator without
overwriting an existing non-generated local workspace.

## SENA Read Path

The Electron main process owns the startup and IPC boundary for SENA reads. The
renderer should treat `sena.getStartupWorkspace()` as the blocking startup read.
That command returns the first-screen payload: catalog, compact workspace
summary, latest run, and observation fingerprint. Full observation history is
not part of startup state.

Read behavior:

- `sena.getObservationFingerprint()` validates cache freshness with SQLite metadata instead of deserializing all observations.
- `sena.listObservationPage()` is the paged history API for routes that need observation rows.
- `sena.getRecordUpdateContext()` returns latest stock, sales, order, receipt, and observation anchors for update flows.
- `sena.listObservations()` remains available for compatibility and full export-style reads, but should not be used during startup.

Work routes should request their own bounded support data after startup. The
renderer inventory action `loadWorkSupportData()` is the shared entrypoint for
queue, capture, and Record Update session surfaces that need record context,
order batches, and optionally a recent observation page.
Use compact metadata, such as `observationFingerprint`, latest-run counts, and
workspace-summary interval counts, as the existence signal while those bounded
route reads are still loading. Do not gate saved-observation UI only on
hydrated `inventory.observations` rows after startup.

Write behavior:

- The first saved observation anchors a new workspace but does not trigger SENA
  analysis because the analysis engine requires at least two observations.
- Observation update and delete mutations rebuild Record Update anchor rows in
  the same SQLite transaction as the observation change. If anchor rebuild fails,
  the observation mutation must roll back rather than leaving saved history and
  hot anchor rows out of sync.
- Order-batch create/update/split commands validate semantic payloads before
  persistence. Blank SKU ids, non-finite or negative numeric fields, non-RFC3339
  timestamps, and received quantities greater than ordered quantities are
  rejected at the store boundary.
- `sena.triggerRun` and `sena.retryRun` should mark failed runs as `failed`, not
  leave stale `queued` rows behind.
- Desktop-core command errors should preserve the request id after the command
  envelope is decoded so Electron IPC callers reject promptly.

Record Update now authors customer, supplier, and adjustment work as ticket
events on observations. The old order-batch data remains a compatibility read
model where needed, but new operational writes should preserve ticket identity,
line items, party metadata, lifecycle, stage, and revision in
`SenaObservationInput.ticketEvents`.

The managed backend starts one writer core and a small pool of read workers. The
writer handles mutations and all destructive/backup-sensitive commands. Read-only
commands can use read workers after they are ready, while identical read requests
are coalesced before worker selection.

## Automation Workspace Data

Automation state currently lives beside the main workspace files in
`desktop-automation-store.json`.

That file persists:

- Telegram connection settings and health metadata
- Telegram command/menu registration state and per-conversation customer wizard drafts
- SKU and service exposure rules for customer-facing automation catalogs
- conversation summaries and message records used by the automation workspace
- intake rows that can later be resolved or promoted into ticket events

Automation promotion still writes operational history into the main SENA
workspace through ticket and commercial events. The JSON automation store is the
staging layer for channel-facing state, not a replacement for the canonical
inventory workspace.

After promotion, renderer automation flows should refresh both automation state
and the inventory-side Work support data. This keeps promoted tickets,
customer/supplier task aggregates, and recent history aligned inside the same
Work session.

## Backup Snapshot Model

The backup implementation lives in [`src/main/local-backup.ts`](../../src/main/local-backup.ts).

Snapshot behavior:

- snapshots are stored under `backup-snapshots/`
- each snapshot is a directory, not a single archive file
- each snapshot includes the current top-level workspace files/directories plus `snapshot-manifest.json`
- snapshot names include the timestamp, trigger type, and an optional slugified reason
- `.tmp` files and internal `.Kaur Khor-*` scratch paths are excluded from snapshots
- old snapshots are pruned after the configured maximum count

Manifest fields currently written:

- `createdAt`
- `fileCount`
- `snapshotPath`
- `sourceFiles`
- `trigger`

## Manual and Automatic Snapshots

Two snapshot flows exist today:

- Manual snapshot:
  triggered from Settings through `window.kaurKhorDesktop.system.createBackupSnapshot()`
- Automatic snapshot:
  triggered in the main process before workspace mutations

When Telegram automation is connected and enabled, quitting the desktop app shows a close warning because listening, intake, and automatic checks stop when the process exits. Before that warning appears, the main process creates an unthrottled automatic snapshot with the reason `before-close-automation`. On the next successful startup, Kaur Khor keeps the newest close-safety snapshot and removes older close-safety snapshots; normal snapshot pruning still enforces the overall snapshot cap.

Automatic snapshots are currently attempted before these mutations:

- inventory report submission
- catalog upsert
- observation ingest, update, and delete
- SENA trigger and retry actions
- preference save

Existing SKU and service editor saves may perform both a catalog upsert and an
observation ingest. The catalog upsert stores the latest defaults, while the
observation ingest preserves variable history for SKU cost, SKU retail price,
SKU ETA hints, and service price changes.

Automatic snapshots are throttled by an interval gate and use a separate trigger marker in the snapshot name and manifest.

## Restore and Clear-Data Behavior

Restore and clear-data are destructive to the current workspace files, but both create a safety snapshot first.

Restore flow:

1. The main process opens a file/directory chooser rooted at the backup directory.
2. The selected snapshot must contain `snapshot-manifest.json`.
3. The app enters a maintenance window, stopping Telegram automation and the
   managed core before restoring files.
4. Restore file reads and copies start only after the managed core has stopped,
   so SQLite files are not replaced while the runtime still has them open.
5. A safety snapshot with the reason `before-restore` is created from the current workspace state.
6. Current top-level workspace files/directories are deleted.
7. Snapshot files are copied back into the active data directory.
8. SENA read cache is invalidated.

Clear-data flow:

1. The app enters a maintenance window, stopping Telegram automation and the
   managed core before deleting files.
2. A safety snapshot with the reason `before-clear` is created.
3. Current top-level workspace files/directories are removed.
4. The result reports the number of cleared files and the safety snapshot metadata.

After either maintenance action, the main process restarts the managed core and
resumes automation only after all queued restore/clear operations have completed
or failed. The Telegram automation loop is drained before the maintenance window
opens, so an already-running poll cannot keep writing into workspace files while
SQLite state is being restored or removed.

## Renderer Access Points

The renderer uses the `DesktopSystemBridge` contract from [`src/shared/ipc.ts`](../../src/shared/ipc.ts).

Current system actions:

- `getAppContext()`
- `getLocalDataInfo()`
- `createBackupSnapshot()`
- `restoreBackupSnapshot()`
- `clearCurrentData()`
- `checkForUpdate()`
- `chooseUpdateBackupDirectory()`
- `chooseUpdateDataDirectory()`
- `runSourceBuildUpdate(payload)`
- `revealPath(path)`
- `openExternalUrl(url)`
- `pickAndStoreImage()`
- `storeDroppedImage(payload)`

The main IPC handlers for those actions live in [`src/main/index.ts`](../../src/main/index.ts).

The renderer reaches them through `window.kaurKhorDesktop.system`, not through direct Node or filesystem access.

`revealPath(path)` is constrained to approved local data roots. `openExternalUrl(url)`
normalizes and allow-lists external schemes before handing the URL to Electron,
and main-window navigation guards deny renderer-created windows plus top-level
external navigation. Renderer surfaces that need an external URL should call the
desktop bridge instead of rendering a raw external anchor.

Catalog image ingest currently follows two paths:

- `pickAndStoreImage()` handles chooser-based imports for SKU and service editors.
- `storeDroppedImage(payload)` handles drag-and-drop imports from the picture
  field and clipboard-paste imports from anywhere on mounted SKU and service
  editor pages.

Both paths accept PNG, JPEG, and WebP source files. Drag/drop and clipboard
payloads include the browser MIME type when available, are sniffed by file
header before normalization, and are rejected if they exceed 20 MB, 12000 px on
either side, or 40 megapixels. WebP inputs are normalized to PNG before the final
asset is written so renderer, local storage, and downstream upload behavior stay
aligned.

## Desktop Update Flow

Settings / Updates is desktop-only. It checks GitHub releases, defaults the
source-build version picker to `latest`, asks the operator to choose a
pre-update snapshot export folder, optionally lets them choose a custom Kaur
Khor data folder, verifies the selected source-build archive digest against the
release `.sha256` file, and launches the source-build updater only after the
app accepts the quit handoff and the terminal process has been spawned. The
updater replaces the installed app binary only. It never deletes the active
Electron `userData` folder or a custom data directory; custom-folder users
should restore the exported snapshot from Settings / Local data after the new
version opens if they need to rehydrate that workspace.

Source-build update folders are kept beside the downloaded archive under a
stable `kaur-khor/` parent with one `kaur-khor-v<version>-source-build` child
per release. After a successful update, the updater prompts before deleting any
older source-build folders and must never treat those folders as workspace data.

The renderer never supplies the effective update data directory directly. Main
process IPC resolves the chosen option to either the active Electron `userData`
path or a user-approved custom directory, then passes that trusted path to the
source-build updater. The pre-update backup directory follows the same trust
boundary: unless backup is explicitly skipped, the path must match a folder that
the main process received from its directory chooser.

Downstream Telegram photo sends may only read image files that resolve under the
managed `assets/` directory for the current `userData` root. Absolute paths,
relative traversal, URLs, and symlink escapes outside that directory are rejected
before the Telegram API client can read file bytes.

The automation workspace uses the `DesktopAutomationBridge` contract from
[`src/shared/ipc.ts`](../../src/shared/ipc.ts) and reaches it
through `window.kaurKhorDesktop.automation`.

The operator-facing route and Telegram workflow details are documented in
[Automation workspace](automation-workspace.md).

Current automation actions:

- `getWorkspace()`
- `getConnection()`
- `saveConnection(payload)`
- `listExposureRows()`
- `patchExposureRow(payload)`
- `listConversations()`
- `readConversation(payload)`
- `listIntakes(payload?)`
- `readIntake(payload)`
- `resolveIntake(payload)`
- `promoteIntake(payload)`
- `testTelegramConnection()`

## Contributor Notes

- If you change backup eligibility or snapshot contents, update this page and the related tests in [`src/main/local-backup.test.ts`](../../src/main/local-backup.test.ts).
- If you change external URL, local path, or navigation guard policy, update
  this page and the related tests in [`src/main/platform-security.test.ts`](../../src/main/platform-security.test.ts).
- If you add or rename IPC fields, update [`src/shared/ipc.ts`](../../src/shared/ipc.ts) first and keep renderer/main behavior aligned.
- If you change automation persistence shape or bridge methods, update this page and keep [`src/main/index.ts`](../../src/main/index.ts), [`src/preload/index.ts`](../../src/preload/index.ts), and [`src/shared/ipc.ts`](../../src/shared/ipc.ts) aligned.
- If a workspace mutation becomes destructive or high-risk, prefer routing it through the existing automatic snapshot path instead of inventing a separate safety mechanism.
