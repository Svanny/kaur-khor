-- @risk:low

CREATE TABLE IF NOT EXISTS app.sena_workspace (
    owner_sub TEXT PRIMARY KEY,
    latest_run_id TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app.sena_catalog_sku (
    owner_sub TEXT NOT NULL,
    sku_id TEXT NOT NULL,
    payload_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (owner_sub, sku_id)
);

CREATE TABLE IF NOT EXISTS app.sena_catalog_service (
    owner_sub TEXT NOT NULL,
    service_id TEXT NOT NULL,
    payload_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (owner_sub, service_id)
);

CREATE TABLE IF NOT EXISTS app.sena_service_sku_mask (
    owner_sub TEXT NOT NULL,
    service_id TEXT NOT NULL,
    sku_id TEXT NOT NULL,
    usage_probability DOUBLE PRECISION NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (owner_sub, service_id, sku_id)
);

CREATE TABLE IF NOT EXISTS app.sena_interval_observation (
    owner_sub TEXT NOT NULL,
    observation_id TEXT NOT NULL,
    reported_at TIMESTAMPTZ NOT NULL,
    payload_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (owner_sub, observation_id)
);

CREATE INDEX IF NOT EXISTS sena_interval_observation_owner_reported_at_idx
    ON app.sena_interval_observation (owner_sub, reported_at DESC);

CREATE TABLE IF NOT EXISTS app.sena_analysis_run (
    owner_sub TEXT NOT NULL,
    run_id TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    summary_json JSONB NOT NULL,
    diagnostics_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (owner_sub, run_id)
);

CREATE INDEX IF NOT EXISTS sena_analysis_run_owner_started_at_idx
    ON app.sena_analysis_run (owner_sub, started_at DESC);

CREATE TABLE IF NOT EXISTS app.sena_analysis_artifact (
    owner_sub TEXT NOT NULL,
    run_id TEXT NOT NULL,
    artifact_role TEXT NOT NULL,
    artifact_version INTEGER NOT NULL,
    path TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (owner_sub, run_id, artifact_role, artifact_version)
);
