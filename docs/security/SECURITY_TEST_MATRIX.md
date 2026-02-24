# Security Test Matrix

## Unit Tests

### `/Users/svanny/banji/test/security/security_validators_test.dart`
- Valid text and numeric values are accepted.
- Empty/whitespace-only values are rejected.
- Control characters are rejected.
- Over-limit text is bounded by normalization and rejected by validation.
- Invalid numeric values, NaN, and infinities are rejected.

### `/Users/svanny/banji/test/security/id_generator_test.dart`
- SKU and Service IDs match required format.
- IDs do not include timestamp-derived segments.
- High-volume generation has no collisions in smoke tests.

### `/Users/svanny/banji/test/security/platform_security_policy_test.dart`
- Android release signing config is not debug.
- Android app ID is not `com.example.*`.
- Android manifest includes explicit backup policy.
- iOS Info.plist does not weaken ATS.
- macOS release entitlements remain minimal.
- Web index includes CSP.

## Gate Script
`bash /Users/svanny/banji/tool/security/run_security_checks.sh`

Order:
1. `flutter analyze`
2. `flutter test /Users/svanny/banji/test/security`
3. `bash /Users/svanny/banji/tool/security/check_secret_patterns.sh`
4. `bash /Users/svanny/banji/tool/security/check_platform_hardening.sh`

Policy: any finding fails the run.

Secret-pattern gate includes:
- detection of credential-bearing URLs (`scheme://user:pass@host`) in tracked files,
- detection of token-like assignments for sensitive key names,
- enforcement that tracked env templates use approved placeholders for secret-valued keys.
