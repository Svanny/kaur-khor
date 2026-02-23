use super::model::EventRecord;
use anyhow::{anyhow, Result};
use sqlx::{Postgres, Row, Transaction};

pub async fn publish_in_tx(tx: &mut Transaction<'_, Postgres>, event: &EventRecord) -> Result<i64> {
    let inserted = sqlx::query(
        r#"
        INSERT INTO app.event_log (
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
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        ON CONFLICT (producer_service, idempotency_key)
        WHERE idempotency_key IS NOT NULL
        DO NOTHING
        RETURNING id
        "#,
    )
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

    if let Some(row) = inserted {
        return Ok(row.get("id"));
    }

    if let Some(idempotency_key) = &event.idempotency_key {
        let row = sqlx::query(
            r#"
            SELECT id
            FROM app.event_log
            WHERE producer_service = $1 AND idempotency_key = $2
            ORDER BY id DESC
            LIMIT 1
            "#,
        )
        .bind(&event.producer_service)
        .bind(idempotency_key)
        .fetch_optional(&mut **tx)
        .await?;

        if let Some(found) = row {
            return Ok(found.get("id"));
        }
    }

    Err(anyhow!(
        "event insert failed without existing dedupe record"
    ))
}
