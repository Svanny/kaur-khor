# Banji User Guide

This guide explains how Banji works as a day-to-day desktop inventory workspace. It is written for operators and small teams using the product, not for contributors working on the codebase.

Banji is local-first and desktop-first. It helps you keep a catalog, log real-world updates, review what changed, and use Banji's local analysis to decide what needs attention next.

## Table of Contents

- [What Banji Is For](#what-banji-is-for)
- [How The Main Workflow Fits Together](#how-the-main-workflow-fits-together)
- [Navigation And Global Controls](#navigation-and-global-controls)
- [Overview](#overview)
- [Record Update](#record-update)
- [Performance](#performance)
- [Catalog](#catalog)
- [Analysis](#analysis)
- [Logs](#logs)
- [Archive](#archive)
- [Settings](#settings)
- [Glossary](#glossary)
- [FAQ](#faq)

## What Banji Is For

Banji is for teams that want a practical inventory workspace on one machine without depending on a cloud back office. It is meant for:

- keeping a working catalog of SKUs and services
- capturing stock changes and service signals as they happen
- seeing what needs action next
- reviewing local planning and performance signals

Banji is not trying to be:

- a full ERP
- a hosted multi-user SaaS suite
- a blank workflow builder for every inventory model

The product is opinionated. The best experience comes from using the built-in catalog, update logging, and analysis workflow together.

## How The Main Workflow Fits Together

Most teams will use Banji in this order:

1. Build the catalog in **Catalog** by creating SKUs and services.
2. Capture a real-world snapshot in **Record update**.
3. Review immediate follow-up work in **Overview**.
4. Inspect saved history in **Logs**.
5. Review prioritization and planning signals in **Performance** and **Analysis**.
6. Adjust local preferences, exports, backups, and planning behavior in **Settings**.

If you are just starting:

1. Create the first SKU.
2. Add any service bundles that depend on those SKUs.
3. Run the first record update.
4. Go back to Overview to see what Banji can now infer from the saved data.

## Navigation And Global Controls

Banji's left navigation is the main way to move through the product. The top-level destinations are:

- **Overview**: the next operational move and the current queue
- **Record update**: guided workflow for capturing a new update
- **Performance**: prioritized tables and performance-focused decision surfaces
- **Catalog**: SKU and service records
- **Analysis**: deeper explanation surfaces for SKUs and services
- **Logs**: saved update history
- **Archive**: archived catalog items
- **Settings**: local preferences, exports, backups, and local planning controls

Global behaviors worth knowing:

- **Collapsed navigation** hides section text but still keeps destinations available.
- **Search / Command palette shortcut (`Cmd/Ctrl + K`)** opens the command palette quickly.
- **Loading states** usually mean Banji is opening the local workspace, refreshing saved data, or recomputing local analysis.
- **Tooltips and helper copy** explain many labels and metrics. They can be reduced in Settings if you want a quieter interface.

## Overview

### Purpose

Overview is Banji's "what should I do next?" workspace. It is the best starting point after you have already created a catalog and saved at least one update.

### When To Use It

Use Overview when you want to:

- see the strongest stock or reorder issues first
- start the next update session
- check recent activity without digging through full history
- open the next SKU or queue item that needs review

### Key Panels

#### Recommended next move

This is Banji's current best suggestion. Depending on the state of the workspace, it may tell you to:

- add the first SKU
- start the first update session
- review reorder priorities
- start another update session

This panel is intentionally opinionated. Treat it as the fastest way back into useful work.

#### Why this action now

This explains the reasoning behind the top recommendation. It may refer to:

- missing catalog setup
- missing live updates
- rising reorder pressure
- elevated stock risk
- a steady workspace with no urgent issue

#### Needs attention / Planning queue

This queue organizes the items that deserve review next. Common cues include:

- reorder pressure
- high risk
- service impact
- low confidence

Each row is meant to answer four questions quickly:

- what the move is
- why now
- what state the item is in
- what to open next

#### Recent activity

This summarizes what changed recently across saved updates. Use it when you need context before deciding whether to open Logs or start another update.

#### Quick actions

These are shortcuts into the main workflows, such as opening Catalog or starting a new update session. They are useful when you know what you need to do and do not need the rest of the page.

### Important Controls And Buttons

- **Queue filters** narrow the queue to one issue type, such as "To order" or "Follow up today."
- **Search** narrows visible tasks and entities without changing saved data.
- **Review SKU** opens the underlying SKU detail view for deeper inspection.
- **Open catalog / Open logs / Start update session** are workflow shortcuts, not separate data states.

### Common Mistakes

- Using Overview as a substitute for Record update. Overview helps you choose work; it does not capture new evidence.
- Treating background metrics as the main decision surface. The queue and recommendation panels should usually come first.
- Expecting useful prioritization before the first catalog item or first saved update exists.

## Record Update

### Purpose

Record update is the guided workflow for saving a new operational snapshot. This is where Banji learns what changed in the real world.

### When To Use It

Use Record update when:

- stock counts changed
- an order was placed
- goods were received
- a service became blocked or unblocked
- prices changed
- you want Banji's analysis to reflect the current situation

### How The Steps Work

Banji guides you through five steps.

#### 1. Record update details

This is the context step. It captures:

- the observed time
- notes about the update
- the sales pattern / regime hint, if you want to describe overall demand behavior

Use this step to explain the conditions around the update, especially if today is unusual.

#### 2. Add stock counts

This step records SKU-level stock facts. Depending on the item and current workflow state, you may capture:

- current counted quantity
- order signals
- receipt signals
- blocked or stockout status

The stock view filters change how much of the catalog you see:

- **Priority** shows the most important rows first
- **Counted** focuses on rows already touched in the draft
- **All** shows all eligible SKUs

#### 3. Add service updates

This step records service-side signals such as:

- price changes
- blocked or stockout conditions

Use it when a service is affected even if no new SKU count was taken at the same time.

#### 4. Rank recent selling order

This step captures recent selling order for services and retail items. Ranking helps Banji understand what is moving first, not just what exists in the catalog.

Use rankings when:

- selling order changed
- demand priority shifted
- you want Banji's analysis to better reflect what moved first in the real world

#### 5. Review

This is the final confirmation step before saving. Use it to verify:

- the observed time is correct
- the right SKUs and services were updated
- ranking and context entries make sense
- nothing accidental was left in the draft

### Important Controls And Buttons

- **Next / Back** moves between steps without finishing the session immediately.
- **Save** commits the update and makes it available to Overview, Logs, Performance, and Analysis.
- **Undo** reverts unsaved changes in the current session context.
- **Delete / discard draft** removes the in-progress draft or abandons the current edit flow.
- **Priority / Counted / All** changes which stock rows you see, not what is saved.
- **Blocked / Stockout** lets you mark a disruption explicitly instead of implying it from low stock alone.
- **Sales pattern help** and other help buttons explain terms used in this workflow.

### Common Mistakes

- Skipping the observed time and leaving a misleading timestamp.
- Recording only stock quantities but forgetting matching order, receipt, or service signals.
- Ranking items casually. Rankings should reflect recent real selling order, not ideal future priority.
- Saving a draft that mixes two unrelated real-world events into one update.

## Performance

### Purpose

Performance turns Banji's local planning output into action-oriented tables and boards. It is for prioritization, not raw data entry.

### When To Use It

Use Performance when you want to:

- see which items need action now
- compare SKUs and services across a short or medium time horizon
- review cash, drag, price watch, and recovery signals together
- understand what Banji thinks will happen next if nothing changes

### Key Panels

#### Move now

This is a ranked table of immediate actions. It typically answers:

- what to move
- why now
- expected effect
- which action button opens the next detail view

#### Board

This is a more comparative view across entities. It helps you compare demand, support, pipeline, margin, and status instead of reviewing one row at a time.

#### Cash

This section groups entities into practical buckets:

- **Winners**
- **Blocked profit**
- **Cash traps**

Use this to understand where working inventory is helping or hurting.

#### Operational drag

This highlights friction and blockers that reduce flow.

#### Recovery pipeline

This shows incoming events or signals that could restore capacity or improve availability.

#### Price watch

This flags entities where price-related review deserves attention.

#### Confidence

This helps you understand how much trust to place in the current model, usually based on evidence quality and recent data.

#### Timeline

This gives a sequence-oriented view of events such as demand, stockout risk, receipts, and price movement.

### Important Controls And Buttons

- **7D / 30D / 90D** changes the review window.
- **All / Services / SKUs** changes the scope of entities being compared.
- **Row action buttons** open the relevant detail page for the next decision.
- **Section tooltips** explain what each column or metric means. These are important here because many headings are intentionally compact.

### Common Mistakes

- Treating Performance as a ledger of everything that happened. Logs is better for saved historical records.
- Comparing rows without checking the selected timeframe or scope.
- Ignoring confidence or evidence quality when making large decisions.

## Catalog

### Purpose

Catalog is where Banji stores your working definitions of SKUs and services.

### When To Use It

Use Catalog when you need to:

- create a SKU
- create a service
- edit item details
- search by name, id, or description
- archive an item that should leave active workflows

### What You Can Manage

#### SKUs

A SKU is a stock-carrying item. Its record can include:

- id
- name
- description
- cost
- retail price
- whether it is sold directly as a product
- lead time inputs
- planning-related details used by Banji

#### Services

A service is a catalog item whose delivery may depend on one or more SKUs. Service records help Banji understand downstream impact when a linked SKU becomes constrained.

### Important Controls And Buttons

- **Search** finds matching items by id, name, or description.
- **Everything / SKUs / Services** filters the visible catalog set.
- **New SKU** creates a stock item.
- **New Service** creates a service item.
- **Edit** opens the editor for the selected record.
- **More actions** opens row-level actions such as archive or other mutation actions available for that entity.
- **Archive** removes an item from active workspaces without erasing its historical role.

### SKU And Service Detail Pages

When you open a catalog item, Banji gives a deeper record page.

For SKUs, expect surfaces such as:

- identity and commercial details
- operational status
- recommended action
- evidence timeline
- inventory and pipeline views
- linked service impact

For services, expect surfaces such as:

- commercial setup
- fulfillment readiness
- limiting SKU or blocker context
- current operational status

### Common Mistakes

- Using free-form naming without stable ids.
- Forgetting to link services to the SKUs that actually constrain them.
- Archiving an item when it is only temporarily unavailable.

## Analysis

### Purpose

Analysis is the deeper explanation workspace. It helps answer "why does Banji think this?" rather than only "what should I do next?"

### When To Use It

Use Analysis when you want to:

- inspect item-level planning detail
- compare services and SKUs more deeply
- read interval-based evidence and explanation surfaces
- work through a question that is too detailed for Overview

### How To Read It

Analysis depends on having:

- a catalog
- at least one saved update

Once data exists, Analysis exposes controls for:

- **scope**: All, Services, or SKUs
- **section**: the currently selected analysis topic
- **timeframe**: the interval range being inspected

The page may load item details progressively. That is normal in a local-first workspace with derived analysis views.

### What The Page Is Best At

- showing detail that sits behind headline recommendations
- comparing explanation surfaces across entities
- reviewing interval history and supporting evidence
- checking whether a signal is broad, item-specific, or time-window specific

### Important Controls And Buttons

- **All / Services / SKUs** narrows the analysis scope.
- **Section tabs** switch the current analytical lens.
- **Timeframe controls** move the explanation across different intervals.
- **Refresh analysis** reruns or reloads the latest analytical view.
- **Open overview** is the fast return path if you only needed a deep check before taking action.

### Common Mistakes

- Opening Analysis before any real update was saved and expecting detailed output.
- Using Analysis for data entry. It is an explanation surface, not an editing workflow.
- Interpreting one interval in isolation without checking the selected timeframe.

## Logs

### Purpose

Logs is the saved update history for the workspace. In the current UI this page is titled **Update history** under the Logs navigation area.

### When To Use It

Use Logs when you need to:

- search previously saved updates
- inspect what was recorded on a specific day
- review the mix of SKU, service, ranking, and note signals in prior updates
- reopen an update for editing or delete a saved report

### Key Views

#### Heatmap

The heatmap shows activity over the last 365 days. Darker or more active cells mean more observations were recorded on that date.

Use the heatmap to:

- spot bursts of operational activity
- select a day and inspect its saved observations
- understand whether the workspace is being updated consistently

#### All observations

This is the list view of saved reports. Use it when you want a searchable, paged list instead of calendar-style inspection.

### Important Controls And Buttons

- **New update** starts a fresh record-update session from Logs.
- **Search** filters saved reports.
- **All / SKUs / Services** narrows visible observations by content.
- **Heatmap / All** changes the presentation mode.
- **Day selection** in the heatmap reveals saved observations for that date.
- **Edit** reopens a saved record for correction.
- **Delete report** permanently removes that saved observation.

### Common Mistakes

- Using Logs as a substitute for Overview. Logs explains what was saved, not what to do next.
- Deleting a report when the better fix is to reopen and correct it.
- Filtering too narrowly and assuming missing results means data was never captured.

## Archive

### Purpose

Archive stores catalog items that should no longer appear in active workspaces but still matter historically.

### When To Use It

Use Archive when you want to:

- review inactive SKUs or services
- confirm an item is no longer active
- restore an item to active use

### Important Controls And Buttons

- **Search archive** finds archived SKUs and services.
- **All / SKUs / Services** changes the visible archive view.
- **Unarchive** restores the selected item to active workspaces.
- **Clear filters** resets the current search and filter state when no items match.

### Common Mistakes

- Expecting archived items to stay visible in active planning or catalog views.
- Using archive as a temporary note instead of as a state for inactive records.

## Settings

### Purpose

Settings controls local preferences, visibility options, planning behavior, exports, and backup/recovery actions.

### When To Use It

Use Settings when you need to:

- change interface language or currency
- tune how much helper text or right-rail content appears
- export logs or planning data
- create or restore a local backup snapshot
- inspect local storage paths
- clear current local data intentionally

### Key Sections

#### Preferences controls

This section covers the everyday interface preferences:

- **Language**: switch between English and Khmer
- **Currency**: choose USD or KHR display
- **Exchange rate**: controls USD-to-KHR conversion behavior where needed
- **Show optional help**: keeps or hides extra explanatory copy and tooltips
- **Show floating actions**: changes whether floating action affordances appear
- **Show right rail cards**: changes whether certain side cards remain visible

Use **Save preferences** after making changes you want to keep.

#### Planning settings

This section changes how Banji's local planning layer behaves. It includes settings such as:

- planning method
- order suggestion level
- suggested range start and end
- evidence detail level
- probability gates
- review delay
- smoothing and related planning controls

These are advanced settings. If your team does not have a reason to tune them, leave them near their defaults.

Common actions here:

- **Save preferences**: saves the values and refreshes local planning
- **Reset defaults**: returns planning settings to Banji's default values
- **Export planning data**: downloads current planning-related data in Excel, CSV, or JSON

#### Local workspace storage

This section shows where Banji keeps local data and exposes storage-related actions.

Common actions:

- **Export activity logs**: download saved logs
- **Create local backup snapshot**: save a restorable local snapshot
- **Restore saved snapshot**: restore from a previously saved snapshot
- **Open local data folder**: open the local storage location in the OS

#### Danger zone

This is for destructive actions. Use it carefully.

The most important action here is:

- **Clear current local data**: removes the current workspace data and is intended for deliberate resets, not routine cleanup

### Common Mistakes

- Changing advanced planning parameters without recording why.
- Confusing export with backup. Export creates shareable files; backup creates a restorable local snapshot.
- Using clear-current-data when you only needed to restore a backup or correct one record.

## Glossary

- **SKU**: a stock-carrying item tracked directly in Banji
- **Service**: a deliverable or offering that may depend on one or more SKUs
- **Record update**: a saved operational snapshot containing counts, signals, rankings, and notes
- **Observation**: the saved data package created by a record update
- **Reorder pressure**: Banji's signal that replenishment review is becoming important
- **Stockout**: a condition where an item is unavailable
- **Blocked**: an item or service cannot move normally because of an operational issue
- **Regime / sales pattern**: a hint about the overall demand pattern around the update
- **Workspace summary**: Banji's current local aggregate view built from saved observations
- **Archive**: inactive catalog records kept out of active workspaces but preserved historically

## FAQ

### Do I need to start in Overview?

No. If you are setting up Banji for the first time, start in Catalog. Overview becomes useful after there is at least one catalog item and one saved update.

### What is the difference between Overview, Performance, and Analysis?

- **Overview** tells you what likely needs attention next.
- **Performance** organizes action-oriented comparisons and priority tables.
- **Analysis** explains the underlying signals and intervals in more detail.

### Why is Analysis empty or limited?

Usually because one of these is still missing:

- a populated catalog
- a first saved update
- enough local detail hydration for the current view

### What is the difference between Logs and Archive?

- **Logs** stores saved update history.
- **Archive** stores inactive SKUs and services.

They solve different problems. Logs is historical activity; Archive is inactive catalog state.

### What happens if I archive a SKU or service?

It stops appearing in active workspaces such as Catalog and planning surfaces, but it remains part of Banji's history until you restore it.

### What is the difference between export and backup?

- **Export** downloads data in a usable file format like Excel, CSV, or JSON.
- **Backup** creates a local snapshot meant for restoring the workspace later.

Use export for analysis or sharing. Use backup for recovery.

### Can I edit a saved report?

Yes. Logs allows saved updates to be reopened for editing. If a report is wrong, edit it when possible instead of deleting it immediately.

### When should I use the sales pattern or regime hint?

Use it when the current update happened under a noticeable demand pattern, such as an unusual spike, slowdown, or other meaningful shift. It gives Banji additional context around the update.

### Why are there so many tooltips?

Banji includes explanatory copy because many planning and performance terms are compact by design. If you already know the workflow well, reduce optional help in Settings.

### Can Banji work without an internet connection?

Banji is designed as a local-first desktop workspace. Local functionality and local storage are core assumptions of the product.

### What should I do before clearing current local data?

Create a backup snapshot first unless you are certain you want a clean reset and do not need the current workspace anymore.
