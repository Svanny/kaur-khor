#!/usr/bin/env bash
set -euo pipefail

if [[ "${ALLOW_UNSIGNED_PACKAGING:-0}" != "1" ]] && [[ -z "${CSC_LINK:-}" || -z "${CSC_KEY_PASSWORD:-}" ]]; then
  echo "Refusing unsigned macOS packaging. Set CSC_LINK and CSC_KEY_PASSWORD for a signed build, or ALLOW_UNSIGNED_PACKAGING=1 for a local-only unsigned build." >&2
  exit 1
fi

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "macOS packaging must run on macOS." >&2
  exit 1
fi

machine_arch="$(uname -m)"
case "${machine_arch}" in
  arm64)
    target_arch="arm64"
    ;;
  x86_64)
    target_arch="x64"
    ;;
  *)
    echo "Unsupported macOS architecture: ${machine_arch}" >&2
    exit 1
    ;;
esac

export KAUR_KHOR_ARTIFACT_ARCH="${target_arch}"

install_app_from_release() {
  if [[ "${GITHUB_ACTIONS:-}" == "true" || "${KAUR_KHOR_SKIP_APPLICATIONS_INSTALL:-0}" == "1" ]]; then
    return
  fi

  local app_name="KAUR KHOR.app"
  local release_dir="release"
  local app_path=""
  local app_dir
  local candidate_dir

  if [[ ! -d "${release_dir}" ]]; then
    echo "Expected ${release_dir}/ to exist after packaging." >&2
    exit 1
  fi

  pushd "${release_dir}" >/dev/null
  for candidate_dir in "mac-${target_arch}" "mac"; do
    if [[ -d "${candidate_dir}/${app_name}" ]]; then
      app_path="${candidate_dir}/${app_name}"
      break
    fi
  done
  if [[ -z "${app_path}" ]]; then
    popd >/dev/null
    echo "Could not find ${app_name} under ${release_dir}/ after packaging." >&2
    exit 1
  fi
  app_dir="$(dirname "${app_path}")"

  echo "Installing ${release_dir}/${app_dir#./}/${app_name} to /Applications/${app_name}..."
  if [[ "${KAUR_KHOR_NO_UNINSTALL:-0}" != "1" ]]; then
    rm -rf "/Applications/${app_name}"
  fi
  ditto "${app_path}" "/Applications/${app_name}"
  popd >/dev/null
}

node scripts/stage-desktop-core.mjs --platform=darwin --arch="${target_arch}"
pnpm build
pnpm exec electron-builder install-app-deps --platform=darwin --arch="${target_arch}"
pnpm exec electron-builder --mac dmg --config electron-builder.yml --publish never --"${target_arch}"
install_app_from_release
