#!/usr/bin/env bash
set -euo pipefail

RETENTION_DAYS="${IDEMPOTENCY_RETENTION_DAYS:-30}"
DATABASE_URL="${DATABASE_RUNTIME_URL:-}"

if [[ -z "$DATABASE_URL" ]]; then
  echo "error: DATABASE_RUNTIME_URL is required" >&2
  exit 1
fi

if ! [[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] || [[ "$RETENTION_DAYS" -le 0 ]]; then
  echo "error: IDEMPOTENCY_RETENTION_DAYS must be a positive integer" >&2
  exit 1
fi

echo "Pruning idempotency rows older than ${RETENTION_DAYS} days (statuses: completed, failed)"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<SQL
WITH deleted AS (
  DELETE FROM app.idempotency_request
  WHERE status IN ('completed', 'failed')
    AND updated_at < NOW() - make_interval(days => ${RETENTION_DAYS})
  RETURNING id
)
SELECT COUNT(*) AS deleted_rows FROM deleted;
SQL
