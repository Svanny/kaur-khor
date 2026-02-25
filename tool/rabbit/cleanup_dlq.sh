#!/usr/bin/env bash
set -euo pipefail

required=(
  RABBIT_MGMT_URL
  RABBIT_MGMT_USER
  RABBIT_MGMT_PASS
  RABBIT_VHOST
  BANJI_ENV
  OPERATOR_ID
  CLEANUP_REASON
  DLQ_NAME
  TARGET_REPLAY_ID
  CONFIRM_DLQ_CLEANUP
)
for n in "${required[@]}"; do
  if [[ -z "${!n:-}" ]]; then
    echo "error: $n is required" >&2
    exit 1
  fi
done

if [[ "$CONFIRM_DLQ_CLEANUP" != "CONFIRM_DLQ_CLEANUP" ]]; then
  echo "error: CONFIRM_DLQ_CLEANUP confirmation token mismatch" >&2
  exit 1
fi

if [[ ! "${DLQ_NAME}" =~ \.dlq$ ]]; then
  echo "error: DLQ_NAME must match controlled pattern '*.dlq'" >&2
  exit 1
fi

RABBIT_REPLAY_MAX_MESSAGES="${RABBIT_REPLAY_MAX_MESSAGES:-10}"
RABBIT_REPLAY_RATE_PER_MIN="${RABBIT_REPLAY_RATE_PER_MIN:-60}"
RABBIT_REPLAY_AUDIT_LOG="${RABBIT_REPLAY_AUDIT_LOG:-/tmp/rabbit_replay_audit.jsonl}"

if ! [[ "$RABBIT_REPLAY_MAX_MESSAGES" =~ ^[0-9]+$ ]] || [[ "$RABBIT_REPLAY_MAX_MESSAGES" -le 0 ]]; then
  echo "error: RABBIT_REPLAY_MAX_MESSAGES must be a positive integer" >&2
  exit 1
fi
if ! [[ "$RABBIT_REPLAY_RATE_PER_MIN" =~ ^[0-9]+$ ]] || [[ "$RABBIT_REPLAY_RATE_PER_MIN" -le 0 ]]; then
  echo "error: RABBIT_REPLAY_RATE_PER_MIN must be a positive integer" >&2
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

mkdir -p "$(dirname "$RABBIT_REPLAY_AUDIT_LOG")"

audit_event() {
  local status="$1"
  local message_id="$2"
  local detail="$3"
  local ts
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  jq -cn \
    --arg ts "$ts" \
    --arg env "$BANJI_ENV" \
    --arg dlq "$DLQ_NAME" \
    --arg replay_id "$TARGET_REPLAY_ID" \
    --arg operator "$OPERATOR_ID" \
    --arg reason "$CLEANUP_REASON" \
    --arg message_id "$message_id" \
    --arg status "$status" \
    --arg detail "$detail" \
    '{timestamp:$ts, env:$env, dlq:$dlq, replay_id:$replay_id, operator:$operator, reason:$reason, message_id:$message_id, status:$status, detail:$detail}' >> "$RABBIT_REPLAY_AUDIT_LOG"
}

echo "cleanup config:"
echo "  BANJI_ENV=$BANJI_ENV"
echo "  DLQ_NAME=$DLQ_NAME"
echo "  TARGET_REPLAY_ID=$TARGET_REPLAY_ID"
echo "  RABBIT_REPLAY_MAX_MESSAGES=$RABBIT_REPLAY_MAX_MESSAGES"
echo "  RABBIT_REPLAY_RATE_PER_MIN=$RABBIT_REPLAY_RATE_PER_MIN"
echo "  AUDIT_LOG=$RABBIT_REPLAY_AUDIT_LOG"

queue_state="$(curl -sS -u "$RABBIT_MGMT_USER:$RABBIT_MGMT_PASS" \
  "$RABBIT_MGMT_URL/api/queues/${enc_vhost}/${DLQ_NAME}")"
consumers="$(echo "$queue_state" | jq -r '.consumers // 0')"
if [[ "$consumers" != "0" ]]; then
  echo "error: DLQ has active consumers ($consumers); refuse cleanup to avoid race" >&2
  exit 1
fi

removed=0
for ((i=0; i<RABBIT_REPLAY_MAX_MESSAGES; i++)); do
  peek_resp="$(curl -sS -u "$RABBIT_MGMT_USER:$RABBIT_MGMT_PASS" -H 'content-type: application/json' \
    -X POST "$RABBIT_MGMT_URL/api/queues/${enc_vhost}/${DLQ_NAME}/get" \
    -d '{"count":1,"ackmode":"ack_requeue_true","encoding":"auto","truncate":500000}')"
  peek_payload="$(echo "$peek_resp" | jq -r '.[0] // empty')"
  if [[ -z "$peek_payload" ]]; then
    break
  fi

  peek_id="$(echo "$peek_payload" | jq -r '.properties.message_id // .payload_bytes // "unknown"')"
  peek_replay_id="$(echo "$peek_payload" | jq -r '.properties.headers["x-replay-id"] // ""')"

  if [[ "$peek_replay_id" != "$TARGET_REPLAY_ID" ]]; then
    audit_event "stopped_head_mismatch" "$peek_id" "queue head replay id '$peek_replay_id' did not match target"
    echo "stopping cleanup: queue head replay id does not match target replay id" >&2
    break
  fi

  pop_resp="$(curl -sS -u "$RABBIT_MGMT_USER:$RABBIT_MGMT_PASS" -H 'content-type: application/json' \
    -X POST "$RABBIT_MGMT_URL/api/queues/${enc_vhost}/${DLQ_NAME}/get" \
    -d '{"count":1,"ackmode":"ack_requeue_false","encoding":"auto","truncate":500000}')"
  pop_payload="$(echo "$pop_resp" | jq -r '.[0] // empty')"
  if [[ -z "$pop_payload" ]]; then
    audit_event "pop_empty" "$peek_id" "expected matched head message but pop returned empty"
    echo "error: expected one message to remove but pop returned empty" >&2
    exit 1
  fi

  pop_id="$(echo "$pop_payload" | jq -r '.properties.message_id // .payload_bytes // "unknown"')"
  pop_replay_id="$(echo "$pop_payload" | jq -r '.properties.headers["x-replay-id"] // ""')"
  if [[ "$pop_id" != "$peek_id" || "$pop_replay_id" != "$TARGET_REPLAY_ID" ]]; then
    audit_event "pop_mismatch" "$pop_id" "removed message did not match verified queue head"
    echo "error: cleanup head changed between verify and pop; aborting" >&2
    exit 1
  fi

  audit_event "removed" "$pop_id" "message removed from DLQ by explicit replay-scoped cleanup step"
  removed=$((removed + 1))
  sleep "$delay"
done

echo "dlq cleanup complete: removed=$removed target_replay_id=$TARGET_REPLAY_ID"
