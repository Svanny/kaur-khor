#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "usage: $0 <staging|prod> <output-dir>" >&2
  exit 1
fi

target_env="$1"
output_dir="$2"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source_dir="$repo_root/services/keycloak"

case "$target_env" in
  staging)
    realm_file="banji-staging-realm.json"
    ;;
  prod)
    realm_file="banji-prod-realm.json"
    ;;
  *)
    echo "error: unsupported Keycloak environment: $target_env" >&2
    exit 1
    ;;
esac

if [[ ! -d "$source_dir" ]]; then
  echo "error: Keycloak source directory not found: $source_dir" >&2
  exit 1
fi

if [[ ! -f "$source_dir/realm-import/$realm_file" ]]; then
  echo "error: realm import not found for $target_env: $source_dir/realm-import/$realm_file" >&2
  exit 1
fi

rm -rf "$output_dir"
mkdir -p "$output_dir"
cp -R "$source_dir/." "$output_dir/"

find "$output_dir/realm-import" -maxdepth 1 -type f ! -name "$realm_file" -delete

remaining_files="$(find "$output_dir/realm-import" -maxdepth 1 -type f -name '*.json' -print | wc -l | tr -d ' ')"
if [[ "$remaining_files" != "1" ]]; then
  echo "error: expected exactly one realm import in prepared context, found $remaining_files" >&2
  exit 1
fi

echo "Prepared Keycloak build context for $target_env at $output_dir"
