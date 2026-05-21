# Kaur Khor Security Standards (Electron + OWASP ASVS)

Developer docs entrypoint: [Kaur Khor developer docs](../README.md)

## Purpose

This document defines the mandatory secure-by-default controls for the Kaur Khor local Electron app.

## Mandatory Controls

### 1) Input Validation and Canonicalization

- All user-controlled fields must be validated with shared validators.
- Validation must enforce:
  - required or non-empty checks where applicable
  - numeric domain checks (non-negative or positive)
  - rejection of control characters and bidi controls
  - bounded length limits
- Text must be normalized before persistence.
- Decimal and money fields must reject JavaScript-only numeric syntaxes such as
  exponent and hexadecimal literals unless the UI explicitly models them.
- CSV exports must neutralize spreadsheet formula-leading cells before writing
  user-controlled values.
- Source of truth: [`src/renderer/src/lib/ui/validation.ts`](../../src/renderer/src/lib/ui/validation.ts)

### 2) Identifier Security

- Externally visible SKU and service IDs must be opaque and non-predictable.
- Timestamp-derived IDs are prohibited for user-facing resources.
- Source of truth: [`src/renderer/src/lib/formatting/ids.ts`](../../src/renderer/src/lib/formatting/ids.ts)

### 3) Secret Handling

- Do not store credentials, tokens, private keys, or secrets in source control.
- Do not print sensitive material to logs.
- Secret scanning is mandatory in the security gate.

### 4) Electron Runtime Hardening Baseline

- `BrowserWindow` must use a preload bridge.
- `contextIsolation` must remain enabled.
- `nodeIntegration` must remain disabled.
- Preload must expose a narrow `contextBridge` API instead of direct Node access in the renderer.
- Renderer HTML must not load remote scripts.
- Generated HTML artifacts opened from local tooling must not load remote
  script or stylesheet origins.
- The security gate must fail on explicit unsafe `webPreferences` drift, not only
  pass on the presence of known-safe strings.

### 5) Local Data and Future Extension Controls

- Store any future secrets only in OS-backed secure storage.
- Keep local backup/export behavior explicit and user-triggered.
- Confine local file reads, deletes, and uploads to canonicalized approved
  roots. Database-stored paths and renderer-supplied paths are untrusted until
  checked against those roots.
- Validate any future IPC or network boundary with explicit request/response schemas.
- Treat remote content, sync, and remote code execution as opt-in additions, not default app behavior.
- Review package advisories before release with `pnpm audit --audit-level=moderate`.
  Local offline runs may warn and skip the network audit, but release/CI runs
  should set `KAUR_KHOR_REQUIRE_NETWORK_AUDIT=1`.

## Enforcement

Run:
- `bash ../../tools/security/run_security_checks.sh`

Any finding fails the security gate.
