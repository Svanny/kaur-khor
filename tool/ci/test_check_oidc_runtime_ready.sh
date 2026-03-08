#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT_DIR/tool/ci/check_oidc_runtime_ready.sh"
TMP_DIR="$(mktemp -d)"
LOG_FILE="$TMP_DIR/commands.log"
trap 'rm -rf "$TMP_DIR"' EXIT

cat >"$TMP_DIR/curl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

log_file="${MOCK_OIDC_LOG:?}"
payload=""
authorization=""
url=""

record() {
  printf '%s\n' "$*" >>"$log_file"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -s|-S|-f|-fsS|-fSs|-sfS|-sSf)
      shift
      ;;
    -X)
      shift 2
      ;;
    -H)
      if [[ "$2" == Authorization:* ]]; then
        authorization="${2#Authorization: }"
      fi
      shift 2
      ;;
    --data|--data-binary)
      payload="$2"
      shift 2
      ;;
    http*)
      url="$1"
      shift
      ;;
    *)
      echo "curl mock: unexpected argument '$1'" >&2
      exit 1
      ;;
  esac
done

if [[ "$url" == "https://backboard.railway.com/graphql/v2" ]]; then
  if [[ "$authorization" != "Bearer ${RAILWAY_API_TOKEN:-}" ]]; then
    echo "curl mock: missing or invalid Authorization header" >&2
    exit 1
  fi

  query="$(printf '%s' "$payload" | jq -r '.query // ""')"
  if [[ "$query" == *"query Environments"* ]]; then
    record "graphql environments"
    printf '{"data":{"environments":{"edges":[{"node":{"id":"env-staging","name":"staging"}},{"node":{"id":"env-prod","name":"prod"}}]}}}\n'
    exit 0
  fi

  if [[ "$query" == *"query Variables"* ]]; then
    record "graphql variables"
    if [[ -n "${FAKE_GRAPHQL_VARIABLES_ERRORS:-}" ]]; then
      printf '{"errors":[{"message":"%s"}]}\n' "$FAKE_GRAPHQL_VARIABLES_ERRORS"
      exit 0
    fi
    python3 - <<'PY'
import json
import os

runtime = json.loads(os.environ.get("FAKE_RENDERED_RUNTIME_JSON", "{}"))
print(json.dumps({"data": {"variables": runtime}}))
PY
    exit 0
  fi

  echo "curl mock: unsupported GraphQL query" >&2
  exit 1
fi

record "http $url"

if [[ "$url" == "${FAKE_DISCOVERY_URL:-}" ]]; then
  printf '%s\n' "${FAKE_DISCOVERY_JSON:-}"
  exit 0
fi

if [[ "$url" == "${FAKE_JWKS_URL:-}" ]]; then
  printf '%s\n' "${FAKE_JWKS_JSON:-}"
  exit 0
fi

echo "curl mock: unexpected URL '$url'" >&2
exit 1
EOF
chmod +x "$TMP_DIR/curl"

export PATH="$TMP_DIR:$PATH"
export MOCK_OIDC_LOG="$LOG_FILE"
export RAILWAY_API_TOKEN="token"
export RAILWAY_PROJECT_ID="project-id"
export RAILWAY_ENVIRONMENT="staging"
export RAILWAY_SERVICE_ID="svc-api"

export FAKE_RENDERED_RUNTIME_JSON='{"AUTH_ISSUER":"https://auth.example.com/realms/banji-staging","AUTH_JWKS_URL":"https://auth.example.com/realms/banji-staging/protocol/openid-connect/certs","AUTH_AUDIENCE":"banji-api"}'
export FAKE_DISCOVERY_URL="https://auth.example.com/realms/banji-staging/.well-known/openid-configuration"
export FAKE_DISCOVERY_JSON='{"issuer":"https://auth.example.com/realms/banji-staging","jwks_uri":"https://auth.example.com/realms/banji-staging/protocol/openid-connect/certs"}'
export FAKE_JWKS_URL="https://auth.example.com/realms/banji-staging/protocol/openid-connect/certs"
export FAKE_JWKS_JSON='{"keys":[{"kid":"banji-staging","kty":"RSA"}]}'

bash "$SCRIPT" >/dev/null
grep -q "^graphql environments$" "$LOG_FILE"
grep -q "^graphql variables$" "$LOG_FILE"
grep -q "^http https://auth.example.com/realms/banji-staging/.well-known/openid-configuration$" "$LOG_FILE"
grep -q "^http https://auth.example.com/realms/banji-staging/protocol/openid-connect/certs$" "$LOG_FILE"

: >"$LOG_FILE"
export FAKE_RENDERED_RUNTIME_JSON='{"AUTH_ISSUER":"https://auth.example.com/realms/banji-staging","AUTH_AUDIENCE":"banji-api"}'
if bash "$SCRIPT" >/dev/null 2>&1; then
  echo "assertion failed: missing AUTH_JWKS_URL should fail" >&2
  exit 1
fi
grep -q "^graphql variables$" "$LOG_FILE"
if grep -q "^http " "$LOG_FILE"; then
  echo "assertion failed: missing auth vars should fail before discovery fetches" >&2
  exit 1
fi

: >"$LOG_FILE"
export FAKE_RENDERED_RUNTIME_JSON='{"AUTH_ISSUER":"https://staging-keycloak.railway.internal/realms/banji-staging","AUTH_JWKS_URL":"https://auth.example.com/realms/banji-staging/protocol/openid-connect/certs","AUTH_AUDIENCE":"banji-api"}'
if bash "$SCRIPT" >/dev/null 2>&1; then
  echo "assertion failed: private Railway issuer URL should fail" >&2
  exit 1
fi
if grep -q "^http " "$LOG_FILE"; then
  echo "assertion failed: private-network issuer should fail before discovery fetches" >&2
  exit 1
fi

: >"$LOG_FILE"
export FAKE_RENDERED_RUNTIME_JSON='{"AUTH_ISSUER":"https://auth.example.com/realms/banji-staging","AUTH_JWKS_URL":"https://auth.example.com/realms/banji-staging/protocol/openid-connect/certs","AUTH_AUDIENCE":"banji-api"}'
export FAKE_DISCOVERY_JSON='{"issuer":"https://auth.example.com/realms/banji-staging","jwks_uri":"https://wrong.example.com/jwks"}'
if bash "$SCRIPT" >/dev/null 2>&1; then
  echo "assertion failed: discovery/JWKS mismatch should fail" >&2
  exit 1
fi

: >"$LOG_FILE"
export FAKE_DISCOVERY_JSON='{"issuer":"https://auth.example.com/realms/banji-staging","jwks_uri":"https://auth.example.com/realms/banji-staging/protocol/openid-connect/certs"}'
export FAKE_JWKS_JSON='{"keys":[]}'
if bash "$SCRIPT" >/dev/null 2>&1; then
  echo "assertion failed: empty JWKS should fail" >&2
  exit 1
fi

echo "oidc runtime readiness contract tests passed"
