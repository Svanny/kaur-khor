# Banji Web OPFS Implementation Notes

## Agent Roster

| Agent | Model | Task | Files touched | Status | Handoff notes |
| --- | --- | --- | --- | --- | --- |
| Russell | GPT-5.4 medium | Scanner A: renderer bridge/API inventory | None, read-only | Completed | Identified startup-critical bridge methods and browser-unsupported desktop APIs. |
| Hegel | GPT-5.4 medium | Scanner B: web build/deploy and SQLite WASM viability | None, read-only | Completed | Recommended a separate Vite web build, Pages artifact, and SQLite WASM OPFS SAH pool path for GitHub Pages. |
| Planck | GPT-5.4 medium | Scanner C: route/onboarding/UI plan | None, read-only | Completed | Recommended public web routes with embedded app mounting and visible demo/storage banners. |
| Hooke | GPT-5.4 medium | Scanner D: docs/install/source-build plan | None, read-only | Completed | Produced Banji-specific install, unsigned-build, checksum, and source-build guidance. |
| Curie | GPT-5.5 medium | Coding Agent 1: web runtime/storage | `src/renderer/src/runtime/web/*` | Completed | Implemented OPFS capability checks, SQLite worker/client, schema, backups, demo seed, and focused runtime tests. |
| Kierkegaard | GPT-5.5 medium | Coding Agent 2: web pages/docs/deploy/install | web entry/pages, docs, workflow, install script | Completed | Implemented Pages routes, workflow, README/docs, and macOS source-build script; orchestrator integrated final fixes. |

## Working Assumptions

- Desktop Electron remains the authoritative desktop runtime.
- Web runtime injects a `window.banjiDesktop`-compatible bridge before rendering.
- Browser app must require SQLite WASM + OPFS for real data; unsupported browsers get a visible blocked state.
- Demo data is isolated from browser-app data.
- The repository currently has `license: "UNLICENSED"`, so user-facing wording must avoid legal "open source" claims unless a license is added later.

## Ownership Plan

- Web runtime/storage files: Coding Agent 1 after scan synthesis.
- Web pages/build/deploy/docs/install files: Coding Agent 2 after scan synthesis.
- Shared files such as `package.json`, Vite configs, and app entrypoints require serialized edits.

## Shared Dependency Decision

- `@sqlite.org/sqlite-wasm@3.51.2-build9` is installed in `package.json` and `pnpm-lock.yaml`.
- The runtime should prefer SQLite's OPFS SyncAccessHandle Pool VFS (`opfs-sahpool`) because it can work without COOP/COEP headers, which matters for GitHub Pages.
- If OPFS/SQLite initialization fails, the real browser app must show an unsupported state instead of silently using weak storage.
