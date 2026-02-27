use super::{
    key::derive_job_key,
    schema_types::{
        ItemCreatedJobV1Payload, ItemCreatedJobV1Result, JobRecord, JobResultRecord,
        JobSchemaErrorCode, JobSchemaManifestEntry, KnownJob, KnownJobResult,
        WriteDemoJobV1Payload, WriteDemoJobV1Result,
    },
    types::{JobEnvelope, WorkloadClass},
};
use crate::{idempotency::validate_idempotency_key, items::types::validate_item_id};
use serde_json::{json, Value};
use std::{
    fmt,
    time::{SystemTime, UNIX_EPOCH},
};

const ITEM_CREATED: &str = "item-created";
const WRITE_DEMO: &str = "write-demo";

const V1: [i32; 1] = [1];
const PRODUCER_API_ONLY: [&str; 1] = ["api"];

const JOB_SCHEMA_MANIFEST: [JobSchemaManifestEntry; 2] = [
    JobSchemaManifestEntry {
        job_type: ITEM_CREATED,
        latest_payload_version: 1,
        supported_payload_versions: &V1,
        latest_result_version: 1,
        supported_result_versions: &V1,
        workload_class: WorkloadClass::Fast,
        aggregate_type: "item",
        routing_key: "job.fast",
        allowed_producer_services: &PRODUCER_API_ONLY,
    },
    JobSchemaManifestEntry {
        job_type: WRITE_DEMO,
        latest_payload_version: 1,
        supported_payload_versions: &V1,
        latest_result_version: 1,
        supported_result_versions: &V1,
        workload_class: WorkloadClass::Fast,
        aggregate_type: "write-demo",
        routing_key: "job.fast",
        allowed_producer_services: &PRODUCER_API_ONLY,
    },
];

#[derive(Debug, Clone)]
pub struct JobSchemaError {
    pub code: JobSchemaErrorCode,
    pub message: String,
}

impl JobSchemaError {
    fn new(code: JobSchemaErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

impl fmt::Display for JobSchemaError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {}", self.code.as_str(), self.message)
    }
}

impl std::error::Error for JobSchemaError {}

pub fn job_registry_manifest() -> &'static [JobSchemaManifestEntry] {
    &JOB_SCHEMA_MANIFEST
}

pub fn validate_job_envelope(envelope: &JobEnvelope) -> Result<KnownJob, JobSchemaError> {
    let schema = schema_for_type(&envelope.job_type).ok_or_else(|| {
        JobSchemaError::new(
            JobSchemaErrorCode::UnknownJobType,
            format!("job_type '{}' is not registered", envelope.job_type),
        )
    })?;

    validate_envelope(envelope, schema)?;

    match (envelope.job_type.as_str(), envelope.payload_version) {
        (ITEM_CREATED, 1) => {
            let payload: ItemCreatedJobV1Payload = serde_json::from_value(envelope.payload.clone())
                .map_err(|err| {
                    JobSchemaError::new(
                        JobSchemaErrorCode::PayloadValidationFailed,
                        format!("item-created v1 decode failed: {err}"),
                    )
                })?;
            validate_item_created_payload(envelope, &payload)?;
            Ok(KnownJob::ItemCreatedV1(payload))
        }
        (WRITE_DEMO, 1) => {
            let payload: WriteDemoJobV1Payload = serde_json::from_value(envelope.payload.clone())
                .map_err(|err| {
                JobSchemaError::new(
                    JobSchemaErrorCode::PayloadValidationFailed,
                    format!("write-demo v1 decode failed: {err}"),
                )
            })?;
            validate_write_demo_payload(envelope, &payload)?;
            Ok(KnownJob::WriteDemoV1(payload))
        }
        (job_type, version) => Err(JobSchemaError::new(
            JobSchemaErrorCode::UnsupportedPayloadVersion,
            format!("unsupported payload version {version} for job_type '{job_type}'"),
        )),
    }
}

pub fn validate_job_result(
    job_type: &str,
    result_version: i32,
    payload: &Value,
) -> Result<KnownJobResult, JobSchemaError> {
    let schema = schema_for_type(job_type).ok_or_else(|| {
        JobSchemaError::new(
            JobSchemaErrorCode::UnknownJobType,
            format!("job_type '{}' is not registered", job_type),
        )
    })?;
    if !schema.supported_result_versions.contains(&result_version) {
        return Err(JobSchemaError::new(
            JobSchemaErrorCode::UnsupportedResultVersion,
            format!("unsupported result version {result_version} for job_type '{job_type}'"),
        ));
    }

    match (job_type, result_version) {
        (ITEM_CREATED, 1) => {
            let result: ItemCreatedJobV1Result =
                serde_json::from_value(payload.clone()).map_err(|err| {
                    JobSchemaError::new(
                        JobSchemaErrorCode::ResultValidationFailed,
                        format!("item-created result v1 decode failed: {err}"),
                    )
                })?;
            validate_item_created_result(&result)?;
            Ok(KnownJobResult::ItemCreatedV1(result))
        }
        (WRITE_DEMO, 1) => {
            let result: WriteDemoJobV1Result =
                serde_json::from_value(payload.clone()).map_err(|err| {
                    JobSchemaError::new(
                        JobSchemaErrorCode::ResultValidationFailed,
                        format!("write-demo result v1 decode failed: {err}"),
                    )
                })?;
            validate_write_demo_result(&result)?;
            Ok(KnownJobResult::WriteDemoV1(result))
        }
        (_, version) => Err(JobSchemaError::new(
            JobSchemaErrorCode::UnsupportedResultVersion,
            format!("unsupported result version {version}"),
        )),
    }
}

pub fn build_item_created_job_v1(
    producer_service: String,
    owner_sub: String,
    item_id: String,
    idempotency_key: String,
    correlation_id: String,
    max_attempts: u8,
) -> Result<JobRecord, JobSchemaError> {
    let aggregate_id = format!("{owner_sub}:{item_id}");
    let payload = json!({
        "owner_sub": owner_sub,
        "item_id": item_id,
        "idempotency_key": idempotency_key
    });

    let record = JobRecord {
        job_key: derive_job_key(
            &producer_service,
            ITEM_CREATED,
            "item",
            &aggregate_id,
            payload["idempotency_key"].as_str().unwrap_or_default(),
        ),
        job_type: ITEM_CREATED.to_string(),
        payload_version: 1,
        workload_class: WorkloadClass::Fast,
        producer_service,
        aggregate_type: "item".to_string(),
        aggregate_id,
        causation_id: payload["idempotency_key"]
            .as_str()
            .unwrap_or_default()
            .to_string(),
        correlation_id,
        routing_key: WorkloadClass::Fast.primary_routing_key().to_string(),
        payload,
        max_attempts: i32::from(max_attempts),
    };

    let envelope = record_to_envelope(&record, 1);
    validate_job_envelope(&envelope)?;
    Ok(record)
}

pub fn build_write_demo_job_v1(
    producer_service: String,
    operation: String,
    caller_id: String,
    idempotency_key: String,
    correlation_id: String,
    max_attempts: u8,
) -> Result<JobRecord, JobSchemaError> {
    let aggregate_id = format!("{caller_id}:{operation}");
    let payload = json!({
        "operation": operation,
        "caller_id": caller_id,
        "idempotency_key": idempotency_key
    });

    let record = JobRecord {
        job_key: derive_job_key(
            &producer_service,
            WRITE_DEMO,
            "write-demo",
            &aggregate_id,
            payload["idempotency_key"].as_str().unwrap_or_default(),
        ),
        job_type: WRITE_DEMO.to_string(),
        payload_version: 1,
        workload_class: WorkloadClass::Fast,
        producer_service,
        aggregate_type: "write-demo".to_string(),
        aggregate_id,
        causation_id: payload["idempotency_key"]
            .as_str()
            .unwrap_or_default()
            .to_string(),
        correlation_id,
        routing_key: WorkloadClass::Fast.primary_routing_key().to_string(),
        payload,
        max_attempts: i32::from(max_attempts),
    };

    let envelope = record_to_envelope(&record, 1);
    validate_job_envelope(&envelope)?;
    Ok(record)
}

pub fn build_item_created_result_v1(
    owner_sub: String,
    item_id: String,
    sku: String,
    name: String,
    quantity: i64,
    algorithm_version: &str,
) -> Result<JobResultRecord, JobSchemaError> {
    let computed_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or_default();
    let summary_checksum = summary_checksum(&[
        owner_sub.as_str(),
        item_id.as_str(),
        sku.as_str(),
        name.as_str(),
        &quantity.to_string(),
        algorithm_version,
    ]);
    let payload = json!({
        "owner_sub": owner_sub,
        "item_id": item_id,
        "sku": sku,
        "name": name,
        "quantity": quantity,
        "algorithm_version": algorithm_version,
        "computed_at": computed_at,
        "summary_checksum": summary_checksum,
    });
    validate_job_result(ITEM_CREATED, 1, &payload)?;
    Ok(JobResultRecord {
        job_key: String::new(),
        job_type: ITEM_CREATED.to_string(),
        result_version: 1,
        payload,
    })
}

pub fn build_write_demo_result_v1(
    operation: String,
    caller_id: String,
    result: Value,
    algorithm_version: &str,
) -> Result<JobResultRecord, JobSchemaError> {
    let payload = json!({
        "operation": operation,
        "caller_id": caller_id,
        "algorithm_version": algorithm_version,
        "result": result,
    });
    validate_job_result(WRITE_DEMO, 1, &payload)?;
    Ok(JobResultRecord {
        job_key: String::new(),
        job_type: WRITE_DEMO.to_string(),
        result_version: 1,
        payload,
    })
}

pub fn record_to_envelope(record: &JobRecord, attempt: u8) -> JobEnvelope {
    JobEnvelope {
        message_id: record.job_key.clone(),
        correlation_id: record.correlation_id.clone(),
        attempt,
        job_type: record.job_type.clone(),
        payload_version: record.payload_version,
        producer_service: record.producer_service.clone(),
        aggregate_type: record.aggregate_type.clone(),
        aggregate_id: record.aggregate_id.clone(),
        causation_id: record.causation_id.clone(),
        workload_class: record.workload_class.clone(),
        payload: record.payload.clone(),
    }
}

fn validate_envelope(
    envelope: &JobEnvelope,
    schema: &JobSchemaManifestEntry,
) -> Result<(), JobSchemaError> {
    if envelope.message_id.trim().is_empty() {
        return Err(JobSchemaError::new(
            JobSchemaErrorCode::EnvelopeValidationFailed,
            "message_id must not be empty",
        ));
    }
    if envelope.correlation_id.trim().is_empty() || envelope.correlation_id.len() > 64 {
        return Err(JobSchemaError::new(
            JobSchemaErrorCode::EnvelopeValidationFailed,
            "correlation_id must be 1..64 characters",
        ));
    }
    if envelope.attempt == 0 {
        return Err(JobSchemaError::new(
            JobSchemaErrorCode::EnvelopeValidationFailed,
            "attempt must be >= 1",
        ));
    }
    if !schema
        .supported_payload_versions
        .contains(&envelope.payload_version)
    {
        return Err(JobSchemaError::new(
            JobSchemaErrorCode::UnsupportedPayloadVersion,
            format!(
                "job_type '{}' does not support payload version {}",
                envelope.job_type, envelope.payload_version
            ),
        ));
    }
    if envelope.aggregate_type != schema.aggregate_type {
        return Err(JobSchemaError::new(
            JobSchemaErrorCode::EnvelopeValidationFailed,
            format!(
                "aggregate_type '{}' does not match schema '{}'",
                envelope.aggregate_type, schema.aggregate_type
            ),
        ));
    }
    if envelope.workload_class.as_str() != schema.workload_class.as_str() {
        return Err(JobSchemaError::new(
            JobSchemaErrorCode::EnvelopeValidationFailed,
            format!(
                "workload_class '{}' does not match schema '{}'",
                envelope.workload_class.as_str(),
                schema.workload_class.as_str()
            ),
        ));
    }
    if !schema
        .allowed_producer_services
        .contains(&envelope.producer_service.as_str())
    {
        return Err(JobSchemaError::new(
            JobSchemaErrorCode::EnvelopeValidationFailed,
            format!(
                "producer_service '{}' is not allowed for job_type '{}'",
                envelope.producer_service, envelope.job_type
            ),
        ));
    }
    if envelope.aggregate_id.trim().is_empty() || envelope.causation_id.trim().is_empty() {
        return Err(JobSchemaError::new(
            JobSchemaErrorCode::EnvelopeValidationFailed,
            "aggregate_id and causation_id must not be empty",
        ));
    }
    let expected_key = derive_job_key(
        &envelope.producer_service,
        &envelope.job_type,
        &envelope.aggregate_type,
        &envelope.aggregate_id,
        &envelope.causation_id,
    );
    if envelope.message_id != expected_key {
        return Err(JobSchemaError::new(
            JobSchemaErrorCode::EnvelopeValidationFailed,
            "message_id does not match deterministic job_key derivation",
        ));
    }
    Ok(())
}

fn validate_item_created_payload(
    envelope: &JobEnvelope,
    payload: &ItemCreatedJobV1Payload,
) -> Result<(), JobSchemaError> {
    validate_owner_sub(&payload.owner_sub)?;
    validate_item_id(&payload.item_id).map_err(|err| {
        JobSchemaError::new(
            JobSchemaErrorCode::PayloadValidationFailed,
            format!("invalid item_id: {err}"),
        )
    })?;
    validate_idempotency_key(&payload.idempotency_key).map_err(|err| {
        JobSchemaError::new(
            JobSchemaErrorCode::PayloadValidationFailed,
            format!("invalid idempotency_key: {err}"),
        )
    })?;
    let expected_aggregate_id = format!("{}:{}", payload.owner_sub, payload.item_id);
    if envelope.aggregate_id != expected_aggregate_id {
        return Err(JobSchemaError::new(
            JobSchemaErrorCode::EnvelopeValidationFailed,
            "aggregate_id must equal '{owner_sub}:{item_id}' for item-created",
        ));
    }
    if envelope.causation_id != payload.idempotency_key {
        return Err(JobSchemaError::new(
            JobSchemaErrorCode::EnvelopeValidationFailed,
            "causation_id must equal payload idempotency_key for item-created",
        ));
    }
    Ok(())
}

fn validate_write_demo_payload(
    envelope: &JobEnvelope,
    payload: &WriteDemoJobV1Payload,
) -> Result<(), JobSchemaError> {
    if payload.operation.trim().is_empty() || payload.operation.len() > 120 {
        return Err(JobSchemaError::new(
            JobSchemaErrorCode::PayloadValidationFailed,
            "operation must be 1..120 characters",
        ));
    }
    if payload.caller_id.trim().is_empty() || payload.caller_id.len() > 128 {
        return Err(JobSchemaError::new(
            JobSchemaErrorCode::PayloadValidationFailed,
            "caller_id must be 1..128 characters",
        ));
    }
    validate_idempotency_key(&payload.idempotency_key).map_err(|err| {
        JobSchemaError::new(
            JobSchemaErrorCode::PayloadValidationFailed,
            format!("invalid idempotency_key: {err}"),
        )
    })?;
    let expected_aggregate_id = format!("{}:{}", payload.caller_id, payload.operation);
    if envelope.aggregate_id != expected_aggregate_id {
        return Err(JobSchemaError::new(
            JobSchemaErrorCode::EnvelopeValidationFailed,
            "aggregate_id must equal '{caller_id}:{operation}' for write-demo",
        ));
    }
    if envelope.causation_id != payload.idempotency_key {
        return Err(JobSchemaError::new(
            JobSchemaErrorCode::EnvelopeValidationFailed,
            "causation_id must equal payload idempotency_key for write-demo",
        ));
    }
    Ok(())
}

fn validate_item_created_result(result: &ItemCreatedJobV1Result) -> Result<(), JobSchemaError> {
    validate_owner_sub(&result.owner_sub)?;
    validate_item_id(&result.item_id).map_err(|err| {
        JobSchemaError::new(
            JobSchemaErrorCode::ResultValidationFailed,
            format!("invalid item_id: {err}"),
        )
    })?;
    if result.sku.trim().is_empty() || result.name.trim().is_empty() {
        return Err(JobSchemaError::new(
            JobSchemaErrorCode::ResultValidationFailed,
            "sku and name must not be empty",
        ));
    }
    if !(0..=1_000_000).contains(&result.quantity) {
        return Err(JobSchemaError::new(
            JobSchemaErrorCode::ResultValidationFailed,
            "quantity must be within 0..=1000000",
        ));
    }
    if result.algorithm_version.trim().is_empty() || result.summary_checksum.trim().is_empty() {
        return Err(JobSchemaError::new(
            JobSchemaErrorCode::ResultValidationFailed,
            "algorithm_version and summary_checksum must not be empty",
        ));
    }
    Ok(())
}

fn validate_write_demo_result(result: &WriteDemoJobV1Result) -> Result<(), JobSchemaError> {
    if result.operation.trim().is_empty()
        || result.caller_id.trim().is_empty()
        || result.algorithm_version.trim().is_empty()
    {
        return Err(JobSchemaError::new(
            JobSchemaErrorCode::ResultValidationFailed,
            "operation, caller_id, and algorithm_version must not be empty",
        ));
    }
    Ok(())
}

fn validate_owner_sub(value: &str) -> Result<(), JobSchemaError> {
    if value.trim().is_empty() || value.len() > 128 {
        return Err(JobSchemaError::new(
            JobSchemaErrorCode::PayloadValidationFailed,
            "owner_sub must be 1..128 characters",
        ));
    }
    Ok(())
}

fn schema_for_type(job_type: &str) -> Option<&'static JobSchemaManifestEntry> {
    JOB_SCHEMA_MANIFEST
        .iter()
        .find(|entry| entry.job_type == job_type)
}

fn summary_checksum(parts: &[&str]) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    for part in parts {
        hasher.update(part.as_bytes());
        hasher.update(b"|");
    }
    format!("{:x}", hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn item_created_job_builder_is_deterministic() {
        let a = build_item_created_job_v1(
            "api".to_string(),
            "user-a".to_string(),
            "item-1".to_string(),
            "idem-1".to_string(),
            "corr-1".to_string(),
            4,
        )
        .unwrap();
        let b = build_item_created_job_v1(
            "api".to_string(),
            "user-a".to_string(),
            "item-1".to_string(),
            "idem-1".to_string(),
            "corr-1".to_string(),
            4,
        )
        .unwrap();
        assert_eq!(a.job_key, b.job_key);
        assert_eq!(a.routing_key, "job.fast");
    }

    #[test]
    fn unknown_job_type_is_rejected() {
        let envelope = JobEnvelope {
            message_id: "abc".to_string(),
            correlation_id: "corr-1".to_string(),
            attempt: 1,
            job_type: "unknown".to_string(),
            payload_version: 1,
            producer_service: "api".to_string(),
            aggregate_type: "item".to_string(),
            aggregate_id: "owner:item".to_string(),
            causation_id: "idem-1".to_string(),
            workload_class: WorkloadClass::Fast,
            payload: json!({}),
        };
        let err = validate_job_envelope(&envelope).unwrap_err();
        assert_eq!(err.code.as_str(), "UNKNOWN_JOB_TYPE");
    }
}
