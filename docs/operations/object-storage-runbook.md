# Object Storage Runbook

## Scope
Operational checks for worker-produced artifacts stored in S3-compatible storage.

## Preconditions
- Bucket already exists.
- Worker service has:
  - `OBJECT_STORAGE_ENABLED=true`
  - endpoint, region, bucket, access key, and secret key configured
  - writable `ARTIFACT_TMP_DIR`
- Bucket lifecycle policy exists for the configured artifact prefix.

## What To Inspect

### PostgreSQL
- `app.object_artifact`
- `app.job_result_artifact`
- `app.job_run`
- `app.job_run_attempt`

Useful checks:
- find artifacts for a job key
- confirm `bucket_name`, `object_key`, `sha256`, and `content_length`
- confirm `job_result_artifact` primary link exists for successful `write-demo`

### Object Storage
- `HEAD` the expected `bucket_name + object_key`
- compare:
  - `content_length`
  - metadata `sha256`

## Common Failure Modes

### Upload timeout / endpoint unavailable
- Worker marks the attempt retryable and reuses the same object key on retry.

### Existing object mismatch
- Worker fails hard because the deterministic key now points at incompatible bytes.
- Treat this as a contract violation, not a recoverable transport failure.

### Upload succeeded but metadata transaction failed
- Retry should skip upload after `HEAD` match and persist metadata rows successfully.
- If retries continue failing after object exists, inspect Postgres errors first.

### Temp file accumulation
- Worker cleans temp paths on success and failure.
- If leftover temp files appear, inspect worker crash timing and temp-dir permissions.

## Current Artifact Producer
- `write-demo`
  - result payload in Postgres is summary-only (`v2`)
  - full report body lives in object storage under the deterministic object key
