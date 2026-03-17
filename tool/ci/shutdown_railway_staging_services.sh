#!/usr/bin/env bash
set -euo pipefail

DEBUG_PREFIX="[railway-shutdown-debug]"
SUMMARY_PATH="${SHUTDOWN_SUMMARY_PATH:-}"
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
  local service_id="${!env_name:-}"

  if [[ -z "$service_id" ]]; then
    echo "error: $env_name is required for staging Railway shutdown" >&2
    exit 1
  fi

  SERVICE_NAMES+=("$service_name")
  SERVICE_IDS+=("$service_id")
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

  if [[ "$RAILWAY_ENVIRONMENT" != "staging" ]]; then
    echo "error: RAILWAY_ENVIRONMENT must be 'staging' for the staging shutdown script" >&2
    exit 1
  fi

  if [[ -n "${RAILWAY_TOKEN:-}" ]]; then
    echo "error: RAILWAY_TOKEN is no longer supported; use RAILWAY_API_TOKEN only." >&2
    exit 1
  fi

  : >"${SUMMARY_PATH:-/dev/null}"

  add_service "api" "RAILWAY_STAGING_API_SERVICE_ID"
  add_service "event-relay" "RAILWAY_STAGING_EVENT_RELAY_SERVICE_ID"
  add_service "projection-consumer" "RAILWAY_STAGING_PROJECTION_CONSUMER_SERVICE_ID"
  add_service "worker" "RAILWAY_STAGING_WORKER_SERVICE_ID"
  add_service "frontend" "RAILWAY_STAGING_FRONTEND_SERVICE_ID"
  add_service "keycloak" "RAILWAY_STAGING_KEYCLOAK_SERVICE_ID"
  add_service "db-ops" "RAILWAY_STAGING_DB_OPS_SERVICE_ID"

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
    echo "Shutting down '$service_name' on Railway environment '$RAILWAY_ENVIRONMENT' (service: $service_id)"
    run_railway \
      "railway down $service_name" \
      down \
      --service "$service_id" \
      --environment "$RAILWAY_ENVIRONMENT" \
      --yes
    record_summary_line "$SUMMARY_PATH" "$service_name ($service_id)"
    index=$((index + 1))
  done
}

main "$@"
