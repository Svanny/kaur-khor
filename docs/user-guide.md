# banji User Guide

This guide explains how banji works as a day-to-day desktop inventory workspace. It is written for people using the app, not for contributors working on the codebase.

banji is local-first and desktop-first. It helps you keep a catalog, capture real-world changes, review what needs action now, and inspect planning, analysis, and cash signals without leaving the same workspace.

## Table of Contents

- [What banji Is For](#what-banji-is-for)
- [How The Main Workflow Fits Together](#how-the-main-workflow-fits-together)
- [Navigation And Global Controls](#navigation-and-global-controls)
- [Overview](#overview)
- [Record Update](#record-update)
- [Performance](#performance)
- [Financials](#financials)
- [Catalog](#catalog)
- [Analysis](#analysis)
- [Operations](#operations)
- [Archive](#archive)
- [Settings](#settings)
- [Help](#help)
- [Glossary](#glossary)
- [FAQ](#faq)

## What banji Is For

banji is for teams that want a practical inventory workspace on one machine without depending on a hosted back office. It is meant for:

- keeping a working catalog of SKUs and services
- capturing stock, customer, supplier, and price changes as they happen
- seeing what needs action next
- reviewing demand, capacity, and cash signals on the same device

banji is not trying to be:

- a full ERP
- a hosted multi-user SaaS suite
- a blank workflow builder for every inventory model

The product is opinionated. banji works best when you use the built-in catalog, update logging, overview queue, and analysis surfaces together.

## How The Main Workflow Fits Together

Most teams will use banji in this order:

1. Build the catalog in **Catalog** by creating SKUs and services.
2. Capture a real-world event in **Record update** by choosing the lane that matches what changed.
3. Review immediate follow-up work in **Overview**.
4. Compare demand, capacity, and operating pressure in **Performance**.
5. Inspect money-in, money-tied-up, and money-leaking signals in **Financials**.
6. Open **Analysis** when you need the deeper explanation behind a signal.
7. Use **Operations** to inspect saved update history, edit reports, or delete a mistaken report.
8. Adjust preferences, backups, archive access, and local planning controls in **Settings**.

If you are just starting:

1. Create the first SKU.
2. Add any services that depend on those SKUs.
3. Record one stock or order update.
4. Go back to Overview to see what banji can now infer from the saved data.

## Navigation And Global Controls

banji's left navigation is the main way to move through the product. The top-level destinations are:

- **Overview**: the current queue, the next move, and recent activity
- **Record update**: lane-based entry point for new operational updates
- **Performance**: demand, capacity, price, and timing comparison surfaces
- **Financials**: cash, profit, inventory capital, and leakage views
- **Catalog**: SKU and service records
- **Analysis**: deeper explanation surfaces for SKUs and services
- **Operations**: saved update history, heatmap, report inspection, editing, and deletion
- **Settings**: preferences, local data, planning controls, archive access, and maintenance actions
- **Help**: searchable in-app guide that mirrors the repository copy

Other global behaviors worth knowing:

- **Collapsed navigation** hides section text but keeps destinations available.
- **Command palette (`Cmd/Ctrl + K`)** is the fastest way to jump to a page, item, or action.
- **Search and filter controls** usually narrow what you see without changing saved data.
- **Helper copy and right-rail cards** can be reduced in Settings if you want a quieter interface.
- **Loading states** usually mean banji is opening the local workspace, refreshing saved data, or recomputing local analysis.

## Overview

### Purpose

Overview is banji's "what should I do next?" workspace. It is the best starting point after you have already created a catalog and saved at least one real update.

### When To Use It

Use Overview when you want to:

- see the strongest reorder or follow-up issues first
- switch between supplier-side and customer-side ticket work
- start the next update session
- open the next SKU or queue item that deserves inspection

### Key Panels

#### Recommended next move

This is banji's current best suggestion. Depending on the state of the workspace, it may tell you to:

- add the first SKU
- start the first update
- review reorder work
- update ETA or receipt status
- inspect a customer-impact task

#### Why this action now

This explains the reasoning behind the top recommendation. It may refer to:

- missing catalog setup
- missing live updates
- rising reorder pressure
- overdue follow-up
- customer demand impact

#### Needs attention / Planning queue

This queue organizes the items that deserve review next. It is meant to answer four questions quickly:

- what the move is
- why now
- what state the item is in
- what to open next

Overview opens on the **Supplier** queue by default. Switch to **Customer** when
you want to review open customer commitments, stock blockers, or ready-to-complete
customer work.

#### Recent activity

This summarizes what changed recently across saved updates. Use it when you need context before deciding whether to open Operations or start another update.

### Important Controls And Buttons

- **Supplier / Customer scope** switches the queue between supplier tickets and customer tickets.
- **Task filters** narrow the current family queue to issue types such as to order, awaiting receipt, need stock, or follow up today.
- **Search** narrows visible tasks and entities without changing saved data.
- **Supplier filter** narrows the page to one supplier slice.
- **Start update** opens the record-update hub.
- **Task drawer actions** can jump straight into the matching update lane or detail page.

### Common Mistakes

- Using Overview as a substitute for Record update. Overview helps you choose work; it does not capture new evidence.
- Treating every metric equally. The recommended move and queue should usually come first.
- Expecting useful prioritization before the first catalog item or first saved update exists.

## Record Update

### Purpose

Record update is banji's lane-based entry point for saving new operational evidence. Instead of one fixed wizard for every situation, banji lets you choose the kind of update you need to record.

### When To Use It

Use Record update when:

- stock counts changed
- new customer orders came in
- immediate sales happened or customer orders were fulfilled
- supplier orders were placed or changed
- supplier receipts arrived against an existing supplier ticket
- one event needs a combined custom capture flow

### Update Lanes

banji currently offers these lanes:

- **Stock Count**: count what is physically on hand and reconcile stock facts
- **Customer Order**: create a new customer ticket or update an existing customer ticket for open demand, changes, or cancellations
- **Immediate Sale**: record same-session sales that resolve immediately
- **Supplier Order**: create a new supplier ticket or update an existing supplier ticket for orders, ETA changes, and receipts
- **Custom**: combine multiple lanes into one guided flow

Draft badges on the hub mean banji found unfinished work saved on this device.

Customer Order and Supplier Order now ask whether you are creating a **new**
ticket or editing an **existing** ticket before the wizard continues.
Supplier receipts are captured inside **Supplier Order** when you choose to
update an existing supplier ticket.

### Important Controls And Buttons

- **Lane cards** open the matching capture flow.
- **New / existing ticket choice** appears for customer and supplier order lanes before the form opens.
- **Custom update builder** lets you choose multiple base lanes before starting.
- **Draft saved** badges tell you a draft already exists for that lane.
- **Save** commits the update and makes it available to Overview, Performance, Financials, Analysis, and Operations.
- **Back / Next** moves through the current lane without discarding the draft.
- **Discard draft** abandons the in-progress lane when you no longer want it.

### Common Mistakes

- Choosing a lane that does not match the event you are recording.
- Treating supplier receipt as a separate primary flow instead of updating the existing supplier ticket.
- Mixing unrelated real-world events into one update just because they happened on the same day.
- Forgetting to save after reviewing the final step.
- Ignoring saved drafts and starting duplicate work from scratch.

## Performance

### Purpose

Performance turns banji's local planning output into action-oriented comparisons. It is for prioritization, not raw data entry.

### When To Use It

Use Performance when you want to:

- see which items need action now
- compare services and SKUs across a short or medium time horizon
- review demand, available support, incoming stock, and price pressure together
- understand what banji thinks will happen next if nothing changes

### Key Panels

- **Move now**: the highest-priority action rows
- **Board**: side-by-side operational comparison across services and SKUs
- **Cash**: winners, blocked profit, and cash traps
- **Operational drag**: rows where friction is slowing useful work
- **Recovery pipeline**: rows likely to improve when incoming supply lands
- **Price watch**: price or margin conditions worth inspecting
- **Confidence and coverage**: how strong the current signal base is
- **Business timeline**: the important events shaping today's state

### Important Controls And Buttons

- **7d / 30d / 90d** changes the comparison window.
- **All / Services / SKUs** narrows the scope.
- **Supplier filter** narrows the page to one supplier slice.
- **Compare view** switches between current-only and side-by-side comparison.
- **Row actions** open the matching detail or workflow surface.

### Common Mistakes

- Treating Performance as a ledger of everything that happened. Operations is better for saved historical records.
- Reading one panel in isolation when the surrounding cards explain why the row matters.
- Expecting detailed explanations here instead of using Analysis.

## Financials

### Purpose

Financials turns the same local inventory state into a money view. It is where banji organizes what is bringing money in, what is tying money up, and what is leaking value.

### When To Use It

Use Financials when you want to:

- review net sales and gross profit signals
- see how much capital is sitting on hand or in transit
- inspect open commitments and slow stock
- find margin erosion, markdown pressure, or blocked profit

### Key Panels

- **Statement blocks**: money in, money tied up, and money leaking
- **Financial bands**: grouped rows that deserve attention now
- **Contributor table**: the services and SKUs driving the current money picture
- **Right rail**: quick summaries and follow-up pointers tied to the current range

### Important Controls And Buttons

- **1d / 7d / 30d / 90d** changes the financial window.
- **All / Services / SKUs** narrows the scope.
- **Supplier filter** narrows the page to one supplier slice.
- **Compare view** switches between current-only and comparison framing.
- **Rows and badges** jump to the underlying detail surface for inspection.

### Common Mistakes

- Reading Financials as accounting software. It is an operational money view, not a replacement for a full accounting system.
- Ignoring the compare labels when a number looks surprising.
- Treating capital tied up as the same thing as realized profit.

## Catalog

### Purpose

Catalog is the source of truth for the items banji tracks. This is where SKUs and services are created, edited, archived, and opened for deeper detail.

### When To Use It

Use Catalog when you want to:

- create a new SKU or service
- search by name, description, or identifier
- filter the catalog by supplier
- edit an item's definition or archive it

### Important Controls And Buttons

- **New SKU / New service** starts creation flows.
- **Search catalog** narrows visible rows without changing saved data.
- **All / SKUs / Services** changes the current list slice.
- **Supplier filter** narrows the visible catalog to one supplier.
- **Action menus** let you edit, archive, or inspect an item.

### Common Mistakes

- Treating archive as delete. Archived items stay available historically and can be restored later.
- Forgetting to add service dependencies after creating the related SKU records.
- Using Catalog for day-to-day update capture instead of Record update.

## Analysis

### Purpose

Analysis is the deeper explanation workspace. It helps answer "why does banji think this?" rather than only "what should I do next?"

### When To Use It

Use Analysis when you want to:

- inspect the signal story behind a SKU or service
- compare sections such as pressure, observations, fragility, and settings
- change scope across all items, services only, or SKUs only
- load older intervals and expand the chart view

### Important Controls And Buttons

- **Section tabs** switch between workbench, pressure, observations, fragility, and settings.
- **Timeframe controls** change the analysis interval.
- **Scope toggle** narrows the page to services, SKUs, or both.
- **Supplier filter** narrows the page to one supplier slice.
- **Expanded chart** opens a wider view when the current interval history needs more space.

### Common Mistakes

- Opening Analysis before any real update was saved and expecting detailed output.
- Using Analysis for data entry. It is an explanation surface, not an editing workflow.
- Ignoring the scope and supplier filters when the page seems thinner than expected.

## Operations

### Purpose

Operations is the saved update history workspace. It is where banji shows the reports that were captured over time and lets you inspect, edit, or delete them.

### When To Use It

Use Operations when you need to:

- search saved updates
- inspect activity across the recent year in the heatmap
- switch to an all-reports list
- reopen a report for editing
- delete a mistaken report

### Important Controls And Buttons

- **Search** looks through notes, SKU names, service names, and related identifiers.
- **All / SKUs / Services** narrows the current history slice.
- **Supplier filter** narrows the page to one supplier slice.
- **Heatmap / All** switches between the contribution calendar and paginated report cards.
- **Previous year / Next year** changes the visible heatmap year.
- **Edit report** reopens a saved report in the matching update flow.
- **Delete report** permanently removes a report after confirmation.

### Common Mistakes

- Using Operations as a substitute for Overview. Operations explains what was saved, not what to do next.
- Deleting a report when editing it would be safer.
- Forgetting that the heatmap and list are showing the currently filtered history, not the full workspace.

## Archive

### Purpose

Archive stores catalog items that should no longer appear in active workspaces but still matter historically.

### When To Use It

Use Archive when you want to:

- review inactive SKUs or services
- restore an item to active work
- search inactive items without mixing them into the live catalog

### Important Controls And Buttons

- **Search archive** narrows visible archived items.
- **All / SKUs / Services** changes the archive slice.
- **Supplier filter** narrows the archive to one supplier.
- **Unarchive** restores the selected item to active workspaces.

### Common Mistakes

- Expecting archived items to remain visible in active planning pages.
- Using archive as permanent deletion.
- Forgetting that Archive is reached from Settings navigation.

## Settings

### Purpose

Settings controls how banji behaves on this device. It combines preferences, local workspace actions, planning controls, archive access, and maintenance flows.

### Main Sections

- **Workspace**: language, currency, image display, and other day-to-day workspace defaults
- **Interface**: optional guidance, right-rail cards, compare toggles, and other visibility controls
- **Local data**: local workspace paths, backup snapshots, restore, reveal-path actions, and clear-data controls
- **Planning**: local planning parameters and rerun controls
- **Archive**: shortcut into the inactive catalog view
- **Danger zone**: destructive maintenance actions
- **Credits**: product credits and acknowledgements

### Important Controls And Buttons

- **Save preferences** commits changed settings on this device.
- **Create backup snapshot** creates a point-in-time backup before risky work.
- **Restore backup snapshot** rolls the workspace back to a saved snapshot.
- **Reveal path** opens the underlying local data path in the OS.
- **Clear current data** removes local workspace data after confirmation.
- **Planning parameters** let you adjust the local analysis behavior and trigger a rerun.

### Common Mistakes

- Changing interface switches and expecting them to affect other devices automatically.
- Skipping a backup snapshot before destructive maintenance.
- Treating restore as a lightweight undo. It changes the local workspace state.

## Help

### Purpose

Help is banji's searchable in-app guide. It mirrors the repository copy of this document and keeps the main workflows, controls, glossary, and FAQ in one place.

### Important Controls And Buttons

- **Search help** finds sections by workflow, control, or question.
- **Index** jumps directly to the matching section.
- **Open overview** returns to the main workspace.
- **Start update** jumps directly to the record-update hub.
- **Open repository copy** opens the matching markdown guide in the repository.

### Common Mistakes

- Expecting Help to change workspace data. It is reference material only.
- Forgetting that the repository copy and the in-app page are meant to stay in sync.

## Glossary

- **Record update**: a saved operational snapshot captured through one of banji's update lanes
- **Lane**: one update flow type, such as stock count or supplier receipt
- **Overview queue**: banji's current recommendation list for what deserves attention next
- **Performance**: action-oriented comparison of demand, capacity, timing, and price signals
- **Financials**: money-in, money-tied-up, and money-leaking surfaces
- **Analysis**: deeper explanation of the signals behind banji's recommendations
- **Operations**: saved update history, including heatmap and report editing
- **Archive**: inactive catalog records kept out of active workspaces but preserved historically
- **Backup snapshot**: a saved copy of the local workspace state created from Settings

## FAQ

### What is the difference between Overview, Performance, Financials, and Analysis?

- **Overview** tells you what deserves attention now.
- **Performance** compares operational pressure and likely follow-up moves.
- **Financials** shows the same situation through a money lens.
- **Analysis** explains the signals underneath those recommendations in more detail.

### Why is Analysis empty or limited?

Analysis needs a real catalog and saved updates. If nothing meaningful has been recorded yet, banji does not have enough local evidence to show detailed analysis.

### Where did Logs go?

The history workspace now lives under **Operations**. That page contains the update heatmap, the saved report list, and the edit/delete controls for reports.

### What is the difference between Operations and Archive?

- **Operations** stores saved update history.
- **Archive** stores inactive SKUs and services.

They solve different problems. Operations is historical activity; Archive is inactive catalog state.

### Can I edit or delete a saved report?

Yes. Operations lets you reopen a saved report for editing or permanently delete it after confirmation.

### How should I use backup snapshots?

Create a backup snapshot before risky maintenance, before restoring older data, or before clearing current local data. Backup and restore live in Settings under local data controls.
