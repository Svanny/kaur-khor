-- @risk:low
CREATE TABLE IF NOT EXISTS app.event_outbox (
  id BIGSERIAL PRIMARY KEY,
  publish_key TEXT NOT NULL UNIQUE,
  stream_name TEXT NOT NULL,
  env_name TEXT NOT NULL,
  topic_name TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_version INTEGER NOT NULL CHECK (event_version >= 1),
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  producer_service TEXT NOT NULL,
  idempotency_key TEXT,
  correlation_id TEXT,
  causation_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL CHECK (status IN ('pending', 'published', 'blocked')) DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event_log_id BIGINT REFERENCES app.event_log(id),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_event_outbox_status_next_id
  ON app.event_outbox (status, next_attempt_at, id);

CREATE INDEX IF NOT EXISTS idx_event_outbox_stream_id
  ON app.event_outbox (stream_name, id);

CREATE INDEX IF NOT EXISTS idx_event_outbox_published_at
  ON app.event_outbox (published_at);
