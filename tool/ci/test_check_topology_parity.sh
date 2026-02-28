#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT_DIR/tool/ci/check_topology_parity.sh"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

export RAILWAY_STAGING_API_SERVICE_ID="stg-api"
export RAILWAY_STAGING_EVENT_RELAY_SERVICE_ID="stg-relay"
export RAILWAY_STAGING_PROJECTION_CONSUMER_SERVICE_ID="stg-projection"
export RAILWAY_STAGING_WORKER_SERVICE_ID="stg-worker"
export RAILWAY_PROD_API_SERVICE_ID="prod-api"
export RAILWAY_PROD_EVENT_RELAY_SERVICE_ID="prod-relay"
export RAILWAY_PROD_PROJECTION_CONSUMER_SERVICE_ID="prod-projection"
export RAILWAY_PROD_WORKER_SERVICE_ID="prod-worker"

bash "$SCRIPT" >/dev/null

cat >"$TMP_DIR/missing-role.json" <<'JSON'
{
  "roles": [
    {
      "role": "api",
      "singleton_role": false,
      "required_capabilities": ["db", "auth", "edge"],
      "forbidden_capabilities": ["object_storage"]
    }
  ]
}
JSON

if TOPOLOGY_FILE="$TMP_DIR/missing-role.json" bash "$SCRIPT" >/dev/null 2>&1; then
  echo "assertion failed: missing role topology should fail" >&2
  exit 1
fi

if RAILWAY_STAGING_WORKER_SERVICE_ID="stg-api" bash "$SCRIPT" >/dev/null 2>&1; then
  echo "assertion failed: duplicate staging service ids should fail" >&2
  exit 1
fi

cat >"$TMP_DIR/forbidden-capabilities.json" <<'JSON'
{
  "roles": [
    {
      "role": "api",
      "singleton_role": false,
      "required_capabilities": ["db", "auth", "edge"],
      "forbidden_capabilities": []
    },
    {
      "role": "event-relay",
      "singleton_role": false,
      "required_capabilities": ["db"],
      "forbidden_capabilities": ["rabbit", "object_storage", "auth", "edge"]
    },
    {
      "role": "projection-consumer",
      "singleton_role": true,
      "required_capabilities": ["db", "event_consumer_config"],
      "forbidden_capabilities": ["rabbit", "object_storage", "auth", "edge"]
    },
    {
      "role": "worker",
      "singleton_role": false,
      "required_capabilities": ["db", "rabbit", "object_storage"],
      "forbidden_capabilities": ["auth", "edge"]
    }
  ]
}
JSON

if TOPOLOGY_FILE="$TMP_DIR/forbidden-capabilities.json" bash "$SCRIPT" >/dev/null 2>&1; then
  echo "assertion failed: invalid forbidden capabilities should fail" >&2
  exit 1
fi

echo "topology parity tests passed"
