use super::publisher::ConfirmingPublisher;
use super::retry::{classify_error, next_destination};
use super::types::{ErrorClass, ErrorReasonCode, JobEnvelope};
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
    let classification = classify_error(handler_error);
    let decision = next_destination(
        cfg,
        class_queue_prefix,
        envelope.attempt,
        classification.class,
    );

    // Attempt ownership is envelope-based and only changes when this routing decision changes route.
    envelope.attempt = decision.next_attempt;

    let mut headers = super::publisher::MessageHeaders::new();
    headers.insert(
        "x-correlation-id".to_string(),
        envelope.correlation_id.clone(),
    );
    headers.insert(
        "x-error-class".to_string(),
        match classification.class {
            ErrorClass::Permanent => "permanent",
            ErrorClass::Transient => "transient",
        }
        .to_string(),
    );
    headers.insert(
        "x-error-reason".to_string(),
        classification.reason.as_str().to_string(),
    );
    headers.insert("x-attempt".to_string(), envelope.attempt.to_string());
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
        error_class: classification.class,
        error_reason: classification.reason,
        dead_lettered: decision.dead_letter,
        destination: decision.destination_queue,
        next_attempt: envelope.attempt,
    })
}

#[derive(Debug, Clone)]
pub struct RepublishResult {
    pub error_class: ErrorClass,
    pub error_reason: ErrorReasonCode,
    pub dead_lettered: bool,
    pub destination: String,
    pub next_attempt: u8,
}
