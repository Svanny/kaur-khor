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
- API writes canonical data and outbox record in the same DB transaction.
- Relay publishes outbox rows to RabbitMQ with confirms and marks sent only after confirm.

## Workload Classes and Queue Topology
Default classes:
- `fast-jobs` (higher prefetch)
- `heavy-jobs` (low prefetch)

Per class:
- primary queue
- retry.1 / retry.2 / retry.3 queues (30s / 5m / 30m)
- dead-letter queue (`.dlq`)

Queue type: quorum, durable.

## Attempt and Error Taxonomy
- Attempt count in envelope (`attempt`) is primary retry source-of-truth.
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

## Prefetch Policy
Per-class prefetch settings:
- fast: `RABBIT_PREFETCH_FAST` (default 20)
- heavy: `RABBIT_PREFETCH_HEAVY` (default 2)

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
