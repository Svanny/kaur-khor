# Browser app

The public web build is a GitHub Pages surface for Kaur Khor. It exposes:

- `/` for the public overview
- `/demo` for a seeded browser preview
- `/app` for the browser app entry

GitHub Pages serves the site under `/kaur-khor/`, so the deployed URLs are `/kaur-khor/`, `/kaur-khor/demo`, and `/kaur-khor/app`. Desktop downloads and install notes live on the overview page at `/kaur-khor/#releases`.

## Runtime behavior

The desktop app remains the primary supported runtime. The browser routes use the web React entry in production, and the Electron dev renderer entry recognizes `/kaur-khor/demo`, `/kaur-khor/app`, and `/main` paths so local browser-surface debugging can use the same route detection.

The demo route mounts the existing renderer app inside a `HashRouter`, opens `kaur_khor_browser_demo_v1.sqlite3`, and keeps demo records separate from the browser-app database. A banner marks the route as demo data, and the reset action reseeds the demo workspace.
The demo seed uses the same 10 Khmer SKUs, 10 Khmer services, product prices, supplier metadata, and generated product images as the dev fixture, so `/demo` shows the richer local products view without requiring desktop storage.

The app route opens `kaur_khor_browser_app_v1.sqlite3` through SQLite WASM in a Web Worker. The runtime prefers SQLite's OPFS SyncAccessHandle Pool VFS (`opfs-sahpool`) so it can run on static hosting without requiring COOP/COEP headers. If OPFS or SQLite initialization is unavailable, the real app route shows an unsupported-browser state and does not silently fall back to weaker storage.

Browser mode keeps major product surfaces visible, but native-only desktop tools are shown as unavailable or replaced with browser equivalents. Browser-only banner copy uses the active workspace language, including Khmer translations for demo/reset/backup controls and browser close warnings:

- The app banner is the browser backup/import/reset surface.
- In the main browser and demo app views, the banner sits on the left rail and keeps the same vertical button coordinates when the navigation rail expands or collapses. Embedded browser mode keeps the desktop sidebar layout even at narrow browser widths so the rail and banner stay inspectable. On onboarding routes, the banner stays in the page flow above the onboarding panel instead of floating over the canvas.
- Demo onboarding exposes backup/import/reset and main-page actions only. The browser-app route keeps its download action, but the demo route no longer links to `/app` from the embedded banner.
- Phone portrait views use the embedded operator shell instead of exposing the
  full desktop workspace in a cramped upright frame. The shell keeps the
  practical daily flow in Today, Queue, Capture, and Products tabs, with
  Insights kept in code but hidden until that phone surface is ready.
  The phone implementation uses shared mobile primitives for pages, sections,
  cards, action rows, chips, metrics, bottom sheets, loading/empty/error states,
  and capture review/result panels so route surfaces keep consistent spacing,
  focus rings, safe-area behavior, and touch target sizing.
  Today opens its next-action hero, merged queue metrics, inventory-today
  summary table, four quick record actions, and latest saved update as the
  phone home surface. The queue metric strip is a single linked row with
  vertical dividers, and the inventory table reuses catalog images while
  showing current, units-in, and units-out counts for the day.
  Queue keeps supplier/customer scope, compact filter chips, search, and the
  open task sheet in the phone URL so browser back/forward restores the visible
  task set. Supplier cards include supplier/state context and ETA or recommended
  quantity detail; customer cards include source/state/contact context and
  pending, completed, or blocked quantity detail. Queue task sheets include a
  compact action form with quantity/date/note fields, a local saved outcome, a
  related SKU or service link when the selected task has a direct entity target,
  and a scoped capture link for full persistence. Sheet Save persists sparse
  SENA evidence for supplier SKU order/receipt actions and customer SKU/service
  actions, plus ticket event revisions for customer/supplier ticket tasks;
  scoped capture remains available when the operator needs the full desktop
  ticket form. Batch controls appear only for real grouped supplier work, keeping
  single-task saves single by default while offering an Update group route when
  grouped SKU targets exist.
  Products opens phone-native SKU/service lookup and summary detail pages with
  URL-backed search, a segmented SKU/service type toggle, quick filters, status
  cards, and item-name detail headers. Search matches SKU name/id/supplier and
  service name/linked SKU terms, and query/filter state is preserved when
  opening a detail and returning to the search list. SKU and service detail pages
  use row-divided metric summaries and a titled Actions section instead of
  nested metric cards, tabs, refresh-detail panels, ledger placeholders, or
  back-to-products actions.
  Capture reuses the shared desktop record-update hub and session routes in an
  embedded phone presentation. The phone hub exposes the four desktop-visible
  capture modes: Stock Count, Supplier Order, Immediate Sale, and Customer
  Order. Supplier receipts remain supported by the shared Supplier Order update
  flow instead of appearing as a separate primary phone lane. Queue, Capture,
  and product detail actions pass the same capture context grammar for source,
  breadcrumb, target, likely mode, quantity or evidence hints, ticket,
  supplier/customer context, and return route before entering the shared
  session. Mobile session screens keep the desktop save and draft logic, but
  move back, subtitle, draft status, discard, and done controls into the phone
  header. Workbench item lists render as row-by-row phone cards, supplier filters
  share a row with search, and desktop right-drawer surfaces become bottom
  drawers on phone. If the user tries to leave capture with an edited draft,
  phone mode shows a centered confirmation dialog and keeps the draft until the
  user explicitly discards it.
  The top workspace-safety control opens the Settings route except when already
  on Settings, where it is hidden. The phone settings route exposes
  Configurations with backup/import, Preferences for language/currency/USD to
  KHR exchange rate, History, Local data, and a separated Danger zone. Phone
  history groups recent
  saved facts by Stock Count, Customer Orders Pending, Customer Orders
  Completed, Supplier Orders Pending, Supplier Receipts, Corrections, and
  Price/cost changes, with a compact detail sheet for the changed state layer.
  Empty browser workspaces get route-specific phone states: Today starts with
  products, Queue explains that work needs products or a first update, Capture
  blocks record lanes until a SKU/service exists, Products distinguishes no
  catalog from no search results, and Insights names missing inventory or
  evidence instead of showing fake metrics. Initial phone route loading uses
  named mobile frames for workspace, queue, capture, product/detail, insight,
  and history preparation, and capture save failures keep the draft visible with
  Retry and Keep draft actions. The phone safety sheet and settings safety
  route also show storage feedback for unsupported storage, missing backups,
  demo-backup context, successful backup exports, and rejected backup imports.
  If workspace evidence refresh fails, phone mode keeps the current route visible
  and shows Retry plus Open safety actions above the route content. Insight
  routes also expose a phone-local Refresh analysis action; failed runs keep the
  lens open with Retry and Open safety actions. Phone update history can refresh
  observations in place; failed observation listing keeps existing rows visible
  with Retry and Open safety actions. SKU and service detail hydration keeps the
  catalog summary and actions usable without showing a phone-local refresh card.
  Sparse evidence is labeled with Unknown,
  Estimated, Fresh count, or Stale count where phone mode shows confidence or
  freshness.
  Insights code still contains phone-native Inventory, Money, and Explain
  routes with compact stock-health, statement/contributor, and model-posture
  sections instead of blocking the whole section. Inventory scope/range, Money
  scope/compare, and Explain section/timeframe controls are URL-backed so
  browser back/forward and deep links preserve the selected lens state.
  Inventory also provides phone-specific entity/supplier filters, Health/Flow/
  Forecast/Pipeline list modes, horizon chips, row inspectors with stock,
  flow, projection, evidence, and action sections, and a compact projection
  preview so operators can triage stock health without the desktop table.
  Money keeps a statement-first economics surface on phone with range/scope/
  supplier filters, a top ribbon, Money in / Money tied up / Money leaking
  blocks, contributor cards, quality bands, translated right-rail summaries,
  and a coverage action back to Record Update.
  Explain provides phone diagnostics for model posture, evidence freshness,
  top signals, fragile entities, recent evidence timeline, and a clear
  wide-workbench boundary so trust signals remain available without rendering
  the chart-heavy desktop analysis workbench in portrait mode.
  Unsupported Work/Catalog
  subroutes and unknown links stay behind a phone boundary that tells the
  operator to use a wider view instead of mounting the dense desktop workspace
  inside portrait mode. The full desktop/browser workspace remains the
  supported surface for regular advanced settings, editing, and custom
  multi-lane work.
- Settings / Local data shows OPFS and browser-profile storage labels instead of filesystem reveal links, desktop snapshots, or log export.
- Production browser and demo builds hide Settings / Benchmarks. Development builds keep it available for GUI benchmark runs, Playwright traces, flame graphs, and native diagnostics.
- Product image attachment is desktop-only until browser image assets are persisted durably.

SENA analysis runs in the browser tab and is single-threaded there. Keep the tab open and awake while work is running.

## Mobile install surface

The web build ships a PWA manifest, mobile install metadata, raster home-screen icons, wide and phone install-prompt screenshots, and a same-origin service worker so `/kaur-khor/app` can be added to a phone or tablet home screen from browsers that support installable web apps. The manifest starts in the durable browser app route, uses standalone display mode, allows portrait or landscape orientation, and exposes shortcuts for the browser app and demo.

The service worker only caches same-origin static assets. Workspace data remains in the browser profile database and still requires regular JSON exports from the banner; installing the web app on a home screen does not create a desktop-style app data directory or background automation daemon.

Phone portrait workspace safety exposes the same browser backup/import/reset
actions as the wide browser banner. A home-screen install does not change that
storage model: operators still need to export backups before clearing browser
data or changing profiles.

## Browser Telegram automation

The browser app can save Telegram bot settings and poll Telegram directly from the active tab. This is not a daemon:

- Polling only runs while `/app` is open, visible, and awake.
- The bot token is stored in the browser profile.
- Clearing browser data can remove the saved token and automation state.
- Do not run the same bot token in desktop and browser at the same time unless you coordinate the handoff.
- Some browsers or networks may block direct Telegram API fetches. When that happens, Kaur Khor reports a browser-blocked state and the desktop app is required for Telegram automation.

## Storage warnings

Browser storage is tied to the current browser profile. Clearing site data, switching profiles, or using private browsing can remove local browser data. Export backups regularly from the browser banner in a wide or sideways view.

The real browser app route (`/app`) keeps the explicit warning in the app banner instead of installing the browser's native leave-site warning, so reload remains available. Export a backup before closing, and remember that browser cleanup, site-data removal, or private browsing cleanup can remove the workspace. When a Telegram bot is connected, the banner also states that closing the tab stops live Telegram listening and automation intake until `/app` is opened again.

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

Focused mobile and install-surface checks:

```bash
pnpm test -- src/renderer/src/routes/web/pwa-assets.test.ts
pnpm pwa:verify
pnpm ui:matrix:mobile
pnpm screenshots:mobile
```

`pnpm test -- src/renderer/src/routes/web/pwa-assets.test.ts` checks the
static PWA contract: mobile viewport and Apple metadata, manifest routes,
service-worker cache boundaries, production-only service-worker registration,
icon sizes, and install screenshot dimensions in both `public/screenshots` and
`docs/readme`.

`pnpm pwa:verify` builds the production web app, serves it through the Vite
preview server, checks the served HTML install metadata, manifest semantics,
apple-touch icon size, manifest icon/screenshot dimensions, service-worker
controller path, and online/offline phone shell routes.

`pnpm screenshots:mobile` writes the phone install screenshots from a production
preview. It uses `cwebp` when available and falls back to ImageMagick `magick`
for WebP encoding.

For local preview:

```bash
pnpm run preview:web
```
