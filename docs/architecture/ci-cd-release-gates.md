# CI/CD and Release Gates

## Scope
This document defines merge gates, runtime parity rules, and deployment promotion for the Rust backend under `apps/api`.

## Required PR Checks
- `rust-ci / fmt`
- `rust-ci / clippy`
- `rust-ci / test`
- `rust-ci / build`
- `rust-ci / migration-validate`
- `rust-ci / container-build-check`

## Deployment Policy
- Deploy from the connected repository via Railway Railpack config-as-code.
- GitHub Actions syncs Railway service variables, then uploads `apps/api` source with `railway up`.
- In `staging`, `AUTH_JWKS_URL`, `AUTH_ISSUER`, `AUTH_AUDIENCE`, and the API runtime copy of `EDGE_ORIGIN_AUTH_SECRET` are no longer synced from GitHub for API deploys; they must already exist on the Railway `api` service.
- `prod` remains on the existing GitHub-injected API auth path until the production Railway service is migrated.
- Railway service root is `apps/api`.
- Build command remains `cargo build --release`.
- Start command remains `./start.sh`.
- `staging` and `prod` each deploy the same role set:
  - `api`
  - `event-relay`
  - `projection-consumer`
  - `worker`
- Every role in an environment must run the same revision.

## Rollout Sequence
1. run migrations with advisory lock
2. deploy `event-relay`
3. deploy `projection-consumer`
4. deploy `worker`
5. in `staging`, verify API OIDC runtime readiness from Railway-managed auth vars
6. deploy `api`
7. verify same-revision parity across roles

## Runtime Preflight
- `DATABASE_RUNTIME_ENDPOINT_KIND=pgbouncer`
- `PGBOUNCER_POOL_MODE=transaction`
- `AUTH_ENABLED=true`
- Railway-resident `AUTH_JWKS_URL`
- Railway-resident `AUTH_ISSUER`
- Railway-resident `AUTH_AUDIENCE`

Staging OIDC readiness preflight must also prove:
- `AUTH_ISSUER` and `AUTH_JWKS_URL` resolve over public `https://`
- discovery at `${AUTH_ISSUER}/.well-known/openid-configuration` matches the configured issuer/JWKS URL
- the configured JWKS endpoint returns a non-empty key set

For API services:
- `EDGE_ENFORCEMENT_ENABLED=true`
- `EDGE_ORIGIN_AUTH_HEADER_NAME`
- Railway-resident `EDGE_ORIGIN_AUTH_SECRET`
- `EDGE_CORS_ALLOWED_ORIGINS`

## Runtime Role Contract
- `APP_ROLE` and `BANJI_SERVICE` must match the target service role.
- Least-privilege variables must remain role-specific.
- Deprecated Cloudflare-specific keys must be absent from deploy inputs and Railway runtime variables.

## Runtime Readiness
- Runtime startup must build the SQLx pool, warm it up, and only then accept traffic.
- Runtime shutdown must stop accepting new work, drain, close the pool, and exit cleanly.

## Edge Runtime Contract
- API ingress protections are enforced by the application runtime.
- Middleware order is fixed:
  - origin guard -> request size limit -> rate limit -> CORS -> observability -> handlers
- Forwarded client IP is trusted only after origin guard passes and only when `EDGE_TRUST_FORWARDED_CLIENT_IP=true`.

## Artifact and Role Parity
- [`apps/api/railway.toml`](/Users/svanny/banji/apps/api/railway.toml) and [`apps/api/start.sh`](/Users/svanny/banji/apps/api/start.sh) are the tracked runtime contract.
- [services/keycloak](/Users/svanny/banji/services/keycloak) is a separately deployed Railway dependency and is intentionally excluded from Banji runtime role parity checks.
- Deploy tooling must fail closed if Railway runtime values cannot be read or do not match the expected role contract.
- Runtime parity is tracked by `DEPLOY_COMMIT_SHA` and `DEPLOY_RUN_ID`, not container image digests.
