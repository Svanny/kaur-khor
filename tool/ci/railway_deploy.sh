#!/usr/bin/env bash
set -euo pipefail

required=(
  RAILWAY_TOKEN
  RAILWAY_PROJECT_ID
  RAILWAY_SERVICE_ID
  IMAGE_REF
  DATABASE_RUNTIME_ENDPOINT_KIND
  PGBOUNCER_POOL_MODE
  EDGE_ENFORCEMENT_ENABLED
  EDGE_PROVIDER
  EDGE_ORIGIN_AUTH_HEADER_NAME
  EDGE_CORS_ALLOWED_ORIGINS
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

if [[ "${EDGE_ENFORCEMENT_ENABLED,,}" != "true" ]]; then
  echo "error: EDGE_ENFORCEMENT_ENABLED must be true for deploy targets" >&2
  exit 1
fi

if [[ "$EDGE_PROVIDER" != "cloudflare" ]]; then
  echo "error: EDGE_PROVIDER must be cloudflare for deploy targets" >&2
  exit 1
fi

if [[ -z "$EDGE_ORIGIN_AUTH_HEADER_NAME" ]]; then
  echo "error: EDGE_ORIGIN_AUTH_HEADER_NAME is required" >&2
  exit 1
fi

if [[ -z "$EDGE_CORS_ALLOWED_ORIGINS" ]]; then
  echo "error: EDGE_CORS_ALLOWED_ORIGINS is required" >&2
  exit 1
fi

npm install -g @railway/cli >/dev/null

# Railway must be configured to deploy from external GHCR image.
# This command updates runtime variables and triggers a redeploy.
railway login --token "$RAILWAY_TOKEN"
railway variables --set "IMAGE_REF=$IMAGE_REF" --service "$RAILWAY_SERVICE_ID" --project "$RAILWAY_PROJECT_ID"
railway variables --set "DATABASE_RUNTIME_ENDPOINT_KIND=$DATABASE_RUNTIME_ENDPOINT_KIND" --service "$RAILWAY_SERVICE_ID" --project "$RAILWAY_PROJECT_ID"
railway variables --set "PGBOUNCER_POOL_MODE=$PGBOUNCER_POOL_MODE" --service "$RAILWAY_SERVICE_ID" --project "$RAILWAY_PROJECT_ID"
railway variables --set "EDGE_ENFORCEMENT_ENABLED=$EDGE_ENFORCEMENT_ENABLED" --service "$RAILWAY_SERVICE_ID" --project "$RAILWAY_PROJECT_ID"
railway variables --set "EDGE_PROVIDER=$EDGE_PROVIDER" --service "$RAILWAY_SERVICE_ID" --project "$RAILWAY_PROJECT_ID"
railway variables --set "EDGE_ORIGIN_AUTH_HEADER_NAME=$EDGE_ORIGIN_AUTH_HEADER_NAME" --service "$RAILWAY_SERVICE_ID" --project "$RAILWAY_PROJECT_ID"
railway variables --set "EDGE_CORS_ALLOWED_ORIGINS=$EDGE_CORS_ALLOWED_ORIGINS" --service "$RAILWAY_SERVICE_ID" --project "$RAILWAY_PROJECT_ID"

runtime_vars_json="$(railway variables --service "$RAILWAY_SERVICE_ID" --project "$RAILWAY_PROJECT_ID" --json 2>/dev/null || true)"
runtime_vars_text=""
if [[ -z "$runtime_vars_json" || "$(printf '%s' "$runtime_vars_json" | jq -r 'type' 2>/dev/null || true)" == "" ]]; then
  runtime_vars_text="$(railway variables --service "$RAILWAY_SERVICE_ID" --project "$RAILWAY_PROJECT_ID" 2>/dev/null || true)"
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

assert_runtime_var_equals "DATABASE_RUNTIME_ENDPOINT_KIND" "$DATABASE_RUNTIME_ENDPOINT_KIND"
assert_runtime_var_equals "PGBOUNCER_POOL_MODE" "$PGBOUNCER_POOL_MODE"
assert_runtime_var_equals "EDGE_ENFORCEMENT_ENABLED" "$EDGE_ENFORCEMENT_ENABLED"
assert_runtime_var_equals "EDGE_PROVIDER" "$EDGE_PROVIDER"
assert_runtime_var_equals "EDGE_ORIGIN_AUTH_HEADER_NAME" "$EDGE_ORIGIN_AUTH_HEADER_NAME"
assert_runtime_var_equals "EDGE_CORS_ALLOWED_ORIGINS" "$EDGE_CORS_ALLOWED_ORIGINS"

railway redeploy --service "$RAILWAY_SERVICE_ID" --project "$RAILWAY_PROJECT_ID" --yes
