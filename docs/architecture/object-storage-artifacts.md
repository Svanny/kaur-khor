# Object Storage Artifacts

## Scope
This document defines the current runtime contract for heavy worker artifacts stored in S3-compatible object storage.

## Current Producer
- `write-demo` is the first artifact-producing job.
- `item-created` does not emit object-storage artifacts in this milestone.

## Storage Model
- Artifact bytes live in S3-compatible object storage.
- PostgreSQL stores metadata only:
  - `app.object_artifact`
  - `app.job_result_artifact`
- Public access is metadata-only in this milestone. No presigned URLs or API download proxy are provided.

## Artifact Identity
- `artifact_key` is derived from a canonical JSON identity object and SHA-256 hashed.
- Canonical identity fields:
  - `producer_service`
  - `producer_role`
  - `job_type`
  - `job_key`
  - `artifact_role`
  - `artifact_version`
- The worker recomputes and validates `artifact_key` before upload.

## Object Key
- Object key is deterministic and retry-stable:
  - `{artifact_prefix}/{yyyy}/{mm}/{dd}/jobs/{job_type}/{job_key}/{artifact_role}-v{artifact_version}.{ext}`
- The date path comes from `job_run.created_at`, not retry time.

## Upload Contract
- `HEAD` first.
- If the object exists and matches:
  - `content_length`
  - metadata `sha256`
  then the worker skips upload and treats the object as idempotent success.
- If the object exists but mismatches at the deterministic key, the worker fails hard.
- If the object does not exist, the worker uploads it and then verifies with `HEAD`.
- ETag is diagnostic only and not used as checksum authority.

## Metadata Keys
Worker uploads the following object metadata keys:
- `sha256`
- `artifact-role`
- `artifact-version`
- `producer-service`
- `job-key` when present
- `uploaded-at`

Verification reads metadata keys case-insensitively because S3-compatible providers may normalize key casing.

## Authoritative Identity
- `bucket_name + object_key` is authoritative.
- `object_uri` is stored for convenience only.

## Retention
- `retention_until` is derived from the upload timestamp.
- The app records retention metadata but does not delete objects in this milestone.
- Bucket lifecycle enforcement is external and required for the configured artifact prefix.

## Orphan-Reconcile Behavior
- If upload succeeds and the metadata transaction fails, retry must:
  - `HEAD` the same object key
  - verify matching `sha256` + content length
  - skip upload
  - write metadata rows and complete successfully
