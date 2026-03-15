#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT_DIR/tool/ci/deploy_staging_db_ops.sh"
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
  whoami|link)
    exit 0
    ;;
  deployment)
    counter_file="${MOCK_DEPLOY_COUNTER:?}"
    count="$(cat "$counter_file")"
    if [[ "$count" == "0" ]]; then
      printf '1' >"$counter_file"
      printf '[{"id":"baseline","status":"SUCCESS"}]'
    else
      printf '[{"id":"deploy-1","status":"SUCCESS"}]'
    fi
    exit 0
    ;;
  up)
    exit 0
    ;;
  *)
    echo "unexpected railway command: $*" >&2
    exit 1
    ;;
esac
EOF
chmod +x "$TMP_DIR/railway"

cat >"$TMP_DIR/sleep" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
echo "sleep:$*" >>"${MOCK_LOG:?}"
EOF
chmod +x "$TMP_DIR/sleep"

export PATH="$TMP_DIR:$PATH"
export MOCK_LOG="$TMP_DIR/mock.log"
export MOCK_DEPLOY_COUNTER="$TMP_DIR/deploy-counter"
printf '0' >"$MOCK_DEPLOY_COUNTER"
export RAILWAY_API_TOKEN="token"
export RAILWAY_PROJECT_ID="project"
export RAILWAY_ENVIRONMENT="staging"
export RAILWAY_SERVICE_ID="svc-db-ops"
export PREPARE_STAGING_DB_OPS_BUILD_CONTEXT_SCRIPT="$TMP_DIR/prepare.sh"

cat >"$TMP_DIR/prepare.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
echo "prepare:$*" >>"${MOCK_LOG:?}"
mkdir -p "$1"
touch "$1/Dockerfile"
EOF
chmod +x "$TMP_DIR/prepare.sh"

bash "$SCRIPT" >"$TMP_DIR/stdout.txt" 2>"$TMP_DIR/stderr.txt"

assert_contains "$MOCK_LOG" "railway:whoami"
assert_contains "$MOCK_LOG" "railway:link --project project --environment staging --service svc-db-ops"
assert_contains "$MOCK_LOG" "railway:deployment list --json --limit 1 --service svc-db-ops"
assert_contains "$MOCK_LOG" "prepare:"
assert_contains "$MOCK_LOG" "railway:up "
assert_contains "$TMP_DIR/stdout.txt" "staging db-ops deploy passed"

echo "deploy_staging_db_ops tests passed"
