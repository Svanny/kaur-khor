use super::types::WorkloadClass;
use anyhow::{anyhow, Result};
use sqlx::{Postgres, Row, Transaction};

pub async fn enqueue_tx(
    tx: &mut Transaction<'_, Postgres>,
    enqueue_key: &str,
    job_type: &str,
    workload_class: WorkloadClass,
    routing_key: &str,
    correlation_id: &str,
    payload: &serde_json::Value,
) -> Result<i64> {
    validate_correlation_id(correlation_id)?;
    validate_label(job_type, "job_type")?;
    validate_label(routing_key, "routing_key")?;

    let row = sqlx::query(
        r#"
        INSERT INTO app.job_outbox (
          enqueue_key,
          job_type,
          workload_class,
          routing_key,
          correlation_id,
          payload,
          attempt,
          status,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, 1, 'pending', NOW())
        ON CONFLICT (enqueue_key)
        DO UPDATE SET
          updated_at = NOW(),
          correlation_id = COALESCE(app.job_outbox.correlation_id, EXCLUDED.correlation_id)
        RETURNING id
        "#,
    )
    .bind(enqueue_key)
    .bind(job_type)
    .bind(workload_class.as_str())
    .bind(routing_key)
    .bind(correlation_id)
    .bind(payload)
    .fetch_one(&mut **tx)
    .await?;

    Ok(row.get("id"))
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
        RETURNING o.id, o.job_type, o.workload_class, o.routing_key, o.correlation_id, o.payload, o.attempt, o.enqueue_key
        "#,
    )
    .bind(workload_class.as_str())
    .bind(limit)
    .fetch_all(&mut **tx)
    .await?;

    Ok(rows
        .into_iter()
        .map(|r| JobOutboxRow {
            id: r.get("id"),
            job_type: r.get("job_type"),
            workload_class: match r.get::<String, _>("workload_class").as_str() {
                "heavy" => WorkloadClass::Heavy,
                _ => WorkloadClass::Fast,
            },
            routing_key: r.get("routing_key"),
            correlation_id: r.get("correlation_id"),
            payload: r.get("payload"),
            attempt: r.get::<i32, _>("attempt") as u8,
            enqueue_key: r.get("enqueue_key"),
        })
        .collect())
}

#[derive(Debug, Clone)]
pub struct JobOutboxRow {
    pub id: i64,
    pub job_type: String,
    pub workload_class: WorkloadClass,
    pub routing_key: String,
    pub correlation_id: String,
    pub payload: serde_json::Value,
    pub attempt: u8,
    pub enqueue_key: String,
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

pub async fn count_pending(pool: &sqlx::PgPool, workload_class: WorkloadClass) -> Result<i64> {
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM app.job_outbox WHERE status = 'pending' AND workload_class = $1",
    )
    .bind(workload_class.as_str())
    .fetch_one(pool)
    .await?;
    Ok(count)
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
