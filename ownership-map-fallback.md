# Security Ownership Map (Fallback)

Date: 2026-02-15  
Scope: `/Users/svanny/banji`

## Tooling Status
- Intended tool: `security-ownership-map/scripts/run_ownership_map.py`
- Blocker: `networkx` dependency unavailable in the current offline environment.

## Git-Based Fallback Results
- Top contributors in scope (`lib`, `android`, `ios`, `macos`, `web`, `tool/security`):
  - `66  svanny <lymonysovann@gmail.com>`
- Security-sensitive files touched in last 12 months:
  - `/Users/svanny/banji/lib/security/id_generator.dart`
  - `/Users/svanny/banji/lib/security/security_limits.dart`
  - `/Users/svanny/banji/lib/security/security_validators.dart`
  - `/Users/svanny/banji/tool/security/check_platform_hardening.sh`
  - `/Users/svanny/banji/tool/security/check_secret_patterns.sh`
  - `/Users/svanny/banji/tool/security/run_security_checks.sh`
  - `/Users/svanny/banji/android/app/src/main/AndroidManifest.xml`
  - `/Users/svanny/banji/web/index.html`

## Ownership Risk Summary
- Effective bus factor for sensitive code paths is currently `1`.
- Hidden-owner risk is low (single active maintainer), but continuity risk is high due to single-person ownership.

## Recommendation
- When network access is available, run the full ownership map workflow to generate `people.csv`, `files.csv`, and `summary.json` artifacts for trend tracking.
