# Empty, Generated, and Dependent Data States

## Audit Target

Find bugs that appear only with empty workspaces, generated/demo data, or organically updated dependent state.

## Inspect

- First-run state, generated fixtures, demo data, sparse observations, sequential record updates, tickets, orders, receipts, and cross-page propagation.

## Real Finding Criteria

The issue creates NaN values, placeholder leaks, stale state, missing data, contradictory surfaces, broken generated cases, or crashes when expected data is absent.

## Fix Constraints

Preserve realistic generated coverage and organic user update behavior. Do not paper over missing data with misleading defaults.

## Verification Required

Run or add focused checks for the affected data-state class. Record data setup, surfaces checked, and command or screenshot evidence in the item notes.
