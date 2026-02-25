#!/usr/bin/env bash
set -euo pipefail

required=(RABBIT_MGMT_URL RABBIT_MGMT_USER RABBIT_MGMT_PASS RABBIT_VHOST)
for n in "${required[@]}"; do
  if [[ -z "${!n:-}" ]]; then
    echo "error: $n is required" >&2
    exit 1
  fi
done

BANJI_SYSTEM="${BANJI_SYSTEM:-banji-core}"
BANJI_ENV="${BANJI_ENV:-dev}"
RABBIT_EXCHANGE_JOBS_REPLAY="${RABBIT_EXCHANGE_JOBS_REPLAY:-${BANJI_SYSTEM}.${BANJI_ENV}.jobs.replay}"

enc_vhost="$(python3 - <<'PY'
import os, urllib.parse
print(urllib.parse.quote(os.environ['RABBIT_VHOST'], safe=''))
PY
)"

check_queue() {
  local q="$1"
  code="$(curl -sS -u "$RABBIT_MGMT_USER:$RABBIT_MGMT_PASS" -o /dev/null -w '%{http_code}' "$RABBIT_MGMT_URL/api/queues/${enc_vhost}/${q}")"
  [[ "$code" == "200" ]] || { echo "missing queue: $q" >&2; exit 1; }
}

check_exchange() {
  local e="$1"
  code="$(curl -sS -u "$RABBIT_MGMT_USER:$RABBIT_MGMT_PASS" -o /dev/null -w '%{http_code}' "$RABBIT_MGMT_URL/api/exchanges/${enc_vhost}/${e}")"
  [[ "$code" == "200" ]] || { echo "missing exchange: $e" >&2; exit 1; }
}

check_exchange "$RABBIT_EXCHANGE_JOBS_REPLAY"

for cls in fast heavy; do
  base="${BANJI_SYSTEM}.${BANJI_ENV}.${cls}-jobs"
  check_queue "$base"
  check_queue "$base.replay"
  check_queue "$base.retry.1"
  check_queue "$base.retry.2"
  check_queue "$base.retry.3"
  check_queue "$base.dlq"
done

echo "rabbit topology check passed"
