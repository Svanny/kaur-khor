#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT_DIR/tool/ci/deploy_frontend.sh"
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
  up)
    if [[ "$2" != "${EXPECTED_CONTEXT_DIR:?}" ]]; then
      echo "unexpected build context: $2" >&2
      exit 1
    fi
    exit 0
    ;;
  *)
    echo "unexpected railway command: $*" >&2
    exit 1
    ;;
esac
EOF
chmod +x "$TMP_DIR/railway"

cat >"$TMP_DIR/prepare.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
echo "prepare:$*" >>"${MOCK_LOG:?}"
mkdir -p "$1"
touch "$1/Dockerfile"
EOF
chmod +x "$TMP_DIR/prepare.sh"
chmod 0644 "$TMP_DIR/prepare.sh"

export PATH="$TMP_DIR:$PATH"
export MOCK_LOG="$TMP_DIR/mock.log"
export EXPECTED_CONTEXT_DIR="$TMP_DIR/build-context"
export RAILWAY_API_TOKEN="token"
export RAILWAY_PROJECT_ID="project"
export RAILWAY_ENVIRONMENT="staging"
export RAILWAY_SERVICE_ID="svc-frontend"
export PREPARE_FRONTEND_BUILD_CONTEXT_SCRIPT="$TMP_DIR/prepare.sh"

cat >"$TMP_DIR/mktemp" <<EOF
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$EXPECTED_CONTEXT_DIR"
EOF
chmod +x "$TMP_DIR/mktemp"

PATH="$TMP_DIR:$PATH" bash "$SCRIPT" >"$TMP_DIR/stdout.txt" 2>"$TMP_DIR/stderr.txt"

assert_contains "$MOCK_LOG" "railway:whoami"
assert_contains "$MOCK_LOG" "railway:link --project project --environment staging --service svc-frontend"
assert_contains "$MOCK_LOG" "prepare:$EXPECTED_CONTEXT_DIR"
assert_contains "$MOCK_LOG" "railway:up $EXPECTED_CONTEXT_DIR --path-as-root --service svc-frontend --detach"

echo "deploy_frontend tests passed"
