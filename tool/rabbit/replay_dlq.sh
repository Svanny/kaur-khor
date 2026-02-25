#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${MAX_MESSAGES:-}" || -n "${REPLAY_RATE_PER_MIN:-}" || -n "${RETAIN_ATTEMPT:-}" || -n "${TARGET_ROUTING_KEY:-}" ]]; then
  echo "error: legacy replay env vars detected; use RABBIT_REPLAY_* names only" >&2
  exit 1
fi

required=(RABBIT_MGMT_URL RABBIT_MGMT_USER RABBIT_MGMT_PASS RABBIT_VHOST BANJI_ENV OPERATOR_ID REPLAY_REASON DLQ_NAME)
for n in "${required[@]}"; do
  if [[ -z "${!n:-}" ]]; then
    echo "error: $n is required" >&2
    exit 1
  fi
done

if [[ ! "${DLQ_NAME}" =~ \.dlq$ ]]; then
  echo "error: DLQ_NAME must match controlled pattern '*.dlq'" >&2
  exit 1
fi

BANJI_SYSTEM="${BANJI_SYSTEM:-banji-core}"
RABBIT_EXCHANGE_JOBS="${RABBIT_EXCHANGE_JOBS:-${BANJI_SYSTEM}.${BANJI_ENV}.jobs}"
RABBIT_EXCHANGE_JOBS_REPLAY="${RABBIT_EXCHANGE_JOBS_REPLAY:-${BANJI_SYSTEM}.${BANJI_ENV}.jobs.replay}"
RABBIT_REPLAY_TARGET_EXCHANGE="${RABBIT_REPLAY_TARGET_EXCHANGE:-$RABBIT_EXCHANGE_JOBS_REPLAY}"
RABBIT_REPLAY_TARGET_ROUTING_KEY="${RABBIT_REPLAY_TARGET_ROUTING_KEY:-}"
RABBIT_REPLAY_MAX_MESSAGES="${RABBIT_REPLAY_MAX_MESSAGES:-10}"
RABBIT_REPLAY_RATE_PER_MIN="${RABBIT_REPLAY_RATE_PER_MIN:-60}"
RABBIT_REPLAY_RETAIN_ATTEMPT="${RABBIT_REPLAY_RETAIN_ATTEMPT:-true}"
RABBIT_REPLAY_ALLOW_PRIMARY_EXCHANGE="${RABBIT_REPLAY_ALLOW_PRIMARY_EXCHANGE:-false}"
RABBIT_REPLAY_AUDIT_LOG="${RABBIT_REPLAY_AUDIT_LOG:-/tmp/rabbit_replay_audit.jsonl}"

if [[ -z "$RABBIT_REPLAY_TARGET_ROUTING_KEY" ]]; then
  echo "error: RABBIT_REPLAY_TARGET_ROUTING_KEY is required" >&2
  exit 1
fi

if [[ "$RABBIT_REPLAY_TARGET_EXCHANGE" != "$RABBIT_EXCHANGE_JOBS_REPLAY" ]]; then
  if [[ "$RABBIT_REPLAY_TARGET_EXCHANGE" != "$RABBIT_EXCHANGE_JOBS" || "$RABBIT_REPLAY_ALLOW_PRIMARY_EXCHANGE" != "true" ]]; then
    echo "error: target exchange is not allowlisted (allowed: replay exchange by default, primary only with RABBIT_REPLAY_ALLOW_PRIMARY_EXCHANGE=true)" >&2
    exit 1
  fi
fi

if ! [[ "$RABBIT_REPLAY_MAX_MESSAGES" =~ ^[0-9]+$ ]] || [[ "$RABBIT_REPLAY_MAX_MESSAGES" -le 0 ]]; then
  echo "error: RABBIT_REPLAY_MAX_MESSAGES must be a positive integer" >&2
  exit 1
fi
if ! [[ "$RABBIT_REPLAY_RATE_PER_MIN" =~ ^[0-9]+$ ]] || [[ "$RABBIT_REPLAY_RATE_PER_MIN" -le 0 ]]; then
  echo "error: RABBIT_REPLAY_RATE_PER_MIN must be a positive integer" >&2
  exit 1
fi
if [[ "$RABBIT_REPLAY_RETAIN_ATTEMPT" != "true" && "$RABBIT_REPLAY_RETAIN_ATTEMPT" != "false" ]]; then
  echo "error: RABBIT_REPLAY_RETAIN_ATTEMPT must be true|false" >&2
  exit 1
fi

enc_vhost="$(python3 - <<'PY'
import os, urllib.parse
print(urllib.parse.quote(os.environ['RABBIT_VHOST'], safe=''))
PY
)"

delay="$(python3 - <<PY
rpm=int(${RABBIT_REPLAY_RATE_PER_MIN})
print(60.0/rpm)
PY
)"

REPLAY_ID="$(python3 - <<'PY'
import uuid
print(str(uuid.uuid4()))
PY
)"

mkdir -p "$(dirname "$RABBIT_REPLAY_AUDIT_LOG")"

audit_event() {
  local status="$1"
  local message_id="$2"
  local detail="$3"
  local ts
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  local record
  record="$(jq -cn \
    --arg ts "$ts" \
    --arg env "$BANJI_ENV" \
    --arg replay_id "$REPLAY_ID" \
    --arg dlq "$DLQ_NAME" \
    --arg target_exchange "$RABBIT_REPLAY_TARGET_EXCHANGE" \
    --arg target_routing_key "$RABBIT_REPLAY_TARGET_ROUTING_KEY" \
    --arg operator "$OPERATOR_ID" \
    --arg reason "$REPLAY_REASON" \
    --arg message_id "$message_id" \
    --arg status "$status" \
    --arg detail "$detail" \
    '{timestamp:$ts, env:$env, replay_id:$replay_id, dlq:$dlq, target_exchange:$target_exchange, target_routing_key:$target_routing_key, operator:$operator, reason:$reason, message_id:$message_id, status:$status, detail:$detail}')"
  echo "$record" >> "$RABBIT_REPLAY_AUDIT_LOG"
}

echo "replay config:"
echo "  BANJI_ENV=$BANJI_ENV"
echo "  DLQ_NAME=$DLQ_NAME"
echo "  RABBIT_REPLAY_TARGET_EXCHANGE=$RABBIT_REPLAY_TARGET_EXCHANGE"
echo "  RABBIT_REPLAY_TARGET_ROUTING_KEY=$RABBIT_REPLAY_TARGET_ROUTING_KEY"
echo "  RABBIT_REPLAY_MAX_MESSAGES=$RABBIT_REPLAY_MAX_MESSAGES"
echo "  RABBIT_REPLAY_RATE_PER_MIN=$RABBIT_REPLAY_RATE_PER_MIN"
echo "  RABBIT_REPLAY_RETAIN_ATTEMPT=$RABBIT_REPLAY_RETAIN_ATTEMPT"
echo "  REPLAY_ID=$REPLAY_ID"
echo "  AUDIT_LOG=$RABBIT_REPLAY_AUDIT_LOG"

messages="$(curl -sS -u "$RABBIT_MGMT_USER:$RABBIT_MGMT_PASS" -H 'content-type: application/json' \
  -X POST "$RABBIT_MGMT_URL/api/queues/${enc_vhost}/${DLQ_NAME}/get" \
  -d "$(jq -cn --argjson count "$RABBIT_REPLAY_MAX_MESSAGES" '{count:$count, ackmode:"ack_requeue_true", encoding:"auto", truncate:500000}')")"

msg_count="$(echo "$messages" | jq 'length')"
if [[ "$msg_count" == "0" ]]; then
  echo "no messages available in DLQ"
  exit 0
fi

for ((i=0; i<msg_count; i++)); do
  payload="$(echo "$messages" | jq ".[$i]")"
  body="$(echo "$payload" | jq -r '.payload')"
  props="$(echo "$payload" | jq '.properties // {}')"
  msg_id="$(echo "$payload" | jq -r '.properties.message_id // .payload_bytes // "unknown"')"
  now_ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  if [[ "$RABBIT_REPLAY_RETAIN_ATTEMPT" != "true" ]]; then
    props="$(echo "$props" | jq '.headers = ((.headers // {}) + {"x-attempt":1}') )"
  fi

  props="$(echo "$props" | jq \
    --arg op "$OPERATOR_ID" \
    --arg reason "$REPLAY_REASON" \
    --arg ts "$now_ts" \
    --arg replay_id "$REPLAY_ID" \
    '.headers = ((.headers // {}) + {"x-replayed":"true","x-replay-id":$replay_id,"x-replay-operator":$op,"x-replay-reason":$reason,"x-replayed-at":$ts})')"

  publish_payload="$(jq -cn \
    --argjson properties "$props" \
    --arg routing_key "$RABBIT_REPLAY_TARGET_ROUTING_KEY" \
    --arg payload "$body" \
    '{properties:$properties, routing_key:$routing_key, payload:$payload, payload_encoding:"string"}')"

  publish_resp="$(curl -sS -u "$RABBIT_MGMT_USER:$RABBIT_MGMT_PASS" -H 'content-type: application/json' \
    -X POST "$RABBIT_MGMT_URL/api/exchanges/${enc_vhost}/${RABBIT_REPLAY_TARGET_EXCHANGE}/publish" \
    -d "$publish_payload")"

  if [[ "$(echo "$publish_resp" | jq -r '.routed // false')" != "true" ]]; then
    audit_event "publish_failed" "$msg_id" "publish unrouted or failed"
    echo "error: publish failed or unrouted for message $msg_id; aborting replay" >&2
    exit 1
  fi

  audit_event "published_copy" "$msg_id" "copy-first replay publish succeeded; source remained in DLQ"
  sleep "$delay"
done

echo "dlq replay complete (copy-first)"
