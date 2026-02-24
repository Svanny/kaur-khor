# Secret Rotation Runbook

## Scope
This runbook covers routine secret rotation for Banji services.

## Inputs
- target environment (`dev`, `staging`, `prod`)
- target secret name(s)
- affected service(s)
- change window and rollback owner

## A) Default Rotation (Rolling Restart)

Use this for infrastructure credentials (DB/Redis/Rabbit/object storage/telemetry auth unless noted otherwise).

1. Update secret in platform store.
2. Restart only affected service deployment(s).
3. Validate:
   - service health endpoint,
   - dependency connectivity,
   - no auth/connection error spike in platform logs.
4. Record rotation event:
   - environment
   - service
   - secret name
   - operator
   - timestamp

Rollback:
- restore previous secret value and restart affected service(s).

## B) Dual-Mode Rotation (Auth/Verification Secrets Only)

Use this for JWT/webhook verification style keys.

1. Publish new key as `CURRENT`; retain old as `PREVIOUS`.
2. Sign with `CURRENT` key id.
3. Verify against `{CURRENT, PREVIOUS}` set.
4. After max token/webhook TTL window:
   - remove `PREVIOUS`.
5. Confirm no verification failures attributable to key mismatch.

## Guardrails
- Never commit rotated values to repository files.
- Never log secret values during rotation.
- Runtime services must not be granted `DATABASE_MIGRATION_URL`.
- `DATABASE_MIGRATION_URL` is migration-step-only in CI/deploy.

## Verification Checklist
- [ ] Health checks pass
- [ ] No dependency auth/connect errors beyond baseline
- [ ] Secret scan gate still passes
- [ ] Access matrix unchanged except intended target
