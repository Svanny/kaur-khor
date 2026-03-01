#!/usr/bin/env bash
set -euo pipefail

RAILWAY_BIN="${RAILWAY_BIN:-railway}"
SKIP_RAILWAY_INSTALL="${SKIP_RAILWAY_INSTALL:-false}"
echo "warning: tool/ci/railway_deploy.sh is deprecated for the repo-root Railpack deployment path" >&2
echo "warning: Railway should build from the connected repo using apps/api/railway.toml and apps/api/start.sh" >&2

required=(
  RAILWAY_TOKEN
  RAILWAY_PROJECT_ID
  RAILWAY_SERVICE_ID
  IMAGE_REF
  EXPECTED_APP_ROLE
  EXPECTED_BANJI_SERVICE
  DATABASE_RUNTIME_ENDPOINT_KIND
  PGBOUNCER_POOL_MODE
)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "error: $name is required" >&2
    exit 1
  fi
done

if [[ ! "$IMAGE_REF" =~ @sha256:[a-f0-9]{64}$ ]]; then
  echo "error: IMAGE_REF must be digest pinned" >&2
  exit 1
fi

if [[ "$DATABASE_RUNTIME_ENDPOINT_KIND" != "pgbouncer" ]]; then
  echo "error: DATABASE_RUNTIME_ENDPOINT_KIND must be pgbouncer for deploy targets" >&2
  exit 1
fi

if [[ "$PGBOUNCER_POOL_MODE" != "transaction" ]]; then
  echo "error: PGBOUNCER_POOL_MODE must be transaction for deploy targets" >&2
  exit 1
fi

require_local_var() {
  local key="$1"
  if [[ -z "${!key:-}" ]]; then
    echo "error: $key is required for EXPECTED_APP_ROLE=$EXPECTED_APP_ROLE" >&2
    exit 1
  fi
}

forbid_local_var() {
  local key="$1"
  if [[ -n "${!key:-}" ]]; then
    echo "error: $key must not be provided for EXPECTED_APP_ROLE=$EXPECTED_APP_ROLE" >&2
    exit 1
  fi
}

case "$EXPECTED_APP_ROLE" in
  api)
    require_local_var EDGE_ENFORCEMENT_ENABLED
    require_local_var EDGE_ORIGIN_AUTH_HEADER_NAME
    require_local_var EDGE_CORS_ALLOWED_ORIGINS
    require_local_var AUTH_ENABLED
    require_local_var AUTH_JWKS_URL
    require_local_var AUTH_ISSUER
    require_local_var AUTH_AUDIENCE
    forbid_local_var OBJECT_STORAGE_ENDPOINT
    forbid_local_var OBJECT_STORAGE_ACCESS_KEY
    forbid_local_var OBJECT_STORAGE_SECRET_KEY
    ;;
  event-relay)
    require_local_var DATABASE_RUNTIME_URL
    forbid_local_var RABBIT_URL
    forbid_local_var OBJECT_STORAGE_ENDPOINT
    forbid_local_var OBJECT_STORAGE_ACCESS_KEY
    forbid_local_var OBJECT_STORAGE_SECRET_KEY
    forbid_local_var AUTH_JWKS_URL
    forbid_local_var AUTH_ISSUER
    forbid_local_var AUTH_AUDIENCE
    forbid_local_var EDGE_ORIGIN_AUTH_HEADER_NAME
    ;;
  projection-consumer)
    require_local_var DATABASE_RUNTIME_URL
    require_local_var EVENT_CONSUMER_SERVICE_NAME
    require_local_var EVENT_CONSUMER_NAME
    require_local_var EVENT_CONSUMER_STREAM_NAME
    forbid_local_var RABBIT_URL
    forbid_local_var OBJECT_STORAGE_ENDPOINT
    forbid_local_var OBJECT_STORAGE_ACCESS_KEY
    forbid_local_var OBJECT_STORAGE_SECRET_KEY
    forbid_local_var AUTH_JWKS_URL
    forbid_local_var AUTH_ISSUER
    forbid_local_var AUTH_AUDIENCE
    forbid_local_var EDGE_ORIGIN_AUTH_HEADER_NAME
    ;;
  worker)
    require_local_var DATABASE_RUNTIME_URL
    require_local_var RABBIT_URL
    require_local_var OBJECT_STORAGE_ENABLED
    require_local_var OBJECT_STORAGE_ENDPOINT
    require_local_var OBJECT_STORAGE_REGION
    require_local_var OBJECT_STORAGE_BUCKET_ARTIFACTS
    require_local_var OBJECT_STORAGE_ACCESS_KEY
    require_local_var OBJECT_STORAGE_SECRET_KEY
    require_local_var ALGORITHM_ROLLOUT_HASH_SALT
    require_local_var ALGORITHM_ROLLOUT_HASH_SALT_VERSION
    forbid_local_var AUTH_JWKS_URL
    forbid_local_var AUTH_ISSUER
    forbid_local_var AUTH_AUDIENCE
    forbid_local_var EDGE_ORIGIN_AUTH_HEADER_NAME
    ;;
  *)
    echo "error: EXPECTED_APP_ROLE must be one of api, event-relay, projection-consumer, worker" >&2
    exit 1
    ;;
esac

if [[ "$SKIP_RAILWAY_INSTALL" != "true" ]]; then
  npm install -g @railway/cli >/dev/null
fi

set_runtime_var() {
  local key="$1"
  "$RAILWAY_BIN" variables --set "$key=${!key}" --service "$RAILWAY_SERVICE_ID" --project "$RAILWAY_PROJECT_ID"
}

set_runtime_var_if_present() {
  local key="$1"
  if [[ -n "${!key:-}" ]]; then
    set_runtime_var "$key"
  fi
}

"$RAILWAY_BIN" login --token "$RAILWAY_TOKEN"
set_runtime_var IMAGE_REF
set_runtime_var DATABASE_RUNTIME_ENDPOINT_KIND
set_runtime_var PGBOUNCER_POOL_MODE
"$RAILWAY_BIN" variables --set "APP_ROLE=$EXPECTED_APP_ROLE" --service "$RAILWAY_SERVICE_ID" --project "$RAILWAY_PROJECT_ID"
"$RAILWAY_BIN" variables --set "BANJI_SERVICE=$EXPECTED_BANJI_SERVICE" --service "$RAILWAY_SERVICE_ID" --project "$RAILWAY_PROJECT_ID"

# Persist the canonical runtime variable names expected by the service.
case "$EXPECTED_APP_ROLE" in
  api)
    set_runtime_var_if_present EDGE_ENFORCEMENT_ENABLED
    set_runtime_var_if_present EDGE_ORIGIN_AUTH_HEADER_NAME
    set_runtime_var_if_present EDGE_CORS_ALLOWED_ORIGINS
    set_runtime_var_if_present AUTH_ENABLED
    set_runtime_var_if_present AUTH_JWKS_URL
    set_runtime_var_if_present AUTH_ISSUER
    set_runtime_var_if_present AUTH_AUDIENCE
    ;;
  event-relay)
    set_runtime_var_if_present DATABASE_RUNTIME_URL
    ;;
  projection-consumer)
    set_runtime_var_if_present DATABASE_RUNTIME_URL
    set_runtime_var_if_present EVENT_CONSUMER_SERVICE_NAME
    set_runtime_var_if_present EVENT_CONSUMER_NAME
    set_runtime_var_if_present EVENT_CONSUMER_STREAM_NAME
    ;;
  worker)
    set_runtime_var_if_present DATABASE_RUNTIME_URL
    set_runtime_var_if_present RABBIT_URL
    set_runtime_var_if_present OBJECT_STORAGE_ENABLED
    set_runtime_var_if_present OBJECT_STORAGE_ENDPOINT
    set_runtime_var_if_present OBJECT_STORAGE_REGION
    set_runtime_var_if_present OBJECT_STORAGE_BUCKET_ARTIFACTS
    set_runtime_var_if_present OBJECT_STORAGE_ACCESS_KEY
    set_runtime_var_if_present OBJECT_STORAGE_SECRET_KEY
    set_runtime_var_if_present ALGORITHM_ROLLOUT_HASH_SALT
    set_runtime_var_if_present ALGORITHM_ROLLOUT_HASH_SALT_VERSION
    ;;
esac

runtime_vars_json="$("$RAILWAY_BIN" variables --service "$RAILWAY_SERVICE_ID" --project "$RAILWAY_PROJECT_ID" --json 2>/dev/null || true)"
runtime_vars_text=""
if [[ -z "$runtime_vars_json" || "$(printf '%s' "$runtime_vars_json" | jq -r 'type' 2>/dev/null || true)" == "" ]]; then
  runtime_vars_text="$("$RAILWAY_BIN" variables --service "$RAILWAY_SERVICE_ID" --project "$RAILWAY_PROJECT_ID" 2>/dev/null || true)"
fi

runtime_var_value() {
  local key="$1"

  if [[ -n "$runtime_vars_json" && "$(printf '%s' "$runtime_vars_json" | jq -r 'type' 2>/dev/null || true)" != "" ]]; then
    local value
    value="$(printf '%s' "$runtime_vars_json" | jq -r --arg key "$key" '
      if type == "array" then
        (map(select((.name // .key // "") == $key))[0].value // "")
      elif type == "object" and has("variables") then
        ((.variables | map(select((.name // .key // "") == $key))[0].value) // "")
      elif type == "object" then
        (.[$key] // "")
      else
        ""
      end
    ' 2>/dev/null)"
    if [[ -n "$value" && "$value" != "null" ]]; then
      printf '%s' "$value"
      return 0
    fi
  fi

  if [[ -n "$runtime_vars_text" ]]; then
    local value
    value="$(printf '%s\n' "$runtime_vars_text" | awk -F '=' -v k="$key" '$1==k {print substr($0, index($0,"=")+1); exit}')"
    if [[ -z "$value" ]]; then
      value="$(printf '%s\n' "$runtime_vars_text" | awk -F ':' -v k="$key" '$1==k {sub(/^ +/, "", $2); print $2; exit}')"
    fi
    if [[ -n "$value" ]]; then
      printf '%s' "$value"
      return 0
    fi
  fi

  return 1
}

assert_runtime_var_equals() {
  local key="$1"
  local expected="$2"
  local actual
  if ! actual="$(runtime_var_value "$key")"; then
    echo "error: unable to verify Railway runtime variable '$key'; refusing deploy" >&2
    exit 1
  fi

  if [[ "$actual" != "$expected" ]]; then
    echo "error: Railway runtime variable '$key' mismatch (expected '$expected')" >&2
    exit 1
  fi
}

assert_runtime_var_present() {
  local key="$1"
  local actual
  if ! actual="$(runtime_var_value "$key")" || [[ -z "$actual" ]]; then
    echo "error: Railway runtime variable '$key' must be present for EXPECTED_APP_ROLE=$EXPECTED_APP_ROLE" >&2
    exit 1
  fi
}

assert_runtime_var_absent() {
  local key="$1"
  local actual
  if actual="$(runtime_var_value "$key")" && [[ -n "$actual" ]]; then
    echo "error: Railway runtime variable '$key' must be absent for EXPECTED_APP_ROLE=$EXPECTED_APP_ROLE" >&2
    exit 1
  fi
}

assert_runtime_var_equals "IMAGE_REF" "$IMAGE_REF"
assert_runtime_var_equals "APP_ROLE" "$EXPECTED_APP_ROLE"
assert_runtime_var_equals "BANJI_SERVICE" "$EXPECTED_BANJI_SERVICE"
assert_runtime_var_equals "DATABASE_RUNTIME_ENDPOINT_KIND" "$DATABASE_RUNTIME_ENDPOINT_KIND"
assert_runtime_var_equals "PGBOUNCER_POOL_MODE" "$PGBOUNCER_POOL_MODE"

case "$EXPECTED_APP_ROLE" in
  api)
    assert_runtime_var_equals "EDGE_ENFORCEMENT_ENABLED" "$EDGE_ENFORCEMENT_ENABLED"
    assert_runtime_var_equals "EDGE_ORIGIN_AUTH_HEADER_NAME" "$EDGE_ORIGIN_AUTH_HEADER_NAME"
    assert_runtime_var_equals "EDGE_CORS_ALLOWED_ORIGINS" "$EDGE_CORS_ALLOWED_ORIGINS"
    assert_runtime_var_equals "AUTH_ENABLED" "$AUTH_ENABLED"
    assert_runtime_var_equals "AUTH_JWKS_URL" "$AUTH_JWKS_URL"
    assert_runtime_var_equals "AUTH_ISSUER" "$AUTH_ISSUER"
    assert_runtime_var_equals "AUTH_AUDIENCE" "$AUTH_AUDIENCE"
    assert_runtime_var_absent "OBJECT_STORAGE_ENDPOINT"
    assert_runtime_var_absent "OBJECT_STORAGE_ACCESS_KEY"
    assert_runtime_var_absent "OBJECT_STORAGE_SECRET_KEY"
    ;;
  event-relay)
    assert_runtime_var_present "DATABASE_RUNTIME_URL"
    assert_runtime_var_absent "RABBIT_URL"
    assert_runtime_var_absent "OBJECT_STORAGE_ENDPOINT"
    assert_runtime_var_absent "OBJECT_STORAGE_ACCESS_KEY"
    assert_runtime_var_absent "OBJECT_STORAGE_SECRET_KEY"
    assert_runtime_var_absent "AUTH_JWKS_URL"
    assert_runtime_var_absent "AUTH_ISSUER"
    assert_runtime_var_absent "AUTH_AUDIENCE"
    assert_runtime_var_absent "EDGE_ORIGIN_AUTH_HEADER_NAME"
    ;;
  projection-consumer)
    assert_runtime_var_present "DATABASE_RUNTIME_URL"
    assert_runtime_var_equals "EVENT_CONSUMER_SERVICE_NAME" "$EVENT_CONSUMER_SERVICE_NAME"
    assert_runtime_var_equals "EVENT_CONSUMER_NAME" "$EVENT_CONSUMER_NAME"
    assert_runtime_var_equals "EVENT_CONSUMER_STREAM_NAME" "$EVENT_CONSUMER_STREAM_NAME"
    assert_runtime_var_absent "RABBIT_URL"
    assert_runtime_var_absent "OBJECT_STORAGE_ENDPOINT"
    assert_runtime_var_absent "OBJECT_STORAGE_ACCESS_KEY"
    assert_runtime_var_absent "OBJECT_STORAGE_SECRET_KEY"
    assert_runtime_var_absent "AUTH_JWKS_URL"
    assert_runtime_var_absent "AUTH_ISSUER"
    assert_runtime_var_absent "AUTH_AUDIENCE"
    assert_runtime_var_absent "EDGE_ORIGIN_AUTH_HEADER_NAME"
    ;;
  worker)
    assert_runtime_var_present "DATABASE_RUNTIME_URL"
    assert_runtime_var_present "RABBIT_URL"
    assert_runtime_var_equals "OBJECT_STORAGE_ENABLED" "$OBJECT_STORAGE_ENABLED"
    assert_runtime_var_equals "OBJECT_STORAGE_ENDPOINT" "$OBJECT_STORAGE_ENDPOINT"
    assert_runtime_var_equals "OBJECT_STORAGE_REGION" "$OBJECT_STORAGE_REGION"
    assert_runtime_var_equals "OBJECT_STORAGE_BUCKET_ARTIFACTS" "$OBJECT_STORAGE_BUCKET_ARTIFACTS"
    assert_runtime_var_present "OBJECT_STORAGE_ACCESS_KEY"
    assert_runtime_var_present "OBJECT_STORAGE_SECRET_KEY"
    assert_runtime_var_present "ALGORITHM_ROLLOUT_HASH_SALT"
    assert_runtime_var_equals "ALGORITHM_ROLLOUT_HASH_SALT_VERSION" "$ALGORITHM_ROLLOUT_HASH_SALT_VERSION"
    assert_runtime_var_absent "AUTH_JWKS_URL"
    assert_runtime_var_absent "AUTH_ISSUER"
    assert_runtime_var_absent "AUTH_AUDIENCE"
    assert_runtime_var_absent "EDGE_ORIGIN_AUTH_HEADER_NAME"
    ;;
esac

"$RAILWAY_BIN" redeploy --service "$RAILWAY_SERVICE_ID" --project "$RAILWAY_PROJECT_ID" --yes
