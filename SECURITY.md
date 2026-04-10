# Security Policy

## Scope
This policy applies to all code and configuration in `/Users/svanny/banji`.

## Reporting
- Report potential vulnerabilities privately to project maintainers.
- Do not open public issues for unresolved vulnerabilities.
- Include reproduction steps, impact, and affected paths.

## Response SLA
- Acknowledgement: within 2 business days.
- Initial triage: within 5 business days.
- Remediation target:
  - Critical/High: patch or mitigation within 14 days.
  - Medium: patch within 30 days.
  - Low: patch in regular maintenance cycle.

## Secure Development Rules
- Security checks are required before merge:
  - `bash /Users/svanny/banji/tool/security/run_security_checks.sh`
- No hardcoded credentials, API keys, tokens, or private keys.
- New user-controlled input paths must use shared validation utilities in the Electron/TypeScript codebase under `/Users/svanny/banji/src`.
- New externally visible identifiers must use opaque random IDs.

## Disclosure
Coordinated disclosure is preferred. Security details are published after a fix or mitigation is available.
