CREATE TABLE IF NOT EXISTS app.event_log_archive_export_cursor (
  stream_name TEXT PRIMARY KEY,
  last_exported_event_id BIGINT NOT NULL DEFAULT 0,
  last_exported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app.event_log_archive (
  archived_id BIGSERIAL PRIMARY KEY,
  event_id BIGINT NOT NULL,
  stream_name TEXT NOT NULL,
  env_name TEXT NOT NULL,
  topic_name TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_version INTEGER NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  producer_service TEXT NOT NULL,
  idempotency_key TEXT,
  correlation_id TEXT,
  causation_id TEXT,
  payload JSONB NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload_size_bytes INTEGER,
  created_at TIMESTAMPTZ NOT NULL,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id)
);
