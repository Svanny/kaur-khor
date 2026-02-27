use super::{
    key::derive_publish_key,
    model::{EventRecord, EventRow},
    schema_types::{
        EventSchemaManifestEntry, InvalidEventAction, InvalidEventPolicy,
        InventoryItemCreatedV1Payload, InventoryWriteDemoCompletedV1Payload, KnownEvent,
        SchemaErrorCode,
    },
};
use crate::{
    idempotency::validate_idempotency_key,
    items::types::{validate_item_id, validate_sku},
};
use serde_json::{json, Value};
use std::fmt;

const INVENTORY_ITEM_CREATED: &str = "inventory.item.created";
const INVENTORY_WRITE_DEMO_COMPLETED: &str = "inventory.write-demo.completed";

const V1: [i32; 1] = [1];
const PRODUCER_API_ONLY: [&str; 1] = ["api"];

const EVENT_SCHEMA_MANIFEST: [EventSchemaManifestEntry; 2] = [
    EventSchemaManifestEntry {
        event_type: INVENTORY_ITEM_CREATED,
        latest_version: 1,
        supported_versions: &V1,
        aggregate_type: "item",
        allowed_producer_services: &PRODUCER_API_ONLY,
    },
    EventSchemaManifestEntry {
        event_type: INVENTORY_WRITE_DEMO_COMPLETED,
        latest_version: 1,
        supported_versions: &V1,
        aggregate_type: "write-demo",
        allowed_producer_services: &PRODUCER_API_ONLY,
    },
];

#[derive(Debug, Clone)]
pub struct SchemaError {
    pub code: SchemaErrorCode,
    pub action: InvalidEventAction,
    pub message: String,
}

impl SchemaError {
    pub fn new(code: SchemaErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            action: InvalidEventAction::Halt,
            message: message.into(),
        }
    }

    pub fn with_policy(mut self, policy: InvalidEventPolicy) -> Self {
        self.action = InvalidEventAction::from_policy(policy);
        self
    }
}

impl fmt::Display for SchemaError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {}", self.code.as_str(), self.message)
    }
}

impl std::error::Error for SchemaError {}

pub fn registry_manifest() -> &'static [EventSchemaManifestEntry] {
    &EVENT_SCHEMA_MANIFEST
}

pub fn latest_version(event_type: &str) -> Option<i32> {
    schema_for_type(event_type).map(|entry| entry.latest_version)
}

pub fn validate_event_record(record: &EventRecord) -> Result<(), SchemaError> {
    decode_record(record).map(|_| ())
}

pub fn decode_event_row(
    row: &EventRow,
    policy: InvalidEventPolicy,
) -> Result<KnownEvent, SchemaError> {
    let record = EventRecord {
        publish_key: row.publish_key.clone(),
        stream_name: row.stream_name.clone(),
        env_name: row.env_name.clone(),
        topic_name: row.topic_name.clone(),
        event_type: row.event_type.clone(),
        event_version: row.event_version,
        aggregate_type: row.aggregate_type.clone(),
        aggregate_id: row.aggregate_id.clone(),
        producer_service: row.producer_service.clone(),
        idempotency_key: row.idempotency_key.clone(),
        correlation_id: row.correlation_id.clone(),
        causation_id: row.causation_id.clone(),
        payload: row.payload.clone(),
        metadata: row.metadata.clone(),
    };
    decode_record(&record).map_err(|err| err.with_policy(policy))
}

pub fn build_inventory_item_created_v1(
    stream_name: String,
    producer_service: String,
    owner_sub: String,
    item_id: String,
    sku: String,
    name: String,
    quantity: i64,
    idempotency_key: String,
    correlation_id: Option<String>,
    metadata: Value,
) -> Result<EventRecord, SchemaError> {
    let payload = json!({
        "owner_sub": owner_sub,
        "item_id": item_id,
        "sku": sku,
        "name": name.trim(),
        "quantity": quantity
    });

    let record = EventRecord::new(
        stream_name,
        INVENTORY_ITEM_CREATED.to_string(),
        1,
        "item".to_string(),
        item_id,
        producer_service,
        Some(idempotency_key.clone()),
        correlation_id,
        idempotency_key,
        payload,
        metadata,
    );
    validate_event_record(&record)?;
    Ok(record)
}

pub fn build_inventory_write_demo_completed_v1(
    stream_name: String,
    producer_service: String,
    caller_id: String,
    operation: String,
    payload: Value,
    result: Value,
    idempotency_key: String,
    correlation_id: Option<String>,
    metadata: Value,
) -> Result<EventRecord, SchemaError> {
    let event_payload = json!({
        "operation": operation,
        "payload": payload,
        "caller_id": caller_id,
        "result": result
    });

    let record = EventRecord::new(
        stream_name,
        INVENTORY_WRITE_DEMO_COMPLETED.to_string(),
        1,
        "write-demo".to_string(),
        caller_id,
        producer_service,
        Some(idempotency_key.clone()),
        correlation_id,
        idempotency_key,
        event_payload,
        metadata,
    );
    validate_event_record(&record)?;
    Ok(record)
}

fn decode_record(record: &EventRecord) -> Result<KnownEvent, SchemaError> {
    let schema = schema_for_type(&record.event_type).ok_or_else(|| {
        SchemaError::new(
            SchemaErrorCode::UnknownEventType,
            format!("event_type '{}' is not registered", record.event_type),
        )
    })?;
    validate_envelope(record, schema)?;

    match (record.event_type.as_str(), record.event_version) {
        (INVENTORY_ITEM_CREATED, 1) => {
            let payload: InventoryItemCreatedV1Payload =
                serde_json::from_value(record.payload.clone()).map_err(|err| {
                    SchemaError::new(
                        SchemaErrorCode::PayloadValidationFailed,
                        format!("inventory.item.created v1 decode failed: {err}"),
                    )
                })?;
            validate_inventory_item_created_v1(record, &payload)?;
            Ok(KnownEvent::InventoryItemCreatedV1(payload))
        }
        (INVENTORY_WRITE_DEMO_COMPLETED, 1) => {
            let payload: InventoryWriteDemoCompletedV1Payload =
                serde_json::from_value(record.payload.clone()).map_err(|err| {
                    SchemaError::new(
                        SchemaErrorCode::PayloadValidationFailed,
                        format!("inventory.write-demo.completed v1 decode failed: {err}"),
                    )
                })?;
            validate_write_demo_completed_v1(record, &payload)?;
            Ok(KnownEvent::InventoryWriteDemoCompletedV1(payload))
        }
        (event_type, version) => Err(SchemaError::new(
            SchemaErrorCode::UnsupportedEventVersion,
            format!("unsupported event version {version} for event_type '{event_type}'"),
        )),
    }
}

fn validate_envelope(
    record: &EventRecord,
    schema: &EventSchemaManifestEntry,
) -> Result<(), SchemaError> {
    if record.event_version < 1 {
        return Err(SchemaError::new(
            SchemaErrorCode::EnvelopeValidationFailed,
            "event_version must be >= 1",
        ));
    }
    if !schema.supported_versions.contains(&record.event_version) {
        return Err(SchemaError::new(
            SchemaErrorCode::UnsupportedEventVersion,
            format!(
                "event_type '{}' does not support version {}",
                record.event_type, record.event_version
            ),
        ));
    }

    ensure_non_empty("stream_name", &record.stream_name)?;
    ensure_non_empty("aggregate_type", &record.aggregate_type)?;
    ensure_non_empty("aggregate_id", &record.aggregate_id)?;
    ensure_non_empty("producer_service", &record.producer_service)?;
    ensure_non_empty("causation_id", &record.causation_id)?;
    if let Some(idem) = &record.idempotency_key {
        validate_idempotency_key(idem).map_err(|err| {
            SchemaError::new(
                SchemaErrorCode::EnvelopeValidationFailed,
                format!("invalid envelope idempotency_key: {err}"),
            )
        })?;
    }

    if record.aggregate_type != schema.aggregate_type {
        return Err(SchemaError::new(
            SchemaErrorCode::EnvelopeValidationFailed,
            format!(
                "aggregate_type '{}' does not match schema '{}'",
                record.aggregate_type, schema.aggregate_type
            ),
        ));
    }
    if !schema
        .allowed_producer_services
        .iter()
        .any(|svc| *svc == record.producer_service)
    {
        return Err(SchemaError::new(
            SchemaErrorCode::EnvelopeValidationFailed,
            format!(
                "producer_service '{}' is not allowed for event_type '{}'",
                record.producer_service, record.event_type
            ),
        ));
    }

    let (_system, env, topic) = split_stream_name(&record.stream_name)?;
    if env != record.env_name {
        return Err(SchemaError::new(
            SchemaErrorCode::EnvelopeValidationFailed,
            format!(
                "env_name '{}' does not match stream_name env '{}'",
                record.env_name, env
            ),
        ));
    }
    if topic != record.topic_name {
        return Err(SchemaError::new(
            SchemaErrorCode::EnvelopeValidationFailed,
            format!(
                "topic_name '{}' does not match stream_name topic '{}'",
                record.topic_name, topic
            ),
        ));
    }

    let expected_key = derive_publish_key(
        &record.producer_service,
        &record.event_type,
        &record.aggregate_type,
        &record.aggregate_id,
        &record.causation_id,
    );
    if record.publish_key != expected_key {
        return Err(SchemaError::new(
            SchemaErrorCode::EnvelopeValidationFailed,
            "publish_key does not match canonical derivation",
        ));
    }

    Ok(())
}

fn validate_inventory_item_created_v1(
    record: &EventRecord,
    payload: &InventoryItemCreatedV1Payload,
) -> Result<(), SchemaError> {
    ensure_non_empty("payload.owner_sub", &payload.owner_sub)?;
    validate_item_id(&payload.item_id).map_err(|err| {
        SchemaError::new(
            SchemaErrorCode::PayloadValidationFailed,
            format!("payload.item_id invalid: {err}"),
        )
    })?;
    validate_sku(&payload.sku).map_err(|err| {
        SchemaError::new(
            SchemaErrorCode::PayloadValidationFailed,
            format!("payload.sku invalid: {err}"),
        )
    })?;
    let trimmed = payload.name.trim();
    if trimmed.is_empty() || trimmed.len() > 120 {
        return Err(SchemaError::new(
            SchemaErrorCode::PayloadValidationFailed,
            "payload.name must be 1..120 characters after trimming",
        ));
    }
    if !(0..=1_000_000).contains(&payload.quantity) {
        return Err(SchemaError::new(
            SchemaErrorCode::PayloadValidationFailed,
            "payload.quantity must be within 0..=1000000",
        ));
    }
    if record.aggregate_id != payload.item_id {
        return Err(SchemaError::new(
            SchemaErrorCode::EnvelopeValidationFailed,
            "aggregate_id must equal payload.item_id",
        ));
    }
    let idem = record.idempotency_key.as_deref().ok_or_else(|| {
        SchemaError::new(
            SchemaErrorCode::EnvelopeValidationFailed,
            "idempotency_key is required in envelope for inventory.item.created",
        )
    })?;
    validate_idempotency_key(idem).map_err(|err| {
        SchemaError::new(
            SchemaErrorCode::EnvelopeValidationFailed,
            format!("invalid envelope idempotency_key: {err}"),
        )
    })?;
    Ok(())
}

fn validate_write_demo_completed_v1(
    record: &EventRecord,
    payload: &InventoryWriteDemoCompletedV1Payload,
) -> Result<(), SchemaError> {
    ensure_non_empty("payload.operation", &payload.operation)?;
    ensure_non_empty("payload.caller_id", &payload.caller_id)?;
    if record.aggregate_id != payload.caller_id {
        return Err(SchemaError::new(
            SchemaErrorCode::EnvelopeValidationFailed,
            "aggregate_id must equal payload.caller_id",
        ));
    }
    let idem = record.idempotency_key.as_deref().ok_or_else(|| {
        SchemaError::new(
            SchemaErrorCode::EnvelopeValidationFailed,
            "idempotency_key is required in envelope for inventory.write-demo.completed",
        )
    })?;
    validate_idempotency_key(idem).map_err(|err| {
        SchemaError::new(
            SchemaErrorCode::EnvelopeValidationFailed,
            format!("invalid envelope idempotency_key: {err}"),
        )
    })?;
    Ok(())
}

fn ensure_non_empty(field: &str, value: &str) -> Result<(), SchemaError> {
    if value.trim().is_empty() {
        return Err(SchemaError::new(
            SchemaErrorCode::EnvelopeValidationFailed,
            format!("{field} must not be empty"),
        ));
    }
    Ok(())
}

fn split_stream_name(stream_name: &str) -> Result<(&str, &str, &str), SchemaError> {
    let parts: Vec<&str> = stream_name.split('.').collect();
    if parts.len() != 3 || parts.iter().any(|part| part.trim().is_empty()) {
        return Err(SchemaError::new(
            SchemaErrorCode::EnvelopeValidationFailed,
            "stream_name must follow {system}.{env}.{topic}",
        ));
    }
    Ok((parts[0], parts[1], parts[2]))
}

fn schema_for_type(event_type: &str) -> Option<&'static EventSchemaManifestEntry> {
    EVENT_SCHEMA_MANIFEST
        .iter()
        .find(|entry| entry.event_type == event_type)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::events::model::EventRecord;
    use serde_json::json;

    #[test]
    fn registry_has_expected_event_types() {
        let manifest = registry_manifest();
        assert!(manifest
            .iter()
            .any(|m| m.event_type == INVENTORY_ITEM_CREATED));
        assert!(manifest
            .iter()
            .any(|m| m.event_type == INVENTORY_WRITE_DEMO_COMPLETED));
    }

    #[test]
    fn rejects_unknown_event_type() {
        let record = EventRecord::new(
            "banji-core.dev.inventory-updated".to_string(),
            "inventory.unknown".to_string(),
            1,
            "item".to_string(),
            "item-1".to_string(),
            "api".to_string(),
            Some("idem-1".to_string()),
            Some("corr-1".to_string()),
            "idem-1".to_string(),
            json!({"owner_sub":"a","item_id":"item-1","sku":"SKU-1","name":"Name","quantity":1}),
            json!({}),
        );
        let err = validate_event_record(&record).unwrap_err();
        assert_eq!(err.code, SchemaErrorCode::UnknownEventType);
    }

    #[test]
    fn accepts_valid_inventory_item_created_event() {
        let record = EventRecord::new(
            "banji-core.dev.inventory-updated".to_string(),
            INVENTORY_ITEM_CREATED.to_string(),
            1,
            "item".to_string(),
            "item-1".to_string(),
            "api".to_string(),
            Some("idem-1".to_string()),
            Some("corr-1".to_string()),
            "idem-1".to_string(),
            json!({
                "owner_sub":"user-1",
                "item_id":"item-1",
                "sku":"SKU-1",
                "name":"Name",
                "quantity":1
            }),
            json!({}),
        );
        assert!(validate_event_record(&record).is_ok());
    }

    #[test]
    fn rejects_unsupported_version() {
        let record = EventRecord::new(
            "banji-core.dev.inventory-updated".to_string(),
            INVENTORY_ITEM_CREATED.to_string(),
            2,
            "item".to_string(),
            "item-1".to_string(),
            "api".to_string(),
            Some("idem-1".to_string()),
            Some("corr-1".to_string()),
            "idem-1".to_string(),
            json!({
                "owner_sub":"user-1",
                "item_id":"item-1",
                "sku":"SKU-1",
                "name":"Name",
                "quantity":1
            }),
            json!({}),
        );
        let err = validate_event_record(&record).unwrap_err();
        assert_eq!(err.code, SchemaErrorCode::UnsupportedEventVersion);
    }

    #[test]
    fn rejects_payload_with_unknown_field_for_item_created() {
        let record = EventRecord::new(
            "banji-core.dev.inventory-updated".to_string(),
            INVENTORY_ITEM_CREATED.to_string(),
            1,
            "item".to_string(),
            "item-1".to_string(),
            "api".to_string(),
            Some("idem-1".to_string()),
            Some("corr-1".to_string()),
            "idem-1".to_string(),
            json!({
                "owner_sub":"a",
                "item_id":"item-1",
                "sku":"SKU-1",
                "name":"Name",
                "quantity":1,
                "idempotency_key":"dup"
            }),
            json!({}),
        );
        let err = validate_event_record(&record).unwrap_err();
        assert_eq!(err.code, SchemaErrorCode::PayloadValidationFailed);
    }

    #[test]
    fn decode_policy_sets_invalid_action() {
        let row = EventRow {
            id: 1,
            occurred_at: "2026-01-01T00:00:00Z".to_string(),
            publish_key: derive_publish_key(
                "api",
                INVENTORY_ITEM_CREATED,
                "item",
                "item-1",
                "idem-1",
            ),
            stream_name: "banji-core.dev.inventory-updated".to_string(),
            env_name: "dev".to_string(),
            topic_name: "inventory-updated".to_string(),
            event_type: INVENTORY_ITEM_CREATED.to_string(),
            event_version: 1,
            aggregate_type: "item".to_string(),
            aggregate_id: "item-1".to_string(),
            producer_service: "api".to_string(),
            idempotency_key: Some("idem-1".to_string()),
            correlation_id: Some("corr-1".to_string()),
            causation_id: "idem-1".to_string(),
            payload: json!({
                "owner_sub":"a",
                "item_id":"item-1",
                "sku":"SKU-1",
                "name":"Name",
                "quantity":"bad"
            }),
            metadata: json!({}),
        };

        let err = decode_event_row(&row, InvalidEventPolicy::Quarantine).unwrap_err();
        assert_eq!(err.action, InvalidEventAction::Quarantine);
        assert_eq!(err.code, SchemaErrorCode::PayloadValidationFailed);
    }

    #[test]
    fn rejects_envelope_payload_identity_mismatch() {
        let record = EventRecord::new(
            "banji-core.dev.inventory-updated".to_string(),
            INVENTORY_ITEM_CREATED.to_string(),
            1,
            "item".to_string(),
            "item-2".to_string(),
            "api".to_string(),
            Some("idem-1".to_string()),
            Some("corr-1".to_string()),
            "idem-1".to_string(),
            json!({
                "owner_sub":"user-1",
                "item_id":"item-1",
                "sku":"SKU-1",
                "name":"Name",
                "quantity":1
            }),
            json!({}),
        );
        let err = validate_event_record(&record).unwrap_err();
        assert_eq!(err.code, SchemaErrorCode::EnvelopeValidationFailed);
    }
}
