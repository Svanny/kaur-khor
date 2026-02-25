#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  DATABASE_URL=... bash tool/db/replay_event_log.sh \
    --mode hot-preview|hot-apply|cold-preview|cold-apply \
    --stream-name <name> \
    --service-name <service> \
    --consumer-name <consumer> \
    [--handler-cmd <command>] \
    [--from-id <event_id>] \
    [--to-id <event_id>] \
    [--batch-size <n>]

Modes:
- *-preview: read-only plan and sample
- *-apply: optional checkpoint reset, execute handler per batch, update checkpoint only after handler success
- cold modes assume archive data has already been rehydrated into the target Postgres database.
USAGE
}

fail() {
  echo "error: $*" >&2
  exit 1
}

is_uint() {
  [[ "$1" =~ ^[0-9]+$ ]]
}

MODE=""
STREAM_NAME=""
SERVICE_NAME=""
CONSUMER_NAME=""
HANDLER_CMD=""
FROM_ID_OVERRIDE=""
TO_ID=""
BATCH_SIZE="${EVENT_LOG_REPLAY_BATCH_SIZE:-1000}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) MODE="$2"; shift 2 ;;
    --stream-name) STREAM_NAME="$2"; shift 2 ;;
    --service-name) SERVICE_NAME="$2"; shift 2 ;;
    --consumer-name) CONSUMER_NAME="$2"; shift 2 ;;
    --handler-cmd) HANDLER_CMD="$2"; shift 2 ;;
    --from-id) FROM_ID_OVERRIDE="$2"; shift 2 ;;
    --to-id) TO_ID="$2"; shift 2 ;;
    --batch-size) BATCH_SIZE="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) fail "unknown arg $1" ;;
  esac
done

[[ -n "${DATABASE_URL:-}" ]] || fail "DATABASE_URL is required"
[[ -n "$MODE" ]] || fail "--mode is required"
[[ -n "$STREAM_NAME" ]] || fail "--stream-name is required"
[[ -n "$SERVICE_NAME" ]] || fail "--service-name is required"
[[ -n "$CONSUMER_NAME" ]] || fail "--consumer-name is required"

case "$MODE" in
  hot-preview|hot-apply|cold-preview|cold-apply) ;;
  *) fail "invalid --mode '$MODE'" ;;
esac

if [[ "$MODE" == "hot-apply" || "$MODE" == "cold-apply" ]]; then
  [[ -n "$HANDLER_CMD" ]] || fail "--handler-cmd is required for apply modes"
fi

is_uint "$BATCH_SIZE" || fail "--batch-size must be a non-negative integer"
if [[ -n "$FROM_ID_OVERRIDE" ]] && ! is_uint "$FROM_ID_OVERRIDE"; then
  fail "--from-id must be a non-negative integer"
fi
if [[ -n "$TO_ID" ]] && ! is_uint "$TO_ID"; then
  fail "--to-id must be a non-negative integer"
fi

PSQL_BASE=(
  psql "$DATABASE_URL"
  -v ON_ERROR_STOP=1
  -v stream_name="$STREAM_NAME"
  -v service_name="$SERVICE_NAME"
  -v consumer_name="$CONSUMER_NAME"
)

CHECKPOINT_ID="$("${PSQL_BASE[@]}" -Atqc "
SELECT COALESCE((
  SELECT last_event_id
  FROM app.event_consumer_checkpoint
  WHERE service_name = :'service_name'
    AND consumer_name = :'consumer_name'
    AND stream_name = :'stream_name'
), 0);
")"
is_uint "$CHECKPOINT_ID" || fail "checkpoint last_event_id is not numeric"

if [[ -n "$FROM_ID_OVERRIDE" ]]; then
  START_FROM_ID="$FROM_ID_OVERRIDE"
else
  START_FROM_ID=$((CHECKPOINT_ID + 1))
fi

if [[ -n "$TO_ID" ]] && (( TO_ID < START_FROM_ID )); then
  fail "--to-id must be >= replay start id"
fi

if [[ -n "$TO_ID" ]]; then
  TO_CONDITION="AND id <= :to_id::bigint"
  TO_PARAM=(-v to_id="$TO_ID")
else
  TO_CONDITION=""
  TO_PARAM=()
fi

PLANNED_ROW_COUNT="$("${PSQL_BASE[@]}" "${TO_PARAM[@]-}" -v start_from_id="$START_FROM_ID" -Atqc "
SELECT COUNT(*)
FROM app.event_log
WHERE stream_name = :'stream_name'
  AND id >= :start_from_id::bigint
  ${TO_CONDITION};
")"

PLANNED_MAX_ID="$("${PSQL_BASE[@]}" "${TO_PARAM[@]-}" -v start_from_id="$START_FROM_ID" -Atqc "
SELECT COALESCE(MAX(id), 0)
FROM app.event_log
WHERE stream_name = :'stream_name'
  AND id >= :start_from_id::bigint
  ${TO_CONDITION};
")"

if [[ "$MODE" == "hot-preview" || "$MODE" == "cold-preview" ]]; then
  echo "mode=$MODE stream=$STREAM_NAME service=$SERVICE_NAME consumer=$CONSUMER_NAME checkpoint=$CHECKPOINT_ID from_id=$START_FROM_ID to_id=${TO_ID:-max} planned_rows=$PLANNED_ROW_COUNT planned_max_id=$PLANNED_MAX_ID"
  "${PSQL_BASE[@]}" "${TO_PARAM[@]-}" -v start_from_id="$START_FROM_ID" -v batch_size="$BATCH_SIZE" -c "
SELECT id, stream_name, event_type, event_version, aggregate_type, aggregate_id, producer_service, created_at
FROM app.event_log
WHERE stream_name = :'stream_name'
  AND id >= :start_from_id::bigint
  ${TO_CONDITION}
ORDER BY id ASC
LIMIT :batch_size::integer;
"
  exit 0
fi

if [[ -n "$FROM_ID_OVERRIDE" ]]; then
  RESET_TO=$((START_FROM_ID - 1))
  if (( RESET_TO < 0 )); then
    RESET_TO=0
  fi
  "${PSQL_BASE[@]}" -v reset_to="$RESET_TO" -c "
INSERT INTO app.event_consumer_checkpoint (
  service_name,
  consumer_name,
  stream_name,
  last_event_id,
  last_heartbeat_at,
  last_error,
  updated_at
) VALUES (
  :'service_name',
  :'consumer_name',
  :'stream_name',
  :reset_to::bigint,
  NOW(),
  NULL,
  NOW()
)
ON CONFLICT (service_name, consumer_name, stream_name)
DO UPDATE SET
  last_event_id = EXCLUDED.last_event_id,
  last_heartbeat_at = NOW(),
  last_error = NULL,
  updated_at = NOW();
"
fi

if (( START_FROM_ID > 0 )); then
  CURRENT_AFTER=$((START_FROM_ID - 1))
else
  CURRENT_AFTER=0
fi
TOTAL_REPLAYED=0
LAST_APPLIED_ID="$CURRENT_AFTER"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
BATCH_FILE="$TMP_DIR/replay_batch.jsonl"

while true; do
  BATCH_COUNT="$("${PSQL_BASE[@]}" "${TO_PARAM[@]-}" -v after_id="$CURRENT_AFTER" -v batch_size="$BATCH_SIZE" -Atqc "
SELECT COUNT(*)
FROM (
  SELECT id
  FROM app.event_log
  WHERE stream_name = :'stream_name'
    AND id > :after_id::bigint
    ${TO_CONDITION}
  ORDER BY id ASC
  LIMIT :batch_size::integer
) batch;
")"

  if (( BATCH_COUNT == 0 )); then
    break
  fi

  "${PSQL_BASE[@]}" "${TO_PARAM[@]-}" -v after_id="$CURRENT_AFTER" -v batch_size="$BATCH_SIZE" -Atqc "
SELECT row_to_json(t)
FROM (
  SELECT
    id,
    stream_name,
    event_type,
    event_version,
    aggregate_type,
    aggregate_id,
    producer_service,
    idempotency_key,
    correlation_id,
    created_at,
    payload,
    metadata
  FROM app.event_log
  WHERE stream_name = :'stream_name'
    AND id > :after_id::bigint
    ${TO_CONDITION}
  ORDER BY id ASC
  LIMIT :batch_size::integer
) t;
" > "$BATCH_FILE"

  if [[ ! -s "$BATCH_FILE" ]]; then
    fail "batch fetch returned no rows while batch count was $BATCH_COUNT"
  fi

  bash -lc "$HANDLER_CMD" < "$BATCH_FILE"

  BATCH_MAX_ID="$("${PSQL_BASE[@]}" "${TO_PARAM[@]-}" -v after_id="$CURRENT_AFTER" -v batch_size="$BATCH_SIZE" -Atqc "
SELECT COALESCE(MAX(id), 0)
FROM (
  SELECT id
  FROM app.event_log
  WHERE stream_name = :'stream_name'
    AND id > :after_id::bigint
    ${TO_CONDITION}
  ORDER BY id ASC
  LIMIT :batch_size::integer
) batch;
")"

  CURRENT_AFTER="$BATCH_MAX_ID"
  LAST_APPLIED_ID="$BATCH_MAX_ID"
  TOTAL_REPLAYED=$((TOTAL_REPLAYED + BATCH_COUNT))

  "${PSQL_BASE[@]}" -v last_event_id="$LAST_APPLIED_ID" -c "
INSERT INTO app.event_consumer_checkpoint (
  service_name,
  consumer_name,
  stream_name,
  last_event_id,
  last_heartbeat_at,
  last_error,
  updated_at
) VALUES (
  :'service_name',
  :'consumer_name',
  :'stream_name',
  :last_event_id::bigint,
  NOW(),
  NULL,
  NOW()
)
ON CONFLICT (service_name, consumer_name, stream_name)
DO UPDATE SET
  last_event_id = GREATEST(app.event_consumer_checkpoint.last_event_id, EXCLUDED.last_event_id),
  last_heartbeat_at = NOW(),
  last_error = NULL,
  updated_at = NOW();
"
done

echo "mode=$MODE stream=$STREAM_NAME service=$SERVICE_NAME consumer=$CONSUMER_NAME replayed_rows=$TOTAL_REPLAYED start_id=$START_FROM_ID end_id=$LAST_APPLIED_ID"
