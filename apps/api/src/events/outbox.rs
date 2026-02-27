use super::model::EventRecord;
use super::publisher::validate_event_payload_contract;
use super::schema::validate_event_record;
use anyhow::{anyhow, Result};
use sqlx::{PgPool, Postgres, Row, Transaction};
use std::time::Duration;

#[derive(Debug, Clone)]
pub struct EventOutboxRow {
    pub id: i64,
    pub publish_key: String,
    pub stream_name: String,
    pub env_name: String,
    pub topic_name: String,
    pub event_type: String,
    pub event_version: i32,
    pub aggregate_type: String,
    pub aggregate_id: String,
    pub producer_service: String,
    pub idempotency_key: Option<String>,
    pub correlation_id: Option<String>,
    pub causation_id: String,
    pub payload: serde_json::Value,
    pub metadata: serde_json::Value,
    pub attempt_count: i32,
}

impl EventOutboxRow {
    pub fn to_event_record(&self) -> EventRecord {
        EventRecord {
            publish_key: self.publish_key.clone(),
            stream_name: self.stream_name.clone(),
            env_name: self.env_name.clone(),
            topic_name: self.topic_name.clone(),
            event_type: self.event_type.clone(),
            event_version: self.event_version,
            aggregate_type: self.aggregate_type.clone(),
            aggregate_id: self.aggregate_id.clone(),
            producer_service: self.producer_service.clone(),
            idempotency_key: self.idempotency_key.clone(),
            correlation_id: self.correlation_id.clone(),
            causation_id: self.causation_id.clone(),
            payload: self.payload.clone(),
            metadata: self.metadata.clone(),
        }
    }
}

pub async fn enqueue_tx(tx: &mut Transaction<'_, Postgres>, event: &EventRecord) -> Result<i64> {
    validate_event_record(event).map_err(anyhow::Error::new)?;
    validate_event_payload_contract(&event.payload, &event.metadata)?;

    let inserted_or_matched = sqlx::query(
        r#"
        INSERT INTO app.event_outbox (
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
          metadata,
          status,
          attempt_count,
          next_attempt_at,
          updated_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
          'pending', 0, NOW(), NOW()
        )
        ON CONFLICT (publish_key)
        DO UPDATE
        SET updated_at = NOW()
        WHERE app.event_outbox.stream_name = EXCLUDED.stream_name
          AND app.event_outbox.env_name = EXCLUDED.env_name
          AND app.event_outbox.topic_name = EXCLUDED.topic_name
          AND app.event_outbox.event_type = EXCLUDED.event_type
          AND app.event_outbox.event_version = EXCLUDED.event_version
          AND app.event_outbox.aggregate_type = EXCLUDED.aggregate_type
          AND app.event_outbox.aggregate_id = EXCLUDED.aggregate_id
          AND app.event_outbox.producer_service = EXCLUDED.producer_service
          AND app.event_outbox.idempotency_key IS NOT DISTINCT FROM EXCLUDED.idempotency_key
          AND app.event_outbox.causation_id = EXCLUDED.causation_id
          AND app.event_outbox.payload = EXCLUDED.payload
          AND app.event_outbox.metadata = EXCLUDED.metadata
        RETURNING id
        "#,
    )
    .bind(&event.publish_key)
    .bind(&event.stream_name)
    .bind(&event.env_name)
    .bind(&event.topic_name)
    .bind(&event.event_type)
    .bind(event.event_version)
    .bind(&event.aggregate_type)
    .bind(&event.aggregate_id)
    .bind(&event.producer_service)
    .bind(&event.idempotency_key)
    .bind(&event.correlation_id)
    .bind(&event.causation_id)
    .bind(&event.payload)
    .bind(&event.metadata)
    .fetch_optional(&mut **tx)
    .await?;

    if let Some(row) = inserted_or_matched {
        return Ok(row.get("id"));
    }

    let existing: Option<i64> = sqlx::query_scalar(
        r#"
        SELECT id
        FROM app.event_outbox
        WHERE publish_key = $1
        LIMIT 1
        "#,
    )
    .bind(&event.publish_key)
    .fetch_optional(&mut **tx)
    .await?;

    if existing.is_some() {
        return Err(anyhow!(
            "event outbox publish_key conflict with mismatched event payload/metadata"
        ));
    }

    Err(anyhow!(
        "event outbox enqueue conflict could not be resolved for publish_key"
    ))
}

pub async fn claim_pending_row_tx(
    tx: &mut Transaction<'_, Postgres>,
) -> Result<Option<EventOutboxRow>> {
    let row = sqlx::query(
        r#"
        SELECT
          id,
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
          metadata,
          attempt_count
        FROM app.event_outbox
        WHERE status = 'pending' AND next_attempt_at <= NOW()
        ORDER BY id ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
        "#,
    )
    .fetch_optional(&mut **tx)
    .await?;

    Ok(row.map(|r| EventOutboxRow {
        id: r.get("id"),
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
        attempt_count: r.get("attempt_count"),
    }))
}

pub async fn mark_published_tx(
    tx: &mut Transaction<'_, Postgres>,
    outbox_id: i64,
    event_log_id: i64,
) -> Result<()> {
    sqlx::query(
        r#"
        UPDATE app.event_outbox
        SET
          status = 'published',
          event_log_id = $2,
          published_at = NOW(),
          blocked_at = NULL,
          last_error = NULL,
          updated_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(outbox_id)
    .bind(event_log_id)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

pub async fn mark_failed_or_blocked_tx(
    tx: &mut Transaction<'_, Postgres>,
    row: &EventOutboxRow,
    error: &str,
    block_after_attempts: i32,
    retry_delay: Duration,
    force_block: bool,
) -> Result<bool> {
    let next_attempt = row.attempt_count.saturating_add(1);
    let is_blocked = force_block || next_attempt >= block_after_attempts;

    let delay_ms = retry_delay.as_millis() as i64;
    sqlx::query(
        r#"
        UPDATE app.event_outbox
        SET
          status = CASE WHEN $3 THEN 'blocked' ELSE 'pending' END,
          attempt_count = $2,
          blocked_at = CASE WHEN $3 THEN NOW() ELSE NULL END,
          next_attempt_at = CASE
            WHEN $3 THEN NOW()
            ELSE NOW() + ($4::bigint * INTERVAL '1 millisecond')
          END,
          last_error = $5,
          updated_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(row.id)
    .bind(next_attempt)
    .bind(is_blocked)
    .bind(delay_ms)
    .bind(error)
    .execute(&mut **tx)
    .await?;

    Ok(is_blocked)
}

pub async fn count_pending(pool: &PgPool) -> Result<i64> {
    let pending: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM app.event_outbox WHERE status = 'pending'")
            .fetch_one(pool)
            .await?;
    Ok(pending)
}

pub async fn oldest_pending_age_seconds(pool: &PgPool) -> Result<i64> {
    let oldest: Option<f64> = sqlx::query_scalar(
        r#"
        SELECT EXTRACT(EPOCH FROM NOW() - MIN(created_at))
        FROM app.event_outbox
        WHERE status = 'pending'
        "#,
    )
    .fetch_one(pool)
    .await?;
    Ok(oldest.unwrap_or(0.0) as i64)
}

pub async fn prune_published(pool: &PgPool, retention_days: i64, limit: i64) -> Result<i64> {
    let deleted: i64 = sqlx::query_scalar(
        r#"
        WITH to_delete AS (
          SELECT id
          FROM app.event_outbox
          WHERE status = 'published'
            AND published_at IS NOT NULL
            AND published_at < NOW() - ($1::bigint * INTERVAL '1 day')
          ORDER BY published_at ASC
          LIMIT $2
        ),
        deleted AS (
          DELETE FROM app.event_outbox o
          USING to_delete t
          WHERE o.id = t.id
          RETURNING 1
        )
        SELECT COUNT(*)::bigint FROM deleted
        "#,
    )
    .bind(retention_days)
    .bind(limit)
    .fetch_one(pool)
    .await?;
    Ok(deleted)
}
