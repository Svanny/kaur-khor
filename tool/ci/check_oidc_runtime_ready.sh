#!/usr/bin/env bash
set -euo pipefail

RAILWAY_GRAPHQL_ENDPOINT="${RAILWAY_GRAPHQL_ENDPOINT:-https://backboard.railway.com/graphql/v2}"

required=(
  RAILWAY_API_TOKEN
  RAILWAY_PROJECT_ID
  RAILWAY_ENVIRONMENT
  RAILWAY_SERVICE_ID
)

for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "error: $name is required" >&2
    exit 1
  fi
done

run_graphql() {
  local label="$1"
  local payload="$2"
  local output=""

  if ! output="$(
    curl -fsS \
      -X POST \
      -H "Authorization: Bearer $RAILWAY_API_TOKEN" \
      -H "Content-Type: application/json" \
      --data-binary "$payload" \
      "$RAILWAY_GRAPHQL_ENDPOINT"
  )"; then
    echo "error: Railway GraphQL request failed during '$label'" >&2
    exit 1
  fi

  if ! printf '%s' "$output" | jq -e . >/dev/null 2>&1; then
    echo "error: Railway GraphQL returned invalid JSON during '$label'" >&2
    exit 1
  fi

  if ! printf '%s' "$output" | jq -e '(.errors // []) | length == 0' >/dev/null; then
    echo "error: Railway GraphQL returned errors during '$label'" >&2
    printf '%s\n' "$output" | jq -r '.errors[]?.message // empty' >&2
    exit 1
  fi

  printf '%s' "$output"
}

graphql_payload() {
  local query="$1"
  local variables_json="$2"

  jq -cn \
    --arg query "$query" \
    --argjson variables "$variables_json" \
    '{query: $query, variables: $variables}'
}

environment_query='query Environments($projectId: String!) { environments(projectId: $projectId) { edges { node { id name } } } }'
environment_variables="$(jq -cn --arg projectId "$RAILWAY_PROJECT_ID" '{projectId: $projectId}')"
environment_payload="$(graphql_payload "$environment_query" "$environment_variables")"
environment_response="$(run_graphql "fetch project environments" "$environment_payload")"

RAILWAY_ENVIRONMENT_ID="$(
  printf '%s' "$environment_response" | jq -r --arg env "$RAILWAY_ENVIRONMENT" '
    .data.environments.edges[]?.node
    | select(.name == $env)
    | .id
  ' | head -n1
)"

if [[ -z "${RAILWAY_ENVIRONMENT_ID:-}" ]]; then
  echo "error: environment '$RAILWAY_ENVIRONMENT' not found for project $RAILWAY_PROJECT_ID" >&2
  exit 1
fi

variables_query='query Variables($projectId: String!, $environmentId: String!, $serviceId: String) { variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId) }'
variables_json="$(
  jq -cn \
    --arg projectId "$RAILWAY_PROJECT_ID" \
    --arg environmentId "$RAILWAY_ENVIRONMENT_ID" \
    --arg serviceId "$RAILWAY_SERVICE_ID" \
    '{projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId}'
)"
variables_payload="$(graphql_payload "$variables_query" "$variables_json")"
variables_response="$(run_graphql "fetch rendered runtime variables" "$variables_payload")"
runtime_vars_json="$(
  printf '%s' "$variables_response" | jq -cS '
    .data.variables // {}
    | if type == "array" then
        reduce .[] as $item (
          {};
          if ($item | type) == "object" then
            .[($item.name // $item.key // "")] = ($item.value // "")
          else
            .
          end
        )
      elif type == "object" then
        with_entries(.value |= if . == null then "" else tostring end)
      else
        {}
      end
  '
)"

runtime_var_value() {
  local key="$1"
  printf '%s' "$runtime_vars_json" | jq -r --arg key "$key" '.[$key] // ""'
}

require_runtime_var_nonempty() {
  local key="$1"
  local value=""

  value="$(runtime_var_value "$key")"
  if [[ -z "$value" ]]; then
    echo "error: Railway api runtime variable '$key' must be configured before deploy" >&2
    exit 1
  fi

  printf '%s' "$value"
}

require_public_https_url() {
  local key="$1"
  local value="$2"

  if [[ ! "$value" =~ ^https:// ]]; then
    echo "error: $key must use a public https:// URL (got '$value')" >&2
    exit 1
  fi

  if [[ "$value" == *".railway.internal"* ]]; then
    echo "error: $key must use the public Keycloak hostname, not Railway private networking" >&2
    exit 1
  fi
}

AUTH_ISSUER="$(require_runtime_var_nonempty AUTH_ISSUER)"
AUTH_JWKS_URL="$(require_runtime_var_nonempty AUTH_JWKS_URL)"
AUTH_AUDIENCE="$(require_runtime_var_nonempty AUTH_AUDIENCE)"

require_public_https_url AUTH_ISSUER "$AUTH_ISSUER"
require_public_https_url AUTH_JWKS_URL "$AUTH_JWKS_URL"

oidc_config_url="${AUTH_ISSUER%/}/.well-known/openid-configuration"
oidc_config_json="$(curl -fsS "$oidc_config_url")"
if ! printf '%s' "$oidc_config_json" | jq -e . >/dev/null 2>&1; then
  echo "error: OIDC discovery endpoint returned invalid JSON for $oidc_config_url" >&2
  exit 1
fi

discovery_issuer="$(printf '%s' "$oidc_config_json" | jq -r '.issuer // ""')"
discovery_jwks_uri="$(printf '%s' "$oidc_config_json" | jq -r '.jwks_uri // ""')"

if [[ "$discovery_issuer" != "$AUTH_ISSUER" ]]; then
  echo "error: AUTH_ISSUER mismatch; discovery reported '$discovery_issuer'" >&2
  exit 1
fi

if [[ "$discovery_jwks_uri" != "$AUTH_JWKS_URL" ]]; then
  echo "error: AUTH_JWKS_URL mismatch; discovery reported '$discovery_jwks_uri'" >&2
  exit 1
fi

jwks_json="$(curl -fsS "$AUTH_JWKS_URL")"
if ! printf '%s' "$jwks_json" | jq -e '.keys | type == "array" and length > 0' >/dev/null 2>&1; then
  echo "error: AUTH_JWKS_URL did not return a non-empty JWKS document" >&2
  exit 1
fi

echo "oidc runtime ready for $RAILWAY_ENVIRONMENT/$RAILWAY_SERVICE_ID audience=$AUTH_AUDIENCE"
