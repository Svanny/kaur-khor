-- @risk:low

CREATE TABLE IF NOT EXISTS app.job_algorithm_rollout_policy (
  job_type TEXT PRIMARY KEY,
  stable_version TEXT NOT NULL,
  candidate_version TEXT,
  candidate_percent INTEGER NOT NULL DEFAULT 0 CHECK (candidate_percent BETWEEN 0 AND 100),
  updated_by TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE app.job_run
  ADD COLUMN IF NOT EXISTS algorithm_version TEXT,
  ADD COLUMN IF NOT EXISTS algorithm_decision_source TEXT CHECK (
    algorithm_decision_source IN ('stable', 'candidate')
  ),
  ADD COLUMN IF NOT EXISTS algorithm_rollout_bucket INTEGER CHECK (
    algorithm_rollout_bucket BETWEEN 0 AND 99
  ),
  ADD COLUMN IF NOT EXISTS algorithm_policy_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS algorithm_hash_salt_version TEXT,
  ADD COLUMN IF NOT EXISTS algorithm_decided_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_job_algorithm_rollout_policy_job_type
  ON app.job_algorithm_rollout_policy (job_type);

CREATE INDEX IF NOT EXISTS idx_job_run_algorithm_version_created
  ON app.job_run (algorithm_version, created_at)
  WHERE algorithm_version IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_job_run_algorithm_decided_created
  ON app.job_run (algorithm_decided_at, created_at)
  WHERE algorithm_decided_at IS NOT NULL;

INSERT INTO app.job_algorithm_rollout_policy (
  job_type,
  stable_version,
  candidate_version,
  candidate_percent,
  updated_by,
  notes
) VALUES
  ('item-created', 'item-created-v1', NULL, 0, 'migration-0017', 'seeded stable policy'),
  ('write-demo', 'write-demo-v2', NULL, 0, 'migration-0017', 'seeded stable policy')
ON CONFLICT (job_type)
DO UPDATE
SET
  stable_version = EXCLUDED.stable_version,
  candidate_version = EXCLUDED.candidate_version,
  candidate_percent = EXCLUDED.candidate_percent,
  updated_by = EXCLUDED.updated_by,
  notes = EXCLUDED.notes,
  updated_at = NOW();
