#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
script="$repo_root/services/keycloak/start.sh"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

fake_kc="$tmp_dir/kc.sh"
cat >"$fake_kc" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf 'args=%s\n' "$*"
printf 'JAVA_OPTS_APPEND=%s\n' "${JAVA_OPTS_APPEND:-}"
printf 'KC_HTTP_PORT=%s\n' "${KC_HTTP_PORT:-}"
EOF
chmod +x "$fake_kc"

output="$(
  PORT=9090 \
  KEYCLOAK_BIN="$fake_kc" \
  bash "$script"
)"

grep -q '^args=start --optimized --import-realm$' <<<"$output"
grep -q '^JAVA_OPTS_APPEND=-Xms256m -Xmx512m -XX:+UseG1GC -XX:+ExitOnOutOfMemoryError$' <<<"$output"
grep -q '^KC_HTTP_PORT=9090$' <<<"$output"

output="$(
  PORT=7070 \
  JAVA_OPTS_APPEND='-Xmx768m' \
  KEYCLOAK_BIN="$fake_kc" \
  bash "$script"
)"

grep -q '^args=start --optimized --import-realm$' <<<"$output"
grep -q '^JAVA_OPTS_APPEND=-Xmx768m$' <<<"$output"
grep -q '^KC_HTTP_PORT=7070$' <<<"$output"

echo "keycloak start contract tests passed"
