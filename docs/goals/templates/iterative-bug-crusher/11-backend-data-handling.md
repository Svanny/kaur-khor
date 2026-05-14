# Backend and Data Handling

## Audit Target

Find bugs in main-process data flow, IPC handlers, Rust runtime boundaries, read/write routing, and backend assumptions.

## Inspect

- Main-process handlers, shared IPC contracts, worker/writer routing, data adapters, imports/exports, and Rust crate call sites.
- Any path that transforms, caches, or persists user data before the renderer sees it.

## Real Finding Criteria

The issue can return stale data, write the wrong record, skip a required write, mishandle worker routing, or break a backend/frontend contract.

## Fix Constraints

Preserve shared contracts and route mutations through the writer path. Do not patch renderer symptoms when the backend source is wrong.

## Verification Required

Run focused backend, IPC, or integration tests that cross the affected boundary. Record command output and remaining risk in the item notes.
