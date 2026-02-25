#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIGRATIONS_DIR="${1:-$ROOT_DIR/apps/api/migrations}"
ENFORCE_RISK_MARKERS="${ENFORCE_RISK_MARKERS:-false}"

if [[ ! -d "$MIGRATIONS_DIR" ]]; then
  echo "error: migrations directory not found: $MIGRATIONS_DIR" >&2
  exit 1
fi

shopt -s nullglob
migration_files=("$MIGRATIONS_DIR"/*.sql)
shopt -u nullglob

if [[ ${#migration_files[@]} -eq 0 ]]; then
  echo "error: no migration files found in $MIGRATIONS_DIR" >&2
  exit 1
fi

high_risk=()
missing_marker=()

for file in "${migration_files[@]}"; do
  marker_line="$(grep -E '^-- @risk:(low|high)$' "$file" | head -n 1 || true)"
  if [[ -z "$marker_line" ]]; then
    missing_marker+=("$(basename "$file")")
    continue
  fi

  level="${marker_line##*:}"
  if [[ "$level" == "high" ]]; then
    high_risk+=("$(basename "$file")")
  fi
done

echo "risk marker scan: ${#migration_files[@]} migration file(s)"

echo "high-risk migrations (${#high_risk[@]}):"
if [[ ${#high_risk[@]} -eq 0 ]]; then
  echo "- none"
else
  for file in "${high_risk[@]}"; do
    echo "- $file"
  done
fi

if [[ ${#missing_marker[@]} -gt 0 ]]; then
  echo "missing risk markers (${#missing_marker[@]}):" >&2
  for file in "${missing_marker[@]}"; do
    echo "- $file" >&2
  done

  if [[ "$ENFORCE_RISK_MARKERS" == "true" ]]; then
    echo "error: enforce mode enabled and one or more migration files are missing -- @risk markers" >&2
    exit 1
  fi
fi
