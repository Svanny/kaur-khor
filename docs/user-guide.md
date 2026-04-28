# banji User Guide

banji is a local-first desktop inventory workspace. It helps an operator keep a catalog, capture real-world changes, review what needs action, and inspect operational signals without leaving the app.

## Table of Contents

- [What banji Is For](#what-banji-is-for)
- [Daily Workflow](#daily-workflow)
- [Navigation](#navigation)
- [Home](#home)
- [Work](#work)
- [Catalog](#catalog)
- [Insights](#insights)
- [History](#history)
- [Settings And Help](#settings-and-help)
- [FAQ](#faq)

## What banji Is For

banji is for teams that want a practical inventory command app on one machine. It is meant for:

- keeping active and archived SKU/service records
- capturing stock counts, customer orders, sales, supplier orders, receipts, and custom updates
- reviewing supplier and customer work that needs attention
- understanding demand, capacity, money, and explanation signals from saved local data
- preserving update history without sending the workspace to a hosted back office

banji is not a full ERP, accounting system, or blank workflow builder.

## Daily Workflow

Most operators should use banji in this order:

1. Start on **Home**.
2. Open **Work** to review queue, capture, and intake work.
3. Use **Work / Capture** when something real changed.
4. Open **Catalog** when item definitions, archive state, or automation exposure need attention.
5. Open **Insights** when you need pressure, money, or explanation views.
6. Use **History** from the command palette or Settings when you need saved reports, edits, or deletions.
7. Use **Settings** for preferences, local data, planning, automation connection, help, benchmarks, and destructive maintenance.

## Navigation

The persistent sidebar is intentionally small:

- **Home**: command home and daily entry point
- **Work**: queue, capture, and intake
- **Catalog**: active items, archived items, details, edits, and automation exposure
- **Insights**: Pressure, Money, and Explain modes
- **Settings**: system, support, local data, automation connection, and maintenance

Moved destinations remain reachable:

- **History** is available from command palette, Settings, and report contexts.
- **Archived catalog** is available in Catalog with archived status.
- **Help** lives in Settings at `/settings/help`.
- **Automation intake** lives in Work; automation exposure lives in Catalog; Telegram connection lives in Settings.

Old top-level URLs are no longer supported.

## Home

Home is the first screen. It is a quiet command surface with four primary actions:

- **Continue Work**
- **Capture Update**
- **Open Catalog**
- **Open Insights**

The four actions sit in a centered 2x2 command grid, matching the Capture hub layout.

Use Home when you are not sure where to begin. It points you toward the next practical operator action without exposing backend or analysis jargon.

## Work

Work is banji's "what needs attention now?" workspace.

Use Work to:

- review the supplier queue, which remains the default daily queue
- switch to customer work when customer commitments need attention
- open task drawers and jump to the matching detail or Capture lane
- review Telegram/customer intake in the Intake section
- capture real-world changes through the lane hub

Important controls:

- **Queue / Capture / Intake** switches between decision work, update authoring, and automation intake.
- **Supplier / Customer** switches the queue family.
- **Task filters** narrow the current queue.
- **Search** and **Supplier filter** narrow visible work without changing saved data.

Work Queue helps choose work. Work Capture saves new operational evidence.

Use Capture when:

- stock counts changed
- new customer orders came in
- immediate sales happened
- supplier orders were placed or changed
- supplier receipts arrived against an existing supplier ticket
- one real-world event needs a custom combined capture flow

Canonical lanes:

- `/work/capture/stock-count`
- `/work/capture/customer-order`
- `/work/capture/immediate-sale`
- `/work/capture/supplier-order`
- `/work/capture/custom`

Customer Order and Supplier Order ask whether you are creating a new ticket or updating an existing ticket before the wizard continues. Supplier receipt stays inside Supplier Order when updating an existing supplier ticket.

Drafts, resume/delete behavior, save semantics, and ticket-backed authoring remain the same.

## Catalog

Catalog is the source of truth for SKU and service definitions.

Use Catalog to:

- create or edit SKUs and services
- search and filter active sellables
- open SKU/service detail pages
- archive or unarchive items
- review archived items with `status=archived`
- manage automation exposure for customer-facing sellables

Archive is not delete. Archived items are hidden from active work but remain available historically and can be restored.

## Insights

Insights is one workspace for reading operating signals.

Modes:

- **Pressure**: demand, capacity, timing, price pressure, comparison, and prioritization.
- **Money**: sales, gross profit signals, capital tied up, margin pressure, and leakage.
- **Explain**: explanation surfaces for why banji is producing a signal.

Mode-specific state is preserved:

- Pressure keeps range, scope, supplier, and compare state.
- Money keeps range, scope, supplier, and compare state.
- Explain keeps section, timeframe, supplier, and expanded chart state.

Insights is for reading and deciding. It is not a data-entry workflow.

## History

History is the saved update history workspace. It is a maintenance/context surface, not a persistent sidebar destination.

Use History to:

- search saved reports
- inspect the heatmap or all-reports list
- open a saved report
- edit a report through the matching Capture flow
- delete a mistaken report after confirmation

History explains what was saved. Work explains what deserves attention now.

## Settings And Help

Settings contains:

- workspace preferences
- interface visibility controls
- local data, backup, restore, and clear-data actions
- local planning parameters
- Telegram automation connection and test-message state
- in-app Help at `/settings/help`
- benchmarks
- danger zone
- credits

Help mirrors this user guide and can be searched inside the app.

## FAQ

### Why is Home different from Work?

Home is the command entry point. Work is the queue, capture, and intake workspace.

### Where did the old signal pages go?

They are modes inside **Insights**: Pressure, Money, and Explain.

### Where did Automations go?

Automation intake moved to **Work**. Exposure controls moved to **Catalog**. Telegram connection and test-message controls moved to **Settings**.

### Where is update history?

History lives in **Settings** and contextual report actions.

### Where did Archive go?

Archive is now the archived status inside **Catalog**.

### Can I still use old links?

No. Use the canonical Home, Work, Catalog, Insights, and Settings routes.
