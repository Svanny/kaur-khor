# Browser app

The public web build is a GitHub Pages surface for Kaur Khor. It exposes:

- `/` for the public overview
- `/demo` for a seeded browser preview
- `/app` for the browser app entry

GitHub Pages serves the site under `/kaur-khor/`, so the deployed URLs are `/kaur-khor/`, `/kaur-khor/demo`, and `/kaur-khor/app`. Desktop downloads and install notes live on the overview page at `/kaur-khor/#releases`.

## Runtime behavior

The desktop app remains the primary supported runtime. The browser routes use the web React entry in production, and the Electron dev renderer entry recognizes `/kaur-khor/demo`, `/kaur-khor/app`, and `/main` paths so local browser-surface debugging can use the same route detection.

The demo route mounts the existing renderer app inside a `HashRouter`, opens `kaur_khor_browser_demo_v1.sqlite3`, and keeps demo records separate from the browser-app database. A banner marks the route as demo data, and the reset action reseeds the demo workspace.
The demo seed uses the same 10 Khmer SKUs, 10 Khmer services, catalog prices, supplier metadata, and generated catalog images as the dev fixture, so `/demo` shows the richer local product catalog without requiring desktop storage.

The app route opens `kaur_khor_browser_app_v1.sqlite3` through SQLite WASM in a Web Worker. The runtime prefers SQLite's OPFS SyncAccessHandle Pool VFS (`opfs-sahpool`) so it can run on static hosting without requiring COOP/COEP headers. If OPFS or SQLite initialization is unavailable, the real app route shows an unsupported-browser state and does not silently fall back to weaker storage.

Browser mode keeps major product surfaces visible, but native-only desktop tools are shown as unavailable or replaced with browser equivalents. Browser-only banner copy uses the active workspace language, including Khmer translations for demo/reset/backup controls and browser close warnings:

- The app banner is the browser backup/import/reset surface.
- In the main browser and demo app views, the banner sits on the left rail and keeps the same vertical button coordinates when the navigation rail expands or collapses. Embedded browser mode keeps the desktop sidebar layout even at narrow browser widths so the rail and banner stay inspectable. On onboarding routes only, the banner becomes a floating top nav overlay so it does not push down the onboarding canvas.
- Settings / Local data shows OPFS and browser-profile storage labels instead of filesystem reveal links, desktop snapshots, or log export.
- Production browser and demo builds hide Settings / Benchmarks. Development builds keep it available for GUI benchmark runs, Playwright traces, flame graphs, and native diagnostics.
- Catalog image attachment is desktop-only until browser image assets are persisted durably.

SENA analysis runs in the browser tab and is single-threaded there. Keep the tab open and awake while work is running.

## Browser Telegram automation

The browser app can save Telegram bot settings and poll Telegram directly from the active tab. This is not a daemon:

- Polling only runs while `/app` is open, visible, and awake.
- The bot token is stored in the browser profile.
- Clearing browser data can remove the saved token and automation state.
- Do not run the same bot token in desktop and browser at the same time unless you coordinate the handoff.
- Some browsers or networks may block direct Telegram API fetches. When that happens, Kaur Khor reports a browser-blocked state and the desktop app is required for Telegram automation.

## Storage warnings

Browser storage is tied to the current browser profile. Clearing site data, switching profiles, or using private browsing can remove local browser data. Export backups regularly from the browser banner.

The real browser app route (`/app`) installs the browser's native leave-site warning after storage is ready. Browsers control the native dialog text, so Kaur Khor keeps the explicit warning in the app banner: export a backup before closing, and remember that browser cleanup, site-data removal, or private browsing cleanup can remove the workspace. When a Telegram bot is connected, the banner also states that closing the tab stops live Telegram listening and automation intake until `/app` is opened again.

The browser app keeps a JSON document snapshot inside SQLite for backup/import compatibility and also mirrors the active workspace into structured OPFS tables for preferences, catalog, observations, order batches, analysis runs, summary/detail caches, diagnostics, and automation workspace state. The desktop app keeps using the Electron local data directory and backup flow documented in [Desktop runtime and local data](development/desktop-runtime-and-local-data.md).

Invalid browser backup imports stay recoverable. If a selected file is malformed
or does not contain browser workspace state, the app reports the import problem
and leaves export/import controls available so the operator can retry or export
the current workspace before taking another action.

## Verification

Use:

```bash
pnpm run build:web
```

For local preview:

```bash
pnpm run preview:web
```
