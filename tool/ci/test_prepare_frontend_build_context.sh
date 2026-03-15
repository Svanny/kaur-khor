#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
script="$repo_root/tool/ci/prepare_frontend_build_context.sh"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

assert_exists() {
  local path="$1"
  if [[ ! -e "$path" ]]; then
    echo "assertion failed: expected path to exist: $path" >&2
    exit 1
  fi
}

assert_missing() {
  local path="$1"
  if [[ -e "$path" ]]; then
    echo "assertion failed: expected path to be absent: $path" >&2
    exit 1
  fi
}

bash "$script" "$tmp_dir/context"

assert_exists "$tmp_dir/context/Dockerfile"
assert_exists "$tmp_dir/context/pubspec.yaml"
assert_exists "$tmp_dir/context/pubspec.lock"
assert_exists "$tmp_dir/context/.metadata"
assert_exists "$tmp_dir/context/analysis_options.yaml"
assert_exists "$tmp_dir/context/icons"
assert_exists "$tmp_dir/context/lib"
assert_exists "$tmp_dir/context/web"
assert_missing "$tmp_dir/context/services"
assert_missing "$tmp_dir/context/apps"

if ! grep -Fq 'FROM ghcr.io/cirruslabs/flutter:3.41.0 AS builder' "$tmp_dir/context/Dockerfile"; then
  echo "assertion failed: frontend Dockerfile should pin the Flutter builder image" >&2
  cat "$tmp_dir/context/Dockerfile" >&2 || true
  exit 1
fi

echo "prepare_frontend_build_context tests passed"
