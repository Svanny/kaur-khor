use anyhow::Result;
use sqlx::PgPool;

pub async fn stream_lag(
    pool: &PgPool,
    service_name: &str,
    consumer_name: &str,
    stream_name: &str,
) -> Result<i64> {
    let lag: i64 = sqlx::query_scalar(
        r#"
        WITH stream_max AS (
          SELECT COALESCE(MAX(id), 0) AS max_id
          FROM app.event_log
          WHERE stream_name = $1
        ), cp AS (
          SELECT COALESCE(last_event_id, 0) AS last_event_id
          FROM app.event_consumer_checkpoint
          WHERE service_name = $2 AND consumer_name = $3 AND stream_name = $1
        )
        SELECT GREATEST(
          (SELECT max_id FROM stream_max) - COALESCE((SELECT last_event_id FROM cp), 0),
          0
        )
        "#,
    )
    .bind(stream_name)
    .bind(service_name)
    .bind(consumer_name)
    .fetch_one(pool)
    .await?;

    Ok(lag)
}
