use serde::{Deserialize, Serialize};
use serde_json::Value;
use banji_sena_core::{SenaDiagnostics, SenaServiceDetail, SenaSkuDetail, SenaWorkspaceSummary};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct InventoryItemCreatedV1Payload {
    pub owner_sub: String,
    pub item_id: String,
    pub sku: String,
    pub name: String,
    pub quantity: i64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct InventoryWriteDemoCompletedV1Payload {
    pub operation: String,
    pub payload: Value,
    pub caller_id: String,
    pub result: Value,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct SenaCatalogUpsertedV1Payload {
    pub owner_sub: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct SenaObservationIngestedV1Payload {
    pub owner_sub: String,
    pub observation_id: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct SenaAnalysisCompletedV1Payload {
    pub owner_sub: String,
    pub run_id: String,
    pub algorithm_version: String,
    pub workspace_summary: SenaWorkspaceSummary,
    pub diagnostics: SenaDiagnostics,
    pub sku_details: Vec<SenaSkuDetail>,
    pub service_details: Vec<SenaServiceDetail>,
}

#[derive(Debug, Clone)]
pub enum KnownEvent {
    InventoryItemCreatedV1(InventoryItemCreatedV1Payload),
    InventoryWriteDemoCompletedV1(InventoryWriteDemoCompletedV1Payload),
    SenaCatalogUpsertedV1(SenaCatalogUpsertedV1Payload),
    SenaObservationIngestedV1(SenaObservationIngestedV1Payload),
    SenaAnalysisCompletedV1(SenaAnalysisCompletedV1Payload),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InvalidEventPolicy {
    Halt,
    Skip,
    Quarantine,
}

impl Default for InvalidEventPolicy {
    fn default() -> Self {
        Self::Halt
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InvalidEventAction {
    Halt,
    Skip,
    Quarantine,
}

impl InvalidEventAction {
    pub fn from_policy(policy: InvalidEventPolicy) -> Self {
        match policy {
            InvalidEventPolicy::Halt => Self::Halt,
            InvalidEventPolicy::Skip => Self::Skip,
            InvalidEventPolicy::Quarantine => Self::Quarantine,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SchemaErrorCode {
    UnknownEventType,
    UnsupportedEventVersion,
    PayloadValidationFailed,
    EnvelopeValidationFailed,
}

impl SchemaErrorCode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::UnknownEventType => "UNKNOWN_EVENT_TYPE",
            Self::UnsupportedEventVersion => "UNSUPPORTED_EVENT_VERSION",
            Self::PayloadValidationFailed => "PAYLOAD_VALIDATION_FAILED",
            Self::EnvelopeValidationFailed => "ENVELOPE_VALIDATION_FAILED",
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct EventSchemaManifestEntry {
    pub event_type: &'static str,
    pub latest_version: i32,
    pub supported_versions: &'static [i32],
    pub aggregate_type: &'static str,
    pub allowed_producer_services: &'static [&'static str],
}
