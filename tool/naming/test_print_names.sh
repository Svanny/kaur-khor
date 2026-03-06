#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT_DIR/tool/naming/print_names.sh"

assert_contains() {
  local haystack="$1"
  local needle="$2"
  if ! grep -Fq "$needle" <<< "$haystack"; then
    echo "assertion failed: expected output to contain '$needle'" >&2
    exit 1
  fi
}

assert_matches() {
  local haystack="$1"
  local pattern="$2"
  if ! grep -Eq "$pattern" <<< "$haystack"; then
    echo "assertion failed: expected output to match /$pattern/" >&2
    exit 1
  fi
}

run_from_env_file() {
  local file="$1"
  local out
  out="$(set -a; source "$file"; set +a; bash "$SCRIPT")"
  printf '%s' "$out"
}

dev_out="$(run_from_env_file "$ROOT_DIR/config/env/dev.env")"
staging_out="$(run_from_env_file "$ROOT_DIR/config/env/staging.env")"
prod_out="$(run_from_env_file "$ROOT_DIR/config/env/prod.env")"

# 1) Normalization and DB legality
assert_contains "$staging_out" "POSTGRES_DB_APP=banji_core_staging_sg_sin_app"
assert_matches "$dev_out" '^POSTGRES_DB_APP=[a-z0-9_]+$'
assert_matches "$dev_out" '^POSTGRES_DB_ANALYTICS=[a-z0-9_]+$'

# 2) Env map correctness
assert_contains "$dev_out" "SERVICE_NAME_API=banji-core-dev-sg-sin-api"
assert_contains "$staging_out" "SERVICE_NAME_API=banji-core-staging-sg-sin-api"
assert_contains "$prod_out" "SERVICE_NAME_API=banji-core-prod-sg-sin-api"
assert_contains "$staging_out" "SERVICE_NAME_EVENT_RELAY=banji-core-staging-sg-sin-event-relay"
assert_contains "$prod_out" "SERVICE_NAME_PROJECTION_CONSUMER=banji-core-prod-sg-sin-projection-consumer"

# 3) MQ policy (no region in topic/queue names)
assert_contains "$dev_out" "KAFKA_TOPIC_INVENTORY_UPDATED=banji-core.dev.inventory-updated"
assert_contains "$staging_out" "RABBIT_QUEUE_STOCK_UPDATE_JOBS=banji-core.staging.stock-update-jobs"
if grep -Eq '^KAFKA_TOPIC_.*sg-sin' <<< "$dev_out"; then
  echo "assertion failed: kafka topic unexpectedly includes region" >&2
  exit 1
fi
if grep -Eq '^RABBIT_QUEUE_.*sg-sin' <<< "$staging_out"; then
  echo "assertion failed: rabbit queue unexpectedly includes region" >&2
  exit 1
fi

# 4) Failure on invalid env
if BANJI_ENV=qa BANJI_SYSTEM=banji-core BANJI_REGION=sg-sin bash "$SCRIPT" >/dev/null 2>&1; then
  echo "assertion failed: BANJI_ENV=qa should fail" >&2
  exit 1
fi

# 5) Failure on empty region
if BANJI_ENV=dev BANJI_SYSTEM=banji-core BANJI_REGION='' bash "$SCRIPT" >/dev/null 2>&1; then
  echo "assertion failed: empty BANJI_REGION should fail" >&2
  exit 1
fi

# 6) Failure on invalid base token
if BANJI_ENV=dev BANJI_SYSTEM=banji-core BANJI_REGION='kh_pp' bash "$SCRIPT" >/dev/null 2>&1; then
  echo "assertion failed: non-canonical BANJI_REGION should fail" >&2
  exit 1
fi

# 7) Stability (same inputs -> byte-identical)
first="$(set -a; source "$ROOT_DIR/config/env/dev.env"; set +a; bash "$SCRIPT")"
second="$(set -a; source "$ROOT_DIR/config/env/dev.env"; set +a; bash "$SCRIPT")"
if [[ "$first" != "$second" ]]; then
  echo "assertion failed: output is not stable across repeated runs" >&2
  exit 1
fi

echo "naming contract tests passed"
