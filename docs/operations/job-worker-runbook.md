# Job Worker Runbook

## Scope
This runbook covers the current RabbitMQ-backed worker runtime (`APP_ROLE=worker`) and the Postgres accountability tables behind it.

## Runtime Responsibilities
- Consume primary job queues by workload class.
- Optionally consume replay queues when `WORKER_CONSUME_REPLAY_QUEUES=true`.
- Execute typed handlers for registered job types.
- Persist attempt, result, and failure state in Postgres.
- Use confirm-before-ack for retry and DLQ routing.

## Current Job Types
- `item-created`
- `write-demo`

## Required Runtime Inputs
- `APP_ROLE=worker`
- `DATABASE_RUNTIME_URL`
- `RABBIT_URL`
- `WORKER_ID`
- `WORKER_ENABLED_CLASSES`
- `RABBIT_PREFETCH_FAST`
- `RABBIT_PREFETCH_HEAVY`
- `RABBIT_REPLAY_PREFETCH_FAST`
- `RABBIT_REPLAY_PREFETCH_HEAVY`
- `JOB_ATTEMPT_LEASE_SECONDS`
- `JOB_ATTEMPT_HEARTBEAT_SECONDS`
- `ALGORITHM_ROLLOUT_HASH_SALT`
- `ALGORITHM_ROLLOUT_HASH_SALT_VERSION`

Kafka result publication remains disabled in this milestone:
- `JOB_RESULT_KAFKA_ENABLED=false`

## Postgres Accountability Tables
- `app.job_run`
  - one row per logical `job_key`
  - tracks queued/running/retrying/succeeded/failed
- `app.job_run_attempt`
  - one row per explicit attempt number
  - tracks worker lease, heartbeat, terminal attempt outcome
- `app.job_result`
  - one successful result row per `job_key`
- `app.job_delivery_violation`
  - orphan or invalid deliveries that violated the scheduling contract
- `app.job_algorithm_rollout_policy`
  - rollout control rows keyed by `job_type`
  - new jobs can move between stable and candidate without a redeploy

## Attempt Semantics
- `attempt` means total tries including the first execution.
- Current ceiling with `RABBIT_MAX_ATTEMPTS=4`:
  - initial execution: `attempt=1`
  - retries: `attempt=2`, `attempt=3`, `attempt=4`
- Rabbit redelivery alone must not increment attempts.

## Duplicate Delivery Behavior
- Duplicate completed delivery:
  - worker acknowledges without recomputing
  - no second result row is written
- Retries and duplicate deliveries must reuse the persisted `job_run.algorithm_version`
  - rollout changes only affect jobs that have not yet been decided
- Duplicate in-progress delivery:
  - worker checks `app.job_run_attempt`
  - if a different worker holds a fresh lease, the duplicate is requeued without changing attempt
- Expired lease:
  - another worker may steal the lease and continue the same attempt

## Missing `job_run`
If a Rabbit delivery arrives with no matching `app.job_run`:
1. write `app.job_delivery_violation`
2. record reason `missing_job_run`
3. route to DLQ with confirm-before-ack

This is a contract violation. The worker must not invent a missing logical run.

## Result Contract
- Successful handlers write a typed result to `app.job_result`.
- `job_result` is idempotent by `job_key`.
- Conflicting result payloads for the same `job_key` are treated as a contract error.
- `kafka_publish_status` stays `disabled` in this milestone.
- `app.job_run` persists `algorithm_version`, `algorithm_decision_source`, `algorithm_rollout_bucket`, `algorithm_policy_updated_at`, `algorithm_hash_salt_version`, and `algorithm_decided_at` before handler execution.

## Queue Topology
Primary queues:
- `{system}.{env}.fast-jobs`
- `{system}.{env}.heavy-jobs`

Replay queues:
- `{system}.{env}.fast-jobs.replay`
- `{system}.{env}.heavy-jobs.replay`

Replay-scoped backfill jobs:
- are created by `APP_ROLE=backfill-controller`
- persist `backfill_run_id` and `source_event_id` on `app.job_run` / `app.job_outbox`
- publish only through `{system}.{env}.jobs.replay`
- remain append-only history; they do not overwrite prior `job_result` rows

## Common Queries
Find stuck running attempts:

```sql
SELECT job_run_id, attempt, worker_id, lease_expires_at, heartbeat_at
FROM app.job_run_attempt
WHERE status = 'running'
ORDER BY updated_at ASC;
```

Find recent permanent failures:

```sql
SELECT job_key, job_type, current_attempt, last_error_reason, finished_at
FROM app.job_run
WHERE status = 'failed'
ORDER BY finished_at DESC
LIMIT 50;
```

Find orphan/invalid deliveries:

```sql
SELECT job_key, job_type, attempt, error_reason, created_at
FROM app.job_delivery_violation
ORDER BY created_at DESC
LIMIT 50;
```

## Failure Triage
1. Check `app.job_run` status and `last_error_reason`.
2. Check `app.job_run_attempt` for lease freshness and duplicate-delivery behavior.
3. Check queue depth for primary, retry, and DLQ queues.
4. If failures are poison or contract violations, use the DLQ triage runbook:
   - `/Users/svanny/banji/docs/operations/rabbitmq-dlq-triage.md`

## Safe Restart
1. Stop worker instances.
2. Ensure no long-running `running` attempts still have fresh leases.
3. Restart workers with the same `WORKER_ENABLED_CLASSES` contract.
4. Verify queue consumption resumes and `app.job_run_attempt` heartbeats are updating.
