use super::{outbox, publisher, schema::SchemaError};
use crate::{
    config::AppConfig,
    observability::{metrics, propagation},
};
use anyhow::Result;
use opentelemetry::Context;
use sqlx::PgPool;
use std::{future::Future, time::Duration};
use tracing_opentelemetry::OpenTelemetrySpanExt;

#[derive(Debug, Default, Clone, Copy)]
pub struct RelayStats {
    pub processed: usize,
    pub published: usize,
    pub blocked: usize,
    pub failed: usize,
}

pub async fn relay_once(pool: &PgPool, cfg: &AppConfig) -> Result<RelayStats> {
    let mut stats = RelayStats::default();

    for _ in 0..cfg.event_relay_batch_size {
        let mut tx = pool.begin().await?;
        let Some(row) = outbox::claim_pending_row_tx(&mut tx).await? else {
            tx.rollback().await?;
            break;
        };

        stats.processed += 1;

        let parent = propagation::extract_context_from_metadata(&row.metadata);
        let correlation_id = row.correlation_id.as_deref().unwrap_or("unknown");
        let span = tracing::info_span!(
            "event.relay.publish",
            correlation_id = %correlation_id,
            stream_name = %row.stream_name,
            event_type = %row.event_type,
            producer_service = %row.producer_service,
            topic_name = %row.topic_name,
            publish_key = %row.publish_key
        );
        span.set_parent(parent);

        {
            let _entered = span.enter();
            let mut event = row.to_event_record();
            if propagation::metadata_has_trace_context(&row.metadata) {
                event.metadata = propagation::merge_observability_metadata(
                    &event.metadata,
                    propagation::observability_payload(correlation_id, &Context::current()),
                );
            }
            match publisher::publish_in_tx(&mut tx, &event).await {
                Ok(event_log_id) => {
                    outbox::mark_published_tx(&mut tx, row.id, event_log_id).await?;
                    stats.published += 1;
                }
                Err(err) => {
                    let is_schema_error = err.downcast_ref::<SchemaError>().is_some();
                    let retry_delay = compute_retry_delay(
                        row.attempt_count,
                        cfg.event_relay_retry_backoff,
                        cfg.event_relay_max_backoff,
                    );
                    let blocked = outbox::mark_failed_or_blocked_tx(
                        &mut tx,
                        &row,
                        &err.to_string(),
                        cfg.event_relay_block_after_attempts as i32,
                        retry_delay,
                        is_schema_error,
                    )
                    .await?;
                    if blocked {
                        stats.blocked += 1;
                    } else {
                        stats.failed += 1;
                    }
                }
            }
        }

        tx.commit().await?;
    }

    if let Ok(pending) = outbox::count_pending(pool).await {
        metrics::set_event_outbox_pending(pending);
    }
    if let Ok(oldest_age) = outbox::oldest_pending_age_seconds(pool).await {
        metrics::set_event_outbox_oldest_age(oldest_age);
    }
    metrics::record_event_outbox_publish("published", stats.published as u64);
    metrics::record_event_outbox_publish("failed", stats.failed as u64);
    metrics::record_event_outbox_publish("blocked", stats.blocked as u64);

    Ok(stats)
}

pub async fn run_relay_loop<F>(pool: PgPool, cfg: AppConfig, shutdown: F) -> Result<()>
where
    F: Future<Output = ()>,
{
    tokio::pin!(shutdown);
    let mut ticker = tokio::time::interval(cfg.event_relay_poll_interval);

    loop {
        tokio::select! {
            _ = &mut shutdown => break,
            _ = ticker.tick() => {
                if let Err(err) = relay_once(&pool, &cfg).await {
                    tracing::error!(error = %err, "event relay iteration failed");
                }
            }
        }
    }

    Ok(())
}

fn compute_retry_delay(attempt_count: i32, base: Duration, max: Duration) -> Duration {
    let next_attempt = attempt_count.saturating_add(1).max(1) as u32;
    let exp = next_attempt.saturating_sub(1).min(16);
    let factor = 1u32.checked_shl(exp).unwrap_or(u32::MAX) as u128;
    let base_ms = base.as_millis().max(1);
    let max_ms = max.as_millis().max(base_ms);
    let delay_ms = (base_ms.saturating_mul(factor)).min(max_ms);
    Duration::from_millis(delay_ms as u64)
}

#[cfg(test)]
mod tests {
    use super::compute_retry_delay;
    use std::time::Duration;

    #[test]
    fn retry_delay_grows_and_caps() {
        let base = Duration::from_millis(1000);
        let max = Duration::from_millis(60_000);
        assert_eq!(
            compute_retry_delay(0, base, max),
            Duration::from_millis(1000)
        );
        assert_eq!(
            compute_retry_delay(1, base, max),
            Duration::from_millis(2000)
        );
        assert_eq!(
            compute_retry_delay(10, base, max),
            Duration::from_millis(60_000)
        );
    }
}
