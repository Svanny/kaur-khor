#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "error: DATABASE_URL is required" >&2
  exit 1
fi

STREAM_NAME=""
BEFORE_TS=""
OUTPUT_PATH=""
PRUNE="false"
PRUNE_BATCH_SIZE="1000"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --stream-name) STREAM_NAME="$2"; shift 2 ;;
    --before) BEFORE_TS="$2"; shift 2 ;;
    --output) OUTPUT_PATH="$2"; shift 2 ;;
    --prune) PRUNE="true"; shift 1 ;;
    --prune-batch-size) PRUNE_BATCH_SIZE="$2"; shift 2 ;;
    *) echo "error: unknown arg $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$STREAM_NAME" || -z "$BEFORE_TS" || -z "$OUTPUT_PATH" ]]; then
  echo "error: --stream-name, --before, and --output are required" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUTPUT_PATH")"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "
\\copy (
  SELECT row_to_json(t)
  FROM (
    SELECT *
    FROM app.event_log
    WHERE stream_name = '${STREAM_NAME}'
      AND created_at < '${BEFORE_TS}'::timestamptz
    ORDER BY id ASC
  ) t
) TO '${OUTPUT_PATH}'
"

LAST_EXPORTED_ID="$(psql "$DATABASE_URL" -tA -v ON_ERROR_STOP=1 -c "
SELECT COALESCE(MAX(id), 0)
FROM app.event_log
WHERE stream_name = '${STREAM_NAME}'
  AND created_at < '${BEFORE_TS}'::timestamptz;
")"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "
INSERT INTO app.event_log_archive_export_cursor (
  stream_name,
  last_exported_event_id,
  last_exported_at,
  updated_at
) VALUES (
  '${STREAM_NAME}',
  ${LAST_EXPORTED_ID},
  NOW(),
  NOW()
)
ON CONFLICT (stream_name)
DO UPDATE SET
  last_exported_event_id = GREATEST(app.event_log_archive_export_cursor.last_exported_event_id, EXCLUDED.last_exported_event_id),
  last_exported_at = NOW(),
  updated_at = NOW();
"

if [[ "$PRUNE" == "true" ]]; then
  while true; do
    DELETED="$(psql "$DATABASE_URL" -tA -v ON_ERROR_STOP=1 -c "
WITH c AS (
  SELECT id
  FROM app.event_log
  WHERE stream_name = '${STREAM_NAME}'
    AND created_at < '${BEFORE_TS}'::timestamptz
    AND id <= ${LAST_EXPORTED_ID}
  ORDER BY id ASC
  LIMIT ${PRUNE_BATCH_SIZE}
)
DELETE FROM app.event_log e
USING c
WHERE e.id = c.id
RETURNING 1;
" | wc -l | tr -d ' ')"

    if [[ "$DELETED" -eq 0 ]]; then
      break
    fi
  done
fi

echo "export complete: stream=${STREAM_NAME} last_exported_id=${LAST_EXPORTED_ID} output=${OUTPUT_PATH}"
