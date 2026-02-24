use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum WorkloadClass {
    Fast,
    Heavy,
}

impl WorkloadClass {
    pub fn as_str(&self) -> &'static str {
        match self {
            WorkloadClass::Fast => "fast",
            WorkloadClass::Heavy => "heavy",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobEnvelope {
    pub message_id: String,
    pub correlation_id: String,
    pub attempt: u8,
    pub job_type: String,
    pub workload_class: WorkloadClass,
    pub payload: Value,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorClass {
    Permanent,
    Transient,
}
