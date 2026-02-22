-- Bootstrap roles, schema boundary, and default privileges for Banji Postgres.
-- Execute as database superuser/admin per environment.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'banji_migrator') THEN
    CREATE ROLE banji_migrator LOGIN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'banji_runtime') THEN
    CREATE ROLE banji_runtime LOGIN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'banji_restore_validator') THEN
    CREATE ROLE banji_restore_validator LOGIN;
  END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS app AUTHORIZATION banji_migrator;

GRANT USAGE ON SCHEMA app TO banji_runtime, banji_restore_validator;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO banji_runtime;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA app TO banji_runtime;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO banji_runtime;

GRANT SELECT ON ALL TABLES IN SCHEMA app TO banji_restore_validator;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO banji_restore_validator;

DO $$ 
DECLARE
  db_name TEXT := current_database();
BEGIN
  EXECUTE format('ALTER ROLE banji_runtime IN DATABASE %I SET search_path = app, public;', db_name);
END
$$;

ALTER DEFAULT PRIVILEGES FOR ROLE banji_migrator IN SCHEMA app
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO banji_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE banji_migrator IN SCHEMA app
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO banji_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE banji_migrator IN SCHEMA app
  GRANT EXECUTE ON FUNCTIONS TO banji_runtime;

ALTER DEFAULT PRIVILEGES FOR ROLE banji_migrator IN SCHEMA app
  GRANT SELECT ON TABLES TO banji_restore_validator;
ALTER DEFAULT PRIVILEGES FOR ROLE banji_migrator IN SCHEMA app
  GRANT USAGE, SELECT ON SEQUENCES TO banji_restore_validator;
