# Secrets Management and Config Boundaries

## Scope
This contract defines how Banji handles secrets in the current phase:
- platform secrets now (Railway runtime + GitHub Environment secrets for CI/deploy),
- no dedicated external secret manager yet,
- strict separation between secret and non-secret config.

## Secret vs Non-Secret Configuration

Secret values must never be committed and must be provided by platform secret stores only.

Secret keys:
- `DATABASE_RUNTIME_URL`
- `DATABASE_MIGRATION_URL` (migration step only)
- `REDIS_URL`
- `RABBIT_URL`
- `OBJECT_STORAGE_ACCESS_KEY`
- `OBJECT_STORAGE_SECRET_KEY`
- `OTEL_HEADERS` (when credential-bearing)
- integration-specific credentials (for example `STRIPE_API_KEY`, `SENDGRID_API_KEY`)

Non-secret keys:
- `BANJI_*`
- `CACHE_*`
- `REDIS_*` timeout/circuit controls
- `RABBIT_*` topology/retry/prefetch controls (except `RABBIT_URL`)
- `EVENT_PAYLOAD_MAX_BYTES`
- bind/log-level/runtime flags

## Tracked Template Policy

Tracked env templates (`config/env/*.env`) may contain only:
- `__SET_IN_PLATFORM_SECRET__`, or
- empty value (only where explicitly documented as optional).

Any concrete credential-like value in tracked templates is a policy violation.

## Least-Privilege Secret Matrix (Current + Near-Term Services)

- `api`
  - `DATABASE_RUNTIME_URL`
  - optional `REDIS_URL`
  - optional `RABBIT_URL`
  - required integration secrets
  - optional telemetry auth secrets
- `worker`
  - `DATABASE_RUNTIME_URL`
  - `RABBIT_URL`
  - optional `REDIS_URL`
  - required integration secrets
  - optional telemetry auth secrets
- `scheduler`
  - minimal `RABBIT_URL`
  - scheduler-specific integration secrets only
  - optional telemetry auth secrets
- `projection-consumer`
  - `DATABASE_RUNTIME_URL`
  - optional telemetry auth secrets
- `outbox-relay` (current phase)
  - `DATABASE_RUNTIME_URL`
  - optional telemetry auth secrets
  - no `RABBIT_URL` by default unless explicitly repurposed

CI/deploy migration step only:
- `DATABASE_MIGRATION_URL`

Runtime services must never receive `DATABASE_MIGRATION_URL`.

## Logging and Redaction Contract

No secrets in logs. Redaction is enforced in two layers:

1) Explicit sensitive key/header handling:
- `*PASSWORD*`, `*SECRET*`, `*TOKEN*`, `*API_KEY*`, `*ACCESS_KEY*`
- `*AUTHORIZATION*`, `COOKIE`, `SET-COOKIE`
- exact configured secret env var names

2) URL credential stripping:
- redact `scheme://user:pass@host` as `scheme://***:***@host`

This applies to structured fields and free-form error strings.

## Rotation Contract

Default rotation:
1. rotate secret in platform store
2. restart only affected service deployment(s)
3. verify health and dependency connectivity

No full-environment redeploy is required.

Dual-mode overlap (auth/verify secrets only):
- maintain active + previous (or next) verification key set,
- sign with active key id,
- verify with overlap set until expiry window closes,
- remove old key after cutover window.

## Audit vs Operational Logging

Operational runtime logs are platform-sink first (Railway/log drain), not Postgres-primary.

Postgres stores audit stream events for replay/accountability (`app.event_log` contract), not high-volume operational log traffic.
