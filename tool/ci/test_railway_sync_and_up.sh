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
      list)
        service_id="$(service_arg "$@")"
        payload_key="FAKE_VARIABLE_JSON_$(sanitize "$service_id")"
        if [[ -n "${!payload_key+x}" ]]; then
          printf '%s\n' "${!payload_key}"
          exit 0
        fi
        python3 - "$state_dir" "$service_id" <<'PY'
import json
import pathlib
import sys

path = pathlib.Path(sys.argv[1]) / f"{sys.argv[2]}.json"
if path.exists():
    sys.stdout.write(path.read_text())
else:
    sys.stdout.write("{}")
PY
        exit 0
        ;;
      *)
        exit 1
        ;;
    esac
    ;;
  up)
    exit 0
    ;;
  deployment)
    subcmd="${1:-}"
    shift
    if [[ "$subcmd" != "list" ]]; then
      exit 1
    fi
    service_id="$(service_arg "$@")"
    status_key="FAKE_DEPLOYMENT_STATUS_$(sanitize "$service_id")"
    if [[ -n "${!status_key+x}" ]]; then
      status="${!status_key}"
    else
      status="SUCCESS"
    fi
    printf '[{"status":"%s"}]\n' "$status"
    exit 0
    ;;
  *)
    exit 1
    ;;
esac
EOF
chmod +x "$TMP_DIR/railway"

export PATH="$TMP_DIR:$PATH"
export MOCK_RAILWAY_LOG="$LOG_FILE"
export MOCK_RAILWAY_STATE_DIR="$STATE_DIR"
export RAILWAY_API_TOKEN="token"
export RAILWAY_PROJECT_ID="project-id"
export RAILWAY_ENVIRONMENT="staging"
export COMMIT_SHA="0123456789abcdef0123456789abcdef01234567"
export MIGRATION_CHECKSUM="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
export DATABASE_RUNTIME_ENDPOINT_KIND="pgbouncer"
export PGBOUNCER_POOL_MODE="transaction"
export DEPLOY_RUN_ID="9001-2"

export RAILWAY_SERVICE_ID="svc-api"
export EXPECTED_APP_ROLE="api"
export EXPECTED_BANJI_SERVICE="api"
export EDGE_ENFORCEMENT_ENABLED="true"
export EDGE_ORIGIN_AUTH_HEADER_NAME="x-banji-edge-auth"
export EDGE_ORIGIN_AUTH_SECRET="edge-secret"
export EDGE_CORS_ALLOWED_ORIGINS="https://staging.example.com"
export AUTH_ENABLED="true"
export AUTH_JWKS_URL="https://jwks.example.com"
export AUTH_ISSUER="https://issuer.example.com"
export AUTH_AUDIENCE="banji-api"
export RAILWAY_CI_DEBUG="0"

bash "$SCRIPT" >/dev/null 2>"$DEBUG_LOG"

grep -q "variable set DEPLOY_COMMIT_SHA --stdin --skip-deploys --service svc-api" "$LOG_FILE"
grep -q "variable set EDGE_ORIGIN_AUTH_SECRET --stdin --skip-deploys --service svc-api" "$LOG_FILE"
grep -q "up $ROOT_DIR/apps/api --path-as-root --service svc-api" "$LOG_FILE"
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

rm -f "$LOG_FILE"
: >"$LOG_FILE"
: >"$DEBUG_LOG"

export RAILWAY_CI_DEBUG="1"
export FAKE_VARIABLE_JSON_svc_api='{"DEPLOY_COMMIT_SHA":"0123456789abcdef0123456789abcdef01234567","DEPLOY_MIGRATION_CHECKSUM":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","DEPLOY_RUN_ID":"9001-2","DATABASE_RUNTIME_ENDPOINT_KIND":"pgbouncer","PGBOUNCER_POOL_MODE":"transaction","EDGE_ENFORCEMENT_ENABLED":"true","EDGE_ORIGIN_AUTH_HEADER_NAME":"x-banji-edge-auth","EDGE_CORS_ALLOWED_ORIGINS":"https://staging.example.com","AUTH_ENABLED":"true","AUTH_JWKS_URL":"https://jwks.example.com","AUTH_ISSUER":"https://issuer.example.com","AUTH_AUDIENCE":"banji-api","APP_ROLE":"api","BANJI_SERVICE":"api","UNMANAGED_SECRET":"raw-unmanaged-secret"}'
bash "$SCRIPT" >/dev/null 2>"$DEBUG_LOG"

grep -q "\\[railway-debug\\] auth source=api" "$DEBUG_LOG"
grep -Fxq "[railway-debug] begin: link project/environment/service" "$DEBUG_LOG"
grep -q "\\[railway-debug\\] begin: fetch latest deployment status" "$DEBUG_LOG"
if grep -q "raw-unmanaged-secret" "$DEBUG_LOG"; then
  echo "assertion failed: debug output leaked unmanaged runtime variable value" >&2
  exit 1
fi

export RAILWAY_CI_DEBUG="0"
unset FAKE_VARIABLE_JSON_svc_api

rm -f "$LOG_FILE"
: >"$LOG_FILE"

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

rm -f "$LOG_FILE"
: >"$LOG_FILE"

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

rm -f "$LOG_FILE"
: >"$LOG_FILE"

unset EDGE_ENFORCEMENT_ENABLED EDGE_ORIGIN_AUTH_HEADER_NAME EDGE_CORS_ALLOWED_ORIGINS
unset EDGE_ORIGIN_AUTH_SECRET AUTH_ENABLED AUTH_JWKS_URL AUTH_ISSUER AUTH_AUDIENCE
export RAILWAY_SERVICE_ID="svc-worker"
export EXPECTED_APP_ROLE="worker"
export EXPECTED_BANJI_SERVICE="worker"
export DATABASE_RUNTIME_URL="postgres://runtime@db.example/banji"
export RABBIT_URL="amqps://rabbit.example.com/%2f"
export OBJECT_STORAGE_ENABLED="true"
export OBJECT_STORAGE_ENDPOINT="https://storage.example.com"
export OBJECT_STORAGE_REGION="us-east-1"
export OBJECT_STORAGE_BUCKET_ARTIFACTS="banji-artifacts"
export OBJECT_STORAGE_ACCESS_KEY="access"
export OBJECT_STORAGE_SECRET_KEY="secret"
export ALGORITHM_ROLLOUT_HASH_SALT="salt"
export ALGORITHM_ROLLOUT_HASH_SALT_VERSION="salt-v1"

bash "$SCRIPT" >/dev/null

grep -q "variable set DATABASE_RUNTIME_URL --stdin --skip-deploys --service svc-worker" "$LOG_FILE"
grep -q "up $ROOT_DIR/apps/api --path-as-root --service svc-worker" "$LOG_FILE"

rm -f "$LOG_FILE"
: >"$LOG_FILE"

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
export EXPECTED_APP_ROLE="api"
export EXPECTED_BANJI_SERVICE="api"
export RAILWAY_SERVICE_ID="svc-api"
unset DATABASE_RUNTIME_URL OBJECT_STORAGE_ENABLED OBJECT_STORAGE_REGION OBJECT_STORAGE_BUCKET_ARTIFACTS
unset OBJECT_STORAGE_ACCESS_KEY OBJECT_STORAGE_SECRET_KEY ALGORITHM_ROLLOUT_HASH_SALT
unset ALGORITHM_ROLLOUT_HASH_SALT_VERSION
export EDGE_ENFORCEMENT_ENABLED="true"
export EDGE_ORIGIN_AUTH_HEADER_NAME="x-banji-edge-auth"
export EDGE_ORIGIN_AUTH_SECRET="edge-secret"
export EDGE_CORS_ALLOWED_ORIGINS="https://staging.example.com"
export AUTH_ENABLED="true"
export AUTH_JWKS_URL="https://jwks.example.com"
export AUTH_ISSUER="https://issuer.example.com"
export AUTH_AUDIENCE="banji-api"
export OBJECT_STORAGE_ENDPOINT="https://storage.example.com"

if bash "$SCRIPT" >/dev/null 2>&1; then
  echo "assertion failed: forbidden api object storage vars should fail" >&2
  exit 1
fi

unset OBJECT_STORAGE_ENDPOINT

rm -f "$LOG_FILE"
: >"$LOG_FILE"

export EXPECTED_APP_ROLE="api"
export EXPECTED_BANJI_SERVICE="api"
export RAILWAY_SERVICE_ID="svc-api"
export FAKE_DEPLOYMENT_STATUS_svc_api="FAILED"
if bash "$SCRIPT" >/dev/null 2>&1; then
  echo "assertion failed: failed deployment status should fail sync + up" >&2
  exit 1
fi
unset FAKE_DEPLOYMENT_STATUS_svc_api

rm -f "$LOG_FILE"
: >"$LOG_FILE"
: >"$DEBUG_LOG"

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

rm -f "$LOG_FILE"
: >"$LOG_FILE"

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
