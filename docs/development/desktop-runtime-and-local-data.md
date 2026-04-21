# Desktop Runtime and Local Data

Back to the docs index: [banji developer docs](/Users/svanny/banji/docs/README.md)

## Runtime Layers

banji’s desktop app is split into four layers:

- `src/main`: Electron main process, desktop boot, IPC handlers, local file paths, backup/restore, runtime lifecycle
- `src/preload`: preload bridge that exposes `window.banjiDesktop`
- `src/renderer`: React UI that calls the preload bridge
- `src/shared`: shared IPC contracts and result types

The canonical IPC shape is defined in [`src/shared/ipc.ts`](/Users/svanny/banji/src/shared/ipc.ts).

The main process starts and coordinates the bundled desktop runtime, while the renderer talks to that runtime only through the preload bridge and the typed IPC contracts.

## Local Data Paths

The desktop app reports the current local-data layout through `window.banjiDesktop.system.getLocalDataInfo()`.

Current fields:

- `dataDirectoryPath`
- `workspaceStorePath`
- `preferencesPath`
- `backupDirectoryPath`
- `storageFormat`

Current storage files exposed by the main process:

- `desktop-sena-store.sqlite3`: local workspace store
- `desktop-preferences.json`: persisted settings and preferences
- `desktop-sena-read-cache.json`: persisted read cache for compact SENA UI reads; oversized list payloads such as full observations are intentionally excluded
- `sena-checkpoints/`: compressed SENA checkpoint payload files referenced by SQLite metadata
- `backup-snapshots/`: snapshot directories created by the backup system

In development, the app uses `.banji-dev-data` in the repo root. Packaged builds use Electron `userData`.

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

Record Update now authors customer, supplier, and adjustment work as ticket
events on observations. The old order-batch data remains a compatibility read
model where needed, but new operational writes should preserve ticket identity,
line items, party metadata, lifecycle, stage, and revision in
`SenaObservationInput.ticketEvents`.

The managed backend starts one writer core and a small pool of read workers. The
writer handles mutations and all destructive/backup-sensitive commands. Read-only
commands can use read workers after they are ready, while identical read requests
are coalesced before worker selection.

## Backup Snapshot Model

The backup implementation lives in [`src/main/local-backup.ts`](/Users/svanny/banji/src/main/local-backup.ts).

Snapshot behavior:

- snapshots are stored under `backup-snapshots/`
- each snapshot is a directory, not a single archive file
- each snapshot includes the current top-level workspace files plus `snapshot-manifest.json`
- snapshot names include the timestamp, trigger type, and an optional slugified reason
- `.tmp` files are excluded from snapshots
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
  triggered from Settings through `window.banjiDesktop.system.createBackupSnapshot()`
- Automatic snapshot:
  triggered in the main process before workspace mutations

Automatic snapshots are currently attempted before these mutations:

- inventory report submission
- catalog upsert
- observation ingest, update, and delete
- SENA trigger and retry actions
- preference save

Automatic snapshots are throttled by an interval gate and use a separate trigger marker in the snapshot name and manifest.

## Restore and Clear-Data Behavior

Restore and clear-data are destructive to the current workspace files, but both create a safety snapshot first.

Restore flow:

1. The main process opens a file/directory chooser rooted at the backup directory.
2. The selected snapshot must contain `snapshot-manifest.json`.
3. The app stops the managed core before restoring files.
4. A safety snapshot with the reason `before-restore` is created from the current workspace state.
5. Current top-level workspace files are deleted.
6. Snapshot files are copied back into the active data directory.
7. SENA read cache is invalidated.

Clear-data flow:

1. The app stops the managed core.
2. A safety snapshot with the reason `before-clear` is created.
3. Current top-level workspace files are removed.
4. The result reports the number of cleared files and the safety snapshot metadata.

## Renderer Access Points

The renderer uses the `DesktopSystemBridge` contract from [`src/shared/ipc.ts`](/Users/svanny/banji/src/shared/ipc.ts).

Current system actions:

- `getAppContext()`
- `getLocalDataInfo()`
- `createBackupSnapshot()`
- `restoreBackupSnapshot()`
- `clearCurrentData()`
- `revealPath(path)`

The main IPC handlers for those actions live in [`src/main/index.ts`](/Users/svanny/banji/src/main/index.ts).

The renderer reaches them through `window.banjiDesktop.system`, not through direct Node or filesystem access.

## Contributor Notes

- If you change backup eligibility or snapshot contents, update this page and the related tests in [`src/main/local-backup.test.ts`](/Users/svanny/banji/src/main/local-backup.test.ts).
- If you add or rename IPC fields, update [`src/shared/ipc.ts`](/Users/svanny/banji/src/shared/ipc.ts) first and keep renderer/main behavior aligned.
- If a workspace mutation becomes destructive or high-risk, prefer routing it through the existing automatic snapshot path instead of inventing a separate safety mechanism.
