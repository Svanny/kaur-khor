CREATE INDEX IF NOT EXISTS idx_event_log_created_at_id
  ON app.event_log (created_at, id);
