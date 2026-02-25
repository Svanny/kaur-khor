#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT_DIR/tool/rabbit/replay_dlq.sh"
TEST_TMP="$(mktemp -d)"
trap 'rm -rf "$TEST_TMP"' EXIT

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
  mkdir -p "$dir/bin"
  cat > "$dir/bin/curl" <<'MOCK_CURL'
#!/usr/bin/env bash
set -euo pipefail

url=""
data=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -d)
      data="$2"
      shift 2
      ;;
    http*)
      url="$1"
      shift
      ;;
    *)
      shift
      ;;
  esac
done

if [[ "$url" == *"/api/queues/"*"/get" ]]; then
  echo "$data" > "$MOCK_GET_BODY"
  echo '[{"payload":"{\"job\":\"demo\"}","properties":{"message_id":"m-1","headers":{"x-attempt":2}}}]'
  exit 0
fi

if [[ "$url" == *"/api/exchanges/"*"/publish" ]]; then
  echo "$data" > "$MOCK_PUBLISH_BODY"
  echo '{"routed":false}'
  exit 0
fi

echo '{}'
MOCK_CURL
  chmod +x "$dir/bin/curl"
}

run_case() {
  local case_dir="$1"
  local expected_exit="$2"
  shift 2

  local output_file="$case_dir/output.txt"
  local actual_exit

  set +e
  (
    export PATH="$case_dir/bin:$PATH"
    export MOCK_GET_BODY="$case_dir/get_body.json"
    export MOCK_PUBLISH_BODY="$case_dir/publish_body.json"
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

# 1) BANJI_ENV is mandatory
case1="$TEST_TMP/case1"
setup_mocks "$case1"
run_case "$case1" "1" bash -c "
  export RABBIT_MGMT_URL=http://mock
  export RABBIT_MGMT_USER=user
  export RABBIT_MGMT_PASS=pass
  export RABBIT_VHOST=/
  export OPERATOR_ID=ops-1
  export REPLAY_REASON=test
  export DLQ_NAME=banji-core.dev.fast-jobs.dlq
  export RABBIT_REPLAY_TARGET_ROUTING_KEY=job.fast.replay
  bash '$SCRIPT'
"
assert_contains "$case1/output.txt" "BANJI_ENV is required"

# 2) stop on first unrouted publish and write failure audit
case2="$TEST_TMP/case2"
setup_mocks "$case2"
audit_log="$case2/audit.jsonl"
run_case "$case2" "1" bash -c "
  export RABBIT_MGMT_URL=http://mock
  export RABBIT_MGMT_USER=user
  export RABBIT_MGMT_PASS=pass
  export RABBIT_VHOST=/
  export BANJI_ENV=staging
  export BANJI_SYSTEM=banji-core
  export OPERATOR_ID=ops-1
  export REPLAY_REASON='incident replay'
  export DLQ_NAME=banji-core.staging.fast-jobs.dlq
  export RABBIT_REPLAY_TARGET_ROUTING_KEY=job.fast.replay
  export RABBIT_REPLAY_MAX_MESSAGES=1
  export RABBIT_REPLAY_RATE_PER_MIN=120
  export RABBIT_REPLAY_AUDIT_LOG='$audit_log'
  bash '$SCRIPT'
"
assert_contains "$case2/get_body.json" "\"ackmode\":\"ack_requeue_true\""
assert_contains "$case2/output.txt" "publish failed or unrouted"
assert_contains "$audit_log" "\"status\":\"publish_failed\""

echo "rabbit replay tests passed"
