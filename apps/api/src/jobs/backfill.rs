use super::{
    key::derive_job_key,
    schema_types::JobRecord,
    types::{JobDeliveryMode, WorkloadClass},
};
use crate::events::{
    model::EventRow,
    schema_types::{
        InventoryItemCreatedV1Payload, InventoryWriteDemoCompletedV1Payload, KnownEvent,
    },
    streams,
};
use anyhow::{anyhow, Result};
use serde_json::json;
use uuid::Uuid;

const ITEM_CREATED_JOB_TYPE: &str = "item-created";
const WRITE_DEMO_JOB_TYPE: &str = "write-demo";
const BACKFILL_PRODUCER_SERVICE: &str = "backfill-controller";

pub fn job_types_for_stream(stream_name: &str) -> &'static [&'static str] {
    if stream_name.ends_with(&format!(".{}", streams::inventory_updated_topic())) {
        &[ITEM_CREATED_JOB_TYPE]
    } else if stream_name.ends_with(&format!(".{}", streams::write_demo_completed_topic())) {
        &[WRITE_DEMO_JOB_TYPE]
    } else {
        &[]
    }
}

pub fn validate_requested_job_types(
    stream_name: &str,
    requested: &[String],
) -> Result<Vec<String>> {
    let allowed = job_types_for_stream(stream_name);
    if allowed.is_empty() {
        return Err(anyhow!(
            "stream '{stream_name}' does not have registered replay job builders"
        ));
    }

    if requested.is_empty() {
        return Ok(allowed.iter().map(|value| value.to_string()).collect());
    }

    for job_type in requested {
        if !allowed
            .iter()
            .any(|allowed_type| allowed_type == &job_type.as_str())
        {
            return Err(anyhow!(
                "BACKFILL_JOB_TYPES contains unsupported job_type '{job_type}' for stream '{stream_name}'"
            ));
        }
    }

    Ok(requested.to_vec())
}

pub fn build_replay_job(
    run_id: Uuid,
    operator_id: &str,
    reason: &str,
    row: &EventRow,
    event: &KnownEvent,
    max_attempts: u8,
) -> Result<Option<JobRecord>> {
    let causation_id = format!("backfill:{run_id}:event:{}", row.id);
    let correlation_id = row
        .correlation_id
        .clone()
        .unwrap_or_else(|| format!("backfill:{run_id}"));
    let source_idempotency_key = row
        .idempotency_key
        .clone()
        .unwrap_or_else(|| row.causation_id.clone());

    let mut record = match event {
        KnownEvent::InventoryItemCreatedV1(payload) => build_item_created_replay_job(
            row,
            payload,
            &source_idempotency_key,
            &correlation_id,
            &causation_id,
            max_attempts,
        )?,
        KnownEvent::InventoryWriteDemoCompletedV1(payload) => build_write_demo_replay_job(
            row,
            payload,
            &source_idempotency_key,
            &correlation_id,
            &causation_id,
            max_attempts,
        )?,
    };

    record.metadata = json!({
        "replay": true,
        "backfill_run_id": run_id.to_string(),
        "source_event_id": row.id,
        "source_event_type": row.event_type,
        "operator_id": operator_id,
        "reason": reason,
        "original_correlation_id": row.correlation_id,
        "original_causation_id": row.causation_id,
    });
    record.delivery_mode = JobDeliveryMode::Replay;
    record.backfill_run_id = Some(run_id);
    record.source_event_id = Some(row.id);

    Ok(Some(record))
}

fn build_item_created_replay_job(
    row: &EventRow,
    payload: &InventoryItemCreatedV1Payload,
    source_idempotency_key: &str,
    correlation_id: &str,
    causation_id: &str,
    max_attempts: u8,
) -> Result<JobRecord> {
    Ok(JobRecord {
        job_key: derive_job_key(
            BACKFILL_PRODUCER_SERVICE,
            ITEM_CREATED_JOB_TYPE,
            "item",
            &format!("{}:{}", payload.owner_sub, payload.item_id),
            causation_id,
        ),
        job_type: ITEM_CREATED_JOB_TYPE.to_string(),
        payload_version: 1,
        workload_class: WorkloadClass::Fast,
        producer_service: BACKFILL_PRODUCER_SERVICE.to_string(),
        aggregate_type: "item".to_string(),
        aggregate_id: format!("{}:{}", payload.owner_sub, payload.item_id),
        causation_id: causation_id.to_string(),
        correlation_id: correlation_id.to_string(),
        routing_key: WorkloadClass::Fast.replay_routing_key().to_string(),
        payload: json!({
            "owner_sub": payload.owner_sub,
            "item_id": payload.item_id,
            "idempotency_key": source_idempotency_key,
        }),
        metadata: json!({}),
        delivery_mode: JobDeliveryMode::Replay,
        backfill_run_id: None,
        source_event_id: Some(row.id),
        max_attempts: i32::from(max_attempts),
    })
}

fn build_write_demo_replay_job(
    row: &EventRow,
    payload: &InventoryWriteDemoCompletedV1Payload,
    source_idempotency_key: &str,
    correlation_id: &str,
    causation_id: &str,
    max_attempts: u8,
) -> Result<JobRecord> {
    Ok(JobRecord {
        job_key: derive_job_key(
            BACKFILL_PRODUCER_SERVICE,
            WRITE_DEMO_JOB_TYPE,
            "write-demo",
            &format!("{}:{}", payload.caller_id, payload.operation),
            causation_id,
        ),
        job_type: WRITE_DEMO_JOB_TYPE.to_string(),
        payload_version: 1,
        workload_class: WorkloadClass::Fast,
        producer_service: BACKFILL_PRODUCER_SERVICE.to_string(),
        aggregate_type: "write-demo".to_string(),
        aggregate_id: format!("{}:{}", payload.caller_id, payload.operation),
        causation_id: causation_id.to_string(),
        correlation_id: correlation_id.to_string(),
        routing_key: WorkloadClass::Fast.replay_routing_key().to_string(),
        payload: json!({
            "operation": payload.operation,
            "caller_id": payload.caller_id,
            "idempotency_key": source_idempotency_key,
        }),
        metadata: json!({}),
        delivery_mode: JobDeliveryMode::Replay,
        backfill_run_id: None,
        source_event_id: Some(row.id),
        max_attempts: i32::from(max_attempts),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::events::schema_types::{InventoryItemCreatedV1Payload, KnownEvent};

    fn sample_row() -> EventRow {
        EventRow {
            id: 42,
            occurred_at: "2026-02-28T00:00:00Z".to_string(),
            publish_key: "pk".to_string(),
            stream_name: "banji-core.test.inventory-updated".to_string(),
            env_name: "test".to_string(),
            topic_name: "inventory-updated".to_string(),
            event_type: "inventory.item.created".to_string(),
            event_version: 1,
            aggregate_type: "item".to_string(),
            aggregate_id: "item-1".to_string(),
            producer_service: "api".to_string(),
            idempotency_key: Some("idem-1".to_string()),
            correlation_id: Some("corr-1".to_string()),
            causation_id: "cause-1".to_string(),
            payload: json!({}),
            metadata: json!({}),
        }
    }

    #[test]
    fn validates_job_types_by_stream() {
        let allowed = validate_requested_job_types(
            "banji-core.test.inventory-updated",
            &["item-created".to_string()],
        )
        .unwrap();
        assert_eq!(allowed, vec!["item-created".to_string()]);

        let err = validate_requested_job_types(
            "banji-core.test.inventory-updated",
            &["write-demo".to_string()],
        )
        .unwrap_err();
        assert!(err.to_string().contains("unsupported job_type"));
    }

    #[test]
    fn builds_replay_job_with_deterministic_run_scoped_identity() {
        let run_id = Uuid::parse_str("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa").unwrap();
        let row = sample_row();
        let event = KnownEvent::InventoryItemCreatedV1(InventoryItemCreatedV1Payload {
            owner_sub: "user-1".to_string(),
            item_id: "item-1".to_string(),
            sku: "SKU-1".to_string(),
            name: "Item 1".to_string(),
            quantity: 3,
        });

        let job = build_replay_job(run_id, "ops-1", "recompute", &row, &event, 4)
            .unwrap()
            .unwrap();

        assert_eq!(job.job_type, "item-created");
        assert_eq!(job.delivery_mode, JobDeliveryMode::Replay);
        assert_eq!(job.backfill_run_id, Some(run_id));
        assert_eq!(job.source_event_id, Some(42));
        assert_eq!(job.routing_key, "job.fast.replay");
        assert_eq!(job.causation_id, format!("backfill:{run_id}:event:42"));
        assert_eq!(
            job.metadata
                .get("operator_id")
                .and_then(|value| value.as_str()),
            Some("ops-1")
        );
    }
}
