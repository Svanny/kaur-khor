#!/usr/bin/env bash
set -euo pipefail

cat <<'WARNING'
Banji source-build warning

Do not paste Terminal commands from the internet unless you trust the source and understand what they do.
This script downloads code when needed, installs dependencies, builds an unsigned local app/package, and opens the output folder.
Building locally avoids downloading a prebuilt app, but it does not magically make software safe.
WARNING

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This source-build script only runs on macOS." >&2
  exit 1
fi

require_command() {
  local name="$1"
  local hint="$2"
  if ! command -v "${name}" >/dev/null 2>&1; then
    echo "Missing ${name}. ${hint}" >&2
    exit 1
  fi
}

require_command git "Install Xcode Command Line Tools or Git for macOS."
require_command node "Install Node.js 22+ from https://nodejs.org/."
require_command corepack "Install a Node.js release that includes Corepack."
require_command cargo "Install Rust from https://rust-lang.org/tools/install/."

if ! xcode-select -p >/dev/null 2>&1; then
  echo "Xcode Command Line Tools are required. Run: xcode-select --install" >&2
  exit 1
fi

BANJI_REPO="${BANJI_REPO:-https://github.com/Svanny/banji.git}"
BANJI_REF="${BANJI_REF:-main}"
BANJI_SKIP_RUST_TESTS="${BANJI_SKIP_RUST_TESTS:-0}"
BANJI_BUILD_DIR="${BANJI_BUILD_DIR:-${TMPDIR:-/tmp}/banji-source-build}"

rm -rf "${BANJI_BUILD_DIR}"
git clone --branch "${BANJI_REF}" --single-branch "${BANJI_REPO}" "${BANJI_BUILD_DIR}"
cd "${BANJI_BUILD_DIR}"

corepack enable
corepack prepare pnpm@10.32.1 --activate

pnpm install --frozen-lockfile

if [[ "${BANJI_SKIP_RUST_TESTS}" != "1" ]]; then
  cargo test --manifest-path apps/desktop-core/Cargo.toml
else
  echo "Skipping Rust desktop-core tests because BANJI_SKIP_RUST_TESTS=1."
fi

ALLOW_UNSIGNED_PACKAGING=1 pnpm package:mac

echo "macOS build artifacts are in ${BANJI_BUILD_DIR}/release."
open "${BANJI_BUILD_DIR}/release"
