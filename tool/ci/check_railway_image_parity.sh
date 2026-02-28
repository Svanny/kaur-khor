#!/usr/bin/env bash
set -euo pipefail

RAILWAY_BIN="${RAILWAY_BIN:-railway}"

required=(
  RAILWAY_TOKEN
  RAILWAY_PROJECT_ID
  IMAGE_REF
  RAILWAY_API_SERVICE_ID
  RAILWAY_EVENT_RELAY_SERVICE_ID
  RAILWAY_PROJECTION_CONSUMER_SERVICE_ID
  RAILWAY_WORKER_SERVICE_ID
)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "error: $name is required" >&2
    exit 1
  fi
done

unique_ids=(
  "$RAILWAY_API_SERVICE_ID"
  "$RAILWAY_EVENT_RELAY_SERVICE_ID"
  "$RAILWAY_PROJECTION_CONSUMER_SERVICE_ID"
  "$RAILWAY_WORKER_SERVICE_ID"
)
seen=""
for value in "${unique_ids[@]}"; do
  if [[ " $seen " == *" $value "* ]]; then
    echo "error: duplicate Railway service id detected while checking image parity" >&2
    exit 1
  fi
  seen="$seen $value"
done

"$RAILWAY_BIN" login --token "$RAILWAY_TOKEN" >/dev/null

runtime_value() {
  local service_id="$1"
  local value
  value="$("$RAILWAY_BIN" variables --service "$service_id" --project "$RAILWAY_PROJECT_ID" --json 2>/dev/null | jq -r '
    if type == "array" then
      (map(select((.name // .key // "") == "IMAGE_REF"))[0].value // "")
    elif type == "object" and has("variables") then
      ((.variables | map(select((.name // .key // "") == "IMAGE_REF"))[0].value) // "")
    elif type == "object" then
      (.IMAGE_REF // "")
    else
      ""
    end
  ' 2>/dev/null)"
  if [[ -z "$value" || "$value" == "null" ]]; then
    echo "error: unable to resolve IMAGE_REF for service $service_id" >&2
    exit 1
  fi
  printf '%s' "$value"
}

for service_id in "${unique_ids[@]}"; do
  actual="$(runtime_value "$service_id")"
  if [[ "$actual" != "$IMAGE_REF" ]]; then
    echo "error: IMAGE_REF mismatch for service $service_id (expected $IMAGE_REF)" >&2
    exit 1
  fi
done

echo "railway image parity check passed"
