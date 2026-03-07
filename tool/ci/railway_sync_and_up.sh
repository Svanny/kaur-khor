#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SERVICE_ROOT="$ROOT_DIR/apps/api"
CONFIG_DIR="${RAILWAY_SYNC_CONFIG_DIR:-$ROOT_DIR/config/env}"
DEBUG_PREFIX="[railway-debug]"
DEBUG_RAILWAY_LOG_TAIL_LINES=120
DEPLOY_STATUS_POLL_INTERVAL_SECONDS=5
DEPLOY_STATUS_POLL_MAX_ATTEMPTS=60
RAILWAY_LAST_OUTPUT=""
SECRET_REDACTIONS=()
CONFIG_KEYS=()
CONFIG_VALUES=()

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

load_config_env_file() {
  local file="$1"
  local line key value

  if [[ ! -f "$file" ]]; then
    echo "error: runtime config file not found: $file" >&2
    exit 1
  fi

  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" ]] && continue
    [[ "$line" =~ ^# ]] && continue

    if [[ "$line" != *=* ]]; then
      echo "error: invalid runtime config line '$line' in $file" >&2
      exit 1
    fi

    key="${line%%=*}"
    value="${line#*=}"

    if [[ ! "$key" =~ ^[A-Z0-9_]+$ ]]; then
      echo "error: invalid runtime config key '$key' in $file" >&2
      exit 1
    fi

    CONFIG_KEYS+=("$key")
    CONFIG_VALUES+=("$value")
  done <"$file"
}

config_var_visible() {
  local key="$1"
  local idx
  for idx in "${!CONFIG_KEYS[@]}"; do
    if [[ "${CONFIG_KEYS[$idx]}" == "$key" ]]; then
      return 0
    fi
  done

  return 1
}

config_var_value() {
  local key="$1"
  local idx
  for idx in "${!CONFIG_KEYS[@]}"; do
    if [[ "${CONFIG_KEYS[$idx]}" == "$key" ]]; then
      printf '%s' "${CONFIG_VALUES[$idx]}"
      return 0
    fi
  done

  return 1
}

require_config_var() {
  local key="$1"

  if ! config_var_visible "$key"; then
    echo "error: runtime config '$key' is missing from $CONFIG_FILE" >&2
    exit 1
  fi
}

set_exact_var_from_config() {
  local key="$1"
  local value

  require_config_var "$key"
  value="$(config_var_value "$key")"
  printf -v "$key" '%s' "$value"
  export "$key"
}

append_exact_vars_from_config() {
  local key
  for key in "$@"; do
    set_exact_var_from_config "$key"
    managed_exact+=("$key")
  done
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

fetch_latest_deployment_payload() {
  run_railway "fetch latest deployment status" deployment list --json --limit 1 --service "$RAILWAY_SERVICE_ID"
  debug_json_summary "deployment payload" "$RAILWAY_LAST_OUTPUT"
}

latest_deployment_id_from_payload() {
  local payload="$1"
  printf '%s' "$payload" | jq -r '
    def latest:
      if type == "array" then
        .[0]
      elif type == "object" and has("deployments") then
        .deployments[0]
      elif type == "object" and has("data") then
        .data[0]
      else
        .
      end;
    (latest | .id // .deploymentId // .deployment_id // "")
  '
}

latest_deployment_status_from_payload() {
  local payload="$1"
  printf '%s' "$payload" | jq -r '
    def latest:
      if type == "array" then
        .[0]
      elif type == "object" and has("deployments") then
        .deployments[0]
      elif type == "object" and has("data") then
        .data[0]
      else
        .
      end;
    (latest | .status // .state // "")
  '
}

poll_latest_deployment_status() {
  local baseline_id="$1"
  local attempt=1
  local payload=""
  local latest_id=""
  local latest_status=""
  local latest_status_upper=""

  while (( attempt <= DEPLOY_STATUS_POLL_MAX_ATTEMPTS )); do
    fetch_latest_deployment_payload
    payload="$RAILWAY_LAST_OUTPUT"
    latest_id="$(latest_deployment_id_from_payload "$payload")"
    latest_status="$(latest_deployment_status_from_payload "$payload")"
    latest_status_upper="$(printf '%s' "$latest_status" | tr '[:lower:]' '[:upper:]')"

    debug_log "poll deployment status attempt=${attempt}/${DEPLOY_STATUS_POLL_MAX_ATTEMPTS} latest_id=${latest_id:-none} latest_status=${latest_status:-none} baseline_id=${baseline_id:-none}"

    if [[ -z "$latest_id" && -z "$baseline_id" ]]; then
      debug_log "latest deployment payload did not expose deployment IDs; cannot prove freshness yet"
    elif [[ -n "$latest_id" && "$latest_id" != "$baseline_id" ]]; then
      case "$latest_status_upper" in
        SUCCESS|FAILED|CRASHED|REMOVED)
          printf '%s\t%s' "$latest_id" "$latest_status"
          return 0
          ;;
      esac
    fi

    if (( attempt < DEPLOY_STATUS_POLL_MAX_ATTEMPTS )); then
      sleep "$DEPLOY_STATUS_POLL_INTERVAL_SECONDS"
    fi
    attempt=$((attempt + 1))
  done

  printf '%s\t%s' "$latest_id" "$latest_status"
  return 1
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
)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "error: $name is required" >&2
    exit 1
  fi
done

require_auth_token
add_secret_redaction "${RAILWAY_API_TOKEN:-}"

CONFIG_FILE="$CONFIG_DIR/${RAILWAY_ENVIRONMENT}.env"
load_config_env_file "$CONFIG_FILE"

if [[ ! "$COMMIT_SHA" =~ ^[0-9a-f]{7,40}$ ]]; then
  echo "error: COMMIT_SHA must be a git sha" >&2
  exit 1
fi

if [[ ! "$MIGRATION_CHECKSUM" =~ ^[a-f0-9]{64}$ ]]; then
  echo "error: MIGRATION_CHECKSUM must be a sha256 hex digest" >&2
  exit 1
fi

DEPLOY_COMMIT_SHA="$COMMIT_SHA"
DEPLOY_MIGRATION_CHECKSUM="$MIGRATION_CHECKSUM"
DEPLOY_RUN_ID="${DEPLOY_RUN_ID:-${GITHUB_RUN_ID:-manual}-${GITHUB_RUN_ATTEMPT:-1}}"

require_secret_var() {
  local key="$1"
  if [[ -z "${!key:-}" ]]; then
    echo "error: $key is required for EXPECTED_APP_ROLE=$EXPECTED_APP_ROLE" >&2
    exit 1
  fi
}

canonicalize_optional_otel_headers_secret() {
  if [[ -n "${OTEL_EXPORTER_OTLP_HEADERS:-}" && -n "${OTEL_HEADERS:-}" && "$OTEL_EXPORTER_OTLP_HEADERS" != "$OTEL_HEADERS" ]]; then
    echo "error: OTEL_EXPORTER_OTLP_HEADERS and OTEL_HEADERS disagree; provide only the canonical key" >&2
    exit 1
  fi

  if [[ -z "${OTEL_EXPORTER_OTLP_HEADERS:-}" && -n "${OTEL_HEADERS:-}" ]]; then
    OTEL_EXPORTER_OTLP_HEADERS="$OTEL_HEADERS"
    export OTEL_EXPORTER_OTLP_HEADERS
  fi
}

forbid_local_var() {
  local key="$1"
  if [[ -n "${!key:-}" ]]; then
    echo "error: $key must not be provided for EXPECTED_APP_ROLE=$EXPECTED_APP_ROLE" >&2
    exit 1
  fi
}

canonicalize_optional_otel_headers_secret

managed_exact=(
  DEPLOY_COMMIT_SHA
  DEPLOY_MIGRATION_CHECKSUM
  DEPLOY_RUN_ID
)
managed_secret=()
managed_optional_secret=(
  OTEL_EXPORTER_OTLP_HEADERS
)
forbidden_runtime=()
managed_exact_common=(
  BANJI_SYSTEM
  BANJI_ENV
  BANJI_REGION
  BANJI_TENANT
  DATABASE_RUNTIME_ENDPOINT_KIND
  PGBOUNCER_POOL_MODE
  IDEMPOTENCY_RETENTION_DAYS
  SQLX_POOL_MAX_CONNECTIONS
  SQLX_POOL_MIN_CONNECTIONS
  SQLX_POOL_ACQUIRE_TIMEOUT_MS
  SQLX_POOL_CONNECT_TIMEOUT_MS
  SQLX_POOL_IDLE_TIMEOUT_SECONDS
  SQLX_POOL_MAX_LIFETIME_SECONDS
  POSTGRES_CONNECTION_BUDGET_TOTAL
  CACHE_ENABLED
  CACHE_SCHEMA_VERSION
  CACHE_DEFAULT_TTL_SECONDS
  CACHE_TTL_JITTER_SECONDS
  REDIS_CONNECT_TIMEOUT_MS
  REDIS_COMMAND_TIMEOUT_MS
  REDIS_CIRCUIT_ERROR_THRESHOLD
  REDIS_CIRCUIT_WINDOW_SECONDS
  REDIS_CIRCUIT_COOLDOWN_SECONDS
  REDIS_LOG_RATE_LIMIT_SECONDS
  EVENT_PAYLOAD_MAX_BYTES
  OBSERVABILITY_RABBIT_QUEUE_POLL_INTERVAL_MS
  OBSERVABILITY_POSTGRES_LOCK_POLL_INTERVAL_MS
  OBSERVABILITY_JOB_PRESSURE_POLL_INTERVAL_MS
  OTEL_ENABLED
  OTEL_EXPORTER_OTLP_ENDPOINT
  OTEL_SERVICE_NAME
  OTEL_RESOURCE_ATTRIBUTES
  OTEL_TRACES_SAMPLER
  OTEL_TRACES_SAMPLER_ARG
  OTEL_METRIC_EXPORT_INTERVAL
)
managed_exact_api=(
  AUTH_ENABLED
  AUTH_JWKS_CACHE_TTL_SECONDS
  AUTH_JWKS_TIMEOUT_MS
  AUTH_CLOCK_SKEW_SECONDS
  EDGE_ENFORCEMENT_ENABLED
  EDGE_ORIGIN_AUTH_HEADER_NAME
  EDGE_RATE_LIMIT_ENABLED
  EDGE_RATE_LIMIT_WINDOW_SECONDS
  EDGE_RATE_LIMIT_READ_MAX
  EDGE_RATE_LIMIT_USER_READ_MAX
  EDGE_RATE_LIMIT_USER_WRITE_MAX
  EDGE_RATE_LIMIT_DEVICE_READ_MAX
  EDGE_RATE_LIMIT_DEVICE_WRITE_MAX
  EDGE_RATE_LIMIT_FALLBACK_MAX_KEYS
  EDGE_RATE_LIMIT_KEY_TTL_SECONDS
  EDGE_RATE_LIMIT_REDIS_PREFIX
  EDGE_RATE_LIMIT_FAILOVER_ENABLED
  EDGE_BACKPRESSURE_ENABLED
  EDGE_BACKPRESSURE_POLL_INTERVAL_MS
  EDGE_BACKPRESSURE_RETRY_AFTER_SECONDS
  EDGE_BACKPRESSURE_CONSECUTIVE_UNHEALTHY
  EDGE_BACKPRESSURE_CONSECUTIVE_HEALTHY
  EDGE_BACKPRESSURE_JOB_OUTBOX_PENDING_MAX
  EDGE_BACKPRESSURE_JOB_OUTBOX_OLDEST_AGE_SECONDS_MAX
  EDGE_BACKPRESSURE_JOB_RUN_PENDING_MAX
  EDGE_BACKPRESSURE_JOB_RUN_OLDEST_AGE_SECONDS_MAX
  EDGE_BACKPRESSURE_KAFKA_PENDING_MAX
  EDGE_BACKPRESSURE_KAFKA_OLDEST_AGE_SECONDS_MAX
  EDGE_REQUEST_MAX_BYTES
  EDGE_WRITE_REQUEST_MAX_BYTES
  EDGE_CORS_ALLOWED_ORIGINS
  EDGE_TRUST_FORWARDED_CLIENT_IP
)
managed_exact_event_relay=(
  EVENT_RELAY_BATCH_SIZE
  EVENT_RELAY_POLL_INTERVAL_MS
  EVENT_RELAY_RETRY_BACKOFF_MS
  EVENT_RELAY_MAX_BACKOFF_MS
  EVENT_RELAY_BLOCK_AFTER_ATTEMPTS
  EVENT_OUTBOX_PUBLISHED_RETENTION_DAYS
  EVENT_LOG_RETENTION_DAYS
  EVENT_LOG_PRUNE_BATCH_SIZE
  EVENT_LOG_REPLAY_BATCH_SIZE
  EVENT_LOG_ARCHIVE_PREFIX
  EVENT_LOG_ARCHIVE_RETENTION_DAYS
  EVENT_LOG_ARCHIVE_ENCRYPTION_REQUIRED
)
managed_exact_projection_consumer=(
  EVENT_CONSUMER_SERVICE_NAME
  EVENT_CONSUMER_NAME
  EVENT_CONSUMER_STREAM_NAME
  EVENT_CONSUMER_BATCH_SIZE
  EVENT_CONSUMER_POLL_INTERVAL_MS
  EVENT_CONSUMER_INVALID_POLICY
  EVENT_CONSUMER_RUN_MODE
  EVENT_CONSUMER_REPLAY_FROM_ID
  EVENT_CONSUMER_REPLAY_TO_ID
  EVENT_CONSUMER_REPLAY_RESET_CHECKPOINT
  EVENT_CONSUMER_REPLAY_TRUNCATE_PROJECTION
  EVENT_LOG_RETENTION_DAYS
  EVENT_LOG_PRUNE_BATCH_SIZE
  EVENT_LOG_REPLAY_BATCH_SIZE
  EVENT_LOG_ARCHIVE_PREFIX
  EVENT_LOG_ARCHIVE_RETENTION_DAYS
  EVENT_LOG_ARCHIVE_ENCRYPTION_REQUIRED
)
managed_exact_worker=(
  RABBIT_VHOST
  RABBIT_EXCHANGE_JOBS
  RABBIT_EXCHANGE_JOBS_REPLAY
  RABBIT_DLX_EXCHANGE
  RABBIT_RETRY_1_TTL_MS
  RABBIT_RETRY_2_TTL_MS
  RABBIT_RETRY_3_TTL_MS
  RABBIT_PREFETCH_FAST
  RABBIT_PREFETCH_HEAVY
  RABBIT_REPLAY_PREFETCH_FAST
  RABBIT_REPLAY_PREFETCH_HEAVY
  RABBIT_MAX_ATTEMPTS
  RABBIT_REPLAY_MAX_MESSAGES
  RABBIT_REPLAY_RATE_PER_MIN
  RABBIT_REPLAY_RETAIN_ATTEMPT
  RABBIT_REPLAY_TARGET_EXCHANGE
  RABBIT_REPLAY_TARGET_ROUTING_KEY
  WORKER_ID
  WORKER_ENABLED_CLASSES
  WORKER_POLL_INTERVAL_MS
  WORKER_SHUTDOWN_GRACE_SECONDS
  JOB_ATTEMPT_LEASE_SECONDS
  JOB_ATTEMPT_HEARTBEAT_SECONDS
  JOB_HANDLER_MAX_RUNTIME_SECONDS
  JOB_RESULT_KAFKA_ENABLED
  JOB_RESULT_KAFKA_TOPIC_PREFIX
  WORKER_CONSUME_REPLAY_QUEUES
  WORKER_JOB_RELAY_BATCH_SIZE
  OBJECT_STORAGE_ENABLED
  OBJECT_STORAGE_ENDPOINT
  OBJECT_STORAGE_REGION
  OBJECT_STORAGE_BUCKET_ARTIFACTS
  OBJECT_STORAGE_FORCE_PATH_STYLE
  OBJECT_STORAGE_ARTIFACT_PREFIX
  OBJECT_STORAGE_ARTIFACT_RETENTION_DAYS
  OBJECT_STORAGE_CONNECT_TIMEOUT_MS
  OBJECT_STORAGE_REQUEST_TIMEOUT_MS
  OBJECT_STORAGE_MAX_ARTIFACT_BYTES
  ARTIFACT_TMP_DIR
  ALGORITHM_ROLLOUT_HASH_SALT_VERSION
)

case "$EXPECTED_APP_ROLE" in
  api)
    require_secret_var DATABASE_RUNTIME_URL
    require_secret_var EDGE_ORIGIN_AUTH_SECRET
    require_secret_var AUTH_JWKS_URL
    require_secret_var AUTH_ISSUER
    require_secret_var AUTH_AUDIENCE
    forbid_local_var OBJECT_STORAGE_ENDPOINT
    forbid_local_var OBJECT_STORAGE_ACCESS_KEY
    forbid_local_var OBJECT_STORAGE_SECRET_KEY
    managed_secret+=(
      DATABASE_RUNTIME_URL
      EDGE_ORIGIN_AUTH_SECRET
      AUTH_JWKS_URL
      AUTH_ISSUER
      AUTH_AUDIENCE
    )
    forbidden_runtime+=(
      OBJECT_STORAGE_ENDPOINT
      OBJECT_STORAGE_ACCESS_KEY
      OBJECT_STORAGE_SECRET_KEY
    )
    ;;
  event-relay)
    require_secret_var DATABASE_RUNTIME_URL
    for key in "${managed_exact_api[@]}"; do
      forbid_local_var "$key"
    done
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
      "${managed_exact_api[@]}"
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
    require_secret_var DATABASE_RUNTIME_URL
    for key in "${managed_exact_api[@]}"; do
      forbid_local_var "$key"
    done
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
      "${managed_exact_api[@]}"
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
    require_secret_var DATABASE_RUNTIME_URL
    require_secret_var RABBIT_URL
    require_secret_var OBJECT_STORAGE_ACCESS_KEY
    require_secret_var OBJECT_STORAGE_SECRET_KEY
    require_secret_var ALGORITHM_ROLLOUT_HASH_SALT
    for key in "${managed_exact_api[@]}"; do
      forbid_local_var "$key"
    done
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
    forbidden_runtime+=(
      "${managed_exact_api[@]}"
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

forbidden_runtime+=(
  OTEL_HEADERS
  OTEL_METRICS_EXPORT_INTERVAL
)

APP_ROLE="$EXPECTED_APP_ROLE"
BANJI_SERVICE="$EXPECTED_BANJI_SERVICE"
BANJI_DEPLOYMENT_ID="$DEPLOY_RUN_ID"
managed_exact+=(APP_ROLE BANJI_SERVICE)
managed_exact+=(BANJI_DEPLOYMENT_ID)
append_exact_vars_from_config "${managed_exact_common[@]}"

if [[ "$DATABASE_RUNTIME_ENDPOINT_KIND" != "pgbouncer" ]]; then
  echo "error: DATABASE_RUNTIME_ENDPOINT_KIND must be pgbouncer for deploy targets" >&2
  exit 1
fi

if [[ "$PGBOUNCER_POOL_MODE" != "transaction" ]]; then
  echo "error: PGBOUNCER_POOL_MODE must be transaction for deploy targets" >&2
  exit 1
fi

case "$EXPECTED_APP_ROLE" in
  api)
    append_exact_vars_from_config "${managed_exact_api[@]}"
    ;;
  event-relay)
    append_exact_vars_from_config "${managed_exact_event_relay[@]}"
    ;;
  projection-consumer)
    append_exact_vars_from_config "${managed_exact_projection_consumer[@]}"
    ;;
  worker)
    append_exact_vars_from_config "${managed_exact_worker[@]}"
    ;;
esac

for key in "${managed_secret[@]}"; do
  add_secret_redaction "${!key:-}"
done
for key in "${managed_optional_secret[@]}"; do
  add_secret_redaction "${!key:-}"
done
add_secret_redaction "${OTEL_HEADERS:-}"

if debug_enabled; then
  debug_auth_context
  debug_log "managed_exact_keys=$(IFS=,; printf '%s' "${managed_exact[*]}")"
  debug_log "managed_secret_keys=$(IFS=,; printf '%s' "${managed_secret[*]}")"
  debug_log "managed_optional_secret_keys=$(IFS=,; printf '%s' "${managed_optional_secret[*]}")"
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

delete_runtime_var() {
  local key="$1"
  run_railway "delete runtime var $key" variable delete "$key" --skip-deploys --service "$RAILWAY_SERVICE_ID"
}

for key in "${managed_exact[@]}"; do
  if [[ -n "${!key}" ]]; then
    set_runtime_var "$key"
  else
    debug_log "skip set for exact runtime var '$key' because config value is empty; enforcing absence instead"
  fi
done

if [[ ${#managed_secret[@]} -gt 0 ]]; then
  for key in "${managed_secret[@]}"; do
    set_runtime_var "$key"
  done
fi

if [[ ${#managed_optional_secret[@]} -gt 0 ]]; then
  for key in "${managed_optional_secret[@]}"; do
    if [[ -n "${!key:-}" ]]; then
      set_runtime_var "$key"
    else
      debug_log "skip set for optional runtime secret '$key' because no value was provided; enforcing absence instead"
    fi
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

refresh_runtime_vars_needed=0
for key in "${managed_exact[@]}"; do
  if [[ -z "${!key}" ]] && runtime_var_visible "$key"; then
    delete_runtime_var "$key"
    refresh_runtime_vars_needed=1
  fi
done

for key in "${managed_optional_secret[@]}"; do
  if [[ -z "${!key:-}" ]] && runtime_var_visible "$key"; then
    delete_runtime_var "$key"
    refresh_runtime_vars_needed=1
  fi
done

for key in "${forbidden_runtime[@]}"; do
  if runtime_var_visible "$key"; then
    delete_runtime_var "$key"
    refresh_runtime_vars_needed=1
  fi
done

if (( refresh_runtime_vars_needed )); then
  run_railway "refresh runtime variables after cleanup" variable list --json --service "$RAILWAY_SERVICE_ID"
  runtime_vars_json="$RAILWAY_LAST_OUTPUT"
  debug_json_summary "runtime variables payload after cleanup" "$runtime_vars_json"
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
  debug_json_summary "normalized runtime variables payload after cleanup" "$runtime_vars_json"
fi

for key in "${managed_exact[@]}"; do
  if [[ -n "${!key}" ]]; then
    assert_runtime_var_equals "$key" "${!key}"
  else
    assert_runtime_var_absent_if_visible "$key"
  fi
done

for key in "${managed_optional_secret[@]}"; do
  if [[ -n "${!key:-}" ]]; then
    assert_runtime_var_equals "$key" "${!key}"
  else
    assert_runtime_var_absent_if_visible "$key"
  fi
done

for key in "${forbidden_runtime[@]}"; do
  assert_runtime_var_absent_if_visible "$key"
done

fetch_latest_deployment_payload
baseline_deployment_json="$RAILWAY_LAST_OUTPUT"
baseline_deployment_id="$(latest_deployment_id_from_payload "$baseline_deployment_json")"
baseline_deployment_status="$(latest_deployment_status_from_payload "$baseline_deployment_json")"
debug_log "baseline latest deployment id=${baseline_deployment_id:-none} status=${baseline_deployment_status:-none}"

up_args=(up "$SERVICE_ROOT" --path-as-root --service "$RAILWAY_SERVICE_ID" --detach)
if debug_enabled; then
  up_args+=(--verbose)
fi

if ! run_railway_with_debug_success_output "deploy service via source upload" "${up_args[@]}"; then
  emit_debug_recent_railway_logs
  exit 1
fi

debug_log "begin: poll latest deployment to terminal state"
poll_result=""
if ! poll_result="$(poll_latest_deployment_status "$baseline_deployment_id")"; then
  deployment_id="${poll_result%%$'\t'*}"
  deployment_status="${poll_result#*$'\t'}"
  echo "error: latest Railway deployment for service $RAILWAY_SERVICE_ID did not reach terminal state within $((DEPLOY_STATUS_POLL_INTERVAL_SECONDS * DEPLOY_STATUS_POLL_MAX_ATTEMPTS)) seconds" >&2
  if [[ -n "$deployment_id" ]]; then
    echo "error: latest observed deployment id was '$deployment_id' with status '${deployment_status:-unknown}'" >&2
  elif [[ -n "$deployment_status" ]]; then
    echo "error: latest observed deployment status was '${deployment_status:-unknown}', but Railway did not expose deployment IDs to prove freshness" >&2
  fi
  emit_debug_recent_railway_logs
  exit 1
fi

deployment_id="${poll_result%%$'\t'*}"
deployment_status="${poll_result#*$'\t'}"
deployment_status_upper="$(printf '%s' "$deployment_status" | tr '[:lower:]' '[:upper:]')"
if [[ "$deployment_status_upper" != "SUCCESS" ]]; then
  if [[ -n "$deployment_id" ]]; then
    echo "error: latest Railway deployment for service $RAILWAY_SERVICE_ID ($deployment_id) is '$deployment_status'" >&2
  else
    echo "error: latest Railway deployment for service $RAILWAY_SERVICE_ID is '$deployment_status'" >&2
  fi
  emit_debug_recent_railway_logs
  exit 1
fi

debug_log "pass: terminal deployment id=${deployment_id:-none} status=$deployment_status"
echo "railway sync + up passed for $EXPECTED_APP_ROLE"
