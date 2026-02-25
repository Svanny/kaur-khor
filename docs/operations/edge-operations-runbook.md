# Edge Operations Runbook

## Purpose
Operate Cloudflare front-door controls safely for `staging` and `prod`.

## Preconditions
- Domain is proxied by Cloudflare.
- Railway origin is only reachable through Cloudflare path.
- Required secrets are set:
  - `CLOUDFLARE_API_TOKEN`
  - `CLOUDFLARE_ZONE_ID`
  - `EDGE_ORIGIN_AUTH_SECRET`

## Dry-Run First
```bash
bash tool/edge/cloudflare_apply.sh --env staging --zone-id "$CLOUDFLARE_ZONE_ID" --dry-run
```

## Apply
```bash
bash tool/edge/cloudflare_apply.sh --env staging --zone-id "$CLOUDFLARE_ZONE_ID"
```

This updates zone TLS settings, refreshes fingerprint IDs, and runs verification.

## Verify Only
```bash
bash tool/edge/cloudflare_verify.sh --env staging --zone-id "$CLOUDFLARE_ZONE_ID"
```

## Secret Rotation (Origin Header)
1. Set `EDGE_ORIGIN_AUTH_SECRET_NEXT` in runtime secrets.
2. Deploy.
3. Update Cloudflare header injection to new value.
4. Move new value into `EDGE_ORIGIN_AUTH_SECRET`.
5. Clear `EDGE_ORIGIN_AUTH_SECRET_NEXT` after cutover.

## Failure Triage
1. If verify fails, stop rollout.
2. Inspect Cloudflare setting drift (TLS mode, always-use-https, phase ruleset IDs).
3. Re-run apply with explicit env/zone.
4. Re-run verify before any deploy retry.

## Safety Notes
- Never infer zone IDs from hostnames in scripts.
- Never run apply without explicit `--env` and `--zone-id`.
- Keep fingerprint files updated after intentional Cloudflare rule changes.
