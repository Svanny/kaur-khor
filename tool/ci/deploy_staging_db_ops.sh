#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
if [[ -z "${PREPARE_DB_OPS_BUILD_CONTEXT_SCRIPT:-}" && -n "${PREPARE_STAGING_DB_OPS_BUILD_CONTEXT_SCRIPT:-}" ]]; then
  export PREPARE_DB_OPS_BUILD_CONTEXT_SCRIPT="$PREPARE_STAGING_DB_OPS_BUILD_CONTEXT_SCRIPT"
fi
exec bash "$ROOT_DIR/tool/ci/deploy_db_ops.sh" "$@"
