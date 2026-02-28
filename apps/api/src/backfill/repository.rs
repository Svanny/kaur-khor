use crate::config::{BackfillKind, BackfillRunStatus};
use anyhow::Result;
use sqlx::{PgPool, Postgres, Row, Transaction};
use time::OffsetDateTime;
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct BackfillRunRow {
    pub id: Uuid,
    pub run_kind: String,
    pub status: String,
    pub operator_id: String,
    pub reason: String,
    pub stream_name: String,
    pub service_name: String,
    pub consumer_name: Option<String>,
    pub job_types: serde_json::Value,
    pub from_event_id: i64,
    pub requested_to_event_id: Option<i64>,
    pub resolved_to_event_id: i64,
    pub batch_size: i32,
    pub invalid_event_policy: String,
    pub reset_checkpoint: bool,
    pub truncate_projection: bool,
    pub checkpoint_start: Option<i64>,
    pub last_scanned_event_id: i64,
    pub candidate_event_count: i64,
    pub processed_event_count: i64,
    pub applied_projection_count: i64,
    pub enqueued_job_count: i64,
    pub job_success_count: i64,
    pub job_failure_count: i64,
    pub invalid_event_count: i64,
    pub last_error: Option<String>,
    pub started_at: Option<OffsetDateTime>,
    pub finished_at: Option<OffsetDateTime>,
}

#[derive(Debug, Clone)]
pub struct NewBackfillRun {
    pub id: Uuid,
    pub run_kind: BackfillKind,
    pub status: BackfillRunStatus,
    pub operator_id: String,
    pub reason: String,
    pub stream_name: String,
    pub service_name: String,
    pub consumer_name: Option<String>,
    pub job_types: serde_json::Value,
    pub from_event_id: i64,
    pub requested_to_event_id: Option<i64>,
    pub resolved_to_event_id: i64,
    pub batch_size: i32,
    pub invalid_event_policy: String,
    pub reset_checkpoint: bool,
    pub truncate_projection: bool,
    pub checkpoint_start: Option<i64>,
    pub candidate_event_count: i64,
    pub started_at: Option<OffsetDateTime>,
}

pub async fn insert_run(pool: &PgPool, run: &NewBackfillRun) -> Result<BackfillRunRow> {
    let row = sqlx::query(
        r#"
        INSERT INTO app.backfill_run (
          id,
          run_kind,
          status,
          operator_id,
          reason,
          stream_name,
          service_name,
          consumer_name,
          job_types,
          from_event_id,
          requested_to_event_id,
          resolved_to_event_id,
          batch_size,
          invalid_event_policy,
          reset_checkpoint,
          truncate_projection,
          checkpoint_start,
          candidate_event_count,
          started_at,
          updated_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,NOW()
        )
        RETURNING *
        "#,
    )
    .bind(run.id)
    .bind(run.run_kind.as_str())
    .bind(run.status.as_str())
    .bind(&run.operator_id)
    .bind(&run.reason)
    .bind(&run.stream_name)
    .bind(&run.service_name)
    .bind(&run.consumer_name)
    .bind(&run.job_types)
    .bind(run.from_event_id)
    .bind(run.requested_to_event_id)
    .bind(run.resolved_to_event_id)
    .bind(run.batch_size)
    .bind(&run.invalid_event_policy)
    .bind(run.reset_checkpoint)
    .bind(run.truncate_projection)
    .bind(run.checkpoint_start)
    .bind(run.candidate_event_count)
    .bind(run.started_at)
    .fetch_one(pool)
    .await?;

    Ok(backfill_run_from_row(&row))
}

pub async fn get_run(pool: &PgPool, run_id: Uuid) -> Result<Option<BackfillRunRow>> {
    let row = sqlx::query("SELECT * FROM app.backfill_run WHERE id = $1")
        .bind(run_id)
        .fetch_optional(pool)
        .await?;
    Ok(row.as_ref().map(backfill_run_from_row))
}

pub async fn mark_run_running(pool: &PgPool, run_id: Uuid) -> Result<()> {
    sqlx::query(
        "UPDATE app.backfill_run SET status = 'running', started_at = COALESCE(started_at, NOW()), updated_at = NOW(), last_error = NULL WHERE id = $1",
    )
    .bind(run_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn mark_run_waiting(pool: &PgPool, run_id: Uuid, last_error: Option<&str>) -> Result<()> {
    sqlx::query(
        "UPDATE app.backfill_run SET status = 'waiting', last_error = $2, updated_at = NOW() WHERE id = $1",
    )
    .bind(run_id)
    .bind(last_error)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn finish_run(
    pool: &PgPool,
    run_id: Uuid,
    status: BackfillRunStatus,
    last_error: Option<&str>,
) -> Result<()> {
    sqlx::query(
        "UPDATE app.backfill_run SET status = $2, last_error = $3, finished_at = NOW(), updated_at = NOW() WHERE id = $1",
    )
    .bind(run_id)
    .bind(status.as_str())
    .bind(last_error)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn mark_run_failed(pool: &PgPool, run_id: Uuid, error: &str) -> Result<()> {
    finish_run(pool, run_id, BackfillRunStatus::Failed, Some(error)).await
}

pub async fn update_progress_tx(
    tx: &mut Transaction<'_, Postgres>,
    run_id: Uuid,
    last_scanned_event_id: i64,
    processed_delta: i64,
    applied_projection_delta: i64,
    enqueued_job_delta: i64,
    invalid_event_delta: i64,
) -> Result<()> {
    sqlx::query(
        r#"
        UPDATE app.backfill_run
        SET
          last_scanned_event_id = GREATEST(last_scanned_event_id, $2),
          processed_event_count = processed_event_count + $3,
          applied_projection_count = applied_projection_count + $4,
          enqueued_job_count = enqueued_job_count + $5,
          invalid_event_count = invalid_event_count + $6,
          updated_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(run_id)
    .bind(last_scanned_event_id)
    .bind(processed_delta)
    .bind(applied_projection_delta)
    .bind(enqueued_job_delta)
    .bind(invalid_event_delta)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

pub async fn update_wait_counts(
    pool: &PgPool,
    run_id: Uuid,
    success_count: i64,
    failure_count: i64,
    last_error: Option<&str>,
) -> Result<()> {
    sqlx::query(
        r#"
        UPDATE app.backfill_run
        SET
          job_success_count = $2,
          job_failure_count = $3,
          last_error = $4,
          updated_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(run_id)
    .bind(success_count)
    .bind(failure_count)
    .bind(last_error)
    .execute(pool)
    .await?;
    Ok(())
}

fn backfill_run_from_row(row: &sqlx::postgres::PgRow) -> BackfillRunRow {
    BackfillRunRow {
        id: row.get("id"),
        run_kind: row.get("run_kind"),
        status: row.get("status"),
        operator_id: row.get("operator_id"),
        reason: row.get("reason"),
        stream_name: row.get("stream_name"),
        service_name: row.get("service_name"),
        consumer_name: row.get("consumer_name"),
        job_types: row.get("job_types"),
        from_event_id: row.get("from_event_id"),
        requested_to_event_id: row.get("requested_to_event_id"),
        resolved_to_event_id: row.get("resolved_to_event_id"),
        batch_size: row.get("batch_size"),
        invalid_event_policy: row.get("invalid_event_policy"),
        reset_checkpoint: row.get("reset_checkpoint"),
        truncate_projection: row.get("truncate_projection"),
        checkpoint_start: row.get("checkpoint_start"),
        last_scanned_event_id: row.get("last_scanned_event_id"),
        candidate_event_count: row.get("candidate_event_count"),
        processed_event_count: row.get("processed_event_count"),
        applied_projection_count: row.get("applied_projection_count"),
        enqueued_job_count: row.get("enqueued_job_count"),
        job_success_count: row.get("job_success_count"),
        job_failure_count: row.get("job_failure_count"),
        invalid_event_count: row.get("invalid_event_count"),
        last_error: row.get("last_error"),
        started_at: row.get("started_at"),
        finished_at: row.get("finished_at"),
    }
}
