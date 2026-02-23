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
- `x-death` is advisory/diagnostic.
- Permanent errors (schema/domain impossible/missing required immutable refs): direct DLQ.
- Transient errors: retry ladder then DLQ.

## Prefetch Policy
Per-class prefetch settings:
- fast: `RABBIT_PREFETCH_FAST` (default 20)
- heavy: `RABBIT_PREFETCH_HEAVY` (default 2)

## Replay Tooling
Replay uses RabbitMQ Management HTTP API.
- record operator id, reason, replay timestamp
- enforce max batch size and replay rate limit
- optional retain/reset attempt behavior (default retain)

## Operational Metrics
Track per class:
- primary/retry/DLQ depth
- consumer throughput and failures
- publish confirm failures
- replay actions (who/why/when)
