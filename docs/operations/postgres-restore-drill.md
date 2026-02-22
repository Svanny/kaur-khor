# Postgres Restore Drill Runbook

## Purpose
Prove that backups can be restored into a clean environment and pass baseline integrity checks.

## Cadence
- Weekly automated drill via GitHub Actions.
- On-demand drill after major schema or infrastructure changes.

## Inputs
- `SOURCE_DATABASE_URL`: source database to clone/restore from.
- `RESTORE_DATABASE_URL`: clean restore target database.
- Optional `BACKUP_SOURCE_TIMESTAMP`: timestamp label for reporting.

## Procedure
1. Drop/clean restore target objects.
2. Copy source database into restore target.
3. Run structural checks (`tool/db/validate_restore.sql`).
4. Run invariant checks and capture pass/fail.
5. Publish JSON report artifact.

## Acceptance Criteria
- Restore completes within RTO target (60 minutes).
- Effective data loss window is within RPO target (15 minutes) for scheduled checkpoints.
- All required checks pass:
  - `_sqlx_migrations` present and non-empty
  - required `app.*` tables and indexes present
  - representative integrity checks succeed

## Incident Usage
Use the same procedure for incident recovery, then repoint runtime secrets to the restored target only after validation passes.
