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
- `MAX_MESSAGES` hard cap per replay run.
- `REPLAY_RATE_PER_MIN` cap.
- `RETAIN_ATTEMPT=true` by default.
- Required audit fields:
  - `OPERATOR_ID`
  - `REPLAY_REASON`

## Commands
- Setup/check topology:
  - `tool/rabbit/setup_topology.sh`
  - `tool/rabbit/check_topology.sh`
- Replay:
  - `tool/rabbit/replay_dlq.sh`

## Post-Replay Verification
- DLQ depth decreases as expected.
- Primary queue and worker error metrics remain stable.
- No unexpected duplicate side effects in Postgres.
