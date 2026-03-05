# CI Deploy Flags

This directory defines non-secret deploy flags used by GitHub Actions deploy jobs.

## Files

- `deploy.common.env`: shared flags for all deploy environments.
- `deploy.staging.env`: staging-only deploy flags.
- `deploy.prod.env`: prod-only deploy flags.

## Supported keys

From `deploy.common.env`:

- `SQLX_CLI_VERSION`
- `RAILWAY_CLI_VERSION`
- `RAILWAY_CI_DEBUG` (`0` or `1`)

From environment files:

- `DATABASE_RUNTIME_ENDPOINT_KIND` (must be `pgbouncer` for deploy environments)
- `PGBOUNCER_POOL_MODE` (must be `transaction` for deploy environments)

## Override behavior

`tool/ci/load_deploy_flags.sh` loads the common file, then the environment file, validates values, and emits whitelisted `KEY=VALUE` pairs for `$GITHUB_ENV`.

Workflow input `railway_debug=true` overrides file defaults and forces:

- `RAILWAY_CI_DEBUG=1`
