# Postgres Restore Drill Runbook

## Purpose
Prove recoverability by restoring into an isolated restore database and validating schema/data/query integrity before any runtime cutover.

## Drill Routes and Cadence
- Automated weekly route:
  - `prod -> prod_restore` via GitHub Actions workflow `postgres-restore-drill`, executed from the prod Railway db-ops service.
- Manual monthly routes:
  - `dev -> dev_restore`
  - `prod -> prod_restore`
- Additional required manual prod drill:
  - after any deployed migration marked `-- @risk:high`.

## Safety Invariants (Hard Fail)
The drill script refuses to run when any invariant is violated:
- source/restore URLs must be present
- validation SQL file must exist
- restore database name must end with `_restore`
- source and restore database names must differ

## Workflow Inputs
Manual dispatch supports:
- `target_env=dev|staging|prod`
- `confirm_prod_restore`
  - required for `target_env=prod`
  - must equal `CONFIRM_PROD_RESTORE`

## Inputs and Secrets
- `SOURCE_DATABASE_URL`: source database URL
- `RESTORE_DATABASE_URL`: restore target URL
- `BACKUP_SOURCE_TIMESTAMP`: optional label (defaults to run start timestamp)
- `REQUIRED_PG_EXTENSIONS`: optional comma-separated extension list to enforce
- `RESTORE_DRILL_ALERT_WEBHOOK_URL`: optional failure notification webhook
- For `staging` and `prod`, the Railway db-ops service keeps the restore target URL on Railway and defaults the source URL to its Railway-resident `DATABASE_RUNTIME_URL` when no override is supplied.

## Procedure
1. Resolve source/restore database names and enforce safety invariants.
2. Clean restore target schema objects.
3. Restore logical snapshot (`pg_dump | psql`) from source to restore target.
4. Run validation SQL (`tool/db/validate_restore.sql`) with extension checks.
5. Clean restored data immediately on successful validation.
6. Upload machine-readable report and validation output as artifacts.

## Validation Meaning
Validation must prove:
- migration table exists and has applied rows
- required `app.*` tables and critical indexes exist
- baseline invariants pass (non-empty seed/probe, anti-orphan checks)
- representative indexed query path is executable
- configured required extensions are installed

## Evidence Artifacts
Each run must emit:
- `build/restore-drill/report_<env>.json`
- `build/restore-drill/validate_<env>.txt`

Report fields:
- `environment`
- `started_at`, `ended_at`
- `backup_source_timestamp`, `source_backup_reference`
- `source_identifier`
- `restore_seconds`, `validate_seconds`, `total_seconds`
- `status`, `failure_reason`
- `validation_output_file`

## Failure Handling
- Workflow writes concise status to GitHub job summary on every run.
- If `RESTORE_DRILL_ALERT_WEBHOOK_URL` is configured, workflow posts failure notification payload.
- For failed drills:
  - inspect `validate_<env>.txt`
  - fix root cause
  - rerun drill before closing incident/task.

## Manual Commands
Run locally or in an operator shell:

```bash
ENV_NAME=dev \
SOURCE_DATABASE_URL="$DEV_DATABASE_RUNTIME_URL" \
RESTORE_DATABASE_URL="$DEV_DATABASE_RESTORE_URL" \
BACKUP_SOURCE_TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
REQUIRED_PG_EXTENSIONS="" \
bash tool/db/restore_validate.sh
```

Run the staging route through Railway private networking:

```bash
RAILWAY_API_TOKEN=... \
RAILWAY_PROJECT_ID=... \
RAILWAY_ENVIRONMENT=staging \
RAILWAY_SERVICE_ID=... \
ENV_NAME=staging \
BACKUP_SOURCE_TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
REQUIRED_PG_EXTENSIONS="" \
bash tool/ci/run_db_ops.sh restore-validate
```

Run the prod route through Railway private networking:

```bash
RAILWAY_API_TOKEN=... \
RAILWAY_PROJECT_ID=... \
RAILWAY_ENVIRONMENT=prod \
RAILWAY_SERVICE_ID=... \
ENV_NAME=prod \
BACKUP_SOURCE_TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
REQUIRED_PG_EXTENSIONS="" \
bash tool/ci/run_db_ops.sh restore-validate
```

List high-risk migrations:

```bash
bash tool/db/check_risky_migrations.sh
```

## Access and Retention
- Restore targets are non-runtime databases and access-restricted.
- Successful drills do not retain restored data; only artifacts are retained.
- Failed-drill restored state may be kept briefly for debugging, then cleaned.
