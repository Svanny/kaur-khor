#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "error: DATABASE_URL is required" >&2
  exit 1
fi

STREAM_NAME=""
FROM_ID="0"
TO_ID=""
LIMIT="1000"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --stream-name) STREAM_NAME="$2"; shift 2 ;;
    --from-id) FROM_ID="$2"; shift 2 ;;
    --to-id) TO_ID="$2"; shift 2 ;;
    --limit) LIMIT="$2"; shift 2 ;;
    *) echo "error: unknown arg $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$STREAM_NAME" ]]; then
  echo "error: --stream-name is required" >&2
  exit 1
fi

TO_CONDITION=""
if [[ -n "$TO_ID" ]]; then
  TO_CONDITION="AND id <= ${TO_ID}"
fi

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "
SELECT id, stream_name, event_type, event_version, aggregate_type, aggregate_id, producer_service, created_at
FROM app.event_log
WHERE stream_name = '${STREAM_NAME}'
  AND id > ${FROM_ID}
  ${TO_CONDITION}
ORDER BY id ASC
LIMIT ${LIMIT};
"
