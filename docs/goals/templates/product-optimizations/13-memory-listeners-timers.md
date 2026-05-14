# Memory, Listeners, Timers, and Subscriptions

## Audit Target

Find leaks or repeated work from listeners, timers, observers, subscriptions, and background polling.

## Inspect

- React effects, event listeners, resize/scroll observers, timers, polling loops, IPC subscriptions, and cleanup behavior after route changes.

## Real Opportunity Criteria

The code leaks resources, duplicates listeners, repeats background work, or degrades responsiveness over time.

## Fix Constraints

Prefer correct cleanup, coalescing, and lifecycle ownership over broad rewrites.

## Verification Required

Record lifecycle scenario, cleanup evidence, focused tests or manual checks, and residual risk in the item notes.
