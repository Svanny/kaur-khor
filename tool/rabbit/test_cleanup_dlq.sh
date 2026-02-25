#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT_DIR/tool/rabbit/cleanup_dlq.sh"
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

assert_not_contains() {
  local file="$1"
  local needle="$2"
  if [[ -f "$file" ]] && grep -Fq -- "$needle" "$file"; then
    echo "assertion failed: expected '$needle' to be absent in $file" >&2
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

if [[ "$url" == *"/api/queues/"* ]] && [[ "$url" != *"/get" ]]; then
  echo '{"consumers":0}'
  exit 0
fi

if [[ "$url" == *"/api/queues/"*"/get" ]]; then
  if [[ "$data" == *"ack_requeue_false"* ]]; then
    echo "called" >> "$MOCK_POP_CALLS"
  fi

  if [[ "$MOCK_MODE" == "mismatch" ]]; then
    if [[ "$data" == *"ack_requeue_true"* ]]; then
      echo '[{"payload":"{\"job\":\"demo\"}","properties":{"message_id":"m-1","headers":{"x-replay-id":"other-replay"}}}]'
    else
      echo '[{"payload":"{\"job\":\"demo\"}","properties":{"message_id":"m-1","headers":{"x-replay-id":"other-replay"}}}]'
    fi
    exit 0
  fi

  if [[ "$MOCK_MODE" == "match_then_empty" ]]; then
    if [[ "$data" == *"ack_requeue_true"* ]]; then
      count="$(cat "$MOCK_PEEK_COUNT" 2>/dev/null || echo 0)"
      if [[ "$count" == "0" ]]; then
        echo 1 > "$MOCK_PEEK_COUNT"
        echo '[{"payload":"{\"job\":\"demo\"}","properties":{"message_id":"m-1","headers":{"x-replay-id":"run-123"}}}]'
      else
        echo '[]'
      fi
    else
      echo '[{"payload":"{\"job\":\"demo\"}","properties":{"message_id":"m-1","headers":{"x-replay-id":"run-123"}}}]'
    fi
    exit 0
  fi
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
    export MOCK_POP_CALLS="$case_dir/pop_calls.log"
    export MOCK_PEEK_COUNT="$case_dir/peek_count.log"
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

# 1) mismatch at queue head must stop without destructive pop
case1="$TEST_TMP/case1"
setup_mocks "$case1"
run_case "$case1" "0" bash -c "
  export MOCK_MODE=mismatch
  export RABBIT_MGMT_URL=http://mock
  export RABBIT_MGMT_USER=user
  export RABBIT_MGMT_PASS=pass
  export RABBIT_VHOST=/
  export BANJI_ENV=staging
  export OPERATOR_ID=ops-1
  export CLEANUP_REASON='post replay cleanup'
  export DLQ_NAME=banji-core.staging.fast-jobs.dlq
  export TARGET_REPLAY_ID=run-123
  export CONFIRM_DLQ_CLEANUP=CONFIRM_DLQ_CLEANUP
  bash '$SCRIPT'
"
assert_contains "$case1/output.txt" "stopping cleanup: queue head replay id does not match target replay id"
assert_not_contains "$case1/pop_calls.log" "called"

# 2) matching replay id removes bounded messages
case2="$TEST_TMP/case2"
setup_mocks "$case2"
audit_log="$case2/audit.jsonl"
run_case "$case2" "0" bash -c "
  export MOCK_MODE=match_then_empty
  export RABBIT_MGMT_URL=http://mock
  export RABBIT_MGMT_USER=user
  export RABBIT_MGMT_PASS=pass
  export RABBIT_VHOST=/
  export BANJI_ENV=staging
  export OPERATOR_ID=ops-1
  export CLEANUP_REASON='post replay cleanup'
  export DLQ_NAME=banji-core.staging.fast-jobs.dlq
  export TARGET_REPLAY_ID=run-123
  export CONFIRM_DLQ_CLEANUP=CONFIRM_DLQ_CLEANUP
  export RABBIT_REPLAY_MAX_MESSAGES=5
  export RABBIT_REPLAY_AUDIT_LOG='$audit_log'
  bash '$SCRIPT'
"
assert_contains "$case2/output.txt" "removed=1"
assert_contains "$audit_log" "\"status\":\"removed\""

echo "rabbit cleanup tests passed"
