# Web runtime and OPFS

The browser app is separate from the Electron desktop runtime. The web entry lives in `src/renderer/src/main.web.tsx` and the public routes live under `src/renderer/src/routes/web`. The Electron dev renderer entry shares the same embedded-route detection so `/kaur-khor/demo`, `/kaur-khor/app`, and `/main` can be exercised without switching to the production web bundle.

## Routing

The public web build uses Vite with `base: '/kaur-khor/'` for GitHub Pages. Public routes are browser routes:

- `/kaur-khor/`
- `/kaur-khor/demo`
- `/kaur-khor/app`

Desktop download and install guidance is part of the overview page at `/kaur-khor/#releases`; there is no standalone `/install` route.

When the existing product app is mounted from `/demo` or `/app`, it is wrapped in a `HashRouter`. Product routes then live after the hash so GitHub Pages can serve the public entry while the existing app keeps its desktop route assumptions.

Use `src/renderer/src/routes/web/embedded-entry.ts` for browser-surface entry decisions. Keep production web routing and Electron dev routing aligned there instead of duplicating pathname parsing in each entry file.

## Runtime boundary

Do not expose Electron or Node APIs in the browser renderer. Browser runtime code must provide a `window.kaurKhorDesktop`-compatible bridge before mounting the existing app.

The demo path may use the seeded browser mock bridge. Its seed data should stay aligned with the generated dev catalog fixture, including the 10 Khmer SKUs, 10 Khmer services, catalog metadata, and bundled generated item images. The real browser app path must require supported browser persistence. If SQLite WASM or OPFS initialization fails, show an unsupported state rather than falling back to weaker storage for real data.

Browser SENA is single-threaded in this phase. `apps/sena-core` has a browser-safe feature path for pure analysis code without the desktop SQLite repository, filesystem artifacts, or Rayon thread pool. The web bridge keeps the startup contract compact, recomputes browser summary/detail/diagnostics on SENA runs, and persists the resulting read models into OPFS.

## OPFS notes

GitHub Pages does not provide custom COOP/COEP headers for this site, so browser persistence should prefer SQLite WASM modes that do not require cross-origin isolation. The intended durable storage target is OPFS in the user's browser profile.

Browser data is not the same as desktop app data. Clearing site data, browser profile data, or private browsing sessions can remove browser data.

After `/app` has opened durable storage, it triggers the browser's native leave-site warning before tab close or reload. The browser controls the native prompt text. The in-app banner carries Kaur Khor's exact warning copy and always directs the operator to export a backup before closing. Telegram-specific close warning text appears only when the browser bridge has a connected Telegram bot token.

The backup/import envelope remains a JSON document snapshot for compatibility. On every browser mutation, the storage worker also mirrors active state into structured tables for preferences, catalog, observations, order batches, analysis runs, workspace summary, diagnostics, detail caches, and automation workspace state.

## Desktop-only surfaces in the browser app

The browser bridge must not invent filesystem paths or pretend native tooling exists. Keep these boundaries visible in browser mode:

- Local data settings: display OPFS/browser-profile locations as text; use the browser app banner for backup import/export/reset.
- Native snapshots, restore-from-snapshot, folder reveal, and log export: desktop-only.
- Benchmark runner, Playwright trace capture, flame graphs, and native dev diagnostics: desktop-only.
- Item image persistence: desktop-only until browser assets are backed by durable storage.

## While-tab automation

Browser Telegram automation is a foreground tab workflow. The browser bridge stores the token in the browser profile and uses direct Telegram API fetches only while `/app` is open, visible, and awake. If the browser or network blocks Telegram fetch, the connection should move to an error/browser-blocked state and direct users to desktop for persistent automation.

Do not run a desktop app and a browser tab against the same Telegram bot token unless the operator has coordinated the handoff. Telegram update cursors are stateful, and two runtimes polling the same bot can steal updates from each other.
