# Imports, Types, and Dead Code

## Audit Target

Find broken imports, incorrect exports, type errors, unused code that hides risk, and stale assumptions between modules.

## Inspect

- TypeScript imports/exports, shared type re-exports, preload/browser bridge contracts, generated type expectations, and dead paths touched by current findings.

## Real Finding Criteria

The issue breaks typecheck/build, exposes the wrong contract, leaves unreachable stale behavior, or allows a real regression to hide.

## Fix Constraints

Remove only code made obsolete by the fix or code proven harmful. Avoid broad cleanup unrelated to a verified issue.

## Verification Required

Run typecheck or the smallest build/test that covers the contract. Record exact commands and any intentionally untouched dead code in the item notes.
