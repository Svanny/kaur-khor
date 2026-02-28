# Backfill Controller Runbook

## Scope
This runbook covers `APP_ROLE=backfill-controller` for audited projection replay and replay-scoped job backfill.

## Safety Rules
- `BACKFILL_KIND=projection` supports primary and restore databases.
- `BACKFILL_KIND=jobs` supports primary databases only in this milestone.
- `BACKFILL_KIND=jobs` with `BACKFILL_MODE=apply` requires `BACKFILL_ALLOW_BROKER_PUBLISH=true`.
- Replay order is always `ORDER BY id ASC`.
- Restore/cold workflows are projection-only. Do not point a restore DB controller at live RabbitMQ infrastructure.

## Preview
Preview persists a `planned` row in `app.backfill_run` with frozen bounds and candidate counts.

```bash
APP_ROLE=backfill-controller \
DATABASE_RUNTIME_URL="$DATABASE_RUNTIME_URL" \
BACKFILL_KIND=projection \
BACKFILL_MODE=preview \
BACKFILL_STREAM_NAME=banji-core.prod.inventory-updated \
BACKFILL_OPERATOR_ID=ops-1 \
BACKFILL_REASON="preview projection replay" \
BACKFILL_FROM_EVENT_ID=0 \
cargo run --bin banji-api
```

## Projection Apply

```bash
APP_ROLE=backfill-controller \
DATABASE_RUNTIME_URL="$DATABASE_RUNTIME_URL" \
BACKFILL_KIND=projection \
BACKFILL_MODE=apply \
BACKFILL_STREAM_NAME=banji-core.prod.inventory-updated \
BACKFILL_OPERATOR_ID=ops-1 \
BACKFILL_REASON="rebuild projection after schema change" \
BACKFILL_FROM_EVENT_ID=0 \
BACKFILL_INVALID_EVENT_POLICY=halt \
BACKFILL_RESET_CHECKPOINT=true \
BACKFILL_TRUNCATE_PROJECTION=true \
cargo run --bin banji-api
```

## Job Backfill Apply

```bash
APP_ROLE=backfill-controller \
DATABASE_RUNTIME_URL="$DATABASE_RUNTIME_URL" \
BACKFILL_KIND=jobs \
BACKFILL_MODE=apply \
BACKFILL_STREAM_NAME=banji-core.prod.inventory-updated \
BACKFILL_OPERATOR_ID=ops-1 \
BACKFILL_REASON="re-run item-created jobs" \
BACKFILL_FROM_EVENT_ID=0 \
BACKFILL_ALLOW_BROKER_PUBLISH=true \
BACKFILL_WAIT_FOR_WORKERS=false \
cargo run --bin banji-api
```

## Resume
- Reuse `BACKFILL_RUN_ID=<uuid>` with `BACKFILL_MODE=apply`.
- Runs in `planned`, `running`, or `waiting` may be resumed.
- Runs in `succeeded`, `completed_with_failures`, `failed`, or `cancelled` are terminal.

## Wait Loop
- Terminal worker states: `succeeded`, `failed`
- Nonterminal worker states: `queued`, `running`, `retrying`
- On timeout, the controller keeps `app.backfill_run.status='waiting'`, records `last_error`, and exits non-zero so the same run can be resumed later.

## Useful Queries

```sql
SELECT id, run_kind, status, stream_name, candidate_event_count, processed_event_count,
       applied_projection_count, enqueued_job_count, job_success_count, job_failure_count,
       invalid_event_count, last_error, started_at, finished_at
FROM app.backfill_run
ORDER BY created_at DESC
LIMIT 20;
```

```sql
SELECT job_type, status, source_event_id, created_at
FROM app.job_run
WHERE backfill_run_id = $1
ORDER BY created_at ASC;
```
