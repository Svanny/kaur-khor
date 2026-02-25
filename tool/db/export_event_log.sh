#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  DATABASE_URL=... bash tool/db/export_event_log.sh \
    --stream-name <name> \
    --output <jsonl_path> \
    --manifest-output <manifest_json_path> \
    [--before <timestamp>] \
    [--to-id <event_id>] \
    [--archive-uri <file://...|s3://...>] \
    [--prune] \
    [--prune-batch-size <n>] \
    [--dry-run]

Notes:
- Boundary authority is event id (`to_id` / resolved eligible max id).
- `--before` is a convenience selector; when omitted, retention window is used.
- Cursor advance and prune happen only after export verification.
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

sha256_file() {
  local file_path="$1"
  if command_exists sha256sum; then
    sha256sum "$file_path" | awk '{print $1}'
  else
    shasum -a 256 "$file_path" | awk '{print $1}'
  fi
}

parse_s3_uri() {
  local uri="$1"
  local without_scheme="${uri#s3://}"
  S3_BUCKET="${without_scheme%%/*}"
  S3_KEY="${without_scheme#*/}"
  if [[ -z "$S3_BUCKET" || -z "$S3_KEY" || "$S3_BUCKET" == "$S3_KEY" ]]; then
    fail "invalid s3 uri: $uri"
  fi
}

verify_local_file() {
  local expected_path="$1"
  local expected_size="$2"
  local expected_sha256="$3"

  [[ -f "$expected_path" ]] || fail "archive file missing at $expected_path"

  local actual_size actual_sha256
  actual_size="$(wc -c < "$expected_path" | tr -d ' ')"
  actual_sha256="$(sha256_file "$expected_path")"

  [[ "$actual_size" == "$expected_size" ]] || fail "archive size mismatch: expected $expected_size got $actual_size"
  [[ "$actual_sha256" == "$expected_sha256" ]] || fail "archive sha256 mismatch: expected $expected_sha256 got $actual_sha256"
}

STREAM_NAME=""
BEFORE_TS=""
TO_ID_OVERRIDE=""
OUTPUT_PATH=""
MANIFEST_OUTPUT=""
ARCHIVE_URI=""
PRUNE="false"
DRY_RUN="false"
PRUNE_BATCH_SIZE="${EVENT_LOG_PRUNE_BATCH_SIZE:-1000}"
RETENTION_DAYS="${EVENT_LOG_RETENTION_DAYS:-30}"
ARCHIVE_ENCRYPTION_REQUIRED="${EVENT_LOG_ARCHIVE_ENCRYPTION_REQUIRED:-true}"
ARCHIVE_ENCRYPTION_REQUIRED_NORMALIZED="$(printf '%s' "$ARCHIVE_ENCRYPTION_REQUIRED" | tr '[:upper:]' '[:lower:]')"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --stream-name) STREAM_NAME="$2"; shift 2 ;;
    --before) BEFORE_TS="$2"; shift 2 ;;
    --to-id) TO_ID_OVERRIDE="$2"; shift 2 ;;
    --output) OUTPUT_PATH="$2"; shift 2 ;;
    --manifest-output) MANIFEST_OUTPUT="$2"; shift 2 ;;
    --archive-uri) ARCHIVE_URI="$2"; shift 2 ;;
    --prune) PRUNE="true"; shift 1 ;;
    --prune-batch-size) PRUNE_BATCH_SIZE="$2"; shift 2 ;;
    --dry-run) DRY_RUN="true"; shift 1 ;;
    -h|--help) usage; exit 0 ;;
    *) fail "unknown arg $1" ;;
  esac
done

[[ -n "${DATABASE_URL:-}" ]] || fail "DATABASE_URL is required"
[[ -n "$STREAM_NAME" ]] || fail "--stream-name is required"
[[ -n "$OUTPUT_PATH" ]] || fail "--output is required"
[[ -n "$MANIFEST_OUTPUT" ]] || fail "--manifest-output is required"

is_uint "$RETENTION_DAYS" || fail "EVENT_LOG_RETENTION_DAYS must be a non-negative integer"
is_uint "$PRUNE_BATCH_SIZE" || fail "--prune-batch-size must be a non-negative integer"

if [[ -n "$TO_ID_OVERRIDE" && -n "$BEFORE_TS" ]]; then
  fail "--before and --to-id are mutually exclusive"
fi

if [[ -n "$TO_ID_OVERRIDE" ]] && ! is_uint "$TO_ID_OVERRIDE"; then
  fail "--to-id must be a non-negative integer"
fi

mkdir -p "$(dirname "$OUTPUT_PATH")"
mkdir -p "$(dirname "$MANIFEST_OUTPUT")"

ABS_OUTPUT_PATH="$(cd "$(dirname "$OUTPUT_PATH")" && pwd)/$(basename "$OUTPUT_PATH")"
if [[ -z "$ARCHIVE_URI" ]]; then
  ARCHIVE_URI="file://${ABS_OUTPUT_PATH}"
fi

PSQL_BASE=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v stream_name="$STREAM_NAME")

LOCK_ACQUIRED="false"
cleanup() {
  if [[ "$LOCK_ACQUIRED" == "true" ]]; then
    "${PSQL_BASE[@]}" -Atqc "SELECT pg_advisory_unlock(hashtextextended(:'stream_name', 0)::bigint);" >/dev/null || true
  fi
}
trap cleanup EXIT

LOCK_RESULT="$("${PSQL_BASE[@]}" -Atqc "SELECT pg_try_advisory_lock(hashtextextended(:'stream_name', 0)::bigint);")"
if [[ "$LOCK_RESULT" != "t" ]]; then
  echo "error: lock_contended stream=$STREAM_NAME" >&2
  exit 20
fi
LOCK_ACQUIRED="true"

LAST_EXPORTED_ID="$("${PSQL_BASE[@]}" -Atqc "
SELECT COALESCE((
  SELECT last_exported_event_id
  FROM app.event_log_archive_export_cursor
  WHERE stream_name = :'stream_name'
), 0);
")"

if [[ -n "$TO_ID_OVERRIDE" ]]; then
  ELIGIBLE_MAX_ID="$TO_ID_OVERRIDE"
  CUTOFF_DESCRIPTION="to_id_override:$TO_ID_OVERRIDE"
elif [[ -n "$BEFORE_TS" ]]; then
  ELIGIBLE_MAX_ID="$("${PSQL_BASE[@]}" -v before_ts="$BEFORE_TS" -Atqc "
SELECT COALESCE(MAX(id), 0)
FROM app.event_log
WHERE stream_name = :'stream_name'
  AND created_at < (:'before_ts')::timestamptz;
")"
  CUTOFF_DESCRIPTION="before:$BEFORE_TS"
else
  ELIGIBLE_MAX_ID="$("${PSQL_BASE[@]}" -v retention_days="$RETENTION_DAYS" -Atqc "
SELECT COALESCE(MAX(id), 0)
FROM app.event_log
WHERE stream_name = :'stream_name'
  AND created_at < NOW() - make_interval(days => :retention_days::integer);
")"
  CUTOFF_DESCRIPTION="retention_days:$RETENTION_DAYS"
fi

is_uint "$LAST_EXPORTED_ID" || fail "cursor last_exported_event_id is not numeric"
is_uint "$ELIGIBLE_MAX_ID" || fail "eligible max id is not numeric"

FROM_ID=$((LAST_EXPORTED_ID + 1))

if (( ELIGIBLE_MAX_ID < FROM_ID )); then
  CANDIDATE_ROW_COUNT="0"
  : > "$OUTPUT_PATH"
else
  CANDIDATE_ROW_COUNT="$("${PSQL_BASE[@]}" -v from_id="$FROM_ID" -v to_id="$ELIGIBLE_MAX_ID" -Atqc "
SELECT COUNT(*)
FROM app.event_log
WHERE stream_name = :'stream_name'
  AND id >= :from_id::bigint
  AND id <= :to_id::bigint;
")"

  "${PSQL_BASE[@]}" -v from_id="$FROM_ID" -v to_id="$ELIGIBLE_MAX_ID" -c "\\copy (
    SELECT row_to_json(t)
    FROM (
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
        idempotency_key,
        correlation_id,
        causation_id,
        payload,
        metadata,
        payload_size_bytes,
        created_at
      FROM app.event_log
      WHERE stream_name = :'stream_name'
        AND id >= :from_id::bigint
        AND id <= :to_id::bigint
      ORDER BY id ASC
    ) AS t
  ) TO STDOUT" > "$OUTPUT_PATH"
fi

EXPORTED_ROW_COUNT="$(wc -l < "$OUTPUT_PATH" | tr -d ' ')"
FILE_SIZE_BYTES="$(wc -c < "$OUTPUT_PATH" | tr -d ' ')"
FILE_SHA256="$(sha256_file "$OUTPUT_PATH")"

[[ "$CANDIDATE_ROW_COUNT" == "$EXPORTED_ROW_COUNT" ]] || fail "rowcount mismatch candidate=$CANDIDATE_ROW_COUNT exported=$EXPORTED_ROW_COUNT"

CREATED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
cat > "$MANIFEST_OUTPUT" <<JSON
{
  "stream_name": "${STREAM_NAME}",
  "from_id": ${FROM_ID},
  "to_id": ${ELIGIBLE_MAX_ID},
  "candidate_row_count": ${CANDIDATE_ROW_COUNT},
  "exported_row_count": ${EXPORTED_ROW_COUNT},
  "file_size_bytes": ${FILE_SIZE_BYTES},
  "sha256": "${FILE_SHA256}",
  "created_at": "${CREATED_AT}",
  "archive_uri": "${ARCHIVE_URI}",
  "cutoff_selector": "${CUTOFF_DESCRIPTION}",
  "dry_run": ${DRY_RUN}
}
JSON

MANIFEST_SHA256="$(sha256_file "$MANIFEST_OUTPUT")"
MANIFEST_URI="${ARCHIVE_URI}.manifest.json"

if [[ "$DRY_RUN" == "false" ]]; then
  case "$ARCHIVE_URI" in
    file://*)
      TARGET_FILE_PATH="${ARCHIVE_URI#file://}"
      TARGET_MANIFEST_PATH="${MANIFEST_URI#file://}"

      mkdir -p "$(dirname "$TARGET_FILE_PATH")"
      if [[ "$TARGET_FILE_PATH" != "$ABS_OUTPUT_PATH" ]]; then
        cp "$OUTPUT_PATH" "$TARGET_FILE_PATH"
      fi
      cp "$MANIFEST_OUTPUT" "$TARGET_MANIFEST_PATH"

      verify_local_file "$TARGET_FILE_PATH" "$FILE_SIZE_BYTES" "$FILE_SHA256"
      verify_local_file "$TARGET_MANIFEST_PATH" "$(wc -c < "$MANIFEST_OUTPUT" | tr -d ' ')" "$MANIFEST_SHA256"
      ;;
    s3://*)
      command_exists aws || fail "aws cli is required for s3 archive uri"

      SSE_ARGS=()
      if [[ "$ARCHIVE_ENCRYPTION_REQUIRED_NORMALIZED" == "true" ]]; then
        SSE_ARGS=(--sse "${EVENT_LOG_ARCHIVE_SSE:-AES256}")
      fi

      aws s3 cp "$OUTPUT_PATH" "$ARCHIVE_URI" --only-show-errors --metadata "sha256=${FILE_SHA256}" "${SSE_ARGS[@]}"
      aws s3 cp "$MANIFEST_OUTPUT" "$MANIFEST_URI" --only-show-errors --metadata "sha256=${MANIFEST_SHA256}" "${SSE_ARGS[@]}"

      parse_s3_uri "$ARCHIVE_URI"
      REMOTE_SIZE="$(aws s3api head-object --bucket "$S3_BUCKET" --key "$S3_KEY" --query 'ContentLength' --output text)"
      REMOTE_SHA256="$(aws s3api head-object --bucket "$S3_BUCKET" --key "$S3_KEY" --query 'Metadata.sha256' --output text)"
      [[ "$REMOTE_SIZE" == "$FILE_SIZE_BYTES" ]] || fail "remote size mismatch expected=$FILE_SIZE_BYTES got=$REMOTE_SIZE"
      [[ "$REMOTE_SHA256" == "$FILE_SHA256" ]] || fail "remote sha256 mismatch expected=$FILE_SHA256 got=$REMOTE_SHA256"

      parse_s3_uri "$MANIFEST_URI"
      REMOTE_MANIFEST_SHA256="$(aws s3api head-object --bucket "$S3_BUCKET" --key "$S3_KEY" --query 'Metadata.sha256' --output text)"
      [[ "$REMOTE_MANIFEST_SHA256" == "$MANIFEST_SHA256" ]] || fail "remote manifest sha256 mismatch"
      ;;
    *)
      fail "unsupported archive uri scheme for verification: $ARCHIVE_URI"
      ;;
  esac

  "${PSQL_BASE[@]}" -v verified_to_id="$ELIGIBLE_MAX_ID" -c "
INSERT INTO app.event_log_archive_export_cursor (
  stream_name,
  last_exported_event_id,
  last_exported_at,
  updated_at
) VALUES (
  :'stream_name',
  :verified_to_id::bigint,
  NOW(),
  NOW()
)
ON CONFLICT (stream_name)
DO UPDATE SET
  last_exported_event_id = GREATEST(app.event_log_archive_export_cursor.last_exported_event_id, EXCLUDED.last_exported_event_id),
  last_exported_at = NOW(),
  updated_at = NOW();
"
else
  echo "dry_run=true: skipped archive upload/verification, cursor update, and prune"
fi

if [[ "$PRUNE" == "true" ]]; then
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "dry_run=true: prune skipped"
  else
    if (( ELIGIBLE_MAX_ID < FROM_ID )); then
      echo "prune skipped: no verified rows in range"
    else
      DELETED_TOTAL=0
      while true; do
        BATCH_DELETED="$("${PSQL_BASE[@]}" -v from_id="$FROM_ID" -v to_id="$ELIGIBLE_MAX_ID" -v prune_batch_size="$PRUNE_BATCH_SIZE" -Atqc "
WITH candidate AS (
  SELECT id
  FROM app.event_log
  WHERE stream_name = :'stream_name'
    AND id >= :from_id::bigint
    AND id <= :to_id::bigint
  ORDER BY id ASC
  LIMIT :prune_batch_size::integer
), deleted AS (
  DELETE FROM app.event_log e
  USING candidate c
  WHERE e.id = c.id
  RETURNING e.id
)
SELECT COUNT(*) FROM deleted;
")"

        if (( BATCH_DELETED == 0 )); then
          break
        fi

        DELETED_TOTAL=$((DELETED_TOTAL + BATCH_DELETED))
      done

      [[ "$DELETED_TOTAL" == "$CANDIDATE_ROW_COUNT" ]] || fail "prune count mismatch expected=$CANDIDATE_ROW_COUNT actual=$DELETED_TOTAL"
    fi
  fi
fi

echo "export complete stream=$STREAM_NAME from_id=$FROM_ID to_id=$ELIGIBLE_MAX_ID candidate_rows=$CANDIDATE_ROW_COUNT exported_rows=$EXPORTED_ROW_COUNT archive_uri=$ARCHIVE_URI manifest=$MANIFEST_OUTPUT"
