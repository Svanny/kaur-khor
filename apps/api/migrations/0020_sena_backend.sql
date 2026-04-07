CREATE TABLE IF NOT EXISTS app.sena_catalog (
  owner_sub TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app.sena_observation (
  observation_id UUID PRIMARY KEY,
  owner_sub TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sena_observation_owner_observed_at
  ON app.sena_observation (owner_sub, observed_at);

CREATE TABLE IF NOT EXISTS app.sena_analysis_run (
  run_id UUID PRIMARY KEY,
  owner_sub TEXT NOT NULL,
  algorithm_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  observation_count INTEGER NOT NULL CHECK (observation_count >= 0),
  summary JSONB,
  diagnostics JSONB,
  primary_artifact_key TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sena_analysis_run_owner_created_at
  ON app.sena_analysis_run (owner_sub, created_at DESC);

CREATE TABLE IF NOT EXISTS app.sena_latest_projection (
  owner_sub TEXT PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES app.sena_analysis_run(run_id) ON DELETE CASCADE,
  workspace_summary JSONB NOT NULL,
  diagnostics JSONB NOT NULL,
  sku_details JSONB NOT NULL,
  service_details JSONB NOT NULL,
  source_event_id BIGINT REFERENCES app.event_log(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sena_latest_projection_run_id
  ON app.sena_latest_projection (run_id);

INSERT INTO app.job_algorithm_rollout_policy (
  job_type,
  stable_version,
  candidate_version,
  candidate_percent,
  updated_by,
  notes
)
VALUES (
  'sena-analysis',
  'sena-analysis-v3',
  'sena-analysis-v3',
  0,
  'migration-0020',
  'Initial SENA rollout policy'
)
ON CONFLICT (job_type) DO NOTHING;
