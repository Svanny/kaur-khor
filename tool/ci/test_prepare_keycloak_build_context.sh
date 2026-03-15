#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
script="$repo_root/tool/ci/prepare_keycloak_build_context.sh"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

assert_file_exists() {
  local path="$1"
  if [[ ! -f "$path" ]]; then
    echo "assertion failed: expected file to exist: $path" >&2
    exit 1
  fi
}

assert_file_missing() {
  local path="$1"
  if [[ -e "$path" ]]; then
    echo "assertion failed: expected path to be absent: $path" >&2
    exit 1
  fi
}

bash "$script" staging "$tmp_dir/staging"
assert_file_exists "$tmp_dir/staging/realm-import/banji-staging-realm.json"
assert_file_missing "$tmp_dir/staging/realm-import/banji-prod-realm.json"

bash "$script" prod "$tmp_dir/prod"
assert_file_exists "$tmp_dir/prod/realm-import/banji-prod-realm.json"
assert_file_missing "$tmp_dir/prod/realm-import/banji-staging-realm.json"

if bash "$script" dev "$tmp_dir/dev" >"$tmp_dir/dev.out" 2>"$tmp_dir/dev.err"; then
  echo "assertion failed: invalid environment should fail" >&2
  exit 1
fi

grep -q "unsupported Keycloak environment" "$tmp_dir/dev.err"

echo "prepare_keycloak_build_context tests passed"
