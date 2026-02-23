use super::publisher::ConfirmingPublisher;
use super::retry::{classify_error, next_destination};
use super::types::{ErrorClass, JobEnvelope};
use crate::config::AppConfig;
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

    // Critical safety contract: confirm publish before original ack.
    publisher
        .publish_with_confirm(exchange, &decision.destination_queue, &envelope)
        .await?;

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
