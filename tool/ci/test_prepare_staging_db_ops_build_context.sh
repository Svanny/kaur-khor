#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT_DIR/tool/ci/prepare_staging_db_ops_build_context.sh"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

OUTPUT_DIR="$TMP_DIR/context"
bash "$SCRIPT" "$OUTPUT_DIR"

for path in \
  "$OUTPUT_DIR/services/staging-db-ops/Dockerfile" \
  "$OUTPUT_DIR/services/staging-db-ops/start.sh" \
  "$OUTPUT_DIR/apps/api/migrations" \
  "$OUTPUT_DIR/tool/ci/migrate_with_lock.sh" \
  "$OUTPUT_DIR/tool/db/restore_validate.sh" \
  "$OUTPUT_DIR/tool/db/sqlx_migration_history_repair.sh"; do
  if [[ ! -e "$path" ]]; then
    echo "assertion failed: expected build-context path $path" >&2
    exit 1
  fi
done

echo "prepare_staging_db_ops_build_context tests passed"
