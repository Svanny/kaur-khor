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
  payload_size_bytes INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION app.set_event_log_payload_size_bytes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.payload_size_bytes := pg_column_size(NEW.payload);
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_event_log_payload_size_bytes'
      AND tgrelid = 'app.event_log'::regclass
  ) THEN
    CREATE TRIGGER trg_event_log_payload_size_bytes
    BEFORE INSERT OR UPDATE OF payload
    ON app.event_log
    FOR EACH ROW
    EXECUTE FUNCTION app.set_event_log_payload_size_bytes();
  END IF;
END;
$$;

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
