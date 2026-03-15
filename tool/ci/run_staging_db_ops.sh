#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REMOTE_WORKDIR="${DB_OPS_REMOTE_WORKDIR:-/workspace}"
INVOCATION_TOKEN="${DB_OPS_INVOCATION_TOKEN:-$(date +%s)-$$-$RANDOM}"
INVOCATION_TOKEN="${INVOCATION_TOKEN//[^A-Za-z0-9._-]/-}"
REMOTE_ENV_FILE="/tmp/banji-db-ops.${INVOCATION_TOKEN}.env"
REMOTE_STATUS_FILE="/tmp/banji-db-ops.${INVOCATION_TOKEN}.status"
REMOTE_REPORT_DIR="${REMOTE_WORKDIR%/}/build/restore-drill-${INVOCATION_TOKEN}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "error: required command not found: $1" >&2
    exit 1
  fi
}

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "error: $name is required" >&2
    exit 1
  fi
}

shell_quote() {
  printf '%q' "${1:-}"
}

append_export_line() {
  local key="$1"
  local value="$2"
  printf 'export %s=%s\n' "$key" "$(shell_quote "$value")"
}

append_payload_export() {
  local payload_name="$1"
  local key="$2"
  local value="$3"
  local line=""

  line="$(append_export_line "$key" "$value")"
  printf -v "$payload_name" '%s%s\n' "${!payload_name}" "$line"
}

env_payload_for_operation() {
  local operation="$1"
  local payload=""

  case "$operation" in
    migrate-with-lock)
      if [[ -n "${ADVISORY_LOCK_KEY:-}" ]]; then
        append_payload_export payload ADVISORY_LOCK_KEY "$ADVISORY_LOCK_KEY"
      fi
      if [[ -n "${MIGRATION_SENTINEL:-}" ]]; then
        append_payload_export payload MIGRATION_SENTINEL "$MIGRATION_SENTINEL"
      fi
      ;;
    restore-validate)
      append_payload_export payload ENV_NAME "${ENV_NAME:-staging}"
      append_payload_export payload BACKUP_SOURCE_TIMESTAMP "${BACKUP_SOURCE_TIMESTAMP:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"
      append_payload_export payload REQUIRED_PG_EXTENSIONS "${REQUIRED_PG_EXTENSIONS:-}"
      append_payload_export payload DROP_RESTORE_AFTER_SUCCESS "${DROP_RESTORE_AFTER_SUCCESS:-true}"
      if [[ -n "${DB_OPS_SOURCE_DATABASE_URL:-}" ]]; then
        append_payload_export payload DB_OPS_SOURCE_DATABASE_URL "$DB_OPS_SOURCE_DATABASE_URL"
      fi
      if [[ -n "${DB_OPS_RESTORE_DATABASE_URL:-}" ]]; then
        append_payload_export payload DB_OPS_RESTORE_DATABASE_URL "$DB_OPS_RESTORE_DATABASE_URL"
      fi
      ;;
    sqlx-migration-repair-inspect|sqlx-migration-repair-generate-sql)
      if [[ -n "${DB_OPS_DATABASE_URL:-}" ]]; then
        append_payload_export payload DB_OPS_DATABASE_URL "$DB_OPS_DATABASE_URL"
      fi
      ;;
    *)
      echo "error: unsupported staging db ops operation '$operation'" >&2
      exit 1
      ;;
  esac

  printf '%s' "$payload"
}

run_railway_capture() {
  local label="$1"
  local stdin_payload="${2:-}"
  local remote_script="$3"
  local output=""
  local rc=0

  if output="$(printf '%s' "$stdin_payload" | railway ssh --service "$RAILWAY_SERVICE_ID" --environment "$RAILWAY_ENVIRONMENT" -- /bin/bash -lc "$remote_script" 2>&1)"; then
    printf '%s' "$output"
    return 0
  fi

  rc=$?
  echo "error: Railway SSH failed during '$label' (exit $rc)" >&2
  if [[ -n "$output" ]]; then
    echo "$output" >&2
  fi
  exit "$rc"
}

extract_remote_restore_artifacts() {
  local archive_b64="$1"
  local archive_file=""

  rm -rf "$ROOT_DIR/build/restore-drill"
  mkdir -p "$ROOT_DIR/build/restore-drill"

  if [[ -z "$archive_b64" ]]; then
    return 0
  fi

  archive_file="$(mktemp)"
  trap 'rm -f "$archive_file"' RETURN
  printf '%s' "$archive_b64" | base64 --decode >"$archive_file"
  tar -xzf "$archive_file" -C "$ROOT_DIR/build/restore-drill"
}

require_cmd railway
require_cmd base64
require_env RAILWAY_API_TOKEN
require_env RAILWAY_PROJECT_ID
require_env RAILWAY_ENVIRONMENT
require_env RAILWAY_SERVICE_ID

if [[ -n "${RAILWAY_TOKEN:-}" ]]; then
  echo "error: RAILWAY_TOKEN is no longer supported; use RAILWAY_API_TOKEN only" >&2
  exit 1
fi

if [[ "$RAILWAY_ENVIRONMENT" != "staging" ]]; then
  echo "error: run_staging_db_ops.sh only supports RAILWAY_ENVIRONMENT=staging" >&2
  exit 1
fi

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <migrate-with-lock|restore-validate|sqlx-migration-repair-inspect|sqlx-migration-repair-generate-sql>" >&2
  exit 1
fi

operation="$1"
env_payload="$(env_payload_for_operation "$operation")"

railway link --project "$RAILWAY_PROJECT_ID" --environment "$RAILWAY_ENVIRONMENT" --service "$RAILWAY_SERVICE_ID" </dev/null >/dev/null

case "$operation" in
  migrate-with-lock)
    migrate_script=$'set -euo pipefail\ntrap '\''rm -f '"$REMOTE_ENV_FILE"$''\'' EXIT\ncat > '"$REMOTE_ENV_FILE"$'\nsource '"$REMOTE_ENV_FILE"$'\ncd '"$REMOTE_WORKDIR"$'\nbash tool/ci/migrate_with_lock.sh'
    run_railway_capture "run staging migrations via Railway SSH" "$env_payload" "$migrate_script" >/dev/null
    ;;
  restore-validate)
    restore_script=$'set -euo pipefail\ntrap '\''rm -f '"$REMOTE_ENV_FILE"$''\'' EXIT\ncat > '"$REMOTE_ENV_FILE"$'\nsource '"$REMOTE_ENV_FILE"$'\ncd '"$REMOTE_WORKDIR"$'\nrm -rf '"$REMOTE_REPORT_DIR"$'\nmkdir -p '"$REMOTE_REPORT_DIR"$'\nexport REPORT_DIR='"$REMOTE_REPORT_DIR"$'\nexport SOURCE_DATABASE_URL="${DB_OPS_SOURCE_DATABASE_URL:-${DATABASE_RUNTIME_URL:-}}"\nexport RESTORE_DATABASE_URL="${DB_OPS_RESTORE_DATABASE_URL:-${RESTORE_DATABASE_URL:-}}"\nset +e\nbash tool/db/restore_validate.sh\nstatus=$?\nset -e\nprintf "%s" "$status" > '"$REMOTE_STATUS_FILE"$'\nexit 0'
    run_railway_capture "run staging restore validation via Railway SSH" "$env_payload" "$restore_script" >/dev/null

    artifact_script=$'set -euo pipefail\nif [[ -d '"$REMOTE_REPORT_DIR"$' ]]; then tar -C '"$REMOTE_REPORT_DIR"$' -czf - . | base64 | tr -d "\\n"; fi'
    restore_artifacts_b64="$(run_railway_capture "fetch staging restore drill artifacts" "" "$artifact_script")"
    extract_remote_restore_artifacts "$restore_artifacts_b64"

    status_script=$'set -euo pipefail\ncat '"$REMOTE_STATUS_FILE"$'\nrm -f '"$REMOTE_STATUS_FILE"$'\nrm -rf '"$REMOTE_REPORT_DIR"
    restore_status="$(run_railway_capture "fetch staging restore validation status" "" "$status_script")"
    if [[ "${restore_status:-1}" != "0" ]]; then
      exit "${restore_status:-1}"
    fi
    ;;
  sqlx-migration-repair-inspect)
    inspect_script=$'set -euo pipefail\ntrap '\''rm -f '"$REMOTE_ENV_FILE"$''\'' EXIT\ncat > '"$REMOTE_ENV_FILE"$'\nsource '"$REMOTE_ENV_FILE"$'\ncd '"$REMOTE_WORKDIR"$'\nexport DATABASE_URL="${DB_OPS_DATABASE_URL:-${DATABASE_MIGRATION_URL:-}}"\nbash tool/db/sqlx_migration_history_repair.sh inspect'
    run_railway_capture "inspect staging sqlx migration metadata via Railway SSH" "$env_payload" "$inspect_script"
    ;;
  sqlx-migration-repair-generate-sql)
    generate_script=$'set -euo pipefail\ntrap '\''rm -f '"$REMOTE_ENV_FILE"$''\'' EXIT\ncat > '"$REMOTE_ENV_FILE"$'\nsource '"$REMOTE_ENV_FILE"$'\ncd '"$REMOTE_WORKDIR"$'\nexport DATABASE_URL="${DB_OPS_DATABASE_URL:-${DATABASE_MIGRATION_URL:-}}"\nbash tool/db/sqlx_migration_history_repair.sh generate-repair-sql'
    run_railway_capture "generate staging sqlx repair SQL via Railway SSH" "$env_payload" "$generate_script"
    ;;
esac

echo "staging db ops $operation passed"
