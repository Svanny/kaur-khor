# Automation Workspace

Back to the docs index: [banji developer docs](/Users/svanny/banji/docs/README.md)

## Purpose

banji's automation workspace is the channel-facing staging layer for customer
intake. It currently targets Telegram and lets the operator:

- connect or pause the Telegram bot transport
- decide which SKUs and services are exposed to the bot
- review inbound customer conversations and intake rows
- resolve or promote inbound intake into ticket-backed operational history

The automation workspace is not the source of truth for inventory facts.
Promotion writes back into the main SENA workspace through ticket and
commercial events.

Automation visibility is controlled by Settings / Interface. When
`showAutomationsPage` is off, Work / Intake is hidden, Telegram polling is
paused, and main-process automation mutating IPC handlers reject operator
actions. Turning the switch back on resumes the poll loop.

## Main Pieces

Runtime and storage:

- [`src/main/automation-store.ts`](/Users/svanny/banji/src/main/automation-store.ts):
  persisted JSON store, intake staging, wizard session state, promotion helpers
- [`src/main/automation-telegram.ts`](/Users/svanny/banji/src/main/automation-telegram.ts):
  Telegram transport orchestration, bot commands, callbacks, notifications, and
  connection tests
- [`src/main/telegram-bot-api.ts`](/Users/svanny/banji/src/main/telegram-bot-api.ts):
  typed Telegram API client
- [`src/main/desktop-image.ts`](/Users/svanny/banji/src/main/desktop-image.ts):
  local image lookup for exposed SKU and service images
- [`src/main/window-activation.ts`](/Users/svanny/banji/src/main/window-activation.ts):
  desktop window activation helper for operator-facing follow-up

Renderer and shared contracts:

- [`src/renderer/src/routes/automations.tsx`](/Users/svanny/banji/src/renderer/src/routes/automations.tsx):
  shared automation section implementation used by Inbox intake, Catalog
  exposure, and Settings connection surfaces
- [`src/renderer/src/routes/automations/view-model.ts`](/Users/svanny/banji/src/renderer/src/routes/automations/view-model.ts):
  derived overview, intake, and exception rows
- [`src/shared/ipc.ts`](/Users/svanny/banji/src/shared/ipc.ts):
  preload/main IPC contract for automation actions
- [`src/shared/automation-sellables.ts`](/Users/svanny/banji/src/shared/automation-sellables.ts):
  sellable eligibility rules for exposure rows

## Canonical UI Placement

Automation is no longer a persistent top-level page. Its sections are mounted
under the intent-first destinations:

- `/work/intake?section=intake`: live intake and needs-review work
- `/catalog?section=automation`: exposure controls for SKU and service sellables
- `/settings/automation`: Telegram connection details and transport actions

The legacy `/automations` URL redirects into those canonical surfaces. Preserve
section route state when adding filters or deep links.

If automation is hidden by the interface preset or switch, route users back to
the remembered Work queue state rather than exposing a dead Intake tab.

## Telegram Contract

Telegram is currently the only supported automation channel.

Current bot command set:

- `/start`
- `/help`
- `/available`
- `/order`
- `/cart`
- `/cancel`
- `/preferences`

The transport layer is responsible for:

- validating and saving bot credentials
- registering Telegram commands and menu buttons
- polling updates and advancing the update cursor only while automations are
  enabled
- storing conversation and wizard message references
- sending customer notifications after ticket promotion or ticket-status changes

If you change the command surface or bot lifecycle, update this page and keep
the connection-card UI and IPC contract aligned.

## Persisted Store Shape

`desktop-automation-store.json` persists:

- connection state and last known bot identity
- Telegram update cursor
- exposure rules
- conversation summaries
- message records
- intake rows
- customer language and currency preferences
- per-conversation wizard sessions, including cart draft, selected item, and
  last wizard message IDs

Writes are serialized through the main-process queue in
`automation-store.ts`. Do not bypass that write path from renderer code.

## Promotion Rules

Promotion is the boundary between channel staging and operational history.

When an intake is promoted:

- banji prepares ticket and commercial events from the intake lines
- the intake is updated with the promoted ticket id and status
- the operational write lands in the main SENA workspace, not only in the JSON
  automation store
- the customer can be notified back through Telegram

If you change how intake rows turn into ticket events, update this page and
[`docs/development/ticketing-architecture.md`](/Users/svanny/banji/docs/development/ticketing-architecture.md)
together.

## Verification

Focused checks for automation changes:

- `pnpm test -- src/main/automation-store.test.ts`
- `pnpm test -- src/main/automation-telegram.test.ts`
- `pnpm test -- src/main/telegram-bot-api.test.ts`
- `pnpm test -- src/renderer/src/routes/automations.test.tsx`
- `pnpm test -- src/renderer/src/routes/automations/intake-openers.test.tsx`
- `pnpm test -- src/renderer/src/routes/automations/view-model.test.ts`

Final repo checks:

- `pnpm test`
- `pnpm build`
