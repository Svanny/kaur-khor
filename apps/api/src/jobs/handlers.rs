use super::{
    schema::{
        build_item_created_result_v1, build_write_demo_result_v1, validate_job_result,
        JobSchemaError,
    },
    schema_types::{JobResultRecord, KnownJob},
};
use crate::items::repository;
use anyhow::{anyhow, Result};
use sha2::{Digest, Sha256};

const ITEM_CREATED_ALGORITHM_VERSION: &str = "item-created-v1";
const WRITE_DEMO_ALGORITHM_VERSION: &str = "write-demo-v1";

pub async fn handle_job(
    pool: &sqlx::PgPool,
    job_key: &str,
    job: &KnownJob,
) -> Result<JobResultRecord> {
    match job {
        KnownJob::ItemCreatedV1(payload) => {
            let item = repository::get_by_owner_and_id(pool, &payload.owner_sub, &payload.item_id)
                .await?
                .ok_or_else(|| anyhow!("missing required ref: inventory item not found"))?;

            let mut result = build_item_created_result_v1(
                item.owner_sub,
                item.item_id,
                item.sku,
                item.name,
                item.quantity,
                ITEM_CREATED_ALGORITHM_VERSION,
            )
            .map_err(anyhow::Error::new)?;
            result.job_key = job_key.to_string();
            Ok(result)
        }
        KnownJob::WriteDemoV1(payload) => {
            let result_value = serde_json::json!({
                "echo": {
                    "operation": payload.operation,
                    "caller_id": payload.caller_id,
                },
                "checksum": checksum_for(&[
                    payload.operation.as_str(),
                    payload.caller_id.as_str(),
                    payload.idempotency_key.as_str(),
                ]),
            });
            let mut result = build_write_demo_result_v1(
                payload.operation.clone(),
                payload.caller_id.clone(),
                result_value,
                WRITE_DEMO_ALGORITHM_VERSION,
            )
            .map_err(anyhow::Error::new)?;
            result.job_key = job_key.to_string();
            Ok(result)
        }
    }
}

pub fn validate_handler_result(result: &JobResultRecord) -> Result<(), JobSchemaError> {
    let _ = validate_job_result(&result.job_type, result.result_version, &result.payload)?;
    Ok(())
}

fn checksum_for(parts: &[&str]) -> String {
    let mut hasher = Sha256::new();
    for part in parts {
        hasher.update(part.as_bytes());
        hasher.update(b"|");
    }
    format!("{:x}", hasher.finalize())
}
