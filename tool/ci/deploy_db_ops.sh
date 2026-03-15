#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PREPARE_SCRIPT="${PREPARE_DB_OPS_BUILD_CONTEXT_SCRIPT:-$ROOT_DIR/tool/ci/prepare_db_ops_build_context.sh}"
DEBUG_PREFIX="[db-ops-deploy-debug]"
DEPLOY_STATUS_POLL_INTERVAL_SECONDS=5
DEPLOY_STATUS_POLL_MAX_ATTEMPTS=60
DEPLOY_STATUS_POLL_LIST_LIMIT=20
RAILWAY_LAST_OUTPUT=""
BASELINE_DEPLOYMENT_IDS_JSON="[]"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "error: required command not found: $1" >&2
    exit 1
  fi
}

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "error: $name is required" >&2
    exit 1
  fi
}

debug_log() {
  if [[ "${RAILWAY_CI_DEBUG:-0}" == "1" ]]; then
    printf '%s %s\n' "$DEBUG_PREFIX" "$1" >&2
  fi
}

run_railway() {
  local label="$1"
  shift

  local output=""
  local rc=0

  debug_log "begin: $label"
  if output="$(railway "$@" 2>&1)"; then
    RAILWAY_LAST_OUTPUT="$output"
    debug_log "pass: $label"
    return 0
  fi

  rc=$?
  RAILWAY_LAST_OUTPUT="$output"
  echo "error: Railway CLI failed during '$label' (exit $rc)" >&2
  if [[ -n "$output" ]]; then
    echo "$output" >&2
  fi
  exit "$rc"
}

latest_deployment_id_from_payload() {
  local payload="$1"
  printf '%s' "$payload" | jq -r '
    def latest:
      if type == "array" then
        .[0]
      elif type == "object" and has("deployments") then
        .deployments[0]
      elif type == "object" and has("data") then
        .data[0]
      else
        .
      end;
    (latest | .id // .deploymentId // .deployment_id // "")
  '
}

latest_deployment_status_from_payload() {
  local payload="$1"
  printf '%s' "$payload" | jq -r '
    def latest:
      if type == "array" then
        .[0]
      elif type == "object" and has("deployments") then
        .deployments[0]
      elif type == "object" and has("data") then
        .data[0]
      else
        .
      end;
    (latest | .status // .state // "")
  '
}

deployment_list_from_payload() {
  local payload="$1"
  printf '%s' "$payload" | jq -c '
    if type == "array" then
      .
    elif type == "object" and has("deployments") then
      .deployments
    elif type == "object" and has("data") then
      .data
    else
      []
    end
  '
}

matching_deployment_from_payload() {
  local payload="$1"
  local deploy_message="$2"
  printf '%s' "$payload" | jq -c --arg deploy_message "$deploy_message" '
    def deployments:
      if type == "array" then
        .
      elif type == "object" and has("deployments") then
        .deployments
      elif type == "object" and has("data") then
        .data
      else
        []
      end;
    def deployment_message:
      .message
      // .deploymentMessage
      // .meta.message
      // .metadata.message
      // .source.message
      // .build.message
      // .trigger.message
      // "";
    (deployments | map(select(deployment_message == $deploy_message)) | first) // {}
  '
}

payload_exposes_deployment_messages() {
  local payload="$1"
  printf '%s' "$payload" | jq -e '
    def deployments:
      if type == "array" then
        .
      elif type == "object" and has("deployments") then
        .deployments
      elif type == "object" and has("data") then
        .data
      else
        []
      end;
    def deployment_message:
      .message
      // .deploymentMessage
      // .meta.message
      // .metadata.message
      // .source.message
      // .build.message
      // .trigger.message
      // "";
    any(deployments[]?; (deployment_message | tostring | length) > 0)
  ' >/dev/null
}

deployment_ids_from_payload() {
  local payload="$1"
  printf '%s' "$payload" | jq -c '
    def deployments:
      if type == "array" then
        .
      elif type == "object" and has("deployments") then
        .deployments
      elif type == "object" and has("data") then
        .data
      else
        []
      end;
    deployments
    | map(.id // .deploymentId // .deployment_id // "")
    | map(select(length > 0))
  '
}

single_new_deployment_from_payload() {
  local payload="$1"
  local baseline_ids_json="$2"
  printf '%s' "$payload" | jq -c --argjson baseline_ids "$baseline_ids_json" '
    def deployments:
      if type == "array" then
        .
      elif type == "object" and has("deployments") then
        .deployments
      elif type == "object" and has("data") then
        .data
      else
        []
      end;
    deployments
    | map(select(((.id // .deploymentId // .deployment_id // "") as $id | ($id | length) > 0 and ($baseline_ids | index($id) | not))))
    | if length == 1 then .[0] else {} end
  '
}

poll_deployment_status_by_message() {
  local deploy_message="$1"
  local baseline_ids_json="$2"
  local attempt=1
  local payload=""
  local matched_deployment="{}"
  local latest_id=""
  local latest_status=""
  local latest_status_upper=""

  while (( attempt <= DEPLOY_STATUS_POLL_MAX_ATTEMPTS )); do
    run_railway "fetch db-ops deployment status" deployment list --json --limit "$DEPLOY_STATUS_POLL_LIST_LIMIT" --service "$RAILWAY_SERVICE_ID"
    payload="$RAILWAY_LAST_OUTPUT"
    matched_deployment="$(matching_deployment_from_payload "$payload" "$deploy_message")"
    if [[ -z "$(latest_deployment_id_from_payload "$matched_deployment")" ]] && ! payload_exposes_deployment_messages "$payload"; then
      matched_deployment="$(single_new_deployment_from_payload "$payload" "$baseline_ids_json")"
    fi
    latest_id="$(latest_deployment_id_from_payload "$matched_deployment")"
    latest_status="$(latest_deployment_status_from_payload "$matched_deployment")"
    latest_status_upper="$(printf '%s' "$latest_status" | tr '[:lower:]' '[:upper:]')"

    if [[ -n "$latest_id" ]]; then
      case "$latest_status_upper" in
        SUCCESS|FAILED|CRASHED|REMOVED)
          printf '%s\t%s' "$latest_id" "$latest_status"
          return 0
          ;;
      esac
    fi

    if (( attempt < DEPLOY_STATUS_POLL_MAX_ATTEMPTS )); then
      sleep "$DEPLOY_STATUS_POLL_INTERVAL_SECONDS"
    fi
    attempt=$((attempt + 1))
  done

  printf '%s\t%s' "$latest_id" "$latest_status"
  return 1
}

require_cmd railway
require_cmd jq
require_env RAILWAY_API_TOKEN
require_env RAILWAY_PROJECT_ID
require_env RAILWAY_ENVIRONMENT
require_env RAILWAY_SERVICE_ID

if [[ -n "${RAILWAY_TOKEN:-}" ]]; then
  echo "error: RAILWAY_TOKEN is no longer supported for deploy; use RAILWAY_API_TOKEN only." >&2
  exit 1
fi

case "$RAILWAY_ENVIRONMENT" in
  staging|prod) ;;
  *)
    echo "error: deploy_db_ops.sh only supports RAILWAY_ENVIRONMENT=staging|prod" >&2
    exit 1
    ;;
esac

if [[ ! -f "$PREPARE_SCRIPT" ]]; then
  echo "error: db-ops build-context helper not found: $PREPARE_SCRIPT" >&2
  exit 1
fi

build_context="$(mktemp -d)"
trap 'rm -rf "$build_context"' EXIT
bash "$PREPARE_SCRIPT" "$build_context" >/dev/null

run_railway "railway whoami" whoami
run_railway "railway link" link --project "$RAILWAY_PROJECT_ID" --environment "$RAILWAY_ENVIRONMENT" --service "$RAILWAY_SERVICE_ID"
run_railway "fetch baseline db-ops deployment status" deployment list --json --limit "$DEPLOY_STATUS_POLL_LIST_LIMIT" --service "$RAILWAY_SERVICE_ID"
BASELINE_DEPLOYMENT_IDS_JSON="$(deployment_ids_from_payload "$RAILWAY_LAST_OUTPUT")"
deploy_message="banji-db-ops:${RAILWAY_ENVIRONMENT}:${GITHUB_RUN_ID:-local}:${GITHUB_RUN_ATTEMPT:-0}:$$:$RANDOM"

run_railway "deploy $RAILWAY_ENVIRONMENT db-ops service" up "$build_context" --path-as-root --service "$RAILWAY_SERVICE_ID" --detach --message "$deploy_message"

poll_result=""
if ! poll_result="$(poll_deployment_status_by_message "$deploy_message" "$BASELINE_DEPLOYMENT_IDS_JSON")"; then
  deployment_id="${poll_result%%$'\t'*}"
  deployment_status="${poll_result#*$'\t'}"
  echo "error: $RAILWAY_ENVIRONMENT db-ops deployment did not reach terminal state within $((DEPLOY_STATUS_POLL_INTERVAL_SECONDS * DEPLOY_STATUS_POLL_MAX_ATTEMPTS)) seconds" >&2
  echo "error: deployment marker: $deploy_message" >&2
  if [[ -n "$deployment_id" ]]; then
    echo "error: latest observed deployment id was '$deployment_id' with status '${deployment_status:-unknown}'" >&2
  fi
  exit 1
fi

deployment_id="${poll_result%%$'\t'*}"
deployment_status="${poll_result#*$'\t'}"
deployment_status_upper="$(printf '%s' "$deployment_status" | tr '[:lower:]' '[:upper:]')"
if [[ "$deployment_status_upper" != "SUCCESS" ]]; then
  echo "error: $RAILWAY_ENVIRONMENT db-ops deployment for service $RAILWAY_SERVICE_ID ($deployment_id) is '$deployment_status'" >&2
  exit 1
fi

echo "$RAILWAY_ENVIRONMENT db-ops deploy passed"
