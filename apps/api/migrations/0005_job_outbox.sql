CREATE TABLE IF NOT EXISTS app.job_outbox (
  id BIGSERIAL PRIMARY KEY,
  enqueue_key TEXT NOT NULL,
  job_type TEXT NOT NULL,
  workload_class TEXT NOT NULL CHECK (workload_class IN ('fast', 'heavy')),
  routing_key TEXT NOT NULL,
  payload JSONB NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL CHECK (status IN ('pending', 'publishing', 'sent', 'failed')) DEFAULT 'pending',
  published_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (enqueue_key)
);

CREATE INDEX IF NOT EXISTS idx_job_outbox_status_created
  ON app.job_outbox (status, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_job_outbox_workload_status
  ON app.job_outbox (workload_class, status, created_at ASC);
