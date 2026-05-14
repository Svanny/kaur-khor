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

## Pass 1 Notes

- Finding: automation connection and exposure IPC patches trusted TypeScript-only shapes at runtime, allowing malformed status values or non-finite sort orders to reach the persisted automation store.
- Impact: invalid automation records could cross the renderer-to-main boundary and leave downstream workspace reads with impossible state.
- Fix: validate Telegram connection patches and exposure patches before `updateAutomationState` runs, including channel, status, entity type, entity id, string/null fields, boolean exposure flags, and finite sort orders.
- Verification: `pnpm test -- src/main/automation-store.test.ts` passed 37 tests; `pnpm exec tsc --build tsconfig.json` passed.
- Residual risk: this pass focused on high-confidence boundary validation defects in automation IPC, preferences, image import, updater, and Rust command deserialization; no additional actionable data-validation defect was identified in that inspected set.
