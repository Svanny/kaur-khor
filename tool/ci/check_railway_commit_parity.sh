#!/usr/bin/env bash
set -euo pipefail

DEBUG_PREFIX="[railway-debug]"
RAILWAY_LAST_OUTPUT=""
SECRET_REDACTIONS=()

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

debug_enabled() {
  is_truthy "${RAILWAY_CI_DEBUG:-0}"
}

debug_log() {
  if debug_enabled; then
    printf '%s %s\n' "$DEBUG_PREFIX" "$*" >&2
  fi
}

add_secret_redaction() {
  local value="${1:-}"
  if [[ -n "$value" ]]; then
    SECRET_REDACTIONS+=("$value")
  fi
}

sanitize_output() {
  local text="$1"
  local secret
  for secret in "${SECRET_REDACTIONS[@]}"; do
    text="${text//"$secret"/***}"
  done
  printf '%s' "$text"
}

short_fingerprint() {
  local value="$1"
  local digest=""

  if command -v sha256sum >/dev/null 2>&1; then
    digest="$(printf '%s' "$value" | sha256sum | awk '{print $1}')"
  elif command -v shasum >/dev/null 2>&1; then
    digest="$(printf '%s' "$value" | shasum -a 256 | awk '{print $1}')"
  else
    printf 'unavailable'
    return 0
  fi

  printf '%s' "${digest:0:12}"
}

debug_auth_context() {
  if [[ -n "${RAILWAY_API_TOKEN:-}" ]]; then
    debug_log "auth source=api env=$RAILWAY_ENVIRONMENT run_id=$EXPECTED_DEPLOY_RUN_ID"
    debug_log "RAILWAY_API_TOKEN len=${#RAILWAY_API_TOKEN} fingerprint=$(short_fingerprint "$RAILWAY_API_TOKEN")"
  fi
}

debug_json_summary() {
  local label="$1"
  local payload="$2"
  local summary

  if ! debug_enabled; then
    return 0
  fi

  summary="$(
    printf '%s' "$payload" | jq -r '
      if type == "array" then
        "type=array size=\(length)"
      elif type == "object" then
        "type=object keys=\((keys | join(",")))"
      else
        "type=\(type)"
      end
    ' 2>/dev/null || true
  )"

  if [[ -z "$summary" ]]; then
    debug_log "$label: invalid json payload"
    return 0
  fi

  debug_log "$label: $summary"
}

run_railway() {
  local label="$1"
  shift

  local output=""
  local rc=0
  local cmd_display="railway"
  local part
  local sanitized_output

  for part in "$@"; do
    cmd_display+=" $(printf '%q' "$part")"
  done

  if debug_enabled; then
    debug_log "begin: $label"
    debug_log "cmd: $cmd_display"
  fi

  if output="$(railway "$@" 2>&1)"; then
    RAILWAY_LAST_OUTPUT="$output"
    if debug_enabled; then
      debug_log "success: $label"
    fi
    return 0
  else
    rc=$?
    RAILWAY_LAST_OUTPUT="$output"
    sanitized_output="$(sanitize_output "$output")"

    echo "error: Railway CLI failed during '$label' (exit $rc)" >&2
    echo "error: command: $cmd_display" >&2
    if [[ -n "$sanitized_output" ]]; then
      echo "$sanitized_output" >&2
    fi
    return "$rc"
  fi
}

require_auth_token() {
  if [[ -n "${RAILWAY_TOKEN:-}" ]]; then
    echo "error: RAILWAY_TOKEN is no longer supported; use RAILWAY_API_TOKEN only" >&2
    exit 1
  fi

  if [[ -z "${RAILWAY_API_TOKEN:-}" ]]; then
    echo "error: RAILWAY_API_TOKEN is required" >&2
    exit 1
  fi
}

required=(
  RAILWAY_PROJECT_ID
  RAILWAY_ENVIRONMENT
  COMMIT_SHA
  RAILWAY_API_SERVICE_ID
  RAILWAY_EVENT_RELAY_SERVICE_ID
  RAILWAY_PROJECTION_CONSUMER_SERVICE_ID
  RAILWAY_WORKER_SERVICE_ID
)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "error: $name is required" >&2
    exit 1
  fi
done

require_auth_token
add_secret_redaction "${RAILWAY_API_TOKEN:-}"

EXPECTED_DEPLOY_RUN_ID="${DEPLOY_RUN_ID:-${GITHUB_RUN_ID:-manual}-${GITHUB_RUN_ATTEMPT:-1}}"
if debug_enabled; then
  debug_auth_context
fi

TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TEMP_DIR"' EXIT
pushd "$TEMP_DIR" >/dev/null
run_railway "link project/environment/service" link --project "$RAILWAY_PROJECT_ID" --environment "$RAILWAY_ENVIRONMENT" --service "$RAILWAY_API_SERVICE_ID"

normalize_runtime_json() {
  jq -c '
    if type == "array" then
      reduce .[] as $item (
        {};
        if ($item | type) == "object" then
          .[($item.name // $item.key // "")] = ($item.value // "")
        else
          .
        end
      )
    elif type == "object" and has("variables") then
      reduce .variables[] as $item (
        {};
        .[($item.name // $item.key // "")] = ($item.value // "")
      )
    elif type == "object" then
      with_entries(.value |= if . == null then "" else tostring end)
    else
      {}
    end
  '
}

runtime_var_value() {
  local json="$1"
  local key="$2"
  printf '%s' "$json" | jq -r --arg key "$key" '.[$key] // ""'
}

deployment_status() {
  local service_id="$1"
  local json
  run_railway "list deployment status ($service_id)" deployment list --json --limit 1 --service "$service_id"
  json="$RAILWAY_LAST_OUTPUT"
  debug_json_summary "deployment payload ($service_id)" "$json"
  printf '%s' "$json" | jq -r '
    if type == "array" then
      (.[0].status // .[0].state // "")
    elif type == "object" and has("deployments") then
      (.deployments[0].status // .deployments[0].state // "")
    elif type == "object" and has("data") then
      (.data[0].status // .data[0].state // "")
    else
      (.status // .state // "")
    end
  '
}

service_ids=(
  "$RAILWAY_API_SERVICE_ID"
  "$RAILWAY_EVENT_RELAY_SERVICE_ID"
  "$RAILWAY_PROJECTION_CONSUMER_SERVICE_ID"
  "$RAILWAY_WORKER_SERVICE_ID"
)
expected_roles=(api event-relay projection-consumer worker)

for idx in "${!service_ids[@]}"; do
  service_id="${service_ids[$idx]}"
  expected_role="${expected_roles[$idx]}"

  run_railway "list runtime variables ($service_id)" variable list --json --service "$service_id"
  runtime_json="$(printf '%s' "$RAILWAY_LAST_OUTPUT" | normalize_runtime_json)"
  debug_json_summary "normalized runtime payload ($service_id)" "$runtime_json"

  actual_role="$(runtime_var_value "$runtime_json" "APP_ROLE")"
  actual_service="$(runtime_var_value "$runtime_json" "BANJI_SERVICE")"
  actual_commit="$(runtime_var_value "$runtime_json" "DEPLOY_COMMIT_SHA")"
  actual_run_id="$(runtime_var_value "$runtime_json" "DEPLOY_RUN_ID")"
  latest_status="$(deployment_status "$service_id")"
  latest_status_upper="$(printf '%s' "$latest_status" | tr '[:lower:]' '[:upper:]')"

  if [[ "$actual_role" != "$expected_role" ]]; then
    echo "error: service $service_id APP_ROLE mismatch (expected $expected_role)" >&2
    exit 1
  fi

  if [[ "$actual_service" != "$expected_role" ]]; then
    echo "error: service $service_id BANJI_SERVICE mismatch (expected $expected_role)" >&2
    exit 1
  fi

  if [[ "$actual_commit" != "$COMMIT_SHA" ]]; then
    echo "error: service $service_id DEPLOY_COMMIT_SHA mismatch (expected $COMMIT_SHA)" >&2
    exit 1
  fi

  if [[ "$actual_run_id" != "$EXPECTED_DEPLOY_RUN_ID" ]]; then
    echo "error: service $service_id DEPLOY_RUN_ID mismatch (expected $EXPECTED_DEPLOY_RUN_ID)" >&2
    exit 1
  fi

  if [[ "$latest_status_upper" != "SUCCESS" ]]; then
    echo "error: latest Railway deployment for service $service_id is '$latest_status'" >&2
    exit 1
  fi

  debug_log "validated service parity for $service_id role=$expected_role"
done

echo "railway commit parity check passed"
