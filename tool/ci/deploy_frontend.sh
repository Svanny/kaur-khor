#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PREPARE_SCRIPT="${PREPARE_FRONTEND_BUILD_CONTEXT_SCRIPT:-$ROOT_DIR/tool/ci/prepare_frontend_build_context.sh}"

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
    printf '[frontend-deploy-debug] %s\n' "$1" >&2
  fi
}

require_cmd railway
require_cmd mktemp
require_env RAILWAY_API_TOKEN
require_env RAILWAY_PROJECT_ID
require_env RAILWAY_ENVIRONMENT
require_env RAILWAY_SERVICE_ID

if [[ -n "${RAILWAY_TOKEN:-}" ]]; then
  echo "error: RAILWAY_TOKEN is no longer supported for deploy; use RAILWAY_API_TOKEN only." >&2
  exit 1
fi

if [[ ! -f "$PREPARE_SCRIPT" ]]; then
  echo "error: frontend build-context helper not found: $PREPARE_SCRIPT" >&2
  exit 1
fi

debug_log "begin: railway whoami"
if ! railway whoami >/dev/null 2>&1; then
  echo "error: Railway CLI auth check failed (railway whoami)." >&2
  exit 1
fi
debug_log "pass: railway whoami"

debug_log "begin: railway link"
if ! railway link --project "$RAILWAY_PROJECT_ID" --environment "$RAILWAY_ENVIRONMENT" --service "$RAILWAY_SERVICE_ID" </dev/null >/dev/null 2>&1; then
  echo "error: Railway service-scoped link failed for project '$RAILWAY_PROJECT_ID', environment '$RAILWAY_ENVIRONMENT', service '$RAILWAY_SERVICE_ID'." >&2
  railway link --project "$RAILWAY_PROJECT_ID" --environment "$RAILWAY_ENVIRONMENT" --service "$RAILWAY_SERVICE_ID" </dev/null || true
  exit 1
fi
debug_log "pass: railway link"

build_context="$(mktemp -d)"
trap 'rm -rf "$build_context"' EXIT

debug_log "begin: prepare frontend build context"
bash "$PREPARE_SCRIPT" "$build_context" >/dev/null
debug_log "pass: prepare frontend build context"

debug_log "begin: railway up"
railway up "$build_context" --path-as-root --service "$RAILWAY_SERVICE_ID" --detach
debug_log "pass: railway up"
