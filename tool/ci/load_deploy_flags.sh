#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONFIG_DIR="${DEPLOY_FLAG_CONFIG_DIR:-$ROOT_DIR/config/ci}"

ENVIRONMENT="${1:-}"
DEBUG_OVERRIDE="${2:-}"

usage() {
  echo "usage: $0 <staging|prod> [debug_override]" >&2
}

is_truthy() {
  local value
  value="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  case "$value" in
    1|true|yes|on)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

load_env_file() {
  local file="$1"
  local line key value

  if [[ ! -f "$file" ]]; then
    echo "error: config file not found: $file" >&2
    exit 1
  fi

  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" ]] && continue
    [[ "$line" =~ ^# ]] && continue

    if [[ "$line" != *=* ]]; then
      echo "error: invalid config line '$line' in $file" >&2
      exit 1
    fi

    key="${line%%=*}"
    value="${line#*=}"

    if [[ ! "$key" =~ ^[A-Z0-9_]+$ ]]; then
      echo "error: invalid config key '$key' in $file" >&2
      exit 1
    fi

    export "$key=$value"
  done <"$file"
}

require_var() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "error: required deploy flag '$name' is missing" >&2
    exit 1
  fi
}

if [[ -z "$ENVIRONMENT" ]]; then
  usage
  exit 1
fi

case "$ENVIRONMENT" in
  staging|prod)
    ;;
  *)
    echo "error: environment must be 'staging' or 'prod' (got '$ENVIRONMENT')" >&2
    usage
    exit 1
    ;;
esac

load_env_file "$CONFIG_DIR/deploy.common.env"
load_env_file "$CONFIG_DIR/deploy.$ENVIRONMENT.env"

require_var SQLX_CLI_VERSION
require_var RAILWAY_CLI_VERSION
require_var RAILWAY_CI_DEBUG
require_var DATABASE_RUNTIME_ENDPOINT_KIND
require_var PGBOUNCER_POOL_MODE

if [[ ! "$SQLX_CLI_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "error: SQLX_CLI_VERSION must be semver (got '$SQLX_CLI_VERSION')" >&2
  exit 1
fi

if [[ ! "$RAILWAY_CLI_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "error: RAILWAY_CLI_VERSION must be semver (got '$RAILWAY_CLI_VERSION')" >&2
  exit 1
fi

if [[ "$RAILWAY_CI_DEBUG" != "0" && "$RAILWAY_CI_DEBUG" != "1" ]]; then
  echo "error: RAILWAY_CI_DEBUG must be 0 or 1 (got '$RAILWAY_CI_DEBUG')" >&2
  exit 1
fi

if [[ "$DATABASE_RUNTIME_ENDPOINT_KIND" != "pgbouncer" ]]; then
  echo "error: DATABASE_RUNTIME_ENDPOINT_KIND must be 'pgbouncer' for deploy (got '$DATABASE_RUNTIME_ENDPOINT_KIND')" >&2
  exit 1
fi

if [[ "$PGBOUNCER_POOL_MODE" != "transaction" ]]; then
  echo "error: PGBOUNCER_POOL_MODE must be 'transaction' for deploy (got '$PGBOUNCER_POOL_MODE')" >&2
  exit 1
fi

if is_truthy "$DEBUG_OVERRIDE"; then
  RAILWAY_CI_DEBUG="1"
fi

printf 'SQLX_CLI_VERSION=%s\n' "$SQLX_CLI_VERSION"
printf 'RAILWAY_CLI_VERSION=%s\n' "$RAILWAY_CLI_VERSION"
printf 'RAILWAY_CI_DEBUG=%s\n' "$RAILWAY_CI_DEBUG"
printf 'DATABASE_RUNTIME_ENDPOINT_KIND=%s\n' "$DATABASE_RUNTIME_ENDPOINT_KIND"
printf 'PGBOUNCER_POOL_MODE=%s\n' "$PGBOUNCER_POOL_MODE"
