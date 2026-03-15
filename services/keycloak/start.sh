#!/usr/bin/env bash
set -euo pipefail

KEYCLOAK_BIN="${KEYCLOAK_BIN:-/opt/keycloak/bin/kc.sh}"

if [[ -z "${JAVA_OPTS_APPEND:-}" ]]; then
  export JAVA_OPTS_APPEND="-Xms256m -Xmx512m -XX:+UseG1GC -XX:+ExitOnOutOfMemoryError"
fi

if [[ -n "${PORT:-}" ]]; then
  export KC_HTTP_PORT="$PORT"
fi

exec "$KEYCLOAK_BIN" start --optimized --import-realm
