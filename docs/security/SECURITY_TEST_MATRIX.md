# Security Test Matrix

Developer docs entrypoint: [Kaur Khor developer docs](../README.md)

## Unit Tests

### `../../src/renderer/src/lib/ui/validation.test.ts`

- Valid text and numeric values are accepted.
- Empty or whitespace-only values are rejected.
- Unsafe bidi and control characters are rejected.
- Over-limit numeric values are rejected.

### `../../src/renderer/src/lib/formatting/ids.test.ts`

- SKU and service IDs match the opaque format.
- IDs do not include timestamp-derived segments.
- Large-sample generation avoids collisions in smoke coverage.

### `../../src/main/security/platform-security.test.ts`

- Electron main process uses a preload bridge.
- Renderer isolation remains enabled.
- Node integration remains disabled.
- Preload exposes the named `kaurKhorDesktop` bridge.
- Renderer HTML does not load remote scripts.

## Gate Script

`bash ../../tools/security/run_security_checks.sh`

Order:
1. `pnpm test`
2. `cargo test --manifest-path ../../apps/desktop-core/Cargo.toml`
3. `cargo test --manifest-path ../../apps/sena-core/Cargo.toml`
4. `bash ../../tools/security/check_secret_patterns.sh`
5. `bash ../../tools/security/check_platform_hardening.sh`
6. `bash ../../tools/security/check_dependency_audit.sh`

Policy: any finding fails the run.

Secret-pattern gate includes:
- detection of credential-bearing URLs (`scheme://user:pass@host`) in tracked files
- detection of token-like assignments for sensitive key names
- enforcement that tracked templates use approved placeholders for any future secret-valued keys

Platform hardening gate includes:
- positive checks for the audited preload bridge, context isolation, and disabled
  renderer Node integration
- negative checks that fail on unsafe `webPreferences` drift such as disabled
  web security, enabled Node integration, insecure mixed content, or renderer
  command-line switch injection

Dependency audit gate includes:
- `pnpm audit --audit-level=moderate`
- an offline warning fallback for local machines without registry access
- strict offline failure when `KAUR_KHOR_REQUIRE_NETWORK_AUDIT=1` is set

The `release` workflow runs this gate and all five platform packaging jobs on
pull requests targeting `main`, as well as on the existing main and tag pushes.
Pull requests do not publish release artifacts; publication remains tag-only.
The default token permission is `contents: read`; only tag publication receives
`contents: write`. PR macOS/Windows packaging uses explicit unsigned steps with
no signing-secret environment. Event/permission/secret boundaries and the
installed Electron proxy bootstrap are checked by
`tools/scripts/dependency-maintenance.test.mjs`.
Review dependency repairs against the audit and packaging results for the PR's
current commit before merging. Keep unresolved upstream advisories visible and
do not raise the audit threshold or add ignore rules to make a repair pass.

The `ui-matrix` workflow also runs on PRs to `main` and main pushes. It uses a
read-only token and no signing secrets, runs the complete desktop/browser/mobile
matrix on macOS, and saves diagnostic screenshots for seven days. Populated
browser scenarios explicitly import synthetic backup fixtures; normal startup,
reset, and fresh scenarios must remain blank. Chart checks retain geometry,
internal-scroll, offscreen-flag, and unclipped-control assertions and verify that
the complete control row can scroll into view.
Fixed chart bounds run at a measured 1760x1000 content viewport. Responsive
1280x800 and 1600x1000 native windows additionally check wrapped-control and
header/chart containment. Resize checks distinguish native dimensions from CSS
pixels using the actual zoom factor, and emit geometry diagnostics for CI.
