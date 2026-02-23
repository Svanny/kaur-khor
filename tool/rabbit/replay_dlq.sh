#!/usr/bin/env bash
set -euo pipefail

required=(RABBIT_MGMT_URL RABBIT_MGMT_USER RABBIT_MGMT_PASS RABBIT_VHOST RABBIT_EXCHANGE_JOBS OPERATOR_ID REPLAY_REASON)
for n in "${required[@]}"; do
  if [[ -z "${!n:-}" ]]; then
    echo "error: $n is required" >&2
    exit 1
  fi
done

DLQ_NAME="${DLQ_NAME:-}"
TARGET_ROUTING_KEY="${TARGET_ROUTING_KEY:-}"
MAX_MESSAGES="${MAX_MESSAGES:-10}"
REPLAY_RATE_PER_MIN="${REPLAY_RATE_PER_MIN:-60}"
RETAIN_ATTEMPT="${RETAIN_ATTEMPT:-true}"

if [[ -z "$DLQ_NAME" || -z "$TARGET_ROUTING_KEY" ]]; then
  echo "error: DLQ_NAME and TARGET_ROUTING_KEY are required" >&2
  exit 1
fi

enc_vhost="$(python3 - <<'PY'
import os, urllib.parse
print(urllib.parse.quote(os.environ['RABBIT_VHOST'], safe=''))
PY
)"

delay="$(python3 - <<PY
rpm=int(${REPLAY_RATE_PER_MIN})
print(60.0/rpm if rpm>0 else 0)
PY
)"

for ((i=0; i<MAX_MESSAGES; i++)); do
  msg="$(curl -sS -u "$RABBIT_MGMT_USER:$RABBIT_MGMT_PASS" -H 'content-type: application/json' \
    -X POST "$RABBIT_MGMT_URL/api/queues/${enc_vhost}/${DLQ_NAME}/get" \
    -d '{"count":1,"ackmode":"ack_requeue_false","encoding":"auto","truncate":500000}')"

  payload="$(echo "$msg" | jq -r '.[0] // empty')"
  if [[ -z "$payload" ]]; then
    break
  fi

  body="$(echo "$payload" | jq -r '.payload')"
  props="$(echo "$payload" | jq '.properties // {}')"

  if [[ "$RETAIN_ATTEMPT" != "true" ]]; then
    props="$(echo "$props" | jq '.headers = ((.headers // {}) + {"x-attempt":1}') )"
  fi

  props="$(echo "$props" | jq --arg op "$OPERATOR_ID" --arg reason "$REPLAY_REASON" --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '.headers = ((.headers // {}) + {"x-replay-operator":$op,"x-replay-reason":$reason,"x-replayed-at":$ts})')"

  curl -sS -u "$RABBIT_MGMT_USER:$RABBIT_MGMT_PASS" -H 'content-type: application/json' \
    -X POST "$RABBIT_MGMT_URL/api/exchanges/${enc_vhost}/${RABBIT_EXCHANGE_JOBS}/publish" \
    -d "{\"properties\":${props},\"routing_key\":\"${TARGET_ROUTING_KEY}\",\"payload\":${body},\"payload_encoding\":\"string\"}" >/dev/null

  sleep "$delay"
done

echo "dlq replay complete"
