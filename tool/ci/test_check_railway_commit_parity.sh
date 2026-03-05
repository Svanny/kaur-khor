#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT_DIR/tool/ci/check_railway_commit_parity.sh"
TMP_DIR="$(mktemp -d)"
LOG_FILE="$TMP_DIR/commands.log"
DEBUG_LOG="$TMP_DIR/debug.log"
trap 'rm -rf "$TMP_DIR"' EXIT

cat >"$TMP_DIR/railway" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

log_file="${MOCK_RAILWAY_LOG:?}"

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
  elif [[ -n "${RAILWAY_TOKEN:-}" ]]; then
    record "auth project"
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
    if ! service_id="$(service_arg "$@")"; then
      echo "mock error: link requires --service" >&2
      exit 1
    fi
    record "link-service $service_id"
    if [[ -n "${FAKE_LINK_STDERR:-}" ]]; then
      printf '%s\n' "$FAKE_LINK_STDERR" >&2
      exit 1
    fi
    exit 0
    ;;
  variable)
    subcmd="${1:-}"
    shift
    if [[ "$subcmd" != "list" ]]; then
      exit 1
    fi
    service_id="$(service_arg "$@")"
    payload_key="FAKE_VARIABLE_JSON_$(sanitize "$service_id")"
    if [[ -n "${!payload_key+x}" ]]; then
      printf '%s\n' "${!payload_key}"
    else
      printf '{}\n'
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
export RAILWAY_API_TOKEN="token"
export RAILWAY_PROJECT_ID="project-id"
export RAILWAY_ENVIRONMENT="staging"
export COMMIT_SHA="0123456789abcdef0123456789abcdef01234567"
export DEPLOY_RUN_ID="9001-2"
export RAILWAY_API_SERVICE_ID="svc-api"
export RAILWAY_EVENT_RELAY_SERVICE_ID="svc-relay"
export RAILWAY_PROJECTION_CONSUMER_SERVICE_ID="svc-projection"
export RAILWAY_WORKER_SERVICE_ID="svc-worker"
export FAKE_VARIABLE_JSON_svc_api='{"APP_ROLE":"api","BANJI_SERVICE":"api","DEPLOY_COMMIT_SHA":"0123456789abcdef0123456789abcdef01234567","DEPLOY_RUN_ID":"9001-2"}'
export FAKE_VARIABLE_JSON_svc_relay='{"APP_ROLE":"event-relay","BANJI_SERVICE":"event-relay","DEPLOY_COMMIT_SHA":"0123456789abcdef0123456789abcdef01234567","DEPLOY_RUN_ID":"9001-2"}'
export FAKE_VARIABLE_JSON_svc_projection='{"APP_ROLE":"projection-consumer","BANJI_SERVICE":"projection-consumer","DEPLOY_COMMIT_SHA":"0123456789abcdef0123456789abcdef01234567","DEPLOY_RUN_ID":"9001-2"}'
export FAKE_VARIABLE_JSON_svc_worker='{"APP_ROLE":"worker","BANJI_SERVICE":"worker","DEPLOY_COMMIT_SHA":"0123456789abcdef0123456789abcdef01234567","DEPLOY_RUN_ID":"9001-2","UNMANAGED_SECRET":"raw-parity-secret"}'
export RAILWAY_CI_DEBUG="0"

bash "$SCRIPT" >/dev/null 2>"$DEBUG_LOG"

grep -q "^link --project project-id --environment staging --service svc-api$" "$LOG_FILE"
grep -q "auth api" "$LOG_FILE"
if grep -q "\\[railway-debug\\]" "$DEBUG_LOG"; then
  echo "assertion failed: debug logs should not be printed when RAILWAY_CI_DEBUG=0" >&2
  exit 1
fi

rm -f "$LOG_FILE"
: >"$LOG_FILE"
: >"$DEBUG_LOG"

export RAILWAY_CI_DEBUG="1"
bash "$SCRIPT" >/dev/null 2>"$DEBUG_LOG"
grep -q "\\[railway-debug\\] auth source=api" "$DEBUG_LOG"
grep -Fxq "[railway-debug] begin: link project/environment/service" "$DEBUG_LOG"
grep -q "\\[railway-debug\\] begin: list runtime variables (svc-worker)" "$DEBUG_LOG"
if grep -q "raw-parity-secret" "$DEBUG_LOG"; then
  echo "assertion failed: debug output leaked unmanaged runtime variable value" >&2
  exit 1
fi
export RAILWAY_CI_DEBUG="0"

rm -f "$LOG_FILE"
: >"$LOG_FILE"

unset RAILWAY_API_TOKEN
export RAILWAY_TOKEN="project-token"

bash "$SCRIPT" >/dev/null

grep -q "auth project" "$LOG_FILE"

rm -f "$LOG_FILE"
: >"$LOG_FILE"

unset RAILWAY_TOKEN
export RAILWAY_API_TOKEN="token"

export FAKE_VARIABLE_JSON_svc_worker='{"APP_ROLE":"worker","BANJI_SERVICE":"worker","DEPLOY_COMMIT_SHA":"deadbeefdeadbeefdeadbeefdeadbeefdeadbeef","DEPLOY_RUN_ID":"9001-2"}'
if bash "$SCRIPT" >/dev/null 2>&1; then
  echo "assertion failed: mismatched DEPLOY_COMMIT_SHA should fail parity check" >&2
  exit 1
fi

export FAKE_VARIABLE_JSON_svc_worker='{"APP_ROLE":"worker","BANJI_SERVICE":"worker","DEPLOY_COMMIT_SHA":"0123456789abcdef0123456789abcdef01234567","DEPLOY_RUN_ID":"9001-3"}'
if bash "$SCRIPT" >/dev/null 2>&1; then
  echo "assertion failed: mismatched DEPLOY_RUN_ID should fail parity check" >&2
  exit 1
fi

export FAKE_VARIABLE_JSON_svc_worker='{"APP_ROLE":"worker","BANJI_SERVICE":"worker","DEPLOY_COMMIT_SHA":"0123456789abcdef0123456789abcdef01234567","DEPLOY_RUN_ID":"9001-2"}'
export FAKE_DEPLOYMENT_STATUS_svc_worker="CRASHED"
if bash "$SCRIPT" >/dev/null 2>&1; then
  echo "assertion failed: non-success deployment status should fail parity check" >&2
  exit 1
fi
unset FAKE_DEPLOYMENT_STATUS_svc_worker

rm -f "$LOG_FILE"
: >"$LOG_FILE"
: >"$DEBUG_LOG"

export RAILWAY_CI_DEBUG="1"
export RAILWAY_API_TOKEN="token-leak-value"
export FAKE_LINK_STDERR="Unauthorized token=token-leak-value"
if bash "$SCRIPT" >/dev/null 2>"$DEBUG_LOG"; then
  echo "assertion failed: mocked link failure should fail parity check" >&2
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
unset FAKE_LINK_STDERR
export RAILWAY_API_TOKEN="token"
export RAILWAY_CI_DEBUG="0"

rm -f "$LOG_FILE"
: >"$LOG_FILE"

unset RAILWAY_API_TOKEN
if bash "$SCRIPT" >/dev/null 2>&1; then
  echo "assertion failed: missing Railway auth token should fail parity check" >&2
  exit 1
fi

if [[ -s "$LOG_FILE" ]]; then
  echo "assertion failed: auth validation failure should happen before Railway CLI calls" >&2
  exit 1
fi

echo "railway commit parity tests passed"
