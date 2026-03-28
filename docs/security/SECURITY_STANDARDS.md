# Banji Security Standards (Electron + OWASP ASVS)

## Purpose

This document defines the mandatory secure-by-default controls for the Banji desktop app.

## Mandatory Controls

### 1) Input Validation and Canonicalization

- All user-controlled fields must be validated with shared validators.
- Validation must enforce:
  - required or non-empty checks where applicable
  - numeric domain checks (non-negative or positive)
  - rejection of control characters and bidi controls
  - bounded length limits
- Text must be normalized before persistence.
- Source of truth: [`src/renderer/src/lib/validation.ts`](/Users/svanny/banji/src/renderer/src/lib/validation.ts)

### 2) Identifier Security

- Externally visible SKU and service IDs must be opaque and non-predictable.
- Timestamp-derived IDs are prohibited for user-facing resources.
- Source of truth: [`src/renderer/src/lib/ids.ts`](/Users/svanny/banji/src/renderer/src/lib/ids.ts)

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

### 5) Future-Ready Controls for API/Auth/Storage

- Enforce TLS for any non-local backend transport.
- Use short-lived session tokens and explicit expiration handling.
- Store secrets only in OS-backed secure storage when secrets are introduced.
- Apply request/response schema validation at network boundaries.

## Enforcement

Run:
- `bash /Users/svanny/banji/tool/security/run_security_checks.sh`

Any finding fails the security gate.
