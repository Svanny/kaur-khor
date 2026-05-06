#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

require_network_audit="${KAUR_KHOR_REQUIRE_NETWORK_AUDIT:-0}"

set +e
audit_output="$(pnpm audit --audit-level=moderate 2>&1)"
audit_status=$?
set -e

if [[ "$audit_status" -eq 0 ]]; then
  echo "[dependency-audit] PASSED"
  exit 0
fi

if echo "$audit_output" | grep -qiE 'ENOTFOUND|EAI_AGAIN|ECONNRESET|ETIMEDOUT|network|registry\.npmjs\.org'; then
  echo "[dependency-audit] WARN: pnpm audit could not reach the npm advisory service."
  echo "$audit_output"
  if [[ "$require_network_audit" == "1" ]]; then
    echo "[dependency-audit] FAILED: KAUR_KHOR_REQUIRE_NETWORK_AUDIT=1 requires a completed audit."
    exit 1
  fi
  echo "[dependency-audit] SKIPPED: rerun with network access before release."
  exit 0
fi

echo "$audit_output"
echo "[dependency-audit] FAILED"
exit "$audit_status"
