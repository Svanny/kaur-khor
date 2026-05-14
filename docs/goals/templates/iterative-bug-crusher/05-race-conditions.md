# Race Conditions

## Audit Target

Find async ordering bugs, lost updates, duplicate writes, stale reads, and lifecycle races.

## Inspect

- Startup readiness, read-worker/writer paths, IPC calls, save flows, background work, timers, polling, and retries.
- Concurrent user actions, route changes during saves, reloads, and app close/reopen behavior.

## Real Finding Criteria

The issue can produce nondeterministic UI state, data loss, duplicate side effects, stuck loading, or stale results.

## Fix Constraints

Prefer explicit sequencing, idempotency, cancellation, or coalescing over arbitrary delays.

## Verification Required

Add or run tests that exercise ordering or concurrent actions where practical. Record why the race is closed in the item notes.
