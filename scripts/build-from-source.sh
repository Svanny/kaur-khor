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
  rm -rf "${TOOLS_DIR}/node-v${NODE_VERSION}"
  mv "${temp_dir}/node-v${NODE_VERSION}-${node_platform}" "${TOOLS_DIR}/node-v${NODE_VERSION}"
  rm -rf "${temp_dir}"
}

expected_node_sha256() {
  version="$1"
  node_platform="$2"

  case "${version}:${node_platform}" in
    22.21.1:darwin-arm64)
      printf '%s\n' "39f53ffcf1604291e85974c8588bb290c14b358ac085e342920e703651d63c5e"
      ;;
    22.21.1:darwin-x64)
      printf '%s\n' "2f4fd943768fdd82308da88bb53f3a16259275c770bc4393e45b986844ea3017"
      ;;
    22.21.1:linux-arm64)
      printf '%s\n' "e660365729b434af422bcd2e8e14228637ecf24a1de2cd7c916ad48f2a0521e1"
      ;;
    22.21.1:linux-x64)
      printf '%s\n' "a696aaf0b8e13ac1abf057dd6d82a22a3bedd03190c560d8187e3aff8527803d"
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
exec "${node_command}" "${SCRIPT_DIR}/build-from-source.mjs" "$@"
