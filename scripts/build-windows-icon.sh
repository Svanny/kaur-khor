#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MASTER_ICON="$ROOT_DIR/resources/mac/master-1024.png"
WINDOWS_DIR="$ROOT_DIR/resources/windows"
ICO_PATH="$WINDOWS_DIR/kaur-khor.ico"

if [[ ! -f "$MASTER_ICON" ]]; then
  echo "missing master icon: $MASTER_ICON" >&2
  exit 1
fi

mkdir -p "$WINDOWS_DIR"
rm -f "$ICO_PATH"

if command -v magick >/dev/null 2>&1; then
  magick "$MASTER_ICON" -define icon:auto-resize=256,128,64,48,32,16 "$ICO_PATH"
elif command -v convert >/dev/null 2>&1; then
  convert "$MASTER_ICON" -define icon:auto-resize=256,128,64,48,32,16 "$ICO_PATH"
else
  echo "missing ImageMagick magick or convert for Windows .ico generation" >&2
  exit 1
fi
