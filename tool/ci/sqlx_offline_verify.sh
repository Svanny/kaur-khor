#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API_DIR="$ROOT_DIR/apps/api"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "error: DATABASE_URL is required for sqlx offline verification" >&2
  exit 1
fi

if [[ ! -f "$API_DIR/sqlx-data.json" ]]; then
  echo "error: apps/api/sqlx-data.json is missing" >&2
  exit 1
fi

pushd "$API_DIR" >/dev/null
sqlx migrate run --database-url "$DATABASE_URL"
cargo +stable sqlx prepare --check -- --all-targets
popd >/dev/null
