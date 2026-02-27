# Event Vocabulary and Schema Discipline

## Scope
This contract defines event schema governance for the current Postgres event transport (`app.event_outbox` -> `app.event_log`).

## Source of Truth
- Event schemas are code-authoritative in Rust:
  - `apps/api/src/events/schema.rs`
  - `apps/api/src/events/schema_types.rs`
- Registry authority is `(event_type, event_version)`.
- Producers and consumers validate against the same registry.

## Canonical Vocabulary

| event_type | latest version | aggregate_type | payload fields (v1) |
| --- | --- | --- | --- |
| `inventory.item.created` | `v1` | `item` | `owner_sub`, `item_id`, `sku`, `name`, `quantity` |
| `inventory.write-demo.completed` | `v1` | `write-demo` | `operation`, `payload`, `caller_id`, `result` |

## Stream Ownership
- `inventory.item.created` derives its stream internally and must publish to `{system}.{env}.inventory-updated`.
- `inventory.write-demo.completed` derives its stream internally and must publish to `{system}.{env}.write-demo-completed`.
- Built-in producer paths must not supply arbitrary stream names for these event types.

## Full-Record Validation Rules
- Validation applies to the full record (`EventRecord`), not payload alone.
- Envelope rules include:
  - registered `event_type`
  - supported `event_version` for the type
  - `stream_name` format `{system}.{env}.{topic}`
  - non-empty `aggregate_type`, `aggregate_id`, `producer_service`, `causation_id`
  - `publish_key` must match canonical derivation
  - event-specific envelope invariants (for example `aggregate_id == payload.item_id` on `inventory.item.created`)
- Payload rules use strict typed schemas with `serde(deny_unknown_fields)`.

## Envelope vs Payload Ownership
- `idempotency_key` is envelope-owned only.
- Payload schemas must not duplicate `idempotency_key`.
- `owner_sub` is allowed in payload for consumer convenience, but producer validation enforces payload/envelope invariants.

## Versioning and Compatibility
- Topic names do not encode schema versions.
- Any payload shape change requires explicit `event_version` increment.
- Producers emit latest version only.
- Consumers decode `N` and `N-1` during rollout.
- Unknown type/version is a hard schema violation.

## Replay Boundary
- Compatibility guarantee is checkpoint-forward replay, not genesis replay.
- Decoder removal for `N-1` is allowed only when:
  1. no producers emit `N-1`,
  2. one full hot-retention window has elapsed,
  3. each active consumer checkpoint is beyond the highest `N-1` event id for its stream,
  4. no planned cold replay requires `N-1`.

## Invalid Decode Policy
- Framework supports per-consumer policy:
  - `Halt` (default): set checkpoint error and stop
  - `Skip`: set checkpoint error and continue without decoding the row
  - `Quarantine`: persist invalid row + reason, then continue
- Production default remains `Halt`.

## Outbox Schema Poison Handling
- Relay marks permanent schema failures as terminal:
  - `status='blocked'`
  - `blocked_at=NOW()`
  - structured `last_error` code/message
- Blocked rows require manual intervention/replay tooling.

## Schema Change Checklist
1. Add new typed payload schema and register `(event_type, event_version)`.
2. Keep existing decoder (`N-1`) during rollout.
3. Update producer builder to emit latest version.
4. Add/adjust tests for producer validation, consumer decode, and compatibility.
5. Update this document vocabulary table and manifest-backed docs consistency test.
