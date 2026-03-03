#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT_DIR/tool/ci/check_railway_commit_parity.sh"
TMP_DIR="$(mktemp -d)"
LOG_FILE="$TMP_DIR/commands.log"
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
export RAILWAY_TOKEN="token"
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
export FAKE_VARIABLE_JSON_svc_worker='{"APP_ROLE":"worker","BANJI_SERVICE":"worker","DEPLOY_COMMIT_SHA":"0123456789abcdef0123456789abcdef01234567","DEPLOY_RUN_ID":"9001-2"}'

bash "$SCRIPT" >/dev/null

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

echo "railway commit parity tests passed"
