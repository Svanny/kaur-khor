CREATE TABLE IF NOT EXISTS app.idempotency_request (
  id BIGSERIAL PRIMARY KEY,
  caller_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  response_code INTEGER NOT NULL DEFAULT 0,
  response_body JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (caller_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_status_created
  ON app.idempotency_request (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_idempotency_caller_created
  ON app.idempotency_request (caller_id, created_at DESC);
