use super::{outbox, publisher};
use crate::{config::AppConfig, observability::metrics};
use anyhow::Result;
use sqlx::PgPool;
use std::{future::Future, time::Duration};

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

        let event = row.to_event_record();
        match publisher::publish_in_tx(&mut tx, &event).await {
            Ok(event_log_id) => {
                outbox::mark_published_tx(&mut tx, row.id, event_log_id).await?;
                stats.published += 1;
            }
            Err(err) => {
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
                )
                .await?;
                if blocked {
                    stats.blocked += 1;
                } else {
                    stats.failed += 1;
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
