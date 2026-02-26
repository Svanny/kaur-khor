#!/usr/bin/env bash
set -euo pipefail

DATABASE_URL="${DATABASE_RUNTIME_URL:-}"
RETENTION_DAYS="${EVENT_OUTBOX_PUBLISHED_RETENTION_DAYS:-7}"
BATCH_SIZE="${PRUNE_BATCH_SIZE:-1000}"

if [[ -z "$DATABASE_URL" ]]; then
  echo "error: DATABASE_RUNTIME_URL is required" >&2
  exit 1
fi

if ! [[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] || [[ "$RETENTION_DAYS" -le 0 ]]; then
  echo "error: EVENT_OUTBOX_PUBLISHED_RETENTION_DAYS must be a positive integer" >&2
  exit 1
fi

if ! [[ "$BATCH_SIZE" =~ ^[0-9]+$ ]] || [[ "$BATCH_SIZE" -le 0 ]]; then
  echo "error: PRUNE_BATCH_SIZE must be a positive integer" >&2
  exit 1
fi

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<SQL
WITH to_delete AS (
  SELECT id
  FROM app.event_outbox
  WHERE status = 'published'
    AND published_at IS NOT NULL
    AND published_at < NOW() - (${RETENTION_DAYS}::bigint * INTERVAL '1 day')
  ORDER BY published_at ASC
  LIMIT ${BATCH_SIZE}
),
deleted AS (
  DELETE FROM app.event_outbox o
  USING to_delete t
  WHERE o.id = t.id
  RETURNING o.id
)
SELECT COUNT(*) AS deleted_rows FROM deleted;
SQL
