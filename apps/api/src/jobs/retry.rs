use super::types::{ErrorClass, ErrorReasonCode};
use crate::config::AppConfig;

#[derive(Debug, Clone)]
pub struct RetryDecision {
    pub destination_routing_key: String,
    pub next_attempt: u8,
    pub dead_letter: bool,
    pub retry_tier: Option<u8>,
    pub estimated_delay_ms: Option<u64>,
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

    if lower.contains("missing job run") {
        return ErrorClassification {
            class: ErrorClass::Permanent,
            reason: ErrorReasonCode::MissingJobRun,
        };
    }

    ErrorClassification {
        class: ErrorClass::Transient,
        reason: ErrorReasonCode::UnknownTransient,
    }
}

pub fn next_destination(
    cfg: &AppConfig,
    workload_class: &super::types::WorkloadClass,
    current_attempt: u8,
    error_class: ErrorClass,
) -> RetryDecision {
    if error_class == ErrorClass::Permanent || current_attempt >= cfg.rabbit_max_attempts {
        return RetryDecision {
            destination_routing_key: workload_class.dlq_routing_key(),
            next_attempt: current_attempt,
            dead_letter: true,
            retry_tier: None,
            estimated_delay_ms: None,
        };
    }

    let tier = current_attempt.min(3);
    RetryDecision {
        destination_routing_key: workload_class.retry_routing_key(tier),
        next_attempt: current_attempt.saturating_add(1),
        dead_letter: false,
        retry_tier: Some(tier),
        estimated_delay_ms: Some(match tier {
            1 => cfg.rabbit_retry_1_ttl_ms,
            2 => cfg.rabbit_retry_2_ttl_ms,
            _ => cfg.rabbit_retry_3_ttl_ms,
        }),
    }
}
