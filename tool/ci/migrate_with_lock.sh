#!/usr/bin/env bash
set -euo pipefail

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

rm -f "$MIGRATION_SENTINEL"

psql "$DATABASE_MIGRATION_URL" -v ON_ERROR_STOP=1 -c "SELECT pg_advisory_lock(${LOCK_KEY});"
cleanup() {
  psql "$DATABASE_MIGRATION_URL" -v ON_ERROR_STOP=1 -c "SELECT pg_advisory_unlock(${LOCK_KEY});" || true
}
trap cleanup EXIT

sqlx migrate run --source apps/api/migrations --database-url "$DATABASE_MIGRATION_URL"
date -u +"%Y-%m-%dT%H:%M:%SZ" > "$MIGRATION_SENTINEL"
