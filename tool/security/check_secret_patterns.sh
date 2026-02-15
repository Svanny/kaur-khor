#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

findings=0

skip_file() {
  local file="$1"
  case "$file" in
    tool/security/check_secret_patterns.sh) return 0 ;;
    docs/security/*) return 0 ;;
  esac
  return 1
}

report_matches() {
  local label="$1"
  local file="$2"
  local pattern="$3"
  local grep_args="$4"

  local output
  if [[ "$grep_args" == "i" ]]; then
    output="$(grep -nEi -- "$pattern" "$file" || true)"
  else
    output="$(grep -nE -- "$pattern" "$file" || true)"
  fi

  if [[ -n "$output" ]]; then
    findings=$((findings + 1))
    echo "[secret-check] $label in $file"
    echo "$output"
  fi
}

while IFS= read -r -d '' file; do
  if skip_file "$file"; then
    continue
  fi
  if [[ ! -f "$file" ]]; then
    continue
  fi
  if ! grep -Iq . "$file"; then
    continue
  fi

  report_matches "AWS access key" "$file" 'AKIA[0-9A-Z]{16}' ''
  report_matches "Google API key" "$file" 'AIza[0-9A-Za-z_-]{35}' ''
  report_matches "Private key material" "$file" '-----BEGIN [A-Z ]*PRIVATE KEY-----' ''
  report_matches \
    "Credential-like assignment" \
    "$file" \
    "(api[_-]?key|client[_-]?secret|secret|password|access[_-]?token|refresh[_-]?token|bearer[_-]?token)[[:space:]]*[:=][[:space:]]*['\\\"][^'\\\"]{8,}['\\\"]" \
    'i'
done < <(git ls-files -z)

if [[ "$findings" -gt 0 ]]; then
  echo "[secret-check] FAILED: $findings finding group(s) detected"
  exit 1
fi

echo "[secret-check] PASSED"
