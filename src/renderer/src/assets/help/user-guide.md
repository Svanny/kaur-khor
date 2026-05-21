# Kaur Khor User Guide

Kaur Khor is a local-first desktop inventory workspace. It helps an operator maintain product records, capture real-world changes, review work that needs action, and inspect operational signals without leaving the app.

## Table of Contents

- [What Kaur Khor Is For](#what-kaur-khor-is-for)
- [Daily Workflow](#daily-workflow)
- [Navigation](#navigation)
- [Home](#home)
- [Work](#work)
- [Queue](#queue)
- [Capture](#capture)
- [Intake](#intake)
- [Products](#products)
- [Insights](#insights)
- [Inventory](#inventory)
- [Pressure](#pressure)
- [Money](#money)
- [Explain](#explain)
- [Automations](#automations)
- [History](#history)
- [Settings](#settings)
- [First Useful Workflow](#first-useful-workflow)
- [Glossary](#glossary)
- [FAQ](#faq)

## What Kaur Khor Is For

Kaur Khor is for teams that run inventory decisions from one local machine and need a fast way to connect daily work with later analysis. It is meant for:

- keeping active and archived SKU/service records
- capturing stock counts, customer orders, sales, supplier orders, receipts, and custom updates
- reviewing supplier and customer work that needs attention
- understanding demand, capacity, money, and explanation signals from saved local data
- preserving update history without sending the workspace to a hosted back office

Kaur Khor is not a full ERP, accounting system, hosted collaboration suite, or blank workflow builder. It is local-first: the desktop app stores the working data on this device, and browser builds store browser data in the active browser profile.

Kaur Khor automatically reduces app scale when a desktop window, browser demo, or browser app viewport becomes narrow, short, or generally cramped by area. On phone portrait screens, the demo and browser app open the phone operator shell for Today, Queue, Capture, Products, Insights, and workspace safety actions. Phone Products includes SKU/service lookup and summary detail pages; phone Capture provides fast entry for common updates and hands deeper capture screens to a horizontally scrollable surface. Rotate the phone sideways, use a wider browser window, or use the desktop app for analysis, settings, custom multi-lane updates, and the full workspace.

## Daily Workflow

Most operators should use Kaur Khor in this order:

1. Start on **Home**.
2. Open **Work** to review queue, capture, and intake work.
3. Use **Work / Capture** when something real changed.
4. Open **Products** when item definitions, archive state, or automation exposure need attention.
5. Open **Inventory** from Home or **Insights** when you need stock health, money, or explanation views.
6. Use **History** from the command palette or Settings when you need saved reports, edits, or deletions.
7. Use **Settings** for preferences, local data, planning, automation connection, help, benchmarks, and destructive maintenance.

Treat this as a loop, not a setup wizard. Product records make Capture usable. Capture creates evidence. Queue, Inventory, Money, Explain, and History interpret that evidence. Settings changes how the local workspace behaves.

## Navigation

The persistent sidebar is intentionally small:

- **Home**: command home and daily entry point
- **Work**: queue, capture, and intake
- **Products**: active items, archived items, details, edits, and automation exposure
- **Insights**: Inventory, Money, and Explain modes
- **Settings**: system, support, local data, automation connection, and maintenance

Moved destinations remain reachable:

- **History** is available from command palette, Settings, and report contexts.
- **Archived products** is available in Products with archived status.
- **Help** lives in Settings at `/settings/help`.
- **Automation intake** lives in Work; automation exposure lives in Products; Telegram connection lives in Settings.

When you enter Settings from another app route, **Back to app** returns to that originating route, including its query filters, instead of always returning to Home.

The command palette can open Home, Work, Products, Insights, History, archived products, Settings, and Help by name or by common aliases. Old top-level URLs are no longer supported.

## Home

Home is the first screen. It is a quiet command surface for choosing the next broad action. It also shows a short status summary: the next move, active products count, and saved updates count.

- **Start Work**
- **Capture Update**
- **Open Products**
- **Open Inventory**

The available actions sit in a centered command grid, matching the Capture hub layout. Kaur Khor hides unavailable actions instead of showing disabled cards. For example, Capture and Products only appear when the current workspace state supports them, and Inventory appears when insight views are enabled.

Use Home when you are not sure where to begin. It points you toward the next practical operator action without exposing backend or analysis jargon.

## Work

Work is the daily operating workspace. It groups Queue, Capture, and, when enabled, Intake. Use Work when the question is operational: what should be checked, recorded, or promoted into a ticket now?

The Work landing page presents those modes as large tiles. Inside a Work subpage, the title tabs let you move between Queue, Intake, and Capture without returning to Home. If Automations and intake is turned off in Interface settings, Intake is hidden and `/work/intake` redirects back to Queue.

## Queue

Queue is the decision surface for supplier and customer work. It is where operators scan task status, switch between supplier and customer work, filter by supplier or task state, open drawers, and jump to the item or Capture lane that resolves the issue.

Supplier queue rows can represent SKU tasks or durable supplier tickets. Customer queue rows can represent customer tickets, automation intake that needs review, or customer demand inferred from saved work. Queue drawers are for quick operational updates such as ETA changes, goods received, follow-up, cancel, or fulfillment; full evidence entry belongs in Capture.

Queue does not create analysis by itself. It helps choose the next action from existing product records, tickets, stock, timing, and automation signals. When a queue action writes a quick update, it still becomes saved local evidence that downstream History and analysis can read.

## Capture

Capture is the update-authoring workflow inside Work. It turns real-world events into saved local evidence that Queue, Products detail, Inventory, Money, Explain, and History can read later. Use Capture when stock, orders, receipts, prices, flags, rankings, notes, or delivery details changed.

The Capture hub has four primary lanes:

- **Products Update** records product-side facts such as counts, prices, costs, and service availability signals.
- **Supplier Order** creates or updates supplier ticket work, including receipt flows for existing supplier tickets.
- **Immediate Sale** records realized customer demand in the same session.
- **Customer Order** creates or updates a durable customer ticket.

For ticket-backed lanes, Kaur Khor opens a new ticket flow directly when there is no meaningful saved draft or editable ticket. It only asks whether to resume, start new, or edit/update when that choice would change real work. Mode-only placeholders are discarded instead of being shown as saved drafts.

After validation and any required receipt confirmation, saving a capture closes the session immediately and returns you to the previous Work surface. The bottom-left **Saving...** indicator stays visible while Kaur Khor finishes writing the observation, ticket/order updates, and any follow-up analysis in the background. If that background save fails, the draft remains recoverable and the normal workspace error surface reports the failure.

Clearing current data from Settings removes saved capture drafts and cached product detail pages from this device before reloading, so a blank workspace opens without previous Products Update, Customer Order, or demo rows.

### Delivery Fee {#record-update-delivery-fee}

Delivery fee records the delivery charge and payer when delivery handling is part of a customer or receipt workflow. It affects the customer-facing total and can matter for margin review. Check it before saving so totals match the actual agreement.

### Discount {#record-update-discount}

Discount records either a flat amount or a percentage taken off the subtotal before delivery is added. It affects the visible total and the net settlement used by Money and ticket history. Check the mode and value before saving so receipts match the actual agreement.

### Notes {#record-update-notes}

Notes capture operator context that structured fields cannot express. They are useful for explaining unusual counts, customer requests, supplier promises, manual corrections, or why an update was backfilled. Keep notes factual because they appear later in History, detail pages, and analysis evidence.

### Observed At {#record-update-observed-at}

Observed at is the timestamp for when the real-world event happened. It can differ from the time you enter it. Use the actual event time when backfilling counts, receipts, or orders so timelines and analysis intervals stay accurate.

Supplier expected-arrival and receipt dates are calendar dates. When you edit a
legacy supplier order or receipt, Kaur Khor keeps the selected calendar day stable
instead of shifting it through UTC conversion.
Expected-arrival and follow-up dates can be the same local calendar day as
Observed at, but cannot be earlier than the Observed at date.

### Ranking Details {#record-update-ranking-details}

Ranking details explain an optional ordered list, such as top services or retail items. The order becomes evidence about relative demand or operator judgment. Use it only when the ranking reflects what happened in the observed interval, not as a general preference list.

### Rankings {#record-update-rankings}

Rankings let you record which services or products were most relevant in the update. They help Kaur Khor learn demand patterns when exact quantities are incomplete. Use them for directional evidence, then rely on counts, sales, and tickets for precise units.

### Sales Pattern Context {#record-update-regime-context}

Sales pattern context lets the operator label the broader demand environment, such as normal pattern, demand spike, demand lull, promotion pattern, adjustment pattern, or stock-limited pattern. It applies to the full update package, not just one SKU. Use it when the event happened under conditions that normal numbers do not capture.

### Retail Price {#record-update-retail-price}

Retail price records a changed customer-facing product price for SKUs sold directly. It affects future sale entry, automation quotes, Money, and margin analysis. Use it when the sell price changed; leave it unchanged when only stock count changed.

### Review {#record-update-review}

Review is the final confirmation panel before saving a Record Update. It summarizes what will be written to local history and what downstream surfaces may read. Use it to catch wrong quantities, timestamps, flags, prices, notes, or ticket targets.

### Service Flags {#record-update-service-flags}

Service flags record service-level price changes or blocked/stockout events. They are evidence for availability, service detail, automation exposure, and analysis. Use them when a service condition changed, even if no linked SKU count changed.

### Service Step {#record-update-service-step}

The service step captures service-level signals during an update. It lets you add service price changes, blocked states, or stockout flags tied to service delivery. Use it when customer-facing service availability or pricing changed.

### SKU Flags {#record-update-sku-flags}

SKU flags record events such as blocked availability or stockout-constrained behavior for stock items. They explain why demand may not convert into sales even when customers wanted the item. Use flags sparingly and only for real conditions observed in the interval.

### Stock Cost {#record-update-stock-cost}

Stock cost records a changed supplier/unit cost for SKUs. It affects margin, capital, and Money calculations. Use it when replacement cost or known purchase cost changed; do not use it as a sale price field.

### Products Update {#record-update-stock-count}

Products Update records product-side facts at the observed time: SKU counts, SKU cost/price changes, service price changes, and service stockout signals. It is one of the strongest pieces of evidence in Kaur Khor because pressure, availability, service capacity, and Money all depend on these updates. Count carefully, filter by supplier when needed, and treat linked service SKUs as read-only context in the update card.

## Intake

Intake is the customer-request review surface for Telegram automation. It shows parsed customer messages, matched lines, quoted totals, confidence, exceptions, and review state before a request becomes normal customer-ticket work. Use Intake to confirm customer intent, fix missing product data, and promote only requests that are priced and resolved.

The Intake route has focused working views. **Live intake** is the working queue for captured Telegram orders. **Chat** shows the message thread for a selected intake and lets the operator reply. **Exposed sellables** shows which SKUs and services can be offered through automation. The Automation page also has a separate **Needs review** tab for requests that Kaur Khor could not safely turn into clean work.

### Customer {#automation-intake-customer}

The Customer column shows the person or account Kaur Khor inferred from the Telegram conversation. It may show a display name, handle, or phone number. Open the intake drawer when the identity is incomplete; the drawer lets you override the customer name or phone before creating or appending a customer ticket.

### Request {#automation-intake-request}

The Request column summarizes the parsed order lines before the intake is attached to a ticket. It uses resolved product names when a line matched a sellable and falls back to the customer-requested label when it did not. Treat unresolved quantities, missing matches, or ambiguous lines as reasons to review the source chat before promoting.

### Quoted Total {#automation-intake-quoted-total}

Quoted total is the customer-facing amount Kaur Khor can calculate from matched, priced sellables. It stays pending when any line lacks a quantity, price, resolved sellable, or line total. Kaur Khor only allows customer-ticket promotion when every line resolves to a priced sellable and the intake has a quote.

### State {#automation-intake-state}

State explains where the intake sits in the operator workflow. New and quoted states are still in intake, ticketed and completed states already connect to operational history, canceled states are hidden from the default all view, and needs-review or failed states appear in the review queue. Use the state before choosing whether to create a ticket, append to an existing ticket, keep it in review, or cancel it.

### Created/Updated {#automation-intake-created-updated}

Created / updated shows when the intake first appeared and when it last changed. The table combines the original creation time with a relative updated time so fresh customer messages are easy to separate from older requests waiting for follow-up.

### Customer Conversation {#automation-exception-customer-conversation}

Customer / conversation identifies which Telegram thread produced the exception. Use it to open the right context before deciding whether the issue is a missing product, unclear quantity, duplicate request, or ticket that already exists.

### Issue {#automation-exception-issue}

Issue describes why Kaur Khor stopped the intake flow for operator review. Current issue labels include item not found, availability unknown, quantity ambiguous, parser failed, and parser review. Fix the underlying catalog exposure, alias, quantity, or price problem before promoting the intake.

### Last Message {#automation-exception-last-message}

Last message shows the shortest useful clue for the exception. It may come from the operator note or from the parsed request summary, so treat it as a table preview rather than the full chat history. Use **View chat** or open the intake to inspect the complete conversation.

### Confidence {#automation-exception-confidence}

Confidence is Kaur Khor's certainty about the inferred request or match. High confidence can still need operator confirmation, medium confidence should be checked against the chat and sellable exposure, and low confidence belongs in review until the source message, product aliases, and ticket target are clear.

### Live Intake {#automation-live-intake}

Live intake is the table of Telegram requests captured before they become normal customer tickets. It shows who asked, what was parsed, quoted totals, state, timestamps, and action buttons. Use it to open a ready intake, review a chat, or jump to the promoted ticket when one already exists.

The intake drawer shows what came in, line-level prices, unresolved quantities, and the quoted total. From there you can create a customer ticket, append to an existing customer ticket, keep the intake in review, or cancel it. When appending, choose an open customer ticket. Kaur Khor rejects missing, closed, supplier, or already-promoted targets so a customer request cannot be silently attached to the wrong operational history.

Use **View chat** to review the Telegram messages for one specific intake/order. If the same customer orders again, the Chat tab keeps that later order in a separate thread even though Telegram still uses the same underlying customer conversation.

When creating, appending, reviewing, or canceling an intake, the drawer can draft a customer-facing Telegram reply. Edit it before submitting when the generated text needs operator judgment, or turn sending off to update Kaur Khor without messaging the customer.

### Needs Review {#automation-needs-review}

Needs review lists automation messages Kaur Khor could not safely convert into clean work. The issue and confidence columns explain why the request stopped, and the action opens the same intake drawer used by Live intake. Use this section to fix product aliases, missing prices, unclear quantities, exposure settings, or customer identity before creating tickets.

## Products

Products is the source of truth for SKU and service definitions. The route is labeled **Offered Selections** in the app because it lists the items Kaur Khor can plan, expose, sell, or use as service inputs. In Help, the top-level Products anchor is `#products` in both English and Khmer so links from the table of contents and Settings resolve consistently.

Use Products to:

- create or edit SKUs and services
- search by product text and filter by all items, SKUs, services, or supplier
- open SKU/service detail pages
- use row actions for Detail, Edit, Duplicate, Archive, Delete, or item-specific capture actions
- archive or unarchive items
- duplicate SKU/service metadata without copying saved history
- delete products only when no saved logs, observations, edits, captures, tickets, or order batches reference them
- review archived items with `status=archived`
- manage automation exposure for customer-facing sellables

Archive is not delete. Archived items are hidden from active work but remain available historically and can be restored.

Delete is stricter than Archive. If a product has any saved activity, or a SKU is still linked to a service, Kaur Khor keeps Delete visible but explains why it cannot run.

Money fields in Products and Capture show the active currency symbol (`$` or `៛`) inside the input. Type only the number; commas and the symbol are display aids, and Kaur Khor saves the underlying value in the selected workspace currency.

### Act Now {#catalog-detail-act-now}

Act now is the detail-page action summary for a SKU. It condenses current demand, stock, supplier pipeline, and timing into a suggested next move. Use it as a starting point, then check the rail rationale and evidence before committing to an order or products change.

For services, the same right-rail idea appears as the service overview/action panel. It reads service availability, customer commitments, bottlenecks, and recovery path rather than a physical SKU reorder recommendation.

### Customer Demand {#catalog-detail-customer-demand}

Customer demand summarizes open commitments and realized customer flow linked to the SKU. It helps explain why an item is under pressure even when the current stock count looks acceptable. Use it before deciding whether to reserve stock, reorder, or change exposure.

### Next Touch {#catalog-detail-next-touch}

Next touch is the recommended date or reason to revisit the SKU. It is based on current stock, pipeline, timing, and latest observation age. Use it to schedule follow-up when immediate action is not required but the item should not be ignored.

### Open Pipeline {#catalog-detail-open-pipeline}

Open pipeline lists supplier orders and receipts that may affect the SKU. It shows whether relief is already expected or whether the item has no meaningful inbound support. Use it before placing duplicate supplier orders.

### Selected Interval {#catalog-detail-selected-interval}

Selected interval explains the period chosen in the SKU chart or timeline. It shows demand, receipts, adjustments, regime, and notes for that slice. Use it to understand why one chart segment changed instead of reading the current headline alone.

On service detail pages, selected intervals summarize demand, sellable capacity, the binding SKU, and the gap for the selected service interval.

### Supplier {#catalog-detail-supplier}

Supplier identifies the vendor attached to the SKU. It matters because supplier filters, work queues, ETA evidence, and open pipeline all use this assignment. Fix it in the editor when supplier work appears under the wrong vendor.

### Service Availability {#catalog-service-availability}

Service availability describes whether the service can be offered from current linked-SKU capacity and products setup. It is not just the service price; a service can be blocked by missing or constrained components. Use it before exposing the service to customers.

### Service Dependency Impact {#catalog-service-dependency-impact}

Dependency impact shows which linked SKUs are limiting or supporting a service. It explains whether a service shortage comes from one binding SKU, several weak SKUs, or no clear blocker. Use it when the service headline looks wrong or too broad.

Each dependency row can link back to the SKU detail page, so operators can move from a service bottleneck directly to the stock item that needs evidence or replenishment.

### Service Editor Details {#catalog-service-editor-details}

Service details define the stable identity of a service: name, description, and image. Kaur Khor generates the internal service ID when a new service is created and keeps it stable after that. These fields affect search, detail pages, automation matching, and customer-facing labels. Keep them clear before linking SKUs or exposing the service.

You can add or replace the image by choosing a file, dragging one onto the picture field, or pasting an image anywhere on the service editor page, including when another field is focused. PNG, JPEG, and WebP are accepted. Dropped or pasted images must be 20 MB or smaller, no more than 12000 px on either side, and no more than 40 megapixels.

### Product Attributes {#catalog-product-attributes}

Attributes are a creation helper in SKU and service editors. Enable them when one base item needs active variants such as size, color, flavor, pack size, duration, service type, or location. Saving keeps the base product and creates metadata-only variant copies named with the selected attributes, without copying logs, observations, captures, tickets, or order history.

### Linked SKUs {#catalog-service-editor-linked-skus}

Linked SKUs define what stock a service consumes or depends on. This is the core setup for service capacity, bottleneck analysis, and automation availability. Use this section when a service appears available or blocked for the wrong reason.

The service editor filters the linked-SKU picker by search text and shows each candidate with its pricing summary. Add at least one SKU before expecting service capacity to calculate.

### Service Editor Pricing {#catalog-service-editor-pricing}

Service pricing is the customer-facing price for one service delivery. It is required before creating or saving a service and feeds Money, automation quotes, service detail, and customer tickets. Update it when the sell price changes; use Record Update for observed price-change evidence if you need history.

### Service Evidence Timeline {#catalog-service-evidence-timeline}

The service evidence timeline lists saved updates that explain the service's current signal. It may include price changes, linked demand, notes, and stock-linked dependency events. Use it to audit why the service detail page changed.

### Service Operational Ribbon {#catalog-service-operational-ribbon}

The service operational ribbon is the compact row of key service metrics. It summarizes availability, dependency pressure, confidence, and other status values so users can scan before reading detail panels. Use it to choose which panel needs attention first.

### SKU Dependency Impact {#catalog-sku-dependency-impact}

SKU dependency impact shows which services rely on this SKU and how severely they are affected. It helps explain why a simple stock item can create service pressure. Use it before hiding, archiving, or delaying replenishment for a shared component.

Severity labels distinguish the main blocker, at-risk services, and ordinary linked services. Usage and blocker probabilities show whether this SKU is actually binding service capacity.

### SKU Editor Details {#catalog-sku-editor-details}

SKU details define the stock item's identity: name, supplier, description, and image. Name and supplier are required before creating or saving a SKU. These fields affect search, supplier queues, automation exposure, and detail-page interpretation. Fix details here when the wrong item appears in work or customer-facing surfaces.

You can add or replace the image by choosing a file, dragging one onto the picture field, or pasting an image anywhere on the SKU editor page, including when another field is focused. PNG, JPEG, and WebP are accepted. Dropped or pasted images must be 20 MB or smaller, no more than 12000 px on either side, and no more than 40 megapixels.

### SKU Editor Attributes {#catalog-sku-editor-attributes}

SKU attributes use the same variant generator as services. Choose one or more attributes and options, then save to create every selected combination as a new active SKU while leaving the base SKU in place. Custom attributes and options are remembered locally for future editor sessions.

Saving changes in the SKU editor keeps you on the editor so you can continue reviewing the draft. Use **Details** to leave the editor and open the SKU detail page. If you have unsaved changes, navigation links, including tooltip **More** links, ask before discarding the current draft.

### SKU Editor Planning {#catalog-sku-editor-planning}

SKU planning inputs describe expected time of arrival expectations and variation for replenishment. Expected time of arrival days and either ETA variation days and hours or a variation preset are required before creating or saving a SKU. They guide reorder timing, pressure, and Explain ETA risk. Use measured supplier behavior when available; guesses should be conservative and revisited after receipts arrive.

### SKU Editor Pricing {#catalog-sku-editor-pricing}

SKU pricing includes required unit cost and optional customer-facing product price. Cost affects margin and capital calculations; product price affects retail sale, automation quote, and Money views. Keep both current when supplier cost or sell price changes.

### Sell As Product {#catalog-sku-editor-sell-as-product}

Sell as product controls whether a SKU can be sold directly to customers, not only used as a service dependency. Enable it only when the SKU has a valid product price and should appear in retail/customer-facing flows.

When Sell as product is off, the product price field is cleared and retail/customer-facing capture actions hide where they would not make sense.

### SKU Evidence Timeline {#catalog-sku-evidence-timeline}

The SKU evidence timeline lists saved updates that shaped the current SKU signal. It can include counts, costs, retail price changes, orders, receipts, flags, and notes. Use it to audit the detail page before correcting the products or history.

### SKU Hero Signal {#catalog-sku-hero-signal}

The SKU hero signal is the large top-line operational statement on the detail page. It translates current stock, demand, pipeline, and timing into a human-readable status. Use it for quick orientation, then inspect the ribbon and rail for causes.

### SKU Operational Ribbon {#catalog-sku-operational-ribbon}

The SKU operational ribbon is the compact metric strip below the hero. It surfaces key quantities such as cover, pipeline, demand, next receipt, or confidence depending on available data. Use it to scan the item before opening deeper panels.

### Chart Ledger {#trading-chart-ledger}

The trading chart ledger is the detail chart surface for SKU, service, or analysis signals. It combines timeline controls, indicators, selected interval behavior, and saved evidence overlays. Use it when you need to inspect how a headline changed over time.

Use **Settings** for indicator style, value, and input-source choices; **Indicators** to choose which signals are visible; and **Layout** to arrange indicators across panes. Layout rows move from the drag handle so axis-side menus and delete buttons remain normal controls. **New pane** adds a temporary empty pane for staging a layout; it is saved only after an indicator is placed there and the layout is confirmed.

If you switch chart dialogs or click outside with unsaved chart changes, Kaur Khor asks whether to apply, discard, or keep editing before continuing.

Dense overlay evidence such as supplier orders, receipts, or repeated regime markers may be clustered into one timeline marker. Select the marker to inspect the latest interval in that cluster.

Chart indicator settings are remembered per SKU, service, or analysis subject. Saving defaults updates the subtype default so the next matching chart starts from that layout.

## Insights

Insights is the entry point for operating signals. Its hub cards open **Inventory**, **Money**, and **Explain**. Use this section to choose which lens fits the question: inventory health, financial quality, or evidence-level explanation.

Insights remembers the last state of each detailed workspace, so returning from the hub can restore the route, range, scope, supplier, or section you were using. If the analysis surface is hidden in Interface settings, Kaur Khor redirects Insights back to Home. Older Pressure links are routed into Inventory so saved links do not strand the operator on a removed workspace.

When a custom time range is active in Inventory, Money, or Explain-adjacent views, the range menu shows the custom range edit button. The edit button stays hidden while a preset range is active so opening the menu does not imply a custom range already exists.

When compare mode is on, a custom range can also carry a manually selected
previous period. Money and legacy Pressure views use that previous period for comparison
instead of always auto-shifting by the current range length. Inventory focuses on stock-health facts rather than compare-mode financial or pressure deltas.

## Inventory

Inventory is the stock-health subpage. It shows on-hand estimates, in/out flow, cover, inbound pipeline, future projections, count freshness, and service sellability without turning those facts into procurement commands.

### Health Grid {#inventory-health-grid}

The inventory health grid is the main table for SKU and service inventory facts. SKU rows represent physical stock. Service rows represent sellable capacity from linked SKUs. Use the scope, supplier, range, projection, row-set, and preset controls to change the grid without leaving the page.

The grid is sortable by column. Wide views may split data columns into pages while keeping the item column visible; use the previous/next column controls when a preset has more columns than fit cleanly. The row-set toggle can show focused rows only or all active rows, and the 95CI interval toggle adds credible low-high ranges where the model has them.

### Item {#inventory-column-item}

Item identifies the SKU or service row being inspected. SKU rows show physical inventory context; service rows show sellable capacity context.

### On Hand {#inventory-column-on-hand}

On hand shows the current modeled stock or sellable capacity. When confidence intervals are visible, the secondary line shows the credible low-high range.

### Flow {#inventory-column-flow}

Flow splits selected-range movement into units in, units out, and adjustments. Use it to separate receipts, consumption, sales, and corrections.

### Cover {#inventory-column-cover}

Cover shows how long current stock is expected to last at modeled demand, along with the reorder point used as the restock threshold.

### Projection {#inventory-column-projection}

Projection shows modeled stock at the selected future horizon. Confidence intervals show the credible low-high range for that horizon.

### Pipeline {#inventory-column-pipeline}

Pipeline shows inbound stock already in motion and the next expected receipt window when one is available.

### Service Exposure {#inventory-column-service-exposure}

Service exposure shows linked services that may depend on the SKU, or bottleneck context for service rows.

### Freshness {#inventory-column-freshness}

Freshness shows how recent the latest count or inventory evidence is. Older evidence means the estimate depends more on modeled flow.

### Stockout Risk {#inventory-column-stockout-risk}

Stockout risk is the modeled probability that the item reaches or stays at zero available stock over the active horizon.

### Demand {#inventory-column-demand}

Demand/day estimates recent daily use or sales from observations, service consumption, and retail activity.

### In Transit {#inventory-column-in-transit}

In transit shows units already in supplier orders or receipts that are expected to arrive but are not counted on hand yet.

### Order Probability {#inventory-column-order-probability}

Order probability estimates whether an order or reorder need is active based on stock, demand, and lead-time evidence.

### Units In {#inventory-column-units-in}

Units in shows inventory added during the selected range, primarily supplier receipts and positive adjustments.

### Units Out {#inventory-column-units-out}

Units out shows inventory consumed, sold, or otherwise removed during the selected range.

### Adjustments {#inventory-column-adjustments}

Adjustments show manual corrections or non-sale inventory changes recorded during the selected range.

### Receipts {#inventory-column-receipts}

Receipts show units received into inventory during the selected range.

### Lost Demand {#inventory-column-lost-demand}

Lost demand estimates customer demand that could not be fulfilled because stock or service capacity was constrained.

### Stock Position {#inventory-column-inventory-position}

Inventory position combines on-hand stock and inbound stock, net of modeled demand, to approximate stock position after known pipeline movement.

### Next Receipt {#inventory-column-next-receipt}

Next receipt shows the nearest expected receipt window for inbound stock when one is known.

### Lead Time {#inventory-column-lead-time}

Lead time shows the modeled average time between supplier order and usable receipt.

### Lead Time Uncertainty {#inventory-column-lead-time-uncertainty}

Lead time uncertainty shows how variable the modeled supplier timing is.

### Details {#inventory-column-details}

Details opens the row panel. SKU rows show posterior stock, flow decomposition, inbound pipeline, and linked service capacity; service rows show sellable capacity and contributor bottleneck context.

### Cover Distribution {#inventory-cover-distribution}

Cover distribution groups SKUs by days of cover. It helps show whether the catalog is concentrated around immediate stockout, short cover, medium cover, or longer cover.

### Inbound Schedule {#inventory-inbound-schedule}

Inbound schedule summarizes pipeline inventory by receipt window. In the current model, rows with active inbound stock are counted in the This week bucket while the other timing buckets stay available for future receipt-window detail.

### Freshness {#inventory-freshness}

Freshness summarizes how recent stock counts are across SKUs. Stale or missing counts mean the on-hand estimate depends more heavily on modeled flow.

### Column View {#inventory-column-view}

Column view describes the active grid preset. Health, Flow, Forecast, Pipeline, and Custom expose different factual slices of the same inventory rows.

In Custom view, **Columns** chooses which optional columns are visible and the layout dialog lets you drag those columns into the preferred order. Invalid or duplicate custom-column values in the route are ignored before rendering.

### Selected Service {#inventory-selected-service}

Selected service shows sellable units, bottleneck probability, bottleneck SKU, contributor stack, and recovery pipeline for the service selected in the grid.

### Selected SKU {#inventory-selected-sku}

Selected SKU shows posterior stock, credible band, stockout risk, cover, latest count, flow totals, pipeline state, lead time, and linked services for the SKU selected in the grid.

### Projection Matrix {#inventory-projection-matrix}

Projection matrix compares today, 7-day, 14-day, and 30-day projected stock ranges across visible inventory rows.

Switch from Grid to Projection to open this matrix. Its trend sparkline shows direction across the horizons, and the projected-units column follows the same 95CI toggle as the grid.

## Pressure

Pressure is the operational urgency surface behind older performance links and advanced pressure analysis. It compares demand, available capacity, supplier pipeline, timing, confidence, and price/margin context so operators can decide what needs attention now. Use Pressure for prioritization before editing records or placing supplier work; use Inventory when the question is factual stock health.

The visible Insights hub now opens Inventory, Money, and Explain. Old Pressure links may route into Inventory from the hub, but Pressure Help anchors are retained for builds and feature flags that still render the performance workspace, compare mode, timeline card, or pressure tables.

### Band's Blocked Profit {#pressure-band-blocked-profit}

Blocked profit contains items with demand or earning potential that cannot convert because stock, timing, or capacity is in the way. Use this band to find money you may recover by unblocking supply, fixing service dependencies, or correcting availability.

### Band's Cash Traps {#pressure-band-cash-traps}

Cash traps are items where stock or capital is present but operational movement is weak. They can look safe because they are not stockouts, yet still waste working capital. Use this band to review pricing, exposure, ordering habits, or archive candidates.

### Band's Winners {#pressure-band-winners}

Winners are items with useful demand or performance that should be protected. They may need replenishment, exposure, or attention because losing them would hurt service or sales. Use this band to avoid focusing only on emergencies.

### Board's Demand Trend {#pressure-board-demand-trend}

Demand trend shows whether recent demand is rising, falling, stable, or too sparse to trust. It helps distinguish a temporary spike from a persistent pattern. Use it with support and pipeline columns before changing reorder behavior.

### Board's Item {#pressure-board-item}

Item identifies the SKU or service in the demand/capacity board. Use it to open the detail page when a row needs action. For services, remember the visible pressure may come from linked SKUs rather than the service record itself.

### Board's Pipeline Support {#pressure-board-pipeline-support}

Pipeline support shows whether open supplier orders or expected receipts can cover the risk. Strong support means relief may already be in motion; weak support means demand may outrun supply. Use it before creating or chasing supplier work.

### Board's Price Margin {#pressure-board-price-margin}

Price / margin shows whether pricing or profitability is part of the pressure story. It can point to underpriced items, margin changes, or revenue opportunity. Use it when demand is present but the recommended move is not simply reorder stock.

### Board's Status {#pressure-board-status}

Status is the row's operational classification in the demand/capacity board. It summarizes the pattern after considering demand, capacity, support, pipeline, and price/margin. Use it for scanning, then read the neighboring columns for cause.

### Board's Support {#pressure-board-support}

Support describes available capacity or linked inventory that helps satisfy demand. For SKUs, this is usually stock coverage; for services, it may be the weakest linked SKU. Use it to see whether the item is supported enough to keep selling.

### Cash Signal Bands {#pressure-cash-signal-bands}

Cash signal bands group pressure items by money-related action type. They show where demand, profit, and capital pressure overlap. Use them when operational urgency and cash decisions need to be considered together.

### Confidence {#pressure-confidence}

Confidence tells how much trust Kaur Khor has in the pressure signal. It reflects evidence freshness, coverage, and model stability. Low confidence means capture better data or inspect history before making a high-cost decision.

The confidence rail links directly to **Start update** so stale or thin evidence can be corrected from Capture.

### Demand Capacity Board {#pressure-demand-capacity-board}

The demand/capacity board is the main Pressure table for comparing what customers may need against what the operation can supply. It combines demand trend, support, pipeline, price/margin, and status. Use it to decide which items need immediate work.

When compare mode is enabled, row status and trend cells can show previous-period-to-current movement instead of only the current label.

### Move Action {#pressure-move-action}

Action is the practical next step for a Move Now row. It opens the relevant SKU, service, or queue context for restock, recovery, pricing review, cash-clearing, or customer-demand follow-up. Use it as an operator prompt, not an automatic command.

### Move Column {#pressure-move-column}

Move is the named recommendation in the Move Now table. It condenses the row's evidence into an action category so the queue is scannable. Use it to prioritize, then read Why now and Expected effect before acting.

### Expected Effect {#pressure-move-expected-effect}

Expected effect explains what should improve if the move is correct. It may reduce stockout risk, free capital, restore service capacity, or improve margin. Use it to decide whether the action is worth the effort now.

### Move Now {#pressure-move-now}

Move Now is the priority action panel in Pressure. It shows the few highest-ranked moves Kaur Khor thinks matter most for the selected range and scope. Use it at the start of a review session, then open rows for evidence before changing real operations.

Move Now appears when the model has rows to rank. Empty sections are hidden so the workspace does not imply work that is not supported by evidence.

### Why Now {#pressure-move-why-now}

Why now explains the evidence that made a Move Now item urgent. It should mention the demand, stock, timing, price, confidence, or pipeline reason behind the recommendation. Use it to reject or accept a move quickly.

### Operational Drag {#pressure-operational-drag}

Operational drag summarizes friction slowing the operation even if it is not the highest direct stockout risk. It counts blocked open customer orders, overdue receipts, and refund or cancellation signals. Use it to find recurring friction before treating the main board as only a stock problem.

### Price Watch {#pressure-price-watch}

Price watch highlights items where price, margin, or recent pricing evidence may require attention. Use it when the pressure is financial or customer-facing rather than purely stock availability.

### Recovery Pipeline {#pressure-recovery-pipeline}

Recovery pipeline lists items where incoming supply or known receipts may resolve pressure. It helps avoid duplicate ordering and shows where follow-up should focus on timing. Use it when deciding whether to wait, chase, or order again.

### Timeline {#pressure-timeline}

The pressure timeline shows how the operating signal changed over the selected period. It helps identify whether urgency is new, worsening, recovering, or stable. Use it before treating one current score as the whole story.

The timeline card can be hidden by Interface settings. When it is visible, it summarizes demand, stockout, receipt, price, and recovery events across the selected range.

## Money

Money is the financial quality subpage in Insights. It explains sales, gross profit, tied-up capital, open supplier commitments, margin movement, and contributor quality from stock-linked evidence. Use Money when the question is whether inventory is earning, leaking margin, or trapping cash.

Use the scope control to switch between all stock-linked economics, services, or retail SKUs. Use the supplier filter and timeframe control to narrow the view. The standard windows are 1D, 7D, 30D, and 90D; Custom opens a date dialog. If compare view is enabled in Interface settings, the compare button adds deltas against the previous matching window, or against the previous custom window you chose.

The top ribbon summarizes net sales, gross profit, inventory capital, open commitments, and margin erosion. If the Products catalog is empty, Money asks you to create the first SKU. If there is no workspace summary yet, it points you to Start update or Work because the page needs saved observations before it can produce financial totals.

### Band's Capital Traps {#money-band-capital-traps}

Capital traps are items classified as capital heavy or dormant stock. They hold money in stock without enough useful sales movement, so they may not be urgent stockouts but still restrict cash. Use this band to find inventory that should be discounted, paused, rebalanced, or reviewed with the supplier.

### Band's Earners {#money-band-earners}

Earners are items classified as efficient earners. They have strong sales, healthy profit, and an acceptable capital footprint in the selected window. Use this band to protect reliable revenue drivers, confirm enough stock remains, and avoid starving items that are converting inventory into cash cleanly.

### Band's Margin Leaks {#money-band-margin-leaks}

Margin leaks are items classified as margin thin or blocked earners. Sales activity exists, but spread is weak or deteriorating. Causes can include stale costs, underpriced retail, delivery handling, discounts, negative corrections, or blocked demand value. Use this band to decide whether price, cost, exposure, or stock availability needs correction.

### Commitments Due {#money-commitments-due}

Commitments due summarizes supplier-side value likely to leave the business soon. It ranks open supplier order batches by remaining value and expected arrival, then falls back to inferred in-transit stock when no open commitments are saved. Use it when deciding whether capital is already committed before placing more replenishment work.

### Contributor Capital Tied Up {#money-contributors-capital-tied-up}

Capital tied up is the current stock-linked money attached to a contributor. For SKUs it comes from current units and cost; for services it comes through linked SKU dependencies. Use it to compare profit against working capital rather than sales alone.

### Contributor Entity {#money-contributors-entity}

Entity identifies the SKU or service contributing to the Money view. Rows link back to the SKU detail or service detail page, and SKU rows can show supplier context. Open the entity when the money signal needs a products, stock, or pricing correction.

### Contributor Gross Profit {#money-contributors-gross-profit}

Gross profit is net sales after known or inferred stock-linked cost. It depends on accurate costs, service prices, and retail prices, so stale Products pricing can distort it. Use this column to separate high sales from actually useful sales.

### Contributor Net Sales {#money-contributors-net-sales}

Net sales is realized stock-linked revenue in the selected window. It is based on saved sale/order evidence that Kaur Khor can connect to products entities. Use it as the top-line activity measure, then compare it to gross profit and capital tied up.

### Contributor Status {#money-contributors-status}

Status classifies the contributor's financial pattern. Current labels include efficient earner, capital heavy, dormant stock, margin thin, blocked earner, and neutral patterns. It is a label for scanning, not a final decision, so use the numeric columns beside it to understand why the label appeared.

### Contributor Turn Quality {#money-contributors-turn-quality}

Turn quality describes whether inventory is converting into money cleanly. It weighs movement, capital, linked-service demand, and profit quality together. Use it to spot items that sell too slowly, sell at weak margin, block service revenue, or deserve more stock.

### Coverage {#money-coverage}

Coverage in Money explains how complete the financial view is for the selected scope. It reports freshness, cost coverage, price coverage, and the weakest spot behind the current totals. Use it before trusting totals, especially after Products changes, partial imports, or a long gap since the last update. The Start update button opens Capture when the evidence needs refreshing.

### Economic Contributors {#money-economic-contributors}

Economic contributors is the table that explains which entities drive the Money summary. It ranks up to eight SKU/service rows by gross profit contribution, then sales contribution, and shows sales, profit, capital, turn quality, and status. Use it to choose where financial action should happen.

### Financial Statement {#money-financial-statement}

The financial statement is the main Money summary for the selected range and scope. It is grouped into Money in, Money tied up, and Money leaking. Money in shows net sales, cost consumed, and gross profit. Money tied up shows on-hand stock value, in-transit stock value, open order commitments, and slow-stock value. Money leaking shows cost increases, markdown pressure, negative corrections or shrinkage, and blocked margin. Use it for orientation, then inspect contributors for the reason behind a total.

### Largest Capital Positions {#money-largest-capital-positions}

Largest capital positions list where inventory money is concentrated right now. They are based on latest posterior units multiplied by SKU cost and note whether the SKU supports linked services or is retail-only capital. These positions are not automatically bad; use them to check whether high-value stock is supported by demand, pipeline, and margin.

### Quality Bands {#money-quality-bands}

Money quality bands group contributors by financial pattern. They separate earners, capital traps, and margin leaks so the user can scan action types instead of reading every row. The band section only appears when at least one of those groups has rows. Use it as a triage board for cash decisions.

### Recent Margin Shifts {#money-recent-margin-shifts}

Recent margin shifts show items whose price or known cost changed in the selected window. They can reveal retail price updates, service price updates, cost updates, discounts, or bad data. Use this rail before assuming a margin issue is caused by demand.

### Telegram Attribution {#money-telegram-attribution}

Telegram attribution shows quoted, realized, canceled, and ticketed value from Telegram-origin customer intake. Open quoted value includes new, needs review, quoted, and ticketed intake; realized value counts completed intake; reversals count canceled intake. Use it to judge whether customer automation is producing useful revenue or just noise.

When Money is filtered to a custom range, Telegram attribution uses the same
custom date window as the rest of the Money view. The Open Automations button goes to Work intake, where those customer requests can be reviewed.

## Explain

Explain is the evidence and model-inspection subpage. It shows the timeline, observation ledger, pressure table, fragility map, and run settings that explain why Kaur Khor produced a signal. Use Explain when a recommendation needs to be audited before action.

Explain has six surfaces: Workbench, Pressure, Observations, Fragility, Settings, and Variables. The top controls filter by all items, SKUs, or services, apply the supplier filter, and rerun the current SENA analysis. Fragility hides the scope toggle because it only compares services against their contributing SKUs.

The Workbench ledger can change timeframe, load older intervals, reset chart zooms, use a custom chart range, and open an expanded overlay. When older detail is loading, the loading island reports interval hydration progress instead of hiding the chart.

### Fragility Map {#explain-fragility-map}

Shows where services are constrained by the SKUs they depend on. Each cell compares service demand against the contributing SKU supply path, with usage, bottleneck, pressure, and relief labels. Use it to find whether a service problem is really caused by one stock item, several weak dependencies, or no named dependency yet. Select a service or cell when you need the rail evidence behind a blocker instead of acting only on the color.

### Ledger {#explain-ledger}

The main Explain timeline. It aligns regimes, stock movement, supplier pipeline, and ETA behavior across the same intervals so you can see what changed before a signal appeared. The lane expand controls let one lane use the full vertical space, and interval labels open the right rail for the clicked evidence type. Use it when you need to trace a recommendation back to observed events rather than reading a single summary score.

### Ledger's Inventory Lane {#explain-ledger-inventory-lane}

The inventory lane plots expected stock level and observed stock movement over time. It combines counts, sales, service demand, receipts, and adjustments into one lane so sudden drops or recoveries are visible. Use it to check whether a pressure signal is demand-driven, count-driven, or simply stale because no recent stock count exists.

### Ledger's ETA Lane {#explain-ledger-lead-time-lane}

The ETA lane shows the supplier timing model for each interval. The line is the expected time of arrival and the band is uncertainty, so wider bands mean Kaur Khor has less stable timing evidence. Use it before trusting reorder timing or delivery promises.

### Ledger's Pipeline Lane {#explain-ledger-pipeline-lane}

The pipeline lane shows supplier order and receipt cues over the timeline. It helps answer whether incoming stock is already on the way, whether receipts arrived late, and whether a current shortage may resolve without a new order. Use it with the ETA lane before creating extra supplier work.

### Ledger's Regime Lane {#explain-ledger-regime-lane}

The regime lane labels each interval with the demand pattern Kaur Khor inferred, such as normal, spike, lull, promo, correction, or stockout-constrained. Price and stockout cue badges show why that interval was classified. Use it to distinguish a real trend from a one-off event.

### Observation's Affected Entities {#explain-observation-affected-entities}

This column lists the SKUs or services that an observation touched. It is useful when one saved update influences several downstream surfaces. If the list is empty, the observation still exists, but it was not attached to a named products entity strongly enough to drive entity-level scoring.

### Observation Channels {#explain-observation-channels}

This column shows which evidence channels were present in a saved observation: stock, service ranking, retail ranking, stockout, order, receipt, price, ETA hint, or note. Use it to understand why an observation matters before opening the rail. Blank-looking channels usually mean the update was narrow, not that it failed.

### Observed Signal {#explain-observation-observed}

The observed column identifies the saved event and its timestamp. It is the audit trail behind the Explain workbench. Use it to find the exact update that changed a signal, then open History or the source record if the observation looks wrong.

### Observations Ledger {#explain-observations-ledger}

The observations ledger is the compact table of saved updates used by the Explain run. It shows what Kaur Khor actually saw, not only what the model inferred. The table is paged in small groups and each row includes observed time, interval, detail, evidence channels, and affected entities. Use it when a score looks surprising and you need to confirm whether the source evidence is recent, complete, and attached to the right item.

### Pressure Item {#explain-pressure-item}

The item column names the SKU or service in the Explain pressure table. It includes enough identity context to separate stock-carrying SKUs from services that depend on linked SKUs. Open the row when you need to inspect why that entity is being scored.

### Pressure ETA Risk {#explain-pressure-lead-time-risk}

ETA risk estimates how much supplier timing uncertainty contributes to pressure. High risk means the item may fail even when today's stock looks acceptable, because replenishment timing is unstable or poorly evidenced. Review supplier orders, receipts, and ETA hints before dismissing it.

### Pressure Pipeline Risk {#explain-pressure-pipeline-risk}

Pipeline risk estimates whether incoming supply is weak, late, missing, or not enough for expected demand. It is not just the count of open orders; it also considers timing and support. Use it to decide whether to chase a supplier ticket or create a new order.

### Pressure Price Sensitivity {#explain-pressure-price-sensitivity}

Price sensitivity shows whether recent price or margin behavior may be affecting demand or risk. It helps separate a stock problem from a pricing problem. Use it when pressure rises after price changes, promotions, or margin shifts.

### Pressure Score {#explain-pressure-score}

Pressure score is the combined urgency score for an entity in Explain. It blends demand, stock, supplier pipeline, timing, and confidence into a 0-100 signal. Treat it as a prioritization aid, then use the rail and observation ledger to confirm the evidence before acting.

### Pressure Table {#explain-pressure-table}

The pressure table ranks entities by operational risk inside the Explain workbench. It is built for investigation: scan scores first, then compare pipeline, ETA, and price columns to see the main driver. Use it when you need to know which item deserves attention and why.

### Rail's Affected Entities {#explain-rail-affected-entities}

This rail block lists the products entities attached to the selected observation. It answers: “What did this saved update touch?” Use it when a note or customer message seems broad and you need to know which SKU or service Kaur Khor connected it to.

### Rail's Affected Entities Summary {#explain-rail-affected-entities-summary}

This overview rail block summarizes the entities most affected by the current Explain run. It is a quick map of where the model found evidence, not a task list. Use it to choose which item to inspect next.

### Rail's Channels {#explain-rail-channels}

This rail block expands the evidence channels for a selected observation. It shows whether the row came from counts, orders, receipts, ranking signals, prices, ETA hints, or notes. Use it to judge whether the observation is strong enough to explain the downstream signal.

### Rail's Contributor Stack {#explain-rail-contributor-stack}

Contributor stack shows the pieces that feed the selected entity's pressure signal. For services, this often includes linked SKUs; for SKUs, it may include demand, pipeline, and timing contributors. Use it to identify the upstream cause before editing the products or placing orders.

### Rail's Interval Explanation {#explain-rail-interval-explanation}

This rail block explains the selected interval in the ledger. It summarizes the dominant regime, driver, and price or stockout cues for that period. Use it when the timeline mark is visible but the reason for the classification is not obvious.

### Rail's Observation {#explain-rail-observation}

This rail block shows the selected saved observation in detail. It includes the title, observed time, and plain-language detail so you can verify the source event. Use it to decide whether the explanation is grounded in a real update or a weak note.

### Rail's Observed Signals {#explain-rail-observed-signals}

Observed signals are the specific cues found in the selected interval. They can include demand, receipt, adjustment, price, stockout, or note evidence. Use them to understand why the interval changed instead of assuming the line chart moved by itself.

### Rail's Orders and ETA {#explain-rail-orders-transit-lead-time}

This rail block focuses on supplier order probability, quantities, receipts, transit age, and ETA class for the selected interval. Use it when the question is whether supply is already coming, late, or too uncertain to rely on.

### Rail's Overview {#explain-rail-overview}

The overview rail summarizes the current Explain run before anything is selected. It shows dominant regime, change-point probability, and coverage context. Use it to understand the run's overall state before drilling into a row or interval.

### Rail's Posterior State {#explain-rail-posterior-state}

Posterior state is the model's current estimate for the selected entity after reading the evidence. It includes units, demand per day, reorder trigger, in-transit exposure, and ETA estimates. Use it to see the hidden state behind a pressure score.

### Rail's Reorder Policy {#explain-rail-reorder-policy}

Reorder policy shows the model's recommended supplier action for a selected SKU. It includes need probability, recommended order, likely range, protection horizon, and policy basis. This block appears for SKU selections when reorder labels are available; service selections use the contributor stack instead. Use it as planning guidance, then check real supplier constraints before ordering.

### Rail's Settings {#explain-rail-settings}

This rail block identifies the selected SKU or service and gives the short pressure explanation. It is the entity inspector header, not the global Settings page. Use it to confirm you are inspecting the right item before opening its Products detail.

### Rail's Strongest Channels {#explain-rail-strongest-channels}

Strongest channels summarize which evidence types most influenced the current Explain run. They help answer whether the run is being driven by stock counts, orders, receipts, pricing, notes, or ETA evidence. Use them to spot missing data channels.

### Rail's What Happened {#explain-rail-what-happened}

This rail block breaks the selected interval into service demand, retail demand, receipts, and adjustments. Use it to separate customer demand from stock movement. It is especially useful when a net stock change hides several opposite events.

### Settings Coverage Estimate {#explain-settings-coverage-estimate}

Coverage estimate states how much of the relevant products had enough evidence for the run. Low coverage means the run may be blind to parts of the operation. Add counts, linked SKUs, prices, or observations before relying on fine-grained comparisons.

### Effective Sample Size {#explain-settings-effective-sample-size}

Effective sample size is the amount of usable evidence after weighting, smoothing, and recency effects. It can be lower than the raw observation count. Use it to judge whether the model has enough signal or is stretching sparse data.

### Settings Intervals {#explain-settings-intervals}

Intervals tells how many timeline windows the Explain run evaluated. More intervals can reveal trend and timing behavior; fewer intervals make the run easier to read but less historical. Use it to understand the time depth behind the visible charts.

### Latest Observed {#explain-settings-latest-observed}

Latest observed is the newest saved event included in the Explain run. If this timestamp is old, the output may be stale even if the screen loaded correctly. Capture a fresh update before acting on time-sensitive pressure.

### Observations Used {#explain-settings-observations-used}

Observations used is the count of saved events included after filtering and scope selection. It tells you whether the run had enough real data to work with. If it is low, inspect scope, supplier filter, date range, and recent capture activity.

### Settings Panel {#explain-settings-panel}

The settings panel explains the run configuration behind Explain. It lists run ID, latest observation, observations used, interval count, smoothing, sample size, predictive error, coverage, and scope as separate cards. Use it when two users see different results or a run needs to be audited.

### Predictive Error {#explain-settings-predictive-error}

Predictive error estimates how far the model has recently been from observed outcomes. Higher error means the explanation should be treated as directional, not precise. Improve it by adding fresher counts, receipts, and outcome observations.

### Run ID {#explain-settings-run-id}

Run ID is the internal identifier for the Explain run currently displayed. It helps connect screenshots, logs, and support reports to one explanation pass. Use it when comparing runs or debugging why an explanation changed.

### Scope {#explain-settings-scope}

Scope describes which products entities, supplier filters, and time window were included. Use it before comparing numbers across screens: two runs with different scope are not directly comparable.

### Smoothing {#explain-settings-smoothing}

Smoothing controls how strongly the run softens noisy observations. More smoothing reduces jumps from one-off events; less smoothing reacts faster to new evidence. Use it to understand why a fresh update may not fully dominate the chart.

### SENA Variables {#explain-variables}

SENA variables are the raw diagnostic fields stored for the active Explain run. They include run metadata, engine parameters, diagnostics, workspace summary, SKU summaries, SKU posterior arrays, service details, service contributors, and the raw artifact root. The tab loads the latest analysis artifact by run ID and can show loading, unavailable, or error states. Use it for debugging or audit checks when the formatted Explain views do not show enough detail.

## Automations

Automations covers configuration and customer-facing exposure for Telegram automation. Use it to manage the Telegram connection, decide what sellables the bot may offer, and keep customer-facing products data ready. Intake review has its own Help section because it is a Work subpage, not just a configuration panel.

Automations stays locked to Configuration until a bot token has been saved. After that, the Overview, Sellables exposed, Intake, Chat, and Configuration tabs can appear depending on whether you are in the Automations route or the Work intake route. In browser mode, Telegram polling only runs while the tab is open, visible, and awake; use the desktop app for persistent automation.

Automations follows the app language for operator-facing controls and messages. Customer Telegram text, handles, SKU names, service names, and notes stay as entered.

### Overview {#automation-overview}

The Overview summarizes today's Telegram intake, recent automation activity, and coverage. It also warns when customer-facing Telegram items are unavailable but still exposed, with a Review exposed sellables action that opens the exposed catalog view. Automation tables use these concepts:

- **Exposure** means a SKU or service is visible to the customer-facing bot.
- **Intake** means a customer request captured from Telegram or another automated source.
- **Exception** means Kaur Khor could not confidently turn a message into normal work without operator review.
- **Alias** means a customer-facing name that can differ from the internal products name.
- **Confidence** means how sure the parser or matcher is about the inferred customer request.

Exposure, intake, and exception headers explain whether a value is measured from saved products data, inferred from customer text, or waiting for an operator decision.

### Exposure Entity {#automation-exposure-entity}

Entity is the internal SKU or service record that automation can mention to customers. The Sellables exposed table can be searched by sellable name, alias, or supplier. Open the entity when the customer-facing answer looks wrong, because the source problem is usually products naming, price, archive state, or linked-SKU setup.

### Exposure Type {#automation-exposure-type}

Type distinguishes stock-carrying SKUs from services. The type filter can narrow the table to SKUs or services. SKUs usually depend on direct stock and retail sellability. Services usually depend on linked SKUs and service availability.

### Exposure Price {#automation-exposure-price}

Price is the customer-facing amount automation can quote. Missing prices should be fixed in Products before the item is exposed to customer messages.

### Exposure Availability {#automation-exposure-availability}

Availability explains whether the entity can be offered from current products and stock data. Hidden, limited, unavailable, unknown, and available states should be reviewed before toggling exposure. Unavailable-but-exposed rows are highlighted by the Overview warning because customers may still be shown an item that cannot be fulfilled.

### Exposure Status {#automation-exposure-exposed}

Exposed controls whether the entity is visible to customer-facing automation. The exposure filter can show all, exposed, or hidden rows. Archived rows and rows whose availability is hidden cannot be toggled from this table. Keep uncertain products items unexposed until names, prices, aliases, and availability are ready for customers.

### Exposure Alias {#automation-exposure-alias}

Alias is the customer-facing name automation uses instead of the internal products name. Use aliases for common customer wording, alternate spellings, Khmer/English names, and short names that customers actually type.

### Configuration {#automation-configuration}

Configuration is the Telegram connection panel. It holds bot identity, bot link, bot token, username, and external link settings that let Kaur Khor receive or route customer intake. Follow Telegram's BotFather setup flow first, then paste the generated token and public username into this form. Kaur Khor keeps Automations locked to Configuration until the saved token exists.

Configuration is an advanced, experimental tab. Telegram automation is work in progress, subject to change, and may be unstable.

Use Test message in the desktop app or Poll Telegram now in browser mode to verify the connection. If Telegram blocks browser fetch, Kaur Khor shows a browser-blocked state and requires the desktop app.

When Telegram automation is connected and live listening in the desktop app, Kaur Khor warns before the app closes because Telegram listening, automation intake, and automatic checks stop until the app is opened again. The desktop app automatically creates a close-safety snapshot before showing that warning.

### Sellables Exposed {#automation-sellables-exposed}

Sellables exposed to Telegram is the customer-facing products control. It decides which SKUs and services automation can mention, quote, or offer. Use search, exposure, and type filters to find the row, then update the Exposed toggle or customer-facing Alias. Use it to hide incomplete items and expose only records with clear names, prices, aliases, and availability.

## History

History is the saved update history workspace. It is a maintenance/context surface, not a persistent sidebar destination.

Use History to:

- search saved reports
- switch between the observation contribution heatmap and all-reports list when the view selector is enabled
- open a saved report
- edit a report through the matching Capture flow
- delete a mistaken report after confirmation

The History route remembers scope, supplier, and view state in the settings history link. Search text, heatmap year, selected day, and list page are local route state and reset when you reopen History or change filters. The heatmap groups valid observation dates so you can open the updates for a day; All reports lists the filtered reports directly in pages of five. Delete removes a saved observation after typed confirmation, while Edit reopens the matching Capture flow for that report. History explains what was saved. Work explains what deserves attention now.

## Settings

Settings is the local control room for Kaur Khor. Use it when you need to change how this device presents the workspace, where local data is stored, how SENA plans, how automation is exposed, or how the app updates itself. Settings changes are local to this installation unless the setting explicitly changes saved workspace data.

Settings has these sections: Workspace, Interface, Local Data, Planning, Automation, History, Benchmarks in development builds, Help, Credits, Updates, and Danger Zone. When you enter Settings from another route, **Back to app** returns to the route you came from, including filters and query state.

### Workspace {#settings-workspace}

Workspace preferences control everyday operating defaults on this device.

- **Regional preferences** choose the app language and display currency.
- **USD-to-KHR exchange rate** controls KHR reference amounts when currency display needs conversion. It must be a positive number before preferences can be saved.
- **Item pictures** controls whether SKU and service pictures are hidden, thumbnails, small, or medium sized on supported surfaces.
- **Chart loading** controls whether chart surfaces dim while older intervals or refreshed data are loading.
- **Work queue action defaults** decide whether queue actions ask each time, open one item at a time, or jump straight into batch capture for Record Supplier order, Update ETA, Follow up, Receive, and Review.

Save Workspace changes before leaving. In development builds, a developer-only onboarding injector may appear; it reopens first-run onboarding and is not a production operator control.

### Interface {#settings-interface}

Interface controls hide or show optional workspace surfaces without deleting data. View mode cards set a preset first, then individual toggles can customize the result.

- **Optional guidance** shows explanatory labels, helper text, and More-help tooltips. Required-field guidance remains visible even when this is off.
- **Floating page actions** keep primary page actions near the title area after the header scrolls away.
- **Right-side context panels** show supplemental rails on Work, Insights, Pressure, Financials, and detail screens.
- **Work queue filter tabs** show task-status tabs above the Work queue; when hidden, Work uses one All Tasks queue.
- **Automations and intake** shows Work / Intake and lets the Telegram bot receive customer intake. Turning it off hides intake and pauses the bot.
- **Comparison view switch** shows Compare / Single on Pressure and Financials; when hidden, those pages stay in Single view.
- **Pressure timeline card** shows or hides the business timeline card on Pressure.
- **History view selector** shows Heatmap / All in Settings / History; when hidden, History stays in All view.
- **Heartbeat and signal ribbons** shows status ribbons on detail, Pressure, Financials, and update screens.

Command palette actions can send you to Interface with the Help or Automations row highlighted. The highlight is a navigation aid only; it does not change the setting.

### Parameter Guidance {#settings-parameter-guidance}

Parameter guidance explains SENA planning inputs. These settings change how conservative, broad, or responsive planning becomes. Adjust them only when you understand the tradeoff between stability, speed, and risk.

- **Particle count** controls how much evidence detail the planner samples. Higher values can improve detail but may cost more time.
- **Target service level** is the availability goal SENA plans toward.
- **Recommendation quantile** controls the order suggestion level inside the forecast distribution.
- **Range low quantile** and **Range high quantile** define the suggested order range around the recommendation.
- **Need probability gate** is the threshold before Kaur Khor treats a reorder signal as actionable.
- **Review delay days** adds extra safety days before the next review.

Planning fields validate as you edit. The low range cannot exceed the high range, and the recommendation must stay inside the range. Save preferences to apply changed parameters; Kaur Khor reruns SENA after saved planning changes. **Reset defaults** restores the default SENA parameters and reruns planning with those defaults.

### Smoothing {#settings-smoothing}

Smoothing controls whether Kaur Khor softens noisy SENA signals in Settings. When enabled, charts and recommendations may react less sharply to one-off updates. Use it for steadier operations; disable it only when immediate responsiveness matters more than noise control.

### Local Data {#settings-local-data}

Local Data shows where this installation keeps the workspace and how to move evidence out safely.

Desktop shows the data directory, workspace store, preferences file, and backup snapshots directory. Desktop operators can create a backup snapshot, restore a saved snapshot, export logs, and export SENA/planning data. Log and planning exports can be saved as Excel, CSV, or JSON.

Browser runtime is different. Browser data lives in the current browser profile. Native folder reveal, desktop snapshots, and log export are desktop-only. Use the browser app banner for browser backup import/export, and treat browser clear-data actions carefully because clearing browser storage can remove the workspace.

Restoring a snapshot replaces the local workspace with the selected snapshot. Create or confirm a backup before restoring when you may need the current state again.

### Automation Settings {#settings-automation}

Settings / Automation opens the Telegram automation configuration surface. Use it to save or review the bot display name, username, bot link, bot token, and external link behavior. Product exposure lives in Automations / Sellables exposed, and automation intake lives in Work / Intake.

Automation is experimental. Paused, connected, disconnected, and error states should be treated as operational state, not decoration. If Automations and intake is hidden from Interface, Settings redirects back to Interface and highlights the toggle instead of showing the automation setup page.

### History Settings {#settings-history}

Settings / History opens the saved report history. Use it to search saved reports, switch between Heatmap and All reports when the selector is visible, open a saved report, edit a report through the matching Capture flow, or delete a mistaken report after typed confirmation. All reports paginates in groups of five. History explains what was saved; Work explains what needs attention now.

### Benchmarks {#settings-benchmarks}

Benchmarks are available only in development builds. Use them to run development scenarios against selected fixture sizes, inspect run history, compare target result tables, and review pass, watch, fail, or missing statuses. Distribution details and truth panels are diagnostic tools for development work. Open output folder and reset results are maintenance actions for benchmark artifacts, not operator workflows.

### Help Page {#settings-help}

Settings / Help is the in-app copy of this user guide. Use it when a field tooltip, table header, command palette result, or Settings entry sends you to documentation while you are still working in Kaur Khor. The page is designed for quick answers first, then enough background to explain the product concept behind the visible control.

Use the search box to find route names, workflow terms, button labels, table columns, and common questions. Search filters the guide sections and marks the strongest result as the best match. The index on the right jumps between guide sections; on wide screens it scrolls independently from the article so long guides remain navigable.

More links from tooltips and section labels open `/settings/help#...` anchors. Kaur Khor scrolls to the matching subsection and briefly highlights it so you can connect the documentation to the control that sent you there. If a link does not highlight anything, the anchor is stale and should be fixed before relying on that link.

The repository guide link opens the Markdown copy under `docs/user-guide.md` or `docs/user-guide.km.md`. The in-app guide is loaded from matching raw Markdown assets, so product documentation changes should keep the repository copy and in-app copy aligned.

### Credits {#settings-credits}

Credits shows the app name, copyright, license, and where to find full license terms. It is informational and does not change workspace data.

### Updates {#settings-updates}

Updates supports source-build updates for the desktop app on macOS, Windows, and Linux. Browser runtime redirects to Local Data because the desktop updater is not available there.

Use **Check latest release** to load the current version, latest version, release link, and available version picker options. **Latest release** stays selected by default; choose a specific release only when rebuilding or rolling back intentionally. Before installing, confirm the data folder and snapshot export folder. Skipping snapshot export requires a warning confirmation and shows the latest checkpoint label so you can decide whether the risk is acceptable.

Update failures leave a status message instead of silently continuing. Do not start an update without a usable backup path unless you intentionally accepted the skip-backup warning.

### Danger Zone {#settings-danger-zone}

Danger Zone contains destructive maintenance. **Delete current data** creates a safety snapshot, clears the current local workspace, clears saved capture drafts, removes browser/session workspace keys, clears cached product detail state for this device, and then reloads to a blank workspace. The confirmation dialog requires the exact token `DELETE CURRENT DATA`.

Use Danger Zone when you intentionally want this installation to start over, such as after test data, a wrong imported workspace, or a training/demo session. Do not use it to fix a single mistaken report, order, or product; edit or delete that specific record instead. Only proceed after exporting or backing up anything you may need again.

## First Useful Workflow

For a new workspace, the shortest useful path is:

1. Open Products and create the SKUs or services the team actually sells.
2. Add supplier, cost, price, ETA, and linked-SKU details when those fields affect decisions.
3. Open Work / Capture and save the first stock count or real order.
4. Save a second real update when enough time or activity has passed for Kaur Khor to compare intervals.
5. Return to Work to see whether supplier or customer tasks need attention.
6. Open Insights / Inventory to understand demand, available capacity, pipeline support, confidence, and current stock health.
7. Open Insights / Money when you need sales, gross profit, tied-up capital, or leakage context.
8. Open Insights / Explain when a signal needs evidence-level audit before action.

Search keywords: start, setup, onboarding, first update, first count, first order, first sale, first analysis.

When you edit an existing SKU or service in Products, changes to operational
variables are saved into history as well as the products. SKU cost, SKU retail
price, SKU ETA days or uncertainty, and service price changes become
observations so Explain, Money, Pressure, and History can trace when those
assumptions changed. Name, description, picture, supplier, linked-SKU, archive,
and new-item setup edits remain products setup unless one of those variables also
changes.

## Glossary

### Terms {#glossary-terms}

- **Pressure**: the operational signal that demand, stock, timing, price, or supplier flow may need action.
- **Coverage**: how much expected demand current stock or sellable capacity can cover.
- **Pipeline support**: open supplier orders or receipts that may restore stock before demand causes a problem.
- **Available capacity**: the units or service deliveries that can be sold from current stock and linked dependencies.
- **Sellable**: a SKU or service that is active and can be offered to customers.
- **Stock-limited pattern**: a service or SKU pattern where current stock constrains delivery or sales.
- **Confidence**: how much trust Kaur Khor has in a signal based on saved evidence and inferred model stability.
- **SENA-derived columns**: values inferred by Kaur Khor's local analysis engine rather than typed directly by an operator.

Search keywords: risk, urgency, reorder, stockout, can sell, available, demand, capacity, pipeline, support, inference, model, money, margin.

## FAQ

### What should I enter first?

Start with the products items that matter most, then capture one real stock update. A small accurate setup is better than a complete but guessed setup. Once SKUs, services, suppliers, prices, and the first counts exist, Kaur Khor has enough context to make later updates useful.

### Can I use Kaur Khor before every detail is perfect?

Yes. Use Kaur Khor as a working notebook first, then tighten data quality over time. Mark uncertain information in notes, avoid inventing exact quantities, and fix products setup when a repeated issue appears. The app becomes more useful as saved evidence accumulates.

### How often should I capture updates?

Capture updates whenever a real operating fact changes: stock counts, customer orders, supplier orders, receipts, prices, availability, or unusual demand. Daily capture is enough for many small operations, but urgent stock or supplier changes should be recorded when they happen.

### What if a recommendation looks wrong?

First check the source evidence before changing operations. Look for stale counts, missing receipts, wrong supplier assignment, incorrect prices, archived items, or notes that were too vague. If the evidence is wrong, fix the products or capture a correcting update instead of ignoring the signal silently.

### Why do some signals show low confidence?

Low confidence usually means the app has sparse, stale, or conflicting evidence. Add a fresh count, record the missing order or receipt, check linked SKUs for services, and confirm prices or ETA assumptions. Confidence should improve as the saved history becomes more consistent.

### What should I do before clearing or restoring local data?

Export or back up the workspace first, then confirm you are working on the correct device and data folder. Clearing local data is for starting over or recovering from a bad test workspace. Restoring a snapshot should be treated as replacing the current local truth.
