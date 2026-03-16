#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT_DIR/tool/ci/deploy_db_ops.sh"
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
    service_id=""
    while (($# > 0)); do
      if [[ "$1" == "--service" ]]; then
        shift
        service_id="${1:-}"
        break
      fi
      shift
    done
    if [[ -z "$service_id" ]]; then
      echo "missing --service value" >&2
      exit 1
    fi
    counter_file="${MOCK_DEPLOY_COUNTER:?}"
    count="$(cat "$counter_file")"
    case "$service_id" in
      svc-staging-db-ops)
        if [[ "$count" == "0" ]]; then
          printf '1' >"$counter_file"
          printf '[{"id":"other-deploy","status":"SUCCESS","message":"other-run"},{"id":"baseline","status":"SUCCESS","message":"older-run"}]'
        else
          up_message_file="${MOCK_UP_MESSAGE_FILE:?}"
          up_message="$(cat "$up_message_file")"
          printf '[{"id":"other-deploy-2","status":"SUCCESS","message":"other-run-2"},{"id":"deploy-1","status":"SUCCESS","message":"%s"},{"id":"baseline","status":"SUCCESS","message":"older-run"}]' "$up_message"
        fi
        ;;
      svc-prod-db-ops)
        if [[ "$count" == "0" ]]; then
          printf '1' >"$counter_file"
          printf '[{"id":"baseline","status":"SUCCESS"},{"id":"older","status":"SUCCESS"}]'
        else
          printf '[{"id":"deploy-1","status":"SUCCESS"},{"id":"baseline","status":"SUCCESS"},{"id":"older","status":"SUCCESS"}]'
        fi
        ;;
      *)
        echo "unexpected service id: $service_id" >&2
        exit 1
        ;;
    esac
    exit 0
    ;;
  up)
    up_message_file="${MOCK_UP_MESSAGE_FILE:?}"
    message=""
    while (($# > 0)); do
      if [[ "$1" == "--message" ]]; then
        shift
        message="${1:-}"
        break
      fi
      shift
    done
    if [[ -z "$message" ]]; then
      echo "missing --message value" >&2
      exit 1
    fi
    printf '%s' "$message" >"$up_message_file"
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

cat >"$TMP_DIR/prepare.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
echo "prepare:$*" >>"${MOCK_LOG:?}"
mkdir -p "$1"
touch "$1/Dockerfile"
EOF
chmod +x "$TMP_DIR/prepare.sh"

cat >"$TMP_DIR/prepare-missing-dockerfile.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
echo "prepare-missing:$*" >>"${MOCK_LOG:?}"
mkdir -p "$1"
touch "$1/start.sh"
EOF
chmod +x "$TMP_DIR/prepare-missing-dockerfile.sh"

export PATH="$TMP_DIR:$PATH"
export MOCK_LOG="$TMP_DIR/mock.log"
export MOCK_DEPLOY_COUNTER="$TMP_DIR/deploy-counter"
export MOCK_UP_MESSAGE_FILE="$TMP_DIR/up-message"
export RAILWAY_API_TOKEN="token"
export RAILWAY_PROJECT_ID="project"
export PREPARE_DB_OPS_BUILD_CONTEXT_SCRIPT="$TMP_DIR/prepare.sh"

export RAILWAY_ENVIRONMENT="staging"
unset RAILWAY_SERVICE_ID
if bash "$SCRIPT" >"$TMP_DIR/missing.stdout.txt" 2>"$TMP_DIR/missing.stderr.txt"; then
  echo "assertion failed: deploy_db_ops should require a db-ops service id" >&2
  exit 1
fi
assert_contains "$TMP_DIR/missing.stderr.txt" "error: RAILWAY_SERVICE_ID is required for db-ops in 'staging'"
assert_contains "$TMP_DIR/missing.stderr.txt" "hint: set GitHub 'staging' environment secret 'RAILWAY_STAGING_DB_OPS_SERVICE_ID' or export RAILWAY_SERVICE_ID before running locally"

export PREPARE_DB_OPS_BUILD_CONTEXT_SCRIPT="$TMP_DIR/prepare-missing-dockerfile.sh"
export RAILWAY_SERVICE_ID="svc-staging-db-ops"
if bash "$SCRIPT" >"$TMP_DIR/missing-dockerfile.stdout.txt" 2>"$TMP_DIR/missing-dockerfile.stderr.txt"; then
  echo "assertion failed: deploy_db_ops should reject a build context without a root Dockerfile" >&2
  exit 1
fi
assert_contains "$TMP_DIR/missing-dockerfile.stderr.txt" "error: prepared db-ops build context must contain a root Dockerfile for Railway CLI uploads"
assert_contains "$MOCK_LOG" "prepare-missing:"

export PREPARE_DB_OPS_BUILD_CONTEXT_SCRIPT="$TMP_DIR/prepare.sh"

for env_name in staging prod; do
  : >"$MOCK_LOG"
  printf '0' >"$MOCK_DEPLOY_COUNTER"
  export RAILWAY_ENVIRONMENT="$env_name"
  export RAILWAY_SERVICE_ID="svc-${env_name}-db-ops"

  bash "$SCRIPT" >"$TMP_DIR/${env_name}.stdout.txt" 2>"$TMP_DIR/${env_name}.stderr.txt"

  assert_contains "$MOCK_LOG" "railway:whoami"
  assert_contains "$MOCK_LOG" "railway:link --project project --environment $env_name --service svc-${env_name}-db-ops"
  assert_contains "$MOCK_LOG" "railway:deployment list --json --limit 20 --service svc-${env_name}-db-ops"
  assert_contains "$MOCK_LOG" "prepare:"
  assert_contains "$MOCK_LOG" "railway:up "
  assert_contains "$MOCK_LOG" "--message banji-db-ops:${env_name}:local:0:"
  assert_contains "$TMP_DIR/${env_name}.stdout.txt" "$env_name db-ops deploy passed"
done

echo "deploy_db_ops tests passed"
