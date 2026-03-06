#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SERVICE_ROOT="$ROOT_DIR/apps/api"
DEBUG_PREFIX="[railway-debug]"
DEBUG_RAILWAY_LOG_TAIL_LINES=120
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
    debug_log "auth source=api service_id=$RAILWAY_SERVICE_ID env=$RAILWAY_ENVIRONMENT app_role=$EXPECTED_APP_ROLE run_id=$DEPLOY_RUN_ID"
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

run_railway_with_debug_success_output() {
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
    sanitized_output="$(sanitize_output "$output")"
    if debug_enabled; then
      debug_log "success: $label"
      if [[ -n "$sanitized_output" ]]; then
        printf '%s\n' "$sanitized_output" >&2
      fi
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

run_railway_with_stdin() {
  local label="$1"
  local stdin_payload="$2"
  shift 2

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

  if output="$(printf '%s' "$stdin_payload" | railway "$@" 2>&1)"; then
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

emit_debug_railway_log_tail() {
  local kind="$1"
  local output=""
  local rc=0
  local sanitized_output
  local label="fetch latest Railway ${kind} logs"

  if ! debug_enabled; then
    return 0
  fi

  debug_log "begin: $label"
  debug_log "cmd: railway logs --${kind} --latest --lines ${DEBUG_RAILWAY_LOG_TAIL_LINES} --service ${RAILWAY_SERVICE_ID}"

  if output="$(railway logs "--${kind}" --latest --lines "$DEBUG_RAILWAY_LOG_TAIL_LINES" --service "$RAILWAY_SERVICE_ID" 2>&1)"; then
    sanitized_output="$(sanitize_output "$output")"
    debug_log "success: $label"
    if [[ -n "$sanitized_output" ]]; then
      debug_log "latest Railway ${kind} log tail (${DEBUG_RAILWAY_LOG_TAIL_LINES} lines max) follows"
      printf '%s\n' "$sanitized_output" >&2
      debug_log "end latest Railway ${kind} log tail"
    else
      debug_log "latest Railway ${kind} log tail was empty"
    fi
    return 0
  else
    rc=$?
  fi

  sanitized_output="$(sanitize_output "$output")"
  debug_log "failed: $label (exit $rc)"
  if [[ -n "$sanitized_output" ]]; then
    printf '%s\n' "$sanitized_output" >&2
  fi
  return 0
}

emit_debug_recent_railway_logs() {
  if ! debug_enabled; then
    return 0
  fi

  emit_debug_railway_log_tail build
  emit_debug_railway_log_tail deployment
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
  RAILWAY_SERVICE_ID
  COMMIT_SHA
  MIGRATION_CHECKSUM
  EXPECTED_APP_ROLE
  EXPECTED_BANJI_SERVICE
  DATABASE_RUNTIME_ENDPOINT_KIND
  PGBOUNCER_POOL_MODE
)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "error: $name is required" >&2
    exit 1
  fi
done

require_auth_token
add_secret_redaction "${RAILWAY_API_TOKEN:-}"

if [[ ! "$COMMIT_SHA" =~ ^[0-9a-f]{7,40}$ ]]; then
  echo "error: COMMIT_SHA must be a git sha" >&2
  exit 1
fi

if [[ ! "$MIGRATION_CHECKSUM" =~ ^[a-f0-9]{64}$ ]]; then
  echo "error: MIGRATION_CHECKSUM must be a sha256 hex digest" >&2
  exit 1
fi

if [[ "$DATABASE_RUNTIME_ENDPOINT_KIND" != "pgbouncer" ]]; then
  echo "error: DATABASE_RUNTIME_ENDPOINT_KIND must be pgbouncer for deploy targets" >&2
  exit 1
fi

if [[ "$PGBOUNCER_POOL_MODE" != "transaction" ]]; then
  echo "error: PGBOUNCER_POOL_MODE must be transaction for deploy targets" >&2
  exit 1
fi

DEPLOY_COMMIT_SHA="$COMMIT_SHA"
DEPLOY_MIGRATION_CHECKSUM="$MIGRATION_CHECKSUM"
DEPLOY_RUN_ID="${DEPLOY_RUN_ID:-${GITHUB_RUN_ID:-manual}-${GITHUB_RUN_ATTEMPT:-1}}"

require_local_var() {
  local key="$1"
  if [[ -z "${!key:-}" ]]; then
    echo "error: $key is required for EXPECTED_APP_ROLE=$EXPECTED_APP_ROLE" >&2
    exit 1
  fi
}

forbid_local_var() {
  local key="$1"
  if [[ -n "${!key:-}" ]]; then
    echo "error: $key must not be provided for EXPECTED_APP_ROLE=$EXPECTED_APP_ROLE" >&2
    exit 1
  fi
}

managed_exact=(
  DEPLOY_COMMIT_SHA
  DEPLOY_MIGRATION_CHECKSUM
  DEPLOY_RUN_ID
  DATABASE_RUNTIME_ENDPOINT_KIND
  PGBOUNCER_POOL_MODE
)
managed_secret=()
forbidden_runtime=()

case "$EXPECTED_APP_ROLE" in
  api)
    require_local_var EDGE_ENFORCEMENT_ENABLED
    require_local_var EDGE_ORIGIN_AUTH_HEADER_NAME
    require_local_var EDGE_ORIGIN_AUTH_SECRET
    require_local_var EDGE_CORS_ALLOWED_ORIGINS
    require_local_var AUTH_ENABLED
    require_local_var AUTH_JWKS_URL
    require_local_var AUTH_ISSUER
    require_local_var AUTH_AUDIENCE
    forbid_local_var OBJECT_STORAGE_ENDPOINT
    forbid_local_var OBJECT_STORAGE_ACCESS_KEY
    forbid_local_var OBJECT_STORAGE_SECRET_KEY
    managed_exact+=(
      EDGE_ENFORCEMENT_ENABLED
      EDGE_ORIGIN_AUTH_HEADER_NAME
      EDGE_CORS_ALLOWED_ORIGINS
      AUTH_ENABLED
      AUTH_JWKS_URL
      AUTH_ISSUER
      AUTH_AUDIENCE
    )
    managed_secret+=(EDGE_ORIGIN_AUTH_SECRET)
    forbidden_runtime+=(
      OBJECT_STORAGE_ENDPOINT
      OBJECT_STORAGE_ACCESS_KEY
      OBJECT_STORAGE_SECRET_KEY
    )
    ;;
  event-relay)
    require_local_var DATABASE_RUNTIME_URL
    forbid_local_var RABBIT_URL
    forbid_local_var OBJECT_STORAGE_ENDPOINT
    forbid_local_var OBJECT_STORAGE_ACCESS_KEY
    forbid_local_var OBJECT_STORAGE_SECRET_KEY
    forbid_local_var AUTH_JWKS_URL
    forbid_local_var AUTH_ISSUER
    forbid_local_var AUTH_AUDIENCE
    forbid_local_var EDGE_ORIGIN_AUTH_HEADER_NAME
    managed_secret+=(DATABASE_RUNTIME_URL)
    forbidden_runtime+=(
      RABBIT_URL
      OBJECT_STORAGE_ENDPOINT
      OBJECT_STORAGE_ACCESS_KEY
      OBJECT_STORAGE_SECRET_KEY
      AUTH_JWKS_URL
      AUTH_ISSUER
      AUTH_AUDIENCE
      EDGE_ORIGIN_AUTH_HEADER_NAME
    )
    ;;
  projection-consumer)
    require_local_var DATABASE_RUNTIME_URL
    require_local_var EVENT_CONSUMER_SERVICE_NAME
    require_local_var EVENT_CONSUMER_NAME
    require_local_var EVENT_CONSUMER_STREAM_NAME
    forbid_local_var RABBIT_URL
    forbid_local_var OBJECT_STORAGE_ENDPOINT
    forbid_local_var OBJECT_STORAGE_ACCESS_KEY
    forbid_local_var OBJECT_STORAGE_SECRET_KEY
    forbid_local_var AUTH_JWKS_URL
    forbid_local_var AUTH_ISSUER
    forbid_local_var AUTH_AUDIENCE
    forbid_local_var EDGE_ORIGIN_AUTH_HEADER_NAME
    managed_secret+=(DATABASE_RUNTIME_URL)
    managed_exact+=(
      EVENT_CONSUMER_SERVICE_NAME
      EVENT_CONSUMER_NAME
      EVENT_CONSUMER_STREAM_NAME
    )
    forbidden_runtime+=(
      RABBIT_URL
      OBJECT_STORAGE_ENDPOINT
      OBJECT_STORAGE_ACCESS_KEY
      OBJECT_STORAGE_SECRET_KEY
      AUTH_JWKS_URL
      AUTH_ISSUER
      AUTH_AUDIENCE
      EDGE_ORIGIN_AUTH_HEADER_NAME
    )
    ;;
  worker)
    require_local_var DATABASE_RUNTIME_URL
    require_local_var RABBIT_URL
    require_local_var OBJECT_STORAGE_ENABLED
    require_local_var OBJECT_STORAGE_ENDPOINT
    require_local_var OBJECT_STORAGE_REGION
    require_local_var OBJECT_STORAGE_BUCKET_ARTIFACTS
    require_local_var OBJECT_STORAGE_ACCESS_KEY
    require_local_var OBJECT_STORAGE_SECRET_KEY
    require_local_var ALGORITHM_ROLLOUT_HASH_SALT
    require_local_var ALGORITHM_ROLLOUT_HASH_SALT_VERSION
    forbid_local_var AUTH_JWKS_URL
    forbid_local_var AUTH_ISSUER
    forbid_local_var AUTH_AUDIENCE
    forbid_local_var EDGE_ORIGIN_AUTH_HEADER_NAME
    managed_secret+=(
      DATABASE_RUNTIME_URL
      RABBIT_URL
      OBJECT_STORAGE_ACCESS_KEY
      OBJECT_STORAGE_SECRET_KEY
      ALGORITHM_ROLLOUT_HASH_SALT
    )
    managed_exact+=(
      OBJECT_STORAGE_ENABLED
      OBJECT_STORAGE_ENDPOINT
      OBJECT_STORAGE_REGION
      OBJECT_STORAGE_BUCKET_ARTIFACTS
      ALGORITHM_ROLLOUT_HASH_SALT_VERSION
    )
    forbidden_runtime+=(
      AUTH_JWKS_URL
      AUTH_ISSUER
      AUTH_AUDIENCE
      EDGE_ORIGIN_AUTH_HEADER_NAME
    )
    ;;
  *)
    echo "error: EXPECTED_APP_ROLE must be one of api, event-relay, projection-consumer, worker" >&2
    exit 1
    ;;
esac

APP_ROLE="$EXPECTED_APP_ROLE"
BANJI_SERVICE="$EXPECTED_BANJI_SERVICE"
managed_exact+=(APP_ROLE BANJI_SERVICE)

for key in "${managed_secret[@]}"; do
  add_secret_redaction "${!key:-}"
done

if debug_enabled; then
  debug_auth_context
  debug_log "managed_exact_keys=$(IFS=,; printf '%s' "${managed_exact[*]}")"
  debug_log "managed_secret_keys=$(IFS=,; printf '%s' "${managed_secret[*]}")"
  debug_log "forbidden_runtime_keys=$(IFS=,; printf '%s' "${forbidden_runtime[*]}")"
fi

TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TEMP_DIR"' EXIT
pushd "$TEMP_DIR" >/dev/null
run_railway "link project/environment/service" link --project "$RAILWAY_PROJECT_ID" --environment "$RAILWAY_ENVIRONMENT" --service "$RAILWAY_SERVICE_ID"

set_runtime_var() {
  local key="$1"
  run_railway_with_stdin "set runtime var $key" "${!key}" variable set "$key" --stdin --skip-deploys --service "$RAILWAY_SERVICE_ID"
}

for key in "${managed_exact[@]}"; do
  set_runtime_var "$key"
done

if [[ ${#managed_secret[@]} -gt 0 ]]; then
  for key in "${managed_secret[@]}"; do
    set_runtime_var "$key"
  done
fi

run_railway "list runtime variables" variable list --json --service "$RAILWAY_SERVICE_ID"
runtime_vars_json="$RAILWAY_LAST_OUTPUT"
debug_json_summary "runtime variables payload" "$runtime_vars_json"
runtime_vars_json="$(
  printf '%s' "$runtime_vars_json" | jq -c '
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
)"
debug_json_summary "normalized runtime variables payload" "$runtime_vars_json"

runtime_var_visible() {
  local key="$1"
  printf '%s' "$runtime_vars_json" | jq -e --arg key "$key" 'has($key)' >/dev/null
}

runtime_var_value() {
  local key="$1"
  printf '%s' "$runtime_vars_json" | jq -r --arg key "$key" '.[$key] // ""'
}

assert_runtime_var_equals() {
  local key="$1"
  local expected="$2"
  local actual
  if ! runtime_var_visible "$key"; then
    echo "error: Railway runtime variable '$key' is missing; refusing deploy" >&2
    exit 1
  fi

  actual="$(runtime_var_value "$key")"
  if [[ "$actual" != "$expected" ]]; then
    echo "error: Railway runtime variable '$key' mismatch (expected '$expected')" >&2
    exit 1
  fi

  debug_log "verified runtime variable '$key'"
}

assert_runtime_var_absent_if_visible() {
  local key="$1"
  local actual
  if ! runtime_var_visible "$key"; then
    debug_log "runtime variable '$key' not visible (accepted)"
    return 0
  fi

  actual="$(runtime_var_value "$key")"
  if [[ -n "$actual" ]]; then
    echo "error: Railway runtime variable '$key' must be absent for EXPECTED_APP_ROLE=$EXPECTED_APP_ROLE" >&2
    exit 1
  fi

  debug_log "runtime variable '$key' visible but empty (accepted)"
}

for key in "${managed_exact[@]}"; do
  assert_runtime_var_equals "$key" "${!key}"
done

for key in "${forbidden_runtime[@]}"; do
  assert_runtime_var_absent_if_visible "$key"
done

up_args=(up "$SERVICE_ROOT" --path-as-root --service "$RAILWAY_SERVICE_ID")
if debug_enabled; then
  up_args+=(--verbose)
fi

if ! run_railway_with_debug_success_output "deploy service via source upload" "${up_args[@]}"; then
  emit_debug_recent_railway_logs
  exit 1
fi

run_railway "fetch latest deployment status" deployment list --json --limit 1 --service "$RAILWAY_SERVICE_ID"
deployment_json="$RAILWAY_LAST_OUTPUT"
debug_json_summary "deployment payload" "$deployment_json"
deployment_status="$(
  printf '%s' "$deployment_json" | jq -r '
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
)"

deployment_status_upper="$(printf '%s' "$deployment_status" | tr '[:lower:]' '[:upper:]')"
if [[ "$deployment_status_upper" != "SUCCESS" ]]; then
  echo "error: latest Railway deployment for service $RAILWAY_SERVICE_ID is '$deployment_status'" >&2
  emit_debug_recent_railway_logs
  exit 1
fi

echo "railway sync + up passed for $EXPECTED_APP_ROLE"
