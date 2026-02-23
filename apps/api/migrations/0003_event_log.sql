CREATE TABLE IF NOT EXISTS app.event_log (
  id BIGSERIAL PRIMARY KEY,
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
  causation_id TEXT,
  payload JSONB NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload_size_bytes INTEGER GENERATED ALWAYS AS (pg_column_size(payload)) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_event_log_producer_idempotency
  ON app.event_log (producer_service, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_event_log_stream_id
  ON app.event_log (stream_name, id);

CREATE INDEX IF NOT EXISTS idx_event_log_topic_id
  ON app.event_log (topic_name, id);

CREATE INDEX IF NOT EXISTS idx_event_log_created_at_brin
  ON app.event_log USING BRIN (created_at);

CREATE TABLE IF NOT EXISTS app.event_consumer_checkpoint (
  service_name TEXT NOT NULL,
  consumer_name TEXT NOT NULL,
  stream_name TEXT NOT NULL,
  last_event_id BIGINT NOT NULL DEFAULT 0,
  last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (service_name, consumer_name, stream_name)
);
