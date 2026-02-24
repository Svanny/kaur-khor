#!/usr/bin/env bash
set -euo pipefail

required=(
  RAILWAY_TOKEN
  RAILWAY_PROJECT_ID
  RAILWAY_SERVICE_ID
  IMAGE_REF
  DATABASE_RUNTIME_ENDPOINT_KIND
  PGBOUNCER_POOL_MODE
)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "error: $name is required" >&2
    exit 1
  fi
done

if [[ ! "$IMAGE_REF" =~ @sha256:[a-f0-9]{64}$ ]]; then
  echo "error: IMAGE_REF must be digest pinned" >&2
  exit 1
fi

if [[ "$DATABASE_RUNTIME_ENDPOINT_KIND" != "pgbouncer" ]]; then
  echo "error: DATABASE_RUNTIME_ENDPOINT_KIND must be pgbouncer for deploy targets" >&2
  exit 1
fi

if [[ "$PGBOUNCER_POOL_MODE" != "transaction" ]]; then
  echo "error: PGBOUNCER_POOL_MODE must be transaction for deploy targets" >&2
  exit 1
fi

npm install -g @railway/cli >/dev/null

# Railway must be configured to deploy from external GHCR image.
# This command updates runtime variables and triggers a redeploy.
railway login --token "$RAILWAY_TOKEN"
railway variables --set "IMAGE_REF=$IMAGE_REF" --service "$RAILWAY_SERVICE_ID" --project "$RAILWAY_PROJECT_ID"
railway variables --set "DATABASE_RUNTIME_ENDPOINT_KIND=$DATABASE_RUNTIME_ENDPOINT_KIND" --service "$RAILWAY_SERVICE_ID" --project "$RAILWAY_PROJECT_ID"
railway variables --set "PGBOUNCER_POOL_MODE=$PGBOUNCER_POOL_MODE" --service "$RAILWAY_SERVICE_ID" --project "$RAILWAY_PROJECT_ID"
railway redeploy --service "$RAILWAY_SERVICE_ID" --project "$RAILWAY_PROJECT_ID" --yes
