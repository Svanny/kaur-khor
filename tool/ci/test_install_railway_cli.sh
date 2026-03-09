#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT_DIR/tool/ci/install_railway_cli.sh"
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

make_railway_stub() {
  local path="$1"
  local version="$2"
  cat >"$path" <<EOF
#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == "--version" ]]; then
  echo "railway $version"
  exit 0
fi
echo "stub railway invoked: \$*" >&2
exit 0
EOF
  chmod +x "$path"
}

make_npm_stub() {
  local path="$1"
  cat >"$path" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
echo "$*" >>"${MOCK_NPM_LOG:?}"
case "${MOCK_NPM_MODE:-none}" in
  command-v)
    cat >"${MOCK_COMMAND_BIN_DIR:?}/railway" <<SCRIPT
#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == "--version" ]]; then
  echo "railway ${MOCK_COMMAND_BIN_VERSION:?}"
  exit 0
fi
echo "mock command-v railway invoked: \$*" >&2
exit 0
SCRIPT
    chmod +x "${MOCK_COMMAND_BIN_DIR:?}/railway"
    ;;
  package-root)
    mkdir -p "${HOME}/.local/lib/node_modules/@railway/cli/bin"
    cat >"${HOME}/.local/lib/node_modules/@railway/cli/bin/railway.js" <<SCRIPT
#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == "--version" ]]; then
  echo "railway ${MOCK_PACKAGE_BIN_VERSION:?}"
  exit 0
fi
echo "mock package railway invoked: \$*" >&2
exit 0
SCRIPT
    chmod +x "${HOME}/.local/lib/node_modules/@railway/cli/bin/railway.js"
    ;;
  none)
    ;;
  *)
    echo "unsupported MOCK_NPM_MODE=${MOCK_NPM_MODE:-}" >&2
    exit 1
    ;;
esac
EOF
  chmod +x "$path"
}

run_case() {
  local name="$1"
  shift

  local case_dir="$TMP_DIR/$name"
  mkdir -p "$case_dir/home/.local/bin" "$case_dir/mock-bin" "$case_dir/command-bin"
  make_npm_stub "$case_dir/mock-bin/npm"
  : >"$case_dir/npm.log"
  export HOME="$case_dir/home"
  export PATH="$case_dir/mock-bin:$case_dir/command-bin:/usr/bin:/bin"
  export RAILWAY_CLI_VERSION="4.30.5"
  export MOCK_NPM_LOG="$case_dir/npm.log"
  export MOCK_COMMAND_BIN_DIR="$case_dir/command-bin"
  "$@" "$case_dir"
}

case_existing() {
  local case_dir="$1"
  make_railway_stub "$HOME/.local/bin/railway" "4.30.5"
  if ! bash "$SCRIPT" >"$case_dir/stdout.txt" 2>"$case_dir/stderr.txt"; then
    echo "assertion failed: existing matching railway should succeed" >&2
    cat "$case_dir/stderr.txt" >&2 || true
    exit 1
  fi
  assert_contains "$case_dir/stdout.txt" "railway 4.30.5 already installed"
  if [[ -s "$case_dir/npm.log" ]]; then
    echo "assertion failed: npm should not run when cached railway matches" >&2
    cat "$case_dir/npm.log" >&2 || true
    exit 1
  fi
}

case_command_v() {
  local case_dir="$1"
  export MOCK_NPM_MODE="command-v"
  export MOCK_COMMAND_BIN_VERSION="4.30.5"
  if ! bash "$SCRIPT" >"$case_dir/stdout.txt" 2>"$case_dir/stderr.txt"; then
    echo "assertion failed: command -v fallback should succeed" >&2
    cat "$case_dir/stderr.txt" >&2 || true
    exit 1
  fi
  assert_contains "$case_dir/npm.log" "@railway/cli@4.30.5"
  [[ -x "$HOME/.local/bin/railway" ]] || {
    echo "assertion failed: normalized railway binary missing" >&2
    exit 1
  }
  assert_contains "$case_dir/stdout.txt" "railway 4.30.5"
}

case_stale_path_prefers_matching_install() {
  local case_dir="$1"
  make_railway_stub "$case_dir/command-bin/railway" "1.2.3"
  export MOCK_NPM_MODE="package-root"
  export MOCK_PACKAGE_BIN_VERSION="4.30.5"
  if ! bash "$SCRIPT" >"$case_dir/stdout.txt" 2>"$case_dir/stderr.txt"; then
    echo "assertion failed: installer should prefer a matching newly installed railway over stale PATH binary" >&2
    cat "$case_dir/stderr.txt" >&2 || true
    exit 1
  fi
  [[ -x "$HOME/.local/bin/railway" ]] || {
    echo "assertion failed: canonical railway wrapper missing after normalization" >&2
    exit 1
  }
  assert_contains "$case_dir/stdout.txt" "railway 4.30.5"
}

case_missing_binary() {
  local case_dir="$1"
  export MOCK_NPM_MODE="none"
  if bash "$SCRIPT" >"$case_dir/stdout.txt" 2>"$case_dir/stderr.txt"; then
    echo "assertion failed: missing installed binary should fail" >&2
    exit 1
  fi
  assert_contains "$case_dir/stderr.txt" "railway CLI installation did not produce a usable binary"
  assert_contains "$case_dir/stderr.txt" "checked candidate paths:"
}

case_mismatched_version() {
  local case_dir="$1"
  export MOCK_NPM_MODE="package-root"
  export MOCK_PACKAGE_BIN_VERSION="9.9.9"
  if bash "$SCRIPT" >"$case_dir/stdout.txt" 2>"$case_dir/stderr.txt"; then
    echo "assertion failed: mismatched railway version should fail" >&2
    exit 1
  fi
  [[ -x "$HOME/.local/bin/railway" ]] || {
    echo "assertion failed: canonical railway wrapper should be written before version failure" >&2
    exit 1
  }
  assert_contains "$case_dir/stderr.txt" "installed railway CLI version does not match 4.30.5"
  assert_contains "$case_dir/stderr.txt" "resolved candidate:"
}

run_case existing case_existing
run_case command-v case_command_v
run_case stale-path-prefers-install case_stale_path_prefers_matching_install
run_case missing-binary case_missing_binary
run_case mismatched-version case_mismatched_version

echo "install railway cli tests passed"
