use super::{
    outbox, repository,
    schema::{build_item_created_job_v1, build_write_demo_job_v1, JobSchemaError},
};
use anyhow::Result;
use sqlx::{Postgres, Transaction};

pub async fn schedule_item_created_tx(
    tx: &mut Transaction<'_, Postgres>,
    producer_service: String,
    owner_sub: String,
    item_id: String,
    idempotency_key: String,
    correlation_id: String,
    metadata: serde_json::Value,
    max_attempts: u8,
) -> Result<i64> {
    let job = build_item_created_job_v1(
        producer_service,
        owner_sub,
        item_id,
        idempotency_key,
        correlation_id,
        max_attempts,
    )
    .map_err(anyhow::Error::new)?;
    schedule_job_tx(tx, &job, &metadata).await
}

pub async fn schedule_write_demo_tx(
    tx: &mut Transaction<'_, Postgres>,
    producer_service: String,
    operation: String,
    caller_id: String,
    idempotency_key: String,
    correlation_id: String,
    metadata: serde_json::Value,
    max_attempts: u8,
) -> Result<i64> {
    let job = build_write_demo_job_v1(
        producer_service,
        operation,
        caller_id,
        idempotency_key,
        correlation_id,
        max_attempts,
    )
    .map_err(anyhow::Error::new)?;
    schedule_job_tx(tx, &job, &metadata).await
}

pub async fn schedule_job_tx(
    tx: &mut Transaction<'_, Postgres>,
    job: &super::schema_types::JobRecord,
    metadata: &serde_json::Value,
) -> Result<i64> {
    let job_run = repository::upsert_job_run_tx(tx, job).await?;
    let _outbox_id = outbox::enqueue_tx(tx, job, metadata).await?;
    Ok(job_run.id)
}

pub fn map_schema_error(err: JobSchemaError) -> anyhow::Error {
    anyhow::Error::new(err)
}
