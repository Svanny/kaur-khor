#!/usr/bin/env sh
set -eu

NODE_VERSION="${KAUR_KHOR_NODE_VERSION:-22.23.4}"
TOOLS_DIR="${KAUR_KHOR_BUILD_TOOLS_DIR:-"${HOME}/.kaur-khor-build-tools"}"
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)"

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
  expected_sha256="$(expected_node_sha256 "${NODE_VERSION}" "${node_platform}")"
  if [ -z "${expected_sha256}" ]; then
    echo "No pinned SHA-256 digest for ${archive_name}. Refusing automatic Node bootstrap." >&2
    exit 1
  fi

  temp_dir="${TMPDIR:-/tmp}/kaur-khor-node-bootstrap-$$"
  archive_path="${temp_dir}/${archive_name}"
  mkdir -p "${temp_dir}" "${TOOLS_DIR}"

  echo "Installing local Node ${NODE_VERSION} for Kaur Khor source build..." >&2
  download_file "${archive_url}" "${archive_path}"
  verify_sha256_file "${archive_path}" "${expected_sha256}" "${archive_name}"
  tar -xJf "${archive_path}" -C "${temp_dir}"
  rm -f "${archive_path}"
  rm -rf "${TOOLS_DIR}/node-v${NODE_VERSION}"
  mv "${temp_dir}/node-v${NODE_VERSION}-${node_platform}" "${TOOLS_DIR}/node-v${NODE_VERSION}"
  rm -rf "${temp_dir}"
}

expected_node_sha256() {
  version="$1"
  node_platform="$2"

  case "${version}:${node_platform}" in
    22.23.4:darwin-arm64)
      printf '%s\n' "037650d0839f457747396f052073fb48333d31bf5abd3c98b74da20d89ebb1ad"
      ;;
    22.23.4:darwin-x64)
      printf '%s\n' "f42abca7aaac61efc57d49fb42ea84fc53bbeba9a749cb03a291ce6e4e7a69c1"
      ;;
    22.23.4:linux-arm64)
      printf '%s\n' "6287aa46b6c375d816e63ae66d024fbbfd70404825aabdfdf898a970871d2f4b"
      ;;
    22.23.4:linux-x64)
      printf '%s\n' "1805bcd35e6815559bd2eb97db438d3fdb0eb3a5e6a977b7c1badca76337e9ce"
      ;;
  esac
}

verify_sha256_file() {
  path="$1"
  expected="$2"
  label="$3"
  actual="$(calculate_sha256 "${path}")"

  if [ "${actual}" != "${expected}" ]; then
    echo "SHA-256 mismatch for ${label}. Expected ${expected}, got ${actual}. Refusing to extract it." >&2
    exit 1
  fi
}

calculate_sha256() {
  path="$1"

  if command -v shasum >/dev/null 2>&1; then
    checksum_output="$(shasum -a 256 "${path}")"
    set -- ${checksum_output}
    printf '%s\n' "$1"
    return
  fi

  if command -v sha256sum >/dev/null 2>&1; then
    checksum_output="$(sha256sum "${path}")"
    set -- ${checksum_output}
    printf '%s\n' "$1"
    return
  fi

  echo "Need shasum or sha256sum to verify Node for the source build." >&2
  exit 1
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
node_bin_dir="$(CDPATH= cd -- "$(dirname -- "${node_command}")" && pwd)"
PATH="${node_bin_dir}:${PATH}"
export PATH
exec "${node_command}" "${SCRIPT_DIR}/build-from-source.mjs" "$@"
