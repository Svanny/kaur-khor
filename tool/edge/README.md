# Cloudflare Edge Tooling

This folder contains deterministic Cloudflare apply/verify scripts for `staging` and `prod` edge controls.

## Scripts

- `tool/edge/cloudflare_apply.sh`
  - requires explicit `--env` and `--zone-id`
  - supports `--dry-run`
  - applies idempotent zone settings (`ssl=strict`, `always_use_https=on`)
  - captures phase entrypoint ruleset IDs and writes fingerprint file
  - runs immediate verification

- `tool/edge/cloudflare_verify.sh`
  - validates zone settings (`ssl=strict`, `always_use_https=on`)
  - validates phase entrypoint ruleset IDs against fingerprint file
  - fails non-zero on any missing/mismatched control

## Fingerprints

- `tool/edge/fingerprints/staging.json`
- `tool/edge/fingerprints/prod.json`

These files are source-controlled references for deterministic verification.
Run `cloudflare_apply.sh` to refresh with current rule IDs.

## Required Environment

- `CLOUDFLARE_API_TOKEN` (secret)
- Optional: `CLOUDFLARE_API_BASE`

## Example

```bash
bash tool/edge/cloudflare_apply.sh --env staging --zone-id "$CLOUDFLARE_ZONE_ID" --dry-run
```

```bash
bash tool/edge/cloudflare_apply.sh --env staging --zone-id "$CLOUDFLARE_ZONE_ID"
```

```bash
bash tool/edge/cloudflare_verify.sh --env staging --zone-id "$CLOUDFLARE_ZONE_ID"
```
