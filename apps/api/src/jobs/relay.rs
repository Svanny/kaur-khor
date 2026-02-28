use super::outbox;
use super::publisher::ConfirmingPublisher;
use crate::config::AppConfig;
use crate::observability::{metrics, propagation};
use anyhow::Result;
use sqlx::PgPool;
use tracing_opentelemetry::OpenTelemetrySpanExt;

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
        let parent = propagation::extract_context_from_metadata(&row.metadata);
        let span = tracing::info_span!(
            "job.relay.publish",
            correlation_id = %row.envelope.correlation_id,
            workload_class = %row.envelope.workload_class.as_str(),
            job_type = %row.envelope.job_type,
            producer_service = %row.envelope.producer_service,
            routing_key = %row.routing_key
        );
        span.set_parent(parent);

        let publish_res = {
            let _entered = span.enter();
            let mut headers = super::publisher::MessageHeaders::new();
            headers.insert(
                "x-correlation-id".to_string(),
                row.envelope.correlation_id.clone(),
            );
            if propagation::metadata_has_trace_context(&row.metadata) {
                propagation::inject_current_context_to_map(&mut headers);
                headers.insert(
                    "x-correlation-id".to_string(),
                    row.envelope.correlation_id.clone(),
                );
            }
            publisher
                .publish_with_confirm(
                    &cfg.rabbit_exchange_jobs,
                    &row.routing_key,
                    &row.envelope,
                    &headers,
                )
                .await
        };

        match publish_res {
            Ok(_) => {
                outbox::mark_sent_tx(&mut tx, row.id).await?;
                metrics::record_job_publish(row.envelope.workload_class.as_str(), "sent");
                published += 1;
            }
            Err(err) => {
                outbox::mark_failed_tx(&mut tx, row.id, &err.to_string()).await?;
                metrics::record_job_publish(row.envelope.workload_class.as_str(), "failed");
            }
        }
    }

    tx.commit().await?;
    if let Ok(pending) = outbox::count_pending(pool, pending_class).await {
        metrics::set_outbox_pending(pending);
    }
    Ok(published)
}
