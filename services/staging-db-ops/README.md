# DB Ops Service Image

This Railway service image is used by dedicated `staging` and `prod` Railway db-ops services for database operations that must run over Railway private networking before TCP proxies are removed.

## Scope
- Runs `tool/ci/migrate_with_lock.sh` inside Railway for deploy migrations.
- Runs `tool/db/restore_validate.sh` inside Railway for restore drills.
- Runs `tool/db/sqlx_migration_history_repair.sh` inside Railway for maintenance.
- Runs the repo-tracked prod event-log maintenance workflow inside Railway.

It is intentionally not part of Banji's runtime role topology and must not be added to runtime parity checks.

## Required Railway Variables
- `DATABASE_MIGRATION_URL`
- `DATABASE_RUNTIME_URL`
- `RESTORE_DATABASE_URL`

For `staging` and `prod`, these should be Railway-managed private references or private-network connection strings, not GitHub-injected public TCP proxy URLs.

## Deployment
Deploy from [services/staging-db-ops](/Users/svanny/banji/services/staging-db-ops) with [tool/ci/deploy_db_ops.sh](/Users/svanny/banji/tool/ci/deploy_db_ops.sh).

GitHub workflows that depend on this service also execute commands inside it with [tool/ci/run_db_ops.sh](/Users/svanny/banji/tool/ci/run_db_ops.sh).
