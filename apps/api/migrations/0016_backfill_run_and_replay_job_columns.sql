CREATE TABLE IF NOT EXISTS app.backfill_run (
  id UUID PRIMARY KEY,
  run_kind TEXT NOT NULL CHECK (run_kind IN ('projection', 'jobs')),
  status TEXT NOT NULL CHECK (
    status IN (
      'planned',
      'running',
      'waiting',
      'succeeded',
      'completed_with_failures',
      'failed',
      'cancelled'
    )
  ),
  operator_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  stream_name TEXT NOT NULL,
  service_name TEXT NOT NULL,
  consumer_name TEXT,
  job_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  from_event_id BIGINT NOT NULL,
  requested_to_event_id BIGINT,
  resolved_to_event_id BIGINT NOT NULL,
  batch_size INTEGER NOT NULL CHECK (batch_size > 0),
  invalid_event_policy TEXT NOT NULL CHECK (invalid_event_policy IN ('halt', 'quarantine')),
  reset_checkpoint BOOLEAN NOT NULL DEFAULT false,
  truncate_projection BOOLEAN NOT NULL DEFAULT false,
  checkpoint_start BIGINT,
  last_scanned_event_id BIGINT NOT NULL DEFAULT 0,
  candidate_event_count BIGINT NOT NULL DEFAULT 0,
  processed_event_count BIGINT NOT NULL DEFAULT 0,
  applied_projection_count BIGINT NOT NULL DEFAULT 0,
  enqueued_job_count BIGINT NOT NULL DEFAULT 0,
  job_success_count BIGINT NOT NULL DEFAULT 0,
  job_failure_count BIGINT NOT NULL DEFAULT 0,
  invalid_event_count BIGINT NOT NULL DEFAULT 0,
  last_error TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_backfill_run_status_created
  ON app.backfill_run (status, created_at);

CREATE INDEX IF NOT EXISTS idx_backfill_run_stream_created
  ON app.backfill_run (stream_name, created_at);

ALTER TABLE app.job_run
  ADD COLUMN IF NOT EXISTS backfill_run_id UUID REFERENCES app.backfill_run(id);

ALTER TABLE app.job_run
  ADD COLUMN IF NOT EXISTS source_event_id BIGINT REFERENCES app.event_log(id);

CREATE INDEX IF NOT EXISTS idx_job_run_backfill_run_created
  ON app.job_run (backfill_run_id, created_at);

CREATE INDEX IF NOT EXISTS idx_job_run_source_event_id
  ON app.job_run (source_event_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_job_run_backfill_source_event_type
  ON app.job_run (backfill_run_id, source_event_id, job_type)
  WHERE backfill_run_id IS NOT NULL AND source_event_id IS NOT NULL;

ALTER TABLE app.job_outbox
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE app.job_outbox
  ADD COLUMN IF NOT EXISTS backfill_run_id UUID REFERENCES app.backfill_run(id);

ALTER TABLE app.job_outbox
  ADD COLUMN IF NOT EXISTS source_event_id BIGINT REFERENCES app.event_log(id);

ALTER TABLE app.job_outbox
  ADD COLUMN IF NOT EXISTS delivery_mode TEXT DEFAULT 'primary';

CREATE INDEX IF NOT EXISTS idx_job_outbox_delivery_mode_status_created
  ON app.job_outbox (delivery_mode, status, created_at ASC);
