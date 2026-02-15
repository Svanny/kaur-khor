# Threat Model

## Assets
- Inventory and service business data.
- Future auth/session tokens.
- Build and release integrity.

## Trust Boundaries
- User text input to in-app model state.
- Build configuration files to release artifacts.
- Future boundary: app-to-backend API traffic.

## Threats
- Input abuse causing invalid state or unsafe rendering.
- Predictable IDs enabling resource enumeration.
- Secret leakage via source, tests, or scripts.
- Weak platform configs (debug signing, weak web CSP, ATS weakening).

## Mitigations
- Shared validation and normalization across UI flows.
- Opaque random ID generation.
- Secret pattern scanning in merge gate.
- Platform policy checks in merge gate.

## Residual Risks
- No backend currently; auth/network controls are future-facing.
- Manual backup/export actions are placeholders and need secure design when implemented.
