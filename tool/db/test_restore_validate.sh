#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT_DIR/tool/db/restore_validate.sh"
TEST_TMP="$(mktemp -d)"
trap 'rm -rf "$TEST_TMP"' EXIT

assert_contains() {
  local file="$1"
  local needle="$2"
  if ! grep -Fq "$needle" "$file"; then
    echo "assertion failed: expected '$needle' in $file" >&2
    cat "$file" >&2 || true
    exit 1
  fi
}

assert_count_at_least() {
  local file="$1"
  local needle="$2"
  local min_count="$3"
  local count
  count="$(grep -Fc "$needle" "$file" || true)"
  if (( count < min_count )); then
    echo "assertion failed: expected at least $min_count occurrences of '$needle' in $file, found $count" >&2
    cat "$file" >&2 || true
    exit 1
  fi
}

setup_mocks() {
  local dir="$1"
  mkdir -p "$dir/bin" "$dir/reports"
  : > "$dir/cleanup.sql"

  cat > "$dir/bin/psql" <<'MOCK_PSQL'
#!/usr/bin/env bash
set -euo pipefail

url="$1"
shift

query=""
file=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    -Atqc)
      query="$2"
      shift 2
      ;;
    -f)
      file="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

if [[ -n "$query" ]]; then
  if [[ "$query" == *"current_database()"* ]]; then
    if [[ "$url" == "$MOCK_SOURCE_URL" ]]; then
      echo "$MOCK_SOURCE_DB_NAME"
      exit 0
    fi
    if [[ "$url" == "$MOCK_RESTORE_URL" ]]; then
      echo "$MOCK_RESTORE_DB_NAME"
      exit 0
    fi
  fi

  if [[ "$query" == *"inet_server_addr"* ]]; then
    echo "$MOCK_SOURCE_IDENTIFIER"
    exit 0
  fi
fi

if [[ -n "$file" ]]; then
  if [[ "${MOCK_VALIDATE_FAIL:-false}" == "true" ]]; then
    echo "validation failed" >&2
    exit 1
  fi
  echo "validation passed"
  exit 0
fi

input=""
if [ ! -t 0 ]; then
  input="$(cat || true)"
fi

if [[ "$input" == *"DROP SCHEMA IF EXISTS app CASCADE;"* ]]; then
  echo "cleanup" >> "$MOCK_PSQL_LOG"
  printf '%s\n' "$input" >> "$MOCK_CLEANUP_SQL"
else
  echo "pipe" >> "$MOCK_PSQL_LOG"
fi
MOCK_PSQL
  chmod +x "$dir/bin/psql"

  cat > "$dir/bin/pg_dump" <<'MOCK_PGDUMP'
#!/usr/bin/env bash
set -euo pipefail

echo "SELECT 1;"
MOCK_PGDUMP
  chmod +x "$dir/bin/pg_dump"
}

run_restore_validate() {
  local case_dir="$1"
  local expected_exit="$2"
  local output_file="$case_dir/output.txt"
  local actual_exit
  set +e
  (
    export PATH="$case_dir/bin:$PATH"
    export REPORT_DIR="$case_dir/reports"
    export MOCK_PSQL_LOG="$case_dir/psql.log"
    export MOCK_CLEANUP_SQL="$case_dir/cleanup.sql"
    export MOCK_SOURCE_URL="postgres://source"
    export MOCK_RESTORE_URL="postgres://restore"
    export SOURCE_DATABASE_URL="$MOCK_SOURCE_URL"
    export RESTORE_DATABASE_URL="$MOCK_RESTORE_URL"
    export ENV_NAME="staging"
    export BACKUP_SOURCE_TIMESTAMP="2026-02-25T00:00:00Z"
    export REQUIRED_PG_EXTENSIONS=""
    export MOCK_SOURCE_IDENTIFIER="10.0.0.1/$MOCK_SOURCE_DB_NAME"
    bash "$SCRIPT"
  ) >"$output_file" 2>&1
  actual_exit=$?
  set -e

  if [[ "$expected_exit" == "0" && "$actual_exit" != "0" ]]; then
    echo "assertion failed: expected success but script failed" >&2
    cat "$output_file" >&2
    exit 1
  fi

  if [[ "$expected_exit" == "1" && "$actual_exit" != "1" ]]; then
    echo "assertion failed: expected failure but script succeeded" >&2
    cat "$output_file" >&2
    exit 1
  fi
}

# 1) Safety guard: restore target name must end with _restore
case1="$TEST_TMP/case1"
setup_mocks "$case1"
export MOCK_SOURCE_DB_NAME="banji_core_prod_kh_pp_app"
export MOCK_RESTORE_DB_NAME="banji_core_staging_kh_pp_app"
run_restore_validate "$case1" "1"
assert_contains "$case1/reports/report_staging.json" '"failure_reason": "restore_target_must_end_with__restore"'

# 2) Safety guard: source and restore db names must differ
case2="$TEST_TMP/case2"
setup_mocks "$case2"
export MOCK_SOURCE_DB_NAME="banji_core_prod_kh_pp_restore"
export MOCK_RESTORE_DB_NAME="banji_core_prod_kh_pp_restore"
run_restore_validate "$case2" "1"
assert_contains "$case2/reports/report_staging.json" '"failure_reason": "source_and_restore_database_must_differ"'

# 3) Success path: report timings and post-validation cleanup
case3="$TEST_TMP/case3"
setup_mocks "$case3"
export MOCK_SOURCE_DB_NAME="banji_core_prod_kh_pp_app"
export MOCK_RESTORE_DB_NAME="banji_core_staging_kh_pp_restore"
run_restore_validate "$case3" "0"
assert_contains "$case3/reports/report_staging.json" '"status": "passed"'
assert_contains "$case3/reports/report_staging.json" '"restore_seconds": '
assert_contains "$case3/reports/report_staging.json" '"validate_seconds": '
assert_count_at_least "$case3/psql.log" 'cleanup' 2
assert_contains "$case3/cleanup.sql" "FROM pg_proc p"
assert_contains "$case3/cleanup.sql" "FROM pg_type t"

echo "restore validation tests passed"
