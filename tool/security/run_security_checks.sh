#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

echo "[security-gate] 1/4 flutter analyze"
flutter analyze

echo "[security-gate] 2/4 flutter test test/security"
flutter test test/security

echo "[security-gate] 3/4 secret pattern checks"
bash tool/security/check_secret_patterns.sh

echo "[security-gate] 4/4 platform hardening checks"
bash tool/security/check_platform_hardening.sh

echo "[security-gate] PASSED"
