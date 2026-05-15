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
