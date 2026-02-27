CREATE TABLE IF NOT EXISTS app.object_artifact (
  id BIGSERIAL PRIMARY KEY,
  artifact_key TEXT NOT NULL UNIQUE,
  storage_provider TEXT NOT NULL CHECK (storage_provider IN ('s3')),
  producer_service TEXT NOT NULL,
  producer_role TEXT NOT NULL CHECK (producer_role IN ('api','worker','projection-consumer','event-relay')),
  job_key TEXT,
  job_type TEXT,
  artifact_role TEXT NOT NULL,
  artifact_version INTEGER NOT NULL CHECK (artifact_version >= 1),
  bucket_name TEXT NOT NULL,
  object_key TEXT NOT NULL,
  object_uri TEXT NOT NULL,
  content_type TEXT NOT NULL,
  content_length BIGINT NOT NULL CHECK (content_length >= 0),
  sha256 TEXT NOT NULL,
  etag TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  retention_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (bucket_name, object_key)
);

CREATE INDEX IF NOT EXISTS idx_object_artifact_job_key_created_at
  ON app.object_artifact (job_key, created_at);

CREATE INDEX IF NOT EXISTS idx_object_artifact_job_type_created_at
  ON app.object_artifact (job_type, created_at);

CREATE INDEX IF NOT EXISTS idx_object_artifact_role_created_at
  ON app.object_artifact (artifact_role, created_at);

CREATE INDEX IF NOT EXISTS idx_object_artifact_retention_until
  ON app.object_artifact (retention_until);

CREATE TABLE IF NOT EXISTS app.job_result_artifact (
  id BIGSERIAL PRIMARY KEY,
  job_result_id BIGINT NOT NULL REFERENCES app.job_result(id) ON DELETE CASCADE,
  artifact_id BIGINT NOT NULL REFERENCES app.object_artifact(id) ON DELETE CASCADE,
  artifact_role TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_result_id, artifact_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_job_result_artifact_primary_role
  ON app.job_result_artifact (job_result_id, artifact_role, is_primary)
  WHERE is_primary = true;
