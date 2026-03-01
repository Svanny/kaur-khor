#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT_DIR/tool/ci/check_migration_versions.sh"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

mkdir -p "$TMP_DIR/unique" "$TMP_DIR/duplicate"

cat >"$TMP_DIR/unique/0001_initial.sql" <<'EOF'
SELECT 1;
EOF
cat >"$TMP_DIR/unique/0002_second.sql" <<'EOF'
SELECT 2;
EOF

MIGRATIONS_DIR="$TMP_DIR/unique" bash "$SCRIPT" >/dev/null

cat >"$TMP_DIR/duplicate/0016_a.sql" <<'EOF'
SELECT 1;
EOF
cat >"$TMP_DIR/duplicate/0016_b.sql" <<'EOF'
SELECT 2;
EOF

if MIGRATIONS_DIR="$TMP_DIR/duplicate" bash "$SCRIPT" >"$TMP_DIR/duplicate.out" 2>&1; then
  echo "assertion failed: duplicate migration versions should fail" >&2
  exit 1
fi

if ! grep -Fq "duplicate sqlx migration versions detected" "$TMP_DIR/duplicate.out"; then
  echo "assertion failed: duplicate failure output missing summary" >&2
  cat "$TMP_DIR/duplicate.out" >&2 || true
  exit 1
fi

if ! grep -Fq "0016_a.sql" "$TMP_DIR/duplicate.out" || ! grep -Fq "0016_b.sql" "$TMP_DIR/duplicate.out"; then
  echo "assertion failed: duplicate failure output missing file names" >&2
  cat "$TMP_DIR/duplicate.out" >&2 || true
  exit 1
fi

echo "migration version tests passed"
