#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: tool/edge/cloudflare_verify.sh --env <staging|prod> --zone-id <id> [--fingerprint-file <path>]

Required env vars:
  CLOUDFLARE_API_TOKEN
USAGE
}

ENV_NAME=""
ZONE_ID=""
FINGERPRINT_FILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)
      ENV_NAME="${2:-}"
      shift 2
      ;;
    --zone-id)
      ZONE_ID="${2:-}"
      shift 2
      ;;
    --fingerprint-file)
      FINGERPRINT_FILE="${2:-}"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "error: unknown arg: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ "$ENV_NAME" != "staging" && "$ENV_NAME" != "prod" ]]; then
  echo "error: --env must be staging|prod" >&2
  exit 1
fi
if [[ -z "$ZONE_ID" ]]; then
  echo "error: --zone-id is required" >&2
  exit 1
fi
if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "error: CLOUDFLARE_API_TOKEN is required" >&2
  exit 1
fi

if [[ -z "$FINGERPRINT_FILE" ]]; then
  FINGERPRINT_FILE="tool/edge/fingerprints/${ENV_NAME}.json"
fi
if [[ ! -f "$FINGERPRINT_FILE" ]]; then
  echo "error: fingerprint file not found: $FINGERPRINT_FILE" >&2
  exit 1
fi

API_BASE="${CLOUDFLARE_API_BASE:-https://api.cloudflare.com/client/v4}"

cf_api() {
  local method="$1"
  local path="$2"
  curl -sS --fail \
    -X "$method" \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "${API_BASE}${path}"
}

expected_zone="$(jq -r '.zone_id' "$FINGERPRINT_FILE")"
if [[ "$expected_zone" != "$ZONE_ID" ]]; then
  echo "error: fingerprint zone_id ($expected_zone) does not match --zone-id ($ZONE_ID)" >&2
  exit 1
fi

ssl_value="$(cf_api GET "/zones/${ZONE_ID}/settings/ssl" | jq -r '.result.value // empty')"
https_value="$(cf_api GET "/zones/${ZONE_ID}/settings/always_use_https" | jq -r '.result.value // empty')"

if [[ "$ssl_value" != "strict" ]]; then
  echo "error: ssl setting must be strict; got '$ssl_value'" >&2
  exit 1
fi
if [[ "$https_value" != "on" ]]; then
  echo "error: always_use_https must be on; got '$https_value'" >&2
  exit 1
fi

check_phase() {
  local phase="$1"
  local expected_id
  expected_id="$(jq -r --arg phase "$phase" '.phases[$phase].ruleset_id // empty' "$FINGERPRINT_FILE")"

  if [[ -z "$expected_id" ]]; then
    echo "error: fingerprint missing ruleset_id for phase $phase" >&2
    exit 1
  fi

  local response
  response="$(cf_api GET "/zones/${ZONE_ID}/rulesets/phases/${phase}/entrypoint")"
  local actual_id
  actual_id="$(echo "$response" | jq -r '.result.id // empty')"

  if [[ "$actual_id" != "$expected_id" ]]; then
    echo "error: phase $phase ruleset mismatch; expected '$expected_id' got '$actual_id'" >&2
    exit 1
  fi
}

check_phase "http_request_transform"
check_phase "http_request_firewall_custom"
check_phase "http_ratelimit"

echo "cloudflare verify passed for env=$ENV_NAME zone=$ZONE_ID"
