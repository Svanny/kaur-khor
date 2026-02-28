#!/usr/bin/env bash
set -euo pipefail

PSQL_BIN="${PSQL_BIN:-psql}"

usage() {
  cat <<'EOF'
Usage:
  tool/db/algorithm_rollout.sh show --job-type <job_type>
  tool/db/algorithm_rollout.sh set --job-type <job_type> --stable <ver> --candidate <ver|empty> --percent <0-100> --updated-by <actor> [--notes <text>] [--force]
EOF
}

if [[ -z "${DATABASE_RUNTIME_URL:-}" ]]; then
  echo "error: DATABASE_RUNTIME_URL is required" >&2
  exit 1
fi

if [[ $# -lt 1 ]]; then
  usage >&2
  exit 1
fi

command="$1"
shift

job_type=""
stable_version=""
candidate_version=""
candidate_percent=""
updated_by=""
notes=""
force="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --job-type)
      job_type="${2:-}"
      shift 2
      ;;
    --stable)
      stable_version="${2:-}"
      shift 2
      ;;
    --candidate)
      candidate_version="${2:-}"
      shift 2
      ;;
    --percent)
      candidate_percent="${2:-}"
      shift 2
      ;;
    --updated-by)
      updated_by="${2:-}"
      shift 2
      ;;
    --notes)
      notes="${2:-}"
      shift 2
      ;;
    --force)
      force="true"
      shift
      ;;
    *)
      echo "error: unknown argument '$1'" >&2
      usage >&2
      exit 1
      ;;
  esac
done

case "$job_type" in
  item-created|write-demo) ;;
  *)
    echo "error: --job-type must be one of: item-created, write-demo" >&2
    exit 1
    ;;
esac

sql_escape() {
  printf "%s" "$1" | sed "s/'/''/g"
}

fetch_row() {
  "$PSQL_BIN" "$DATABASE_RUNTIME_URL" -At -F '|' -c \
    "SELECT stable_version, COALESCE(candidate_version, ''), candidate_percent FROM app.job_algorithm_rollout_policy WHERE job_type = '$(sql_escape "$job_type")';"
}

case "$command" in
  show)
    fetch_row
    ;;
  set)
    if [[ -z "$stable_version" ]]; then
      echo "error: --stable is required" >&2
      exit 1
    fi
    if [[ -z "$updated_by" ]]; then
      echo "error: --updated-by is required" >&2
      exit 1
    fi
    if [[ ! "$candidate_percent" =~ ^[0-9]+$ ]] || (( candidate_percent < 0 || candidate_percent > 100 )); then
      echo "error: --percent must be an integer between 0 and 100" >&2
      exit 1
    fi

    current_row="$(fetch_row)"
    current_percent=0
    if [[ -n "$current_row" ]]; then
      current_percent="$(printf '%s' "$current_row" | awk -F'|' '{print $3}')"
    fi

    jump=$(( candidate_percent - current_percent ))
    if (( jump < 0 )); then
      jump=$(( -jump ))
    fi
    if (( jump > 25 )) && [[ "$force" != "true" ]]; then
      echo "error: rollout percent jump greater than 25 requires --force" >&2
      exit 1
    fi

    if [[ -z "$candidate_version" ]]; then
      candidate_sql="NULL"
    else
      candidate_sql="'$(sql_escape "$candidate_version")'"
    fi

    if [[ -z "$notes" ]]; then
      notes_sql="NULL"
    else
      notes_sql="'$(sql_escape "$notes")'"
    fi

    "$PSQL_BIN" "$DATABASE_RUNTIME_URL" -c "
      INSERT INTO app.job_algorithm_rollout_policy (
        job_type,
        stable_version,
        candidate_version,
        candidate_percent,
        updated_by,
        notes,
        updated_at
      ) VALUES (
        '$(sql_escape "$job_type")',
        '$(sql_escape "$stable_version")',
        $candidate_sql,
        $candidate_percent,
        '$(sql_escape "$updated_by")',
        $notes_sql,
        NOW()
      )
      ON CONFLICT (job_type)
      DO UPDATE SET
        stable_version = EXCLUDED.stable_version,
        candidate_version = EXCLUDED.candidate_version,
        candidate_percent = EXCLUDED.candidate_percent,
        updated_by = EXCLUDED.updated_by,
        notes = EXCLUDED.notes,
        updated_at = NOW();
    " >/dev/null

    echo "current:"
    printf '%s\n' "${current_row:-<none>}"
    echo "updated:"
    fetch_row
    ;;
  *)
    echo "error: command must be 'show' or 'set'" >&2
    usage >&2
    exit 1
    ;;
esac
