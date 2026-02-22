CREATE SCHEMA IF NOT EXISTS app;

CREATE TABLE IF NOT EXISTS app.schema_migration_guard (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app.migration_probe_event (
  id BIGSERIAL PRIMARY KEY,
  guard_id BIGINT NOT NULL REFERENCES app.schema_migration_guard(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO app.schema_migration_guard DEFAULT VALUES;
INSERT INTO app.migration_probe_event (guard_id)
SELECT id
FROM app.schema_migration_guard
ORDER BY id ASC
LIMIT 1;
