#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: tool/edge/cloudflare_apply.sh --env <staging|prod> --zone-id <id> [--fingerprint-file <path>] [--dry-run]

Required env vars:
  CLOUDFLARE_API_TOKEN
  EDGE_ORIGIN_AUTH_SECRET (non-dry-run; used for managed transform header injection)
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
    - idempotently upsert managed rules for phases:
      - http_request_transform
      - http_request_firewall_custom
      - http_ratelimit
    - capture entrypoint ruleset + managed rule IDs
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
if [[ -z "${EDGE_ORIGIN_AUTH_SECRET:-}" ]]; then
  echo "error: EDGE_ORIGIN_AUTH_SECRET is required for apply" >&2
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

managed_rule_id_from_entrypoint() {
  local entrypoint_json="$1"
  local description="$2"
  echo "$entrypoint_json" | jq -r --arg desc "$description" '.result.rules[]? | select(.description == $desc) | .id' | head -n 1
}

upsert_managed_rule() {
  local phase="$1"
  local description="$2"
  local payload="$3"

  local entrypoint_json
  entrypoint_json="$(cf_api GET "/zones/${ZONE_ID}/rulesets/phases/${phase}/entrypoint")"
  local ruleset_id
  ruleset_id="$(echo "$entrypoint_json" | jq -r '.result.id // empty')"
  if [[ -z "$ruleset_id" ]]; then
    echo "error: missing entrypoint ruleset id for phase $phase" >&2
    exit 1
  fi

  local existing_rule_id
  existing_rule_id="$(managed_rule_id_from_entrypoint "$entrypoint_json" "$description")"
  if [[ -n "$existing_rule_id" ]]; then
    local patched
    patched="$(cf_api PATCH "/zones/${ZONE_ID}/rulesets/${ruleset_id}/rules/${existing_rule_id}" "$payload")"
    local patched_id
    patched_id="$(echo "$patched" | jq -r '.result.id // empty')"
    if [[ -z "$patched_id" ]]; then
      echo "error: failed to patch managed rule for phase $phase" >&2
      exit 1
    fi
    echo "$ruleset_id|$patched_id"
    return 0
  fi

  local created
  created="$(cf_api POST "/zones/${ZONE_ID}/rulesets/${ruleset_id}/rules" "$payload")"
  local created_id
  created_id="$(echo "$created" | jq -r '.result.id // empty')"
  if [[ -z "$created_id" ]]; then
    echo "error: failed to create managed rule for phase $phase" >&2
    exit 1
  fi
  echo "$ruleset_id|$created_id"
}

apply_zone_setting "ssl" "strict"
apply_zone_setting "always_use_https" "on"

TRANSFORM_RULE_DESC="banji-managed-origin-header"
FIREWALL_RULE_DESC="banji-managed-firewall-guard"
RATELIMIT_RULE_DESC="banji-managed-rate-limit"

transform_payload="$(jq -n \
  --arg desc "$TRANSFORM_RULE_DESC" \
  --arg header "$HEADER_NAME" \
  --arg value "$EDGE_ORIGIN_AUTH_SECRET" \
  '{
    description: $desc,
    expression: "true",
    action: "rewrite",
    enabled: true,
    action_parameters: {
      headers: {
        ($header): {
          operation: "set",
          value: $value
        }
      }
    }
  }')"

firewall_payload="$(jq -n \
  --arg desc "$FIREWALL_RULE_DESC" \
  '{
    description: $desc,
    expression: "false",
    action: "block",
    enabled: true
  }')"

ratelimit_payload="$(jq -n \
  --arg desc "$RATELIMIT_RULE_DESC" \
  '{
    description: $desc,
    expression: "http.request.uri.path contains \"/v1/\"",
    action: "block",
    enabled: true,
    ratelimit: {
      characteristics: ["ip.src", "cf.colo.id"],
      period: 60,
      requests_per_period: 120,
      mitigation_timeout: 60
    }
  }')"

transform_result="$(upsert_managed_rule "http_request_transform" "$TRANSFORM_RULE_DESC" "$transform_payload")"
firewall_result="$(upsert_managed_rule "http_request_firewall_custom" "$FIREWALL_RULE_DESC" "$firewall_payload")"
ratelimit_result="$(upsert_managed_rule "http_ratelimit" "$RATELIMIT_RULE_DESC" "$ratelimit_payload")"

transform_id="${transform_result%%|*}"
transform_rule_id="${transform_result##*|}"
firewall_id="${firewall_result%%|*}"
firewall_rule_id="${firewall_result##*|}"
ratelimit_id="${ratelimit_result%%|*}"
ratelimit_rule_id="${ratelimit_result##*|}"

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
      "managed_rule_id": "${transform_rule_id}",
      "rule_count": $(phase_rule_count "http_request_transform")
    },
    "http_request_firewall_custom": {
      "ruleset_id": "${firewall_id}",
      "managed_rule_id": "${firewall_rule_id}",
      "rule_count": $(phase_rule_count "http_request_firewall_custom")
    },
    "http_ratelimit": {
      "ruleset_id": "${ratelimit_id}",
      "managed_rule_id": "${ratelimit_rule_id}",
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
