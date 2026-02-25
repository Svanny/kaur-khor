# PostgreSQL Event Log (Current Fix)

## Scope
This document defines the Kafka-substitute event stream implemented in PostgreSQL for `app.event_log`.

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
- Checkpoints are durable per `(service_name, consumer_name, stream_name)`.
- Canonical replay ordering is `ORDER BY id ASC` only.
- `created_at` is metadata and must not drive replay order.
- In replay apply mode, checkpoints must advance only after batch handler success.

## Idempotency and Deterministic Insert
- Canonical write idempotency remains Postgres source of truth.
- Event insert dedupe index:
  - `(producer_service, idempotency_key)` where `idempotency_key IS NOT NULL`.
- Idempotent retries must not emit duplicate event rows.

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
