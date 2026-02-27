-- @risk:low
ALTER TABLE app.event_outbox
  ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS app.event_consumer_quarantine (
  id BIGSERIAL PRIMARY KEY,
  service_name TEXT NOT NULL,
  consumer_name TEXT NOT NULL,
  stream_name TEXT NOT NULL,
  event_id BIGINT NOT NULL,
  event_type TEXT NOT NULL,
  event_version INTEGER NOT NULL CHECK (event_version >= 1),
  error_code TEXT NOT NULL,
  error_message TEXT NOT NULL,
  payload JSONB NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (service_name, consumer_name, stream_name, event_id, error_code)
);

CREATE INDEX IF NOT EXISTS idx_event_consumer_quarantine_stream_event
  ON app.event_consumer_quarantine (stream_name, event_id);
