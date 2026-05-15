# Data Validation

## Audit Target

Find inputs, payloads, and persisted records that can accept malformed, missing, contradictory, or unsafe values.

## Inspect

- Shared IPC types, main-process validators, renderer forms, import/export paths, and generated/demo data.
- Numeric values, dates, ids, enum-like strings, quantities, prices, costs, and ticket metadata.

## Real Finding Criteria

The issue can corrupt data, misrepresent user state, crash a workflow, or let invalid records cross a boundary.

## Fix Constraints

Keep validation close to the boundary that receives the untrusted data and preserve existing valid records.

## Verification Required

Add or run focused tests for invalid and valid inputs. Record covered cases in the item notes.
