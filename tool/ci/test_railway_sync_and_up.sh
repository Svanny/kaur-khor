#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT_DIR/tool/ci/railway_sync_and_up.sh"
TMP_DIR="$(mktemp -d)"
STATE_DIR="$TMP_DIR/state"
LOG_FILE="$TMP_DIR/commands.log"
DEBUG_LOG="$TMP_DIR/debug.log"
mkdir -p "$STATE_DIR"
trap 'rm -rf "$TMP_DIR"' EXIT

cat >"$TMP_DIR/railway" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

log_file="${MOCK_RAILWAY_LOG:?}"
state_dir="${MOCK_RAILWAY_STATE_DIR:?}"

sanitize() {
  printf '%s' "$1" | tr -c '[:alnum:]' '_'
}

service_arg() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --service)
        printf '%s' "$2"
        return 0
        ;;
      *)
        shift
        ;;
    esac
  done

  return 1
}

record() {
  printf '%s\n' "$*" >>"$log_file"
}

record_auth() {
  if [[ -n "${RAILWAY_API_TOKEN:-}" ]]; then
    record "auth api"
  else
    record "auth missing"
    exit 1
  fi
}

cmd="${1:-}"
if [[ -z "$cmd" ]]; then
  exit 1
fi
shift
record "$cmd $*"
record_auth

emit_deployment_status() {
  local service_id="$1"
  local sequence_key status_key payload_path sequence_path raw_sequence stored_sequence entry_count current_index entry deployment_id deployment_status

  sequence_key="FAKE_DEPLOYMENT_SEQUENCE_$(sanitize "$service_id")"
  if [[ -n "${!sequence_key:-}" ]]; then
    payload_path="$state_dir/deployment-count-$(sanitize "$service_id")"
    sequence_path="$state_dir/deployment-sequence-$(sanitize "$service_id")"
    raw_sequence="${!sequence_key}"
    stored_sequence=""
    if [[ -f "$sequence_path" ]]; then
      stored_sequence="$(cat "$sequence_path")"
    fi
    if [[ "$stored_sequence" != "$raw_sequence" ]]; then
      rm -f "$payload_path"
      printf '%s' "$raw_sequence" >"$sequence_path"
    fi
    IFS=';' read -r -a entries <<<"$raw_sequence"
    entry_count="${#entries[@]}"
    current_index=0
    if [[ -f "$payload_path" ]]; then
      current_index="$(cat "$payload_path")"
    fi
    if (( current_index >= entry_count )); then
      current_index=$((entry_count - 1))
    fi
    entry="${entries[$current_index]}"
    printf '%s' "$((current_index + 1))" >"$payload_path"

    deployment_id=""
    deployment_status="$entry"
    if [[ "$entry" == *:* ]]; then
      deployment_id="${entry%%:*}"
      deployment_status="${entry#*:}"
    fi
    printf '[{"id":"%s","status":"%s"}]\n' "$deployment_id" "$deployment_status"
    return 0
  fi

  status_key="FAKE_DEPLOYMENT_STATUS_$(sanitize "$service_id")"
  if [[ -n "${!status_key+x}" ]]; then
    printf '[{"status":"%s"}]\n' "${!status_key}"
  else
    printf '[{"status":"SUCCESS"}]\n'
  fi
}

case "$cmd" in
  link)
    if [[ -n "${FAKE_LINK_STDERR:-}" ]]; then
      printf '%s\n' "$FAKE_LINK_STDERR" >&2
      exit 1
    fi
    exit 0
    ;;
  variable)
    subcmd="${1:-}"
    shift
    case "$subcmd" in
      set)
        key="${1:-}"
        shift
        value="$(cat)"
        service_id="$(service_arg "$@")"
        record "stdin $service_id $key=$value"
        python3 - "$state_dir" "$service_id" "$key" "$value" <<'PY'
import json
import pathlib
import sys

state_dir = pathlib.Path(sys.argv[1])
service_id = sys.argv[2]
key = sys.argv[3]
value = sys.argv[4]
path = state_dir / f"{service_id}.json"
if path.exists():
    payload = json.loads(path.read_text())
else:
    payload = {}
payload[key] = value
path.write_text(json.dumps(payload))
PY
        exit 0
        ;;
      delete)
        key="${1:-}"
        shift
        service_id="$(service_arg "$@")"
        record "delete $service_id $key"
        python3 - "$state_dir" "$service_id" "$key" <<'PY'
import json
import pathlib
import sys

state_dir = pathlib.Path(sys.argv[1])
service_id = sys.argv[2]
key = sys.argv[3]
path = state_dir / f"{service_id}.json"
deleted_path = state_dir / f"{service_id}.deleted.json"
if path.exists():
    payload = json.loads(path.read_text())
    payload.pop(key, None)
    path.write_text(json.dumps(payload))
if deleted_path.exists():
    deleted = json.loads(deleted_path.read_text())
else:
    deleted = []
if key not in deleted:
    deleted.append(key)
deleted_path.write_text(json.dumps(deleted))
PY
        exit 0
        ;;
      list)
        service_id="$(service_arg "$@")"
        payload_key="FAKE_VARIABLE_JSON_$(sanitize "$service_id")"
        python3 - "$state_dir" "$service_id" "${!payload_key:-}" <<'PY'
import json
import pathlib
import sys

state_dir = pathlib.Path(sys.argv[1])
service_id = sys.argv[2]
path = state_dir / f"{service_id}.json"
deleted_path = state_dir / f"{service_id}.deleted.json"
extra_raw = sys.argv[3]
payload = {}
if path.exists():
    payload = json.loads(path.read_text())
if extra_raw:
    payload.update(json.loads(extra_raw))
if deleted_path.exists():
    for key in json.loads(deleted_path.read_text()):
        payload.pop(key, None)
sys.stdout.write(json.dumps(payload))
PY
        exit 0
        ;;
      *)
        exit 1
        ;;
    esac
    ;;
  up)
    if [[ -n "${FAKE_UP_STDERR:-}" ]]; then
      printf '%s\n' "$FAKE_UP_STDERR" >&2
      exit 1
    fi
    if [[ -n "${FAKE_UP_OUTPUT:-}" ]]; then
      printf '%s\n' "$FAKE_UP_OUTPUT"
    fi
    exit 0
    ;;
  logs)
    kind="unknown"
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --build)
          kind="build"
          ;;
        --deployment)
          kind="deployment"
          ;;
      esac
      shift
    done
    stderr_key="FAKE_LOGS_$(printf '%s' "$kind" | tr '[:lower:]' '[:upper:]')_STDERR"
    stdout_key="FAKE_LOGS_$(printf '%s' "$kind" | tr '[:lower:]' '[:upper:]')_OUTPUT"
    if [[ -n "${!stderr_key:-}" ]]; then
      printf '%s\n' "${!stderr_key}" >&2
      exit 1
    fi
    if [[ -n "${!stdout_key:-}" ]]; then
      printf '%s\n' "${!stdout_key}"
    fi
    exit 0
    ;;
  deployment)
    subcmd="${1:-}"
    shift
    if [[ "$subcmd" != "list" ]]; then
      exit 1
    fi
    service_id="$(service_arg "$@")"
    emit_deployment_status "$service_id"
    exit 0
    ;;
  *)
    exit 1
    ;;
esac
EOF
chmod +x "$TMP_DIR/railway"

cat >"$TMP_DIR/sleep" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf 'sleep %s\n' "$*" >>"${MOCK_RAILWAY_LOG:?}"
exit 0
EOF
chmod +x "$TMP_DIR/sleep"

CONFIG_DIR="$TMP_DIR/config/env"
mkdir -p "$CONFIG_DIR"
cp "$ROOT_DIR/config/env/staging.env" "$CONFIG_DIR/staging.env"
cp "$ROOT_DIR/config/env/prod.env" "$CONFIG_DIR/prod.env"

reset_logs() {
  rm -f "$LOG_FILE"
  : >"$LOG_FILE"
  : >"$DEBUG_LOG"
}

export PATH="$TMP_DIR:$PATH"
export MOCK_RAILWAY_LOG="$LOG_FILE"
export MOCK_RAILWAY_STATE_DIR="$STATE_DIR"
export RAILWAY_SYNC_CONFIG_DIR="$CONFIG_DIR"
export RAILWAY_API_TOKEN="token"
export RAILWAY_PROJECT_ID="project-id"
export RAILWAY_ENVIRONMENT="staging"
export COMMIT_SHA="0123456789abcdef0123456789abcdef01234567"
export MIGRATION_CHECKSUM="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
export DEPLOY_RUN_ID="9001-2"
export RAILWAY_CI_DEBUG="0"

export RAILWAY_SERVICE_ID="svc-api"
export EXPECTED_APP_ROLE="api"
export EXPECTED_BANJI_SERVICE="api"
export DATABASE_RUNTIME_URL="postgres://runtime@db.example/banji"
export EDGE_ORIGIN_AUTH_SECRET="edge-secret"
export AUTH_JWKS_URL="https://jwks.example.com"
export AUTH_ISSUER="https://issuer.example.com"
export AUTH_AUDIENCE="banji-api"
export FAKE_VARIABLE_JSON_svc_api='{"OTEL_SERVICE_NAME":"stale-api-name","OTEL_RESOURCE_ATTRIBUTES":"service.version=old"}'
export FAKE_DEPLOYMENT_SEQUENCE_svc_api="baseline-success:SUCCESS;deploy-api:SUCCESS"

bash "$SCRIPT" >/dev/null 2>"$DEBUG_LOG"

grep -q "variable set DEPLOY_COMMIT_SHA --stdin --skip-deploys --service svc-api" "$LOG_FILE"
grep -q "variable set EDGE_ORIGIN_AUTH_SECRET --stdin --skip-deploys --service svc-api" "$LOG_FILE"
grep -q "stdin svc-api BANJI_DEPLOYMENT_ID=9001-2" "$LOG_FILE"
grep -q "stdin svc-api DATABASE_RUNTIME_ENDPOINT_KIND=pgbouncer" "$LOG_FILE"
grep -q "stdin svc-api CACHE_SCHEMA_VERSION=v1" "$LOG_FILE"
grep -q "stdin svc-api EDGE_ENFORCEMENT_ENABLED=true" "$LOG_FILE"
grep -q "stdin svc-api OTEL_ENABLED=true" "$LOG_FILE"
grep -q "stdin svc-api OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317" "$LOG_FILE"
grep -q "^delete svc-api OTEL_SERVICE_NAME$" "$LOG_FILE"
grep -q "^delete svc-api OTEL_RESOURCE_ATTRIBUTES$" "$LOG_FILE"
if grep -q "stdin svc-api OTEL_SERVICE_NAME=" "$LOG_FILE"; then
  echo "assertion failed: api should delete empty OTEL_SERVICE_NAME instead of setting an empty value" >&2
  exit 1
fi
if grep -q "stdin svc-api OTEL_RESOURCE_ATTRIBUTES=" "$LOG_FILE"; then
  echo "assertion failed: api should delete empty OTEL_RESOURCE_ATTRIBUTES instead of setting an empty value" >&2
  exit 1
fi
grep -q "up $ROOT_DIR/apps/api --path-as-root --service svc-api --detach" "$LOG_FILE"
grep -q "deployment list --json --limit 1 --service svc-api" "$LOG_FILE"
grep -q "variable list --json --service svc-api" "$LOG_FILE"
grep -q "^link --project project-id --environment staging --service svc-api$" "$LOG_FILE"
grep -q "auth api" "$LOG_FILE"
if grep -q "\\[railway-debug\\]" "$DEBUG_LOG"; then
  echo "assertion failed: debug logs should not be printed when RAILWAY_CI_DEBUG=0" >&2
  exit 1
fi

if grep -q "login" "$LOG_FILE"; then
  echo "assertion failed: sync script must not run railway login" >&2
  exit 1
fi

if grep -q "variables --set" "$LOG_FILE"; then
  echo "assertion failed: sync script must use railway variable set" >&2
  exit 1
fi

if [[ "$(grep -c "^up " "$LOG_FILE")" -ne 1 ]]; then
  echo "assertion failed: expected exactly one railway up invocation for api" >&2
  exit 1
fi
if grep -q "^logs " "$LOG_FILE"; then
  echo "assertion failed: debug-off deploy should not fetch Railway logs" >&2
  exit 1
fi

reset_logs

export RAILWAY_CI_DEBUG="1"
export FAKE_VARIABLE_JSON_svc_api='{"UNMANAGED_SECRET":"raw-unmanaged-secret"}'
export FAKE_UP_OUTPUT="verbose deploy secret=edge-secret"
export FAKE_DEPLOYMENT_SEQUENCE_svc_api="baseline-success:SUCCESS;deploy-debug:BUILDING;deploy-debug:SUCCESS"
bash "$SCRIPT" >/dev/null 2>"$DEBUG_LOG"

grep -q "\\[railway-debug\\] auth source=api" "$DEBUG_LOG"
grep -Fxq "[railway-debug] begin: link project/environment/service" "$DEBUG_LOG"
grep -q "\\[railway-debug\\] begin: poll latest deployment to terminal state" "$DEBUG_LOG"
grep -q "^up $ROOT_DIR/apps/api --path-as-root --service svc-api --detach --verbose$" "$LOG_FILE"
grep -q "verbose deploy secret=\\*\\*\\*" "$DEBUG_LOG"
grep -q "^sleep 5$" "$LOG_FILE"
grep -q "pass: terminal deployment id=deploy-debug status=SUCCESS" "$DEBUG_LOG"
if grep -q "^logs " "$LOG_FILE"; then
  echo "assertion failed: successful debug deploy should not fetch Railway logs" >&2
  exit 1
fi
if grep -q "raw-unmanaged-secret" "$DEBUG_LOG"; then
  echo "assertion failed: debug output leaked unmanaged runtime variable value" >&2
  exit 1
fi

export RAILWAY_CI_DEBUG="0"
unset FAKE_VARIABLE_JSON_svc_api FAKE_UP_OUTPUT FAKE_DEPLOYMENT_SEQUENCE_svc_api

reset_logs

export RAILWAY_CI_DEBUG="1"
export FAKE_UP_STDERR="deploy failed token=token-leak-value"
export FAKE_LOGS_BUILD_OUTPUT="build log secret=edge-secret-leak"
export FAKE_LOGS_DEPLOYMENT_OUTPUT="deployment log token=token-leak-value"
export RAILWAY_API_TOKEN="token-leak-value"
export EDGE_ORIGIN_AUTH_SECRET="edge-secret-leak"
export FAKE_DEPLOYMENT_SEQUENCE_svc_api="baseline-success:SUCCESS"
if bash "$SCRIPT" >/dev/null 2>"$DEBUG_LOG"; then
  echo "assertion failed: mocked railway up failure should fail sync + up" >&2
  exit 1
fi
grep -q "^logs --build --latest --lines 120 --service svc-api$" "$LOG_FILE"
grep -q "^logs --deployment --latest --lines 120 --service svc-api$" "$LOG_FILE"
if ! grep -q "\\*\\*\\*" "$DEBUG_LOG"; then
  echo "assertion failed: expected redacted secrets in debug log tails" >&2
  exit 1
fi
if grep -q "token-leak-value" "$DEBUG_LOG"; then
  echo "assertion failed: up failure path leaked RAILWAY_API_TOKEN" >&2
  exit 1
fi
if grep -q "edge-secret-leak" "$DEBUG_LOG"; then
  echo "assertion failed: up failure path leaked managed secret" >&2
  exit 1
fi
unset FAKE_UP_STDERR FAKE_LOGS_BUILD_OUTPUT FAKE_LOGS_DEPLOYMENT_OUTPUT FAKE_DEPLOYMENT_SEQUENCE_svc_api
export RAILWAY_API_TOKEN="token"
export EDGE_ORIGIN_AUTH_SECRET="edge-secret"
export RAILWAY_CI_DEBUG="0"

reset_logs

unset RAILWAY_API_TOKEN
export RAILWAY_TOKEN="project-token"
if bash "$SCRIPT" >/dev/null 2>&1; then
  echo "assertion failed: RAILWAY_TOKEN-only auth should fail" >&2
  exit 1
fi

if [[ -s "$LOG_FILE" ]]; then
  echo "assertion failed: RAILWAY_TOKEN-only auth should fail before Railway CLI calls" >&2
  exit 1
fi

reset_logs

export RAILWAY_API_TOKEN="token"
if bash "$SCRIPT" >/dev/null 2>&1; then
  echo "assertion failed: mixed Railway auth env should fail" >&2
  exit 1
fi

if [[ -s "$LOG_FILE" ]]; then
  echo "assertion failed: mixed Railway auth env should fail before Railway CLI calls" >&2
  exit 1
fi

unset RAILWAY_TOKEN

unset EDGE_ORIGIN_AUTH_SECRET
if bash "$SCRIPT" >/dev/null 2>&1; then
  echo "assertion failed: missing api EDGE_ORIGIN_AUTH_SECRET should fail" >&2
  exit 1
fi
export EDGE_ORIGIN_AUTH_SECRET="edge-secret"
export RAILWAY_API_TOKEN="token"

if [[ -s "$LOG_FILE" ]]; then
  echo "assertion failed: api secret validation failure should happen before Railway CLI calls" >&2
  exit 1
fi

reset_logs

unset EDGE_ORIGIN_AUTH_SECRET AUTH_JWKS_URL AUTH_ISSUER AUTH_AUDIENCE
export RAILWAY_SERVICE_ID="svc-relay"
export EXPECTED_APP_ROLE="event-relay"
export EXPECTED_BANJI_SERVICE="event-relay"
export DATABASE_RUNTIME_URL="postgres://runtime@db.example/banji"
export FAKE_VARIABLE_JSON_svc_relay='{"EDGE_ENFORCEMENT_ENABLED":"true","EDGE_ORIGIN_AUTH_HEADER_NAME":"x-banji-edge-auth"}'
export FAKE_DEPLOYMENT_SEQUENCE_svc_relay="baseline-relay:SUCCESS;deploy-relay:SUCCESS"

bash "$SCRIPT" >/dev/null

grep -q "variable set DATABASE_RUNTIME_URL --stdin --skip-deploys --service svc-relay" "$LOG_FILE"
grep -q "stdin svc-relay BANJI_DEPLOYMENT_ID=9001-2" "$LOG_FILE"
grep -q "stdin svc-relay CACHE_SCHEMA_VERSION=v1" "$LOG_FILE"
grep -q "stdin svc-relay EVENT_RELAY_BATCH_SIZE=100" "$LOG_FILE"
grep -q "stdin svc-relay EVENT_LOG_RETENTION_DAYS=30" "$LOG_FILE"
grep -q "stdin svc-relay OTEL_ENABLED=true" "$LOG_FILE"
grep -q "^delete svc-relay EDGE_ENFORCEMENT_ENABLED$" "$LOG_FILE"
grep -q "^delete svc-relay EDGE_ORIGIN_AUTH_HEADER_NAME$" "$LOG_FILE"
if grep -q "stdin svc-relay EDGE_ENFORCEMENT_ENABLED=" "$LOG_FILE"; then
  echo "assertion failed: event-relay should not sync api-only edge config" >&2
  exit 1
fi
if grep -q "stdin svc-relay EDGE_ORIGIN_AUTH_HEADER_NAME=" "$LOG_FILE"; then
  echo "assertion failed: event-relay should not sync api-only edge header config" >&2
  exit 1
fi
unset FAKE_VARIABLE_JSON_svc_relay

reset_logs

export RAILWAY_SERVICE_ID="svc-projection"
export EXPECTED_APP_ROLE="projection-consumer"
export EXPECTED_BANJI_SERVICE="projection-consumer"
export DATABASE_RUNTIME_URL="postgres://runtime@db.example/banji"
export FAKE_VARIABLE_JSON_svc_projection='{"EVENT_CONSUMER_REPLAY_TO_ID":"42"}'
export FAKE_DEPLOYMENT_SEQUENCE_svc_projection="baseline-projection:SUCCESS;deploy-projection:SUCCESS"

bash "$SCRIPT" >/dev/null

grep -q "stdin svc-projection BANJI_DEPLOYMENT_ID=9001-2" "$LOG_FILE"
grep -q "stdin svc-projection CACHE_SCHEMA_VERSION=v1" "$LOG_FILE"
grep -q "stdin svc-projection EVENT_CONSUMER_SERVICE_NAME=projection-consumer" "$LOG_FILE"
grep -q "stdin svc-projection EVENT_CONSUMER_STREAM_NAME=banji-core.staging.inventory-updated" "$LOG_FILE"
grep -q "stdin svc-projection OTEL_ENABLED=true" "$LOG_FILE"
grep -q "^delete svc-projection EVENT_CONSUMER_REPLAY_TO_ID$" "$LOG_FILE"
if grep -q "stdin svc-projection EVENT_CONSUMER_REPLAY_TO_ID=" "$LOG_FILE"; then
  echo "assertion failed: projection-consumer should delete empty EVENT_CONSUMER_REPLAY_TO_ID instead of setting an empty value" >&2
  exit 1
fi
unset FAKE_VARIABLE_JSON_svc_projection

reset_logs

export RAILWAY_SERVICE_ID="svc-worker"
export EXPECTED_APP_ROLE="worker"
export EXPECTED_BANJI_SERVICE="worker"
export DATABASE_RUNTIME_URL="postgres://runtime@db.example/banji"
export RABBIT_URL="amqps://rabbit.example.com/%2f"
export OBJECT_STORAGE_ACCESS_KEY="access"
export OBJECT_STORAGE_SECRET_KEY="secret"
export ALGORITHM_ROLLOUT_HASH_SALT="salt"
export FAKE_VARIABLE_JSON_svc_worker='{"JOB_HANDLER_MAX_RUNTIME_SECONDS":"600","JOB_RESULT_KAFKA_TOPIC_PREFIX":"old-prefix"}'
export FAKE_DEPLOYMENT_SEQUENCE_svc_worker="baseline-worker:SUCCESS;deploy-worker:SUCCESS"

bash "$SCRIPT" >/dev/null

grep -q "variable set DATABASE_RUNTIME_URL --stdin --skip-deploys --service svc-worker" "$LOG_FILE"
grep -q "stdin svc-worker BANJI_DEPLOYMENT_ID=9001-2" "$LOG_FILE"
grep -q "stdin svc-worker CACHE_SCHEMA_VERSION=v1" "$LOG_FILE"
grep -q "stdin svc-worker OBJECT_STORAGE_ENDPOINT=https://storage.staging.example.com" "$LOG_FILE"
grep -q "stdin svc-worker OTEL_ENABLED=true" "$LOG_FILE"
grep -q "^delete svc-worker JOB_HANDLER_MAX_RUNTIME_SECONDS$" "$LOG_FILE"
grep -q "^delete svc-worker JOB_RESULT_KAFKA_TOPIC_PREFIX$" "$LOG_FILE"
if grep -q "stdin svc-worker JOB_HANDLER_MAX_RUNTIME_SECONDS=" "$LOG_FILE"; then
  echo "assertion failed: worker should delete empty JOB_HANDLER_MAX_RUNTIME_SECONDS instead of setting an empty value" >&2
  exit 1
fi
if grep -q "stdin svc-worker JOB_RESULT_KAFKA_TOPIC_PREFIX=" "$LOG_FILE"; then
  echo "assertion failed: worker should delete empty JOB_RESULT_KAFKA_TOPIC_PREFIX instead of setting an empty value" >&2
  exit 1
fi
grep -q "up $ROOT_DIR/apps/api --path-as-root --service svc-worker --detach" "$LOG_FILE"

reset_logs

unset RABBIT_URL
if bash "$SCRIPT" >/dev/null 2>&1; then
  echo "assertion failed: missing worker RABBIT_URL should fail" >&2
  exit 1
fi

if [[ -s "$LOG_FILE" ]]; then
  echo "assertion failed: validation failure should happen before Railway CLI calls" >&2
  exit 1
fi

export RABBIT_URL="amqps://rabbit.example.com/%2f"
unset FAKE_DEPLOYMENT_SEQUENCE_svc_worker FAKE_VARIABLE_JSON_svc_worker
BROKEN_CONFIG_DIR="$TMP_DIR/broken-config/env"
mkdir -p "$BROKEN_CONFIG_DIR"
cp "$CONFIG_DIR/prod.env" "$BROKEN_CONFIG_DIR/prod.env"
grep -v '^CACHE_SCHEMA_VERSION=' "$CONFIG_DIR/staging.env" >"$BROKEN_CONFIG_DIR/staging.env"

reset_logs

export RAILWAY_SERVICE_ID="svc-relay-missing-cache"
export EXPECTED_APP_ROLE="event-relay"
export EXPECTED_BANJI_SERVICE="event-relay"
export DATABASE_RUNTIME_URL="postgres://runtime@db.example/banji"
if RAILWAY_SYNC_CONFIG_DIR="$BROKEN_CONFIG_DIR" bash "$SCRIPT" >/dev/null 2>&1; then
  echo "assertion failed: missing CACHE_SCHEMA_VERSION in config fixture should fail" >&2
  exit 1
fi

if [[ -s "$LOG_FILE" ]]; then
  echo "assertion failed: missing runtime config should fail before Railway CLI calls" >&2
  exit 1
fi

reset_logs

export EXPECTED_APP_ROLE="api"
export EXPECTED_BANJI_SERVICE="api"
export RAILWAY_SERVICE_ID="svc-api"
export DATABASE_RUNTIME_URL="postgres://runtime@db.example/banji"
unset OBJECT_STORAGE_ACCESS_KEY OBJECT_STORAGE_SECRET_KEY ALGORITHM_ROLLOUT_HASH_SALT
export EDGE_ORIGIN_AUTH_SECRET="edge-secret"
export AUTH_JWKS_URL="https://jwks.example.com"
export AUTH_ISSUER="https://issuer.example.com"
export AUTH_AUDIENCE="banji-api"
export OBJECT_STORAGE_ENDPOINT="https://storage.example.com"

if bash "$SCRIPT" >/dev/null 2>&1; then
  echo "assertion failed: forbidden api object storage vars should fail" >&2
  exit 1
fi

unset OBJECT_STORAGE_ENDPOINT

reset_logs

export EXPECTED_APP_ROLE="api"
export EXPECTED_BANJI_SERVICE="api"
export RAILWAY_SERVICE_ID="svc-api"
export FAKE_DEPLOYMENT_SEQUENCE_svc_api="baseline-success:SUCCESS;deploy-failed:DEPLOYING;deploy-failed:FAILED"
if bash "$SCRIPT" >/dev/null 2>&1; then
  echo "assertion failed: failed deployment status should fail sync + up" >&2
  exit 1
fi
grep -q "^sleep 5$" "$LOG_FILE"
unset FAKE_DEPLOYMENT_SEQUENCE_svc_api

reset_logs

export RAILWAY_CI_DEBUG="1"
export FAKE_DEPLOYMENT_SEQUENCE_svc_api="baseline-success:SUCCESS;deploy-failed-debug:DEPLOYING;deploy-failed-debug:FAILED"
export FAKE_LOGS_BUILD_STDERR="build tail unavailable token=token-leak-value"
export FAKE_LOGS_DEPLOYMENT_STDERR="deployment tail unavailable secret=edge-secret-leak"
export RAILWAY_API_TOKEN="token-leak-value"
export EDGE_ORIGIN_AUTH_SECRET="edge-secret-leak"
if bash "$SCRIPT" >/dev/null 2>"$DEBUG_LOG"; then
  echo "assertion failed: failed deployment status should still fail in debug mode" >&2
  exit 1
fi
grep -q "^logs --build --latest --lines 120 --service svc-api$" "$LOG_FILE"
grep -q "^logs --deployment --latest --lines 120 --service svc-api$" "$LOG_FILE"
grep -q "\\[railway-debug\\] failed: fetch latest Railway build logs (exit 1)" "$DEBUG_LOG"
grep -q "\\[railway-debug\\] failed: fetch latest Railway deployment logs (exit 1)" "$DEBUG_LOG"
if grep -q "token-leak-value" "$DEBUG_LOG"; then
  echo "assertion failed: log-fetch failure path leaked RAILWAY_API_TOKEN" >&2
  exit 1
fi
if grep -q "edge-secret-leak" "$DEBUG_LOG"; then
  echo "assertion failed: log-fetch failure path leaked managed secret" >&2
  exit 1
fi
unset FAKE_DEPLOYMENT_SEQUENCE_svc_api FAKE_LOGS_BUILD_STDERR FAKE_LOGS_DEPLOYMENT_STDERR
export RAILWAY_API_TOKEN="token"
export EDGE_ORIGIN_AUTH_SECRET="edge-secret"
export RAILWAY_CI_DEBUG="0"

reset_logs

export RAILWAY_CI_DEBUG="1"
export FAKE_DEPLOYMENT_SEQUENCE_svc_api="baseline-success:SUCCESS;deploy-timeout:BUILDING"
if bash "$SCRIPT" >/dev/null 2>"$DEBUG_LOG"; then
  echo "assertion failed: timeout deployment status should fail sync + up" >&2
  exit 1
fi
grep -q "did not reach terminal state within 300 seconds" "$DEBUG_LOG"
grep -q "latest observed deployment id was 'deploy-timeout' with status 'BUILDING'" "$DEBUG_LOG"
grep -q "^logs --build --latest --lines 120 --service svc-api$" "$LOG_FILE"
grep -q "^logs --deployment --latest --lines 120 --service svc-api$" "$LOG_FILE"
unset FAKE_DEPLOYMENT_SEQUENCE_svc_api
export RAILWAY_CI_DEBUG="0"

reset_logs

export RAILWAY_CI_DEBUG="1"
export FAKE_DEPLOYMENT_SEQUENCE_svc_api="SUCCESS;SUCCESS"
if bash "$SCRIPT" >/dev/null 2>"$DEBUG_LOG"; then
  echo "assertion failed: no-id deployment status should fail closed instead of accepting stale success" >&2
  exit 1
fi
grep -q "did not expose deployment IDs to prove freshness" "$DEBUG_LOG"
grep -q "^logs --build --latest --lines 120 --service svc-api$" "$LOG_FILE"
grep -q "^logs --deployment --latest --lines 120 --service svc-api$" "$LOG_FILE"
unset FAKE_DEPLOYMENT_SEQUENCE_svc_api
export RAILWAY_CI_DEBUG="0"

reset_logs

export RAILWAY_CI_DEBUG="1"
export RAILWAY_API_TOKEN="token-leak-value"
export EDGE_ORIGIN_AUTH_SECRET="edge-secret-leak"
export FAKE_LINK_STDERR="Unauthorized. token=token-leak-value secret=edge-secret-leak"
if bash "$SCRIPT" >/dev/null 2>"$DEBUG_LOG"; then
  echo "assertion failed: mocked link failure should fail sync + up" >&2
  exit 1
fi
if ! grep -q "\\*\\*\\*" "$DEBUG_LOG"; then
  echo "assertion failed: expected redacted secrets in debug output" >&2
  exit 1
fi
if grep -q "token-leak-value" "$DEBUG_LOG"; then
  echo "assertion failed: debug output leaked RAILWAY_API_TOKEN" >&2
  exit 1
fi
if grep -q "edge-secret-leak" "$DEBUG_LOG"; then
  echo "assertion failed: debug output leaked managed secret" >&2
  exit 1
fi
unset FAKE_LINK_STDERR
export RAILWAY_API_TOKEN="token"
export EDGE_ORIGIN_AUTH_SECRET="edge-secret"
export RAILWAY_CI_DEBUG="0"

reset_logs

unset RAILWAY_API_TOKEN
if bash "$SCRIPT" >/dev/null 2>&1; then
  echo "assertion failed: missing RAILWAY_API_TOKEN should fail" >&2
  exit 1
fi

if [[ -s "$LOG_FILE" ]]; then
  echo "assertion failed: auth validation failure should happen before Railway CLI calls" >&2
  exit 1
fi

echo "railway sync + up contract tests passed"
