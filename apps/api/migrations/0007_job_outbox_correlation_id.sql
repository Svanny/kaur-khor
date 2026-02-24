ALTER TABLE app.job_outbox
  ADD COLUMN IF NOT EXISTS correlation_id TEXT;

UPDATE app.job_outbox
SET correlation_id = COALESCE(correlation_id, CONCAT('legacy-', id::text))
WHERE correlation_id IS NULL;

ALTER TABLE app.job_outbox
  ALTER COLUMN correlation_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_job_outbox_correlation_id
  ON app.job_outbox (correlation_id);
