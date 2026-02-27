ALTER TABLE app.job_outbox
  ADD COLUMN IF NOT EXISTS producer_service TEXT;

ALTER TABLE app.job_outbox
  ADD COLUMN IF NOT EXISTS payload_version INTEGER;

ALTER TABLE app.job_outbox
  ADD COLUMN IF NOT EXISTS aggregate_type TEXT;

ALTER TABLE app.job_outbox
  ADD COLUMN IF NOT EXISTS aggregate_id TEXT;

ALTER TABLE app.job_outbox
  ADD COLUMN IF NOT EXISTS causation_id TEXT;

UPDATE app.job_outbox
SET producer_service = COALESCE(
      producer_service,
      CASE job_type
        WHEN 'item-created' THEN 'api'
        WHEN 'write-demo' THEN 'api'
        ELSE 'legacy'
      END
    ),
    payload_version = COALESCE(payload_version, 1),
    aggregate_type = COALESCE(
      aggregate_type,
      CASE job_type
        WHEN 'item-created' THEN 'item'
        WHEN 'write-demo' THEN 'write-demo'
        ELSE 'job'
      END
    ),
    aggregate_id = COALESCE(
      aggregate_id,
      CASE job_type
        WHEN 'item-created' THEN COALESCE(payload->>'owner_sub', 'unknown') || ':' || COALESCE(payload->>'item_id', 'unknown')
        WHEN 'write-demo' THEN COALESCE(payload->>'caller_id', 'unknown') || ':' || COALESCE(payload->>'operation', 'unknown')
        ELSE enqueue_key
      END
    ),
    causation_id = COALESCE(
      causation_id,
      NULLIF(payload->>'idempotency_key', ''),
      correlation_id,
      enqueue_key
    )
WHERE producer_service IS NULL
   OR payload_version IS NULL
   OR aggregate_type IS NULL
   OR aggregate_id IS NULL
   OR causation_id IS NULL;

ALTER TABLE app.job_outbox
  ALTER COLUMN producer_service SET NOT NULL;

ALTER TABLE app.job_outbox
  ALTER COLUMN payload_version SET NOT NULL;

ALTER TABLE app.job_outbox
  ALTER COLUMN aggregate_type SET NOT NULL;

ALTER TABLE app.job_outbox
  ALTER COLUMN aggregate_id SET NOT NULL;

ALTER TABLE app.job_outbox
  ALTER COLUMN causation_id SET NOT NULL;
