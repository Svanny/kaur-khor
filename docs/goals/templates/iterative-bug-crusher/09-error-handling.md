# Error Handling

## Audit Target

Find missing, misleading, swallowed, overbroad, or user-hostile error handling.

## Inspect

- Main/preload/renderer boundaries, save flows, imports, exports, backups, updates, network integrations, and async operations.
- Loading, retry, partial failure, and recovery states.

## Real Finding Criteria

The issue hides a real failure, crashes unnecessarily, blocks recovery, reports the wrong cause, or leaves data status ambiguous.

## Fix Constraints

Handle failures that can actually occur. Do not add speculative catch-all behavior that masks bugs.

## Verification Required

Run focused tests or controlled failure checks. Record the failure mode and recovery behavior in the item notes.
