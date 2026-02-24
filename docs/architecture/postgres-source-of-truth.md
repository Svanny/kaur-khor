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

## Connection Pooling Contract (PgBouncer + SQLx)
- Runtime endpoint identity is explicit:
  - `DATABASE_RUNTIME_ENDPOINT_KIND=direct|pgbouncer`
- PgBouncer mode expectation is explicit:
  - `PGBOUNCER_POOL_MODE=transaction|session`
  - `staging` and `prod` require `DATABASE_RUNTIME_ENDPOINT_KIND=pgbouncer` and `PGBOUNCER_POOL_MODE=transaction`
- SQLx client pool tuning is explicit:
  - `SQLX_POOL_MAX_CONNECTIONS`, `SQLX_POOL_MIN_CONNECTIONS`
  - `SQLX_POOL_ACQUIRE_TIMEOUT_MS`, `SQLX_POOL_CONNECT_TIMEOUT_MS`
  - `SQLX_POOL_IDLE_TIMEOUT_SECONDS`, `SQLX_POOL_MAX_LIFETIME_SECONDS`
- Global connection budget is explicit:
  - `POSTGRES_CONNECTION_BUDGET_TOTAL`
  - service allocation must satisfy:
    - `sum(service_replicas * SQLX_POOL_MAX_CONNECTIONS) <= client_budget_to_pooler`

## PgBouncer Transaction-Mode Safety
- SQLx statement cache is disabled in PgBouncer transaction mode (`statement_cache_capacity=0`).
- Session-persistent assumptions are disallowed on transaction-pooled runtime paths:
  - no startup `SET` expected to persist
  - no temp-table/session-state dependencies
  - no LISTEN/NOTIFY dependency
- If session-level behavior is required later:
  - use `SET LOCAL` inside each transaction or role/database defaults, or
  - introduce a narrowly scoped direct/session-mode connection path.
- Reset-state assumption:
  - platform PgBouncer reset behavior is assumed enabled between client assignments; if leakage is observed, treat it as a platform/config defect and escalate.

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

## Event Log Current Fix (Kafka Substitute)
- Current transport for streaming needs is `app.event_log` in PostgreSQL.
- Event records are appended in the same transaction as canonical writes/idempotency completion.
- Consumers poll by `id` cursor and persist progress in `app.event_consumer_checkpoint`.
- Exactly one active consumer instance is allowed per `(service_name, consumer_name, stream_name)` tuple in this phase.
- Horizontal scaling requires a later claim/sharding model.
- Retention default is 30 days in primary DB, with object-storage export before prune.
- Stream lag must be calculated per stream:
  - `max(event_log.id WHERE stream_name=?) - checkpoint.last_event_id`

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
