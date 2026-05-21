#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

echo "[security-gate] 1/6 pnpm test"
pnpm test

echo "[security-gate] 2/6 cargo test apps/desktop-core"
cargo test --manifest-path apps/desktop-core/Cargo.toml

echo "[security-gate] 3/6 cargo test apps/sena-core"
cargo test --manifest-path apps/sena-core/Cargo.toml

echo "[security-gate] 4/6 secret pattern checks"
bash tools/security/check_secret_patterns.sh

echo "[security-gate] 5/6 platform hardening checks"
bash tools/security/check_platform_hardening.sh

echo "[security-gate] 6/6 dependency audit"
bash tools/security/check_dependency_audit.sh

echo "[security-gate] PASSED"
