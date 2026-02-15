# Banji Security Standards (OWASP MASVS + ASVS)

## Purpose
This document defines mandatory secure-by-default controls for Banji.

## Mandatory Controls

### 1) Input Validation and Canonicalization (MASVS-CODE, ASVS V5)
- All user-controlled fields must be validated with shared validators.
- Validation must enforce:
  - required/non-empty checks where applicable
  - numeric domain checks (non-negative or positive)
  - rejection of control characters
  - bounded length limits
- Text is normalized before persistence.

### 2) Identifier Security (MASVS-CRYPTO/CODE, ASVS V4)
- Externally visible resource IDs must be opaque and non-predictable.
- Timestamp-derived IDs are prohibited for user-facing resources.
- Use `/Users/svanny/banji/lib/security/id_generator.dart`.

### 3) Secret Handling (MASVS-STORAGE, ASVS V9)
- Do not store credentials, tokens, private keys, or secrets in source control.
- Do not print sensitive material to logs.
- Secret scanning is mandatory in the security gate.

### 4) Platform Hardening Baseline (MASVS-PLATFORM)
- Android
  - Release builds must not use debug signing.
  - Production app ID must not use `com.example.*`.
  - Manifest must define explicit backup policy.
- iOS
  - `NSAllowsArbitraryLoads` must remain absent unless explicitly approved and documented.
- macOS
  - Release entitlements must remain minimal.
  - Do not enable network-server entitlement in release unless justified.
- Web
  - `index.html` must include a Content Security Policy meta tag.

### 5) Future-Ready Controls for API/Auth/Storage (MASVS-NETWORK, ASVS V2/V3/V8)
- Enforce TLS for backend transport.
- Use short-lived session tokens and explicit expiration handling.
- Store secrets only in platform secure storage (Keychain/Keystore equivalents).
- Apply request/response schema validation at network boundaries.

## Enforcement
Run:
- `bash /Users/svanny/banji/tool/security/run_security_checks.sh`

Any finding fails the security gate.
