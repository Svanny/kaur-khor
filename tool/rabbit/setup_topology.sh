#!/usr/bin/env bash
set -euo pipefail

required=(RABBIT_MGMT_URL RABBIT_MGMT_USER RABBIT_MGMT_PASS RABBIT_VHOST RABBIT_EXCHANGE_JOBS RABBIT_DLX_EXCHANGE)
for n in "${required[@]}"; do
  if [[ -z "${!n:-}" ]]; then
    echo "error: $n is required" >&2
    exit 1
  fi
done

enc_vhost="$(python3 - <<'PY'
import os, urllib.parse
print(urllib.parse.quote(os.environ['RABBIT_VHOST'], safe=''))
PY
)"

api() {
  local method="$1"
  local path="$2"
  local data="${3:-}"
  if [[ -n "$data" ]]; then
    curl -sS -u "$RABBIT_MGMT_USER:$RABBIT_MGMT_PASS" -H 'content-type: application/json' -X "$method" "$RABBIT_MGMT_URL/api$path" -d "$data" >/dev/null
  else
    curl -sS -u "$RABBIT_MGMT_USER:$RABBIT_MGMT_PASS" -H 'content-type: application/json' -X "$method" "$RABBIT_MGMT_URL/api$path" >/dev/null
  fi
}

declare_exchange() {
  local name="$1"
  api PUT "/exchanges/${enc_vhost}/${name}" '{"type":"topic","durable":true}'
}

declare_queue() {
  local name="$1"
  local args_json="$2"
  api PUT "/queues/${enc_vhost}/${name}" "{\"durable\":true,\"arguments\":${args_json}}"
}

bind_queue() {
  local exchange="$1"
  local queue="$2"
  local routing_key="$3"
  api POST "/bindings/${enc_vhost}/e/${exchange}/q/${queue}" "{\"routing_key\":\"${routing_key}\"}"
}

declare_exchange "$RABBIT_EXCHANGE_JOBS"
declare_exchange "$RABBIT_DLX_EXCHANGE"

for cls in fast heavy; do
  base="banji-core.${BANJI_ENV:-dev}.${cls}-jobs"
  primary="$base"
  dlq="$base.dlq"
  r1="$base.retry.1"
  r2="$base.retry.2"
  r3="$base.retry.3"

  declare_queue "$primary" '{"x-queue-type":"quorum"}'
  declare_queue "$dlq" '{"x-queue-type":"quorum"}'
  declare_queue "$r1" "{\"x-queue-type\":\"quorum\",\"x-message-ttl\":${RABBIT_RETRY_1_TTL_MS:-30000},\"x-dead-letter-exchange\":\"${RABBIT_EXCHANGE_JOBS}\",\"x-dead-letter-routing-key\":\"job.${cls}\"}"
  declare_queue "$r2" "{\"x-queue-type\":\"quorum\",\"x-message-ttl\":${RABBIT_RETRY_2_TTL_MS:-300000},\"x-dead-letter-exchange\":\"${RABBIT_EXCHANGE_JOBS}\",\"x-dead-letter-routing-key\":\"job.${cls}\"}"
  declare_queue "$r3" "{\"x-queue-type\":\"quorum\",\"x-message-ttl\":${RABBIT_RETRY_3_TTL_MS:-1800000},\"x-dead-letter-exchange\":\"${RABBIT_EXCHANGE_JOBS}\",\"x-dead-letter-routing-key\":\"job.${cls}\"}"

  bind_queue "$RABBIT_EXCHANGE_JOBS" "$primary" "job.${cls}"
  bind_queue "$RABBIT_DLX_EXCHANGE" "$dlq" "job.${cls}.dlq"
  bind_queue "$RABBIT_DLX_EXCHANGE" "$r1" "job.${cls}.retry.1"
  bind_queue "$RABBIT_DLX_EXCHANGE" "$r2" "job.${cls}.retry.2"
  bind_queue "$RABBIT_DLX_EXCHANGE" "$r3" "job.${cls}.retry.3"
done

echo "rabbit topology setup complete"
