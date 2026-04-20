# Ticketing Architecture

Back to the docs index: [banji developer docs](/Users/svanny/banji/docs/README.md)

## Contract

Banji removes the legacy batch update system in favor of a ticketing system.

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

## Observation Shape

Ticket events are carried in `SenaObservationInput.ticketEvents`.

Relevant contracts:

- TypeScript shared shape: [`src/shared/sena.ts`](/Users/svanny/banji/src/shared/sena.ts)
- Rust SENA shape: [`apps/sena-core/src/types.rs`](/Users/svanny/banji/apps/sena-core/src/types.rs)
- observation helpers: [`src/renderer/src/routes/observation-payload.ts`](/Users/svanny/banji/src/renderer/src/routes/observation-payload.ts)

Ticket-only updates count as structured observation signals. They must not be
collapsed into free-form notes, because downstream projections need family,
lifecycle, stage, party metadata, line items, and revision data.

Structured party metadata belongs in the ticket event even when the UI places it
inside a notes section. Channel values should be normalized case-insensitively,
and customer name/phone lookup should use normalized keys.

## Record Update

Record Update remains the canonical authoring surface. The primary wizards are:

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

Customer channel, customer name, and phone live in the Record Update notes block
for customer-facing flows. That is a UI placement decision only; the backend
still stores those values as structured ticket party metadata.

Immediate sale is its own same-session sale flow. It records a customer-family
demand event that is resolved immediately, but it should not be framed as
"completed customer fulfillment" inside Customer order.

## Overview

Overview is the operational queue. Its top-level family switch is exactly:

- Customer
- Supplier
- All

Customer mode shows customer-family ticket work. Supplier mode shows
supplier-family ticket work. All mode may combine both families, but rows must
retain clear family labels so customer commitments and supplier replenishment do
not visually merge.

Do not reintroduce the legacy batch-action prompt. Overview task actions should
open or update one ticket-backed work item at a time.

## Downstream Projections

SKU detail should expose ticket state as supporting evidence, not as a new
equal-weight page. Ticket events that touch the SKU appear in the evidence
timeline as chips such as customer order created, immediate sale, supplier order
placed, ETA changed, partial receipt, full receipt, correction, and cancellation.

Service detail should show customer commitments directly and supplier-side state
through bottleneck recovery paths. A service is not replenished directly.

Performance may use ticket state for interventions such as overdue customer
follow-ups, blocked bottleneck restocks, repeated supplier delay, and
cancellation clusters. It should not become a ticket board.

Analysis may use ticket events as evidence classes. It should not allow inline
ticket editing.

Financials must not count open customer tickets as realized revenue. Supplier
ticket creation affects commitments and in-transit expectations; receipt events
move value into inventory capital; immediate sales count as realized sales.

## Tests and Verification

When changing ticket authoring or projection behavior, prefer focused tests near
the touched surface:

- route mapping: `src/renderer/src/lib/record-update-routes.test.ts`
- Record Update hub: `src/renderer/src/routes/record-update-hub.test.tsx`
- Record Update wizard: `src/renderer/src/routes/stock-update-session.test.tsx`
- Overview queue: `src/renderer/src/routes/dashboard.test.tsx`
- SKU evidence: `src/renderer/src/routes/sku-detail-sena.test.tsx`
- SENA Rust types: `cargo test --manifest-path apps/sena-core/Cargo.toml`

Run `pnpm build` for final build verification. Do not pass `--silent` through
to `electron-vite`.
