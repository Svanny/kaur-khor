#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-$ROOT_DIR/apps/api/migrations}"

if [[ ! -d "$MIGRATIONS_DIR" ]]; then
  echo "error: migrations directory not found: $MIGRATIONS_DIR" >&2
  exit 1
fi

tmp_versions="$(mktemp)"
trap 'rm -f "$tmp_versions"' EXIT

found_migration=0

while IFS= read -r file; do
  found_migration=1
  basename="$(basename "$file")"
  if [[ ! "$basename" =~ ^([0-9]+)_.+\.sql$ ]]; then
    echo "error: migration filename must match NNNN_description.sql: $basename" >&2
    exit 1
  fi

  version="${BASH_REMATCH[1]}"
  printf '%s\t%s\n' "$version" "$file" >>"$tmp_versions"
done < <(find "$MIGRATIONS_DIR" -maxdepth 1 -type f -name '*.sql' | sort)

if [[ "$found_migration" -ne 1 ]]; then
  echo "error: no migration files found in $MIGRATIONS_DIR" >&2
  exit 1
fi

duplicates="$(
  awk -F '\t' '
    { counts[$1]++; files[$1] = files[$1] sprintf("  - %s\n", $2) }
    END {
      for (version in counts) {
        if (counts[version] > 1) {
          printf "version %s:\n%s", version, files[version];
        }
      }
    }
  ' "$tmp_versions" | sort
)"

if [[ -n "$duplicates" ]]; then
  echo "error: duplicate sqlx migration versions detected" >&2
  printf '%s\n' "$duplicates" >&2
  exit 1
fi

echo "migration versions are unique in $MIGRATIONS_DIR"
