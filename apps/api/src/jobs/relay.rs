use super::outbox;
use super::publisher::ConfirmingPublisher;
use super::types::JobEnvelope;
use crate::config::AppConfig;
use anyhow::Result;
use sqlx::PgPool;

pub async fn relay_once<P: ConfirmingPublisher>(
    pool: &PgPool,
    cfg: &AppConfig,
    workload: super::types::WorkloadClass,
    publisher: &P,
    limit: i64,
) -> Result<usize> {
    let mut tx = pool.begin().await?;
    let rows = outbox::claim_pending_batch(&mut tx, workload, limit).await?;

    let mut published = 0usize;
    for row in &rows {
        let envelope = JobEnvelope {
            message_id: row.enqueue_key.clone(),
            correlation_id: None,
            attempt: row.attempt,
            job_type: row.job_type.clone(),
            workload_class: row.workload_class.clone(),
            payload: row.payload.clone(),
        };

        let publish_res = publisher
            .publish_with_confirm(&cfg.rabbit_exchange_jobs, &row.routing_key, &envelope)
            .await;

        match publish_res {
            Ok(_) => {
                outbox::mark_sent_tx(&mut tx, row.id).await?;
                published += 1;
            }
            Err(err) => {
                outbox::mark_failed_tx(&mut tx, row.id, &err.to_string()).await?;
            }
        }
    }

    tx.commit().await?;
    Ok(published)
}
