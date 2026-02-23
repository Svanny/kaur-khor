use super::types::ErrorClass;
use crate::config::AppConfig;

#[derive(Debug, Clone)]
pub struct RetryDecision {
    pub destination_queue: String,
    pub next_attempt: u8,
    pub dead_letter: bool,
}

pub fn classify_error(error_message: &str) -> ErrorClass {
    let lower = error_message.to_ascii_lowercase();
    if lower.contains("validation")
        || lower.contains("schema")
        || lower.contains("missing required")
        || lower.contains("impossible domain")
    {
        ErrorClass::Permanent
    } else {
        ErrorClass::Transient
    }
}

pub fn next_destination(
    cfg: &AppConfig,
    class_queue_prefix: &str,
    current_attempt: u8,
    error_class: ErrorClass,
) -> RetryDecision {
    if error_class == ErrorClass::Permanent || current_attempt >= cfg.rabbit_max_attempts {
        return RetryDecision {
            destination_queue: format!("{}.dlq", class_queue_prefix),
            next_attempt: current_attempt,
            dead_letter: true,
        };
    }

    let tier = current_attempt.min(3);
    RetryDecision {
        destination_queue: format!("{}.retry.{}", class_queue_prefix, tier),
        next_attempt: current_attempt.saturating_add(1),
        dead_letter: false,
    }
}
