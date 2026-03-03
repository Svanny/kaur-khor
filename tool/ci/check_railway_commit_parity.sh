#!/usr/bin/env bash
set -euo pipefail

require_auth_token() {
  if [[ -z "${RAILWAY_API_TOKEN:-}" ]]; then
    echo "error: RAILWAY_API_TOKEN is required" >&2
    exit 1
  fi
}

required=(
  RAILWAY_PROJECT_ID
  RAILWAY_ENVIRONMENT
  COMMIT_SHA
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

require_auth_token

EXPECTED_DEPLOY_RUN_ID="${DEPLOY_RUN_ID:-${GITHUB_RUN_ID:-manual}-${GITHUB_RUN_ATTEMPT:-1}}"
TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TEMP_DIR"' EXIT
pushd "$TEMP_DIR" >/dev/null
railway link --project "$RAILWAY_PROJECT_ID" --environment "$RAILWAY_ENVIRONMENT" >/dev/null

normalize_runtime_json() {
  jq -c '
    if type == "array" then
      reduce .[] as $item (
        {};
        if ($item | type) == "object" then
          .[($item.name // $item.key // "")] = ($item.value // "")
        else
          .
        end
      )
    elif type == "object" and has("variables") then
      reduce .variables[] as $item (
        {};
        .[($item.name // $item.key // "")] = ($item.value // "")
      )
    elif type == "object" then
      with_entries(.value |= if . == null then "" else tostring end)
    else
      {}
    end
  '
}

runtime_var_value() {
  local json="$1"
  local key="$2"
  printf '%s' "$json" | jq -r --arg key "$key" '.[$key] // ""'
}

deployment_status() {
  local service_id="$1"
  local json
  json="$(railway deployment list --json --limit 1 --service "$service_id")"
  printf '%s' "$json" | jq -r '
    if type == "array" then
      (.[0].status // .[0].state // "")
    elif type == "object" and has("deployments") then
      (.deployments[0].status // .deployments[0].state // "")
    elif type == "object" and has("data") then
      (.data[0].status // .data[0].state // "")
    else
      (.status // .state // "")
    end
  '
}

service_ids=(
  "$RAILWAY_API_SERVICE_ID"
  "$RAILWAY_EVENT_RELAY_SERVICE_ID"
  "$RAILWAY_PROJECTION_CONSUMER_SERVICE_ID"
  "$RAILWAY_WORKER_SERVICE_ID"
)
expected_roles=(api event-relay projection-consumer worker)

for idx in "${!service_ids[@]}"; do
  service_id="${service_ids[$idx]}"
  expected_role="${expected_roles[$idx]}"
  runtime_json="$(railway variable list --json --service "$service_id" | normalize_runtime_json)"

  actual_role="$(runtime_var_value "$runtime_json" "APP_ROLE")"
  actual_service="$(runtime_var_value "$runtime_json" "BANJI_SERVICE")"
  actual_commit="$(runtime_var_value "$runtime_json" "DEPLOY_COMMIT_SHA")"
  actual_run_id="$(runtime_var_value "$runtime_json" "DEPLOY_RUN_ID")"
  latest_status="$(deployment_status "$service_id")"
  latest_status_upper="$(printf '%s' "$latest_status" | tr '[:lower:]' '[:upper:]')"

  if [[ "$actual_role" != "$expected_role" ]]; then
    echo "error: service $service_id APP_ROLE mismatch (expected $expected_role)" >&2
    exit 1
  fi

  if [[ "$actual_service" != "$expected_role" ]]; then
    echo "error: service $service_id BANJI_SERVICE mismatch (expected $expected_role)" >&2
    exit 1
  fi

  if [[ "$actual_commit" != "$COMMIT_SHA" ]]; then
    echo "error: service $service_id DEPLOY_COMMIT_SHA mismatch (expected $COMMIT_SHA)" >&2
    exit 1
  fi

  if [[ "$actual_run_id" != "$EXPECTED_DEPLOY_RUN_ID" ]]; then
    echo "error: service $service_id DEPLOY_RUN_ID mismatch (expected $EXPECTED_DEPLOY_RUN_ID)" >&2
    exit 1
  fi

  if [[ "$latest_status_upper" != "SUCCESS" ]]; then
    echo "error: latest Railway deployment for service $service_id is '$latest_status'" >&2
    exit 1
  fi
done

echo "railway commit parity check passed"
