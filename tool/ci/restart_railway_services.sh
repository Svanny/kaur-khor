#!/usr/bin/env bash
set -euo pipefail

DEBUG_PREFIX="[railway-restart-debug]"
SUMMARY_PATH="${RESTART_SUMMARY_PATH:-}"
SKIPPED_PATH="${RESTART_SKIPPED_PATH:-}"
SERVICE_NAMES=()
SERVICE_IDS=()

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

is_truthy() {
  local value
  value="$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')"
  case "$value" in
    1|true|yes|on)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

debug_log() {
  if is_truthy "${RAILWAY_CI_DEBUG:-0}"; then
    printf '%s %s\n' "$DEBUG_PREFIX" "$*" >&2
  fi
}

record_summary_line() {
  local path="$1"
  local line="$2"
  if [[ -n "$path" ]]; then
    printf '%s\n' "$line" >>"$path"
  fi
}

add_service() {
  local service_name="$1"
  local env_name="$2"
  local required="$3"
  local service_id="${!env_name:-}"

  if [[ -n "$service_id" ]]; then
    SERVICE_NAMES+=("$service_name")
    SERVICE_IDS+=("$service_id")
    return 0
  fi

  if [[ "$required" == "required" ]]; then
    echo "error: $env_name is required for Railway restart maintenance" >&2
    exit 1
  fi

  echo "warning: skipping optional service '$service_name' because $env_name is unset" >&2
  record_summary_line "$SKIPPED_PATH" "$service_name"
}

run_railway() {
  local label="$1"
  shift

  local output=""
  local rc=0

  debug_log "begin: $label"
  if output="$(railway "$@" </dev/null 2>&1)"; then
    if [[ -n "$output" ]]; then
      printf '%s\n' "$output" >&2
    fi
    debug_log "pass: $label"
    return 0
  fi

  rc=$?
  echo "error: Railway CLI failed during '$label' (exit $rc)" >&2
  if [[ -n "$output" ]]; then
    printf '%s\n' "$output" >&2
  fi
  exit "$rc"
}

main() {
  require_cmd railway
  require_env RAILWAY_API_TOKEN
  require_env RAILWAY_PROJECT_ID
  require_env RAILWAY_ENVIRONMENT
  require_env RAILWAY_API_SERVICE_ID
  require_env RAILWAY_EVENT_RELAY_SERVICE_ID
  require_env RAILWAY_PROJECTION_CONSUMER_SERVICE_ID
  require_env RAILWAY_WORKER_SERVICE_ID

  if [[ -n "${RAILWAY_TOKEN:-}" ]]; then
    echo "error: RAILWAY_TOKEN is no longer supported; use RAILWAY_API_TOKEN only." >&2
    exit 1
  fi

  : >"${SUMMARY_PATH:-/dev/null}"
  : >"${SKIPPED_PATH:-/dev/null}"

  add_service "event-relay" "RAILWAY_EVENT_RELAY_SERVICE_ID" "required"
  add_service "projection-consumer" "RAILWAY_PROJECTION_CONSUMER_SERVICE_ID" "required"
  add_service "worker" "RAILWAY_WORKER_SERVICE_ID" "required"
  add_service "api" "RAILWAY_API_SERVICE_ID" "required"

  if is_truthy "${INCLUDE_FRONTEND:-1}"; then
    add_service "frontend" "RAILWAY_FRONTEND_SERVICE_ID" "optional"
  fi

  if is_truthy "${INCLUDE_KEYCLOAK:-1}"; then
    add_service "keycloak" "RAILWAY_KEYCLOAK_SERVICE_ID" "optional"
  fi

  if is_truthy "${INCLUDE_DB_OPS:-0}"; then
    add_service "db-ops" "RAILWAY_DB_OPS_SERVICE_ID" "optional"
  fi

  debug_log "service count=${#SERVICE_IDS[@]}"
  run_railway "railway whoami" whoami
  run_railway \
    "railway link project/environment/service" \
    link \
    --project "$RAILWAY_PROJECT_ID" \
    --environment "$RAILWAY_ENVIRONMENT" \
    --service "${SERVICE_IDS[0]}"

  local index=0
  for service_name in "${SERVICE_NAMES[@]}"; do
    local service_id="${SERVICE_IDS[$index]}"
    echo "Restarting '$service_name' on Railway environment '$RAILWAY_ENVIRONMENT' (service: $service_id)"
    run_railway "railway restart $service_name" restart --service "$service_id" --yes
    record_summary_line "$SUMMARY_PATH" "$service_name"
    index=$((index + 1))
  done
}

main "$@"
