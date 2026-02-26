-- @risk:high
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE app.event_log
  ADD COLUMN IF NOT EXISTS publish_key TEXT;

-- Backfill legacy rows with deterministic causation IDs when absent so
-- publish_key derivation remains stable and unique across historical records.
UPDATE app.event_log
SET causation_id = COALESCE(causation_id, idempotency_key, CONCAT('legacy-', id::text))
WHERE causation_id IS NULL;

-- Publish key derivation must match runtime logic in events/key.rs:
-- sha256("{producer_service}|{event_type}|{aggregate_type}|{aggregate_id}|{causation_id}")
UPDATE app.event_log
SET publish_key = encode(
  digest(
    CONCAT_WS(
      '|',
      producer_service,
      event_type,
      aggregate_type,
      aggregate_id,
      causation_id
    ),
    'sha256'
  ),
  'hex'
)
WHERE publish_key IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_event_log_publish_key
  ON app.event_log (publish_key);

DROP INDEX IF EXISTS uq_event_log_producer_idempotency;

ALTER TABLE app.event_log
  ALTER COLUMN publish_key SET NOT NULL;
