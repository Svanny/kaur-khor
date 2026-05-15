# Security Issues

## Audit Target

Find security weaknesses that are supported by code evidence.

## Inspect

- Electron security boundaries, preload exposure, IPC handlers, and renderer access.
- File, path, import/export, backup, restore, and update flows.
- Token, secret, URL, shell command, archive, and external process handling.

## Real Finding Criteria

The issue creates a plausible trust-boundary bypass, unsafe input handling, data exposure, unsafe file access, insecure process execution, or weakened platform hardening.

## Fix Constraints

Preserve user workflows and do not weaken validation or isolation to make a test pass.

## Verification Required

Run focused tests or security checks that cover the changed path. Record command output and residual risk in the item notes.
