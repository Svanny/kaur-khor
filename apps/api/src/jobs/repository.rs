use super::schema_types::{JobRecord, JobResultRecord};
use super::types::{ErrorClass, ErrorReasonCode};
use crate::jobs::types::JobEnvelope;
use crate::storage::types::StoredArtifact;
use anyhow::{anyhow, Result};
use sqlx::{postgres::PgRow, PgPool, Postgres, Row, Transaction};
use std::time::Duration;
use time::OffsetDateTime;

#[derive(Debug, Clone)]
pub struct JobRunRow {
    pub id: i64,
    pub job_key: String,
    pub job_type: String,
    pub payload_version: i32,
    pub workload_class: String,
    pub producer_service: String,
    pub aggregate_type: String,
    pub aggregate_id: String,
    pub causation_id: String,
    pub correlation_id: String,
    pub status: String,
    pub payload: serde_json::Value,
    pub current_attempt: i32,
    pub max_attempts: i32,
    pub result_id: Option<i64>,
    pub created_at: OffsetDateTime,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AttemptClaimOutcome {
    Claimed,
    Resumed,
    LeaseStolen,
    DuplicateInProgress(Duration),
    TerminalExisting,
}

pub async fn upsert_job_run_tx(
    tx: &mut Transaction<'_, Postgres>,
    job: &JobRecord,
) -> Result<JobRunRow> {
    let inserted_or_matched = sqlx::query(
        r#"
        INSERT INTO app.job_run (
          job_key,
          job_type,
          payload_version,
          workload_class,
          producer_service,
          aggregate_type,
          aggregate_id,
          causation_id,
          correlation_id,
          status,
          payload,
          current_attempt,
          max_attempts,
          updated_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,'queued',$10,0,$11,NOW()
        )
        ON CONFLICT (job_key)
        DO UPDATE
        SET updated_at = NOW()
        WHERE app.job_run.job_type = EXCLUDED.job_type
          AND app.job_run.payload_version = EXCLUDED.payload_version
          AND app.job_run.workload_class = EXCLUDED.workload_class
          AND app.job_run.producer_service = EXCLUDED.producer_service
          AND app.job_run.aggregate_type = EXCLUDED.aggregate_type
          AND app.job_run.aggregate_id = EXCLUDED.aggregate_id
          AND app.job_run.causation_id = EXCLUDED.causation_id
          AND app.job_run.correlation_id = EXCLUDED.correlation_id
          AND app.job_run.payload = EXCLUDED.payload
          AND app.job_run.max_attempts = EXCLUDED.max_attempts
        RETURNING
          id, job_key, job_type, payload_version, workload_class, producer_service,
          aggregate_type, aggregate_id, causation_id, correlation_id, status,
          payload, current_attempt, max_attempts, result_id, created_at
        "#,
    )
    .bind(&job.job_key)
    .bind(&job.job_type)
    .bind(job.payload_version)
    .bind(job.workload_class.as_str())
    .bind(&job.producer_service)
    .bind(&job.aggregate_type)
    .bind(&job.aggregate_id)
    .bind(&job.causation_id)
    .bind(&job.correlation_id)
    .bind(&job.payload)
    .bind(job.max_attempts)
    .fetch_optional(&mut **tx)
    .await?;

    if let Some(row) = inserted_or_matched {
        return Ok(job_run_from_row(&row));
    }

    let existing: Option<JobRunRow> = sqlx::query(
        r#"
        SELECT
          id, job_key, job_type, payload_version, workload_class, producer_service,
          aggregate_type, aggregate_id, causation_id, correlation_id, status,
          payload, current_attempt, max_attempts, result_id, created_at
        FROM app.job_run
        WHERE job_key = $1
        LIMIT 1
        "#,
    )
    .bind(&job.job_key)
    .fetch_optional(&mut **tx)
    .await?
    .map(|row| job_run_from_row(&row));

    if existing.is_some() {
        return Err(anyhow!(
            "job_run job_key conflict with mismatched job payload/metadata"
        ));
    }

    Err(anyhow!(
        "job_run upsert conflict could not be resolved for job_key"
    ))
}

pub async fn get_job_run_for_update_tx(
    tx: &mut Transaction<'_, Postgres>,
    job_key: &str,
) -> Result<Option<JobRunRow>> {
    let row = sqlx::query(
        r#"
        SELECT
          id, job_key, job_type, payload_version, workload_class, producer_service,
          aggregate_type, aggregate_id, causation_id, correlation_id, status,
          payload, current_attempt, max_attempts, result_id, created_at
        FROM app.job_run
        WHERE job_key = $1
        FOR UPDATE
        "#,
    )
    .bind(job_key)
    .fetch_optional(&mut **tx)
    .await?;
    Ok(row.as_ref().map(job_run_from_row))
}

pub async fn mark_run_started_tx(
    tx: &mut Transaction<'_, Postgres>,
    job_run_id: i64,
    attempt: u8,
) -> Result<()> {
    sqlx::query(
        r#"
        UPDATE app.job_run
        SET
          status = 'running',
          current_attempt = $2,
          started_at = COALESCE(started_at, NOW()),
          updated_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(job_run_id)
    .bind(i32::from(attempt))
    .execute(&mut **tx)
    .await?;
    Ok(())
}

pub async fn claim_attempt_tx(
    tx: &mut Transaction<'_, Postgres>,
    job_run_id: i64,
    attempt: u8,
    worker_id: &str,
    lease_ttl: Duration,
) -> Result<AttemptClaimOutcome> {
    let existing = sqlx::query(
        r#"
        SELECT
          id,
          worker_id,
          status,
          lease_expires_at,
          COALESCE(lease_expires_at > NOW(), false) AS lease_is_fresh,
          COALESCE(
            GREATEST((EXTRACT(EPOCH FROM (lease_expires_at - NOW())) * 1000)::bigint, 0),
            0
          ) AS lease_wait_ms
        FROM app.job_run_attempt
        WHERE job_run_id = $1 AND attempt = $2
        FOR UPDATE
        "#,
    )
    .bind(job_run_id)
    .bind(i32::from(attempt))
    .fetch_optional(&mut **tx)
    .await?;

    let lease_ms = lease_ttl.as_millis() as i64;
    match existing {
        None => {
            sqlx::query(
                r#"
                INSERT INTO app.job_run_attempt (
                  job_run_id,
                  attempt,
                  worker_id,
                  status,
                  lease_expires_at,
                  heartbeat_at,
                  updated_at
                ) VALUES (
                  $1, $2, $3, 'running',
                  NOW() + ($4::bigint * INTERVAL '1 millisecond'),
                  NOW(),
                  NOW()
                )
                "#,
            )
            .bind(job_run_id)
            .bind(i32::from(attempt))
            .bind(worker_id)
            .bind(lease_ms)
            .execute(&mut **tx)
            .await?;
            Ok(AttemptClaimOutcome::Claimed)
        }
        Some(row) => {
            let status: String = row.get("status");
            let current_worker: String = row.get("worker_id");
            let lease_is_fresh: bool = row.get("lease_is_fresh");
            let lease_wait_ms: i64 = row.get("lease_wait_ms");

            if matches!(
                status.as_str(),
                "succeeded" | "retryable_failed" | "permanent_failed" | "duplicate_skipped"
            ) {
                return Ok(AttemptClaimOutcome::TerminalExisting);
            }

            if status == "running" && current_worker == worker_id {
                sqlx::query(
                    r#"
                    UPDATE app.job_run_attempt
                    SET
                      heartbeat_at = NOW(),
                      lease_expires_at = NOW() + ($4::bigint * INTERVAL '1 millisecond'),
                      updated_at = NOW()
                    WHERE job_run_id = $1 AND attempt = $2 AND worker_id = $3
                    "#,
                )
                .bind(job_run_id)
                .bind(i32::from(attempt))
                .bind(worker_id)
                .bind(lease_ms)
                .execute(&mut **tx)
                .await?;
                return Ok(AttemptClaimOutcome::Resumed);
            }

            if status == "running" && lease_is_fresh {
                return Ok(AttemptClaimOutcome::DuplicateInProgress(
                    Duration::from_millis(lease_wait_ms.max(0) as u64),
                ));
            }

            sqlx::query(
                r#"
                UPDATE app.job_run_attempt
                SET
                  worker_id = $3,
                  status = 'running',
                  lease_expires_at = NOW() + ($4::bigint * INTERVAL '1 millisecond'),
                  heartbeat_at = NOW(),
                  updated_at = NOW(),
                  error_class = NULL,
                  error_reason = NULL,
                  error_message = NULL,
                  finished_at = NULL
                WHERE job_run_id = $1 AND attempt = $2
                "#,
            )
            .bind(job_run_id)
            .bind(i32::from(attempt))
            .bind(worker_id)
            .bind(lease_ms)
            .execute(&mut **tx)
            .await?;
            Ok(AttemptClaimOutcome::LeaseStolen)
        }
    }
}

pub async fn heartbeat_attempt(
    pool: &PgPool,
    job_run_id: i64,
    attempt: u8,
    worker_id: &str,
    lease_ttl: Duration,
) -> Result<()> {
    let lease_ms = lease_ttl.as_millis() as i64;
    sqlx::query(
        r#"
        UPDATE app.job_run_attempt
        SET
          heartbeat_at = NOW(),
          lease_expires_at = NOW() + ($4::bigint * INTERVAL '1 millisecond'),
          updated_at = NOW()
        WHERE job_run_id = $1
          AND attempt = $2
          AND worker_id = $3
          AND status = 'running'
        "#,
    )
    .bind(job_run_id)
    .bind(i32::from(attempt))
    .bind(worker_id)
    .bind(lease_ms)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn upsert_job_result_tx(
    tx: &mut Transaction<'_, Postgres>,
    job_run_id: i64,
    result: &JobResultRecord,
    kafka_publish_status: &str,
) -> Result<i64> {
    let inserted_or_matched = sqlx::query(
        r#"
        INSERT INTO app.job_result (
          job_run_id,
          job_key,
          job_type,
          result_version,
          payload,
          kafka_publish_status,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (job_key)
        DO UPDATE
        SET updated_at = NOW()
        WHERE app.job_result.job_run_id = EXCLUDED.job_run_id
          AND app.job_result.job_type = EXCLUDED.job_type
          AND app.job_result.result_version = EXCLUDED.result_version
          AND app.job_result.payload = EXCLUDED.payload
          AND app.job_result.kafka_publish_status = EXCLUDED.kafka_publish_status
        RETURNING id
        "#,
    )
    .bind(job_run_id)
    .bind(&result.job_key)
    .bind(&result.job_type)
    .bind(result.result_version)
    .bind(&result.payload)
    .bind(kafka_publish_status)
    .fetch_optional(&mut **tx)
    .await?;

    if let Some(row) = inserted_or_matched {
        return Ok(row.get("id"));
    }

    let existing: Option<i64> =
        sqlx::query_scalar("SELECT id FROM app.job_result WHERE job_key = $1 LIMIT 1")
            .bind(&result.job_key)
            .fetch_optional(&mut **tx)
            .await?;

    if existing.is_some() {
        return Err(anyhow!(
            "job_result conflict with mismatched result payload/metadata"
        ));
    }

    Err(anyhow!(
        "job_result upsert conflict could not be resolved for job_key"
    ))
}

pub async fn mark_attempt_succeeded_tx(
    tx: &mut Transaction<'_, Postgres>,
    job_run_id: i64,
    attempt: u8,
    worker_id: &str,
    result_id: i64,
) -> Result<()> {
    sqlx::query(
        r#"
        UPDATE app.job_run_attempt
        SET
          status = 'succeeded',
          finished_at = NOW(),
          updated_at = NOW(),
          lease_expires_at = NULL,
          heartbeat_at = NOW()
        WHERE job_run_id = $1 AND attempt = $2 AND worker_id = $3
        "#,
    )
    .bind(job_run_id)
    .bind(i32::from(attempt))
    .bind(worker_id)
    .execute(&mut **tx)
    .await?;

    sqlx::query(
        r#"
        UPDATE app.job_run
        SET
          status = 'succeeded',
          result_id = $2,
          next_attempt_at = NULL,
          last_error_class = NULL,
          last_error_reason = NULL,
          last_error = NULL,
          finished_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(job_run_id)
    .bind(result_id)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

pub async fn mark_attempt_failed_tx(
    tx: &mut Transaction<'_, Postgres>,
    job_run_id: i64,
    attempt: u8,
    worker_id: &str,
    error_class: ErrorClass,
    error_reason: ErrorReasonCode,
    error_message: &str,
    next_attempt_delay: Option<Duration>,
    retrying: bool,
) -> Result<()> {
    let attempt_status = if retrying {
        "retryable_failed"
    } else {
        "permanent_failed"
    };
    let run_status = if retrying { "retrying" } else { "failed" };

    sqlx::query(
        r#"
        UPDATE app.job_run_attempt
        SET
          status = $4,
          error_class = $5,
          error_reason = $6,
          error_message = $7,
          finished_at = NOW(),
          updated_at = NOW(),
          lease_expires_at = NULL,
          heartbeat_at = NOW()
        WHERE job_run_id = $1 AND attempt = $2 AND worker_id = $3
        "#,
    )
    .bind(job_run_id)
    .bind(i32::from(attempt))
    .bind(worker_id)
    .bind(attempt_status)
    .bind(match error_class {
        ErrorClass::Permanent => "permanent",
        ErrorClass::Transient => "transient",
    })
    .bind(error_reason.as_str())
    .bind(error_message)
    .execute(&mut **tx)
    .await?;

    sqlx::query(
        r#"
        UPDATE app.job_run
        SET
          status = $2,
          next_attempt_at = CASE
            WHEN $3::bigint IS NULL THEN NULL
            ELSE NOW() + ($3::bigint * INTERVAL '1 millisecond')
          END,
          last_error_class = $4,
          last_error_reason = $5,
          last_error = $6,
          finished_at = CASE WHEN $2 = 'failed' THEN NOW() ELSE finished_at END,
          updated_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(job_run_id)
    .bind(run_status)
    .bind(next_attempt_delay.map(|delay| delay.as_millis() as i64))
    .bind(match error_class {
        ErrorClass::Permanent => "permanent",
        ErrorClass::Transient => "transient",
    })
    .bind(error_reason.as_str())
    .bind(error_message)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

pub async fn upsert_object_artifact_tx(
    tx: &mut Transaction<'_, Postgres>,
    artifact: &StoredArtifact,
) -> Result<i64> {
    let inserted_or_matched = sqlx::query(
        r#"
        INSERT INTO app.object_artifact (
          artifact_key,
          storage_provider,
          producer_service,
          producer_role,
          job_key,
          job_type,
          artifact_role,
          artifact_version,
          bucket_name,
          object_key,
          object_uri,
          content_type,
          content_length,
          sha256,
          etag,
          metadata,
          retention_until,
          uploaded_at,
          updated_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NOW()
        )
        ON CONFLICT (artifact_key)
        DO UPDATE
        SET
          object_uri = EXCLUDED.object_uri,
          updated_at = NOW()
        WHERE app.object_artifact.storage_provider = EXCLUDED.storage_provider
          AND app.object_artifact.producer_service = EXCLUDED.producer_service
          AND app.object_artifact.producer_role = EXCLUDED.producer_role
          AND app.object_artifact.job_key IS NOT DISTINCT FROM EXCLUDED.job_key
          AND app.object_artifact.job_type IS NOT DISTINCT FROM EXCLUDED.job_type
          AND app.object_artifact.artifact_role = EXCLUDED.artifact_role
          AND app.object_artifact.artifact_version = EXCLUDED.artifact_version
          AND app.object_artifact.bucket_name = EXCLUDED.bucket_name
          AND app.object_artifact.object_key = EXCLUDED.object_key
          AND app.object_artifact.content_type = EXCLUDED.content_type
          AND app.object_artifact.content_length = EXCLUDED.content_length
          AND app.object_artifact.sha256 = EXCLUDED.sha256
          AND app.object_artifact.etag IS NOT DISTINCT FROM EXCLUDED.etag
          AND app.object_artifact.metadata = EXCLUDED.metadata
          AND app.object_artifact.retention_until IS NOT DISTINCT FROM EXCLUDED.retention_until
          AND app.object_artifact.uploaded_at = EXCLUDED.uploaded_at
        RETURNING id
        "#,
    )
    .bind(&artifact.artifact_key)
    .bind(&artifact.storage_provider)
    .bind(&artifact.producer_service)
    .bind(&artifact.producer_role)
    .bind(&artifact.job_key)
    .bind(&artifact.job_type)
    .bind(&artifact.artifact_role)
    .bind(artifact.artifact_version)
    .bind(&artifact.bucket_name)
    .bind(&artifact.object_key)
    .bind(&artifact.object_uri)
    .bind(&artifact.content_type)
    .bind(artifact.content_length)
    .bind(&artifact.sha256)
    .bind(&artifact.etag)
    .bind(&artifact.metadata)
    .bind(artifact.retention_until)
    .bind(artifact.uploaded_at)
    .fetch_optional(&mut **tx)
    .await?;

    if let Some(row) = inserted_or_matched {
        return Ok(row.get("id"));
    }

    let existing: Option<i64> =
        sqlx::query_scalar("SELECT id FROM app.object_artifact WHERE artifact_key = $1 LIMIT 1")
            .bind(&artifact.artifact_key)
            .fetch_optional(&mut **tx)
            .await?;

    if existing.is_some() {
        return Err(anyhow!(
            "object_artifact conflict with mismatched storage metadata"
        ));
    }

    Err(anyhow!(
        "object_artifact upsert conflict could not be resolved for artifact_key"
    ))
}

pub async fn link_job_result_artifact_tx(
    tx: &mut Transaction<'_, Postgres>,
    job_result_id: i64,
    artifact_id: i64,
    artifact_role: &str,
    is_primary: bool,
) -> Result<()> {
    sqlx::query(
        r#"
        INSERT INTO app.job_result_artifact (
          job_result_id,
          artifact_id,
          artifact_role,
          is_primary
        ) VALUES ($1, $2, $3, $4)
        ON CONFLICT (job_result_id, artifact_id)
        DO NOTHING
        "#,
    )
    .bind(job_result_id)
    .bind(artifact_id)
    .bind(artifact_role)
    .bind(is_primary)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

pub async fn record_delivery_violation_tx(
    tx: &mut Transaction<'_, Postgres>,
    worker_id: &str,
    envelope: &JobEnvelope,
    error_reason: &str,
    error_message: &str,
) -> Result<()> {
    sqlx::query(
        r#"
        INSERT INTO app.job_delivery_violation (
          job_key,
          job_type,
          attempt,
          correlation_id,
          worker_id,
          error_reason,
          error_message,
          envelope
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (job_key, attempt, error_reason)
        DO UPDATE SET
          error_message = EXCLUDED.error_message
        "#,
    )
    .bind(&envelope.message_id)
    .bind(&envelope.job_type)
    .bind(i32::from(envelope.attempt))
    .bind(&envelope.correlation_id)
    .bind(worker_id)
    .bind(error_reason)
    .bind(error_message)
    .bind(serde_json::to_value(envelope)?)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

pub async fn record_raw_delivery_violation_tx(
    tx: &mut Transaction<'_, Postgres>,
    worker_id: &str,
    job_key: &str,
    attempt: u8,
    correlation_id: Option<&str>,
    job_type: Option<&str>,
    error_reason: &str,
    error_message: &str,
    envelope: &serde_json::Value,
) -> Result<()> {
    sqlx::query(
        r#"
        INSERT INTO app.job_delivery_violation (
          job_key,
          job_type,
          attempt,
          correlation_id,
          worker_id,
          error_reason,
          error_message,
          envelope
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (job_key, attempt, error_reason)
        DO UPDATE SET
          error_message = EXCLUDED.error_message,
          envelope = EXCLUDED.envelope
        "#,
    )
    .bind(job_key)
    .bind(job_type)
    .bind(i32::from(attempt))
    .bind(correlation_id)
    .bind(worker_id)
    .bind(error_reason)
    .bind(error_message)
    .bind(envelope)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

fn job_run_from_row(row: &PgRow) -> JobRunRow {
    JobRunRow {
        id: row.get("id"),
        job_key: row.get("job_key"),
        job_type: row.get("job_type"),
        payload_version: row.get("payload_version"),
        workload_class: row.get("workload_class"),
        producer_service: row.get("producer_service"),
        aggregate_type: row.get("aggregate_type"),
        aggregate_id: row.get("aggregate_id"),
        causation_id: row.get("causation_id"),
        correlation_id: row.get("correlation_id"),
        status: row.get("status"),
        payload: row.get("payload"),
        current_attempt: row.get("current_attempt"),
        max_attempts: row.get("max_attempts"),
        result_id: row.get("result_id"),
        created_at: row.get("created_at"),
    }
}
