#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TOPOLOGY_FILE="${TOPOLOGY_FILE:-$ROOT_DIR/config/topology/runtime_roles.json}"

required_env_vars=(
  RAILWAY_STAGING_API_SERVICE_ID
  RAILWAY_STAGING_EVENT_RELAY_SERVICE_ID
  RAILWAY_STAGING_PROJECTION_CONSUMER_SERVICE_ID
  RAILWAY_STAGING_WORKER_SERVICE_ID
  RAILWAY_PROD_API_SERVICE_ID
  RAILWAY_PROD_EVENT_RELAY_SERVICE_ID
  RAILWAY_PROD_PROJECTION_CONSUMER_SERVICE_ID
  RAILWAY_PROD_WORKER_SERVICE_ID
)

for name in "${required_env_vars[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "error: $name is required" >&2
    exit 1
  fi
done

python3 - "$TOPOLOGY_FILE" <<'PY'
import json
import sys

path = sys.argv[1]
with open(path, "r", encoding="utf-8") as handle:
    payload = json.load(handle)

expected = {
    "api": {
        "singleton_role": False,
        "required_capabilities": {"db", "auth", "edge"},
        "forbidden_capabilities": {"object_storage"},
    },
    "event-relay": {
        "singleton_role": False,
        "required_capabilities": {"db"},
        "forbidden_capabilities": {"rabbit", "object_storage", "auth", "edge"},
    },
    "projection-consumer": {
        "singleton_role": True,
        "required_capabilities": {"db", "event_consumer_config"},
        "forbidden_capabilities": {"rabbit", "object_storage", "auth", "edge"},
    },
    "worker": {
        "singleton_role": False,
        "required_capabilities": {"db", "rabbit", "object_storage"},
        "forbidden_capabilities": {"auth", "edge"},
    },
}

roles = payload.get("roles")
if not isinstance(roles, list):
    raise SystemExit("error: topology file must contain a roles array")

actual = {}
for entry in roles:
    role = entry.get("role")
    if role in actual:
        raise SystemExit(f"error: duplicate topology role '{role}'")
    actual[role] = {
        "singleton_role": entry.get("singleton_role"),
        "required_capabilities": set(entry.get("required_capabilities", [])),
        "forbidden_capabilities": set(entry.get("forbidden_capabilities", [])),
    }

if set(actual) != set(expected):
    raise SystemExit(
        f"error: topology roles mismatch; expected {sorted(expected)} got {sorted(actual)}"
    )

for role, required in expected.items():
    if actual[role]["singleton_role"] != required["singleton_role"]:
        raise SystemExit(f"error: topology role '{role}' singleton_role mismatch")
    if actual[role]["required_capabilities"] != required["required_capabilities"]:
        raise SystemExit(f"error: topology role '{role}' required_capabilities mismatch")
    if actual[role]["forbidden_capabilities"] != required["forbidden_capabilities"]:
        raise SystemExit(f"error: topology role '{role}' forbidden_capabilities mismatch")
PY

check_unique_ids() {
  local env_name="$1"
  shift
  local seen=""
  local value
  for value in "$@"; do
    if [[ " $seen " == *" $value "* ]]; then
      echo "error: duplicate Railway service id detected in $env_name topology" >&2
      exit 1
    fi
    seen="$seen $value"
  done
}

check_unique_ids "staging" \
  "$RAILWAY_STAGING_API_SERVICE_ID" \
  "$RAILWAY_STAGING_EVENT_RELAY_SERVICE_ID" \
  "$RAILWAY_STAGING_PROJECTION_CONSUMER_SERVICE_ID" \
  "$RAILWAY_STAGING_WORKER_SERVICE_ID"

check_unique_ids "prod" \
  "$RAILWAY_PROD_API_SERVICE_ID" \
  "$RAILWAY_PROD_EVENT_RELAY_SERVICE_ID" \
  "$RAILWAY_PROD_PROJECTION_CONSUMER_SERVICE_ID" \
  "$RAILWAY_PROD_WORKER_SERVICE_ID"

echo "topology parity check passed"
