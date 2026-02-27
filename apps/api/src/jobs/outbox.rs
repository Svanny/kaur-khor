use super::{
    schema_types::JobRecord,
    types::{JobEnvelope, WorkloadClass},
};
use anyhow::{anyhow, Result};
use sqlx::{Postgres, Row, Transaction};

pub async fn enqueue_tx(tx: &mut Transaction<'_, Postgres>, job: &JobRecord) -> Result<i64> {
    validate_record(job)?;

    let inserted_or_matched = sqlx::query(
        r#"
        INSERT INTO app.job_outbox (
          enqueue_key,
          job_type,
          workload_class,
          routing_key,
          correlation_id,
          producer_service,
          payload_version,
          aggregate_type,
          aggregate_id,
          causation_id,
          payload,
          attempt,
          status,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 1, 'pending', NOW())
        ON CONFLICT (enqueue_key)
        DO UPDATE
        SET updated_at = NOW()
        WHERE app.job_outbox.job_type = EXCLUDED.job_type
          AND app.job_outbox.workload_class = EXCLUDED.workload_class
          AND app.job_outbox.routing_key = EXCLUDED.routing_key
          AND app.job_outbox.correlation_id = EXCLUDED.correlation_id
          AND app.job_outbox.producer_service = EXCLUDED.producer_service
          AND app.job_outbox.payload_version = EXCLUDED.payload_version
          AND app.job_outbox.aggregate_type = EXCLUDED.aggregate_type
          AND app.job_outbox.aggregate_id = EXCLUDED.aggregate_id
          AND app.job_outbox.causation_id = EXCLUDED.causation_id
          AND app.job_outbox.payload = EXCLUDED.payload
        RETURNING id
        "#,
    )
    .bind(&job.job_key)
    .bind(&job.job_type)
    .bind(job.workload_class.as_str())
    .bind(&job.routing_key)
    .bind(&job.correlation_id)
    .bind(&job.producer_service)
    .bind(job.payload_version)
    .bind(&job.aggregate_type)
    .bind(&job.aggregate_id)
    .bind(&job.causation_id)
    .bind(&job.payload)
    .fetch_optional(&mut **tx)
    .await?;

    if let Some(row) = inserted_or_matched {
        return Ok(row.get("id"));
    }

    let existing: Option<i64> = sqlx::query_scalar(
        r#"
        SELECT id
        FROM app.job_outbox
        WHERE enqueue_key = $1
        LIMIT 1
        "#,
    )
    .bind(&job.job_key)
    .fetch_optional(&mut **tx)
    .await?;

    if existing.is_some() {
        return Err(anyhow!(
            "job outbox enqueue_key conflict with mismatched job payload/metadata"
        ));
    }

    Err(anyhow!(
        "job outbox enqueue conflict could not be resolved for enqueue_key"
    ))
}

pub async fn claim_pending_batch(
    tx: &mut Transaction<'_, Postgres>,
    workload_class: WorkloadClass,
    limit: i64,
) -> Result<Vec<JobOutboxRow>> {
    let rows = sqlx::query(
        r#"
        WITH cte AS (
          SELECT id
          FROM app.job_outbox
          WHERE status = 'pending' AND workload_class = $1
          ORDER BY created_at ASC
          LIMIT $2
          FOR UPDATE SKIP LOCKED
        )
        UPDATE app.job_outbox o
        SET status = 'publishing', updated_at = NOW()
        FROM cte
        WHERE o.id = cte.id
        RETURNING
          o.id,
          o.enqueue_key,
          o.job_type,
          o.workload_class,
          o.routing_key,
          o.correlation_id,
          o.producer_service,
          o.payload_version,
          o.aggregate_type,
          o.aggregate_id,
          o.causation_id,
          o.payload,
          o.attempt
        "#,
    )
    .bind(workload_class.as_str())
    .bind(limit)
    .fetch_all(&mut **tx)
    .await?;

    rows.into_iter().map(JobOutboxRow::from_row).collect()
}

#[derive(Debug, Clone)]
pub struct JobOutboxRow {
    pub id: i64,
    pub envelope: JobEnvelope,
    pub routing_key: String,
}

impl JobOutboxRow {
    fn from_row(row: sqlx::postgres::PgRow) -> Result<Self> {
        let workload_raw: String = row.get("workload_class");
        let workload_class = WorkloadClass::parse(&workload_raw).ok_or_else(|| {
            anyhow!(
                "invalid workload_class '{}' in app.job_outbox",
                workload_raw
            )
        })?;

        Ok(Self {
            id: row.get("id"),
            routing_key: row.get("routing_key"),
            envelope: JobEnvelope {
                message_id: row.get("enqueue_key"),
                correlation_id: row.get("correlation_id"),
                attempt: row.get::<i32, _>("attempt") as u8,
                job_type: row.get("job_type"),
                payload_version: row.get("payload_version"),
                producer_service: row.get("producer_service"),
                aggregate_type: row.get("aggregate_type"),
                aggregate_id: row.get("aggregate_id"),
                causation_id: row.get("causation_id"),
                workload_class,
                payload: row.get("payload"),
            },
        })
    }
}

pub async fn mark_sent_tx(tx: &mut Transaction<'_, Postgres>, id: i64) -> Result<()> {
    sqlx::query(
        "UPDATE app.job_outbox SET status = 'sent', published_at = NOW(), updated_at = NOW(), last_error = NULL WHERE id = $1",
    )
    .bind(id)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

pub async fn mark_failed_tx(
    tx: &mut Transaction<'_, Postgres>,
    id: i64,
    error: &str,
) -> Result<()> {
    sqlx::query(
        "UPDATE app.job_outbox SET status = 'pending', last_error = $2, updated_at = NOW() WHERE id = $1",
    )
    .bind(id)
    .bind(error)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

pub async fn count_pending(pool: &sqlx::PgPool, workload_class: WorkloadClass) -> Result<i64> {
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM app.job_outbox WHERE status = 'pending' AND workload_class = $1",
    )
    .bind(workload_class.as_str())
    .fetch_one(pool)
    .await?;
    Ok(count)
}

pub async fn oldest_pending_age_seconds(pool: &sqlx::PgPool) -> Result<i64> {
    let age: Option<i64> = sqlx::query_scalar(
        r#"
        SELECT MAX(
          GREATEST(
            (EXTRACT(EPOCH FROM (NOW() - created_at)))::bigint,
            0
          )
        )
        FROM app.job_outbox
        WHERE status = 'pending'
        "#,
    )
    .fetch_one(pool)
    .await?;

    Ok(age.unwrap_or(0))
}

fn validate_record(job: &JobRecord) -> Result<()> {
    validate_label(&job.job_type, "job_type")?;
    validate_label(&job.routing_key, "routing_key")?;
    validate_label(&job.producer_service, "producer_service")?;
    validate_label(&job.aggregate_type, "aggregate_type")?;
    validate_correlation_id(&job.correlation_id)?;
    if job.aggregate_id.is_empty() || job.aggregate_id.len() > 256 {
        return Err(anyhow!("aggregate_id must be 1..256 characters"));
    }
    if job.causation_id.is_empty() || job.causation_id.len() > 128 {
        return Err(anyhow!("causation_id must be 1..128 characters"));
    }
    if job.payload_version < 1 {
        return Err(anyhow!("payload_version must be >= 1"));
    }
    Ok(())
}

fn validate_label(value: &str, name: &str) -> Result<()> {
    if value.is_empty() || value.len() > 64 {
        return Err(anyhow!("{name} must be 1..64 characters"));
    }
    if !value
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
    {
        return Err(anyhow!(
            "{name} must contain only alphanumeric, '-', '_' or '.'"
        ));
    }
    Ok(())
}

fn validate_correlation_id(value: &str) -> Result<()> {
    if value.is_empty() || value.len() > 64 {
        return Err(anyhow!("correlation_id must be 1..64 characters"));
    }
    if !value
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | ':'))
    {
        return Err(anyhow!(
            "correlation_id must contain only alphanumeric, '-', '_', '.', ':'"
        ));
    }
    Ok(())
}
