use super::publisher::ConfirmingPublisher;
use super::retry::{classify_error, next_destination};
use super::types::{ErrorClass, JobEnvelope};
use crate::config::AppConfig;
use crate::observability::{metrics, propagation};
use anyhow::Result;

pub async fn republish_with_confirm_before_ack<P: ConfirmingPublisher>(
    publisher: &P,
    cfg: &AppConfig,
    class_queue_prefix: &str,
    exchange: &str,
    mut envelope: JobEnvelope,
    handler_error: &str,
) -> Result<RepublishResult> {
    let error_class = classify_error(handler_error);
    let decision = next_destination(cfg, class_queue_prefix, envelope.attempt, error_class);

    envelope.attempt = decision.next_attempt;

    let mut headers = super::publisher::MessageHeaders::new();
    headers.insert(
        "x-correlation-id".to_string(),
        envelope.correlation_id.clone(),
    );
    propagation::inject_current_context_to_map(&mut headers);

    // Critical safety contract: confirm publish before original ack.
    publisher
        .publish_with_confirm(exchange, &decision.destination_queue, &envelope, &headers)
        .await?;

    if decision.dead_letter {
        metrics::record_job_dlq(envelope.workload_class.as_str());
    } else {
        metrics::record_job_retry(
            envelope.workload_class.as_str(),
            envelope.attempt.saturating_sub(1).min(3),
        );
    }

    Ok(RepublishResult {
        error_class,
        dead_lettered: decision.dead_letter,
        destination: decision.destination_queue,
        next_attempt: envelope.attempt,
    })
}

#[derive(Debug, Clone)]
pub struct RepublishResult {
    pub error_class: ErrorClass,
    pub dead_lettered: bool,
    pub destination: String,
    pub next_attempt: u8,
}
