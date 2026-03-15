#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <output-dir>" >&2
  exit 1
fi

output_dir="$1"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

required_paths=(
  ".metadata"
  "analysis_options.yaml"
  "pubspec.yaml"
  "pubspec.lock"
  "icons"
  "lib"
  "web"
  "services/frontend/Dockerfile"
)

for path in "${required_paths[@]}"; do
  if [[ ! -e "$repo_root/$path" ]]; then
    echo "error: required frontend path missing: $repo_root/$path" >&2
    exit 1
  fi
done

rm -rf "$output_dir"
mkdir -p "$output_dir"

cp "$repo_root/.metadata" "$output_dir/.metadata"
cp "$repo_root/analysis_options.yaml" "$output_dir/analysis_options.yaml"
cp "$repo_root/pubspec.yaml" "$output_dir/pubspec.yaml"
cp "$repo_root/pubspec.lock" "$output_dir/pubspec.lock"
cp -R "$repo_root/icons" "$output_dir/icons"
cp -R "$repo_root/lib" "$output_dir/lib"
cp -R "$repo_root/web" "$output_dir/web"
cp "$repo_root/services/frontend/Dockerfile" "$output_dir/Dockerfile"

echo "Prepared frontend build context at $output_dir"
