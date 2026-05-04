# Security Test Matrix

Developer docs entrypoint: [Kaur Khor developer docs](../README.md)

## Unit Tests

### `../../src/renderer/src/lib/validation.test.ts`

- Valid text and numeric values are accepted.
- Empty or whitespace-only values are rejected.
- Unsafe bidi and control characters are rejected.
- Over-limit numeric values are rejected.

### `../../src/renderer/src/lib/ids.test.ts`

- SKU and service IDs match the opaque format.
- IDs do not include timestamp-derived segments.
- Large-sample generation avoids collisions in smoke coverage.

### `../../src/main/platform-security.test.ts`

- Electron main process uses a preload bridge.
- Renderer isolation remains enabled.
- Node integration remains disabled.
- Preload exposes the named `kaurKhorDesktop` bridge.
- Renderer HTML does not load remote scripts.

## Gate Script

`bash ../../tool/security/run_security_checks.sh`

Order:
1. `pnpm test`
2. `cargo test --manifest-path ../../apps/desktop-core/Cargo.toml`
3. `bash ../../tool/security/check_secret_patterns.sh`
4. `bash ../../tool/security/check_platform_hardening.sh`

Policy: any finding fails the run.

Secret-pattern gate includes:
- detection of credential-bearing URLs (`scheme://user:pass@host`) in tracked files
- detection of token-like assignments for sensitive key names
- enforcement that tracked templates use approved placeholders for any future secret-valued keys
