# Web runtime and OPFS

The browser app is separate from the Electron desktop runtime. The web entry lives in `src/renderer/src/main.web.tsx` and the public routes live under `src/renderer/src/routes/web`.

## Routing

The public web build uses Vite with `base: '/banji/'` for GitHub Pages. Public routes are browser routes:

- `/banji/`
- `/banji/demo`
- `/banji/app`
- `/banji/install`

When the existing product app is mounted from `/demo` or `/app`, it is wrapped in a `HashRouter`. Product routes then live after the hash so GitHub Pages can serve the public entry while the existing app keeps its desktop route assumptions.

## Runtime boundary

Do not expose Electron or Node APIs in the browser renderer. Browser runtime code must provide a `window.banjiDesktop`-compatible bridge before mounting the existing app.

The demo path may use the seeded browser mock bridge. The real browser app path must require supported browser persistence. If SQLite WASM or OPFS initialization fails, show an unsupported state rather than falling back to weaker storage for real data.

## OPFS notes

GitHub Pages does not provide custom COOP/COEP headers for this site, so browser persistence should prefer SQLite WASM modes that do not require cross-origin isolation. The intended durable storage target is OPFS in the user's browser profile.

Browser data is not the same as desktop app data. Clearing site data, browser profile data, or private browsing sessions can remove browser data.
