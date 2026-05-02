# Browser app

The public web build is a GitHub Pages surface for banji. It exposes:

- `/` for the public overview
- `/demo` for a seeded browser preview
- `/app` for the browser app entry
- `/install` for desktop install guidance

GitHub Pages serves the site under `/banji/`, so the deployed URLs are `/banji/`, `/banji/demo`, `/banji/app`, and `/banji/install`.

## Runtime behavior

The desktop app remains the primary supported runtime. The browser routes use a web-only React entry and do not change the Electron `src/renderer/src/main.tsx` entry.

The demo route mounts the existing renderer app inside a `HashRouter`, opens `banji_browser_demo_v1.sqlite3`, and keeps demo records separate from the browser-app database. A banner marks the route as demo data, and the reset action reseeds the demo workspace.

The app route opens `banji_browser_app_v1.sqlite3` through SQLite WASM in a Web Worker. The runtime prefers SQLite's OPFS SyncAccessHandle Pool VFS (`opfs-sahpool`) so it can run on static hosting without requiring COOP/COEP headers. If OPFS or SQLite initialization is unavailable, the real app route shows an unsupported-browser state and does not silently fall back to weaker storage.

## Storage warnings

Browser storage is tied to the current browser profile. Clearing site data, switching profiles, or using private browsing can remove local browser data. Export backups regularly from the browser banner.

The browser app stores one JSON document snapshot inside SQLite for the first web release. Schema tables also exist for future normalized catalog, observation, order batch, analysis, and automation storage. The desktop app keeps using the Electron local data directory and backup flow documented in [Desktop runtime and local data](development/desktop-runtime-and-local-data.md).

## Verification

Use:

```bash
pnpm run build:web
```

For local preview:

```bash
pnpm run preview:web
```
