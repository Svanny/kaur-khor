# Startup and First Render

## Audit Target

Improve startup and first meaningful render when there is measured or code-evidenced friction.

## Inspect

- Startup readiness, initial data reads, hydration, route boot, expensive synchronous work, and first visible loading states.

## Real Opportunity Criteria

The path delays first usable UI, blocks startup on noncritical work, or shows avoidable blank/unstable states.

## Fix Constraints

Do not reintroduce full observation hydration or noncritical reads into the blocking startup path.

## Verification Required

Run startup benchmarks, focused tests, or before/after timing checks where practical. Record evidence in the item notes.
