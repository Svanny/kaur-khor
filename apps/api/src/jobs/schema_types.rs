use super::types::WorkloadClass;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::PathBuf;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ItemCreatedJobV1Payload {
    pub owner_sub: String,
    pub item_id: String,
    pub idempotency_key: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ItemCreatedJobV1Result {
    pub owner_sub: String,
    pub item_id: String,
    pub sku: String,
    pub name: String,
    pub quantity: i64,
    pub algorithm_version: String,
    pub computed_at: i64,
    pub summary_checksum: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct WriteDemoJobV1Payload {
    pub operation: String,
    pub caller_id: String,
    pub idempotency_key: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct WriteDemoJobV1Result {
    pub operation: String,
    pub caller_id: String,
    pub algorithm_version: String,
    pub result: Value,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct WriteDemoJobV2Result {
    pub operation: String,
    pub caller_id: String,
    pub algorithm_version: String,
    pub artifact_count: i32,
    pub primary_artifact_role: String,
    pub primary_artifact_key: String,
    pub primary_artifact_sha256: String,
    pub primary_artifact_bytes: i64,
}

#[derive(Debug, Clone)]
pub enum KnownJob {
    ItemCreatedV1(ItemCreatedJobV1Payload),
    WriteDemoV1(WriteDemoJobV1Payload),
}

#[derive(Debug, Clone)]
pub enum KnownJobResult {
    ItemCreatedV1(ItemCreatedJobV1Result),
    WriteDemoV1(WriteDemoJobV1Result),
    WriteDemoV2(WriteDemoJobV2Result),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum JobSchemaErrorCode {
    UnknownJobType,
    UnsupportedPayloadVersion,
    UnsupportedResultVersion,
    PayloadValidationFailed,
    ResultValidationFailed,
    EnvelopeValidationFailed,
}

impl JobSchemaErrorCode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::UnknownJobType => "UNKNOWN_JOB_TYPE",
            Self::UnsupportedPayloadVersion => "UNSUPPORTED_PAYLOAD_VERSION",
            Self::UnsupportedResultVersion => "UNSUPPORTED_RESULT_VERSION",
            Self::PayloadValidationFailed => "PAYLOAD_VALIDATION_FAILED",
            Self::ResultValidationFailed => "RESULT_VALIDATION_FAILED",
            Self::EnvelopeValidationFailed => "ENVELOPE_VALIDATION_FAILED",
        }
    }
}

#[derive(Debug, Clone)]
pub struct JobSchemaManifestEntry {
    pub job_type: &'static str,
    pub latest_payload_version: i32,
    pub supported_payload_versions: &'static [i32],
    pub latest_result_version: i32,
    pub supported_result_versions: &'static [i32],
    pub workload_class: WorkloadClass,
    pub aggregate_type: &'static str,
    pub routing_key: &'static str,
    pub allowed_producer_services: &'static [&'static str],
}

#[derive(Debug, Clone)]
pub struct JobRecord {
    pub job_key: String,
    pub job_type: String,
    pub payload_version: i32,
    pub workload_class: WorkloadClass,
    pub producer_service: String,
    pub aggregate_type: String,
    pub aggregate_id: String,
    pub causation_id: String,
    pub correlation_id: String,
    pub routing_key: String,
    pub payload: Value,
    pub max_attempts: i32,
}

#[derive(Debug, Clone)]
pub struct JobResultRecord {
    pub job_key: String,
    pub job_type: String,
    pub result_version: i32,
    pub payload: Value,
}

#[derive(Debug, Clone)]
pub struct JobArtifactOutput {
    pub artifact_role: String,
    pub artifact_version: i32,
    pub artifact_key: String,
    pub content_type: String,
    pub file_extension: String,
    pub local_path: PathBuf,
    pub sha256: String,
    pub content_length: i64,
    pub metadata: Value,
}

#[derive(Debug, Clone)]
pub struct JobExecutionOutput {
    pub result: JobResultRecord,
    pub artifacts: Vec<JobArtifactOutput>,
    pub cleanup_paths: Vec<PathBuf>,
}
