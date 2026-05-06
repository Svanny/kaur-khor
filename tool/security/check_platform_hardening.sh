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

reject_pattern() {
  local file="$1"
  local pattern="$2"
  local message="$3"
  local matches

  matches="$(grep -nE "$pattern" "$file" || true)"
  if [[ -n "$matches" ]]; then
    fail "$message"
    echo "$matches"
  else
    pass "$message"
  fi
}

MAIN_ENTRY="src/main/index.ts"
PRELOAD_ENTRY="src/preload/index.ts"
RENDERER_HTML="src/renderer/index.html"
BENCHMARK_RUNNER="src/main/benchmark-runner.ts"

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

reject_pattern "$MAIN_ENTRY" '\bcontextIsolation:[[:space:]]*false\b' "Electron main process does not disable context isolation anywhere"
reject_pattern "$MAIN_ENTRY" '\bnodeIntegration:[[:space:]]*true\b' "Electron main process does not enable renderer Node integration anywhere"
reject_pattern "$MAIN_ENTRY" '\bnodeIntegrationInWorker:[[:space:]]*true\b' "Electron main process does not enable Node integration in workers"
reject_pattern "$MAIN_ENTRY" '\bwebSecurity:[[:space:]]*false\b' "Electron main process does not disable Chromium web security"
reject_pattern "$MAIN_ENTRY" '\ballowRunningInsecureContent:[[:space:]]*true\b' "Electron main process does not allow insecure mixed content"
reject_pattern "$MAIN_ENTRY" '\bcommandLineSwitches[[:space:]]*:' "Electron main process does not configure renderer command-line switches through webPreferences"

if grep -q "contextBridge.exposeInMainWorld('kaurKhorDesktop', desktopBridge)" "$PRELOAD_ENTRY"; then
  pass "Preload exposes the audited desktop bridge"
else
  fail "Preload must expose the audited desktop bridge"
fi

if grep -qiE '<script[^>]+src="https?://' "$RENDERER_HTML"; then
  fail "Renderer HTML must not load remote scripts"
else
  pass "Renderer HTML avoids remote script origins"
fi

if grep -qiE '<(script|link)[^>]+(src|href)="https?://' "$BENCHMARK_RUNNER" || grep -qiE 'https://(d3js\.org|cdn\.jsdelivr\.net)/' "$BENCHMARK_RUNNER"; then
  fail "Generated flamegraph artifacts must not load remote script or style origins"
else
  pass "Generated flamegraph artifacts avoid remote script and style origins"
fi

if [[ "$findings" -gt 0 ]]; then
  echo "[platform-check] FAILED: $findings issue(s)"
  exit 1
fi

echo "[platform-check] PASSED"
