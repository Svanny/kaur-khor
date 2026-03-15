#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REMOTE_WORKDIR="${DB_OPS_REMOTE_WORKDIR:-/workspace}"
INVOCATION_TOKEN="${DB_OPS_INVOCATION_TOKEN:-$(date +%s)-$$-$RANDOM}"
INVOCATION_TOKEN="${INVOCATION_TOKEN//[^A-Za-z0-9._-]/-}"
REMOTE_ENV_FILE="/tmp/banji-db-ops.${INVOCATION_TOKEN}.env"
REMOTE_STATUS_FILE="/tmp/banji-db-ops.${INVOCATION_TOKEN}.status"
REMOTE_RESTORE_DIR="${REMOTE_WORKDIR%/}/build/restore-drill-${INVOCATION_TOKEN}"
REMOTE_EVENT_LOG_DIR="${REMOTE_WORKDIR%/}/build/event-log-${INVOCATION_TOKEN}"

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
      append_payload_export payload ENV_NAME "${ENV_NAME:-$RAILWAY_ENVIRONMENT}"
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
    event-log-maintenance)
      append_payload_export payload DB_OPS_EVENT_LOG_STREAM_NAME "${DB_OPS_EVENT_LOG_STREAM_NAME:?DB_OPS_EVENT_LOG_STREAM_NAME is required}"
      append_payload_export payload DB_OPS_EVENT_LOG_BEFORE "${DB_OPS_EVENT_LOG_BEFORE:-}"
      append_payload_export payload DB_OPS_EVENT_LOG_TO_ID "${DB_OPS_EVENT_LOG_TO_ID:-}"
      append_payload_export payload DB_OPS_EVENT_LOG_PRUNE "${DB_OPS_EVENT_LOG_PRUNE:-false}"
      append_payload_export payload DB_OPS_EVENT_LOG_DRY_RUN "${DB_OPS_EVENT_LOG_DRY_RUN:-true}"
      append_payload_export payload DB_OPS_EVENT_LOG_REPLAY_FROM_ID "${DB_OPS_EVENT_LOG_REPLAY_FROM_ID:-0}"
      append_payload_export payload DB_OPS_EVENT_LOG_SERVICE_NAME "${DB_OPS_EVENT_LOG_SERVICE_NAME:-projection-consumer}"
      append_payload_export payload DB_OPS_EVENT_LOG_CONSUMER_NAME "${DB_OPS_EVENT_LOG_CONSUMER_NAME:-replay-maintenance-preview}"
      append_payload_export payload DB_OPS_EVENT_LOG_RETENTION_DAYS "${DB_OPS_EVENT_LOG_RETENTION_DAYS:-30}"
      append_payload_export payload DB_OPS_EVENT_LOG_PRUNE_BATCH_SIZE "${DB_OPS_EVENT_LOG_PRUNE_BATCH_SIZE:-1000}"
      append_payload_export payload DB_OPS_EVENT_LOG_ARCHIVE_PREFIX "${DB_OPS_EVENT_LOG_ARCHIVE_PREFIX:-event-log}"
      append_payload_export payload DB_OPS_EVENT_LOG_ARCHIVE_ENCRYPTION_REQUIRED "${DB_OPS_EVENT_LOG_ARCHIVE_ENCRYPTION_REQUIRED:-true}"
      append_payload_export payload DB_OPS_EVENT_LOG_REPLAY_BATCH_SIZE "${DB_OPS_EVENT_LOG_REPLAY_BATCH_SIZE:-1000}"
      if [[ -n "${DB_OPS_DATABASE_URL:-}" ]]; then
        append_payload_export payload DB_OPS_DATABASE_URL "$DB_OPS_DATABASE_URL"
      fi
      ;;
    *)
      echo "error: unsupported db ops operation '$operation'" >&2
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

extract_remote_artifacts() {
  local archive_b64="$1"
  local target_dir="$2"
  local archive_file=""

  rm -rf "$target_dir"
  mkdir -p "$target_dir"

  if [[ -z "$archive_b64" ]]; then
    return 0
  fi

  archive_file="$(mktemp)"
  trap 'rm -f "$archive_file"' RETURN
  printf '%s' "$archive_b64" | base64 --decode >"$archive_file"
  tar -xzf "$archive_file" -C "$target_dir"
}

require_cmd railway
require_cmd base64
require_cmd tar
require_env RAILWAY_API_TOKEN
require_env RAILWAY_PROJECT_ID
require_env RAILWAY_ENVIRONMENT
require_env RAILWAY_SERVICE_ID

if [[ -n "${RAILWAY_TOKEN:-}" ]]; then
  echo "error: RAILWAY_TOKEN is no longer supported; use RAILWAY_API_TOKEN only" >&2
  exit 1
fi

case "$RAILWAY_ENVIRONMENT" in
  staging|prod) ;;
  *)
    echo "error: run_db_ops.sh only supports RAILWAY_ENVIRONMENT=staging|prod" >&2
    exit 1
    ;;
esac

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <migrate-with-lock|restore-validate|sqlx-migration-repair-inspect|sqlx-migration-repair-generate-sql|event-log-maintenance>" >&2
  exit 1
fi

operation="$1"
env_payload="$(env_payload_for_operation "$operation")"

railway link --project "$RAILWAY_PROJECT_ID" --environment "$RAILWAY_ENVIRONMENT" --service "$RAILWAY_SERVICE_ID" </dev/null >/dev/null

case "$operation" in
  migrate-with-lock)
    migrate_script=$'set -euo pipefail\ntrap '\''rm -f '"$REMOTE_ENV_FILE"$''\'' EXIT\ncat > '"$REMOTE_ENV_FILE"$'\nsource '"$REMOTE_ENV_FILE"$'\ncd '"$REMOTE_WORKDIR"$'\nbash tool/ci/migrate_with_lock.sh'
    run_railway_capture "run $RAILWAY_ENVIRONMENT migrations via Railway SSH" "$env_payload" "$migrate_script" >/dev/null
    ;;
  restore-validate)
    restore_script=$'set -euo pipefail\ntrap '\''rm -f '"$REMOTE_ENV_FILE"$''\'' EXIT\ncat > '"$REMOTE_ENV_FILE"$'\nsource '"$REMOTE_ENV_FILE"$'\ncd '"$REMOTE_WORKDIR"$'\nrm -rf '"$REMOTE_RESTORE_DIR"$'\nmkdir -p '"$REMOTE_RESTORE_DIR"$'\nset +e\n(\n  set -euo pipefail\n  export REPORT_DIR='"$REMOTE_RESTORE_DIR"$'\n  export SOURCE_DATABASE_URL="${DB_OPS_SOURCE_DATABASE_URL:-${DATABASE_RUNTIME_URL:-}}"\n  export RESTORE_DATABASE_URL="${DB_OPS_RESTORE_DATABASE_URL:-${RESTORE_DATABASE_URL:-}}"\n  bash tool/db/restore_validate.sh\n)\nstatus=$?\nset -e\nprintf "%s" "$status" > '"$REMOTE_STATUS_FILE"$'\nexit 0'
    run_railway_capture "run $RAILWAY_ENVIRONMENT restore validation via Railway SSH" "$env_payload" "$restore_script" >/dev/null

    artifact_script=$'set -euo pipefail\nif [[ -d '"$REMOTE_RESTORE_DIR"$' ]]; then tar -C '"$REMOTE_RESTORE_DIR"$' -czf - . | base64 | tr -d "\\n"; fi'
    restore_artifacts_b64="$(run_railway_capture "fetch $RAILWAY_ENVIRONMENT restore drill artifacts" "" "$artifact_script")"
    extract_remote_artifacts "$restore_artifacts_b64" "$ROOT_DIR/build/restore-drill"

    status_script=$'set -euo pipefail\ncat '"$REMOTE_STATUS_FILE"$'\nrm -f '"$REMOTE_STATUS_FILE"$'\nrm -rf '"$REMOTE_RESTORE_DIR"
    restore_status="$(run_railway_capture "fetch $RAILWAY_ENVIRONMENT restore validation status" "" "$status_script")"
    if [[ "${restore_status:-1}" != "0" ]]; then
      exit "${restore_status:-1}"
    fi
    ;;
  sqlx-migration-repair-inspect)
    inspect_script=$'set -euo pipefail\ntrap '\''rm -f '"$REMOTE_ENV_FILE"$''\'' EXIT\ncat > '"$REMOTE_ENV_FILE"$'\nsource '"$REMOTE_ENV_FILE"$'\ncd '"$REMOTE_WORKDIR"$'\nexport DATABASE_URL="${DB_OPS_DATABASE_URL:-${DATABASE_MIGRATION_URL:-}}"\nbash tool/db/sqlx_migration_history_repair.sh inspect'
    run_railway_capture "inspect $RAILWAY_ENVIRONMENT sqlx migration metadata via Railway SSH" "$env_payload" "$inspect_script"
    ;;
  sqlx-migration-repair-generate-sql)
    generate_script=$'set -euo pipefail\ntrap '\''rm -f '"$REMOTE_ENV_FILE"$''\'' EXIT\ncat > '"$REMOTE_ENV_FILE"$'\nsource '"$REMOTE_ENV_FILE"$'\ncd '"$REMOTE_WORKDIR"$'\nexport DATABASE_URL="${DB_OPS_DATABASE_URL:-${DATABASE_MIGRATION_URL:-}}"\nbash tool/db/sqlx_migration_history_repair.sh generate-repair-sql'
    run_railway_capture "generate $RAILWAY_ENVIRONMENT sqlx repair SQL via Railway SSH" "$env_payload" "$generate_script"
    ;;
  event-log-maintenance)
    event_log_script=$'set -euo pipefail\ntrap '\''rm -f '"$REMOTE_ENV_FILE"$''\'' EXIT\ncat > '"$REMOTE_ENV_FILE"$'\nsource '"$REMOTE_ENV_FILE"$'\ncd '"$REMOTE_WORKDIR"$'\nrm -rf '"$REMOTE_EVENT_LOG_DIR"$'\nmkdir -p '"$REMOTE_EVENT_LOG_DIR"$'\nset +e\n(\n  set -euo pipefail\n  export DATABASE_URL="${DB_OPS_DATABASE_URL:-${DATABASE_RUNTIME_URL:-}}"\n  export EVENT_LOG_RETENTION_DAYS="${DB_OPS_EVENT_LOG_RETENTION_DAYS:-30}"\n  export EVENT_LOG_PRUNE_BATCH_SIZE="${DB_OPS_EVENT_LOG_PRUNE_BATCH_SIZE:-1000}"\n  export EVENT_LOG_ARCHIVE_PREFIX="${DB_OPS_EVENT_LOG_ARCHIVE_PREFIX:-event-log}"\n  export EVENT_LOG_ARCHIVE_ENCRYPTION_REQUIRED="${DB_OPS_EVENT_LOG_ARCHIVE_ENCRYPTION_REQUIRED:-true}"\n  export EVENT_LOG_REPLAY_BATCH_SIZE="${DB_OPS_EVENT_LOG_REPLAY_BATCH_SIZE:-1000}"\n  bash tool/db/event_log_storage_report.sh --output-json '"$REMOTE_EVENT_LOG_DIR"$'/storage_report.json --output-text '"$REMOTE_EVENT_LOG_DIR"$'/storage_report.txt\n  ARGS=(--stream-name "${DB_OPS_EVENT_LOG_STREAM_NAME:?}" --output '"$REMOTE_EVENT_LOG_DIR"$'/export.jsonl --manifest-output '"$REMOTE_EVENT_LOG_DIR"$'/export.manifest.json --archive-uri file://'"$REMOTE_EVENT_LOG_DIR"'/export.remote.jsonl)\n  if [[ -n "${DB_OPS_EVENT_LOG_BEFORE:-}" ]]; then ARGS+=(--before "$DB_OPS_EVENT_LOG_BEFORE"); fi\n  if [[ -n "${DB_OPS_EVENT_LOG_TO_ID:-}" ]]; then ARGS+=(--to-id "$DB_OPS_EVENT_LOG_TO_ID"); fi\n  if [[ "${DB_OPS_EVENT_LOG_PRUNE:-false}" == "true" ]]; then ARGS+=(--prune); fi\n  if [[ "${DB_OPS_EVENT_LOG_DRY_RUN:-true}" == "true" ]]; then ARGS+=(--dry-run); fi\n  bash tool/db/export_event_log.sh "${ARGS[@]}"\n  bash tool/db/replay_event_log.sh --mode hot-preview --stream-name "${DB_OPS_EVENT_LOG_STREAM_NAME:?}" --service-name "${DB_OPS_EVENT_LOG_SERVICE_NAME:-projection-consumer}" --consumer-name "${DB_OPS_EVENT_LOG_CONSUMER_NAME:-replay-maintenance-preview}" --from-id "${DB_OPS_EVENT_LOG_REPLAY_FROM_ID:-0}"\n)\nstatus=$?\nset -e\nprintf "%s" "$status" > '"$REMOTE_STATUS_FILE"$'\nexit 0'
    run_railway_capture "run $RAILWAY_ENVIRONMENT event-log maintenance via Railway SSH" "$env_payload" "$event_log_script" >/dev/null

    event_log_artifact_script=$'set -euo pipefail\nif [[ -d '"$REMOTE_EVENT_LOG_DIR"$' ]]; then tar -C '"$REMOTE_EVENT_LOG_DIR"$' -czf - . | base64 | tr -d "\\n"; fi'
    event_log_artifacts_b64="$(run_railway_capture "fetch $RAILWAY_ENVIRONMENT event-log maintenance artifacts" "" "$event_log_artifact_script")"
    extract_remote_artifacts "$event_log_artifacts_b64" "$ROOT_DIR/build/event-log"

    event_log_status_script=$'set -euo pipefail\ncat '"$REMOTE_STATUS_FILE"$'\nrm -f '"$REMOTE_STATUS_FILE"$'\nrm -rf '"$REMOTE_EVENT_LOG_DIR"
    event_log_status="$(run_railway_capture "fetch $RAILWAY_ENVIRONMENT event-log maintenance status" "" "$event_log_status_script")"
    if [[ "${event_log_status:-1}" != "0" ]]; then
      exit "${event_log_status:-1}"
    fi
    ;;
esac

echo "$RAILWAY_ENVIRONMENT db ops $operation passed"
