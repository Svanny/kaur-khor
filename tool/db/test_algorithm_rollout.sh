#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT_DIR/tool/db/algorithm_rollout.sh"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

cat >"$TMP_DIR/psql" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ "$*" == *"SELECT stable_version"* ]]; then
  printf 'write-demo-v2||5\n'
  exit 0
fi
exit 0
EOF
chmod +x "$TMP_DIR/psql"

export DATABASE_RUNTIME_URL="postgres://runtime@db.example/banji"

if PSQL_BIN="$TMP_DIR/psql" bash "$SCRIPT" set \
  --job-type write-demo \
  --stable write-demo-v2 \
  --candidate write-demo-v3 \
  --percent 100 \
  --updated-by tester >/dev/null 2>&1; then
  echo "assertion failed: percent jump > 25 without --force should fail" >&2
  exit 1
fi

echo "algorithm rollout tool tests passed"
