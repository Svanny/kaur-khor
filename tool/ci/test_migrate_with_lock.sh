#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT_DIR/tool/ci/migrate_with_lock.sh"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

cat >"$TMP_DIR/psql" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

echo "psql:$*" >>"$MOCK_LOG"

while IFS= read -r line; do
  echo "stdin:$line" >>"$MOCK_LOG"
  if [[ "$line" == *"pg_advisory_lock("* ]]; then
    echo "pg_advisory_lock"
    echo "---------------"
    echo "t"
  fi
  if [[ "$line" == "\\echo LOCK_ACQUIRED" ]]; then
    echo "LOCK_ACQUIRED"
  fi
  if [[ "$line" == *"pg_advisory_unlock("* ]]; then
    echo "pg_advisory_unlock"
    echo "-----------------"
    echo "t"
  fi
  if [[ "$line" == "\\q" ]]; then
    exit 0
  fi
done
EOF
chmod +x "$TMP_DIR/psql"

cat >"$TMP_DIR/sqlx" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

echo "sqlx:$*" >>"$MOCK_LOG"
if grep -Fq 'stdin:\echo LOCK_ACQUIRED' "$MOCK_LOG" && ! grep -Fq 'stdin:SELECT pg_advisory_unlock' "$MOCK_LOG"; then
  echo "sqlx saw lock held" >>"$MOCK_LOG"
  exit 0
fi

echo "sqlx started without lock" >&2
exit 1
EOF
chmod +x "$TMP_DIR/sqlx"

export DATABASE_MIGRATION_URL="postgres://migrator@db.example/banji"
export DATABASE_RUNTIME_URL="postgres://runtime@db.example/banji-runtime"
export MIGRATION_SENTINEL="$TMP_DIR/sentinel"
export PSQL_BIN="$TMP_DIR/psql"
export SQLX_BIN="$TMP_DIR/sqlx"
export MOCK_LOG="$TMP_DIR/mock.log"

bash "$SCRIPT" >/dev/null

if [[ ! -f "$MIGRATION_SENTINEL" ]]; then
  echo "assertion failed: sentinel file was not written" >&2
  exit 1
fi

if ! grep -Fq 'stdin:SELECT pg_advisory_lock' "$MOCK_LOG"; then
  echo "assertion failed: lock query was not sent" >&2
  cat "$MOCK_LOG" >&2 || true
  exit 1
fi

if ! grep -Fq 'sqlx saw lock held' "$MOCK_LOG"; then
  echo "assertion failed: sqlx did not run while lock was held" >&2
  cat "$MOCK_LOG" >&2 || true
  exit 1
fi

if ! grep -Fq 'stdin:SELECT pg_advisory_unlock' "$MOCK_LOG"; then
  echo "assertion failed: unlock query was not sent" >&2
  cat "$MOCK_LOG" >&2 || true
  exit 1
fi

echo "migration lock tests passed"
