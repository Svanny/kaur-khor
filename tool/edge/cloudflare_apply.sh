#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: tool/edge/cloudflare_apply.sh --env <staging|prod> --zone-id <id> [--fingerprint-file <path>] [--dry-run]

Required env vars:
  CLOUDFLARE_API_TOKEN
Optional env vars:
  EDGE_ORIGIN_AUTH_HEADER_NAME (default: x-banji-edge-auth)
  CLOUDFLARE_API_BASE (default: https://api.cloudflare.com/client/v4)
USAGE
}

ENV_NAME=""
ZONE_ID=""
DRY_RUN="false"
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
    --dry-run)
      DRY_RUN="true"
      shift
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

if [[ -z "$FINGERPRINT_FILE" ]]; then
  FINGERPRINT_FILE="tool/edge/fingerprints/${ENV_NAME}.json"
fi

API_BASE="${CLOUDFLARE_API_BASE:-https://api.cloudflare.com/client/v4}"
HEADER_NAME="${EDGE_ORIGIN_AUTH_HEADER_NAME:-x-banji-edge-auth}"

plan() {
  cat <<PLAN
Cloudflare apply plan
  env: $ENV_NAME
  zone: $ZONE_ID
  fingerprint_file: $FINGERPRINT_FILE
  changes:
    - zone setting ssl => strict
    - zone setting always_use_https => on
    - capture entrypoint ruleset IDs for phases:
      - http_request_transform
      - http_request_firewall_custom
      - http_ratelimit
    - run immediate verification
  note:
    - origin auth header expected at origin: $HEADER_NAME
PLAN
}

plan

if [[ "$DRY_RUN" == "true" ]]; then
  echo "dry-run enabled: no Cloudflare API changes applied"
  exit 0
fi

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "error: CLOUDFLARE_API_TOKEN is required for apply" >&2
  exit 1
fi

cf_api() {
  local method="$1"
  local path="$2"
  local data="${3:-}"
  local url="${API_BASE}${path}"

  if [[ -n "$data" ]]; then
    curl -sS --fail \
      -X "$method" \
      -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
      -H "Content-Type: application/json" \
      "$url" \
      -d "$data"
  else
    curl -sS --fail \
      -X "$method" \
      -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
      -H "Content-Type: application/json" \
      "$url"
  fi
}

apply_zone_setting() {
  local name="$1"
  local value="$2"
  cf_api PATCH "/zones/${ZONE_ID}/settings/${name}" "{\"value\":\"${value}\"}" >/dev/null
}

phase_ruleset_id() {
  local phase="$1"
  cf_api GET "/zones/${ZONE_ID}/rulesets/phases/${phase}/entrypoint" | jq -r '.result.id // empty'
}

phase_rule_count() {
  local phase="$1"
  cf_api GET "/zones/${ZONE_ID}/rulesets/phases/${phase}/entrypoint" | jq -r '.result.rules | length'
}

apply_zone_setting "ssl" "strict"
apply_zone_setting "always_use_https" "on"

transform_id="$(phase_ruleset_id "http_request_transform")"
firewall_id="$(phase_ruleset_id "http_request_firewall_custom")"
ratelimit_id="$(phase_ruleset_id "http_ratelimit")"

for id in "$transform_id" "$firewall_id" "$ratelimit_id"; do
  if [[ -z "$id" ]]; then
    echo "error: missing Cloudflare entrypoint ruleset for one or more required phases" >&2
    exit 1
  fi
done

mkdir -p "$(dirname "$FINGERPRINT_FILE")"
now_utc="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
cat > "$FINGERPRINT_FILE" <<JSON
{
  "env": "${ENV_NAME}",
  "zone_id": "${ZONE_ID}",
  "updated_at": "${now_utc}",
  "phases": {
    "http_request_transform": {
      "ruleset_id": "${transform_id}",
      "rule_count": $(phase_rule_count "http_request_transform")
    },
    "http_request_firewall_custom": {
      "ruleset_id": "${firewall_id}",
      "rule_count": $(phase_rule_count "http_request_firewall_custom")
    },
    "http_ratelimit": {
      "ruleset_id": "${ratelimit_id}",
      "rule_count": $(phase_rule_count "http_ratelimit")
    }
  }
}
JSON

echo "wrote fingerprint: $FINGERPRINT_FILE"

bash tool/edge/cloudflare_verify.sh \
  --env "$ENV_NAME" \
  --zone-id "$ZONE_ID" \
  --fingerprint-file "$FINGERPRINT_FILE"

echo "cloudflare apply complete"
