# Algorithm Rollouts

## Scope
This runbook covers the worker-side job algorithm rollout controls stored in `app.job_algorithm_rollout_policy`.

## Safety Rules
- Always roll out in `staging` first.
- Observe staging for at least 60 minutes with no correctness or durability regressions before increasing `prod` above `0%`.
- Rollout membership is stable for new jobs until `ALGORITHM_ROLLOUT_HASH_SALT` changes.
- Changing `ALGORITHM_ROLLOUT_HASH_SALT` is a reshuffle event and is not part of normal rollout operations.
- Retries and duplicate deliveries keep the `algorithm_version` already stored on `app.job_run`.

## Inspect Current Policy

```bash
bash tool/db/algorithm_rollout.sh show --job-type write-demo
```

## Update Policy

```bash
bash tool/db/algorithm_rollout.sh set \
  --job-type write-demo \
  --stable write-demo-v2 \
  --candidate write-demo-v3 \
  --percent 5 \
  --updated-by "release-operator"
```

Large percentage jumps above 25 points require `--force`.

## Recommended Production Ramp
1. `0 -> 5`
2. `5 -> 25`
3. `25 -> 50`
4. `50 -> 100`

## Rollback
- Set `candidate_percent=0`.
- No image rebuild is required.
- New jobs immediately return to the stable version.
- In-flight and retrying jobs keep their stored `algorithm_version`.

## Salt Rotation
- Treat salt rotation as a separate, rare operation.
- Rotate only when intentional reshuffling of future job membership is acceptable.
- Update both `ALGORITHM_ROLLOUT_HASH_SALT` and `ALGORITHM_ROLLOUT_HASH_SALT_VERSION`.

## Historical Reprocessing
- Rollout percentages do not backfill historical results.
- Use the existing replay and requeue tooling for historical reprocessing after algorithm changes.
