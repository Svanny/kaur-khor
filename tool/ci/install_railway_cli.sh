#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${RAILWAY_CLI_VERSION:-}" ]]; then
  echo "error: RAILWAY_CLI_VERSION is required" >&2
  exit 1
fi

RAILWAY_LOCAL_DIR="$HOME/.local"
RAILWAY_BIN_DIR="$RAILWAY_LOCAL_DIR/bin"
RAILWAY_CANONICAL_BIN="$RAILWAY_BIN_DIR/railway"
RAILWAY_NODE_MODULES_DIR="$RAILWAY_LOCAL_DIR/lib/node_modules"
RAILWAY_PACKAGE_ROOT="$RAILWAY_NODE_MODULES_DIR/@railway/cli"

mkdir -p "$RAILWAY_BIN_DIR"

railway_version() {
  local binary="$1"
  local actual=""

  if [[ -x "$binary" ]]; then
    actual="$("$binary" --version 2>/dev/null | grep -Eo '[0-9]+\.[0-9]+\.[0-9]+' | head -n 1 || true)"
  elif [[ -f "$binary" ]]; then
    actual="$(node "$binary" --version 2>/dev/null | grep -Eo '[0-9]+\.[0-9]+\.[0-9]+' | head -n 1 || true)"
  fi

  printf '%s' "$actual"
}

railway_version_matches_expected() {
  local binary="$1"
  local actual
  actual="$(railway_version "$binary")"
  [[ -n "$actual" && "$actual" == "$RAILWAY_CLI_VERSION" ]]
}

escape_for_double_quotes() {
  local raw="$1"
  raw="${raw//\\/\\\\}"
  raw="${raw//\"/\\\"}"
  printf '%s' "$raw"
}

normalize_railway_binary() {
  local source="$1"
  local escaped_source

  if [[ "$source" == "$RAILWAY_CANONICAL_BIN" ]]; then
    chmod +x "$RAILWAY_CANONICAL_BIN"
    return 0
  fi

  if [[ "$source" == "$RAILWAY_LOCAL_DIR/"* ]]; then
    escaped_source="$(escape_for_double_quotes "$source")"
    cat >"$RAILWAY_CANONICAL_BIN" <<EOF
#!/usr/bin/env bash
set -euo pipefail
source_path="$escaped_source"
if [[ -x "\$source_path" ]]; then
  exec "\$source_path" "\$@"
fi
exec node "\$source_path" "\$@"
EOF
    chmod +x "$RAILWAY_CANONICAL_BIN"
    return 0
  fi

  cp "$source" "$RAILWAY_CANONICAL_BIN"
  chmod +x "$RAILWAY_CANONICAL_BIN"
}

log_installed_version() {
  "$RAILWAY_CANONICAL_BIN" --version || true
}

if [[ -x "$RAILWAY_CANONICAL_BIN" ]]; then
  if railway_version_matches_expected "$RAILWAY_CANONICAL_BIN"; then
    echo "railway ${RAILWAY_CLI_VERSION} already installed"
    log_installed_version
    exit 0
  fi

  echo "railway version mismatch; reinstalling ${RAILWAY_CLI_VERSION}"
  log_installed_version
  rm -f "$RAILWAY_CANONICAL_BIN"
fi

if command -v railway >/dev/null 2>&1; then
  existing_railway="$(command -v railway)"
  if railway_version_matches_expected "$existing_railway"; then
    normalize_railway_binary "$existing_railway"
    echo "railway ${RAILWAY_CLI_VERSION} already installed"
    log_installed_version
    exit 0
  fi
fi

npm install --global --prefix "$RAILWAY_LOCAL_DIR" "@railway/cli@${RAILWAY_CLI_VERSION}"

checked_candidates=()
append_candidate() {
  local candidate="$1"
  local existing

  [[ -n "$candidate" ]] || return 0
  for existing in "${checked_candidates[@]:-}"; do
    if [[ "$existing" == "$candidate" ]]; then
      return 0
    fi
  done
  checked_candidates+=("$candidate")
}

append_candidate "$RAILWAY_CANONICAL_BIN"
if command -v railway >/dev/null 2>&1; then
  append_candidate "$(command -v railway)"
fi
append_candidate "$RAILWAY_NODE_MODULES_DIR/.bin/railway"
append_candidate "$RAILWAY_PACKAGE_ROOT/bin/railway"
append_candidate "$RAILWAY_PACKAGE_ROOT/bin/railway.js"
append_candidate "$RAILWAY_PACKAGE_ROOT/dist/index.js"

if [[ -d "$RAILWAY_PACKAGE_ROOT" ]]; then
  while IFS= read -r candidate; do
    append_candidate "$candidate"
  done < <(
    find "$RAILWAY_PACKAGE_ROOT" -maxdepth 3 -type f \( -name 'railway' -o -name 'railway.js' -o -name 'index.js' \) | sort
  )
fi

resolved_candidate=""
fallback_candidate=""
for candidate in "${checked_candidates[@]}"; do
  if [[ -x "$candidate" || -f "$candidate" ]]; then
    if [[ -z "$fallback_candidate" ]]; then
      fallback_candidate="$candidate"
    fi
    if railway_version_matches_expected "$candidate"; then
      resolved_candidate="$candidate"
      break
    fi
  fi
done

if [[ -z "$resolved_candidate" ]]; then
  resolved_candidate="$fallback_candidate"
fi

if [[ -z "$resolved_candidate" ]]; then
  echo "error: railway CLI installation did not produce a usable binary" >&2
  echo "checked candidate paths: ${checked_candidates[*]}" >&2
  exit 1
fi

normalize_railway_binary "$resolved_candidate"

if ! railway_version_matches_expected "$RAILWAY_CANONICAL_BIN"; then
  echo "error: installed railway CLI version does not match ${RAILWAY_CLI_VERSION}" >&2
  echo "resolved candidate: $resolved_candidate" >&2
  log_installed_version
  exit 1
fi

log_installed_version
