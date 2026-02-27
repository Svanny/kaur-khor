# PostgreSQL Event Log (Current Fix)

## Scope
This document defines the Kafka-substitute event stream implemented in PostgreSQL for `app.event_log` with outbox-first durability.

## Audit vs Operational Logs
- Operational runtime logs go to platform sink (Railway/log drain).
- `app.event_log` is the canonical audit/replay interface, not a high-volume operational log sink.

## Replay Horizon Contract
- Hot replay horizon: latest `EVENT_LOG_RETENTION_DAYS=30` days in primary DB.
- Cold replay horizon: object-storage JSONL archive rehydrated into a clean restore DB, then replayed from Postgres there.
- Cold replay procedure:
  1. prepare clean restore DB,
  2. rehydrate archived JSONL segments,
  3. run replay by checkpoint cursor.

## Event Model and Ordering Contract
- `stream_name` format: `{system}.{env}.{topic}`.
- API writes persist event intent in `app.event_outbox` in the same transaction as canonical state.
- `event-relay` is the only runtime role that publishes rows from `app.event_outbox` to `app.event_log`.
- Event schema authority is code-based full-record validation (`events/schema.rs`) for both producers and consumers.
- Checkpoints are durable per `(service_name, consumer_name, stream_name)`.
- Canonical replay ordering is `ORDER BY id ASC` only.
- `created_at` is metadata and must not drive replay order.
- In replay apply mode, checkpoints must advance only after batch handler success.

## Idempotency and Deterministic Insert
- Canonical write idempotency remains Postgres source of truth.
- Event identity is `publish_key = sha256("{producer_service}|{event_type}|{aggregate_type}|{aggregate_id}|{causation_id}")`.
- `causation_id` is required for outbox intents:
  - request events use request `idempotency_key`
  - non-request events use a stable emission id (for example job run id)
- `idempotency_key` is envelope-owned and must not be duplicated in payload schema.
- Event insert dedupe index:
  - `UNIQUE (publish_key)` on `app.event_log`.
- Idempotent retries must not emit duplicate event rows.

## Relay Processing Contract
- Relay claims one pending row at a time via `FOR UPDATE SKIP LOCKED` inside a transaction.
- Success path:
  1. insert into `app.event_log` (dedupe on `publish_key`)
  2. resolve `event_log_id` deterministically on conflict
  3. mark outbox row `published`
- Failure path:
  - increment `attempt_count`
  - set `last_error`
  - set `next_attempt_at` with capped exponential backoff
  - mark `blocked` when attempts exceed threshold or schema validation fails
  - set `blocked_at` on blocked rows for triage visibility

## Consumer Invalid-Event Policy
- Consumers decode events via registry and apply per-consumer invalid policy:
  - `Halt` (default): set checkpoint error and stop.
  - `Skip`: set checkpoint error and continue without decoding row.
  - `Quarantine`: persist invalid row+reason and continue.
- Production default remains `Halt` for correctness-sensitive consumers.

## Retention and Archive Lifecycle
- Canonical archive sink: object storage JSONL.
- Export/prune boundary authority is event id, not timestamp.
- Retention cutoff timestamp is resolved to concrete `eligible_max_id` per stream.
- All export/prune operations are constrained to `id <= eligible_max_id`.
- Timestamp selectors (`--before`) are convenience only; persisted cursor/watermark is ID.

## Export Integrity Gates (Required)
Each run writes a manifest with:
- `stream_name`
- `from_id`
- `to_id`
- `candidate_row_count`
- `exported_row_count`
- `file_size_bytes`
- `sha256`
- `created_at`
- `archive_uri`

Cursor advance is allowed only after all checks pass:
- rowcount gate: `candidate_row_count == exported_row_count`
- archive object metadata gate: `file_size_bytes` matches remote object size
- integrity gate: remote metadata `sha256` matches expected (or sidecar manifest hash match)

## Prune Contract
- Prune is forbidden before verified export.
- Deletes run in chunks and must match verified stream/range exactly.
- Final deleted count must equal manifest candidate count.

## Concurrency Contract
- Maintenance acquires per-stream advisory lock.
- Lock key is deterministic from `stream_name`.
- Lock contention exits non-zero with `lock_contended`; no partial work.

## Storage/Cost Evidence Contract
`event_log_storage_report` output labels metrics explicitly:
- exact: total table bytes, per-stream row counts
- estimated: per-stream byte size and growth projections

Estimated values must never be labeled as exact.

## Archive Security and Deletion Policy
- Archive objects must be encrypted at rest.
- Access must be least-privilege to maintenance/operator identities.
- Lifecycle deletion is mandatory:
  - `EVENT_LOG_ARCHIVE_RETENTION_DAYS=365` default.

## Scale Upgrade Trigger
Create partitioning ADR when either threshold is hit:
- `app.event_log` total size > 50 GB, or
- prune volume > 1,000,000 rows/day for 7 consecutive days.

Upgrade target:
- daily range partitioning,
- partition-drop pruning instead of row deletes.
