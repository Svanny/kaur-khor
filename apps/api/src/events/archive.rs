use anyhow::Result;
use sqlx::PgPool;

pub async fn record_export_watermark(
    pool: &PgPool,
    stream_name: &str,
    last_event_id: i64,
) -> Result<()> {
    sqlx::query(
        r#"
        INSERT INTO app.event_log_archive_export_cursor (
          stream_name, last_exported_event_id, last_exported_at, updated_at
        ) VALUES ($1, $2, NOW(), NOW())
        ON CONFLICT (stream_name)
        DO UPDATE SET
          last_exported_event_id = GREATEST(app.event_log_archive_export_cursor.last_exported_event_id, EXCLUDED.last_exported_event_id),
          last_exported_at = NOW(),
          updated_at = NOW()
        "#,
    )
    .bind(stream_name)
    .bind(last_event_id)
    .execute(pool)
    .await?;
    Ok(())
}
