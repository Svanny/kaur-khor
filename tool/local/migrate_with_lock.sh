#!/usr/bin/env bash
set -euo pipefail

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "error: required command not found: $1" >&2
    exit 1
  fi
}

if [[ -z "${DATABASE_MIGRATION_URL:-}" ]]; then
  echo "error: DATABASE_MIGRATION_URL is required" >&2
  exit 1
fi

if [[ -z "${DATABASE_RUNTIME_URL:-}" ]]; then
  echo "error: DATABASE_RUNTIME_URL is required" >&2
  exit 1
fi

if [[ "$DATABASE_MIGRATION_URL" == "$DATABASE_RUNTIME_URL" ]]; then
  echo "error: DATABASE_MIGRATION_URL and DATABASE_RUNTIME_URL must be distinct" >&2
  exit 1
fi

LOCK_KEY="${ADVISORY_LOCK_KEY:-184361}"
MIGRATION_SENTINEL="${MIGRATION_SENTINEL:-/tmp/banji_migration_applied}"
PSQL_BIN="${PSQL_BIN:-psql}"
SQLX_BIN="${SQLX_BIN:-sqlx}"

require_cmd "$PSQL_BIN"
require_cmd "$SQLX_BIN"
require_cmd mkfifo

rm -f "$MIGRATION_SENTINEL"

lock_dir="$(mktemp -d)"
lock_fifo="$lock_dir/psql.fifo"
lock_log="$lock_dir/psql.log"

mkfifo "$lock_fifo"

"$PSQL_BIN" "$DATABASE_MIGRATION_URL" -v ON_ERROR_STOP=1 <"$lock_fifo" >"$lock_log" 2>&1 &
psql_pid=$!
exec 3>"$lock_fifo"

lock_holder_ready=false

cleanup() {
  if [[ "$lock_holder_ready" == "true" ]] && kill -0 "$psql_pid" >/dev/null 2>&1; then
    {
      printf 'SELECT pg_advisory_unlock(%s);\n' "$LOCK_KEY"
      printf '\\q\n'
    } >&3 || true
    wait "$psql_pid" || true
  fi
  exec 3>&- || true
  rm -rf "$lock_dir"
}
trap cleanup EXIT

{
  printf 'SELECT pg_advisory_lock(%s);\n' "$LOCK_KEY"
  printf '\\echo LOCK_ACQUIRED\n'
} >&3

for _ in $(seq 1 50); do
  if grep -Fq "LOCK_ACQUIRED" "$lock_log" 2>/dev/null; then
    lock_holder_ready=true
    break
  fi
  if ! kill -0 "$psql_pid" >/dev/null 2>&1; then
    cat "$lock_log" >&2 || true
    echo "error: failed to acquire advisory lock session" >&2
    exit 1
  fi
  sleep 0.1
done

if [[ "$lock_holder_ready" != "true" ]]; then
  cat "$lock_log" >&2 || true
  echo "error: timed out waiting for advisory lock acquisition" >&2
  exit 1
fi

"$SQLX_BIN" migrate run --source apps/api/migrations --database-url "$DATABASE_MIGRATION_URL"
date -u +"%Y-%m-%dT%H:%M:%SZ" > "$MIGRATION_SENTINEL"
