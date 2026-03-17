#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT_DIR/tool/ci/restart_railway_services.sh"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

assert_contains() {
  local file="$1"
  local needle="$2"
  if ! grep -Fq -- "$needle" "$file"; then
    echo "assertion failed: expected '$needle' in $file" >&2
    cat "$file" >&2 || true
    exit 1
  fi
}

assert_not_contains() {
  local file="$1"
  local needle="$2"
  if grep -Fq -- "$needle" "$file"; then
    echo "assertion failed: did not expect '$needle' in $file" >&2
    cat "$file" >&2 || true
    exit 1
  fi
}

cat >"$TMP_DIR/railway" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
echo "railway:$*" >>"${MOCK_LOG:?}"
case "${1:-}" in
  whoami)
    exit 0
    ;;
  link)
    exit 0
    ;;
  restart)
    exit 0
    ;;
  *)
    echo "unexpected railway command: $*" >&2
    exit 1
    ;;
esac
EOF
chmod +x "$TMP_DIR/railway"

export PATH="$TMP_DIR:$PATH"
export MOCK_LOG="$TMP_DIR/mock.log"
export RESTART_SUMMARY_PATH="$TMP_DIR/restarted.txt"
export RESTART_SKIPPED_PATH="$TMP_DIR/skipped.txt"
export RAILWAY_API_TOKEN="token"
export RAILWAY_PROJECT_ID="project"
export RAILWAY_ENVIRONMENT="staging"
export RAILWAY_API_SERVICE_ID="svc-api"
export RAILWAY_EVENT_RELAY_SERVICE_ID="svc-relay"
export RAILWAY_PROJECTION_CONSUMER_SERVICE_ID="svc-projection"
export RAILWAY_WORKER_SERVICE_ID="svc-worker"
export RAILWAY_FRONTEND_SERVICE_ID="svc-frontend"
export RAILWAY_KEYCLOAK_SERVICE_ID=""
export RAILWAY_DB_OPS_SERVICE_ID="svc-db-ops"
export INCLUDE_FRONTEND="true"
export INCLUDE_KEYCLOAK="true"
export INCLUDE_DB_OPS="false"

bash "$SCRIPT" >"$TMP_DIR/stdout.txt" 2>"$TMP_DIR/stderr.txt"

assert_contains "$MOCK_LOG" "railway:whoami"
assert_contains "$MOCK_LOG" "railway:link --project project --environment staging --service svc-relay"
assert_contains "$MOCK_LOG" "railway:restart --service svc-relay --yes"
assert_contains "$MOCK_LOG" "railway:restart --service svc-projection --yes"
assert_contains "$MOCK_LOG" "railway:restart --service svc-worker --yes"
assert_contains "$MOCK_LOG" "railway:restart --service svc-api --yes"
assert_contains "$MOCK_LOG" "railway:restart --service svc-frontend --yes"
assert_not_contains "$MOCK_LOG" "svc-db-ops"
assert_contains "$RESTART_SUMMARY_PATH" "event-relay"
assert_contains "$RESTART_SUMMARY_PATH" "frontend"
assert_contains "$RESTART_SKIPPED_PATH" "keycloak"

unset RAILWAY_WORKER_SERVICE_ID
if bash "$SCRIPT" >/dev/null 2>"$TMP_DIR/missing-required.err"; then
  echo "assertion failed: missing required worker service id should fail" >&2
  exit 1
fi
assert_contains "$TMP_DIR/missing-required.err" "RAILWAY_WORKER_SERVICE_ID is required"

echo "restart Railway services contract tests passed"
