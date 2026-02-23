# Security Best Practices Report

Date: 2026-02-18  
Repository: /Users/svanny/banji

## Executive Summary
A targeted security review was performed across runtime Dart code, platform hardening policy checks, and security test coverage. No critical findings were identified. Four material issues were found and remediated in this change set:
1. Android hardening checks were incomplete and could miss insecure manifest values.
2. Numeric user inputs were validated for type/sign but not bounded to safe maximums.
3. Service-to-SKU references were not defensively constrained at save time.
4. Required-text validation allowed bidirectional control characters that can spoof visual text rendering.

## Critical Findings
None.

## High Findings
### SBP-001: Android hardening gate allowed insecure values if attributes existed
- Severity: High
- Impact: A release could pass security checks while still permitting device backup or cleartext traffic.
- Evidence (fixed):
  - `/Users/svanny/banji/tool/security/check_platform_hardening.sh:36`
  - `/Users/svanny/banji/tool/security/check_platform_hardening.sh:42`
  - `/Users/svanny/banji/test/security/platform_security_policy_test.dart:16`
- Remediation:
  - Enforced exact checks for `android:allowBackup="false"` and `android:usesCleartextTraffic="false"` in both gate script and tests.
- Status: Fixed.

## Medium Findings
### SBP-002: Numeric fields lacked upper-bound validation and defensive clamping
- Severity: Medium
- Impact: Very large values could be accepted and propagate to computed totals, increasing risk of overflow-like behavior and UI/data integrity issues.
- Evidence (fixed):
  - `/Users/svanny/banji/lib/security/security_limits.dart:9`
  - `/Users/svanny/banji/lib/security/security_validators.dart:43`
  - `/Users/svanny/banji/lib/views/inventory/sku_detail_page.dart:124`
  - `/Users/svanny/banji/lib/views/inventory/sku_detail_page.dart:609`
  - `/Users/svanny/banji/lib/views/inventory/service_detail_page.dart:78`
- Remediation:
  - Added shared numeric maximums in `SecurityLimits`.
  - Extended validators with optional `maxValue` checks.
  - Applied max-value validation and save-time clamping for SKU/service numeric fields.
- Status: Fixed.

### SBP-004: Required-text validation allowed bidi control characters
- Severity: Medium
- Impact: Attackers can inject visual-direction control characters to obfuscate names/descriptions and mislead operators during review or edits.
- Evidence (fixed):
  - `/Users/svanny/banji/lib/security/security_validators.dart:10`
  - `/Users/svanny/banji/lib/security/security_validators.dart:30`
  - `/Users/svanny/banji/test/security/security_validators_test.dart:70`
- Remediation:
  - Added explicit rejection of Unicode bidi override/isolation controls (`U+202A..U+202E`, `U+2066..U+2069`) in required-text validation.
  - Added security regression test coverage for bidi control payloads.
- Status: Fixed.

### SBP-003: Service SKU IDs were not constrained to currently available SKUs at persistence boundary
- Severity: Medium
- Impact: Invalid or stale SKU IDs could be retained in service records if state became desynchronized.
- Evidence (fixed):
  - `/Users/svanny/banji/lib/views/inventory/service_detail_page.dart:388`
  - `/Users/svanny/banji/lib/views/inventory/service_detail_page.dart:412`
- Remediation:
  - Added `_selectedExistingSkuIds()` filtering and enforced non-empty filtered set before save.
- Status: Fixed.

## Low Findings
None.

## Verification
- Security gate: `bash /Users/svanny/banji/tool/security/run_security_checks.sh` (PASS)
- Targeted tests:
  - `flutter test /Users/svanny/banji/test/security/security_validators_test.dart /Users/svanny/banji/test/security/platform_security_policy_test.dart` (PASS)

## Residual Risks
- App is currently local-first and not API-backed; future network/auth/storage features will require a dedicated review of transport security, authZ, and secrets-at-rest controls.
