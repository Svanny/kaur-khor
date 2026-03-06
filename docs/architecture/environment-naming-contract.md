# Environment Map and Naming Contract

## Purpose
This contract defines canonical naming across `dev`, `staging`, and `prod`. It is stable by default and changed only via ADR/change record approval.

## Base Variables (Authoritative)
- `BANJI_SYSTEM=banji-core`
- `BANJI_ENV=dev|staging|prod`
- `BANJI_REGION=sg-sin` (default)
- `BANJI_TENANT=default` (reserved; not used as infra namespace by default)
- `BANJI_DEPLOYMENT_ID=<build/release id>`

## Canonical Token Forms
- `kebab_token`: lowercase letters, digits, hyphens only; no leading/trailing hyphen; no repeated hyphens.
- `snake_token`: lowercase letters, digits, underscores only; derived from kebab via `- -> _`.
- Normalization is contract-defined and deterministic. No team-specific sanitizers are allowed.

## Resource Naming Formulas
- Service name: `{system_kebab}-{env_kebab}-{region_kebab}-{service_kebab}`
- Postgres database: `{system_snake}_{env_snake}_{region_snake}_{db_snake}`
- Secret path: `{system_kebab}/{env_kebab}/{region_kebab}/{scope}/{key}`
- Redis key prefix: `{system_kebab}:{env_kebab}:{service_kebab}:{cache_schema_version}:{domain}`
- Kafka topic: `{system_kebab}.{env_kebab}.{topic_kebab}`
- Kafka consumer group: `{system_kebab}.{env_kebab}.{service_kebab}.{consumer_kebab}`
- Rabbit exchange: `{system_kebab}.{env_kebab}.{exchange_kebab}`
- Rabbit queue: `{system_kebab}.{env_kebab}.{queue_kebab}`
- Rabbit routing key: `{domain}.{event}`
- Rabbit dead-letter queue: `{queue_name}.dlq`
- Object storage bucket: `{system_kebab}-{env_kebab}-{region_kebab}-{bucket_kebab}`
- Object storage prefix template: `{service_kebab}/{yyyy}/{mm}/{dd}/`
- Metrics namespace: `{system_kebab}.{env_kebab}`
- Tracing service name: same as service name
- Log stream key: `{system_kebab}/{env_kebab}/{region_kebab}/{service_kebab}/{channel}`
- Deployment correlation: `BANJI_DEPLOYMENT_ID` is attached to logs/metrics/traces/events.

Redis key examples:
- `banji-core:dev:api:v1:cache:inventory:item:123`
- `banji-core:prod:worker:v1:coord:lock:projection:abc`

## Environment Map
Defaults:
- `dev`: `BANJI_ENV=dev`, `BANJI_REGION=sg-sin`
- `staging`: `BANJI_ENV=staging`, `BANJI_REGION=sg-sin`
- `prod`: `BANJI_ENV=prod`, `BANJI_REGION=sg-sin`

Examples:
- Service `api` in `prod`:
  - `banji-core-prod-sg-sin-api`
- Postgres app DB in `staging`:
  - `banji_core_staging_sg_sin_app`
- Kafka topic `inventory-updated` in `dev`:
  - `banji-core.dev.inventory-updated`
- Kafka consumer group for ranking projector in `prod`:
  - `banji-core.prod.worker.ranking-projector`
- Rabbit queue `stock-update-jobs` in `staging`:
  - `banji-core.staging.stock-update-jobs`
  - DLQ: `banji-core.staging.stock-update-jobs.dlq`
- Rabbit workload-class queues in `prod`:
  - `banji-core.prod.fast-jobs` (DLQ: `banji-core.prod.fast-jobs.dlq`)
  - `banji-core.prod.heavy-jobs` (DLQ: `banji-core.prod.heavy-jobs.dlq`)

## Messaging and Schema Rules
- Region is not encoded in Kafka topic or RabbitMQ queue names. Region isolation is provided by cluster/vhost identity.
- Topic names do not encode schema version.
- Payload schemas evolve with backward compatibility by default.

## Tenancy Rule
- `tenant_id` is modeled in payload/database data.
- Tenant is not an infrastructure naming dimension unless separately approved by architecture decision.

## Service Registry (Controlled and Extensible)
Initial service ids:
- `api`
- `event-relay`
- `projection-consumer`
- `worker`
- `scheduler`

Adding service ids (for example `outbox-relay`, `projection-consumer`, `worker-batch`) requires a contract update via ADR/change record. Naming formulas remain unchanged.

## Secrets Contract
Shared infrastructure secret scopes:
- `postgres/url`, `postgres/username`, `postgres/password`
- `kafka/bootstrap-servers`, `kafka/sasl-username`, `kafka/sasl-password`
- `rabbit/host`, `rabbit/username`, `rabbit/password`, `rabbit/vhost`
- `redis/url`, `object-storage/access-key`, `object-storage/secret-key`
- `otel/endpoint`, `otel/headers`

Service-specific external secrets:
- Must be integration-specific (for example `stripe/api-key`, `sendgrid/api-key`), never generic names.

Tracked env templates must never contain real secrets. Secret-valued keys in templates may only be `__SET_IN_PLATFORM_SECRET__` or empty when explicitly allowed.

Least-privilege access matrix (current + near-term):
- `api`: `DATABASE_RUNTIME_URL`, optional `REDIS_URL`, optional `RABBIT_URL`, required API integration secrets, optional telemetry auth.
- `worker`: `DATABASE_RUNTIME_URL`, `RABBIT_URL`, optional `REDIS_URL`, required worker integration secrets, optional telemetry auth.
- `scheduler`: minimal `RABBIT_URL`, scheduler-specific integration secrets, optional telemetry auth.
- `projection-consumer`: `DATABASE_RUNTIME_URL`, optional telemetry auth.
- `outbox-relay` (current phase): `DATABASE_RUNTIME_URL`, optional telemetry auth. `RABBIT_URL` only if explicitly repurposed.
- CI/deploy migration step only: `DATABASE_MIGRATION_URL`.

Runtime services must not receive `DATABASE_MIGRATION_URL`.

No wildcard secret-read grant is allowed unless explicitly approved.
