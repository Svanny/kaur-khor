use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventRecord {
    pub stream_name: String,
    pub env_name: String,
    pub topic_name: String,
    pub event_type: String,
    pub event_version: i32,
    pub aggregate_type: String,
    pub aggregate_id: String,
    pub producer_service: String,
    pub idempotency_key: Option<String>,
    pub correlation_id: Option<String>,
    pub causation_id: Option<String>,
    pub payload: Value,
    pub metadata: Value,
}

#[derive(Debug, Clone)]
pub struct EventRow {
    pub id: i64,
    pub occurred_at: String,
    pub stream_name: String,
    pub event_type: String,
    pub event_version: i32,
    pub aggregate_type: String,
    pub aggregate_id: String,
    pub producer_service: String,
    pub idempotency_key: Option<String>,
    pub correlation_id: Option<String>,
    pub payload: Value,
    pub metadata: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditEvent {
    pub event_id: i64,
    pub occurred_at: String,
    pub service: String,
    pub actor_id: Option<String>,
    pub entity_type: String,
    pub entity_id: String,
    pub event_type: String,
    pub request_id: Option<String>,
    pub idempotency_key: Option<String>,
    pub payload: Value,
}

impl EventRecord {
    pub fn new(
        stream_name: String,
        event_type: String,
        event_version: i32,
        aggregate_type: String,
        aggregate_id: String,
        producer_service: String,
        idempotency_key: Option<String>,
        correlation_id: Option<String>,
        causation_id: Option<String>,
        payload: Value,
        metadata: Value,
    ) -> Self {
        let mut parts = stream_name.split('.');
        let _system = parts.next().unwrap_or_default();
        let env_name = parts.next().unwrap_or("unknown").to_string();
        let topic_name = parts.next().unwrap_or("unknown").to_string();

        Self {
            stream_name,
            env_name,
            topic_name,
            event_type,
            event_version,
            aggregate_type,
            aggregate_id,
            producer_service,
            idempotency_key,
            correlation_id,
            causation_id,
            payload,
            metadata,
        }
    }
}

impl EventRow {
    pub fn to_audit_event(self) -> AuditEvent {
        AuditEvent {
            event_id: self.id,
            occurred_at: self.occurred_at,
            service: self.producer_service,
            actor_id: Some(self.aggregate_id.clone()),
            entity_type: self.aggregate_type,
            entity_id: self.aggregate_id,
            event_type: self.event_type,
            request_id: self.correlation_id,
            idempotency_key: self.idempotency_key,
            payload: self.payload,
        }
    }
}
