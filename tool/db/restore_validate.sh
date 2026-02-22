#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REPORT_DIR="${REPORT_DIR:-$ROOT_DIR/build/restore-drill}"
mkdir -p "$REPORT_DIR"

required=(SOURCE_DATABASE_URL RESTORE_DATABASE_URL ENV_NAME)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "error: $name is required" >&2
    exit 1
  fi
done

BACKUP_SOURCE_TIMESTAMP="${BACKUP_SOURCE_TIMESTAMP:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"
START_TS="$(date +%s)"

# Clean and restore into target by logical copy.
psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  stmt TEXT;
BEGIN
  FOR stmt IN
    SELECT 'DROP TABLE IF EXISTS ' || quote_ident(schemaname) || '.' || quote_ident(tablename) || ' CASCADE;'
    FROM pg_tables
    WHERE schemaname IN ('app', 'public')
      AND tablename <> '_sqlx_migrations'
  LOOP
    EXECUTE stmt;
  END LOOP;
END
$$;
DROP TABLE IF EXISTS public._sqlx_migrations CASCADE;
DROP SCHEMA IF EXISTS app CASCADE;
CREATE SCHEMA IF NOT EXISTS app;
SQL

pg_dump --no-owner --no-privileges "$SOURCE_DATABASE_URL" | psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1

VALIDATION_OUTPUT="$REPORT_DIR/validate_${ENV_NAME}.txt"
set +e
psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT_DIR/tool/db/validate_restore.sql" >"$VALIDATION_OUTPUT" 2>&1
VALIDATION_EXIT=$?
set -e

END_TS="$(date +%s)"
DURATION_SECONDS=$((END_TS - START_TS))
STATUS="passed"
if [[ $VALIDATION_EXIT -ne 0 ]]; then
  STATUS="failed"
fi

REPORT_FILE="$REPORT_DIR/report_${ENV_NAME}.json"
cat >"$REPORT_FILE" <<JSON
{
  "environment": "${ENV_NAME}",
  "backup_source_timestamp": "${BACKUP_SOURCE_TIMESTAMP}",
  "restore_duration_seconds": ${DURATION_SECONDS},
  "status": "${STATUS}",
  "validation_output_file": "$(basename "$VALIDATION_OUTPUT")"
}
JSON

if [[ $VALIDATION_EXIT -ne 0 ]]; then
  echo "restore validation failed for ${ENV_NAME}" >&2
  cat "$VALIDATION_OUTPUT" >&2
  exit $VALIDATION_EXIT
fi

echo "restore validation passed for ${ENV_NAME}: $REPORT_FILE"
