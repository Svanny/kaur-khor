#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
start_script="$repo_root/apps/api/start.sh"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

stub_binary="$tmp_dir/banji-api"
invalid_out="$tmp_dir/invalid.out"
invalid_err="$tmp_dir/invalid.err"
missing_out="$tmp_dir/missing.out"
missing_err="$tmp_dir/missing.err"
cat >"$stub_binary" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
chmod +x "$stub_binary"

run_start() {
  env \
    -i \
    PATH="$PATH" \
    HOME="${HOME:-$tmp_dir}" \
    BANJI_START_DRY_RUN=1 \
    BANJI_API_BINARY="$stub_binary" \
    "$@" \
    "$start_script"
}

assert_contains() {
  local haystack="$1"
  local needle="$2"
  if [[ "$haystack" != *"$needle"* ]]; then
    echo "expected output to contain: $needle" >&2
    echo "$haystack" >&2
    exit 1
  fi
}

api_with_port="$(run_start APP_ROLE=api PORT=9090)"
assert_contains "$api_with_port" "APP_ROLE=api"
assert_contains "$api_with_port" "BANJI_SERVICE=api"
assert_contains "$api_with_port" "API_BIND_ADDR=0.0.0.0:9090"
assert_contains "$api_with_port" "EXEC=$stub_binary"

api_with_explicit_bind="$(run_start APP_ROLE=api PORT=9090 API_BIND_ADDR=127.0.0.1:5000)"
assert_contains "$api_with_explicit_bind" "API_BIND_ADDR=127.0.0.1:5000"

api_default_bind="$(run_start APP_ROLE=api)"
assert_contains "$api_default_bind" "API_BIND_ADDR=0.0.0.0:8080"

worker_output="$(run_start APP_ROLE=worker)"
assert_contains "$worker_output" "APP_ROLE=worker"
assert_contains "$worker_output" "BANJI_SERVICE=worker"
if [[ "$worker_output" == *"API_BIND_ADDR="* ]]; then
  echo "worker output should not contain API_BIND_ADDR" >&2
  echo "$worker_output" >&2
  exit 1
fi

custom_service="$(run_start APP_ROLE=event-relay BANJI_SERVICE=relay-runtime)"
assert_contains "$custom_service" "BANJI_SERVICE=relay-runtime"

if run_start APP_ROLE=invalid-role >"$invalid_out" 2>"$invalid_err"; then
  echo "expected invalid APP_ROLE to fail" >&2
  exit 1
fi
assert_contains "$(cat "$invalid_err")" "APP_ROLE must be one of"

if BANJI_START_DRY_RUN=1 BANJI_API_BINARY="$tmp_dir/missing" "$start_script" >"$missing_out" 2>"$missing_err"; then
  echo "expected missing binary to fail" >&2
  exit 1
fi
assert_contains "$(cat "$missing_err")" "release binary not found or not executable"

echo "start.sh smoke tests passed"
