# Edge Protections

This backend keeps edge protections inside the application runtime. The API process owns ingress validation and request shaping regardless of how the service is started locally.

## Enforcement Model
- `EDGE_ENFORCEMENT_ENABLED=true` enables origin-guard enforcement.
- The guard checks `EDGE_ORIGIN_AUTH_HEADER_NAME` against `EDGE_ORIGIN_AUTH_SECRET` and optional `EDGE_ORIGIN_AUTH_SECRET_NEXT`.
- In `staging` and `prod`, origin auth and explicit `EDGE_CORS_ALLOWED_ORIGINS` are required.
- Keycloak/OIDC validation is a separate layer; Keycloak does not replace the origin-guard secret.

## Middleware Order
- origin guard
- request size limits
- rate limiting
- CORS
- observability
- handlers

## Client Identity
- Trusted client IP forwarding is controlled by `EDGE_TRUST_FORWARDED_CLIENT_IP`.
- When disabled, rate limiting falls back to the peer socket identity.
- When enabled, forwarded client IP is read from the first hop in `X-Forwarded-For`.
- Forwarded client IP is trusted only after origin guard succeeds.

## Rate Limiting
- Shared API rate limiting uses Redis when available.
- Redis incidents may degrade to per-instance fallback when `EDGE_RATE_LIMIT_FAILOVER_ENABLED=true`.
- Rate-limit keys must use matched route templates rather than raw paths or query strings.

## Backpressure
- API backpressure can reject new async-producing writes before DB work starts.
- Thresholds are controlled by the `EDGE_BACKPRESSURE_*` settings.

## CORS and Request Size
- `EDGE_CORS_ALLOWED_ORIGINS` must be explicit `https://` origins in `staging` and `prod`.
- `EDGE_WRITE_REQUEST_MAX_BYTES` must not exceed `EDGE_REQUEST_MAX_BYTES`.

## Operational Boundary
- No Cloudflare-specific apply or verification tooling remains in the tracked contract.
- Deployment wiring is out of scope for this contract; edge protections are application-local behavior.
