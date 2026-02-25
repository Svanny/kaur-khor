# Edge Protections (Cloudflare + App Guardrails)

## Scope
This contract defines ingress hardening for `staging` and `prod`.

- `dev`: direct access allowed by default.
- `staging|prod`: edge-enforced traffic only.

## Locked Runtime Order
Middleware execution order is strict:
1. origin guard
2. request-size limit
3. rate limit
4. CORS
5. observability
6. handlers

## Origin Guard Contract
- Header name: `EDGE_ORIGIN_AUTH_HEADER_NAME` (default `x-banji-edge-auth`).
- Allowed secrets:
  - `EDGE_ORIGIN_AUTH_SECRET`
  - `EDGE_ORIGIN_AUTH_SECRET_NEXT` (rotation overlap)
- In `staging|prod`:
  - missing/mismatch => `403`
  - `x-forwarded-proto=http` => `400` (misconfiguration)

## Forwarded IP Trust Contract
- `CF-Connecting-IP` is trusted only when:
  - origin guard passed, and
  - `EDGE_TRUST_CF_CONNECTING_IP=true`.
- Otherwise limiter uses socket peer IP and ignores forwarded IP headers.

## Request Size Contract
- Global cap: `EDGE_REQUEST_MAX_BYTES` (default `262144`, 256KB).
- Write cap: `EDGE_WRITE_REQUEST_MAX_BYTES` (default `65536`, 64KB).
- Streaming cap applies even when `Content-Length` is missing.
- If a path cannot enforce cap safely, request must be rejected.

## Rate Limiter Contract
- Key: `{client_ip}:{method}:{matched_route}`.
- Route key uses templated route (`MatchedPath`), never raw path/query.
- Controls:
  - `EDGE_RATE_LIMIT_WINDOW_SECONDS`
  - `EDGE_RATE_LIMIT_READ_MAX`
  - `EDGE_RATE_LIMIT_WRITE_MAX`
  - `EDGE_RATE_LIMIT_MAX_KEYS`
  - `EDGE_RATE_LIMIT_KEY_TTL_SECONDS`
- `OPTIONS` preflight is not write-throttled.
- Key map is bounded and evicts oldest idle entries at cap.

## CORS Contract
- Explicit allowlist only: `EDGE_CORS_ALLOWED_ORIGINS`.
- `staging|prod` validation:
  - must be `https://` origins only
  - must not include localhost
- CORS is browser policy only; it is not authentication.

## TLS/Proto Contract
- Cloudflare mode: `Full (strict)`.
- Origin must receive HTTPS traffic.
- Guarded traffic with `x-forwarded-proto=http` is rejected.

## Cloudflare Apply/Verify Contract
Scripts:
- `tool/edge/cloudflare_apply.sh`
- `tool/edge/cloudflare_verify.sh`

Rules:
- explicit `--env` and `--zone-id` are mandatory
- `--dry-run` is mandatory capability
- apply is idempotent
- verify runs immediately after apply
- fingerprint IDs are stored in:
  - `tool/edge/fingerprints/staging.json`
  - `tool/edge/fingerprints/prod.json`
