#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT_DIR/tool/ci/load_deploy_flags.sh"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

bash "$SCRIPT" staging >"$TMP_DIR/staging.env"
grep -q '^SQLX_CLI_VERSION=0.8.2$' "$TMP_DIR/staging.env"
grep -q '^RAILWAY_CLI_VERSION=4.6.1$' "$TMP_DIR/staging.env"
grep -q '^RAILWAY_CI_DEBUG=0$' "$TMP_DIR/staging.env"
grep -q '^DATABASE_RUNTIME_ENDPOINT_KIND=pgbouncer$' "$TMP_DIR/staging.env"
grep -q '^PGBOUNCER_POOL_MODE=transaction$' "$TMP_DIR/staging.env"

bash "$SCRIPT" prod >"$TMP_DIR/prod.env"
grep -q '^DATABASE_RUNTIME_ENDPOINT_KIND=pgbouncer$' "$TMP_DIR/prod.env"
grep -q '^PGBOUNCER_POOL_MODE=transaction$' "$TMP_DIR/prod.env"

bash "$SCRIPT" staging true >"$TMP_DIR/staging-debug.env"
grep -q '^RAILWAY_CI_DEBUG=1$' "$TMP_DIR/staging-debug.env"

if bash "$SCRIPT" dev >"$TMP_DIR/dev.env" 2>"$TMP_DIR/dev.err"; then
  echo "assertion failed: invalid environment should fail" >&2
  exit 1
fi

CONFIG_FIXTURE_DIR="$TMP_DIR/config/ci"
mkdir -p "$CONFIG_FIXTURE_DIR"
cp "$ROOT_DIR/config/ci/deploy.common.env" "$CONFIG_FIXTURE_DIR/deploy.common.env"
cp "$ROOT_DIR/config/ci/deploy.staging.env" "$CONFIG_FIXTURE_DIR/deploy.staging.env"
cp "$ROOT_DIR/config/ci/deploy.prod.env" "$CONFIG_FIXTURE_DIR/deploy.prod.env"
grep -v '^PGBOUNCER_POOL_MODE=' "$CONFIG_FIXTURE_DIR/deploy.staging.env" >"$CONFIG_FIXTURE_DIR/deploy.staging.tmp"
mv "$CONFIG_FIXTURE_DIR/deploy.staging.tmp" "$CONFIG_FIXTURE_DIR/deploy.staging.env"

if DEPLOY_FLAG_CONFIG_DIR="$CONFIG_FIXTURE_DIR" bash "$SCRIPT" staging >"$TMP_DIR/missing.env" 2>"$TMP_DIR/missing.err"; then
  echo "assertion failed: missing required key should fail" >&2
  exit 1
fi

echo "deploy flag loader tests passed"
