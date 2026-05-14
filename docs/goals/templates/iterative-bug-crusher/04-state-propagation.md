# State Propagation

## Audit Target

Find stale, duplicated, missing, or inconsistent state after user updates.

## Inspect

- Provider reload paths, route transitions, overview/detail consistency, ticket updates, and bridge events.
- Changes that should propagate across Overview, Catalog, detail pages, Logs, Analysis, and Settings.

## Real Finding Criteria

The UI or persisted model shows old data, conflicting data, duplicate identity, or missing updates after a valid action.

## Fix Constraints

Fix identity, invalidation, subscription, or reload causes instead of forcing broad refreshes without evidence.

## Verification Required

Use focused tests or UI interaction checks that perform the update and observe every affected surface. Record evidence in the item notes.

## Pass 1 Notes

- Finding: no high-confidence actionable state propagation bug was identified in this bounded pass.
- Inspected: AutomationProvider reload paths, connected Telegram polling refresh, intake promotion refresh into inventory Work support data, Work intake chat thread refresh, and inventory cache invalidation tests.
- Verification: `pnpm test -- src/renderer/src/state/automation.test.tsx src/renderer/src/routes/automations.test.tsx src/renderer/src/state/inventory.test.tsx` passed 44 tests.
- Residual risk: route-level visual propagation across all desktop/browser surfaces remains covered by the later UI interaction and rendering checklist items.
