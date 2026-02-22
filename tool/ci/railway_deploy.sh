#!/usr/bin/env bash
set -euo pipefail

required=(RAILWAY_TOKEN RAILWAY_PROJECT_ID RAILWAY_SERVICE_ID IMAGE_REF)
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

npm install -g @railway/cli >/dev/null

# Railway must be configured to deploy from external GHCR image.
# This command updates runtime variables and triggers a redeploy.
railway login --token "$RAILWAY_TOKEN"
railway variables --set "IMAGE_REF=$IMAGE_REF" --service "$RAILWAY_SERVICE_ID" --project "$RAILWAY_PROJECT_ID"
railway redeploy --service "$RAILWAY_SERVICE_ID" --project "$RAILWAY_PROJECT_ID" --yes
