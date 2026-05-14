# Scroll and Input Lag

## Audit Target

Improve scroll, resize, typing, and click responsiveness.

## Inspect

- Scroll handlers, resize handlers, input handlers, debouncing, throttling, large lists, nested panels, and synchronous saves.

## Real Opportunity Criteria

Interaction latency is visible, handlers run too often, input feels blocked, or scrolling becomes janky.

## Fix Constraints

Prefer coalescing, deferral, and stable dimensions over behavior-changing rewrites.

## Verification Required

Use interaction tests, visual checks, or before/after latency evidence. Record evidence in the item notes.
