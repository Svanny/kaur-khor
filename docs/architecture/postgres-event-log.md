# PostgreSQL Event Log (Current Fix)

## Scope
This document defines the Kafka-substitute event stream implemented in PostgreSQL.

## Audit vs Operational Logs
- Operational runtime logs are written to platform log sinks (Railway/log drain).
- `app.event_log` is an audit/replay stream, not the primary sink for high-volume operational logs.

## Current Operating Model
- `app.event_log` is append-only transport for domain events.
- Event write is in the same transaction as canonical write/idempotency completion.
- Consumers poll by stream-scoped replay order (`created_at`, `id`).
- Checkpointing is durable per `(service_name, consumer_name, stream_name)`.

## Single-Consumer-Now Rule
Only one active consumer instance is allowed per checkpoint tuple.
Running multiple identical instances against one tuple is out of contract until claiming/sharding is implemented.

## Horizontal Scale Migration Path (Later)
- Option A: claim/work table using row claiming (`FOR UPDATE SKIP LOCKED`).
- Option B: explicit sharding by stream/topic key with disjoint tuples.

## Event Naming and Versioning
- `stream_name` follows naming contract: `{system}.{env}.{topic}`.
- `event_version` carries payload compatibility version.
- Stream names stay stable; schema versioning is in event payload/version.

## Canonical Audit Interface (Current Mapping)
The current canonical audit interface maps to `app.event_log`:
- `event_id` -> `id`
- `occurred_at` -> `created_at`
- `service` -> `producer_service`
- `actor_id` -> `aggregate_id` (nullable semantics handled by producer)
- `entity_type` -> `aggregate_type`
- `entity_id` -> `aggregate_id`
- `event_type` -> `event_type`
- `request_id` -> `correlation_id`
- `idempotency_key` -> `idempotency_key`
- `payload` -> `payload`

Ordering contract:
- replay order is `created_at ASC, id ASC`.

## Idempotency and Deterministic Event Insert
- Canonical write idempotency remains Postgres source of truth.
- Event insert dedupe uses partial unique index:
  - `(producer_service, idempotency_key)` where key is not null.
- Retries with same idempotency key do not create duplicate event rows.

## Retention and Archive
- Primary DB retention default: 30 days.
- Long-term archive target: object storage export (JSONL now, extensible later).
- Prune only after successful export watermark update.
- Prune in chunks to reduce lock/vacuum pressure.

## Lag and Observability
- Lag is stream scoped:
  - `max(event_log.id for stream) - checkpoint.last_event_id`
- `event_consumer_checkpoint` tracks:
  - `last_event_id`
  - `last_heartbeat_at`
  - `last_error`

## Payload Budget
- `EVENT_PAYLOAD_MAX_BYTES` enforces payload size limit.
- Oversized data must move to object storage with pointer/checksum in event payload metadata.
- Sensitive fields (tokens/credentials/password-like keys and credential-bearing URLs) are rejected at publish time.
