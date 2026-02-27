CREATE TABLE IF NOT EXISTS app.job_run (
  id BIGSERIAL PRIMARY KEY,
  job_key TEXT NOT NULL UNIQUE,
  job_type TEXT NOT NULL,
  payload_version INTEGER NOT NULL CHECK (payload_version >= 1),
  workload_class TEXT NOT NULL CHECK (workload_class IN ('fast', 'heavy')),
  producer_service TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  causation_id TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'retrying', 'succeeded', 'failed')),
  payload JSONB NOT NULL,
  current_attempt INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL CHECK (max_attempts >= 1),
  next_attempt_at TIMESTAMPTZ,
  last_error_class TEXT CHECK (last_error_class IN ('permanent', 'transient')),
  last_error_reason TEXT,
  last_error TEXT,
  result_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_job_run_status_updated
  ON app.job_run (status, updated_at);

CREATE INDEX IF NOT EXISTS idx_job_run_job_type_created
  ON app.job_run (job_type, created_at);

CREATE INDEX IF NOT EXISTS idx_job_run_correlation_id
  ON app.job_run (correlation_id);

CREATE INDEX IF NOT EXISTS idx_job_run_aggregate
  ON app.job_run (aggregate_type, aggregate_id);

CREATE TABLE IF NOT EXISTS app.job_run_attempt (
  id BIGSERIAL PRIMARY KEY,
  job_run_id BIGINT NOT NULL REFERENCES app.job_run(id) ON DELETE CASCADE,
  attempt INTEGER NOT NULL CHECK (attempt >= 1),
  worker_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('running', 'succeeded', 'retryable_failed', 'permanent_failed', 'duplicate_skipped')
  ),
  lease_expires_at TIMESTAMPTZ,
  heartbeat_at TIMESTAMPTZ,
  error_class TEXT CHECK (error_class IN ('permanent', 'transient')),
  error_reason TEXT,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_run_id, attempt)
);

CREATE INDEX IF NOT EXISTS idx_job_run_attempt_job_attempt
  ON app.job_run_attempt (job_run_id, attempt);

CREATE INDEX IF NOT EXISTS idx_job_run_attempt_status_lease
  ON app.job_run_attempt (status, lease_expires_at);

CREATE INDEX IF NOT EXISTS idx_job_run_attempt_status_updated
  ON app.job_run_attempt (status, updated_at);

CREATE TABLE IF NOT EXISTS app.job_result (
  id BIGSERIAL PRIMARY KEY,
  job_run_id BIGINT NOT NULL UNIQUE REFERENCES app.job_run(id) ON DELETE CASCADE,
  job_key TEXT NOT NULL UNIQUE,
  job_type TEXT NOT NULL,
  result_version INTEGER NOT NULL CHECK (result_version >= 1),
  payload JSONB NOT NULL,
  kafka_publish_status TEXT NOT NULL CHECK (
    kafka_publish_status IN ('disabled', 'pending', 'published', 'failed')
  ) DEFAULT 'disabled',
  kafka_topic TEXT,
  kafka_key TEXT,
  kafka_publish_error TEXT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_result_job_type_created
  ON app.job_result (job_type, created_at);

CREATE INDEX IF NOT EXISTS idx_job_result_kafka_publish_status
  ON app.job_result (kafka_publish_status, updated_at);

ALTER TABLE app.job_run
  ADD CONSTRAINT fk_job_run_result
  FOREIGN KEY (result_id) REFERENCES app.job_result(id);

CREATE TABLE IF NOT EXISTS app.job_delivery_violation (
  id BIGSERIAL PRIMARY KEY,
  job_key TEXT NOT NULL,
  job_type TEXT,
  attempt INTEGER NOT NULL CHECK (attempt >= 1),
  correlation_id TEXT,
  worker_id TEXT NOT NULL,
  error_reason TEXT NOT NULL,
  error_message TEXT NOT NULL,
  envelope JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_key, attempt, error_reason)
);
