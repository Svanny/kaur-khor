#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT_DIR/tool/local/bootstrap_rabbit_topology.sh"
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

setup_mocks() {
  local dir="$1"
  cat >"$dir/setup.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
env | sort >"$MOCK_SETUP_ENV"
EOF
  cat >"$dir/check.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
env | sort >"$MOCK_CHECK_ENV"
EOF
  chmod +x "$dir/setup.sh" "$dir/check.sh"
}

run_case() {
  local case_dir="$1"
  local expected_exit="$2"
  shift 2

  local output_file="$case_dir/output.txt"
  local actual_exit

  set +e
  (
    export MOCK_SETUP_ENV="$case_dir/setup.env"
    export MOCK_CHECK_ENV="$case_dir/check.env"
    "$@"
  ) >"$output_file" 2>&1
  actual_exit=$?
  set -e

  if [[ "$expected_exit" == "0" && "$actual_exit" != "0" ]]; then
    echo "assertion failed: expected success but got exit=$actual_exit" >&2
    cat "$output_file" >&2 || true
    exit 1
  fi

  if [[ "$expected_exit" == "1" && "$actual_exit" == "0" ]]; then
    echo "assertion failed: expected failure but script succeeded" >&2
    cat "$output_file" >&2 || true
    exit 1
  fi
}

# 1) canonical management vars are required
case1="$TMP_DIR/case1"
mkdir -p "$case1"
setup_mocks "$case1"
run_case "$case1" "1" bash -c "
  export BANJI_ENV=staging
  export RABBIT_SETUP_SCRIPT='$case1/setup.sh'
  export RABBIT_CHECK_SCRIPT='$case1/check.sh'
  bash '$SCRIPT'
"
assert_contains "$case1/output.txt" "RABBIT_MANAGEMENT_API_BASE_URL is required"

# 2) staging derives names and defaults vhost to /
case2="$TMP_DIR/case2"
mkdir -p "$case2"
setup_mocks "$case2"
run_case "$case2" "0" bash -c "
  export BANJI_ENV=staging
  export RABBIT_MANAGEMENT_API_BASE_URL=https://rabbit.example.com
  export RABBIT_MANAGEMENT_USERNAME=banji
  export RABBIT_MANAGEMENT_PASSWORD=secret
  export RABBIT_SETUP_SCRIPT='$case2/setup.sh'
  export RABBIT_CHECK_SCRIPT='$case2/check.sh'
  bash '$SCRIPT'
"
assert_contains "$case2/setup.env" "BANJI_SYSTEM=banji-core"
assert_contains "$case2/setup.env" "BANJI_ENV=staging"
assert_contains "$case2/setup.env" "RABBIT_VHOST=/"
assert_contains "$case2/setup.env" "RABBIT_MGMT_URL=https://rabbit.example.com"
assert_contains "$case2/setup.env" "RABBIT_MGMT_USER=banji"
assert_contains "$case2/setup.env" "RABBIT_MGMT_PASS=secret"
assert_contains "$case2/setup.env" "RABBIT_EXCHANGE_JOBS=banji-core.staging.jobs"
assert_contains "$case2/setup.env" "RABBIT_EXCHANGE_JOBS_REPLAY=banji-core.staging.jobs.replay"
assert_contains "$case2/setup.env" "RABBIT_DLX_EXCHANGE=banji-core.staging.jobs.dlx"
assert_contains "$case2/check.env" "RABBIT_EXCHANGE_JOBS=banji-core.staging.jobs"

# 3) prod derives names and respects explicit vhost override
case3="$TMP_DIR/case3"
mkdir -p "$case3"
setup_mocks "$case3"
run_case "$case3" "0" bash -c "
  export BANJI_ENV=prod
  export RABBIT_VHOST=prod-vhost
  export RABBIT_MANAGEMENT_API_BASE_URL=https://rabbit-prod.example.com
  export RABBIT_MANAGEMENT_USERNAME=banji-prod
  export RABBIT_MANAGEMENT_PASSWORD=secret-prod
  export RABBIT_SETUP_SCRIPT='$case3/setup.sh'
  export RABBIT_CHECK_SCRIPT='$case3/check.sh'
  bash '$SCRIPT'
"
assert_contains "$case3/setup.env" "BANJI_ENV=prod"
assert_contains "$case3/setup.env" "RABBIT_VHOST=prod-vhost"
assert_contains "$case3/setup.env" "RABBIT_EXCHANGE_JOBS=banji-core.prod.jobs"
assert_contains "$case3/setup.env" "RABBIT_EXCHANGE_JOBS_REPLAY=banji-core.prod.jobs.replay"
assert_contains "$case3/setup.env" "RABBIT_DLX_EXCHANGE=banji-core.prod.jobs.dlx"

echo "bootstrap rabbit topology tests passed"
