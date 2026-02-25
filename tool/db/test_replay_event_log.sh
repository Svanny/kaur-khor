#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT_DIR/tool/db/replay_event_log.sh"
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
  if grep -Fq -- "$needle" "$file"; then
    echo "assertion failed: expected '$needle' to be absent in $file" >&2
    cat "$file" >&2 || true
    exit 1
  fi
}

setup_mocks() {
  local dir="$1"
  mkdir -p "$dir/bin"

  cat > "$dir/bin/psql" <<'MOCK_PSQL'
#!/usr/bin/env bash
set -euo pipefail

query=""
atqc_mode="false"
c_mode="false"
reset_to_value=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    -Atqc)
      atqc_mode="true"
      query="$2"
      shift 2
      ;;
    -c)
      c_mode="true"
      query="$2"
      shift 2
      ;;
    -v)
      kv="$2"
      shift 2
      if [[ "$kv" == reset_to=* ]]; then
        reset_to_value="${kv#reset_to=}"
      fi
      ;;
    *)
      shift
      ;;
  esac
done

if [[ "$atqc_mode" == "true" ]]; then
  if [[ "$query" == *"FROM app.event_consumer_checkpoint"* ]]; then
    echo "5"
    exit 0
  fi

  if [[ "$query" == *"SELECT COUNT(*)"* && "$query" == *"id >= :start_from_id"* ]]; then
    echo "1"
    exit 0
  fi

  if [[ "$query" == *"SELECT COALESCE(MAX(id), 0)"* && "$query" == *"id >= :start_from_id"* ]]; then
    echo "1"
    exit 0
  fi

  if [[ "$query" == *"SELECT COUNT(*)"* && "$query" == *"id > :after_id"* ]]; then
    if [[ "${MOCK_FORCE_EMPTY_BATCH:-}" == "true" ]]; then
      echo "0"
      exit 0
    fi

    calls="0"
    if [[ -f "$MOCK_BATCH_COUNT_CALLS" ]]; then
      calls="$(cat "$MOCK_BATCH_COUNT_CALLS")"
    fi

    if [[ "$calls" == "0" ]]; then
      echo "1" > "$MOCK_BATCH_COUNT_CALLS"
      echo "1"
    else
      echo "0"
    fi
    exit 0
  fi

  if [[ "$query" == *"SELECT row_to_json"* ]]; then
    echo '{"id":1,"stream_name":"banji-core.dev.inventory-updated"}'
    exit 0
  fi

  if [[ "$query" == *"SELECT COALESCE(MAX(id), 0)"* && "$query" == *"id > :after_id"* ]]; then
    echo "1"
    exit 0
  fi
fi

if [[ "$c_mode" == "true" ]]; then
  if [[ -n "$reset_to_value" ]]; then
    echo "$reset_to_value" >> "$MOCK_RESET_VALUES"
  fi

  if [[ "$query" == *"INSERT INTO app.event_consumer_checkpoint"* ]]; then
    if [[ "$query" == *"last_event_id = EXCLUDED.last_event_id"* ]]; then
      echo "reset" >> "$MOCK_CHECKPOINT_LOG"
    fi

    if [[ "$query" == *"GREATEST(app.event_consumer_checkpoint.last_event_id"* ]]; then
      echo "advance" >> "$MOCK_CHECKPOINT_LOG"
    fi
  fi

  exit 0
fi

exit 0
MOCK_PSQL

  chmod +x "$dir/bin/psql"
}

run_replay() {
  local case_dir="$1"
  local expected_exit="$2"
  shift 2

  local output_file="$case_dir/output.txt"
  local actual_exit

  set +e
  (
    export PATH="$case_dir/bin:$PATH"
    export MOCK_BATCH_COUNT_CALLS="$case_dir/batch_count_calls"
    export MOCK_RESET_VALUES="$case_dir/reset_values.log"
    export MOCK_CHECKPOINT_LOG="$case_dir/checkpoint.log"
    export DATABASE_URL="postgres://fake"
    export MOCK_FORCE_EMPTY_BATCH="${MOCK_FORCE_EMPTY_BATCH:-}"

    bash "$SCRIPT" "$@"
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

# 1) apply mode must require handler command
case1="$TEST_TMP/case1"
setup_mocks "$case1"
run_replay "$case1" "1" \
  --mode hot-apply \
  --stream-name banji-core.dev.inventory-updated \
  --service-name projection-consumer \
  --consumer-name inventory-projector \
  --from-id 0
assert_contains "$case1/output.txt" "--handler-cmd is required for apply modes"

# 2) from-id 0 resets checkpoint to 0 (never -1) and apply advances on success
case2="$TEST_TMP/case2"
setup_mocks "$case2"
run_replay "$case2" "0" \
  --mode hot-apply \
  --stream-name banji-core.dev.inventory-updated \
  --service-name projection-consumer \
  --consumer-name inventory-projector \
  --handler-cmd 'cat >/dev/null' \
  --from-id 0
assert_contains "$case2/reset_values.log" "0"
assert_contains "$case2/checkpoint.log" "advance"

# 3) failed handler must not advance checkpoint
case3="$TEST_TMP/case3"
setup_mocks "$case3"
run_replay "$case3" "1" \
  --mode hot-apply \
  --stream-name banji-core.dev.inventory-updated \
  --service-name projection-consumer \
  --consumer-name inventory-projector \
  --handler-cmd 'exit 42' \
  --from-id 0
if [[ -f "$case3/checkpoint.log" ]]; then
  assert_not_contains "$case3/checkpoint.log" "advance"
fi

# 4) from-id 0 with empty range must not report negative end checkpoint
case4="$TEST_TMP/case4"
setup_mocks "$case4"
set +e
(
  export PATH="$case4/bin:$PATH"
  export MOCK_BATCH_COUNT_CALLS="$case4/batch_count_calls"
  export MOCK_RESET_VALUES="$case4/reset_values.log"
  export MOCK_CHECKPOINT_LOG="$case4/checkpoint.log"
  export DATABASE_URL="postgres://fake"
  export MOCK_FORCE_EMPTY_BATCH="true"

  bash "$SCRIPT" \
    --mode hot-apply \
    --stream-name banji-core.dev.inventory-updated \
    --service-name projection-consumer \
    --consumer-name inventory-projector \
    --handler-cmd 'cat >/dev/null' \
    --from-id 0
) >"$case4/output.txt" 2>&1
case4_exit=$?
set -e
if [[ "$case4_exit" -ne 0 ]]; then
  echo "assertion failed: expected success for empty-range replay, got exit=$case4_exit" >&2
  cat "$case4/output.txt" >&2 || true
  exit 1
fi
assert_contains "$case4/output.txt" "end_id=0"

echo "replay event-log tests passed"
