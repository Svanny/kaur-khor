#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SOURCE_DIR="$ROOT_DIR/services/staging-db-ops"

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <output-dir>" >&2
  exit 1
fi

OUTPUT_DIR="$1"
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR/services/staging-db-ops" "$OUTPUT_DIR/apps/api" "$OUTPUT_DIR/tool/ci" "$OUTPUT_DIR/tool/db"

cp "$SOURCE_DIR/Dockerfile" "$OUTPUT_DIR/services/staging-db-ops/Dockerfile"
cp "$SOURCE_DIR/start.sh" "$OUTPUT_DIR/services/staging-db-ops/start.sh"
cp -R "$ROOT_DIR/apps/api/migrations" "$OUTPUT_DIR/apps/api/migrations"
cp "$ROOT_DIR/tool/ci/migrate_with_lock.sh" "$OUTPUT_DIR/tool/ci/migrate_with_lock.sh"
cp -R "$ROOT_DIR/tool/db/." "$OUTPUT_DIR/tool/db/"

chmod +x \
  "$OUTPUT_DIR/services/staging-db-ops/start.sh" \
  "$OUTPUT_DIR/tool/ci/migrate_with_lock.sh" \
  "$OUTPUT_DIR/tool/db/restore_validate.sh" \
  "$OUTPUT_DIR/tool/db/sqlx_migration_history_repair.sh" \
  "$OUTPUT_DIR/tool/db/event_log_storage_report.sh" \
  "$OUTPUT_DIR/tool/db/export_event_log.sh" \
  "$OUTPUT_DIR/tool/db/replay_event_log.sh"
