# Loading, Empty, and Error States

## Audit Target

Test user-facing loading, empty, disabled, unavailable, and error states.

## Inspect

- First-run empty pages, empty charts/tables/drawers, loading placeholders, save progress, import/export failures, retry paths, and partial data states.

## Real Finding Criteria

The UI shows misleading values, blank screens, NaN, placeholder leaks, frozen feedback, unrecoverable errors, or unavailable actions without explanation.

## Fix Constraints

Keep states truthful. Do not hide real errors behind generic success or permanent loading states.

## Verification Required

Record the state setup, expected visible result, recovery path if applicable, and evidence in the item notes.
