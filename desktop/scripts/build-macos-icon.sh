#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MAC_DIR="$ROOT_DIR/desktop/resources/mac"
MASTER_ICON="$MAC_DIR/master-1024.png"
ICONSET_DIR="$MAC_DIR/banji.iconset"
ICNS_PATH="$MAC_DIR/banji.icns"

if [[ ! -f "$MASTER_ICON" ]]; then
  echo "missing master icon: $MASTER_ICON" >&2
  exit 1
fi

rm -rf "$ICONSET_DIR"
mkdir -p "$ICONSET_DIR"

rm -f "$MAC_DIR/icon.png" "$MAC_DIR/icon@2x.png" "$ICNS_PATH"

resize_icon() {
  local width="$1"
  local height="$2"
  local output="$3"
  sips -z "$height" "$width" "$MASTER_ICON" --out "$output" >/dev/null
}

resize_icon 256 256 "$MAC_DIR/icon.png"
resize_icon 512 512 "$MAC_DIR/icon@2x.png"

resize_icon 16 16 "$ICONSET_DIR/icon_16x16.png"
resize_icon 32 32 "$ICONSET_DIR/icon_16x16@2x.png"
resize_icon 32 32 "$ICONSET_DIR/icon_32x32.png"
resize_icon 64 64 "$ICONSET_DIR/icon_32x32@2x.png"
resize_icon 128 128 "$ICONSET_DIR/icon_128x128.png"
resize_icon 256 256 "$ICONSET_DIR/icon_128x128@2x.png"
resize_icon 256 256 "$ICONSET_DIR/icon_256x256.png"
resize_icon 512 512 "$ICONSET_DIR/icon_256x256@2x.png"
resize_icon 512 512 "$ICONSET_DIR/icon_512x512.png"
cp "$MASTER_ICON" "$ICONSET_DIR/icon_512x512@2x.png"

iconutil --convert icns --output "$ICNS_PATH" "$ICONSET_DIR"
