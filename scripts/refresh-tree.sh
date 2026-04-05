#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if ! command -v tree >/dev/null 2>&1; then
  echo "error: 'tree' is required but not installed" >&2
  exit 1
fi

cd "${REPO_ROOT}"

tree -a --gitignore > tree.txt
tree -a -d --gitignore > tree_dir.txt
