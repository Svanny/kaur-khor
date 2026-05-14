# Logic Bugs

## Audit Target

Find incorrect business logic, calculations, branching, filtering, sorting, aggregation, or derived values.

## Inspect

- Inventory summaries, ticket state, charts, analysis outputs, catalog helpers, and cross-page derived data.
- Edge cases around zero, empty, sparse, generated, and organically updated data.

## Real Finding Criteria

The issue produces a wrong user-visible result, contradictory data, missed update, crash, or incorrect persisted state.

## Fix Constraints

Update the underlying model path, not only labels or display copy.

## Verification Required

Run focused tests that prove the corrected behavior. Record the failing scenario and passing check in the item notes.

## Pass 1 Notes

- Finding: no high-confidence actionable logic bug was identified in this bounded pass.
- Inspected: latest-observation selection, overview stale-update logic, inventory snapshot projection, automation metrics, automation test-message totals, and backend observation ordering guarantees.
- Verification: `pnpm test -- src/main/automation-store.test.ts src/renderer/src/routes/overview/view-model.test.ts src/renderer/src/routes/inventory/view-model.test.ts` passed 53 tests across the available focused files.
- Residual risk: broader calculation-heavy SENA inference and chart view models remain covered by later data-model/calculation and rendering checklist items.
