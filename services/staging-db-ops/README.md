# Staging DB Ops Service

This Railway service exists only for `staging` database operations that must run over Railway private networking before TCP proxies are removed.

## Scope
- Runs `tool/ci/migrate_with_lock.sh` inside Railway for staging deploys.
- Runs `tool/db/restore_validate.sh` inside Railway for staging restore drills.
- Runs `tool/db/sqlx_migration_history_repair.sh` inside Railway for staging maintenance.

It is intentionally not part of Banji's runtime role topology and must not be added to runtime parity checks.

## Required Railway Variables
- `DATABASE_MIGRATION_URL`
- `DATABASE_RUNTIME_URL`
- `RESTORE_DATABASE_URL`

For staging, these should be Railway-managed private references or private-network connection strings, not GitHub-injected public TCP proxy URLs.

## Deployment
Deploy from [services/staging-db-ops](/Users/svanny/banji/services/staging-db-ops) with [tool/ci/deploy_staging_db_ops.sh](/Users/svanny/banji/tool/ci/deploy_staging_db_ops.sh).

GitHub workflows that depend on this service also execute commands inside it with [tool/ci/run_staging_db_ops.sh](/Users/svanny/banji/tool/ci/run_staging_db_ops.sh).
