# RabbitMQ Job Queues

## Scope
RabbitMQ is the current async job transport. Kafka remains optional/future.

## Reliability Contract
- Publisher confirms are mandatory for API direct publish and worker retry/DLQ republish.
- On worker failure path:
  1. publish to retry/DLQ destination
  2. wait for broker confirm
  3. only then ack original message
- Never ack original before confirmed handoff.

## Postgres Canonical Outbox
- `app.job_outbox` is canonical enqueue intent/audit.
- API/consumers write canonical data, `app.job_run`, and `app.job_outbox` in the same DB transaction.
- Relay publishes outbox rows to RabbitMQ with confirms and marks sent only after confirm.

## Deterministic Job Identity
- `job_key` is the canonical logical job identity.
- In `app.job_outbox`, the persisted column name remains `enqueue_key`, but the value is the `job_key`.
- `job_key` is derived from:
  - `producer_service`
  - `job_type`
  - `aggregate_type`
  - `aggregate_id`
  - `causation_id`
- Current derivation:
  - `sha256("{producer_service}|{job_type}|{aggregate_type}|{aggregate_id}|{causation_id}")`
- Request-sourced jobs use the request `idempotency_key` as `causation_id`.

## Workload Classes and Queue Topology
Default classes:
- `fast-jobs` (higher prefetch)
- `heavy-jobs` (low prefetch)

Per class:
- primary queue
- retry.1 / retry.2 / retry.3 queues (30s / 5m / 30m)
- dead-letter queue (`.dlq`)

Queue type: quorum, durable.

## Accountable Run Tables
- `app.job_run`: logical job lifecycle (`queued`, `running`, `retrying`, `succeeded`, `failed`)
- `app.job_run_attempt`: one row per explicit attempt number with lease/heartbeat state
- `app.job_result`: successful typed result payload keyed by `job_key`
- `app.job_delivery_violation`: orphan or invalid deliveries such as `missing_job_run`

Worker contract:
- worker must not silently create `job_run`
- if a Rabbit delivery arrives with no matching `job_run`, record `missing_job_run` and DLQ it
- result rows are idempotent by `job_key`

## Attempt and Error Taxonomy
- Attempt count in envelope (`attempt`) is primary retry source-of-truth.
- Attempt means total tries including the first execution.
- With the current ladder, `RABBIT_MAX_ATTEMPTS=4` means:
  - first try `attempt=1`
  - retries `attempt=2,3,4`
- Attempt increments only when worker code makes an explicit routing decision.
- RabbitMQ redelivery alone must not increment attempts.
- `x-death` is advisory/diagnostic.
- Permanent errors (schema/domain impossible/missing required immutable refs): direct DLQ.
- Transient errors: retry ladder then DLQ.
- Error reason codes:
  - `schema_invalid`
  - `missing_required_ref`
  - `impossible_domain_state`
  - `dependency_timeout`
  - `dependency_unavailable`
  - `unknown_transient`
  - `unknown_permanent`
  - `missing_job_run`

## Worker Duplicate-Delivery Safety
- Duplicate deliveries are expected.
- Worker claims a lightweight attempt lease in `app.job_run_attempt`.
- If another worker already holds a fresh lease for the same `(job_key, attempt)`, the duplicate delivery must not compute and is requeued without incrementing attempt.
- If a worker crashes and the lease expires, another worker may steal the lease and continue.
- If a job already succeeded, redelivery is acknowledged without recomputing.

## Worker Artifact Storage
- Workers may produce heavy artifacts for some job types.
- Artifact bytes must not be stored in `app.job_result.payload`.
- Current artifact producer:
  - `write-demo` emits result `v2` summary fields in Postgres and stores the full report in S3-compatible object storage.
- Artifact metadata is persisted only after upload verification succeeds.
- Upload contract is `HEAD`-first:
  - existing object with matching `sha256` + content length => reuse
  - existing mismatch at the deterministic key => hard failure
  - missing object => upload then `HEAD` verify

## Prefetch Policy
Per-class prefetch settings:
- fast: `RABBIT_PREFETCH_FAST` (default 20)
- heavy: `RABBIT_PREFETCH_HEAVY` (default 2)
- replay fast: `RABBIT_REPLAY_PREFETCH_FAST` (default 5)
- replay heavy: `RABBIT_REPLAY_PREFETCH_HEAVY` (default 1)

## Replay Tooling
Replay uses RabbitMQ Management HTTP API.
- default mode is copy-first: replay publishes copies and leaves DLQ originals intact
- cleanup/removal is a separate explicit operator step and must be scoped by replay id
- replay guardrails:
  - source queue must match `*.dlq`
  - `BANJI_ENV` must be set
  - target exchange must be allowlisted (replay exchange default)
  - hard cap + rate limit are mandatory
  - fail fast on first unrouted publish
- replay marker headers:
  - `x-replayed=true`
  - `x-replay-id`
  - `x-replay-operator`
  - `x-replay-reason`
  - `x-replayed-at`
- configuration names are locked to `RABBIT_REPLAY_*` variables
- legacy replay variable names are rejected by tooling to prevent drift

## Replay Choke-Point Topology
- Replay exchange: `{system}.{env}.jobs.replay`
- Replay queues:
  - `{system}.{env}.fast-jobs.replay`
  - `{system}.{env}.heavy-jobs.replay`
- Replay routing keys:
  - `job.fast.replay`
  - `job.heavy.replay`
- Replay consumers should run with lower prefetch/concurrency than primary queues.

## Operational Metrics
Track per class:
- primary/retry/DLQ depth
- consumer throughput and failures
- publish confirm failures
- replay actions (who/why/when)
- worker run totals/duration by `job_type` and `workload_class`
- duplicate-detected and lease-steal counts
- last-error totals by bounded `error_reason`

## API Backpressure Integration
- API write backpressure does not poll RabbitMQ on the request path.
- The API samples Postgres-observable publish health from `app.job_outbox` and completion health from `app.job_run`.
- High `job_outbox` pending/age indicates publish-to-Rabbit degradation.
- High `job_run` queued/retrying pending/age indicates workers are not draining work quickly enough.
