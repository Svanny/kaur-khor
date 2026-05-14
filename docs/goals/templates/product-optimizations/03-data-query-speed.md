# Data Query Speed

## Audit Target

Improve slow local data queries or repeated transformations.

## Inspect

- Main-process read paths, worker routing, SQLite queries, normalized summaries, catalog helpers, exports, and analysis inputs.

## Real Opportunity Criteria

The path performs avoidable full scans, repeated transformations, duplicate reads, or slow queries affecting user-visible flows.

## Fix Constraints

Preserve writer/read-worker boundaries and do not weaken persistence correctness.

## Verification Required

Run focused tests plus query timing, benchmark, or before/after measurement where practical. Record evidence in the item notes.
