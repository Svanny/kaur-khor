# Keycloak on Railway

This service hosts Banji's staging OIDC issuer on Railway. It is intentionally separate from `apps/api` and is not part of Banji's runtime role topology.

## Railway Service Contract
- Generate a public Railway HTTPS domain for the Keycloak service.
- Use a dedicated PostgreSQL database for Keycloak. Do not point Keycloak at Banji's application database.
- Keep the API service pointed at the public Keycloak hostname, not `railway.internal`.

Required Railway runtime vars:
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

Optional but recommended:
- `KC_METRICS_ENABLED=true`

## Banji Mapping
For the tracked realm imports, Banji expects:

```env
AUTH_ISSUER=https://<public-keycloak-domain>/realms/<banji-staging|banji-prod>
AUTH_JWKS_URL=https://<public-keycloak-domain>/realms/<banji-staging|banji-prod>/protocol/openid-connect/certs
AUTH_AUDIENCE=banji-api
```

The API service keeps using `EDGE_ORIGIN_AUTH_SECRET` for origin guard. Keycloak does not replace that header-based gate.

## Realm Bootstrap
- The tracked staging import creates realm `banji-staging`.
- The tracked prod import creates realm `banji-prod`.
- The tracked import creates a `banji-api` client so the audience value is stable.
- The tracked import adds a `banji-api-audience` client scope and makes it a default realm client scope.
- Interactive clients and redirect URIs are intentionally not included here; add them manually after the service is live.

## Deployment
Deploy with the dedicated GitHub Actions workflows in [.github/workflows/deploy-keycloak-staging.yml](/Users/svanny/banji/.github/workflows/deploy-keycloak-staging.yml) or [.github/workflows/deploy-keycloak-prod.yml](/Users/svanny/banji/.github/workflows/deploy-keycloak-prod.yml). Each workflow prepares an environment-specific build context so only the matching realm import is bundled into the image.

For manual deploys, prepare the environment-specific context first, then upload it:

```bash
context_dir="$(mktemp -d)"
bash tool/ci/prepare_keycloak_build_context.sh <staging|prod> "$context_dir"
railway up "$context_dir" --path-as-root --service <service-id> --detach
```
