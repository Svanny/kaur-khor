use super::{
    outbox, repository,
    schema::{build_item_created_job_v1, build_write_demo_job_v1, JobSchemaError},
    schema_types::JobRecord,
    types::JobDeliveryMode,
};
use anyhow::Result;
use serde_json::{json, Value};
use sqlx::{Postgres, Transaction};
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct ScheduleJobOptions {
    pub metadata: Value,
    pub delivery_mode: JobDeliveryMode,
    pub backfill_run_id: Option<Uuid>,
    pub source_event_id: Option<i64>,
}

impl Default for ScheduleJobOptions {
    fn default() -> Self {
        Self {
            metadata: json!({}),
            delivery_mode: JobDeliveryMode::Primary,
            backfill_run_id: None,
            source_event_id: None,
        }
    }
}

pub async fn schedule_item_created_tx(
    tx: &mut Transaction<'_, Postgres>,
    producer_service: String,
    owner_sub: String,
    item_id: String,
    idempotency_key: String,
    correlation_id: String,
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
    schedule_job_tx(tx, &job).await
}

pub async fn schedule_write_demo_tx(
    tx: &mut Transaction<'_, Postgres>,
    producer_service: String,
    operation: String,
    caller_id: String,
    idempotency_key: String,
    correlation_id: String,
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
    schedule_job_tx(tx, &job).await
}

pub async fn schedule_job_tx(tx: &mut Transaction<'_, Postgres>, job: &JobRecord) -> Result<i64> {
    let job_run = repository::upsert_job_run_tx(tx, job).await?;
    let _outbox_id = outbox::enqueue_tx(tx, job).await?;
    Ok(job_run.id)
}

pub async fn schedule_job_with_options_tx(
    tx: &mut Transaction<'_, Postgres>,
    job: &JobRecord,
    options: &ScheduleJobOptions,
) -> Result<i64> {
    let mut enriched = job.clone();
    enriched.metadata = options.metadata.clone();
    enriched.delivery_mode = options.delivery_mode;
    enriched.backfill_run_id = options.backfill_run_id;
    enriched.source_event_id = options.source_event_id;

    let job_run = repository::upsert_job_run_tx(tx, &enriched).await?;
    let _outbox_id = outbox::enqueue_tx(tx, &enriched).await?;
    Ok(job_run.id)
}

pub fn map_schema_error(err: JobSchemaError) -> anyhow::Error {
    anyhow::Error::new(err)
}
