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

## Pass 1 Notes

- Finding: updater `sourceVersion` from the renderer IPC payload was embedded into generated shell and PowerShell updater scripts without validating that it was a release version.
- Impact: a crafted renderer payload could place shell or PowerShell metacharacters into the generated update script.
- Fix: constrain source-build update versions to `latest` or semver-style release tags before script generation and archive URL construction.
- Verification: `pnpm test -- src/main/desktop-update.test.ts` passed 6 tests; `bash tool/security/run_security_checks.sh` passed all 6 gates, including full Vitest, both Rust crate suites, secret checks, platform hardening, and dependency audit.
- Residual risk: no additional high-confidence security findings were identified in the inspected Electron, preload, IPC, local file, backup/restore, update, image import, and Telegram automation boundaries.
