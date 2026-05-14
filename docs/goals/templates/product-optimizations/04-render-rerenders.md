# Renders and Rerenders

## Audit Target

Reduce unnecessary render work where it affects UI responsiveness.

## Inspect

- Heavy components, provider values, derived data in render paths, hidden mounted panels, memo boundaries, and table/chart rows.

## Real Opportunity Criteria

There is observable jank, repeated expensive calculation, avoidable rerender fanout, or memory pressure.

## Fix Constraints

Avoid speculative micro-optimizations and preserve component API behavior.

## Verification Required

Use tests, profiler evidence, render-count evidence, or interaction timing. Record evidence in the item notes.
