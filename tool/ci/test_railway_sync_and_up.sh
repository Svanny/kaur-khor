#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT_DIR/tool/ci/railway_sync_and_up.sh"
TMP_DIR="$(mktemp -d)"
STATE_DIR="$TMP_DIR/state"
LOG_FILE="$TMP_DIR/commands.log"
DEBUG_LOG="$TMP_DIR/debug.log"
mkdir -p "$STATE_DIR"
trap 'rm -rf "$TMP_DIR"' EXIT

cat >"$TMP_DIR/railway" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

log_file="${MOCK_RAILWAY_LOG:?}"
state_dir="${MOCK_RAILWAY_STATE_DIR:?}"

sanitize() {
  printf '%s' "$1" | tr -c '[:alnum:]' '_'
}

service_arg() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --service)
        printf '%s' "$2"
        return 0
        ;;
      *)
        shift
        ;;
    esac
  done

  return 1
}

record() {
  printf '%s\n' "$*" >>"$log_file"
}

record_auth() {
  if [[ -n "${RAILWAY_API_TOKEN:-}" ]]; then
    record "auth api"
  else
    record "auth missing"
    exit 1
  fi
}

validate_link_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      -p|--project|-e|--environment|-s|--service|-w|--workspace|-t|--team)
        [[ $# -ge 2 ]] || {
          printf "error: option '%s' requires a value\n" "$1" >&2
          exit 1
        }
        shift 2
        ;;
      --json|-h|--help|-V|--version)
        shift
        ;;
      *)
        printf "error: unexpected argument '%s' found\n" "$1" >&2
        exit 1
        ;;
    esac
  done
}

validate_variable_set_args() {
  local saw_key=0

  while [[ $# -gt 0 ]]; do
    case "$1" in
      -s|--service|-e|--environment)
        [[ $# -ge 2 ]] || {
          printf "error: option '%s' requires a value\n" "$1" >&2
          exit 1
        }
        shift 2
        ;;
      --stdin|--skip-deploys|--json|-h|--help|-V|--version)
        shift
        ;;
      -*)
        printf "error: unexpected argument '%s' found\n" "$1" >&2
        exit 1
        ;;
      *)
        if (( saw_key )); then
          printf "error: unexpected extra variable '%s' found\n" "$1" >&2
          exit 1
        fi
        saw_key=1
        shift
        ;;
    esac
  done

  if (( ! saw_key )); then
    printf "error: variable set requires a key\n" >&2
    exit 1
  fi
}

validate_variable_delete_args() {
  local saw_key=0

  while [[ $# -gt 0 ]]; do
    case "$1" in
      -s|--service|-e|--environment)
        [[ $# -ge 2 ]] || {
          printf "error: option '%s' requires a value\n" "$1" >&2
          exit 1
        }
        shift 2
        ;;
      --json|-h|--help|-V|--version)
        shift
        ;;
      -*)
        printf "error: unexpected argument '%s' found\n" "$1" >&2
        exit 1
        ;;
      *)
        if (( saw_key )); then
          printf "error: unexpected extra key '%s' found\n" "$1" >&2
          exit 1
        fi
        saw_key=1
        shift
        ;;
    esac
  done

  if (( ! saw_key )); then
    printf "error: variable delete requires a key\n" >&2
    exit 1
  fi
}

validate_variable_list_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      -s|--service|-e|--environment)
        [[ $# -ge 2 ]] || {
          printf "error: option '%s' requires a value\n" "$1" >&2
          exit 1
        }
        shift 2
        ;;
      -k|--kv|--json|-h|--help|-V|--version)
        shift
        ;;
      *)
        printf "error: unexpected argument '%s' found\n" "$1" >&2
        exit 1
        ;;
    esac
  done
}

validate_logs_args() {
  local saw_positional=0

  while [[ $# -gt 0 ]]; do
    case "$1" in
      -s|--service|-e|--environment|-n|--lines|-f|--filter|-S|--since|-U|--until)
        [[ $# -ge 2 ]] || {
          printf "error: option '%s' requires a value\n" "$1" >&2
          exit 1
        }
        shift 2
        ;;
      -d|--deployment|-b|--build|--json|--latest|-h|--help|-V|--version)
        shift
        ;;
      -*)
        printf "error: unexpected argument '%s' found\n" "$1" >&2
        exit 1
        ;;
      *)
        if (( saw_positional )); then
          printf "error: unexpected extra argument '%s' found\n" "$1" >&2
          exit 1
        fi
        saw_positional=1
        shift
        ;;
    esac
  done
}

validate_deployment_list_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      -s|--service|-e|--environment|--limit)
        [[ $# -ge 2 ]] || {
          printf "error: option '%s' requires a value\n" "$1" >&2
          exit 1
        }
        shift 2
        ;;
      --json|-h|--help|-V|--version)
        shift
        ;;
      *)
        printf "error: unexpected argument '%s' found\n" "$1" >&2
        exit 1
        ;;
    esac
  done
}

validate_up_args() {
  local saw_path=0

  while [[ $# -gt 0 ]]; do
    case "$1" in
      -s|--service|-e|--environment|-p|--project|-m|--message)
        [[ $# -ge 2 ]] || {
          printf "error: option '%s' requires a value\n" "$1" >&2
          exit 1
        }
        shift 2
        ;;
      -d|--detach|-c|--ci|--no-gitignore|--path-as-root|--verbose|--json|-h|--help|-V|--version)
        shift
        ;;
      -*)
        printf "error: unexpected argument '%s' found\n" "$1" >&2
        exit 1
        ;;
      *)
        if (( saw_path )); then
          printf "error: unexpected extra path '%s' found\n" "$1" >&2
          exit 1
        fi
        saw_path=1
        shift
        ;;
    esac
  done
}

cmd="${1:-}"
if [[ -z "$cmd" ]]; then
  exit 1
fi
shift
record "$cmd $*"
record_auth

emit_deployment_status() {
  local service_id="$1"
  local sequence_key status_key payload_path sequence_path raw_sequence stored_sequence entry_count current_index entry deployment_id deployment_status

  sequence_key="FAKE_DEPLOYMENT_SEQUENCE_$(sanitize "$service_id")"
  if [[ -n "${!sequence_key:-}" ]]; then
    payload_path="$state_dir/deployment-count-$(sanitize "$service_id")"
    sequence_path="$state_dir/deployment-sequence-$(sanitize "$service_id")"
    raw_sequence="${!sequence_key}"
    stored_sequence=""
    if [[ -f "$sequence_path" ]]; then
      stored_sequence="$(cat "$sequence_path")"
    fi
    if [[ "$stored_sequence" != "$raw_sequence" ]]; then
      rm -f "$payload_path"
      printf '%s' "$raw_sequence" >"$sequence_path"
    fi
    IFS=';' read -r -a entries <<<"$raw_sequence"
    entry_count="${#entries[@]}"
    current_index=0
    if [[ -f "$payload_path" ]]; then
      current_index="$(cat "$payload_path")"
    fi
    if (( current_index >= entry_count )); then
      current_index=$((entry_count - 1))
    fi
    entry="${entries[$current_index]}"
    printf '%s' "$((current_index + 1))" >"$payload_path"

    deployment_id=""
    deployment_status="$entry"
    if [[ "$entry" == *:* ]]; then
      deployment_id="${entry%%:*}"
      deployment_status="${entry#*:}"
    fi
    printf '[{"id":"%s","status":"%s"}]\n' "$deployment_id" "$deployment_status"
    return 0
  fi

  status_key="FAKE_DEPLOYMENT_STATUS_$(sanitize "$service_id")"
  if [[ -n "${!status_key+x}" ]]; then
    printf '[{"status":"%s"}]\n' "${!status_key}"
  else
    printf '[{"status":"SUCCESS"}]\n'
  fi
}

case "$cmd" in
  link)
    validate_link_args "$@"
    if [[ -n "${FAKE_LINK_STDERR:-}" ]]; then
      printf '%s\n' "$FAKE_LINK_STDERR" >&2
      exit 1
    fi
    exit 0
    ;;
  variable)
    subcmd="${1:-}"
    shift
    case "$subcmd" in
      set)
        validate_variable_set_args "$@"
        key="${1:-}"
        shift
        value="$(cat)"
        service_id="$(service_arg "$@")"
        record "stdin $service_id $key=$value"
        python3 - "$state_dir" "$service_id" "$key" "$value" <<'PY'
import json
import pathlib
import sys

state_dir = pathlib.Path(sys.argv[1])
service_id = sys.argv[2]
key = sys.argv[3]
value = sys.argv[4]
path = state_dir / f"{service_id}.json"
if path.exists():
    payload = json.loads(path.read_text())
else:
    payload = {}
payload[key] = value
path.write_text(json.dumps(payload))
PY
        exit 0
        ;;
      delete)
        validate_variable_delete_args "$@"
        key="${1:-}"
        shift
        service_id="$(service_arg "$@")"
        record "delete $service_id $key"
        python3 - "$state_dir" "$service_id" "$key" <<'PY'
import json
import pathlib
import sys

state_dir = pathlib.Path(sys.argv[1])
service_id = sys.argv[2]
key = sys.argv[3]
path = state_dir / f"{service_id}.json"
deleted_path = state_dir / f"{service_id}.deleted.json"
if path.exists():
    payload = json.loads(path.read_text())
    payload.pop(key, None)
    path.write_text(json.dumps(payload))
if deleted_path.exists():
    deleted = json.loads(deleted_path.read_text())
else:
    deleted = []
if key not in deleted:
    deleted.append(key)
deleted_path.write_text(json.dumps(deleted))
PY
        exit 0
        ;;
      list)
        validate_variable_list_args "$@"
        service_id="$(service_arg "$@")"
        payload_key="FAKE_VARIABLE_JSON_$(sanitize "$service_id")"
        python3 - "$state_dir" "$service_id" "${!payload_key:-}" <<'PY'
import json
import pathlib
import sys

state_dir = pathlib.Path(sys.argv[1])
service_id = sys.argv[2]
path = state_dir / f"{service_id}.json"
deleted_path = state_dir / f"{service_id}.deleted.json"
extra_raw = sys.argv[3]
payload = {}
if path.exists():
    payload = json.loads(path.read_text())
if extra_raw:
    payload.update(json.loads(extra_raw))
if deleted_path.exists():
    for key in json.loads(deleted_path.read_text()):
        payload.pop(key, None)
sys.stdout.write(json.dumps(payload))
PY
        exit 0
        ;;
      *)
        exit 1
        ;;
    esac
    ;;
  up)
    validate_up_args "$@"
    if [[ -n "${FAKE_UP_STDERR:-}" ]]; then
      printf '%s\n' "$FAKE_UP_STDERR" >&2
      exit 1
    fi
    if [[ -n "${FAKE_UP_OUTPUT:-}" ]]; then
      printf '%s\n' "$FAKE_UP_OUTPUT"
    fi
    exit 0
    ;;
  logs)
    validate_logs_args "$@"
    kind="unknown"
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --build)
          kind="build"
          ;;
        --deployment)
          kind="deployment"
          ;;
      esac
      shift
    done
    stderr_key="FAKE_LOGS_$(printf '%s' "$kind" | tr '[:lower:]' '[:upper:]')_STDERR"
    stdout_key="FAKE_LOGS_$(printf '%s' "$kind" | tr '[:lower:]' '[:upper:]')_OUTPUT"
    if [[ -n "${!stderr_key:-}" ]]; then
      printf '%s\n' "${!stderr_key}" >&2
      exit 1
    fi
    if [[ -n "${!stdout_key:-}" ]]; then
      printf '%s\n' "${!stdout_key}"
    fi
    exit 0
    ;;
  deployment)
    subcmd="${1:-}"
    shift
    if [[ "$subcmd" != "list" ]]; then
      exit 1
    fi
    validate_deployment_list_args "$@"
    service_id="$(service_arg "$@")"
    emit_deployment_status "$service_id"
    exit 0
    ;;
  *)
    exit 1
    ;;
esac
EOF
chmod +x "$TMP_DIR/railway"

cat >"$TMP_DIR/curl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

log_file="${MOCK_RAILWAY_LOG:?}"
state_dir="${MOCK_RAILWAY_STATE_DIR:?}"
url=""
payload=""
authorization=""

record() {
  printf '%s\n' "$*" >>"$log_file"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -s|-S|-f|-fsS|-fSs|-sfS|-sSf)
      shift
      ;;
    -X)
      shift 2
      ;;
    -H)
      if [[ $# -lt 2 ]]; then
        echo "curl mock: -H requires a value" >&2
        exit 1
      fi
      if [[ "$2" == Authorization:* ]]; then
        authorization="${2#Authorization: }"
      fi
      shift 2
      ;;
    --data|--data-binary)
      if [[ $# -lt 2 ]]; then
        echo "curl mock: $1 requires a value" >&2
        exit 1
      fi
      payload="$2"
      shift 2
      ;;
    http*)
      url="$1"
      shift
      ;;
    *)
      echo "curl mock: unexpected argument '$1'" >&2
      exit 1
      ;;
  esac
done

if [[ "$authorization" != "Bearer ${RAILWAY_API_TOKEN:-}" ]]; then
  echo "curl mock: missing or invalid Authorization header" >&2
  exit 1
fi

if [[ -z "$payload" ]]; then
  echo "curl mock: missing payload" >&2
  exit 1
fi

query="$(printf '%s' "$payload" | jq -r '.query // ""')"
variables_json="$(printf '%s' "$payload" | jq -c '.variables // {}')"

if [[ -n "${FAKE_GRAPHQL_INVALID_JSON:-}" ]]; then
  printf 'not-json\n'
  exit 0
fi

if [[ "$query" == *"query Environments"* ]]; then
  record "graphql environments"
  if [[ -n "${FAKE_GRAPHQL_ENVIRONMENTS_STDERR:-}" ]]; then
    printf '%s\n' "$FAKE_GRAPHQL_ENVIRONMENTS_STDERR" >&2
    exit 22
  fi
  if [[ -n "${FAKE_GRAPHQL_ENVIRONMENTS_ERRORS:-}" ]]; then
    printf '{"errors":[{"message":"%s"}]}\n' "$FAKE_GRAPHQL_ENVIRONMENTS_ERRORS"
    exit 0
  fi
  if [[ -n "${FAKE_ENVIRONMENTS_JSON:-}" ]]; then
    environments_json="$FAKE_ENVIRONMENTS_JSON"
  else
    environments_json='[{"id":"env-staging","name":"staging"},{"id":"env-prod","name":"prod"}]'
  fi
  jq -cn --arg environments "$environments_json" '{data:{environments:{edges:(($environments | fromjson) | map({node:.}))}}}'
  exit 0
fi

if [[ "$query" == *"query Variables"* ]]; then
  service_id="$(printf '%s' "$variables_json" | jq -r '.serviceId // ""')"
  if [[ -z "$service_id" ]]; then
    echo "curl mock: variables query missing serviceId" >&2
    exit 1
  fi
  record "graphql variables $service_id"
  if [[ -n "${FAKE_GRAPHQL_VARIABLES_STDERR:-}" ]]; then
    printf '%s\n' "$FAKE_GRAPHQL_VARIABLES_STDERR" >&2
    exit 22
  fi
  if [[ -n "${FAKE_GRAPHQL_VARIABLES_ERRORS:-}" ]]; then
    printf '{"errors":[{"message":"%s"}]}\n' "$FAKE_GRAPHQL_VARIABLES_ERRORS"
    exit 0
  fi
  payload_key="FAKE_VARIABLE_JSON_$(printf '%s' "$service_id" | tr -c '[:alnum:]' '_')"
  python3 - "$state_dir" "$service_id" "${!payload_key:-}" <<'PY'
import json
import pathlib
import sys

state_dir = pathlib.Path(sys.argv[1])
service_id = sys.argv[2]
extra_raw = sys.argv[3]
path = state_dir / f"{service_id}.json"
payload = {}
if path.exists():
    payload.update(json.loads(path.read_text()))
elif extra_raw:
    payload.update(json.loads(extra_raw))
print(json.dumps({"data": {"unrenderedVariables": payload}}))
PY
  exit 0
fi

if [[ "$query" == *"mutation VariableCollectionUpsert"* ]]; then
  service_id="$(printf '%s' "$variables_json" | jq -r '.serviceId // ""')"
  if [[ -z "$service_id" ]]; then
    echo "curl mock: upsert mutation missing serviceId" >&2
    exit 1
  fi
  replace="$(printf '%s' "$variables_json" | jq -r '.replace // false')"
  skip_deploys="$(printf '%s' "$variables_json" | jq -r '.skipDeploys // false')"
  keys="$(printf '%s' "$variables_json" | jq -r '(.variables | keys | join(","))')"
  record "graphql upsert $service_id replace=$replace skipDeploys=$skip_deploys keys=$keys"
  if [[ -n "${FAKE_GRAPHQL_UPSERT_STDERR:-}" ]]; then
    printf '%s\n' "$FAKE_GRAPHQL_UPSERT_STDERR" >&2
    exit 22
  fi
  if [[ -n "${FAKE_GRAPHQL_UPSERT_ERRORS:-}" ]]; then
    printf '{"errors":[{"message":"%s"}]}\n' "$FAKE_GRAPHQL_UPSERT_ERRORS"
    exit 0
  fi
  python3 - "$state_dir" "$service_id" "$variables_json" "$replace" <<'PY'
import json
import pathlib
import sys

state_dir = pathlib.Path(sys.argv[1])
service_id = sys.argv[2]
variables = json.loads(sys.argv[3])["variables"]
replace = sys.argv[4].lower() == "true"
path = state_dir / f"{service_id}.json"
if path.exists():
    payload = json.loads(path.read_text())
else:
    payload = {}
if replace:
    payload = dict(variables)
else:
    payload.update(variables)
path.write_text(json.dumps(payload))
PY
  printf '{"data":{"variableCollectionUpsert":true}}\n'
  exit 0
fi

echo "curl mock: unsupported GraphQL operation" >&2
exit 1
EOF
chmod +x "$TMP_DIR/curl"

cat >"$TMP_DIR/sleep" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf 'sleep %s\n' "$*" >>"${MOCK_RAILWAY_LOG:?}"
exit 0
EOF
chmod +x "$TMP_DIR/sleep"

CONFIG_DIR="$TMP_DIR/config/env"
mkdir -p "$CONFIG_DIR"
cp "$ROOT_DIR/config/env/staging.env" "$CONFIG_DIR/staging.env"
cp "$ROOT_DIR/config/env/prod.env" "$CONFIG_DIR/prod.env"

reset_logs() {
  rm -f "$LOG_FILE"
  : >"$LOG_FILE"
  : >"$DEBUG_LOG"
}

seed_runtime_state() {
  local service_id="$1"
  local payload="$2"
  printf '%s' "$payload" >"$STATE_DIR/$service_id.json"
}

if grep -Eq 'for key in "\$\{managed_optional_exact\[@\]-\}"' "$SCRIPT"; then
  echo "assertion failed: managed_optional_exact loops must guard empty arrays before indirect expansion" >&2
  exit 1
fi

export PATH="$TMP_DIR:$PATH"
export MOCK_RAILWAY_LOG="$LOG_FILE"
export MOCK_RAILWAY_STATE_DIR="$STATE_DIR"
export RAILWAY_SYNC_CONFIG_DIR="$CONFIG_DIR"
export RAILWAY_API_TOKEN="token"
export RAILWAY_PROJECT_ID="project-id"
export RAILWAY_ENVIRONMENT="staging"
export COMMIT_SHA="0123456789abcdef0123456789abcdef01234567"
export MIGRATION_CHECKSUM="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
export DEPLOY_RUN_ID="9001-2"
export RAILWAY_CI_DEBUG="0"

export RAILWAY_SERVICE_ID="svc-api"
export EXPECTED_APP_ROLE="api"
export EXPECTED_BANJI_SERVICE="api"
export DATABASE_RUNTIME_URL="postgres://runtime@db.example/banji"
export RABBIT_MANAGEMENT_API_BASE_URL="https://rabbit.example.com"
export RABBIT_MANAGEMENT_USERNAME="banji"
export RABBIT_MANAGEMENT_PASSWORD="rabbit-management-secret"
seed_runtime_state "svc-api" '{"EDGE_ORIGIN_AUTH_SECRET":"railway-edge-secret","AUTH_JWKS_URL":"https://jwks.example.com","AUTH_ISSUER":"https://issuer.example.com","AUTH_AUDIENCE":"banji-api","OTEL_SERVICE_NAME":"stale-api-name","OTEL_RESOURCE_ATTRIBUTES":"service.version=old","OTEL_EXPORTER_OTLP_HEADERS":"authorization=old","OTEL_HEADERS":"authorization=legacy","OTEL_METRICS_EXPORT_INTERVAL":"9999"}'
export FAKE_DEPLOYMENT_SEQUENCE_svc_api="baseline-success:SUCCESS;deploy-api:SUCCESS"

bash "$SCRIPT" >/dev/null 2>"$DEBUG_LOG"

grep -q "^graphql environments$" "$LOG_FILE"
grep -q "^graphql variables svc-api$" "$LOG_FILE"
grep -q "^graphql upsert svc-api replace=false skipDeploys=true" "$LOG_FILE"
grep -q "^delete svc-api OTEL_SERVICE_NAME$" "$LOG_FILE"
grep -q "^delete svc-api OTEL_RESOURCE_ATTRIBUTES$" "$LOG_FILE"
grep -q "^delete svc-api OTEL_EXPORTER_OTLP_HEADERS$" "$LOG_FILE"
grep -q "^delete svc-api OTEL_HEADERS$" "$LOG_FILE"
grep -q "^delete svc-api OTEL_METRICS_EXPORT_INTERVAL$" "$LOG_FILE"
grep -q "up $ROOT_DIR/apps/api --path-as-root --service svc-api --detach" "$LOG_FILE"
grep -q "deployment list --json --limit 1 --service svc-api" "$LOG_FILE"
grep -q "^link --project project-id --environment staging --service svc-api$" "$LOG_FILE"
grep -q "auth api" "$LOG_FILE"
jq -e '
  .BANJI_DEPLOYMENT_ID == "9001-2"
  and .DATABASE_RUNTIME_ENDPOINT_KIND == "pgbouncer"
  and .CACHE_SCHEMA_VERSION == "v1"
  and .EDGE_ORIGIN_AUTH_SECRET == "railway-edge-secret"
  and .AUTH_JWKS_URL == "https://jwks.example.com"
  and .AUTH_ISSUER == "https://issuer.example.com"
  and .AUTH_AUDIENCE == "banji-api"
  and .EDGE_ENFORCEMENT_ENABLED == "true"
  and .RABBIT_MANAGEMENT_API_BASE_URL == "https://rabbit.example.com"
  and .RABBIT_MANAGEMENT_USERNAME == "banji"
  and .RABBIT_MANAGEMENT_PASSWORD == "rabbit-management-secret"
  and .OTEL_ENABLED == "true"
  and .OTEL_EXPORTER_OTLP_ENDPOINT == "http://otel-collector:4317"
  and .OTEL_METRIC_EXPORT_INTERVAL == "30000"
  and (.OTEL_SERVICE_NAME | not)
  and (.OTEL_RESOURCE_ATTRIBUTES | not)
  and (.OTEL_EXPORTER_OTLP_HEADERS | not)
  and (.OTEL_HEADERS | not)
  and (.OTEL_METRICS_EXPORT_INTERVAL | not)
' "$STATE_DIR/svc-api.json" >/dev/null
if grep -q "\\[railway-debug\\]" "$DEBUG_LOG"; then
  echo "assertion failed: debug logs should not be printed when RAILWAY_CI_DEBUG=0" >&2
  exit 1
fi

if grep -q "login" "$LOG_FILE"; then
  echo "assertion failed: sync script must not run railway login" >&2
  exit 1
fi

if grep -q "variables --set" "$LOG_FILE"; then
  echo "assertion failed: sync script must not use railway variables --set" >&2
  exit 1
fi
if grep -q "^variable set " "$LOG_FILE" || grep -q "^variable list " "$LOG_FILE"; then
  echo "assertion failed: variable sync should not use Railway variable set/list CLI calls" >&2
  exit 1
fi

if [[ "$(grep -c "^up " "$LOG_FILE")" -ne 1 ]]; then
  echo "assertion failed: expected exactly one railway up invocation for api" >&2
  exit 1
fi
if grep -q "^logs " "$LOG_FILE"; then
  echo "assertion failed: debug-off deploy should not fetch Railway logs" >&2
  exit 1
fi

reset_logs

export RAILWAY_CI_DEBUG="1"
api_state_tmp="$TMP_DIR/svc-api.state.tmp.json"
jq '. + {"UNMANAGED_SECRET":"raw-unmanaged-secret"}' "$STATE_DIR/svc-api.json" >"$api_state_tmp"
mv "$api_state_tmp" "$STATE_DIR/svc-api.json"
export FAKE_UP_OUTPUT="verbose deploy rabbit=rabbit-management-secret"
export FAKE_DEPLOYMENT_SEQUENCE_svc_api="baseline-success:SUCCESS;deploy-debug:BUILDING;deploy-debug:SUCCESS"
bash "$SCRIPT" >/dev/null 2>"$DEBUG_LOG"

grep -q "\\[railway-debug\\] auth source=api" "$DEBUG_LOG"
grep -Fxq "[railway-debug] begin: link project/environment/service" "$DEBUG_LOG"
grep -q "\\[railway-debug\\] begin: poll latest deployment to terminal state" "$DEBUG_LOG"
grep -q "^up $ROOT_DIR/apps/api --path-as-root --service svc-api --detach --verbose$" "$LOG_FILE"
grep -q "verbose deploy rabbit=\\*\\*\\*" "$DEBUG_LOG"
grep -q "^sleep 5$" "$LOG_FILE"
grep -q "pass: terminal deployment id=deploy-debug status=SUCCESS" "$DEBUG_LOG"
if grep -q "^logs " "$LOG_FILE"; then
  echo "assertion failed: successful debug deploy should not fetch Railway logs" >&2
  exit 1
fi
if grep -q "raw-unmanaged-secret" "$DEBUG_LOG"; then
  echo "assertion failed: debug output leaked unmanaged runtime variable value" >&2
  exit 1
fi
jq -e '.UNMANAGED_SECRET == "raw-unmanaged-secret"' "$STATE_DIR/svc-api.json" >/dev/null

export RAILWAY_CI_DEBUG="0"
unset FAKE_UP_OUTPUT FAKE_DEPLOYMENT_SEQUENCE_svc_api

reset_logs

export FAKE_DEPLOYMENT_SEQUENCE_svc_api="baseline-success:SUCCESS;deploy-noop:SUCCESS"
bash "$SCRIPT" >/dev/null 2>"$DEBUG_LOG"
if grep -q "^graphql upsert svc-api " "$LOG_FILE"; then
  echo "assertion failed: no-op sync should not issue a batch upsert mutation" >&2
  exit 1
fi
unset FAKE_DEPLOYMENT_SEQUENCE_svc_api

reset_logs

export RAILWAY_CI_DEBUG="1"
export FAKE_UP_STDERR="deploy failed token=token-leak-value"
export FAKE_LOGS_BUILD_OUTPUT="build log secret=rabbit-management-secret-leak"
export FAKE_LOGS_DEPLOYMENT_OUTPUT="deployment log token=token-leak-value"
export RAILWAY_API_TOKEN="token-leak-value"
export RABBIT_MANAGEMENT_PASSWORD="rabbit-management-secret-leak"
export FAKE_DEPLOYMENT_SEQUENCE_svc_api="baseline-success:SUCCESS"
if bash "$SCRIPT" >/dev/null 2>"$DEBUG_LOG"; then
  echo "assertion failed: mocked railway up failure should fail sync + up" >&2
  exit 1
fi
grep -q "^logs --build --latest --lines 120 --service svc-api$" "$LOG_FILE"
grep -q "^logs --deployment --latest --lines 120 --service svc-api$" "$LOG_FILE"
if ! grep -q "\\*\\*\\*" "$DEBUG_LOG"; then
  echo "assertion failed: expected redacted secrets in debug log tails" >&2
  exit 1
fi
if grep -q "token-leak-value" "$DEBUG_LOG"; then
  echo "assertion failed: up failure path leaked RAILWAY_API_TOKEN" >&2
  exit 1
fi
if grep -q "rabbit-management-secret-leak" "$DEBUG_LOG"; then
  echo "assertion failed: up failure path leaked managed secret" >&2
  exit 1
fi
unset FAKE_UP_STDERR FAKE_LOGS_BUILD_OUTPUT FAKE_LOGS_DEPLOYMENT_OUTPUT FAKE_DEPLOYMENT_SEQUENCE_svc_api
export RAILWAY_API_TOKEN="token"
export RABBIT_MANAGEMENT_PASSWORD="rabbit-management-secret"
export RAILWAY_CI_DEBUG="0"

reset_logs

unset RAILWAY_API_TOKEN
export RAILWAY_TOKEN="project-token"
if bash "$SCRIPT" >/dev/null 2>&1; then
  echo "assertion failed: RAILWAY_TOKEN-only auth should fail" >&2
  exit 1
fi

if [[ -s "$LOG_FILE" ]]; then
  echo "assertion failed: RAILWAY_TOKEN-only auth should fail before Railway CLI calls" >&2
  exit 1
fi

reset_logs

export RAILWAY_API_TOKEN="token"
if bash "$SCRIPT" >/dev/null 2>&1; then
  echo "assertion failed: mixed Railway auth env should fail" >&2
  exit 1
fi

if [[ -s "$LOG_FILE" ]]; then
  echo "assertion failed: mixed Railway auth env should fail before Railway CLI calls" >&2
  exit 1
fi

unset RAILWAY_TOKEN

export EDGE_ORIGIN_AUTH_SECRET="edge-secret"
if bash "$SCRIPT" >/dev/null 2>&1; then
  echo "assertion failed: api deploy should reject locally provided EDGE_ORIGIN_AUTH_SECRET" >&2
  exit 1
fi
unset EDGE_ORIGIN_AUTH_SECRET
export RAILWAY_API_TOKEN="token"

if [[ -s "$LOG_FILE" ]]; then
  echo "assertion failed: forbidden local api auth vars should fail before Railway CLI calls" >&2
  exit 1
fi

reset_logs

api_state_tmp="$TMP_DIR/svc-api.missing-auth.tmp.json"
jq 'del(.AUTH_JWKS_URL)' "$STATE_DIR/svc-api.json" >"$api_state_tmp"
mv "$api_state_tmp" "$STATE_DIR/svc-api.json"
if bash "$SCRIPT" >/dev/null 2>&1; then
  echo "assertion failed: missing Railway-resident AUTH_JWKS_URL should fail for api" >&2
  exit 1
fi
grep -q "^graphql environments$" "$LOG_FILE"
grep -q "^graphql variables svc-api$" "$LOG_FILE"
if grep -q "^graphql upsert svc-api " "$LOG_FILE"; then
  echo "assertion failed: missing Railway auth runtime vars should fail before runtime sync writes" >&2
  exit 1
fi
seed_runtime_state "svc-api" '{"EDGE_ORIGIN_AUTH_SECRET":"railway-edge-secret","AUTH_JWKS_URL":"https://jwks.example.com","AUTH_ISSUER":"https://issuer.example.com","AUTH_AUDIENCE":"banji-api","BANJI_DEPLOYMENT_ID":"9001-2","DEPLOY_COMMIT_SHA":"0123456789abcdef0123456789abcdef01234567","DEPLOY_MIGRATION_CHECKSUM":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","DEPLOY_RUN_ID":"9001-2","APP_ROLE":"api","BANJI_SERVICE":"api","BANJI_SYSTEM":"banji-core","BANJI_ENV":"staging","BANJI_REGION":"kh-pp","BANJI_TENANT":"default","DATABASE_RUNTIME_ENDPOINT_KIND":"pgbouncer","PGBOUNCER_POOL_MODE":"transaction","IDEMPOTENCY_RETENTION_DAYS":"30","SQLX_POOL_MAX_CONNECTIONS":"10","SQLX_POOL_MIN_CONNECTIONS":"1","SQLX_POOL_ACQUIRE_TIMEOUT_MS":"2000","SQLX_POOL_CONNECT_TIMEOUT_MS":"2000","SQLX_POOL_IDLE_TIMEOUT_SECONDS":"300","SQLX_POOL_MAX_LIFETIME_SECONDS":"1800","POSTGRES_CONNECTION_BUDGET_TOTAL":"80","CACHE_ENABLED":"true","CACHE_SCHEMA_VERSION":"v1","CACHE_DEFAULT_TTL_SECONDS":"300","CACHE_TTL_JITTER_SECONDS":"30","REDIS_CONNECT_TIMEOUT_MS":"100","REDIS_COMMAND_TIMEOUT_MS":"50","REDIS_CIRCUIT_ERROR_THRESHOLD":"20","REDIS_CIRCUIT_WINDOW_SECONDS":"30","REDIS_CIRCUIT_COOLDOWN_SECONDS":"60","REDIS_LOG_RATE_LIMIT_SECONDS":"30","EVENT_PAYLOAD_MAX_BYTES":"65536","OBSERVABILITY_RABBIT_QUEUE_POLL_INTERVAL_MS":"5000","OBSERVABILITY_POSTGRES_LOCK_POLL_INTERVAL_MS":"5000","OBSERVABILITY_JOB_PRESSURE_POLL_INTERVAL_MS":"5000","OTEL_ENABLED":"true","OTEL_EXPORTER_OTLP_ENDPOINT":"http://otel-collector:4317","OTEL_TRACES_SAMPLER":"parentbased_traceidratio","OTEL_TRACES_SAMPLER_ARG":"0.1","OTEL_METRIC_EXPORT_INTERVAL":"30000","AUTH_ENABLED":"true","AUTH_JWKS_CACHE_TTL_SECONDS":"300","AUTH_JWKS_TIMEOUT_MS":"1000","AUTH_CLOCK_SKEW_SECONDS":"30","EDGE_ENFORCEMENT_ENABLED":"true","EDGE_ORIGIN_AUTH_HEADER_NAME":"x-banji-edge-auth","EDGE_RATE_LIMIT_ENABLED":"true","EDGE_RATE_LIMIT_WINDOW_SECONDS":"60","EDGE_RATE_LIMIT_READ_MAX":"120","EDGE_RATE_LIMIT_USER_READ_MAX":"240","EDGE_RATE_LIMIT_USER_WRITE_MAX":"60","EDGE_RATE_LIMIT_DEVICE_READ_MAX":"120","EDGE_RATE_LIMIT_DEVICE_WRITE_MAX":"30","EDGE_RATE_LIMIT_FALLBACK_MAX_KEYS":"10000","EDGE_RATE_LIMIT_KEY_TTL_SECONDS":"300","EDGE_RATE_LIMIT_REDIS_PREFIX":"rate-limit","EDGE_RATE_LIMIT_FAILOVER_ENABLED":"true","EDGE_BACKPRESSURE_ENABLED":"true","EDGE_BACKPRESSURE_POLL_INTERVAL_MS":"1000","EDGE_BACKPRESSURE_RETRY_AFTER_SECONDS":"5","EDGE_BACKPRESSURE_CONSECUTIVE_UNHEALTHY":"2","EDGE_BACKPRESSURE_CONSECUTIVE_HEALTHY":"2","EDGE_BACKPRESSURE_JOB_OUTBOX_PENDING_MAX":"1000","EDGE_BACKPRESSURE_JOB_OUTBOX_OLDEST_AGE_SECONDS_MAX":"30","EDGE_BACKPRESSURE_JOB_RUN_PENDING_MAX":"2000","EDGE_BACKPRESSURE_JOB_RUN_OLDEST_AGE_SECONDS_MAX":"60","EDGE_BACKPRESSURE_KAFKA_PENDING_MAX":"500","EDGE_BACKPRESSURE_KAFKA_OLDEST_AGE_SECONDS_MAX":"30","EDGE_REQUEST_MAX_BYTES":"262144","EDGE_WRITE_REQUEST_MAX_BYTES":"65536","EDGE_CORS_ALLOWED_ORIGINS":"https://staging.example.com","EDGE_TRUST_FORWARDED_CLIENT_IP":"true","DATABASE_RUNTIME_URL":"postgres://runtime@db.example/banji","RABBIT_MANAGEMENT_API_BASE_URL":"https://rabbit.example.com","RABBIT_MANAGEMENT_USERNAME":"banji","RABBIT_MANAGEMENT_PASSWORD":"rabbit-management-secret"}'

reset_logs

export RAILWAY_ENVIRONMENT="prod"
export RAILWAY_SERVICE_ID="svc-api-prod"
export EXPECTED_APP_ROLE="api"
export EXPECTED_BANJI_SERVICE="api"
export DATABASE_RUNTIME_URL="postgres://runtime@db.example/banji"
export EDGE_ORIGIN_AUTH_SECRET="prod-edge-secret"
export AUTH_JWKS_URL="https://prod-jwks.example.com"
export AUTH_ISSUER="https://prod-issuer.example.com"
export AUTH_AUDIENCE="banji-api"
export FAKE_VARIABLE_JSON_svc_api_prod='{"CACHE_SCHEMA_VERSION":"stale"}'
export FAKE_DEPLOYMENT_SEQUENCE_svc_api_prod="baseline-prod-api:SUCCESS;deploy-prod-api:SUCCESS"

bash "$SCRIPT" >/dev/null 2>"$DEBUG_LOG"

grep -q "^graphql upsert svc-api-prod replace=false skipDeploys=true" "$LOG_FILE"
jq -e '
  .EDGE_ORIGIN_AUTH_SECRET == "prod-edge-secret"
  and .AUTH_JWKS_URL == "https://prod-jwks.example.com"
  and .AUTH_ISSUER == "https://prod-issuer.example.com"
  and .AUTH_AUDIENCE == "banji-api"
' "$STATE_DIR/svc-api-prod.json" >/dev/null

unset FAKE_VARIABLE_JSON_svc_api_prod FAKE_DEPLOYMENT_SEQUENCE_svc_api_prod
export RAILWAY_ENVIRONMENT="staging"
unset EDGE_ORIGIN_AUTH_SECRET AUTH_JWKS_URL AUTH_ISSUER AUTH_AUDIENCE

reset_logs

unset RABBIT_MANAGEMENT_PASSWORD
if bash "$SCRIPT" >/dev/null 2>&1; then
  echo "assertion failed: partial Rabbit management auth should fail for api" >&2
  exit 1
fi
export RABBIT_MANAGEMENT_PASSWORD="secret"

if [[ -s "$LOG_FILE" ]]; then
  echo "assertion failed: partial api Rabbit management config should fail before Railway CLI calls" >&2
  exit 1
fi

reset_logs

unset RABBIT_MANAGEMENT_API_BASE_URL
if bash "$SCRIPT" >/dev/null 2>&1; then
  echo "assertion failed: Rabbit management credentials without base URL should fail for api" >&2
  exit 1
fi
export RABBIT_MANAGEMENT_API_BASE_URL="https://rabbit.example.com"

if [[ -s "$LOG_FILE" ]]; then
  echo "assertion failed: api Rabbit management credential-only config should fail before Railway CLI calls" >&2
  exit 1
fi

reset_logs

unset EDGE_ORIGIN_AUTH_SECRET AUTH_JWKS_URL AUTH_ISSUER AUTH_AUDIENCE
unset RABBIT_MANAGEMENT_API_BASE_URL RABBIT_MANAGEMENT_USERNAME RABBIT_MANAGEMENT_PASSWORD
export RAILWAY_SERVICE_ID="svc-relay"
export EXPECTED_APP_ROLE="event-relay"
export EXPECTED_BANJI_SERVICE="event-relay"
export DATABASE_RUNTIME_URL="postgres://runtime@db.example/banji"
export OTEL_EXPORTER_OTLP_HEADERS="authorization=Bearer relay-token"
export FAKE_VARIABLE_JSON_svc_relay='{"EDGE_ENFORCEMENT_ENABLED":"true","EDGE_ORIGIN_AUTH_HEADER_NAME":"x-banji-edge-auth","OTEL_HEADERS":"authorization=legacy"}'
export FAKE_DEPLOYMENT_SEQUENCE_svc_relay="baseline-relay:SUCCESS;deploy-relay:SUCCESS"

bash "$SCRIPT" >/dev/null 2>"$DEBUG_LOG"

grep -q "^graphql upsert svc-relay replace=false skipDeploys=true" "$LOG_FILE"
grep -q "^delete svc-relay EDGE_ENFORCEMENT_ENABLED$" "$LOG_FILE"
grep -q "^delete svc-relay EDGE_ORIGIN_AUTH_HEADER_NAME$" "$LOG_FILE"
grep -q "^delete svc-relay OTEL_HEADERS$" "$LOG_FILE"
jq -e '
  .BANJI_DEPLOYMENT_ID == "9001-2"
  and .CACHE_SCHEMA_VERSION == "v1"
  and .EVENT_RELAY_BATCH_SIZE == "100"
  and .EVENT_LOG_RETENTION_DAYS == "30"
  and .OTEL_ENABLED == "true"
  and .OTEL_EXPORTER_OTLP_HEADERS == "authorization=Bearer relay-token"
  and (.EDGE_ENFORCEMENT_ENABLED | not)
  and (.EDGE_ORIGIN_AUTH_HEADER_NAME | not)
  and (.OTEL_HEADERS | not)
' "$STATE_DIR/svc-relay.json" >/dev/null
if [[ -s "$DEBUG_LOG" ]]; then
  echo "assertion failed: event-relay sync should not emit stderr on success" >&2
  exit 1
fi
unset FAKE_VARIABLE_JSON_svc_relay OTEL_EXPORTER_OTLP_HEADERS

reset_logs

export RAILWAY_SERVICE_ID="svc-projection"
export EXPECTED_APP_ROLE="projection-consumer"
export EXPECTED_BANJI_SERVICE="projection-consumer"
export DATABASE_RUNTIME_URL="postgres://runtime@db.example/banji"
export FAKE_VARIABLE_JSON_svc_projection='{"EVENT_CONSUMER_REPLAY_TO_ID":"42"}'
export FAKE_DEPLOYMENT_SEQUENCE_svc_projection="baseline-projection:SUCCESS;deploy-projection:SUCCESS"

bash "$SCRIPT" >/dev/null 2>"$DEBUG_LOG"

grep -q "^graphql upsert svc-projection replace=false skipDeploys=true" "$LOG_FILE"
grep -q "^delete svc-projection EVENT_CONSUMER_REPLAY_TO_ID$" "$LOG_FILE"
jq -e '
  .BANJI_DEPLOYMENT_ID == "9001-2"
  and .CACHE_SCHEMA_VERSION == "v1"
  and .EVENT_CONSUMER_SERVICE_NAME == "projection-consumer"
  and .EVENT_CONSUMER_STREAM_NAME == "banji-core.staging.inventory-updated"
  and .OTEL_ENABLED == "true"
  and (.EVENT_CONSUMER_REPLAY_TO_ID | not)
' "$STATE_DIR/svc-projection.json" >/dev/null
if [[ -s "$DEBUG_LOG" ]]; then
  echo "assertion failed: projection-consumer sync should not emit stderr on success" >&2
  exit 1
fi
unset FAKE_VARIABLE_JSON_svc_projection

reset_logs

export RAILWAY_SERVICE_ID="svc-worker"
export EXPECTED_APP_ROLE="worker"
export EXPECTED_BANJI_SERVICE="worker"
export DATABASE_RUNTIME_URL="postgres://runtime@db.example/banji"
export RABBIT_URL="amqps://rabbit.example.com/%2f"
export OBJECT_STORAGE_ACCESS_KEY="access"
export OBJECT_STORAGE_SECRET_KEY="secret"
export ALGORITHM_ROLLOUT_HASH_SALT="salt"
export FAKE_VARIABLE_JSON_svc_worker='{"JOB_HANDLER_MAX_RUNTIME_SECONDS":"600","JOB_RESULT_KAFKA_TOPIC_PREFIX":"old-prefix","RABBIT_MANAGEMENT_API_BASE_URL":"https://rabbit.example.com","RABBIT_MANAGEMENT_USERNAME":"banji","RABBIT_MANAGEMENT_PASSWORD":"secret"}'
export FAKE_DEPLOYMENT_SEQUENCE_svc_worker="baseline-worker:SUCCESS;deploy-worker:SUCCESS"

bash "$SCRIPT" >/dev/null 2>"$DEBUG_LOG"

grep -q "^graphql upsert svc-worker replace=false skipDeploys=true" "$LOG_FILE"
grep -q "^delete svc-worker JOB_HANDLER_MAX_RUNTIME_SECONDS$" "$LOG_FILE"
grep -q "^delete svc-worker JOB_RESULT_KAFKA_TOPIC_PREFIX$" "$LOG_FILE"
grep -q "^delete svc-worker RABBIT_MANAGEMENT_API_BASE_URL$" "$LOG_FILE"
grep -q "^delete svc-worker RABBIT_MANAGEMENT_USERNAME$" "$LOG_FILE"
grep -q "^delete svc-worker RABBIT_MANAGEMENT_PASSWORD$" "$LOG_FILE"
jq -e '
  .BANJI_DEPLOYMENT_ID == "9001-2"
  and .CACHE_SCHEMA_VERSION == "v1"
  and .OBJECT_STORAGE_ENDPOINT == "https://storage.staging.example.com"
  and .OTEL_ENABLED == "true"
  and .RABBIT_URL == "amqps://rabbit.example.com/%2f"
  and .OBJECT_STORAGE_ACCESS_KEY == "access"
  and .OBJECT_STORAGE_SECRET_KEY == "secret"
  and .ALGORITHM_ROLLOUT_HASH_SALT == "salt"
  and (.JOB_HANDLER_MAX_RUNTIME_SECONDS | not)
  and (.JOB_RESULT_KAFKA_TOPIC_PREFIX | not)
  and (.RABBIT_MANAGEMENT_API_BASE_URL | not)
  and (.RABBIT_MANAGEMENT_USERNAME | not)
  and (.RABBIT_MANAGEMENT_PASSWORD | not)
' "$STATE_DIR/svc-worker.json" >/dev/null
grep -q "up $ROOT_DIR/apps/api --path-as-root --service svc-worker --detach" "$LOG_FILE"
if [[ -s "$DEBUG_LOG" ]]; then
  echo "assertion failed: worker sync should not emit stderr on success" >&2
  exit 1
fi

reset_logs

unset RABBIT_URL
if bash "$SCRIPT" >/dev/null 2>&1; then
  echo "assertion failed: missing worker RABBIT_URL should fail" >&2
  exit 1
fi

if [[ -s "$LOG_FILE" ]]; then
  echo "assertion failed: validation failure should happen before Railway CLI calls" >&2
  exit 1
fi

export RABBIT_URL="amqps://rabbit.example.com/%2f"
unset FAKE_DEPLOYMENT_SEQUENCE_svc_worker FAKE_VARIABLE_JSON_svc_worker
BROKEN_CONFIG_DIR="$TMP_DIR/broken-config/env"
mkdir -p "$BROKEN_CONFIG_DIR"
cp "$CONFIG_DIR/prod.env" "$BROKEN_CONFIG_DIR/prod.env"
grep -v '^CACHE_SCHEMA_VERSION=' "$CONFIG_DIR/staging.env" >"$BROKEN_CONFIG_DIR/staging.env"

reset_logs

export RAILWAY_SERVICE_ID="svc-relay-missing-cache"
export EXPECTED_APP_ROLE="event-relay"
export EXPECTED_BANJI_SERVICE="event-relay"
export DATABASE_RUNTIME_URL="postgres://runtime@db.example/banji"
if RAILWAY_SYNC_CONFIG_DIR="$BROKEN_CONFIG_DIR" bash "$SCRIPT" >/dev/null 2>&1; then
  echo "assertion failed: missing CACHE_SCHEMA_VERSION in config fixture should fail" >&2
  exit 1
fi

if [[ -s "$LOG_FILE" ]]; then
  echo "assertion failed: missing runtime config should fail before Railway CLI calls" >&2
  exit 1
fi

reset_logs

export EXPECTED_APP_ROLE="api"
export EXPECTED_BANJI_SERVICE="api"
export RAILWAY_SERVICE_ID="svc-api"
export DATABASE_RUNTIME_URL="postgres://runtime@db.example/banji"
export RABBIT_MANAGEMENT_API_BASE_URL="https://rabbit.example.com"
export RABBIT_MANAGEMENT_USERNAME="banji"
export RABBIT_MANAGEMENT_PASSWORD="rabbit-management-secret"
seed_runtime_state "svc-api" '{"EDGE_ORIGIN_AUTH_SECRET":"railway-edge-secret","AUTH_JWKS_URL":"https://jwks.example.com","AUTH_ISSUER":"https://issuer.example.com","AUTH_AUDIENCE":"banji-api","CACHE_SCHEMA_VERSION":"stale"}'
export FAKE_GRAPHQL_UPSERT_STDERR="You are being ratelimited. Please try again later token=token"
if bash "$SCRIPT" >/dev/null 2>"$DEBUG_LOG"; then
  echo "assertion failed: rate-limited GraphQL upsert should fail sync + up" >&2
  exit 1
fi
if [[ ! -s "$DEBUG_LOG" ]]; then
  echo "assertion failed: rate-limited GraphQL upsert should emit failure output" >&2
  exit 1
fi
if grep -q "token=token" "$DEBUG_LOG"; then
  echo "assertion failed: GraphQL upsert failure leaked auth token" >&2
  exit 1
fi
unset FAKE_GRAPHQL_UPSERT_STDERR

reset_logs

seed_runtime_state "svc-api" '{"EDGE_ORIGIN_AUTH_SECRET":"railway-edge-secret","AUTH_JWKS_URL":"https://jwks.example.com","AUTH_ISSUER":"https://issuer.example.com","AUTH_AUDIENCE":"banji-api","CACHE_SCHEMA_VERSION":"stale"}'
export RABBIT_MANAGEMENT_PASSWORD='rabbit-"quoted"-secret'
export FAKE_GRAPHQL_UPSERT_STDERR='mutation failed {"secret":"rabbit-\"quoted\"-secret","token":"token"}'
if bash "$SCRIPT" >/dev/null 2>"$DEBUG_LOG"; then
  echo "assertion failed: JSON-escaped secret failure should fail sync + up" >&2
  exit 1
fi
if grep -q 'rabbit-\\"quoted\\"-secret' "$DEBUG_LOG" || grep -q 'rabbit-"quoted"-secret' "$DEBUG_LOG"; then
  echo "assertion failed: GraphQL upsert failure leaked JSON-escaped managed secret" >&2
  exit 1
fi
unset FAKE_GRAPHQL_UPSERT_STDERR
export RABBIT_MANAGEMENT_PASSWORD="rabbit-management-secret"

reset_logs

seed_runtime_state "svc-api" '{"EDGE_ORIGIN_AUTH_SECRET":"railway-edge-secret","AUTH_JWKS_URL":"https://jwks.example.com","AUTH_ISSUER":"https://issuer.example.com","AUTH_AUDIENCE":"banji-api","CACHE_SCHEMA_VERSION":"stale"}'
export FAKE_GRAPHQL_UPSERT_ERRORS="mutation rejected"
if bash "$SCRIPT" >/dev/null 2>"$DEBUG_LOG"; then
  echo "assertion failed: GraphQL errors should fail sync + up" >&2
  exit 1
fi
if [[ ! -s "$DEBUG_LOG" ]]; then
  echo "assertion failed: GraphQL error response should emit failure output" >&2
  exit 1
fi
unset FAKE_GRAPHQL_UPSERT_ERRORS

reset_logs

export FAKE_GRAPHQL_INVALID_JSON="1"
if bash "$SCRIPT" >/dev/null 2>"$DEBUG_LOG"; then
  echo "assertion failed: invalid GraphQL json should fail sync + up" >&2
  exit 1
fi
if [[ ! -s "$DEBUG_LOG" ]]; then
  echo "assertion failed: invalid GraphQL json should emit failure output" >&2
  exit 1
fi
unset FAKE_GRAPHQL_INVALID_JSON

reset_logs

export EXPECTED_APP_ROLE="api"
export EXPECTED_BANJI_SERVICE="api"
export RAILWAY_SERVICE_ID="svc-api"
export DATABASE_RUNTIME_URL="postgres://runtime@db.example/banji"
unset OBJECT_STORAGE_ACCESS_KEY OBJECT_STORAGE_SECRET_KEY ALGORITHM_ROLLOUT_HASH_SALT
export OBJECT_STORAGE_ENDPOINT="https://storage.example.com"

if bash "$SCRIPT" >/dev/null 2>&1; then
  echo "assertion failed: forbidden api object storage vars should fail" >&2
  exit 1
fi

unset OBJECT_STORAGE_ENDPOINT

reset_logs

export EXPECTED_APP_ROLE="api"
export EXPECTED_BANJI_SERVICE="api"
export RAILWAY_SERVICE_ID="svc-api"
export FAKE_DEPLOYMENT_SEQUENCE_svc_api="baseline-success:SUCCESS;deploy-failed:DEPLOYING;deploy-failed:FAILED"
if bash "$SCRIPT" >/dev/null 2>&1; then
  echo "assertion failed: failed deployment status should fail sync + up" >&2
  exit 1
fi
grep -q "^sleep 5$" "$LOG_FILE"
unset FAKE_DEPLOYMENT_SEQUENCE_svc_api

reset_logs

export RAILWAY_CI_DEBUG="1"
export FAKE_DEPLOYMENT_SEQUENCE_svc_api="baseline-success:SUCCESS;deploy-failed-debug:DEPLOYING;deploy-failed-debug:FAILED"
export FAKE_LOGS_BUILD_STDERR="build tail unavailable token=token-leak-value"
export FAKE_LOGS_DEPLOYMENT_STDERR="deployment tail unavailable secret=rabbit-management-secret-leak"
export RAILWAY_API_TOKEN="token-leak-value"
export RABBIT_MANAGEMENT_PASSWORD="rabbit-management-secret-leak"
if bash "$SCRIPT" >/dev/null 2>"$DEBUG_LOG"; then
  echo "assertion failed: failed deployment status should still fail in debug mode" >&2
  exit 1
fi
grep -q "^logs --build --latest --lines 120 --service svc-api$" "$LOG_FILE"
grep -q "^logs --deployment --latest --lines 120 --service svc-api$" "$LOG_FILE"
grep -q "\\[railway-debug\\] failed: fetch latest Railway build logs (exit 1)" "$DEBUG_LOG"
grep -q "\\[railway-debug\\] failed: fetch latest Railway deployment logs (exit 1)" "$DEBUG_LOG"
if grep -q "token-leak-value" "$DEBUG_LOG"; then
  echo "assertion failed: log-fetch failure path leaked RAILWAY_API_TOKEN" >&2
  exit 1
fi
if grep -q "rabbit-management-secret-leak" "$DEBUG_LOG"; then
  echo "assertion failed: log-fetch failure path leaked managed secret" >&2
  exit 1
fi
unset FAKE_DEPLOYMENT_SEQUENCE_svc_api FAKE_LOGS_BUILD_STDERR FAKE_LOGS_DEPLOYMENT_STDERR
export RAILWAY_API_TOKEN="token"
export RABBIT_MANAGEMENT_PASSWORD="rabbit-management-secret"
export RAILWAY_CI_DEBUG="0"

reset_logs

export RAILWAY_CI_DEBUG="1"
export FAKE_DEPLOYMENT_SEQUENCE_svc_api="baseline-success:SUCCESS;deploy-timeout:BUILDING"
if bash "$SCRIPT" >/dev/null 2>"$DEBUG_LOG"; then
  echo "assertion failed: timeout deployment status should fail sync + up" >&2
  exit 1
fi
grep -q "did not reach terminal state within 300 seconds" "$DEBUG_LOG"
grep -q "latest observed deployment id was 'deploy-timeout' with status 'BUILDING'" "$DEBUG_LOG"
grep -q "^logs --build --latest --lines 120 --service svc-api$" "$LOG_FILE"
grep -q "^logs --deployment --latest --lines 120 --service svc-api$" "$LOG_FILE"
unset FAKE_DEPLOYMENT_SEQUENCE_svc_api
export RAILWAY_CI_DEBUG="0"

reset_logs

export RAILWAY_CI_DEBUG="1"
export FAKE_DEPLOYMENT_SEQUENCE_svc_api="SUCCESS;SUCCESS"
if bash "$SCRIPT" >/dev/null 2>"$DEBUG_LOG"; then
  echo "assertion failed: no-id deployment status should fail closed instead of accepting stale success" >&2
  exit 1
fi
grep -q "did not expose deployment IDs to prove freshness" "$DEBUG_LOG"
grep -q "^logs --build --latest --lines 120 --service svc-api$" "$LOG_FILE"
grep -q "^logs --deployment --latest --lines 120 --service svc-api$" "$LOG_FILE"
unset FAKE_DEPLOYMENT_SEQUENCE_svc_api
export RAILWAY_CI_DEBUG="0"

reset_logs

export RAILWAY_CI_DEBUG="1"
export RAILWAY_API_TOKEN="token-leak-value"
export RABBIT_MANAGEMENT_PASSWORD="rabbit-management-secret-leak"
export FAKE_LINK_STDERR="Unauthorized. token=token-leak-value secret=rabbit-management-secret-leak"
if bash "$SCRIPT" >/dev/null 2>"$DEBUG_LOG"; then
  echo "assertion failed: mocked link failure should fail sync + up" >&2
  exit 1
fi
if ! grep -q "\\*\\*\\*" "$DEBUG_LOG"; then
  echo "assertion failed: expected redacted secrets in debug output" >&2
  exit 1
fi
if grep -q "token-leak-value" "$DEBUG_LOG"; then
  echo "assertion failed: debug output leaked RAILWAY_API_TOKEN" >&2
  exit 1
fi
if grep -q "rabbit-management-secret-leak" "$DEBUG_LOG"; then
  echo "assertion failed: debug output leaked managed secret" >&2
  exit 1
fi
unset FAKE_LINK_STDERR
export RAILWAY_API_TOKEN="token"
export RABBIT_MANAGEMENT_PASSWORD="rabbit-management-secret"
export RAILWAY_CI_DEBUG="0"

reset_logs

unset RAILWAY_API_TOKEN
if bash "$SCRIPT" >/dev/null 2>&1; then
  echo "assertion failed: missing RAILWAY_API_TOKEN should fail" >&2
  exit 1
fi

if [[ -s "$LOG_FILE" ]]; then
  echo "assertion failed: auth validation failure should happen before Railway CLI calls" >&2
  exit 1
fi

echo "railway sync + up contract tests passed"
