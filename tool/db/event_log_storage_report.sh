#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  DATABASE_URL=... bash tool/db/event_log_storage_report.sh \
    [--output-json <path>] \
    [--output-text <path>] \
    [--retention-days <days>] \
    [--lookback-days <days>]

Outputs:
- JSON report with exact vs estimated fields explicitly labeled.
- Text summary suitable for operators.
USAGE
}

fail() {
  echo "error: $*" >&2
  exit 1
}

is_uint() {
  [[ "$1" =~ ^[0-9]+$ ]]
}

[[ -n "${DATABASE_URL:-}" ]] || fail "DATABASE_URL is required"

OUTPUT_JSON="build/event-log/storage_report.json"
OUTPUT_TEXT="build/event-log/storage_report.txt"
RETENTION_DAYS="${EVENT_LOG_RETENTION_DAYS:-30}"
LOOKBACK_DAYS="7"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --output-json) OUTPUT_JSON="$2"; shift 2 ;;
    --output-text) OUTPUT_TEXT="$2"; shift 2 ;;
    --retention-days) RETENTION_DAYS="$2"; shift 2 ;;
    --lookback-days) LOOKBACK_DAYS="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) fail "unknown arg $1" ;;
  esac
done

is_uint "$RETENTION_DAYS" || fail "retention days must be a non-negative integer"
is_uint "$LOOKBACK_DAYS" || fail "lookback days must be a non-negative integer"

mkdir -p "$(dirname "$OUTPUT_JSON")"
mkdir -p "$(dirname "$OUTPUT_TEXT")"

REPORT_JSON="$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v retention_days="$RETENTION_DAYS" -v lookback_days="$LOOKBACK_DAYS" -Atqc "
WITH total_size AS (
  SELECT pg_total_relation_size('app.event_log')::bigint AS total_table_bytes_exact
), per_stream_rows AS (
  SELECT
    e.stream_name,
    COUNT(*)::bigint AS row_count_exact,
    AVG(pg_column_size(e.*))::numeric AS avg_row_bytes_estimated
  FROM app.event_log e
  GROUP BY e.stream_name
), recent_daily AS (
  SELECT
    stream_name,
    date_trunc('day', created_at)::date AS day,
    COUNT(*)::numeric AS day_rows
  FROM app.event_log
  WHERE created_at >= NOW() - make_interval(days => :lookback_days::integer)
  GROUP BY stream_name, date_trunc('day', created_at)::date
), recent_rate AS (
  SELECT
    stream_name,
    COALESCE(AVG(day_rows), 0)::numeric AS avg_rows_per_day_estimated
  FROM recent_daily
  GROUP BY stream_name
), per_stream AS (
  SELECT
    r.stream_name,
    r.row_count_exact,
    COALESCE(r.avg_row_bytes_estimated, 0)::numeric AS avg_row_bytes_estimated,
    (r.row_count_exact * COALESCE(r.avg_row_bytes_estimated, 0))::numeric AS estimated_bytes_current,
    (COALESCE(rr.avg_rows_per_day_estimated, 0) * 30 * COALESCE(r.avg_row_bytes_estimated, 0))::numeric AS estimated_monthly_growth_bytes,
    (COALESCE(rr.avg_rows_per_day_estimated, 0) * :retention_days::integer * COALESCE(r.avg_row_bytes_estimated, 0))::numeric AS estimated_retained_bytes
  FROM per_stream_rows r
  LEFT JOIN recent_rate rr ON rr.stream_name = r.stream_name
)
SELECT jsonb_build_object(
  'generated_at', to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'retention_days', :retention_days::integer,
  'lookback_days_for_growth_estimate', :lookback_days::integer,
  'exact', jsonb_build_object(
    'total_table_bytes_exact', (SELECT total_table_bytes_exact FROM total_size),
    'per_stream_row_counts_exact', COALESCE(
      (SELECT jsonb_object_agg(stream_name, row_count_exact ORDER BY stream_name) FROM per_stream),
      '{}'::jsonb
    )
  ),
  'estimated', jsonb_build_object(
    'method', 'avg_row_bytes_per_stream * row_counts; growth from recent daily averages',
    'per_stream', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'stream_name', stream_name,
            'avg_row_bytes_estimated', avg_row_bytes_estimated,
            'estimated_bytes_current', estimated_bytes_current,
            'estimated_monthly_growth_bytes', estimated_monthly_growth_bytes,
            'estimated_retained_bytes', estimated_retained_bytes
          )
          ORDER BY stream_name
        )
        FROM per_stream
      ),
      '[]'::jsonb
    )
  )
)::text;
")"

if command -v jq >/dev/null 2>&1; then
  printf '%s\n' "$REPORT_JSON" | jq '.' > "$OUTPUT_JSON"
else
  printf '%s\n' "$REPORT_JSON" > "$OUTPUT_JSON"
fi

TOTAL_BYTES_EXACT="$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -Atqc "SELECT pg_total_relation_size('app.event_log')::bigint;")"

{
  echo "event_log_storage_report"
  echo "generated_at_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "retention_days=$RETENTION_DAYS"
  echo "lookback_days_for_growth_estimate=$LOOKBACK_DAYS"
  echo ""
  echo "Exact metrics"
  echo "- total_table_bytes_exact=$TOTAL_BYTES_EXACT"
  echo ""
  echo "Per-stream metrics (row_count_exact is exact; byte and growth columns are estimated)"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v retention_days="$RETENTION_DAYS" -v lookback_days="$LOOKBACK_DAYS" -P footer=off -c "
WITH per_stream_rows AS (
  SELECT
    e.stream_name,
    COUNT(*)::bigint AS row_count_exact,
    AVG(pg_column_size(e.*))::numeric AS avg_row_bytes_estimated
  FROM app.event_log e
  GROUP BY e.stream_name
), recent_daily AS (
  SELECT
    stream_name,
    date_trunc('day', created_at)::date AS day,
    COUNT(*)::numeric AS day_rows
  FROM app.event_log
  WHERE created_at >= NOW() - make_interval(days => :lookback_days::integer)
  GROUP BY stream_name, date_trunc('day', created_at)::date
), recent_rate AS (
  SELECT
    stream_name,
    COALESCE(AVG(day_rows), 0)::numeric AS avg_rows_per_day_estimated
  FROM recent_daily
  GROUP BY stream_name
)
SELECT
  r.stream_name,
  r.row_count_exact,
  ROUND(COALESCE(r.avg_row_bytes_estimated, 0), 2) AS avg_row_bytes_estimated,
  ROUND(r.row_count_exact * COALESCE(r.avg_row_bytes_estimated, 0), 2) AS estimated_bytes_current,
  ROUND(COALESCE(rr.avg_rows_per_day_estimated, 0) * 30 * COALESCE(r.avg_row_bytes_estimated, 0), 2) AS estimated_monthly_growth_bytes,
  ROUND(COALESCE(rr.avg_rows_per_day_estimated, 0) * :retention_days::integer * COALESCE(r.avg_row_bytes_estimated, 0), 2) AS estimated_retained_bytes
FROM per_stream_rows r
LEFT JOIN recent_rate rr ON rr.stream_name = r.stream_name
ORDER BY r.stream_name;
"
} > "$OUTPUT_TEXT"

echo "storage report complete json=$OUTPUT_JSON text=$OUTPUT_TEXT"
