# Intent-First UI Overhaul

Back to the docs index: [Kaur Khor developer docs](../README.md)

This note records the UI refactor guided by
[`docs/development/user-decision-tree.mmd`](user-decision-tree.mmd).

## Canonical Destinations

Persistent app navigation is limited to:

- `/`: Home command surface
- `/work`: operator workspace hub (queue, intake, capture)
- `/work/queue`: supplier/customer queue
- `/work/intake`: automation intake
- `/work/capture`: lane-based update authoring
- `/catalog`: active products, archived products, and automation exposure
- `/insights`: Performance, Financials, and Analysis modes
- `/settings`: preferences, local data, planning, automation connection, help,
  benchmarks, and danger zone

Non-persistent destinations remain available through context links and command
palette:

- `/history`: saved update history, formerly Operations
- `/catalog?status=archived`: archived products, formerly Archive
- `/settings/help`: Help

## Compatibility Redirects

Old page URLs must redirect instead of dead-ending:

- `/record-update` and old lane paths redirect to `/work/capture` paths.
- `/performance`, `/financials`, and `/analysis` redirect to `/insights` with
  the matching `mode`.
- `/automations` redirects to Work intake, Products, or Settings depending on section.
- `/operations` redirects to `/settings/history`.
- `/operations/archive` redirects to `/catalog?status=archived`.
- `/help` redirects to `/settings/help`.

## Boundaries

This refactor is UI and route architecture only. It must not change shared IPC,
Rust storage, database schema, ticket schema, or SENA calculations.

The old business views are reused inside the new IA:

- Dashboard/Overview model becomes Inbox queue.
- Record Update internals become Capture.
- Performance, Financials, and Analysis become Insights modes.
- Archive becomes Products archived status.
- Automations is split across Inbox intake, Products exposure, and Settings
  connection.

## Route State

Route state belongs in `src/renderer/src/lib/navigation-state.ts`. New canonical
builders should be used for new code:

- `buildInboxHref`
- `buildCaptureHref`
- `buildCatalogHref`
- `buildInsightsHref`
- `buildHistoryHref`

Compatibility builders may remain temporarily, but they should return canonical
paths.
