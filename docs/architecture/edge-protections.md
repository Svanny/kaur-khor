# Edge Protections (Cloudflare + App Guardrails)

## Scope
This contract defines ingress hardening for `staging` and `prod`.

- `dev`: direct access allowed by default.
- `staging|prod`: edge-enforced traffic only.

## Locked Runtime Order
Middleware execution order is strict:
1. origin guard
2. request-size limit
3. CORS
4. observability
5. route-specific auth / identity / backpressure / rate limit
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
- Public route key: `{prefix}:{env}:ip:{client_ip}:public-read:{window_start}`.
- Application route keys:
  - user bucket: `{prefix}:{env}:user:{user_id}:{read|write}:{window_start}`
  - device bucket: `{prefix}:{env}:device:{user_id}:{device_id}:{read|write}:{window_start}`
- Application routes use shared read/write buckets, not per-route buckets.
- Controls:
  - `EDGE_RATE_LIMIT_WINDOW_SECONDS`
  - `EDGE_RATE_LIMIT_READ_MAX`
  - `EDGE_RATE_LIMIT_USER_READ_MAX`
  - `EDGE_RATE_LIMIT_USER_WRITE_MAX`
  - `EDGE_RATE_LIMIT_DEVICE_READ_MAX`
  - `EDGE_RATE_LIMIT_DEVICE_WRITE_MAX`
  - `EDGE_RATE_LIMIT_FALLBACK_MAX_KEYS`
  - `EDGE_RATE_LIMIT_KEY_TTL_SECONDS`
  - `EDGE_RATE_LIMIT_REDIS_PREFIX`
  - `EDGE_RATE_LIMIT_FAILOVER_ENABLED`
- `OPTIONS` preflight is not write-throttled.
- Primary enforcement is Redis-backed and shared across API instances.
- If Redis is unavailable and failover is enabled, limiter degrades to per-instance in-memory enforcement.

## Device Identity Contract
- `x-banji-device-id` is required on `/v1/*` requests except `OPTIONS`.
- It identifies an app installation, not a hardware device.
- Recommended client generation: UUIDv4 stored in secure storage and rotated on logout or reinstall.
- The server uses it only as a rate-limit dimension; it is never authentication.

## Backpressure Contract
- Async-producing write routes (`POST /v1/items`, `POST /v1/write-demo`) are rejected with `503` + `Retry-After` when sampled dependency pressure is unhealthy.
- Pressure signals:
  - Rabbit publish pressure via `app.job_outbox` pending count / oldest age
  - worker completion pressure via `app.job_run` queued or retrying count / oldest age
  - Kafka result pressure via `app.job_result` only when `JOB_RESULT_KAFKA_ENABLED=true`
- Hysteresis:
  - `EDGE_BACKPRESSURE_CONSECUTIVE_UNHEALTHY`
  - `EDGE_BACKPRESSURE_CONSECUTIVE_HEALTHY`

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
