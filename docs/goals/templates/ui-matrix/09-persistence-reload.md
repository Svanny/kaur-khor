# Persistence and Reload

## Audit Target

Test UI consistency after reload, route changes, close/reopen, or browser refresh.

## Inspect

- User-created data, generated data, ticket states, settings, preferences, current navigation, and browser storage behavior.

## Real Finding Criteria

State disappears, reverts, duplicates, shows stale values, or routes to the wrong surface after reload/restart.

## Fix Constraints

Preserve local-first data boundaries and current userData separation.

## Verification Required

Run reload/restart checks or tests that cross the persistence boundary. Record before/after state in the item notes.
