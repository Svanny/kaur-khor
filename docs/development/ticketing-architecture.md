# Ticketing Architecture

Back to the docs index: [Kaur Khor developer docs](../README.md)

## Contract

Kaur Khor removes the legacy batch update system in favor of a ticketing system.

Operational commitments should be represented as ticket-backed events rather
than as loose grouped order or receipt updates. The older order-batch read model
may still exist as compatibility data, but new authoring and queue behavior
should not write an operational fact that has no ticket identity.

Primary ticket families:

- `customer`: customer demand commitments and immediate sales
- `supplier`: replenishment commitments and later receipt updates
- `adjustment`: corrections, shrinkage, refunds, recounts, and mistake handling

Ticket lifecycle is `open`, `resolved`, or `canceled`. Family-specific stages are
stored on each event, and every modification appends an event with an incremented
revision instead of overwriting prior operational history.

Backend validation enforces the family contract, not only the TypeScript shape:
customer tickets may use customer stages and customer event types, supplier
tickets may use supplier stages and supplier event types, and adjustment tickets
may use adjustment stages and adjustment event types. Canceled events must carry
the canceled lifecycle. Each ticket event must include at least one line item so
ticket-only observations cannot become empty operational facts.

## Observation Shape

Ticket events are carried in `SenaObservationInput.ticketEvents`.

Relevant contracts:

- TypeScript shared shape: [`src/shared/sena.ts`](../../src/shared/sena.ts)
- Rust SENA shape: [`apps/sena-core/src/types.rs`](../../apps/sena-core/src/types.rs)
- observation helpers: [`src/renderer/src/routes/observation-payload.ts`](../../src/renderer/src/routes/observation-payload.ts)

Ticket-only updates count as structured observation signals. They must not be
collapsed into free-form notes, because downstream projections need family,
lifecycle, stage, party metadata, line items, and revision data.

Structured party metadata belongs in the ticket event even when the UI places it
inside a notes section. Channel values should be normalized case-insensitively.
Customer phones should be stored/displayed as `+<countrycode> <number>` and
lookups should use normalized compact keys.

## Capture

Capture remains the canonical authoring surface. The primary wizards are:

- Stock count
- Customer order
- Immediate sale
- Supplier order

Supplier receipt is not a standalone primary wizard. Receipt capture is a branch
inside Supplier order after the operator chooses to edit or update an existing
supplier ticket. Legacy receipt URLs may redirect into the supplier ticket flow,
but new surfaces should not reintroduce a separate receipt authoring path.

Customer order and Supplier order must ask for mode before the wizard continues:

- new ticket
- edit or update existing ticket

Customer channel, customer name, and phone live in the Capture notes block
for customer-facing flows. That is a UI placement decision only; the backend
still stores those values as structured ticket party metadata.

Immediate sale is its own same-session sale flow. It records a customer-family
demand event that is resolved immediately, but it should not be framed as
"completed customer fulfillment" inside Customer order.

Capture now also keeps more route-local state around the ticket-driven
workbench:

- saved lane drafts can be resumed or explicitly discarded from the hub
- customer and supplier lane entry uses a local action dialog instead of
  navigating immediately
- the POS/workbench reorder lane can force the operator to save ordering first
  before leaving the route
- capture save exits the route after local validation and keeps observation,
  ticket/order persistence, and optional SENA reruns in the global background
  saving scope; failed background writes leave the draft available for retry
- delivery fee, payer, and phone metadata are structured fields, even when the
  surface groups them under notes or receipt review UI

## Inbox

Inbox is the operational queue. Its top-level family switch is:

- Customer
- Supplier

Customer mode shows customer-family ticket work, including the customer-only
status filters needed to separate open work from stock blockers and ready
completions. Supplier mode shows supplier-family ticket work and is the default
queue when Inbox opens.

Do not reintroduce the legacy batch-action prompt. Inbox task actions should
open or update one ticket-backed work item at a time.

Supplier task drawer actions must keep the backing supplier order child in step
with the ticket/observation history they append. If a task has a
`childOrderId`, order placement, ETA updates, and receipt saves should update
that child or batch state before appending the matching observation event. Tasks
without a backing child may continue through the observation-only path.

New ticket creation must add a per-ticket nonce to the deterministic ticket
identity. Deterministic IDs remain useful for editing selected tickets and
deriving stable references, but fresh customer or supplier tickets created in
the same minute with the same line identity must not collide.

When an Inbox drawer or Capture route updates an existing supplier order, it
must preserve the real supplier ticket identity and increment from the latest
known ticket revision. Prefer `recordUpdateContext.latestTicketsById` when the
route already carries a ticket id; otherwise match open supplier tickets by SKU,
supplier, and expected arrival date before creating a new ticket id. Leaving the
quantity field blank during an ETA-only update should preserve the existing
order quantity rather than falling back to a fresh recommendation.

## Downstream Projections

SKU detail should expose ticket state as supporting evidence, not as a new
equal-weight page. Ticket events that touch the SKU appear in the evidence
timeline as chips such as customer order created, immediate sale, supplier order
placed, ETA changed, partial receipt, full receipt, correction, and cancellation.

Service detail should show customer commitments directly and supplier-side state
through bottleneck recovery paths. A service is not replenished directly.

Insights Performance mode may use ticket state for interventions such as overdue
customer follow-ups, blocked bottleneck restocks, repeated supplier delay, and
cancellation clusters. It should not become a ticket board.

Insights Analysis mode may use ticket events as evidence classes. It should not
allow inline ticket editing.

Insights Financials mode must not count open customer tickets as realized
revenue. Supplier ticket creation affects commitments and in-transit
expectations; receipt events move value into inventory capital; immediate sales
count as realized sales.

Automation intake promotion is another downstream writer. Promoted Telegram
orders should create customer-family ticket history instead of a separate
channel-only order model.

## Compact Record Activity Context

Record-update, History, queue drawers, detail rails, and automation review should
share the compact `sena.getRecordUpdateContext()` read path for ticket and
activity state. Latest-state anchors are backed by
`sena_record_update_anchor_hot` rows and must not scan full observation payloads
on normal reads.

The compact context carries:

- latest stock, sale, order, and receipt anchors by entity
- latest ticket summaries by ticket id
- open customer and supplier ticket summaries
- latest delivery-fee metadata by bucket
- bounded recent record activity entries for shared history/evidence rendering

Observation reads are chronologically ascending with an observation-id
tie-breaker. Keep that ordering stable so same-timestamp ticket and observation
events project deterministically across Rust, main-process caches, and renderer
history surfaces.

The bounded recent activity entries are append-style and may include multiple
recent revisions for the same ticket or entity. Do not derive user-visible
history solely from latest hot anchors; anchors answer current state, while
recent activity answers what changed.

Renderer surfaces should use `src/renderer/src/lib/record-activity.ts` for
read-side ticket options, customer link directories, delivery-fee defaults, and
activity cards. `SenaTicketEvent.lines` is the canonical line field; do not
reintroduce legacy `lineItems` readers.

## Tests and Verification

When changing ticket authoring or projection behavior, prefer focused tests near
the touched surface:

- route mapping: `src/renderer/src/lib/record-update-routes.test.ts`
- Capture hub: `src/renderer/src/routes/record-update-hub.test.tsx`
- Capture wizard: `src/renderer/src/routes/stock-update-session.test.tsx`
- Inbox queue: `src/renderer/src/routes/dashboard.test.tsx`
- SKU evidence: `src/renderer/src/routes/sku-detail-sena.test.tsx`
- SENA Rust types: `cargo test --manifest-path apps/sena-core/Cargo.toml`

Run `pnpm build` for final build verification. Do not pass `--silent` through
to `electron-vite`.
