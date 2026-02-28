use super::{
    rollout::JobAlgorithmDecisionSource,
    schema::{
        build_item_created_result_v1, build_write_demo_result_v2, validate_job_result,
        JobSchemaError,
    },
    schema_types::{JobArtifactOutput, JobExecutionOutput, KnownJob},
};
use crate::{
    items::repository,
    storage::{
        key::{derive_artifact_key, hex_sha256},
        types::ArtifactIdentity,
    },
};
use anyhow::{anyhow, Result};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::{Path, PathBuf},
};
use time::OffsetDateTime;
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct JobExecutionContext {
    pub job_key: String,
    pub job_created_at: OffsetDateTime,
    pub artifact_tmp_dir: PathBuf,
    pub producer_service: String,
    pub producer_role: String,
    pub algorithm_version: String,
    pub algorithm_decision_source: JobAlgorithmDecisionSource,
}

pub async fn handle_job(
    pool: &sqlx::PgPool,
    ctx: &JobExecutionContext,
    job: &KnownJob,
) -> Result<JobExecutionOutput> {
    match job {
        KnownJob::ItemCreatedV1(payload) => {
            if ctx.algorithm_version != "item-created-v1" {
                return Err(anyhow!(
                    "unsupported_rollout_version: item-created algorithm version {} is not implemented",
                    ctx.algorithm_version
                ));
            }
            let item = repository::get_by_owner_and_id(pool, &payload.owner_sub, &payload.item_id)
                .await?
                .ok_or_else(|| anyhow!("missing required ref: inventory item not found"))?;

            let mut result = build_item_created_result_v1(
                item.owner_sub,
                item.item_id,
                item.sku,
                item.name,
                item.quantity,
                &ctx.algorithm_version,
            )
            .map_err(anyhow::Error::new)?;
            result.job_key = ctx.job_key.clone();
            Ok(JobExecutionOutput {
                result,
                artifacts: Vec::new(),
                cleanup_paths: Vec::new(),
            })
        }
        KnownJob::WriteDemoV1(payload) => match ctx.algorithm_version.as_str() {
            "write-demo-v2" => build_write_demo_output_v2(ctx, payload),
            "write-demo-v3" => build_write_demo_output_v3(ctx, payload),
            _ => Err(anyhow!(
                "unsupported_rollout_version: write-demo algorithm version {} is not implemented",
                ctx.algorithm_version
            )),
        },
    }
}

pub fn validate_handler_result(output: &JobExecutionOutput) -> Result<(), JobSchemaError> {
    let _ = validate_job_result(
        &output.result.job_type,
        output.result.result_version,
        &output.result.payload,
    )?;

    for artifact in &output.artifacts {
        if artifact.artifact_role.trim().is_empty() {
            return Err(JobSchemaError {
                code: super::schema_types::JobSchemaErrorCode::ResultValidationFailed,
                message: "artifact_role must not be empty".to_string(),
            });
        }
        if artifact.artifact_version < 1 {
            return Err(JobSchemaError {
                code: super::schema_types::JobSchemaErrorCode::ResultValidationFailed,
                message: "artifact_version must be >= 1".to_string(),
            });
        }
        if artifact.content_type.trim().is_empty() || artifact.file_extension.trim().is_empty() {
            return Err(JobSchemaError {
                code: super::schema_types::JobSchemaErrorCode::ResultValidationFailed,
                message: "artifact content_type and file_extension must not be empty".to_string(),
            });
        }
        if artifact.artifact_key.trim().is_empty() || artifact.sha256.trim().is_empty() {
            return Err(JobSchemaError {
                code: super::schema_types::JobSchemaErrorCode::ResultValidationFailed,
                message: "artifact identity fields must not be empty".to_string(),
            });
        }
        if artifact.content_length < 0 {
            return Err(JobSchemaError {
                code: super::schema_types::JobSchemaErrorCode::ResultValidationFailed,
                message: "artifact content_length must be >= 0".to_string(),
            });
        }
        if !artifact.local_path.exists() {
            return Err(JobSchemaError {
                code: super::schema_types::JobSchemaErrorCode::ResultValidationFailed,
                message: format!(
                    "artifact local path does not exist: {}",
                    artifact.local_path.display()
                ),
            });
        }
    }

    Ok(())
}

fn build_write_demo_output_v2(
    ctx: &JobExecutionContext,
    payload: &super::schema_types::WriteDemoJobV1Payload,
) -> Result<JobExecutionOutput> {
    build_write_demo_output(ctx, payload, write_demo_v2_report)
}

fn build_write_demo_output_v3(
    ctx: &JobExecutionContext,
    payload: &super::schema_types::WriteDemoJobV1Payload,
) -> Result<JobExecutionOutput> {
    build_write_demo_output(ctx, payload, write_demo_v3_report)
}

fn build_write_demo_output(
    ctx: &JobExecutionContext,
    payload: &super::schema_types::WriteDemoJobV1Payload,
    report_builder: fn(
        &JobExecutionContext,
        &super::schema_types::WriteDemoJobV1Payload,
    ) -> serde_json::Value,
) -> Result<JobExecutionOutput> {
    fs::create_dir_all(&ctx.artifact_tmp_dir)?;
    let temp_dir = ctx
        .artifact_tmp_dir
        .join(format!("{}-{}", ctx.job_key, Uuid::new_v4()));
    fs::create_dir_all(&temp_dir)?;
    let temp_dir_guard = TempPathGuard::new(temp_dir);

    let report_path = temp_dir_guard.path().join("report.json");
    let report = report_builder(ctx, payload);

    let bytes = serde_json::to_vec_pretty(&report)?;
    fs::write(&report_path, &bytes)?;

    let artifact_key = derive_artifact_key(&ArtifactIdentity {
        producer_service: ctx.producer_service.clone(),
        producer_role: ctx.producer_role.clone(),
        job_type: "write-demo".to_string(),
        job_key: ctx.job_key.clone(),
        artifact_role: "report".to_string(),
        artifact_version: 1,
    })?;

    let sha256 = hex_sha256(&bytes);
    let content_length = bytes.len() as i64;
    let mut result = build_write_demo_result_v2(
        payload.operation.clone(),
        payload.caller_id.clone(),
        &ctx.algorithm_version,
        1,
        "report".to_string(),
        artifact_key.clone(),
        sha256.clone(),
        content_length,
    )
    .map_err(anyhow::Error::new)?;
    result.job_key = ctx.job_key.clone();
    let cleanup_path = temp_dir_guard.disarm();

    Ok(JobExecutionOutput {
        result,
        artifacts: vec![JobArtifactOutput {
            artifact_role: "report".to_string(),
            artifact_version: 1,
            artifact_key,
            content_type: "application/json".to_string(),
            file_extension: "json".to_string(),
            local_path: report_path,
            sha256,
            content_length,
            metadata: json!({
                "operation": payload.operation,
                "caller_id": payload.caller_id,
                "algorithm_version": ctx.algorithm_version,
                "algorithm_decision_source": ctx.algorithm_decision_source.as_str(),
            }),
        }],
        cleanup_paths: vec![cleanup_path],
    })
}

fn write_demo_v2_report(
    ctx: &JobExecutionContext,
    payload: &super::schema_types::WriteDemoJobV1Payload,
) -> serde_json::Value {
    let checksum = checksum_for(&[
        payload.operation.as_str(),
        payload.caller_id.as_str(),
        payload.idempotency_key.as_str(),
        &ctx.job_key,
    ]);

    json!({
        "job_key": ctx.job_key,
        "operation": payload.operation,
        "caller_id": payload.caller_id,
        "algorithm_version": ctx.algorithm_version,
        "generated_at": ctx.job_created_at.unix_timestamp(),
        "derived_output": {
            "checksum": checksum,
            "echo": {
                "operation": payload.operation,
                "caller_id": payload.caller_id,
            }
        }
    })
}

fn write_demo_v3_report(
    ctx: &JobExecutionContext,
    payload: &super::schema_types::WriteDemoJobV1Payload,
) -> serde_json::Value {
    let checksum = checksum_for(&[
        "write-demo-v3",
        &ctx.job_key,
        payload.caller_id.as_str(),
        payload.operation.as_str(),
        payload.idempotency_key.as_str(),
    ]);

    json!({
        "job_key": ctx.job_key,
        "operation": payload.operation,
        "caller_id": payload.caller_id,
        "algorithm_version": ctx.algorithm_version,
        "generated_at": ctx.job_created_at.unix_timestamp(),
        "derived_output": {
            "checksum": checksum,
            "operation_length": payload.operation.len(),
            "echo": {
                "operation": payload.operation,
                "caller_id": payload.caller_id,
                "variant": "v3",
            }
        }
    })
}

pub fn cleanup_execution_paths(paths: &[PathBuf]) {
    for path in paths {
        let _ = cleanup_path(path);
    }
}

fn cleanup_path(path: &Path) -> Result<()> {
    if !path.exists() {
        return Ok(());
    }
    if path.is_dir() {
        fs::remove_dir_all(path)?;
    } else {
        fs::remove_file(path)?;
    }
    Ok(())
}

struct TempPathGuard {
    path: PathBuf,
    armed: bool,
}

impl TempPathGuard {
    fn new(path: PathBuf) -> Self {
        Self { path, armed: true }
    }

    fn path(&self) -> &Path {
        &self.path
    }

    fn disarm(mut self) -> PathBuf {
        self.armed = false;
        self.path.clone()
    }
}

impl Drop for TempPathGuard {
    fn drop(&mut self) {
        if self.armed {
            let _ = cleanup_path(&self.path);
        }
    }
}

fn checksum_for(parts: &[&str]) -> String {
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
    use crate::jobs::schema_types::KnownJob;
    use time::OffsetDateTime;

    #[tokio::test]
    async fn write_demo_handler_returns_summary_only_and_artifact() {
        let temp_root = std::env::temp_dir().join(format!("banji-handler-test-{}", Uuid::new_v4()));
        let ctx = JobExecutionContext {
            job_key: "job-123".to_string(),
            job_created_at: OffsetDateTime::now_utc(),
            artifact_tmp_dir: temp_root.clone(),
            producer_service: "api".to_string(),
            producer_role: "worker".to_string(),
            algorithm_version: "write-demo-v2".to_string(),
            algorithm_decision_source: JobAlgorithmDecisionSource::Stable,
        };
        let output = handle_job(
            &sqlx::PgPool::connect_lazy("postgres://user:pass@localhost/test").unwrap(),
            &ctx,
            &KnownJob::WriteDemoV1(super::super::schema_types::WriteDemoJobV1Payload {
                operation: "export".to_string(),
                caller_id: "caller-a".to_string(),
                idempotency_key: "idem-1".to_string(),
            }),
        )
        .await
        .unwrap();

        assert_eq!(output.result.result_version, 2);
        assert_eq!(output.artifacts.len(), 1);
        assert!(output.result.payload.get("result").is_none());
        assert!(output.result.payload.get("primary_artifact_key").is_some());
        cleanup_execution_paths(&output.cleanup_paths);
    }

    #[tokio::test]
    async fn write_demo_v3_handler_returns_valid_summary_and_artifact() {
        let temp_root = std::env::temp_dir().join(format!("banji-handler-test-{}", Uuid::new_v4()));
        let ctx = JobExecutionContext {
            job_key: "job-456".to_string(),
            job_created_at: OffsetDateTime::now_utc(),
            artifact_tmp_dir: temp_root.clone(),
            producer_service: "api".to_string(),
            producer_role: "worker".to_string(),
            algorithm_version: "write-demo-v3".to_string(),
            algorithm_decision_source: JobAlgorithmDecisionSource::Candidate,
        };
        let output = handle_job(
            &sqlx::PgPool::connect_lazy("postgres://user:pass@localhost/test").unwrap(),
            &ctx,
            &KnownJob::WriteDemoV1(super::super::schema_types::WriteDemoJobV1Payload {
                operation: "export".to_string(),
                caller_id: "caller-a".to_string(),
                idempotency_key: "idem-1".to_string(),
            }),
        )
        .await
        .unwrap();

        validate_handler_result(&output).unwrap();
        assert_eq!(
            output.result.payload.get("algorithm_version").unwrap(),
            "write-demo-v3"
        );
        cleanup_execution_paths(&output.cleanup_paths);
    }

    #[test]
    fn temp_path_guard_removes_temp_dir_on_drop() {
        let temp_dir = std::env::temp_dir().join(format!("banji-temp-guard-{}", Uuid::new_v4()));
        fs::create_dir_all(&temp_dir).unwrap();
        fs::write(temp_dir.join("report.json"), b"{}").unwrap();

        {
            let _guard = TempPathGuard::new(temp_dir.clone());
        }

        assert!(!temp_dir.exists());
    }
}
