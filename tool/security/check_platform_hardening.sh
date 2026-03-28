#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

findings=0

fail() {
  findings=$((findings + 1))
  echo "[platform-check] FAIL: $1"
}

pass() {
  echo "[platform-check] PASS: $1"
}

MAIN_ENTRY="src/main/index.ts"
PRELOAD_ENTRY="src/preload/index.ts"
RENDERER_HTML="src/renderer/index.html"

if grep -q "preload: join(__dirname, '../preload/index.mjs')" "$MAIN_ENTRY"; then
  pass "Electron main process uses the dedicated preload bridge"
else
  fail "Electron main process must configure the preload bridge"
fi

if grep -q 'contextIsolation: true' "$MAIN_ENTRY"; then
  pass "Electron renderer keeps context isolation enabled"
else
  fail "Electron renderer must keep context isolation enabled"
fi

if grep -q 'nodeIntegration: false' "$MAIN_ENTRY"; then
  pass "Electron renderer keeps Node integration disabled"
else
  fail "Electron renderer must keep Node integration disabled"
fi

if grep -q "contextBridge.exposeInMainWorld('banjiDesktop', desktopBridge)" "$PRELOAD_ENTRY"; then
  pass "Preload exposes the audited desktop bridge"
else
  fail "Preload must expose the audited desktop bridge"
fi

if grep -qiE '<script[^>]+src="https?://' "$RENDERER_HTML"; then
  fail "Renderer HTML must not load remote scripts"
else
  pass "Renderer HTML avoids remote script origins"
fi

if [[ "$findings" -gt 0 ]]; then
  echo "[platform-check] FAILED: $findings issue(s)"
  exit 1
fi

echo "[platform-check] PASSED"
