# Desktop Dependent State

## Audit Target

Test desktop workflows where later UI state depends on earlier user actions.

## Inspect

- SKU/service creation, stock counts, price/cost updates, customer orders, supplier orders, receipts, corrections, and ticket lifecycle.
- Propagation across Overview, Catalog, detail pages, Inventory, Performance, Analysis, and Logs.

## Real Finding Criteria

The app shows stale, contradictory, missing, duplicated, or visually broken state after sequential updates.

## Fix Constraints

Prioritize desktop behavior and fix the underlying state/data path when possible.

## Verification Required

Use real UI interactions plus focused automated coverage where practical. Record workflows and evidence in the item notes.
