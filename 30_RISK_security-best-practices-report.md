# Security Best Practices Report

Date: 2026-03-28  
Repository: `/Users/svanny/banji`

## Executive Summary

A targeted review was performed across the Electron desktop runtime, renderer validation helpers, preload boundary, and repo security gates after the Flutter cutover. No critical findings were identified in the maintained app surface.

## Baseline Controls Confirmed

### Input validation and normalization

- Shared renderer validators enforce required text, bidi/control-character rejection, and bounded numeric inputs.
- Evidence:
  - `/Users/svanny/banji/src/renderer/src/lib/validation.ts`
  - `/Users/svanny/banji/src/renderer/src/lib/validation.test.ts`

### Opaque identifier generation

- SKU and service IDs use secure, non-timestamp random identifiers.
- Evidence:
  - `/Users/svanny/banji/src/renderer/src/lib/ids.ts`
  - `/Users/svanny/banji/src/renderer/src/lib/ids.test.ts`

### Electron boundary hardening

- The renderer is constrained behind a preload bridge with context isolation enabled and Node integration disabled.
- Evidence:
  - `/Users/svanny/banji/src/main/index.ts`
  - `/Users/svanny/banji/src/preload/index.ts`
  - `/Users/svanny/banji/src/main/platform-security.test.ts`

### Secret handling

- Tracked source and env templates remain protected by merge-gate secret scanning.
- Evidence:
  - `/Users/svanny/banji/tool/security/check_secret_patterns.sh`
  - `/Users/svanny/banji/tool/security/run_security_checks.sh`

## Residual Risks

- Packaging, signing, and notarization controls are still out of scope.
- Future networked auth/storage features will require another security review focused on transport, authZ, and secrets at rest.
