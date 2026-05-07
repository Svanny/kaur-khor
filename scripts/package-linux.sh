#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "Linux packaging must run on Linux." >&2
  exit 1
fi

machine_arch="$(uname -m)"
case "${machine_arch}" in
  x86_64)
    target_arch="x64"
    ;;
  aarch64 | arm64)
    target_arch="arm64"
    ;;
  *)
    echo "Unsupported Linux architecture: ${machine_arch}. Release packaging currently targets x64 and arm64 only." >&2
    exit 1
    ;;
esac

export KAUR_KHOR_ARTIFACT_ARCH="${target_arch}"

node scripts/stage-desktop-core.mjs --platform=linux --arch="${target_arch}"
pnpm build
pnpm exec electron-builder install-app-deps --platform=linux --arch="${target_arch}"
pnpm exec electron-builder --linux AppImage deb --"${target_arch}" --config electron-builder.yml --publish never
