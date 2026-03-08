#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${PORT:-}" ]]; then
  export KC_HTTP_PORT="$PORT"
fi

exec /opt/keycloak/bin/kc.sh start --optimized --import-realm
