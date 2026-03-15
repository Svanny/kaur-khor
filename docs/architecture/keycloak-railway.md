# Keycloak on Railway

## Scope
This document captures the Banji auth-provider contract after moving OIDC hosting onto a dedicated Railway Keycloak service for `staging` and `prod`.

## Ownership
- Banji runtime roles remain `api`, `event-relay`, `projection-consumer`, and `worker`.
- Keycloak is a repo-managed Railway service under [services/keycloak](/Users/svanny/banji/services/keycloak).
- Keycloak is not added to [config/topology/runtime_roles.json](/Users/svanny/banji/config/topology/runtime_roles.json) and is not part of parity checks for Banji runtime roles.

## Railway Setup
- Create one Railway service for Keycloak and one dedicated PostgreSQL database for Keycloak.
- Generate a public Railway HTTPS domain for the Keycloak service.
- Keep `KC_HOSTNAME` pinned to that public hostname.
- Do not point Banji `AUTH_ISSUER` or `AUTH_JWKS_URL` at `railway.internal`.

Required Railway vars on the Keycloak service:
- `KC_DB=postgres`
- `KC_DB_URL`
- `KC_DB_USERNAME`
- `KC_DB_PASSWORD`
- `KC_BOOTSTRAP_ADMIN_USERNAME`
- `KC_BOOTSTRAP_ADMIN_PASSWORD`
- `KC_HOSTNAME=https://<public-keycloak-domain>`
- `KC_PROXY_HEADERS=xforwarded`
- `KC_HTTP_ENABLED=true`
- `KC_HEALTH_ENABLED=true`

## Banji API Mapping
- `staging`: `AUTH_ISSUER=https://<public-keycloak-domain>/realms/banji-staging`
- `staging`: `AUTH_JWKS_URL=https://<public-keycloak-domain>/realms/banji-staging/protocol/openid-connect/certs`
- `prod`: `AUTH_ISSUER=https://<public-keycloak-domain>/realms/banji-prod`
- `prod`: `AUTH_JWKS_URL=https://<public-keycloak-domain>/realms/banji-prod/protocol/openid-connect/certs`
- `AUTH_AUDIENCE=banji-api`

In `staging`, these values live directly on the Railway `api` service. In `prod`, the API deploy workflow still syncs `AUTH_*` from GitHub environment secrets into the Railway `api` service.

## Tracked Realms
- Realm: `banji-staging`
- Realm: `banji-prod`
- Audience: `banji-api`
- Tracked realm import: [services/keycloak/realm-import/banji-staging-realm.json](/Users/svanny/banji/services/keycloak/realm-import/banji-staging-realm.json)
- Tracked realm import: [services/keycloak/realm-import/banji-prod-realm.json](/Users/svanny/banji/services/keycloak/realm-import/banji-prod-realm.json)

## Deployment Packaging
- The staging workflow packages only `banji-staging-realm.json`.
- The prod workflow packages only `banji-prod-realm.json`.
- Manual deploys must first run [prepare_keycloak_build_context.sh](/Users/svanny/banji/tool/ci/prepare_keycloak_build_context.sh) to avoid importing the wrong realm into an environment.

## Operator Follow-Up
- After Keycloak is live, create the interactive client(s) for frontend or CLI login flows.
- Add exact redirect URIs and allowed origins on those interactive clients.
- Attach the tracked `banji-api-audience` client scope to any client that should call Banji API if a narrower scope assignment is preferred over realm defaults.
