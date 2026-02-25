use super::types::{ErrorClass, ErrorReasonCode};
use crate::config::AppConfig;

#[derive(Debug, Clone)]
pub struct RetryDecision {
    pub destination_queue: String,
    pub next_attempt: u8,
    pub dead_letter: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ErrorClassification {
    pub class: ErrorClass,
    pub reason: ErrorReasonCode,
}

pub fn classify_error(error_message: &str) -> ErrorClassification {
    let lower = error_message.to_ascii_lowercase();
    if lower.contains("validation") || lower.contains("schema") {
        return ErrorClassification {
            class: ErrorClass::Permanent,
            reason: ErrorReasonCode::SchemaInvalid,
        };
    }

    if lower.contains("missing required")
        || lower.contains("missing immutable")
        || lower.contains("required ref")
    {
        return ErrorClassification {
            class: ErrorClass::Permanent,
            reason: ErrorReasonCode::MissingRequiredRef,
        };
    }

    if lower.contains("impossible domain")
        || lower.contains("invariant")
        || lower.contains("non-retryable")
    {
        return ErrorClassification {
            class: ErrorClass::Permanent,
            reason: ErrorReasonCode::ImpossibleDomainState,
        };
    }

    if lower.contains("timeout") || lower.contains("timed out") {
        return ErrorClassification {
            class: ErrorClass::Transient,
            reason: ErrorReasonCode::DependencyTimeout,
        };
    }

    if lower.contains("unavailable")
        || lower.contains("temporarily unavailable")
        || lower.contains("connection refused")
        || lower.contains("network")
    {
        return ErrorClassification {
            class: ErrorClass::Transient,
            reason: ErrorReasonCode::DependencyUnavailable,
        };
    }

    if lower.contains("unknown permanent") || lower.contains("fatal permanent") {
        return ErrorClassification {
            class: ErrorClass::Permanent,
            reason: ErrorReasonCode::UnknownPermanent,
        };
    }

    ErrorClassification {
        class: ErrorClass::Transient,
        reason: ErrorReasonCode::UnknownTransient,
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
