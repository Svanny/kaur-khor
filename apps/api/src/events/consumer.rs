use super::model::{AuditEvent, EventRow};
use crate::observability::metrics;
use anyhow::Result;
use sqlx::{PgPool, Row};

const POLL_STREAM_SQL: &str = r#"
        SELECT
          id,
          created_at::text AS occurred_at,
          stream_name,
          event_type,
          event_version,
          aggregate_type,
          aggregate_id,
          producer_service,
          idempotency_key,
          correlation_id,
          payload,
          metadata
        FROM app.event_log
        WHERE stream_name = $1 AND id > $2
        ORDER BY id ASC
        LIMIT $3
        "#;

pub async fn get_checkpoint(
    pool: &PgPool,
    service_name: &str,
    consumer_name: &str,
    stream_name: &str,
) -> Result<i64> {
    let row = sqlx::query(
        r#"
        SELECT last_event_id
        FROM app.event_consumer_checkpoint
        WHERE service_name = $1 AND consumer_name = $2 AND stream_name = $3
        "#,
    )
    .bind(service_name)
    .bind(consumer_name)
    .bind(stream_name)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|r| r.get::<i64, _>("last_event_id")).unwrap_or(0))
}

pub async fn heartbeat(
    pool: &PgPool,
    service_name: &str,
    consumer_name: &str,
    stream_name: &str,
) -> Result<()> {
    sqlx::query(
        r#"
        INSERT INTO app.event_consumer_checkpoint (
          service_name, consumer_name, stream_name, last_event_id, last_heartbeat_at, updated_at
        ) VALUES ($1, $2, $3, 0, NOW(), NOW())
        ON CONFLICT (service_name, consumer_name, stream_name)
        DO UPDATE SET
          last_heartbeat_at = NOW(),
          updated_at = NOW()
        "#,
    )
    .bind(service_name)
    .bind(consumer_name)
    .bind(stream_name)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn set_error(
    pool: &PgPool,
    service_name: &str,
    consumer_name: &str,
    stream_name: &str,
    error: &str,
) -> Result<()> {
    metrics::record_event_consumer_error(consumer_name, stream_name);
    sqlx::query(
        r#"
        INSERT INTO app.event_consumer_checkpoint (
          service_name, consumer_name, stream_name, last_event_id, last_heartbeat_at, last_error, updated_at
        ) VALUES ($1, $2, $3, 0, NOW(), $4, NOW())
        ON CONFLICT (service_name, consumer_name, stream_name)
        DO UPDATE SET
          last_error = EXCLUDED.last_error,
          last_heartbeat_at = NOW(),
          updated_at = NOW()
        "#,
    )
    .bind(service_name)
    .bind(consumer_name)
    .bind(stream_name)
    .bind(error)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn advance_checkpoint(
    pool: &PgPool,
    service_name: &str,
    consumer_name: &str,
    stream_name: &str,
    last_event_id: i64,
) -> Result<()> {
    sqlx::query(
        r#"
        INSERT INTO app.event_consumer_checkpoint (
          service_name, consumer_name, stream_name, last_event_id, last_heartbeat_at, updated_at, last_error
        ) VALUES ($1, $2, $3, $4, NOW(), NOW(), NULL)
        ON CONFLICT (service_name, consumer_name, stream_name)
        DO UPDATE SET
          last_event_id = GREATEST(app.event_consumer_checkpoint.last_event_id, EXCLUDED.last_event_id),
          last_heartbeat_at = NOW(),
          updated_at = NOW(),
          last_error = NULL
        "#,
    )
    .bind(service_name)
    .bind(consumer_name)
    .bind(stream_name)
    .bind(last_event_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn poll_stream(
    pool: &PgPool,
    stream_name: &str,
    after_id: i64,
    batch_size: i64,
) -> Result<Vec<EventRow>> {
    let rows = sqlx::query(POLL_STREAM_SQL)
        .bind(stream_name)
        .bind(after_id)
        .bind(batch_size)
        .fetch_all(pool)
        .await?;

    metrics::record_event_consumer_batch_size(stream_name, rows.len());

    Ok(rows
        .into_iter()
        .map(|r| EventRow {
            id: r.get("id"),
            occurred_at: r.get("occurred_at"),
            stream_name: r.get("stream_name"),
            event_type: r.get("event_type"),
            event_version: r.get("event_version"),
            aggregate_type: r.get("aggregate_type"),
            aggregate_id: r.get("aggregate_id"),
            producer_service: r.get("producer_service"),
            idempotency_key: r.get("idempotency_key"),
            correlation_id: r.get("correlation_id"),
            payload: r.get("payload"),
            metadata: r.get("metadata"),
        })
        .collect())
}

pub async fn poll_audit_stream(
    pool: &PgPool,
    stream_name: &str,
    after_id: i64,
    batch_size: i64,
) -> Result<Vec<AuditEvent>> {
    let rows = poll_stream(pool, stream_name, after_id, batch_size).await?;
    Ok(rows.into_iter().map(|row| row.to_audit_event()).collect())
}

pub async fn compute_stream_lag(
    pool: &PgPool,
    stream_name: &str,
    last_event_id: i64,
) -> Result<i64> {
    let max_id: i64 =
        sqlx::query_scalar("SELECT COALESCE(MAX(id), 0) FROM app.event_log WHERE stream_name = $1")
            .bind(stream_name)
            .fetch_one(pool)
            .await?;

    let lag = (max_id - last_event_id).max(0);
    metrics::set_event_consumer_lag(stream_name, lag);
    Ok(lag)
}

#[cfg(test)]
mod tests {
    use super::POLL_STREAM_SQL;

    #[test]
    fn poll_stream_query_orders_by_id_for_stable_replay() {
        assert!(POLL_STREAM_SQL.contains("ORDER BY id ASC"));
    }
}
