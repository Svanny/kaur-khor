#!/usr/bin/env sh
set -eu

NODE_VERSION="${KAUR_KHOR_NODE_VERSION:-22.21.1}"
TOOLS_DIR="${KAUR_KHOR_BUILD_TOOLS_DIR:-"${HOME}/.kaur-khor-build-tools"}"
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

find_node() {
  if command -v node >/dev/null 2>&1; then
    command -v node
    return
  fi

  local_node="${TOOLS_DIR}/node-v${NODE_VERSION}/bin/node"
  if [ -x "${local_node}" ]; then
    printf '%s\n' "${local_node}"
    return
  fi

  install_node
  if [ -x "${local_node}" ]; then
    printf '%s\n' "${local_node}"
    return
  fi

  echo "Node bootstrap failed. Expected ${local_node}." >&2
  exit 1
}

install_node() {
  platform="$(uname -s)"
  machine="$(uname -m)"

  case "${platform}:${machine}" in
    Darwin:arm64)
      node_platform="darwin-arm64"
      ;;
    Darwin:x86_64)
      node_platform="darwin-x64"
      ;;
    Linux:aarch64 | Linux:arm64)
      node_platform="linux-arm64"
      ;;
    Linux:x86_64)
      node_platform="linux-x64"
      ;;
    *)
      echo "Unsupported platform for automatic Node bootstrap: ${platform}/${machine}." >&2
      exit 1
      ;;
  esac

  archive_name="node-v${NODE_VERSION}-${node_platform}.tar.xz"
  archive_url="https://nodejs.org/dist/v${NODE_VERSION}/${archive_name}"
  temp_dir="${TMPDIR:-/tmp}/kaur-khor-node-bootstrap-$$"
  archive_path="${temp_dir}/${archive_name}"
  mkdir -p "${temp_dir}" "${TOOLS_DIR}"

  echo "Installing local Node ${NODE_VERSION} for Kaur Khor source build..." >&2
  download_file "${archive_url}" "${archive_path}"
  tar -xJf "${archive_path}" -C "${temp_dir}"
  rm -rf "${TOOLS_DIR}/node-v${NODE_VERSION}"
  mv "${temp_dir}/node-v${NODE_VERSION}-${node_platform}" "${TOOLS_DIR}/node-v${NODE_VERSION}"
  rm -rf "${temp_dir}"
}

download_file() {
  url="$1"
  destination="$2"

  if command -v curl >/dev/null 2>&1; then
    curl -fL "${url}" -o "${destination}"
    return
  fi

  if command -v wget >/dev/null 2>&1; then
    wget -O "${destination}" "${url}"
    return
  fi

  echo "Need curl or wget to download Node for the source build." >&2
  exit 1
}

node_command="$(find_node)"
exec "${node_command}" "${SCRIPT_DIR}/build-from-source.mjs" "$@"
