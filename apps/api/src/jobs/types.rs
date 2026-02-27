use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum WorkloadClass {
    Fast,
    Heavy,
}

impl WorkloadClass {
    pub fn parse(raw: &str) -> Option<Self> {
        match raw.trim().to_ascii_lowercase().as_str() {
            "fast" => Some(Self::Fast),
            "heavy" => Some(Self::Heavy),
            _ => None,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            WorkloadClass::Fast => "fast",
            WorkloadClass::Heavy => "heavy",
        }
    }

    pub fn primary_prefetch(&self, cfg: &crate::config::AppConfig) -> u16 {
        match self {
            WorkloadClass::Fast => cfg.rabbit_prefetch_fast,
            WorkloadClass::Heavy => cfg.rabbit_prefetch_heavy,
        }
    }

    pub fn replay_prefetch(&self, cfg: &crate::config::AppConfig) -> u16 {
        match self {
            WorkloadClass::Fast => cfg.rabbit_replay_prefetch_fast,
            WorkloadClass::Heavy => cfg.rabbit_replay_prefetch_heavy,
        }
    }

    pub fn primary_routing_key(&self) -> &'static str {
        match self {
            WorkloadClass::Fast => "job.fast",
            WorkloadClass::Heavy => "job.heavy",
        }
    }

    pub fn replay_routing_key(&self) -> &'static str {
        match self {
            WorkloadClass::Fast => "job.fast.replay",
            WorkloadClass::Heavy => "job.heavy.replay",
        }
    }

    pub fn retry_routing_key(&self, tier: u8) -> String {
        format!("{}.retry.{tier}", self.primary_routing_key())
    }

    pub fn dlq_routing_key(&self) -> String {
        format!("{}.dlq", self.primary_routing_key())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobEnvelope {
    pub message_id: String,
    pub correlation_id: String,
    pub attempt: u8,
    pub job_type: String,
    pub payload_version: i32,
    pub producer_service: String,
    pub aggregate_type: String,
    pub aggregate_id: String,
    pub causation_id: String,
    pub workload_class: WorkloadClass,
    pub payload: Value,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorClass {
    Permanent,
    Transient,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorReasonCode {
    SchemaInvalid,
    MissingRequiredRef,
    ImpossibleDomainState,
    DependencyTimeout,
    DependencyUnavailable,
    MissingJobRun,
    UnknownTransient,
    UnknownPermanent,
}

impl ErrorReasonCode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::SchemaInvalid => "schema_invalid",
            Self::MissingRequiredRef => "missing_required_ref",
            Self::ImpossibleDomainState => "impossible_domain_state",
            Self::DependencyTimeout => "dependency_timeout",
            Self::DependencyUnavailable => "dependency_unavailable",
            Self::MissingJobRun => "missing_job_run",
            Self::UnknownTransient => "unknown_transient",
            Self::UnknownPermanent => "unknown_permanent",
        }
    }
}
