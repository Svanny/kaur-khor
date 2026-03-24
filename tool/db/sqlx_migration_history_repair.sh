#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-$ROOT_DIR/apps/api/migrations}"
PSQL_BIN="${PSQL_BIN:-psql}"

usage() {
  cat <<'EOF'
Usage:
  DATABASE_URL=... bash tool/db/sqlx_migration_history_repair.sh inspect
  DATABASE_URL=... bash tool/db/sqlx_migration_history_repair.sh generate-repair-sql

Commands:
  inspect
    Print _sqlx_migrations metadata, expected checksums for versions 0016/0018/0019,
    and schema probes that indicate whether the 0016->0018 renumbering repair is safe.

  generate-repair-sql
    Emit SQL that remaps an already-applied old version 16 metadata migration to the
    current version 18 slot. This only emits SQL when the database shape matches the
    expected sqlx 0.8 metadata table and the recorded checksum drift is the traced
    0016_job_outbox_metadata -> 0018_job_outbox_metadata case.
EOF
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "error: required command not found: $1" >&2
    exit 1
  fi
}

query_scalar() {
  "$PSQL_BIN" "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc "$1"
}

query_table() {
  "$PSQL_BIN" "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -P pager=off -c "$1"
}

migration_checksum_hex() {
  local file="$1"
  openssl dgst -sha384 -binary "$file" | xxd -p -c 256 | tr -d '\n'
}

migration_description() {
  local file="$1"
  local name
  name="$(basename "$file")"
  name="${name#*_}"
  name="${name%.sql}"
  echo "${name//_/ }"
}

if [[ $# -ne 1 ]]; then
  usage >&2
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "error: DATABASE_URL is required" >&2
  exit 1
fi

require_cmd "$PSQL_BIN"
require_cmd openssl
require_cmd xxd

command_name="$1"
version_16_file="$MIGRATIONS_DIR/0016_backfill_run_and_replay_job_columns.sql"
version_18_file="$MIGRATIONS_DIR/0018_job_outbox_metadata.sql"
version_19_file="$MIGRATIONS_DIR/0019_job_outbox_delivery_mode_hardening.sql"

for required_file in "$version_16_file" "$version_18_file" "$version_19_file"; do
  if [[ ! -f "$required_file" ]]; then
    echo "error: required migration file not found: $required_file" >&2
    exit 1
  fi
done

expected_columns=$'checksum|bytea\ndescription|text\nexecution_time|bigint\ninstalled_on|timestamp with time zone\nsuccess|boolean\nversion|bigint'
actual_columns="$(query_scalar "
SELECT string_agg(column_name || '|' || data_type, E'\n' ORDER BY column_name)
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = '_sqlx_migrations';
")"

current_16_checksum="$(migration_checksum_hex "$version_16_file")"
current_18_checksum="$(migration_checksum_hex "$version_18_file")"
current_19_checksum="$(migration_checksum_hex "$version_19_file")"
legacy_16_checksum="$(migration_checksum_hex "$version_18_file")"

row_16="$(query_scalar "
SELECT COALESCE(version::text, '') || '|' || COALESCE(description, '') || '|' || success::text || '|' || encode(checksum, 'hex')
FROM public._sqlx_migrations
WHERE version = 16
ORDER BY installed_on DESC
LIMIT 1;
")"
row_18="$(query_scalar "
SELECT COALESCE(version::text, '') || '|' || COALESCE(description, '') || '|' || success::text || '|' || encode(checksum, 'hex')
FROM public._sqlx_migrations
WHERE version = 18
ORDER BY installed_on DESC
LIMIT 1;
")"
row_19="$(query_scalar "
SELECT COALESCE(version::text, '') || '|' || COALESCE(description, '') || '|' || success::text || '|' || encode(checksum, 'hex')
FROM public._sqlx_migrations
WHERE version = 19
ORDER BY installed_on DESC
LIMIT 1;
")"

metadata_exists="$(query_scalar "SELECT EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema = 'app' AND table_name = 'job_outbox' AND column_name = 'metadata'
);")"
delivery_mode_exists="$(query_scalar "SELECT EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema = 'app' AND table_name = 'job_outbox' AND column_name = 'delivery_mode'
);")"
delivery_mode_not_null="$(query_scalar "SELECT EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema = 'app' AND table_name = 'job_outbox' AND column_name = 'delivery_mode' AND is_nullable = 'NO'
);")"
delivery_mode_constraint_exists="$(query_scalar "SELECT EXISTS (
  SELECT 1
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'app'
    AND t.relname = 'job_outbox'
    AND c.conname = 'chk_job_outbox_delivery_mode'
);")"
backfill_run_exists="$(query_scalar "SELECT EXISTS (
  SELECT 1
  FROM information_schema.tables
  WHERE table_schema = 'app' AND table_name = 'backfill_run'
);")"

safe_to_remap=false
if [[ "$actual_columns" == "$expected_columns" ]] \
  && [[ -n "$row_16" ]] \
  && [[ "${row_16##*|}" == "$legacy_16_checksum" ]] \
  && [[ -z "$row_18" ]] \
  && [[ "$metadata_exists" == "t" ]] \
  && [[ "$backfill_run_exists" == "f" ]]; then
  safe_to_remap=true
fi

case "$command_name" in
  inspect)
    cat <<EOF
sqlx migration repair inspection
safe_to_remap_16_to_18: $safe_to_remap

expected_sqlx_columns:
$expected_columns

actual_sqlx_columns:
${actual_columns:-<missing>}

expected_checksums:
  0016 current backfill checksum: $current_16_checksum
  0018 current metadata checksum: $current_18_checksum
  0019 current delivery checksum: $current_19_checksum
  legacy 0016 metadata checksum: $legacy_16_checksum

schema_probes:
  app.job_outbox.metadata exists: $metadata_exists
  app.job_outbox.delivery_mode exists: $delivery_mode_exists
  app.job_outbox.delivery_mode NOT NULL: $delivery_mode_not_null
  app.job_outbox delivery_mode check constraint exists: $delivery_mode_constraint_exists
  app.backfill_run exists: $backfill_run_exists

applied_rows:
EOF
    query_table "
SELECT version, description, installed_on, success, encode(checksum, 'hex') AS checksum_hex, execution_time
FROM public._sqlx_migrations
WHERE version IN (16, 18, 19)
ORDER BY version, installed_on;
"
    if [[ "$safe_to_remap" != "true" ]]; then
      cat <<'EOF'

manual review required:
- Verify a staging snapshot/backup exists before any metadata surgery.
- Only use generate-repair-sql when version 16 still records the legacy metadata checksum,
  version 18 is absent, and app.backfill_run does not exist yet.
- If version 19 side effects already exist without a matching _sqlx_migrations row, repair
  that row manually after inspecting the current schema.
EOF
    fi
    ;;
  generate-repair-sql)
    if [[ "$safe_to_remap" != "true" ]]; then
      echo "error: database state does not match the expected 0016->0018 repair shape" >&2
      echo "run the inspect command and review the probes before generating SQL" >&2
      exit 1
    fi
    cat <<EOF
-- Precondition: take a staging snapshot/backup before running this SQL.
-- Purpose: remap the legacy version-16 metadata migration into the current version-18 slot.
BEGIN;

DELETE FROM public._sqlx_migrations
WHERE version = 16
  AND checksum = decode('${legacy_16_checksum}', 'hex');

INSERT INTO public._sqlx_migrations (
  version,
  description,
  installed_on,
  success,
  checksum,
  execution_time
) VALUES (
  18,
  '$(migration_description "$version_18_file")',
  NOW(),
  TRUE,
  decode('${current_18_checksum}', 'hex'),
  0
)
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- Next step:
--   DATABASE_MIGRATION_URL=... DATABASE_RUNTIME_URL=... bash tool/local/migrate_with_lock.sh
--
-- Expected outcome:
--   sqlx applies version 16 (backfill + replay columns) and then version 19 (delivery-mode hardening).
EOF
    ;;
  *)
    usage >&2
    exit 1
    ;;
esac
