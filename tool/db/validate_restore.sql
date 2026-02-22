-- Restore validation checks.
-- Designed to fail with non-zero psql exit when required checks fail.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = '_sqlx_migrations'
  ) THEN
    RAISE EXCEPTION 'missing required table public._sqlx_migrations';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'app' AND table_name = 'schema_migration_guard'
  ) THEN
    RAISE EXCEPTION 'missing required table app.schema_migration_guard';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'app' AND table_name = 'migration_probe_event'
  ) THEN
    RAISE EXCEPTION 'missing required table app.migration_probe_event';
  END IF;
END
$$;

DO $$
DECLARE
  migration_count BIGINT;
  guard_count BIGINT;
  orphan_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO migration_count FROM public._sqlx_migrations;
  IF migration_count < 1 THEN
    RAISE EXCEPTION 'no applied migrations found in _sqlx_migrations';
  END IF;

  SELECT COUNT(*) INTO guard_count FROM app.schema_migration_guard;
  IF guard_count < 1 THEN
    RAISE EXCEPTION 'app.schema_migration_guard should contain at least one row';
  END IF;

  SELECT COUNT(*) INTO orphan_count
  FROM app.migration_probe_event e
  LEFT JOIN app.schema_migration_guard g ON g.id = e.guard_id
  WHERE g.id IS NULL;

  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'found % orphan migration_probe_event rows', orphan_count;
  END IF;
END
$$;

SELECT
  (SELECT COUNT(*) FROM public._sqlx_migrations) AS applied_migrations,
  (SELECT COUNT(*) FROM app.schema_migration_guard) AS guard_rows,
  (SELECT COUNT(*) FROM app.migration_probe_event) AS probe_rows;
