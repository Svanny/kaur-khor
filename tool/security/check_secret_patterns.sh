#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

APPROVED_SECRET_PLACEHOLDER="__SET_IN_PLATFORM_SECRET__"
findings=0

skip_file() {
  local file="$1"
  case "$file" in
    .ocx/*) return 0 ;;
    .opencode/plugins/*) return 0 ;;
    tool/security/check_secret_patterns.sh) return 0 ;;
    docs/security/*) return 0 ;;
  esac
  return 1
}

report() {
  local label="$1"
  local file="$2"
  local detail="$3"
  findings=$((findings + 1))
  echo "[secret-check] $label in $file"
  echo "$detail"
}

check_env_template_placeholders() {
  local file line lineno key value
  [[ -d config/env ]] || return 0
  while IFS= read -r file; do
    [[ -f "$file" ]] || continue
    lineno=0
    while IFS= read -r line || [[ -n "$line" ]]; do
      lineno=$((lineno + 1))
      [[ -z "${line//[[:space:]]/}" ]] && continue
      [[ "$line" =~ ^[[:space:]]*# ]] && continue

      if [[ "$line" =~ ^[[:space:]]*([A-Z0-9_]+)[[:space:]]*=(.*)$ ]]; then
        key="${BASH_REMATCH[1]}"
        value="${BASH_REMATCH[2]}"
        value="$(echo "$value" | sed -E 's/[[:space:]]+#.*$//; s/^[[:space:]]+//; s/[[:space:]]+$//')"
        value="${value%\"}"
        value="${value#\"}"
        value="${value%\'}"
        value="${value#\'}"

        if [[ "$key" =~ ^(DATABASE_RUNTIME_URL|DATABASE_MIGRATION_URL|REDIS_URL|RABBIT_URL|OBJECT_STORAGE_ACCESS_KEY|OBJECT_STORAGE_SECRET_KEY|OTEL_HEADERS|OTEL_EXPORTER_OTLP_HEADERS|.*(SECRET|TOKEN|PASSWORD|API_KEY|ACCESS_KEY))$ ]]; then
          if [[ -n "$value" && "$value" != "$APPROVED_SECRET_PLACEHOLDER" ]]; then
            report \
              "Template secret value must be placeholder or empty" \
              "$file" \
              "$lineno:$line"
          fi
        fi
      fi
    done < "$file"
  done < <(find config/env -maxdepth 1 -type f -name '*.env' | sort)
}

scan_tracked_files() {
  local file output filtered
  while IFS= read -r -d '' file; do
    if skip_file "$file"; then
      continue
    fi
    [[ -f "$file" ]] || continue
    grep -Iq . "$file" || continue

    output="$(grep -nE '[A-Za-z][A-Za-z0-9+.-]*://[^[:space:]/:@]+:[^[:space:]@]+@' "$file" || true)"
    if [[ -n "$output" ]]; then
      filtered="$(echo "$output" \
        | grep -v "$APPROVED_SECRET_PLACEHOLDER" \
        | grep -Ev 'postgres://postgres:postgres@(localhost|127\\.0\\.0\\.1)(:[0-9]+)?/' \
        | grep -Ev 'postgres://user:pass@(localhost|127\\.0\\.0\\.1)(:[0-9]+)?/' \
        | grep -Ev 'redis://(:[^@]+@)?(localhost|127\\.0\\.0\\.1)(:[0-9]+)?' \
        | grep -Ev 'amqps?://guest:guest@(((localhost|127\\.0\\.0\\.1)(:[0-9]+)?/)|/)%2f' \
        || true)"
      if [[ -n "$filtered" ]]; then
        report "Credential-bearing URL" "$file" "$filtered"
      fi
    fi

    output="$(grep -nE '(AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|-----BEGIN [A-Z ]*PRIVATE KEY-----)' "$file" || true)"
    if [[ -n "$output" ]]; then
      report "Known key/private material pattern" "$file" "$output"
    fi

    output="$(grep -nEi '([A-Z0-9_]*(token|secret|password|api[_-]?key|access[_-]?key)[A-Z0-9_]*)[[:space:]]*[:=][[:space:]]*["'\''][A-Za-z0-9_\/+=.-]{24,}["'\'']' "$file" || true)"
    if [[ -n "$output" ]]; then
      filtered="$(echo "$output" | grep -v "$APPROVED_SECRET_PLACEHOLDER" || true)"
      if [[ -n "$filtered" ]]; then
        report "Credential-like token assignment" "$file" "$filtered"
      fi
    fi
  done < <(git ls-files -z)
}

check_env_template_placeholders
scan_tracked_files

if [[ "$findings" -gt 0 ]]; then
  echo "[secret-check] FAILED: $findings finding group(s) detected"
  exit 1
fi

echo "[secret-check] PASSED"
