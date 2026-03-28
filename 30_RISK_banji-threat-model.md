# Banji Threat Model

Date: 2026-03-28  
Scope: `/Users/svanny/banji` (Electron desktop runtime, desktop-core integration, and security gates)

## 1) System Model

- Electron desktop runtime:
  - `/Users/svanny/banji/src/main/index.ts`
  - `/Users/svanny/banji/src/preload/index.ts`
  - `/Users/svanny/banji/src/renderer/src/App.tsx`
- Shared validation and opaque ID generation:
  - `/Users/svanny/banji/src/renderer/src/lib/validation.ts`
  - `/Users/svanny/banji/src/renderer/src/lib/ids.ts`
- Security gate and platform hardening:
  - `/Users/svanny/banji/tool/security/run_security_checks.sh`
  - `/Users/svanny/banji/tool/security/check_platform_hardening.sh`

Out of scope: packaging, signing/notarization, and non-local deployment paths.

## 2) Trust Boundaries, Assets, and Entry Points

### Trust Boundaries

- User input -> renderer form state -> persisted desktop-core data.
- Electron main/preload -> renderer execution context.
- Source tree -> merge gate scripts/tests.

### Assets

- Inventory, services, ranking, and stock-report integrity.
- Desktop runtime integrity.
- Future auth/session material.

### Entry Points

- Catalog and editor routes:
  - `/Users/svanny/banji/src/renderer/src/routes/inventory.tsx`
  - `/Users/svanny/banji/src/renderer/src/routes/sku-form.tsx`
  - `/Users/svanny/banji/src/renderer/src/routes/service-form.tsx`
- Operations and planning routes:
  - `/Users/svanny/banji/src/renderer/src/routes/stock-update.tsx`
  - `/Users/svanny/banji/src/renderer/src/routes/stock-update-session.tsx`
  - `/Users/svanny/banji/src/renderer/src/routes/planning.tsx`
- Electron runtime boundary:
  - `/Users/svanny/banji/src/main/index.ts`
  - `/Users/svanny/banji/src/preload/index.ts`

## 3) Prioritized Threats

### T1: Integrity degradation through invalid or oversized input

- Likelihood: Medium
- Impact: Medium
- Mitigations:
  - shared validation and normalization in the renderer
  - route-level save guards before persistence

### T2: Predictable IDs or accidental collisions

- Likelihood: Low
- Impact: Medium
- Mitigations:
  - opaque 20-character random IDs for SKU and service records
  - test coverage for format and collision smoke checks

### T3: Renderer escape through weak Electron configuration

- Likelihood: Medium
- Impact: High
- Mitigations:
  - preload bridge required
  - `contextIsolation: true`
  - `nodeIntegration: false`
  - no remote renderer scripts

### T4: Secret leakage through tracked source or templates

- Likelihood: Medium
- Impact: High
- Mitigations:
  - merge-gate secret scanning
  - approved placeholder enforcement in env templates

## 4) Residual Risks

- Packaging and signing controls are not yet implemented.
- Future network/auth features will increase threat severity and require a dedicated review.
