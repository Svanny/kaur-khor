#!/usr/bin/env zsh

set -euo pipefail

SCRIPT_DIR=${0:A:h}

exec bash "${SCRIPT_DIR}/refresh-tree.sh"
