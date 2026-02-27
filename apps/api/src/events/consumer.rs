use super::model::{AuditEvent, EventRow};
use super::schema::decode_event_row;
use super::schema_types::{InvalidEventPolicy, KnownEvent};
use crate::observability::metrics;
use anyhow::Result;
use sha2::{Digest, Sha256};
use sqlx::{Connection, PgConnection, PgPool, Postgres, Row, Transaction};

const POLL_STREAM_RANGE_SQL: &str = r#"
        SELECT
          id,
          created_at::text AS occurred_at,
          publish_key,
          stream_name,
          env_name,
          topic_name,
          event_type,
          event_version,
          aggregate_type,
          aggregate_id,
          producer_service,
          idempotency_key,
          correlation_id,
          causation_id,
          payload,
          metadata
        FROM app.event_log
        WHERE stream_name = $1 AND id > $2 AND ($3::bigint IS NULL OR id <= $3)
        ORDER BY id ASC
        LIMIT $4
        "#;

#[derive(Debug)]
pub struct ConsumerAdvisoryLock {
    connection: PgConnection,
    lock_key: i64,
}

impl ConsumerAdvisoryLock {
    pub async fn release(mut self) -> Result<()> {
        let _ = sqlx::query_scalar::<_, bool>("SELECT pg_advisory_unlock($1)")
            .bind(self.lock_key)
            .fetch_one(&mut self.connection)
            .await;
        let _ = sqlx::query("ROLLBACK").execute(&mut self.connection).await;
        self.connection.close().await?;
        Ok(())
    }
}

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct StreamRangeSummary {
    pub candidate_count: i64,
    pub max_event_id: Option<i64>,
}

pub async fn acquire_consumer_lock(
    database_url: &str,
    service_name: &str,
    consumer_name: &str,
    stream_name: &str,
) -> Result<ConsumerAdvisoryLock> {
    let lock_key = derive_lock_key(service_name, consumer_name, stream_name);
    let mut connection = PgConnection::connect(database_url).await?;

    // Keep a transaction open on a dedicated connection so the lock remains stable even when
    // the runtime database endpoint is PgBouncer in transaction mode.
    sqlx::query("BEGIN").execute(&mut connection).await?;
    let acquired = sqlx::query_scalar::<_, bool>("SELECT pg_try_advisory_lock($1)")
        .bind(lock_key)
        .fetch_one(&mut connection)
        .await?;

    if !acquired {
        let _ = sqlx::query("ROLLBACK").execute(&mut connection).await;
        connection.close().await?;
        return Err(anyhow::anyhow!(
            "consumer lock already held for service={service_name} consumer={consumer_name} stream={stream_name}"
        ));
    }

    Ok(ConsumerAdvisoryLock {
        connection,
        lock_key,
    })
}

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

pub async fn set_checkpoint_tx(
    tx: &mut Transaction<'_, Postgres>,
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
          last_event_id = EXCLUDED.last_event_id,
          last_heartbeat_at = NOW(),
          updated_at = NOW(),
          last_error = NULL
        "#,
    )
    .bind(service_name)
    .bind(consumer_name)
    .bind(stream_name)
    .bind(last_event_id)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

pub async fn poll_stream(
    pool: &PgPool,
    stream_name: &str,
    after_id: i64,
    batch_size: i64,
) -> Result<Vec<EventRow>> {
    poll_stream_in_range(pool, stream_name, after_id, None, batch_size).await
}

pub async fn poll_stream_in_range(
    pool: &PgPool,
    stream_name: &str,
    after_id: i64,
    to_id: Option<i64>,
    batch_size: i64,
) -> Result<Vec<EventRow>> {
    let rows = sqlx::query(POLL_STREAM_RANGE_SQL)
        .bind(stream_name)
        .bind(after_id)
        .bind(to_id)
        .bind(batch_size)
        .fetch_all(pool)
        .await?;

    metrics::record_event_consumer_batch_size(stream_name, rows.len());

    Ok(rows
        .into_iter()
        .map(|r| EventRow {
            id: r.get("id"),
            occurred_at: r.get("occurred_at"),
            publish_key: r.get("publish_key"),
            stream_name: r.get("stream_name"),
            env_name: r.get("env_name"),
            topic_name: r.get("topic_name"),
            event_type: r.get("event_type"),
            event_version: r.get("event_version"),
            aggregate_type: r.get("aggregate_type"),
            aggregate_id: r.get("aggregate_id"),
            producer_service: r.get("producer_service"),
            idempotency_key: r.get("idempotency_key"),
            correlation_id: r.get("correlation_id"),
            causation_id: r.get("causation_id"),
            payload: r.get("payload"),
            metadata: r.get("metadata"),
        })
        .collect())
}

#[derive(Debug, Default)]
pub struct DecodedEventBatch {
    pub events: Vec<(i64, KnownEvent)>,
    pub invalid_event_ids: Vec<i64>,
}

pub async fn poll_and_decode_stream(
    pool: &PgPool,
    service_name: &str,
    consumer_name: &str,
    stream_name: &str,
    after_id: i64,
    batch_size: i64,
    policy: InvalidEventPolicy,
) -> Result<DecodedEventBatch> {
    poll_and_decode_stream_in_range(
        pool,
        service_name,
        consumer_name,
        stream_name,
        after_id,
        None,
        batch_size,
        policy,
    )
    .await
}

pub async fn poll_and_decode_stream_in_range(
    pool: &PgPool,
    service_name: &str,
    consumer_name: &str,
    stream_name: &str,
    after_id: i64,
    to_id: Option<i64>,
    batch_size: i64,
    policy: InvalidEventPolicy,
) -> Result<DecodedEventBatch> {
    let rows = poll_stream_in_range(pool, stream_name, after_id, to_id, batch_size).await?;
    let mut decoded = DecodedEventBatch::default();

    for row in rows {
        match decode_event_row(&row, policy) {
            Ok(event) => decoded.events.push((row.id, event)),
            Err(err) => {
                let err_msg = format!("{} (event_id={})", err, row.id);
                set_error(pool, service_name, consumer_name, stream_name, &err_msg).await?;
                decoded.invalid_event_ids.push(row.id);

                match err.action {
                    super::schema_types::InvalidEventAction::Halt => {
                        return Err(anyhow::anyhow!(err_msg));
                    }
                    super::schema_types::InvalidEventAction::Skip => {}
                    super::schema_types::InvalidEventAction::Quarantine => {
                        quarantine_invalid_event(
                            pool,
                            service_name,
                            consumer_name,
                            stream_name,
                            &row,
                            err.code.as_str(),
                            &err.message,
                        )
                        .await?;
                    }
                }
            }
        }
    }

    Ok(decoded)
}

pub async fn summarize_stream_range(
    pool: &PgPool,
    stream_name: &str,
    after_id: i64,
    to_id: Option<i64>,
) -> Result<StreamRangeSummary> {
    let row = sqlx::query(
        r#"
        SELECT
          COUNT(*)::bigint AS candidate_count,
          NULLIF(MAX(id), 0) AS max_event_id
        FROM app.event_log
        WHERE stream_name = $1 AND id > $2 AND ($3::bigint IS NULL OR id <= $3)
        "#,
    )
    .bind(stream_name)
    .bind(after_id)
    .bind(to_id)
    .fetch_one(pool)
    .await?;

    Ok(StreamRangeSummary {
        candidate_count: row.get("candidate_count"),
        max_event_id: row.get("max_event_id"),
    })
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

pub async fn quarantine_invalid_event(
    pool: &PgPool,
    service_name: &str,
    consumer_name: &str,
    stream_name: &str,
    row: &EventRow,
    error_code: &str,
    error_message: &str,
) -> Result<()> {
    sqlx::query(
        r#"
        INSERT INTO app.event_consumer_quarantine (
          service_name,
          consumer_name,
          stream_name,
          event_id,
          event_type,
          event_version,
          error_code,
          error_message,
          payload,
          metadata
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (service_name, consumer_name, stream_name, event_id, error_code)
        DO UPDATE SET
          error_message = EXCLUDED.error_message,
          payload = EXCLUDED.payload,
          metadata = EXCLUDED.metadata,
          created_at = NOW()
        "#,
    )
    .bind(service_name)
    .bind(consumer_name)
    .bind(stream_name)
    .bind(row.id)
    .bind(&row.event_type)
    .bind(row.event_version)
    .bind(error_code)
    .bind(error_message)
    .bind(&row.payload)
    .bind(&row.metadata)
    .execute(pool)
    .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{derive_lock_key, POLL_STREAM_RANGE_SQL};

    #[test]
    fn poll_stream_query_orders_by_id_for_stable_replay() {
        assert!(POLL_STREAM_RANGE_SQL.contains("ORDER BY id ASC"));
    }

    #[test]
    fn advisory_lock_key_is_stable() {
        let a = derive_lock_key("projection-consumer", "inventory-projector", "banji-core.dev.inventory-updated");
        let b = derive_lock_key("projection-consumer", "inventory-projector", "banji-core.dev.inventory-updated");
        assert_eq!(a, b);
    }
}

fn derive_lock_key(service_name: &str, consumer_name: &str, stream_name: &str) -> i64 {
    let mut hasher = Sha256::new();
    hasher.update(service_name.as_bytes());
    hasher.update(b"|");
    hasher.update(consumer_name.as_bytes());
    hasher.update(b"|");
    hasher.update(stream_name.as_bytes());

    let digest = hasher.finalize();
    let mut bytes = [0u8; 8];
    bytes.copy_from_slice(&digest[..8]);
    i64::from_be_bytes(bytes)
}
