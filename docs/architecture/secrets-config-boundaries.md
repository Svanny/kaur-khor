# Secrets and Config Boundaries

## Scope
This document defines which settings are runtime config, which are secrets, and where they are allowed to live.

## Platform Boundary
- Railway is the tracked runtime/deploy platform.
- Runtime secret values belong in Railway service variables or another platform secret manager.
- CI-only secrets belong in GitHub Environment secrets.

## Runtime Secrets
- `DATABASE_RUNTIME_URL`
- `RESTORE_DATABASE_URL`
- `REDIS_URL`
- `RABBIT_URL`
- `RABBIT_MANAGEMENT_USERNAME`
- `RABBIT_MANAGEMENT_PASSWORD`
- `OBJECT_STORAGE_ACCESS_KEY`
- `OBJECT_STORAGE_SECRET_KEY`
- `ALGORITHM_ROLLOUT_HASH_SALT`
- `OTEL_HEADERS`
- `OTEL_EXPORTER_OTLP_HEADERS`
- `EDGE_ORIGIN_AUTH_SECRET`
- `EDGE_ORIGIN_AUTH_SECRET_NEXT`
- integration secrets such as payment, email, or messaging provider keys

## CI/Deploy Secrets
- `DATABASE_MIGRATION_URL`
- Railway authentication material used by automation
- GitHub-side publishing credentials

## Runtime Config
- `AUTH_*` controls
- SQLx pool settings
- event relay and projection-consumer settings
- worker runtime settings
- object storage non-secret settings
- `EDGE_*` controls except the origin auth secrets
- OTel non-secret configuration

## Least Privilege Rules
- `api` must not receive object-storage secrets.
- `event-relay` and `projection-consumer` must not receive Rabbit, object-storage, or auth secrets.
- `worker` must not receive auth secrets.
- No runtime role may receive `DATABASE_MIGRATION_URL`.

## Edge Contract
- Edge enforcement is an application runtime concern, not an external provider contract.
- Trusted forwarded client IP is controlled by `EDGE_TRUST_FORWARDED_CLIENT_IP`.
- Deprecated Cloudflare-specific keys are not supported.
