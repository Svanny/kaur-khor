#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT_DIR/tool/ci/shutdown_railway_prod_services.sh"
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
  down)
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
export SHUTDOWN_SUMMARY_PATH="$TMP_DIR/shutdown.txt"
export RAILWAY_API_TOKEN="token"
export RAILWAY_PROJECT_ID="project"
export RAILWAY_ENVIRONMENT="prod"
export RAILWAY_PROD_API_SERVICE_ID="svc-api"
export RAILWAY_PROD_EVENT_RELAY_SERVICE_ID="svc-relay"
export RAILWAY_PROD_PROJECTION_CONSUMER_SERVICE_ID="svc-projection"
export RAILWAY_PROD_WORKER_SERVICE_ID="svc-worker"
export RAILWAY_PROD_FRONTEND_SERVICE_ID="svc-frontend"
export RAILWAY_PROD_KEYCLOAK_SERVICE_ID="svc-keycloak"
export RAILWAY_PROD_DB_OPS_SERVICE_ID="svc-db-ops"

bash "$SCRIPT" >"$TMP_DIR/stdout.txt" 2>"$TMP_DIR/stderr.txt"

assert_contains "$MOCK_LOG" "railway:whoami"
assert_contains "$MOCK_LOG" "railway:link --project project --environment prod --service svc-api"
assert_contains "$MOCK_LOG" "railway:down --service svc-api --environment prod --yes"
assert_contains "$MOCK_LOG" "railway:down --service svc-relay --environment prod --yes"
assert_contains "$MOCK_LOG" "railway:down --service svc-projection --environment prod --yes"
assert_contains "$MOCK_LOG" "railway:down --service svc-worker --environment prod --yes"
assert_contains "$MOCK_LOG" "railway:down --service svc-frontend --environment prod --yes"
assert_contains "$MOCK_LOG" "railway:down --service svc-keycloak --environment prod --yes"
assert_contains "$MOCK_LOG" "railway:down --service svc-db-ops --environment prod --yes"
assert_contains "$SHUTDOWN_SUMMARY_PATH" "api (svc-api)"
assert_contains "$SHUTDOWN_SUMMARY_PATH" "db-ops (svc-db-ops)"

unset RAILWAY_PROD_WORKER_SERVICE_ID
if bash "$SCRIPT" >/dev/null 2>"$TMP_DIR/missing-service.err"; then
  echo "assertion failed: missing required prod service id should fail" >&2
  exit 1
fi
assert_contains "$TMP_DIR/missing-service.err" "RAILWAY_PROD_WORKER_SERVICE_ID is required"

export RAILWAY_PROD_WORKER_SERVICE_ID="svc-worker"
unset RAILWAY_PROJECT_ID
if bash "$SCRIPT" >/dev/null 2>"$TMP_DIR/missing-env.err"; then
  echo "assertion failed: missing required project id should fail" >&2
  exit 1
fi
assert_contains "$TMP_DIR/missing-env.err" "RAILWAY_PROJECT_ID is required"

export RAILWAY_PROJECT_ID="project"
export RAILWAY_TOKEN="legacy-token"
if bash "$SCRIPT" >/dev/null 2>"$TMP_DIR/legacy-token.err"; then
  echo "assertion failed: legacy Railway token should fail" >&2
  exit 1
fi
assert_contains "$TMP_DIR/legacy-token.err" "RAILWAY_TOKEN is no longer supported"

echo "shutdown prod Railway services contract tests passed"
