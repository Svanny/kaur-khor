#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_MIGRATION_URL:-}" ]]; then
  echo "error: DATABASE_MIGRATION_URL is required" >&2
  exit 1
fi

LOCK_KEY="${ADVISORY_LOCK_KEY:-184361}"

psql "$DATABASE_MIGRATION_URL" -v ON_ERROR_STOP=1 -c "SELECT pg_advisory_lock(${LOCK_KEY});"
cleanup() {
  psql "$DATABASE_MIGRATION_URL" -v ON_ERROR_STOP=1 -c "SELECT pg_advisory_unlock(${LOCK_KEY});" || true
}
trap cleanup EXIT

sqlx migrate run --source apps/api/migrations --database-url "$DATABASE_MIGRATION_URL"
