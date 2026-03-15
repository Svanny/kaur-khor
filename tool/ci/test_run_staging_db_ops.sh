#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT_DIR/tool/ci/run_staging_db_ops.sh"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

assert_contains() {
  local file="$1"
  local needle="$2"
  if ! grep -Fq -- "$needle" "$file"; then
    echo "assertion failed: expected '$needle' in $file" >&2
    cat "$file" >&2 || true
    exit 1
  fi
}

assert_not_contains() {
  local file="$1"
  local needle="$2"
  if grep -Fq -- "$needle" "$file"; then
    echo "assertion failed: did not expect '$needle' in $file" >&2
    cat "$file" >&2 || true
    exit 1
  fi
}

artifact_archive="$TMP_DIR/restore-drill.tgz"
mkdir -p "$TMP_DIR/archive-root/restore-drill"
cat >"$TMP_DIR/archive-root/restore-drill/report_staging.json" <<'EOF'
{"status":"passed"}
EOF
cat >"$TMP_DIR/archive-root/restore-drill/validate_staging.txt" <<'EOF'
validation ok
EOF
tar -C "$TMP_DIR/archive-root/restore-drill" -czf "$artifact_archive" .
artifact_b64="$(base64 <"$artifact_archive" | tr -d '\n')"

cat >"$TMP_DIR/railway" <<EOF
#!/usr/bin/env bash
set -euo pipefail
printf 'railway:%s\n' "\$*" >>"\${MOCK_LOG:?}"

case "\${1:-}" in
  link)
    exit 0
    ;;
  ssh)
    payload_file="\${MOCK_STDIN_DIR:?}/\$(date +%s%N).env"
    cat >"\$payload_file"
    case "\$*" in
      *"migrate_with_lock.sh"*)
        echo "migrate"
        exit 0
        ;;
      *"restore_validate.sh"*)
        printf '0' >"\${MOCK_STATUS_FILE:?}"
        exit 0
        ;;
      *"tar -C /workspace/build/restore-drill-"*" -czf - ."*)
        printf '%s' "$artifact_b64"
        exit 0
        ;;
      *"cat /tmp/banji-db-ops."*".status"*)
        cat "\${MOCK_STATUS_FILE:?}"
        exit 0
        ;;
      *"sqlx_migration_history_repair.sh inspect"*)
        echo "safe_to_remap_16_to_18: true"
        exit 0
        ;;
      *)
        echo "unexpected ssh command: \$*" >&2
        exit 1
        ;;
    esac
    ;;
  *)
    echo "unexpected railway command: \$*" >&2
    exit 1
    ;;
esac
EOF
chmod +x "$TMP_DIR/railway"

export PATH="$TMP_DIR:$PATH"
export MOCK_LOG="$TMP_DIR/mock.log"
export MOCK_STDIN_DIR="$TMP_DIR/stdin"
export MOCK_STATUS_FILE="$TMP_DIR/status"
mkdir -p "$MOCK_STDIN_DIR"
export RAILWAY_API_TOKEN="token"
export RAILWAY_PROJECT_ID="project"
export RAILWAY_ENVIRONMENT="staging"
export RAILWAY_SERVICE_ID="svc-db-ops"

rm -rf "$ROOT_DIR/build/restore-drill"

ADVISORY_LOCK_KEY=99 MIGRATION_SENTINEL=/tmp/sentinel bash "$SCRIPT" migrate-with-lock >"$TMP_DIR/migrate.out" 2>"$TMP_DIR/migrate.err"
assert_contains "$MOCK_LOG" "railway:link --project project --environment staging --service svc-db-ops"
assert_contains "$MOCK_LOG" "railway:ssh --service svc-db-ops --environment staging -- /bin/bash -lc"
assert_not_contains "$MOCK_LOG" "/tmp/banji-db-ops.env"
assert_not_contains "$MOCK_LOG" "/tmp/banji-db-ops.status"

restore_stdin_before="$(find "$MOCK_STDIN_DIR" -type f | wc -l | tr -d ' ')"
ENV_NAME=staging BACKUP_SOURCE_TIMESTAMP=2026-03-15T00:00:00Z REQUIRED_PG_EXTENSIONS=pgcrypto bash "$SCRIPT" restore-validate >"$TMP_DIR/restore.out" 2>"$TMP_DIR/restore.err"
assert_contains "$TMP_DIR/restore.out" "staging db ops restore-validate passed"
assert_contains "$ROOT_DIR/build/restore-drill/report_staging.json" '"status":"passed"'
assert_contains "$ROOT_DIR/build/restore-drill/validate_staging.txt" 'validation ok'
assert_contains "$MOCK_LOG" "/workspace/build/restore-drill-"

restore_stdin_after="$(find "$MOCK_STDIN_DIR" -type f | wc -l | tr -d ' ')"
if [[ "$restore_stdin_after" -le "$restore_stdin_before" ]]; then
  echo "assertion failed: restore-validate should create an env payload file" >&2
  exit 1
fi

DB_OPS_DATABASE_URL="postgres://migrator@db.example/banji" bash "$SCRIPT" sqlx-migration-repair-inspect >"$TMP_DIR/inspect.out" 2>"$TMP_DIR/inspect.err"
assert_contains "$TMP_DIR/inspect.out" "safe_to_remap_16_to_18: true"

echo "run_staging_db_ops tests passed"
