#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT_DIR/tool/ci/railway_sync_and_up.sh"
TMP_DIR="$(mktemp -d)"
STATE_DIR="$TMP_DIR/state"
LOG_FILE="$TMP_DIR/commands.log"
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

cmd="${1:-}"
if [[ -z "$cmd" ]]; then
  exit 1
fi
shift
record "$cmd $*"

case "$cmd" in
  link)
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

bash "$SCRIPT" >/dev/null

grep -q "variable set DEPLOY_COMMIT_SHA --stdin --skip-deploys --service svc-api" "$LOG_FILE"
grep -q "variable set EDGE_ORIGIN_AUTH_SECRET --stdin --skip-deploys --service svc-api" "$LOG_FILE"
grep -q "up $ROOT_DIR/apps/api --path-as-root --service svc-api" "$LOG_FILE"
grep -q "deployment list --json --limit 1 --service svc-api" "$LOG_FILE"
grep -q "variable list --json --service svc-api" "$LOG_FILE"

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

unset EDGE_ORIGIN_AUTH_SECRET
if bash "$SCRIPT" >/dev/null 2>&1; then
  echo "assertion failed: missing api EDGE_ORIGIN_AUTH_SECRET should fail" >&2
  exit 1
fi
export EDGE_ORIGIN_AUTH_SECRET="edge-secret"

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

echo "railway sync + up contract tests passed"
