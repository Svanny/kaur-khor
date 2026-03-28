# Security Ownership Map (Fallback)

Date: 2026-03-28  
Scope: `/Users/svanny/banji`

## Tooling Status

- Intended tool: `security-ownership-map/scripts/run_ownership_map.py`
- Blocker: `networkx` dependency unavailable in the current offline environment

## Git-Based Fallback Results

- Top contributors in last 12 months:
  - `109  svanny <lymonysovann@gmail.com>`
  - `2  Monysovann Ly <115179959+Svanny@users.noreply.github.com>`
- Security-sensitive files touched in last 12 months:
  - `/Users/svanny/banji/src/main/index.ts`
  - `/Users/svanny/banji/src/preload/index.ts`
  - `/Users/svanny/banji/src/renderer/src/lib/ids.ts`
  - `/Users/svanny/banji/src/renderer/src/lib/validation.ts`
  - `/Users/svanny/banji/tool/security/check_platform_hardening.sh`
  - `/Users/svanny/banji/tool/security/check_secret_patterns.sh`
  - `/Users/svanny/banji/tool/security/run_security_checks.sh`

## Ownership Risk Summary

- Effective bus factor for sensitive code paths is currently `1`
- Hidden-owner risk is low, but continuity risk remains high due to single-person ownership

## Recommendation

- When network access is available, run the full ownership map workflow to generate `people.csv`, `files.csv`, and `summary.json` for trend tracking
