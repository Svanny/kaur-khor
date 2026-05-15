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
