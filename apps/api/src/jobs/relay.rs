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
            if let Some(backfill_run_id) = row.backfill_run_id {
                headers.insert("x-backfill-run-id".to_string(), backfill_run_id.to_string());
            }
            if let Some(source_event_id) = row.source_event_id {
                headers.insert("x-source-event-id".to_string(), source_event_id.to_string());
            }
            if row.delivery_mode == super::types::JobDeliveryMode::Replay {
                headers.insert("x-replayed".to_string(), "true".to_string());
                if let Some(operator_id) = row
                    .metadata
                    .get("operator_id")
                    .and_then(|value| value.as_str())
                {
                    headers.insert("x-replay-operator".to_string(), operator_id.to_string());
                }
                if let Some(reason) = row.metadata.get("reason").and_then(|value| value.as_str()) {
                    headers.insert("x-replay-reason".to_string(), reason.to_string());
                }
            }

            let exchange = match row.delivery_mode {
                super::types::JobDeliveryMode::Primary => &cfg.rabbit_exchange_jobs,
                super::types::JobDeliveryMode::Replay => &cfg.rabbit_exchange_jobs_replay,
            };

            publisher
                .publish_with_confirm(exchange, &row.routing_key, &row.envelope, &headers)
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
