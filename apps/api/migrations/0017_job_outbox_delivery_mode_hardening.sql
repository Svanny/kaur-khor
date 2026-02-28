UPDATE app.job_outbox
SET delivery_mode = 'primary'
WHERE delivery_mode IS NULL;

ALTER TABLE app.job_outbox
  DROP CONSTRAINT IF EXISTS chk_job_outbox_delivery_mode;

ALTER TABLE app.job_outbox
  ADD CONSTRAINT chk_job_outbox_delivery_mode
  CHECK (delivery_mode IN ('primary', 'replay'));

ALTER TABLE app.job_outbox
  ALTER COLUMN delivery_mode SET NOT NULL;
