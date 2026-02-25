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
  idx_name TEXT;
  required_indexes TEXT[] := ARRAY[
    'idx_idempotency_status_created',
    'idx_idempotency_caller_created',
    'uq_event_log_producer_idempotency',
    'idx_event_log_stream_id',
    'idx_event_log_topic_id',
    'idx_event_log_created_at_brin',
    'idx_event_log_created_at_id',
    'idx_job_outbox_status_created',
    'idx_job_outbox_workload_status',
    'idx_job_outbox_correlation_id'
  ];
BEGIN
  FOREACH idx_name IN ARRAY required_indexes LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'i'
        AND n.nspname = 'app'
        AND c.relname = idx_name
    ) THEN
      RAISE EXCEPTION 'missing required index app.%', idx_name;
    END IF;
  END LOOP;
END
$$;

DO $$
DECLARE
  extension_name TEXT;
  required_list TEXT := NULLIF(:'required_pg_extensions', '');
BEGIN
  IF required_list IS NULL THEN
    RETURN;
  END IF;

  FOR extension_name IN
    SELECT btrim(value)
    FROM unnest(string_to_array(required_list, ',')) AS value
    WHERE btrim(value) <> ''
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = extension_name) THEN
      RAISE EXCEPTION 'missing required extension %', extension_name;
    END IF;
  END LOOP;
END
$$;

DO $$
DECLARE
  migration_count BIGINT;
  guard_count BIGINT;
  orphan_count BIGINT;
  invalid_status_count BIGINT;
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

  SELECT COUNT(*) INTO invalid_status_count
  FROM app.idempotency_request
  WHERE status NOT IN ('in_progress', 'completed', 'failed');

  IF invalid_status_count > 0 THEN
    RAISE EXCEPTION 'idempotency_request contains % invalid status rows', invalid_status_count;
  END IF;
END
$$;

DO $$
DECLARE
  plan_line TEXT;
  uses_event_stream_index BOOLEAN := FALSE;
BEGIN
  PERFORM set_config('enable_seqscan', 'off', true);

  FOR plan_line IN EXECUTE
    'EXPLAIN (COSTS OFF) SELECT id FROM app.event_log WHERE stream_name = ''restore-drill-probe'' ORDER BY id DESC LIMIT 1'
  LOOP
    IF position('idx_event_log_stream_id' IN plan_line) > 0 THEN
      uses_event_stream_index := TRUE;
    END IF;
  END LOOP;

  IF NOT uses_event_stream_index THEN
    RAISE EXCEPTION 'representative query did not use app.idx_event_log_stream_id';
  END IF;
END
$$;

SELECT
  (SELECT COUNT(*) FROM public._sqlx_migrations) AS applied_migrations,
  (SELECT COUNT(*) FROM app.schema_migration_guard) AS guard_rows,
  (SELECT COUNT(*) FROM app.migration_probe_event) AS probe_rows,
  (SELECT COUNT(*) FROM app.idempotency_request) AS idempotency_rows,
  (SELECT COUNT(*) FROM app.event_log) AS event_rows,
  (SELECT COUNT(*) FROM app.event_consumer_checkpoint) AS checkpoint_rows,
  (SELECT COUNT(*) FROM app.job_outbox) AS job_outbox_rows;
