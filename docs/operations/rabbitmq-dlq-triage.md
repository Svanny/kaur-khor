# RabbitMQ DLQ Triage Runbook

## Goals
- avoid infinite poison retries
- recover safely with auditable replays

## Triage Steps
1. Identify DLQ class and routing key.
2. Classify failure cause:
   - Permanent: invalid schema, impossible domain state, missing immutable refs.
   - Transient: timeouts, dependency outage, temporary network faults.
3. Fix underlying issue before replay.
4. Replay in bounded batches with rate limit.
5. Monitor queue depth, error rate, and duplicate side effects.

## Replay Safety Controls
- `RABBIT_REPLAY_MAX_MESSAGES` hard cap per replay run.
- `RABBIT_REPLAY_RATE_PER_MIN` cap.
- `RABBIT_REPLAY_RETAIN_ATTEMPT=true` by default.
- source queue must match `*.dlq`.
- replay target exchange must be allowlisted (replay exchange default).
- `BANJI_ENV` must be set and printed by tooling.
- replay stops immediately on first unrouted publish.
- Required audit fields:
  - `OPERATOR_ID`
  - `REPLAY_REASON`

## Copy-First Replay Contract
- Replay script uses Management API copy-first behavior (`ack_requeue_true`).
- Replay does not implicitly remove source DLQ messages.
- Removal is explicit and separate via cleanup script with confirmation token.

## Commands
- Setup/check topology:
  - `tool/rabbit/setup_topology.sh`
  - `tool/rabbit/check_topology.sh`
- Replay:
  - `tool/rabbit/replay_dlq.sh`
- Cleanup (explicit second step):
  - `tool/rabbit/cleanup_dlq.sh`
  - requires `CONFIRM_DLQ_CLEANUP=CONFIRM_DLQ_CLEANUP`
  - requires `TARGET_REPLAY_ID=<x-replay-id from replay run>`
  - refuses to run when DLQ has active consumers (race guard)

## Required Replay Env
- `BANJI_ENV`
- `DLQ_NAME` (must end with `.dlq`)
- `RABBIT_REPLAY_TARGET_EXCHANGE` (default replay exchange)
- `RABBIT_REPLAY_TARGET_ROUTING_KEY` (`job.fast.replay` or `job.heavy.replay`)
- `RABBIT_REPLAY_MAX_MESSAGES`
- `RABBIT_REPLAY_RATE_PER_MIN`
- `RABBIT_REPLAY_RETAIN_ATTEMPT`
- `OPERATOR_ID`
- `REPLAY_REASON`
- `TARGET_REPLAY_ID` (cleanup step only; scoped removal to replay run)

## Post-Replay Verification
- Replay queue and worker processing increase as expected for selected workload class.
- DLQ depth is expected to remain unchanged until explicit cleanup is run.
- Primary queue and worker error metrics remain stable.
- No unexpected duplicate side effects in Postgres.
- Replay audit log includes run id, operator, reason, status, message id.
