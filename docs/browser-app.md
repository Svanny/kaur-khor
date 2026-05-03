# Browser app

The public web build is a GitHub Pages surface for banji. It exposes:

- `/` for the public overview
- `/demo` for a seeded browser preview
- `/app` for the browser app entry

GitHub Pages serves the site under `/banji/`, so the deployed URLs are `/banji/`, `/banji/demo`, and `/banji/app`. Desktop downloads and install notes live on the overview page at `/banji/#releases`.

## Runtime behavior

The desktop app remains the primary supported runtime. The browser routes use a web-only React entry and do not change the Electron `src/renderer/src/main.tsx` entry.

The demo route mounts the existing renderer app inside a `HashRouter`, opens `banji_browser_demo_v1.sqlite3`, and keeps demo records separate from the browser-app database. A banner marks the route as demo data, and the reset action reseeds the demo workspace.

The app route opens `banji_browser_app_v1.sqlite3` through SQLite WASM in a Web Worker. The runtime prefers SQLite's OPFS SyncAccessHandle Pool VFS (`opfs-sahpool`) so it can run on static hosting without requiring COOP/COEP headers. If OPFS or SQLite initialization is unavailable, the real app route shows an unsupported-browser state and does not silently fall back to weaker storage.

Browser mode keeps major product surfaces visible, but native-only desktop tools are shown as unavailable or replaced with browser equivalents:

- The app banner is the browser backup/import/reset surface.
- In the main browser and demo app views, the banner sits on the left rail and keeps the same vertical button coordinates when the navigation rail expands or collapses. On onboarding routes only, the banner becomes a floating top nav overlay so it does not push down the onboarding canvas.
- Settings / Local data shows OPFS and browser-profile storage labels instead of filesystem reveal links, desktop snapshots, or log export.
- Settings / Benchmarks keeps GUI benchmark runs, Playwright traces, flame graphs, and native diagnostics desktop-only.
- Catalog image attachment is desktop-only until browser image assets are persisted durably.

SENA analysis runs in the browser tab and is single-threaded there. Keep the tab open and awake while work is running.

## Browser Telegram automation

The browser app can save Telegram bot settings and poll Telegram directly from the active tab. This is not a daemon:

- Polling only runs while `/app` is open, visible, and awake.
- The bot token is stored in the browser profile.
- Clearing browser data can remove the saved token and automation state.
- Do not run the same bot token in desktop and browser at the same time unless you coordinate the handoff.
- Some browsers or networks may block direct Telegram API fetches. When that happens, banji reports a browser-blocked state and the desktop app is required for Telegram automation.

## Storage warnings

Browser storage is tied to the current browser profile. Clearing site data, switching profiles, or using private browsing can remove local browser data. Export backups regularly from the browser banner.

The browser app keeps a JSON document snapshot inside SQLite for backup/import compatibility and also mirrors the active workspace into structured OPFS tables for preferences, catalog, observations, order batches, analysis runs, summary/detail caches, diagnostics, and automation workspace state. The desktop app keeps using the Electron local data directory and backup flow documented in [Desktop runtime and local data](development/desktop-runtime-and-local-data.md).

## Verification

Use:

```bash
pnpm run build:web
```

For local preview:

```bash
pnpm run preview:web
```
