#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
binary_path="${BANJI_API_BINARY:-$repo_root/apps/api/target/release/banji-api}"
app_role="${APP_ROLE:-api}"

case "$app_role" in
  api|event-relay|projection-consumer|worker)
    ;;
  *)
    echo "error: APP_ROLE must be one of: api, event-relay, projection-consumer, worker" >&2
    exit 1
    ;;
esac

if [[ ! -x "$binary_path" ]]; then
  echo "error: release binary not found or not executable at $binary_path" >&2
  exit 1
fi

export BANJI_SERVICE="${BANJI_SERVICE:-$app_role}"

if [[ "$app_role" == "api" && -z "${API_BIND_ADDR:-}" ]]; then
  export API_BIND_ADDR="0.0.0.0:${PORT:-8080}"
fi

if [[ "${BANJI_START_DRY_RUN:-}" == "1" ]]; then
  printf 'APP_ROLE=%s\n' "$app_role"
  printf 'BANJI_SERVICE=%s\n' "$BANJI_SERVICE"
  if [[ -n "${API_BIND_ADDR:-}" ]]; then
    printf 'API_BIND_ADDR=%s\n' "$API_BIND_ADDR"
  fi
  printf 'EXEC=%s\n' "$binary_path"
  exit 0
fi

exec "$binary_path"
