use super::outbox;
use super::publisher::ConfirmingPublisher;
use super::types::JobEnvelope;
use crate::config::AppConfig;
use crate::observability::{metrics, propagation};
use anyhow::Result;
use sqlx::PgPool;

pub async fn relay_once<P: ConfirmingPublisher>(
    pool: &PgPool,
    cfg: &AppConfig,
    workload: super::types::WorkloadClass,
    publisher: &P,
    limit: i64,
) -> Result<usize> {
    let pending_class = workload.clone();
    let mut tx = pool.begin().await?;
    let rows = outbox::claim_pending_batch(&mut tx, workload, limit).await?;

    let mut published = 0usize;
    for row in &rows {
        let envelope = JobEnvelope {
            message_id: row.enqueue_key.clone(),
            correlation_id: row.correlation_id.clone(),
            attempt: row.attempt,
            job_type: row.job_type.clone(),
            workload_class: row.workload_class.clone(),
            payload: row.payload.clone(),
        };

        let mut headers = super::publisher::MessageHeaders::new();
        headers.insert(
            "x-correlation-id".to_string(),
            envelope.correlation_id.clone(),
        );
        propagation::inject_current_context_to_map(&mut headers);

        let publish_res = publisher
            .publish_with_confirm(
                &cfg.rabbit_exchange_jobs,
                &row.routing_key,
                &envelope,
                &headers,
            )
            .await;

        match publish_res {
            Ok(_) => {
                outbox::mark_sent_tx(&mut tx, row.id).await?;
                metrics::record_job_publish(row.workload_class.as_str(), "sent");
                published += 1;
            }
            Err(err) => {
                outbox::mark_failed_tx(&mut tx, row.id, &err.to_string()).await?;
                metrics::record_job_publish(row.workload_class.as_str(), "failed");
            }
        }
    }

    tx.commit().await?;
    if let Ok(pending) = outbox::count_pending(pool, pending_class).await {
        metrics::set_outbox_pending(pending);
    }
    Ok(published)
}
