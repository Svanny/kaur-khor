#!/usr/bin/env bash
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VALIDATION_SQL="${VALIDATION_SQL:-$ROOT_DIR/tool/db/validate_restore.sql}"
REPORT_DIR="${REPORT_DIR:-$ROOT_DIR/build/restore-drill}"
mkdir -p "$REPORT_DIR"

ENV_NAME_SAFE="${ENV_NAME:-unknown}"
VALIDATION_OUTPUT="$REPORT_DIR/validate_${ENV_NAME_SAFE}.txt"
REPORT_FILE="$REPORT_DIR/report_${ENV_NAME_SAFE}.json"

BACKUP_SOURCE_TIMESTAMP="${BACKUP_SOURCE_TIMESTAMP:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"
REQUIRED_PG_EXTENSIONS="${REQUIRED_PG_EXTENSIONS:-}"
DROP_RESTORE_AFTER_SUCCESS="${DROP_RESTORE_AFTER_SUCCESS:-true}"

status="failed"
failure_reason=""
started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
start_epoch="$(date +%s)"
restore_seconds=0
validate_seconds=0
source_identifier="unknown"
source_backup_reference="live-snapshot:${BACKUP_SOURCE_TIMESTAMP}"

json_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e ':a;N;$!ba;s/\n/\\n/g'
}

write_report() {
  local ended_at
  local end_epoch
  local total_seconds
  ended_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  end_epoch="$(date +%s)"
  total_seconds=$((end_epoch - start_epoch))

  cat >"$REPORT_FILE" <<JSON
{
  "environment": "$(json_escape "$ENV_NAME_SAFE")",
  "started_at": "${started_at}",
  "ended_at": "${ended_at}",
  "backup_source_timestamp": "${BACKUP_SOURCE_TIMESTAMP}",
  "source_backup_reference": "$(json_escape "$source_backup_reference")",
  "source_identifier": "$(json_escape "$source_identifier")",
  "restore_seconds": ${restore_seconds},
  "validate_seconds": ${validate_seconds},
  "total_seconds": ${total_seconds},
  "status": "${status}",
  "failure_reason": "$(json_escape "$failure_reason")",
  "validation_output_file": "$(basename "$VALIDATION_OUTPUT")"
}
JSON
}

fail() {
  local reason="$1"
  failure_reason="$reason"
  status="failed"
  write_report
  echo "restore validation failed for ${ENV_NAME_SAFE}: ${reason}" >&2
  if [[ -f "$VALIDATION_OUTPUT" ]]; then
    cat "$VALIDATION_OUTPUT" >&2
  fi
  exit 1
}

cleanup_restore_target() {
  psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  stmt TEXT;
BEGIN
  -- Drop tables/views/materialized views/sequences/foreign tables in app/public
  -- while preserving extension-owned objects in public.
  FOR stmt IN
    SELECT format(
      'DROP %s IF EXISTS %I.%I CASCADE;',
      CASE c.relkind
        WHEN 'r' THEN 'TABLE'
        WHEN 'p' THEN 'TABLE'
        WHEN 'v' THEN 'VIEW'
        WHEN 'm' THEN 'MATERIALIZED VIEW'
        WHEN 'S' THEN 'SEQUENCE'
        WHEN 'f' THEN 'FOREIGN TABLE'
      END,
      n.nspname,
      c.relname
    )
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('app', 'public')
      AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
      AND NOT (n.nspname = 'public' AND c.relname = '_sqlx_migrations')
      AND NOT EXISTS (
        SELECT 1
        FROM pg_depend d
        WHERE d.classid = 'pg_class'::regclass
          AND d.objid = c.oid
          AND d.deptype = 'e'
      )
  LOOP
    EXECUTE stmt;
  END LOOP;

  -- Drop routines in app/public that are not extension-owned.
  FOR stmt IN
    SELECT format(
      'DROP %s IF EXISTS %I.%I(%s) CASCADE;',
      CASE p.prokind
        WHEN 'p' THEN 'PROCEDURE'
        WHEN 'a' THEN 'AGGREGATE'
        ELSE 'FUNCTION'
      END,
      n.nspname,
      p.proname,
      pg_get_function_identity_arguments(p.oid)
    )
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('app', 'public')
      AND NOT EXISTS (
        SELECT 1
        FROM pg_depend d
        WHERE d.classid = 'pg_proc'::regclass
          AND d.objid = p.oid
          AND d.deptype = 'e'
      )
  LOOP
    EXECUTE stmt;
  END LOOP;

  -- Drop user-defined types in app/public that are not extension-owned.
  FOR stmt IN
    SELECT format('DROP TYPE IF EXISTS %I.%I CASCADE;', n.nspname, t.typname)
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname IN ('app', 'public')
      AND t.typtype IN ('c', 'd', 'e', 'r')
      AND t.typrelid = 0
      AND t.typname !~ '^_'
      AND NOT EXISTS (
        SELECT 1
        FROM pg_depend d
        WHERE d.classid = 'pg_type'::regclass
          AND d.objid = t.oid
          AND d.deptype = 'e'
      )
  LOOP
    EXECUTE stmt;
  END LOOP;
END
$$;
DROP TABLE IF EXISTS public._sqlx_migrations CASCADE;
DROP SCHEMA IF EXISTS app CASCADE;
CREATE SCHEMA IF NOT EXISTS app;
SQL
}

if [[ ! -f "$VALIDATION_SQL" ]]; then
  fail "missing_validation_sql"
fi

required=(SOURCE_DATABASE_URL RESTORE_DATABASE_URL ENV_NAME)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    fail "missing_required_env_${name}"
  fi
done

ENV_NAME_SAFE="$ENV_NAME"
VALIDATION_OUTPUT="$REPORT_DIR/validate_${ENV_NAME_SAFE}.txt"
REPORT_FILE="$REPORT_DIR/report_${ENV_NAME_SAFE}.json"

SOURCE_DB_NAME="$(psql "$SOURCE_DATABASE_URL" -Atqc 'SELECT current_database();' 2>/dev/null || true)"
if [[ -z "$SOURCE_DB_NAME" ]]; then
  fail "source_db_name_resolution_failed"
fi

RESTORE_DB_NAME="$(psql "$RESTORE_DATABASE_URL" -Atqc 'SELECT current_database();' 2>/dev/null || true)"
if [[ -z "$RESTORE_DB_NAME" ]]; then
  fail "restore_db_name_resolution_failed"
fi

source_identifier="$(psql "$SOURCE_DATABASE_URL" -Atqc "SELECT COALESCE(inet_server_addr()::text, 'local') || '/' || current_database();" 2>/dev/null || true)"
if [[ -z "$source_identifier" ]]; then
  source_identifier="unknown/${SOURCE_DB_NAME}"
fi

if [[ "$RESTORE_DB_NAME" != *_restore ]]; then
  fail "restore_target_must_end_with__restore"
fi

if [[ "$SOURCE_DB_NAME" == "$RESTORE_DB_NAME" ]]; then
  fail "source_and_restore_database_must_differ"
fi

restore_start_epoch="$(date +%s)"
if ! cleanup_restore_target; then
  fail "restore_target_cleanup_failed"
fi

if ! pg_dump --no-owner --no-privileges "$SOURCE_DATABASE_URL" | psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1; then
  fail "logical_restore_failed"
fi
restore_end_epoch="$(date +%s)"
restore_seconds=$((restore_end_epoch - restore_start_epoch))

validate_start_epoch="$(date +%s)"
if ! psql "$RESTORE_DATABASE_URL" \
  -v ON_ERROR_STOP=1 \
  -v required_pg_extensions="$REQUIRED_PG_EXTENSIONS" \
  -f "$VALIDATION_SQL" >"$VALIDATION_OUTPUT" 2>&1; then
  validate_end_epoch="$(date +%s)"
  validate_seconds=$((validate_end_epoch - validate_start_epoch))
  fail "validation_failed"
fi
validate_end_epoch="$(date +%s)"
validate_seconds=$((validate_end_epoch - validate_start_epoch))

if [[ "$DROP_RESTORE_AFTER_SUCCESS" == "true" || "$DROP_RESTORE_AFTER_SUCCESS" == "1" ]]; then
  if ! cleanup_restore_target; then
    fail "post_validation_cleanup_failed"
  fi
fi

status="passed"
failure_reason=""
write_report

echo "restore validation passed for ${ENV_NAME_SAFE}: $REPORT_FILE"
