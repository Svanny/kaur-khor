# Postgres Source of Truth

## Scope
This standard defines how Banji provisions, migrates, backs up, restores, and monitors PostgreSQL across `dev`, `staging`, and `prod`.

## Environment Topology
- Platform: Railway PostgreSQL
- Isolation: separate Postgres instance per environment
- Databases per environment:
  - `banji_core_<env>_kh_pp_app`
  - `banji_core_<env>_kh_pp_restore`

## Backup and Recovery Objectives
- Backups: daily snapshots + point-in-time recovery (PITR)
- Retention: 35 days
- Recovery objectives:
  - RPO: 15 minutes
  - RTO: 60 minutes

## Schema Authority and Migration Process
- Source of truth: `apps/api/migrations/`
- Tool: `sqlx migrate`
- CI must always bootstrap a fresh empty database from migrations.
- Deploy sequencing for `staging` and `prod` is fixed:
  1. Acquire migration lock (single runner)
  2. Apply migrations
  3. Deploy API image
  4. Shift/finalize traffic

If migration fails, deployment aborts before app rollout.

## Roles and Schema Boundary
- Application schema: `app`
- Roles:
  - `banji_migrator`: owns schema objects, runs DDL/migrations
  - `banji_runtime`: DML-only runtime role
  - `banji_restore_validator`: restore drill checks
- Runtime search path:
  - `search_path = app, public`

## Privileges and Default Privileges
Bootstrap SQL must set:
- grants on existing objects in schema `app`
- default privileges for objects created by `banji_migrator` so runtime permissions continue automatically for new objects

No runtime role may hold schema-altering privileges.

## Migration Safety Rules
- Expand/contract is required.
- Large index operations must use low-blocking strategies where supported.
- Large backfills must run as controlled background jobs, not a single deploy-time migration.
- Risky migrations are split across releases:
  - schema introduction
  - data backfill
  - constraint tighten/drop in later release

## Restore Validation
- Weekly restore drill per environment to a clean restore database.
- Validation includes:
  - migration metadata presence
  - required schema/table/index checks
  - data invariants and representative query shape checks
- Drill artifacts must record backup source timestamp, restore duration, and pass/fail details.

## Operational Telemetry Baseline
Enable visibility for:
- slow queries / top query patterns
- lock waits and blocking sessions
- connection saturation
- backup freshness and replication health (where exposed)

Alert thresholds:
- sustained lock-wait spikes
- slow-query percentile regressions
- backup freshness violations
