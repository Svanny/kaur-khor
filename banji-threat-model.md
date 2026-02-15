# Banji Threat Model

Date: 2026-02-15  
Scope: `/Users/svanny/banji` (Flutter client runtime + platform/web config + security gates)

## 1) System Model (Repo-Evidenced)
- Flutter client app with inventory/service editing flows:
  - `/Users/svanny/banji/lib/main.dart:9`
  - `/Users/svanny/banji/lib/views/inventory/view_all_page.dart:10`
  - `/Users/svanny/banji/lib/views/inventory/sku_detail_page.dart:12`
  - `/Users/svanny/banji/lib/views/inventory/service_detail_page.dart:17`
- Shared validation and ID generation security controls:
  - `/Users/svanny/banji/lib/security/security_validators.dart:1`
  - `/Users/svanny/banji/lib/security/id_generator.dart:5`
- Platform and web hardening controls verified by tests/scripts:
  - `/Users/svanny/banji/tool/security/check_platform_hardening.sh:1`
  - `/Users/svanny/banji/test/security/platform_security_policy_test.dart:5`
  - `/Users/svanny/banji/web/index.html:23`

Out of scope: CI secrets management outside repo, backend/API controls (no backend service present in this codebase).

## 2) Trust Boundaries, Assets, and Entry Points
### Trust Boundaries
- User input -> in-app model state (text and numeric fields).
- Platform/web config -> release runtime behavior.
- Source tree -> security gate scripts/tests.

### Assets
- Inventory/service data integrity.
- Platform hardening posture (backup/cleartext/ATS/entitlements/CSP).
- Future-sensitive identifiers and potential integration tokens.

### Entry Points
- SKU and Service edit forms:
  - `/Users/svanny/banji/lib/views/inventory/sku_detail_page.dart:103`
  - `/Users/svanny/banji/lib/views/inventory/service_detail_page.dart:58`
- Search fields:
  - `/Users/svanny/banji/lib/views/inventory/shared_widgets.dart:350`
- Android manifest and web CSP policy surfaces:
  - `/Users/svanny/banji/android/app/src/main/AndroidManifest.xml:2`
  - `/Users/svanny/banji/web/index.html:23`

## 3) Attacker Capabilities (Assumed)
- Can provide arbitrary UI input values (including malformed numeric/text payloads).
- Can attempt to exploit platform misconfiguration in release builds.
- Cannot execute arbitrary native code from this repo alone.
- Cannot directly access a backend data plane (none present in scope).

## 4) Prioritized Threats (Abuse Paths)
### T1: Integrity degradation through oversized numeric payloads
- Likelihood: Medium
- Impact: Medium
- Priority: Medium
- Path: User submits very large finite values; app computations/persistence accept them; downstream displays/logic may degrade.
- Mitigations now present:
  - Max-bound validation and save-time clamping:
    - `/Users/svanny/banji/lib/security/security_validators.dart:43`
    - `/Users/svanny/banji/lib/views/inventory/sku_detail_page.dart:623`
    - `/Users/svanny/banji/lib/views/inventory/service_detail_page.dart:403`

### T2: Release hardening regression via weak policy checks
- Likelihood: Medium
- Impact: High
- Priority: High
- Path: Insecure manifest value committed while gates only check attribute presence.
- Mitigations now present:
  - Exact-value assertions for backup/cleartext flags:
    - `/Users/svanny/banji/tool/security/check_platform_hardening.sh:36`
    - `/Users/svanny/banji/test/security/platform_security_policy_test.dart:16`

### T3: Relationship tampering/staleness in service SKU references
- Likelihood: Low
- Impact: Medium
- Priority: Low
- Path: Service save includes SKU IDs not present in current catalog.
- Mitigations now present:
  - Save-time filtering to existing SKU IDs:
    - `/Users/svanny/banji/lib/views/inventory/service_detail_page.dart:412`

## 5) Existing Controls
- Shared input normalization and validation:
  - `/Users/svanny/banji/lib/security/security_validators.dart:24`
- Opaque random IDs:
  - `/Users/svanny/banji/lib/security/id_generator.dart:8`
- Secret pattern scanning:
  - `/Users/svanny/banji/tool/security/check_secret_patterns.sh:49`
- Platform security gate and tests:
  - `/Users/svanny/banji/tool/security/run_security_checks.sh:1`

## 6) Recommended Next Controls
- Add integration tests asserting clamped numeric values remain stable in list/detail rendering.
- If export/import is implemented, validate schema at import boundary and cap collection sizes.
- If backend is introduced, define authN/authZ model and token storage requirements before implementation.

## 7) Assumptions Affecting Ranking
- App remains local-first with no internet-exposed backend in current scope.
- No high-sensitivity regulated data is currently handled.
- Future network features may materially increase threat severity and control requirements.
