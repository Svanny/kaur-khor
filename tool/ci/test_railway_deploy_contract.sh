#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEPLOY_SCRIPT="$ROOT_DIR/tool/ci/railway_deploy.sh"
PARITY_SCRIPT="$ROOT_DIR/tool/ci/check_railway_image_parity.sh"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

cat >"$TMP_DIR/railway" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == "login" ]]; then
  exit 0
fi
if [[ "$1" == "redeploy" ]]; then
  exit 0
fi
if [[ "$1" == "variables" ]]; then
  if [[ "$2" == "--set" ]]; then
    exit 0
  fi
  service_id=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --service)
        service_id="$2"
        shift 2
        ;;
      *)
        shift
        ;;
    esac
  done
  case "$service_id" in
    svc-api)
      printf '%s\n' "$FAKE_RAILWAY_JSON_SVC_API"
      ;;
    svc-relay)
      printf '%s\n' "$FAKE_RAILWAY_JSON_SVC_RELAY"
      ;;
    svc-projection)
      printf '%s\n' "$FAKE_RAILWAY_JSON_SVC_PROJECTION"
      ;;
    svc-worker)
      printf '%s\n' "$FAKE_RAILWAY_JSON_SVC_WORKER"
      ;;
    *)
      printf '{}\n'
      ;;
  esac
  exit 0
fi
exit 1
EOF
chmod +x "$TMP_DIR/railway"

export RAILWAY_TOKEN="token"
export RAILWAY_PROJECT_ID="project"
export RAILWAY_SERVICE_ID="svc-api"
export IMAGE_REF="ghcr.io/svanny/banji-api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
export EXPECTED_APP_ROLE="api"
export EXPECTED_BANJI_SERVICE="api"
export DATABASE_RUNTIME_ENDPOINT_KIND="pgbouncer"
export PGBOUNCER_POOL_MODE="transaction"
export EDGE_ENFORCEMENT_ENABLED="true"
export EDGE_ORIGIN_AUTH_HEADER_NAME="x-banji-edge-auth"
export EDGE_CORS_ALLOWED_ORIGINS="https://app.example.com"
export AUTH_ENABLED="true"
export AUTH_JWKS_URL="https://jwks.example.com"
export AUTH_ISSUER="https://issuer.example.com"
export AUTH_AUDIENCE="banji-api"
export SKIP_RAILWAY_INSTALL="true"
export RAILWAY_BIN="$TMP_DIR/railway"

export FAKE_RAILWAY_JSON_SVC_API='{"IMAGE_REF":"ghcr.io/svanny/banji-api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","APP_ROLE":"worker","BANJI_SERVICE":"api","DATABASE_RUNTIME_ENDPOINT_KIND":"pgbouncer","PGBOUNCER_POOL_MODE":"transaction","EDGE_ENFORCEMENT_ENABLED":"true","EDGE_ORIGIN_AUTH_HEADER_NAME":"x-banji-edge-auth","EDGE_CORS_ALLOWED_ORIGINS":"https://app.example.com","AUTH_ENABLED":"true","AUTH_JWKS_URL":"https://jwks.example.com","AUTH_ISSUER":"https://issuer.example.com","AUTH_AUDIENCE":"banji-api"}'
export FAKE_RAILWAY_JSON_SVC_RELAY='{"IMAGE_REF":"ghcr.io/svanny/banji-api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'
export FAKE_RAILWAY_JSON_SVC_PROJECTION='{"IMAGE_REF":"ghcr.io/svanny/banji-api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'
export FAKE_RAILWAY_JSON_SVC_WORKER='{"IMAGE_REF":"ghcr.io/svanny/banji-api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'

if bash "$DEPLOY_SCRIPT" >/dev/null 2>&1; then
  echo "assertion failed: wrong APP_ROLE should fail deploy contract" >&2
  exit 1
fi

export FAKE_RAILWAY_JSON_SVC_API='{"IMAGE_REF":"ghcr.io/svanny/banji-api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","APP_ROLE":"api","BANJI_SERVICE":"worker","DATABASE_RUNTIME_ENDPOINT_KIND":"pgbouncer","PGBOUNCER_POOL_MODE":"transaction","EDGE_ENFORCEMENT_ENABLED":"true","EDGE_ORIGIN_AUTH_HEADER_NAME":"x-banji-edge-auth","EDGE_CORS_ALLOWED_ORIGINS":"https://app.example.com","AUTH_ENABLED":"true","AUTH_JWKS_URL":"https://jwks.example.com","AUTH_ISSUER":"https://issuer.example.com","AUTH_AUDIENCE":"banji-api"}'
if bash "$DEPLOY_SCRIPT" >/dev/null 2>&1; then
  echo "assertion failed: wrong BANJI_SERVICE should fail deploy contract" >&2
  exit 1
fi

export FAKE_RAILWAY_JSON_SVC_API='{"IMAGE_REF":"ghcr.io/svanny/banji-api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","APP_ROLE":"api","BANJI_SERVICE":"api","DATABASE_RUNTIME_ENDPOINT_KIND":"pgbouncer","PGBOUNCER_POOL_MODE":"transaction","EDGE_ENFORCEMENT_ENABLED":"true","EDGE_ORIGIN_AUTH_HEADER_NAME":"x-banji-edge-auth","EDGE_CORS_ALLOWED_ORIGINS":"https://app.example.com","AUTH_ENABLED":"true","AUTH_JWKS_URL":"https://jwks.example.com","AUTH_ISSUER":"https://issuer.example.com","AUTH_AUDIENCE":"banji-api","OBJECT_STORAGE_ENDPOINT":"https://storage.example.com"}'
if bash "$DEPLOY_SCRIPT" >/dev/null 2>&1; then
  echo "assertion failed: forbidden runtime secret should fail deploy contract" >&2
  exit 1
fi

unset EDGE_ENFORCEMENT_ENABLED EDGE_ORIGIN_AUTH_HEADER_NAME EDGE_CORS_ALLOWED_ORIGINS
unset AUTH_ENABLED AUTH_JWKS_URL AUTH_ISSUER AUTH_AUDIENCE
export RAILWAY_SERVICE_ID="svc-worker"
export EXPECTED_APP_ROLE="worker"
export EXPECTED_BANJI_SERVICE="worker"
export DATABASE_RUNTIME_URL="postgres://runtime@db.example/banji"
export RABBIT_URL="amqps://rabbit.example.com/%2f"
export OBJECT_STORAGE_ENABLED="true"
export OBJECT_STORAGE_ENDPOINT="https://storage.example.com"
export OBJECT_STORAGE_REGION="us-east-1"
export OBJECT_STORAGE_BUCKET_ARTIFACTS="banji-artifacts"
export OBJECT_STORAGE_ACCESS_KEY="access"
export OBJECT_STORAGE_SECRET_KEY="secret"
export ALGORITHM_ROLLOUT_HASH_SALT="salt"
export ALGORITHM_ROLLOUT_HASH_SALT_VERSION="salt-v1"
export FAKE_RAILWAY_JSON_SVC_WORKER='{"IMAGE_REF":"ghcr.io/svanny/banji-api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","APP_ROLE":"worker","BANJI_SERVICE":"worker","DATABASE_RUNTIME_ENDPOINT_KIND":"pgbouncer","PGBOUNCER_POOL_MODE":"transaction","DATABASE_RUNTIME_URL":"postgres://runtime@db.example/banji","RABBIT_URL":"amqps://rabbit.example.com/%2f","OBJECT_STORAGE_ENABLED":"true","OBJECT_STORAGE_ENDPOINT":"https://storage.example.com","OBJECT_STORAGE_REGION":"us-east-1","OBJECT_STORAGE_BUCKET_ARTIFACTS":"banji-artifacts","OBJECT_STORAGE_ACCESS_KEY":"access","OBJECT_STORAGE_SECRET_KEY":"secret","ALGORITHM_ROLLOUT_HASH_SALT":"salt","ALGORITHM_ROLLOUT_HASH_SALT_VERSION":"salt-v1"}'

bash "$DEPLOY_SCRIPT" >/dev/null

export RAILWAY_SERVICE_ID="svc-api"
export EXPECTED_APP_ROLE="api"
export EXPECTED_BANJI_SERVICE="api"
unset DATABASE_RUNTIME_URL RABBIT_URL OBJECT_STORAGE_ENABLED OBJECT_STORAGE_ENDPOINT OBJECT_STORAGE_REGION
unset OBJECT_STORAGE_BUCKET_ARTIFACTS OBJECT_STORAGE_ACCESS_KEY OBJECT_STORAGE_SECRET_KEY
unset ALGORITHM_ROLLOUT_HASH_SALT ALGORITHM_ROLLOUT_HASH_SALT_VERSION
export EDGE_ENFORCEMENT_ENABLED="true"
export EDGE_ORIGIN_AUTH_HEADER_NAME="x-banji-edge-auth"
export EDGE_CORS_ALLOWED_ORIGINS="https://app.example.com"
export AUTH_ENABLED="true"
export AUTH_JWKS_URL="https://jwks.example.com"
export AUTH_ISSUER="https://issuer.example.com"
export AUTH_AUDIENCE="banji-api"
export FAKE_RAILWAY_JSON_SVC_API='{"IMAGE_REF":"ghcr.io/svanny/banji-api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","APP_ROLE":"api","BANJI_SERVICE":"api","DATABASE_RUNTIME_ENDPOINT_KIND":"pgbouncer","PGBOUNCER_POOL_MODE":"transaction","EDGE_ENFORCEMENT_ENABLED":"true","EDGE_ORIGIN_AUTH_HEADER_NAME":"x-banji-edge-auth","EDGE_CORS_ALLOWED_ORIGINS":"https://app.example.com","AUTH_ENABLED":"true","AUTH_JWKS_URL":"https://jwks.example.com","AUTH_ISSUER":"https://issuer.example.com","AUTH_AUDIENCE":"banji-api"}'
export EDGE_PROVIDER="cloudflare"
bash "$DEPLOY_SCRIPT" >/dev/null
unset EDGE_PROVIDER

export RAILWAY_API_SERVICE_ID="svc-api"
export RAILWAY_EVENT_RELAY_SERVICE_ID="svc-relay"
export RAILWAY_PROJECTION_CONSUMER_SERVICE_ID="svc-projection"
export RAILWAY_WORKER_SERVICE_ID="svc-worker"
export FAKE_RAILWAY_JSON_SVC_API='{"IMAGE_REF":"ghcr.io/svanny/banji-api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'
export FAKE_RAILWAY_JSON_SVC_RELAY='{"IMAGE_REF":"ghcr.io/svanny/banji-api@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}'

if bash "$PARITY_SCRIPT" >/dev/null 2>&1; then
  echo "assertion failed: mismatched IMAGE_REF across roles should fail parity check" >&2
  exit 1
fi

echo "railway deploy contract tests passed"
