#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SETUP_SCRIPT="${RABBIT_SETUP_SCRIPT:-$ROOT_DIR/tool/rabbit/setup_topology.sh}"
CHECK_SCRIPT="${RABBIT_CHECK_SCRIPT:-$ROOT_DIR/tool/rabbit/check_topology.sh}"

BANJI_SYSTEM="${BANJI_SYSTEM:-banji-core}"
BANJI_ENV="${BANJI_ENV:-}"
RABBIT_VHOST="${RABBIT_VHOST:-/}"

RABBIT_MGMT_URL="${RABBIT_MGMT_URL:-${RABBIT_MANAGEMENT_API_BASE_URL:-}}"
RABBIT_MGMT_USER="${RABBIT_MGMT_USER:-${RABBIT_MANAGEMENT_USERNAME:-}}"
RABBIT_MGMT_PASS="${RABBIT_MGMT_PASS:-${RABBIT_MANAGEMENT_PASSWORD:-}}"

require_var() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "error: $name is required" >&2
    exit 1
  fi
}

require_rabbit_management_secret() {
  local canonical_name="$1"
  local value="${!canonical_name:-}"
  if [[ -z "$value" ]]; then
    echo "error: $canonical_name is required" >&2
    exit 1
  fi
}

require_file() {
  local path="$1"
  if [[ ! -x "$path" ]]; then
    echo "error: required executable not found: $path" >&2
    exit 1
  fi
}

require_var BANJI_ENV
require_var RABBIT_VHOST
require_rabbit_management_secret RABBIT_MANAGEMENT_API_BASE_URL
require_rabbit_management_secret RABBIT_MANAGEMENT_USERNAME
require_rabbit_management_secret RABBIT_MANAGEMENT_PASSWORD
require_file "$SETUP_SCRIPT"
require_file "$CHECK_SCRIPT"

RABBIT_EXCHANGE_JOBS="${RABBIT_EXCHANGE_JOBS:-${BANJI_SYSTEM}.${BANJI_ENV}.jobs}"
RABBIT_EXCHANGE_JOBS_REPLAY="${RABBIT_EXCHANGE_JOBS_REPLAY:-${BANJI_SYSTEM}.${BANJI_ENV}.jobs.replay}"
RABBIT_DLX_EXCHANGE="${RABBIT_DLX_EXCHANGE:-${BANJI_SYSTEM}.${BANJI_ENV}.jobs.dlx}"

export BANJI_SYSTEM
export BANJI_ENV
export RABBIT_VHOST
export RABBIT_MGMT_URL
export RABBIT_MGMT_USER
export RABBIT_MGMT_PASS
export RABBIT_EXCHANGE_JOBS
export RABBIT_EXCHANGE_JOBS_REPLAY
export RABBIT_DLX_EXCHANGE

"$SETUP_SCRIPT"
"$CHECK_SCRIPT"
