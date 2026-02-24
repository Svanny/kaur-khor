#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${API_BASE_URL:-http://127.0.0.1:8080}"
WRITE_PATH="${WRITE_PATH:-/v1/write-demo}"
DIRECT_DATABASE_URL="${DIRECT_DATABASE_URL:-}"
PGBOUNCER_ADMIN_URL="${PGBOUNCER_ADMIN_URL:-}"
LOAD_CONCURRENCY="${LOAD_CONCURRENCY:-20}"
TOTAL_REQUESTS="${TOTAL_REQUESTS:-200}"
CONNECTION_LIMIT="${CONNECTION_LIMIT:-10}"
SAMPLE_INTERVAL_SECONDS="${SAMPLE_INTERVAL_SECONDS:-1}"

if [[ -z "$DIRECT_DATABASE_URL" ]]; then
  echo "error: DIRECT_DATABASE_URL is required" >&2
  exit 1
fi

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "error: missing required command '$1'" >&2
    exit 1
  }
}

require_cmd curl
require_cmd psql
require_cmd awk
require_cmd sort
require_cmd mktemp

report_file="$(mktemp -t pool-stability-report.XXXXXX)"
latency_file="$(mktemp -t pool-stability-latency.XXXXXX)"
connections_file="$(mktemp -t pool-stability-connections.XXXXXX)"

cleanup() {
  rm -f "$latency_file" "$connections_file"
}
trap cleanup EXIT

sample_connections() {
  local count
  count="$(psql "$DIRECT_DATABASE_URL" -Atq -c "SELECT count(*) FROM pg_stat_activity WHERE application_name LIKE 'banji-core-%';")"
  count="${count:-0}"
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$count" >> "$connections_file"
}

send_request() {
  local i="$1"
  local caller="smoke-caller-$i"
  local idem="smoke-idem-$i"
  local body='{"operation":"smoke-check","payload":{"sku":"smoke-sku","qty":1}}'
  curl -sS -o /dev/null \
    -w "%{http_code} %{time_total}\n" \
    -X POST "${API_BASE_URL}${WRITE_PATH}" \
    -H "content-type: application/json" \
    -H "x-caller-id: ${caller}" \
    -H "idempotency-key: ${idem}" \
    --data "$body"
}

export -f send_request
export API_BASE_URL WRITE_PATH

echo "pool_stability_smoke_start=$(date -u +%Y-%m-%dT%H:%M:%SZ)" | tee -a "$report_file"
echo "api_base_url=$API_BASE_URL" | tee -a "$report_file"
echo "load_concurrency=$LOAD_CONCURRENCY" | tee -a "$report_file"
echo "total_requests=$TOTAL_REQUESTS" | tee -a "$report_file"
echo "connection_limit=$CONNECTION_LIMIT" | tee -a "$report_file"

sample_connections

{
  seq 1 "$TOTAL_REQUESTS" | xargs -P "$LOAD_CONCURRENCY" -I{} bash -lc 'send_request "$@"' _ {}
} > "$latency_file" &
load_pid=$!

while kill -0 "$load_pid" >/dev/null 2>&1; do
  sample_connections
  sleep "$SAMPLE_INTERVAL_SECONDS"
done
wait "$load_pid"

sample_connections

bad_status_count="$(awk '$1 !~ /^2/ {c++} END {print c+0}' "$latency_file")"
p95_latency="$(awk '{print $2}' "$latency_file" | sort -n | awk 'BEGIN{c=0} {a[++c]=$1} END{if (c==0){print 0; exit} idx=int(c*0.95); if (idx<1) idx=1; print a[idx]}' )"
max_connection_count="$(awk '{if ($2>max) max=$2} END {print max+0}' "$connections_file")"

if [[ -n "$PGBOUNCER_ADMIN_URL" ]]; then
  echo "pgbouncer_snapshot_begin" >> "$report_file"
  psql "$PGBOUNCER_ADMIN_URL" -c "SHOW POOLS;" >> "$report_file" || true
  psql "$PGBOUNCER_ADMIN_URL" -c "SHOW STATS;" >> "$report_file" || true
  echo "pgbouncer_snapshot_end" >> "$report_file"
fi

echo "max_connection_count=$max_connection_count" | tee -a "$report_file"
echo "p95_latency_seconds=$p95_latency" | tee -a "$report_file"
echo "non_2xx_count=$bad_status_count" | tee -a "$report_file"

echo "connection_samples_begin" >> "$report_file"
cat "$connections_file" >> "$report_file"
echo "connection_samples_end" >> "$report_file"

echo "latency_samples_begin" >> "$report_file"
cat "$latency_file" >> "$report_file"
echo "latency_samples_end" >> "$report_file"

if [[ "$bad_status_count" -gt 0 ]]; then
  echo "result=FAIL reason=non_2xx_responses" | tee -a "$report_file"
  echo "report_file=$report_file"
  exit 1
fi

if [[ "$max_connection_count" -gt "$CONNECTION_LIMIT" ]]; then
  echo "result=FAIL reason=connection_limit_exceeded" | tee -a "$report_file"
  echo "report_file=$report_file"
  exit 1
fi

echo "result=PASS" | tee -a "$report_file"
echo "report_file=$report_file"
