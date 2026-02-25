#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  DATABASE_URL=... bash tool/db/rehydrate_event_log_archive.sh \
    --stream-name <name> \
    --input <archive.jsonl> [--input <archive2.jsonl> ...] \
    [--from-id <event_id>] \
    [--to-id <event_id>] \
    [--dry-run]

Notes:
- Imports JSONL archive segments into Postgres `app.event_log` for cold replay.
- When all `<input>.manifest.json` files are present, segment range coverage is validated for contiguity.
USAGE
}

fail() {
  echo "error: $*" >&2
  exit 1
}

is_uint() {
  [[ "$1" =~ ^[0-9]+$ ]]
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

STREAM_NAME=""
FROM_ID=""
TO_ID=""
DRY_RUN="false"
INPUT_FILES=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --stream-name) STREAM_NAME="$2"; shift 2 ;;
    --input) INPUT_FILES+=("$2"); shift 2 ;;
    --from-id) FROM_ID="$2"; shift 2 ;;
    --to-id) TO_ID="$2"; shift 2 ;;
    --dry-run) DRY_RUN="true"; shift 1 ;;
    -h|--help) usage; exit 0 ;;
    *) fail "unknown arg $1" ;;
  esac
done

[[ -n "${DATABASE_URL:-}" ]] || fail "DATABASE_URL is required"
[[ -n "$STREAM_NAME" ]] || fail "--stream-name is required"
(( ${#INPUT_FILES[@]} > 0 )) || fail "at least one --input is required"

command_exists jq || fail "jq is required"
command_exists psql || fail "psql is required"

if [[ -n "$FROM_ID" ]] && ! is_uint "$FROM_ID"; then
  fail "--from-id must be a non-negative integer"
fi
if [[ -n "$TO_ID" ]] && ! is_uint "$TO_ID"; then
  fail "--to-id must be a non-negative integer"
fi
if [[ -n "$FROM_ID" && -n "$TO_ID" ]] && (( TO_ID < FROM_ID )); then
  fail "--to-id must be >= --from-id"
fi

for input_file in "${INPUT_FILES[@]}"; do
  [[ -f "$input_file" ]] || fail "input file does not exist: $input_file"
done

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

UNSORTED_CSV="$TMP_DIR/rehydrate_unsorted.csv"
SORTED_CSV="$TMP_DIR/rehydrate_sorted.csv"
FILTERED_CSV="$TMP_DIR/rehydrate_filtered.csv"
MANIFEST_RANGES="$TMP_DIR/manifest_ranges.tsv"

: > "$UNSORTED_CSV"
: > "$MANIFEST_RANGES"

ALL_MANIFESTS_PRESENT="true"

for input_file in "${INPUT_FILES[@]}"; do
  jq -r --arg stream_name "$STREAM_NAME" '
    select(.stream_name == $stream_name) |
    [
      .id,
      .stream_name,
      .env_name,
      .topic_name,
      .event_type,
      .event_version,
      .aggregate_type,
      .aggregate_id,
      .producer_service,
      .idempotency_key,
      .correlation_id,
      .causation_id,
      (.payload | tojson),
      (.metadata | tojson),
      .created_at
    ] | @csv
  ' "$input_file" >> "$UNSORTED_CSV"

  manifest_path="${input_file}.manifest.json"
  if [[ -f "$manifest_path" ]]; then
    manifest_range="$(jq -r --arg stream_name "$STREAM_NAME" '
      select(.stream_name == $stream_name) |
      "\(.from_id)\t\(.to_id)"
    ' "$manifest_path")"

    if [[ -z "$manifest_range" ]]; then
      fail "manifest stream mismatch or missing range in $manifest_path"
    fi

    printf '%s\t%s\n' "$manifest_range" "$manifest_path" >> "$MANIFEST_RANGES"
  else
    ALL_MANIFESTS_PRESENT="false"
  fi
done

if [[ ! -s "$UNSORTED_CSV" ]]; then
  fail "no archive rows found for stream '$STREAM_NAME' in provided inputs"
fi

sort -t',' -k1,1n "$UNSORTED_CSV" > "$SORTED_CSV"

awk -F',' '
  NR == 1 { prev = $1 + 0; next }
  {
    curr = $1 + 0
    if (curr <= prev) {
      exit 1
    }
    prev = curr
  }
' "$SORTED_CSV" || fail "archive rows are not strictly increasing by id (duplicate or out-of-order ids)"

if [[ -n "$FROM_ID" || -n "$TO_ID" ]]; then
  awk -F',' -v from_id="${FROM_ID:-}" -v to_id="${TO_ID:-}" '
    {
      id = $1 + 0
      if (from_id != "" && id < from_id) next
      if (to_id != "" && id > to_id) next
      print $0
    }
  ' "$SORTED_CSV" > "$FILTERED_CSV"
else
  cp "$SORTED_CSV" "$FILTERED_CSV"
fi

if [[ ! -s "$FILTERED_CSV" ]]; then
  fail "no rows remain after applying id range filter"
fi

if [[ "$ALL_MANIFESTS_PRESENT" == "true" ]]; then
  sort -n "$MANIFEST_RANGES" > "$MANIFEST_RANGES.sorted"
  PREV_TO=""
  while IFS=$'\t' read -r RANGE_FROM RANGE_TO RANGE_FILE; do
    is_uint "$RANGE_FROM" || fail "manifest from_id is not numeric in $RANGE_FILE"
    is_uint "$RANGE_TO" || fail "manifest to_id is not numeric in $RANGE_FILE"
    if (( RANGE_TO < RANGE_FROM )); then
      fail "manifest range invalid in $RANGE_FILE"
    fi

    if [[ -n "$PREV_TO" ]]; then
      EXPECTED_FROM=$((PREV_TO + 1))
      if (( RANGE_FROM != EXPECTED_FROM )); then
        fail "manifest range not contiguous: expected from_id=$EXPECTED_FROM got $RANGE_FROM ($RANGE_FILE)"
      fi
    fi

    PREV_TO="$RANGE_TO"
  done < "$MANIFEST_RANGES.sorted"
else
  echo "warning: one or more manifest sidecars missing; skipped manifest-range contiguity check" >&2
fi

ROW_COUNT="$(wc -l < "$FILTERED_CSV" | tr -d ' ')"
MIN_ID="$(awk -F',' 'NR==1 { print $1 + 0 }' "$FILTERED_CSV")"
MAX_ID="$(awk -F',' 'END { print $1 + 0 }' "$FILTERED_CSV")"

if [[ "$DRY_RUN" == "true" ]]; then
  echo "mode=cold-preview stream=$STREAM_NAME rows=$ROW_COUNT min_id=$MIN_ID max_id=$MAX_ID input_files=${#INPUT_FILES[@]}"
  exit 0
fi

ESCAPED_FILTERED_CSV="${FILTERED_CSV//\'/\'\'}"
INSERT_RESULT="$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v stream_name="$STREAM_NAME" <<SQL
CREATE TEMP TABLE rehydrate_stage (
  id BIGINT NOT NULL,
  stream_name TEXT NOT NULL,
  env_name TEXT NOT NULL,
  topic_name TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_version INTEGER NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  producer_service TEXT NOT NULL,
  idempotency_key TEXT,
  correlation_id TEXT,
  causation_id TEXT,
  payload JSONB NOT NULL,
  metadata JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
) ON COMMIT DROP;

\\copy rehydrate_stage FROM '${ESCAPED_FILTERED_CSV}' WITH (FORMAT csv, NULL '');

WITH inserted AS (
  INSERT INTO app.event_log (
    id,
    stream_name,
    env_name,
    topic_name,
    event_type,
    event_version,
    aggregate_type,
    aggregate_id,
    producer_service,
    idempotency_key,
    correlation_id,
    causation_id,
    payload,
    metadata,
    created_at
  )
  SELECT
    id,
    stream_name,
    env_name,
    topic_name,
    event_type,
    event_version,
    aggregate_type,
    aggregate_id,
    producer_service,
    NULLIF(idempotency_key, ''),
    NULLIF(correlation_id, ''),
    NULLIF(causation_id, ''),
    payload,
    metadata,
    created_at
  FROM rehydrate_stage
  WHERE stream_name = :'stream_name'
  ORDER BY id ASC
  ON CONFLICT (id) DO NOTHING
  RETURNING id
)
SELECT 'inserted_count=' || COUNT(*) FROM inserted;

SELECT setval(
  pg_get_serial_sequence('app.event_log', 'id'),
  GREATEST((SELECT COALESCE(MAX(id), 1) FROM app.event_log), 1),
  true
);
SQL
)"

INSERTED_COUNT="$(printf '%s\n' "$INSERT_RESULT" | awk -F'=' '/inserted_count=/{print $2}' | tail -n1 | tr -d ' ')"
[[ -n "$INSERTED_COUNT" ]] || fail "failed to parse inserted count from import output"

echo "mode=cold-apply stream=$STREAM_NAME rows_input=$ROW_COUNT inserted_rows=$INSERTED_COUNT min_id=$MIN_ID max_id=$MAX_ID"
