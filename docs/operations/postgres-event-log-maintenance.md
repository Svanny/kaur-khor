# Postgres Event Log Maintenance Runbook

## Purpose
Operate retention, archive, replay, and cost visibility for `app.event_log` while Kafka is optional/future.
Also operate `app.event_outbox` relay and retention.

## Contracts
- Event intents are written to `app.event_outbox` in the same transaction as canonical writes.
- `APP_ROLE=event-relay` is the only role that publishes to `app.event_log`.
- Relay validates full event schema (envelope + payload) before publish.
- Hot replay horizon: `EVENT_LOG_RETENTION_DAYS` (default 30 days).
- Cold replay horizon: archive JSONL rehydrated into restore DB.
- Boundary authority: event id watermark (`eligible_max_id`).
- Replay order: `id ASC`.
- Archive retention default: `EVENT_LOG_ARCHIVE_RETENTION_DAYS=365`.
- Outbox published-row retention default: `EVENT_OUTBOX_PUBLISHED_RETENTION_DAYS=7`.

## Required Env Inputs
- `DATABASE_URL`
- `APP_ROLE`
- `EVENT_RELAY_BATCH_SIZE`
- `EVENT_RELAY_POLL_INTERVAL_MS`
- `EVENT_RELAY_RETRY_BACKOFF_MS`
- `EVENT_RELAY_MAX_BACKOFF_MS`
- `EVENT_RELAY_BLOCK_AFTER_ATTEMPTS`
- `EVENT_OUTBOX_PUBLISHED_RETENTION_DAYS`
- `EVENT_LOG_RETENTION_DAYS`
- `EVENT_LOG_PRUNE_BATCH_SIZE`
- `EVENT_LOG_REPLAY_BATCH_SIZE`
- `EVENT_LOG_ARCHIVE_PREFIX`
- `EVENT_LOG_ARCHIVE_RETENTION_DAYS`
- `EVENT_LOG_ARCHIVE_ENCRYPTION_REQUIRED`

For S3 archive upload/verification:
- AWS credentials with least-privilege object read/write/head to archive prefix.

## Event Relay Runtime
Run relay service using the same image with role override:

```bash
APP_ROLE=event-relay \
DATABASE_RUNTIME_URL="$DATABASE_RUNTIME_URL" \
cargo run --bin banji-api
```

Relay guarantees:
- pending outbox rows are published idempotently to `app.event_log`
- schema poison rows move directly to `blocked` with `blocked_at` and structured `last_error`
- non-schema failures back off and eventually move to `blocked` when attempt threshold is reached

Consumer invalid-event policy:
- default `Halt`: checkpoint error is set and loop stops
- optional `Skip`: error recorded and processing continues
- optional `Quarantine`: invalid event row + reason stored in `app.event_consumer_quarantine`

## Event Outbox Cleanup

```bash
DATABASE_RUNTIME_URL="$DATABASE_RUNTIME_URL" \
EVENT_OUTBOX_PUBLISHED_RETENTION_DAYS=7 \
bash tool/db/prune_event_outbox.sh
```

## Export + Verify (+ Optional Prune)
Example for one stream:

```bash
DATABASE_URL="$DATABASE_RUNTIME_URL" \
EVENT_LOG_RETENTION_DAYS=30 \
EVENT_LOG_PRUNE_BATCH_SIZE=1000 \
bash tool/db/export_event_log.sh \
  --stream-name banji-core.prod.inventory-updated \
  --output build/event-log/banji-core.prod.inventory-updated.jsonl \
  --manifest-output build/event-log/banji-core.prod.inventory-updated.manifest.json \
  --archive-uri s3://banji-core-prod-kh-pp-events/event-log/banji-core.prod.inventory-updated-$(date -u +%Y%m%dT%H%M%SZ).jsonl \
  --prune
```

Dry run:

```bash
DATABASE_URL="$DATABASE_RUNTIME_URL" \
bash tool/db/export_event_log.sh \
  --stream-name banji-core.prod.inventory-updated \
  --output build/event-log/preview.jsonl \
  --manifest-output build/event-log/preview.manifest.json \
  --dry-run
```

## Replay (Hot)
Preview range:

```bash
DATABASE_URL="$DATABASE_RUNTIME_URL" \
bash tool/db/replay_event_log.sh \
  --mode hot-preview \
  --stream-name banji-core.prod.inventory-updated \
  --service-name projection-consumer \
  --consumer-name inventory-projector \
  --from-id 0
```

Apply replay from checkpoint reset:

```bash
DATABASE_URL="$DATABASE_RUNTIME_URL" \
bash tool/db/replay_event_log.sh \
  --mode hot-apply \
  --stream-name banji-core.prod.inventory-updated \
  --service-name projection-consumer \
  --consumer-name inventory-projector \
  --handler-cmd "cat >/dev/null" \
  --from-id 0
```

For `*-apply` modes, checkpoint advancement occurs only after `--handler-cmd` exits successfully for each batch.
Replace the no-op example handler above with the real projection/job apply command.

## Replay (Cold)
1) Rehydrate archive segments into restore DB:

```bash
DATABASE_URL="$PROD_DATABASE_RESTORE_URL" \
bash tool/db/rehydrate_event_log_archive.sh \
  --stream-name banji-core.prod.inventory-updated \
  --input build/event-log/segment-1.jsonl \
  --input build/event-log/segment-2.jsonl
```

2) Run replay against restore DB:

```bash
DATABASE_URL="$PROD_DATABASE_RESTORE_URL" \
bash tool/db/replay_event_log.sh \
  --mode cold-apply \
  --stream-name banji-core.prod.inventory-updated \
  --service-name projection-consumer \
  --consumer-name inventory-projector \
  --handler-cmd "cat >/dev/null" \
  --from-id 0
```

## Storage / Cost Evidence

```bash
DATABASE_URL="$DATABASE_RUNTIME_URL" \
EVENT_LOG_RETENTION_DAYS=30 \
bash tool/db/event_log_storage_report.sh \
  --output-json build/event-log/storage_report.json \
  --output-text build/event-log/storage_report.txt
```

Interpretation rule:
- `row_count_exact` and total table bytes are exact.
- byte/growth projections are estimates.

## Failure Triage
- `lock_contended`: rerun later; another maintenance run is active for the stream.
- rowcount mismatch: do not prune; investigate query/filter drift.
- remote size/hash mismatch: do not advance cursor; fix upload/integrity path.
- prune count mismatch: halt and reconcile stream state before next run.

## Scale Upgrade Trigger
Escalate to partitioning ADR when:
- total table size exceeds 50 GB, or
- daily prune volume exceeds 1,000,000 rows for 7 consecutive days.
