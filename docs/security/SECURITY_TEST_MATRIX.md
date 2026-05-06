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
3. `cargo test --manifest-path ../../apps/sena-core/Cargo.toml`
4. `bash ../../tool/security/check_secret_patterns.sh`
5. `bash ../../tool/security/check_platform_hardening.sh`
6. `bash ../../tool/security/check_dependency_audit.sh`

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
