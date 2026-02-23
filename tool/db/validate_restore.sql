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

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'app' AND table_name = 'idempotency_request'
  ) THEN
    RAISE EXCEPTION 'missing required table app.idempotency_request';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'app' AND table_name = 'event_log'
  ) THEN
    RAISE EXCEPTION 'missing required table app.event_log';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'app' AND table_name = 'event_consumer_checkpoint'
  ) THEN
    RAISE EXCEPTION 'missing required table app.event_consumer_checkpoint';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'app' AND table_name = 'job_outbox'
  ) THEN
    RAISE EXCEPTION 'missing required table app.job_outbox';
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

  PERFORM 1
  FROM app.idempotency_request
  WHERE status IN ('in_progress', 'completed', 'failed')
  LIMIT 1;
END
$$;

SELECT
  (SELECT COUNT(*) FROM public._sqlx_migrations) AS applied_migrations,
  (SELECT COUNT(*) FROM app.schema_migration_guard) AS guard_rows,
  (SELECT COUNT(*) FROM app.migration_probe_event) AS probe_rows,
  (SELECT COUNT(*) FROM app.event_log) AS event_rows,
  (SELECT COUNT(*) FROM app.event_consumer_checkpoint) AS checkpoint_rows,
  (SELECT COUNT(*) FROM app.job_outbox) AS job_outbox_rows;
