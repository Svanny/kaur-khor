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
release_dir="$(pwd)/release"
skip_installer_handoff=false
if [[ "${KAUR_KHOR_SKIP_INSTALLER_HANDOFF:-0}" == "1" || "${GITHUB_ACTIONS:-}" == "true" || "${CI:-}" == "true" ]]; then
  skip_installer_handoff=true
fi

can_install_deb=true
if [[ "${skip_installer_handoff}" == "true" ]]; then
  can_install_deb=false
elif [[ "${KAUR_KHOR_LINUX_INSTALL_PRECHECK:-}" == "ready" ]]; then
  :
elif [[ "${KAUR_KHOR_LINUX_INSTALL_PRECHECK:-}" == "unavailable" ]]; then
  can_install_deb=false
  echo "sudo or apt-get was not found; the script will open release/ after packaging." >&2
elif [[ "${KAUR_KHOR_LINUX_INSTALL_PRECHECK:-}" == "failed" ]]; then
  can_install_deb=false
  echo "Could not verify sudo access; the script will open release/ after packaging." >&2
elif ! command -v sudo >/dev/null 2>&1 || ! command -v apt-get >/dev/null 2>&1; then
  can_install_deb=false
  echo "sudo or apt-get was not found; the script will open release/ after packaging." >&2
else
  echo "Requesting sudo now so the generated .deb can be installed after packaging..."
  if ! sudo -v; then
    can_install_deb=false
    echo "Could not verify sudo access; the script will open release/ after packaging." >&2
  fi
fi

node tools/scripts/stage-desktop-core.mjs --platform=linux --arch="${target_arch}"
pnpm build
pnpm exec electron-builder install-app-deps --platform=linux --arch="${target_arch}"
pnpm exec electron-builder --linux AppImage deb --"${target_arch}" --config config/package/electron-builder.yml --publish never

open_release_folder() {
  echo "Build artifacts are in ${release_dir}."
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "${release_dir}" >/dev/null 2>&1 &
  fi
}

find_deb_installer() {
  find "${release_dir}" -maxdepth 1 -type f -name "kaur-khor-v*-linux-${target_arch}.deb" -print \
    | sort \
    | tail -n 1
}

deb_installer="$(find_deb_installer)"
if [[ -z "${deb_installer}" ]]; then
  echo "Could not find Linux .deb installer in ${release_dir}; opening release folder instead." >&2
  open_release_folder
  exit 1
fi

if [[ "${skip_installer_handoff}" == "true" ]]; then
  echo "Linux installer is ready at ${deb_installer}."
  echo "Skipping installer launch because this build is running in CI or non-interactive mode."
  exit 0
fi

if [[ "${can_install_deb}" != "true" ]]; then
  echo "Could not install ${deb_installer} automatically; opening release folder instead." >&2
  open_release_folder
  exit 1
fi

echo "Installing ${deb_installer}..."
install_deb="$(mktemp --tmpdir "kaur-khor-${target_arch}.XXXXXX.deb")"
cp "${deb_installer}" "${install_deb}"
chmod 0644 "${install_deb}"
trap 'rm -f "${install_deb}"' EXIT

if ! sudo -v || ! sudo env DEBIAN_FRONTEND=noninteractive APT_LISTCHANGES_FRONTEND=none apt-get install --reinstall -y "${install_deb}"; then
  echo "Linux install failed; opening release folder instead." >&2
  open_release_folder
  exit 1
fi

echo "Linux install finished. You can now close this terminal window."
