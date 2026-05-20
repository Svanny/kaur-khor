use crate::{
    inference::{
        build_input_fingerprint, fingerprint_observation_prefix, preprocess_workspace,
        run_preprocessed_analysis_with_parameters, AnalysisArtifacts, PreprocessedWorkspace,
        SenaAnalysisCheckpoint, SenaEngineParameters,
    },
    types::{
        SenaAnalysisResult, SenaAnalysisRunRecord, SenaCatalog, SenaCreateOrderBatchPayload,
        SenaObservationFingerprint, SenaObservationInput, SenaObservationPage,
        SenaObservationPageRequest, SenaObservationRecord, SenaOrderBatchRecord,
        SenaOrderLookupPayload, SenaRecordUpdateContext, SenaSplitOrderChildPayload,
        SenaUpdateOrderBatchPayload, SenaUpdateOrderChildPayload,
    },
};
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use time::{format_description::well_known::Rfc3339, OffsetDateTime};

#[async_trait(?Send)]
pub trait SenaRepository {
    async fn clear_owner(&self, owner_sub: &str) -> Result<()>;
    async fn upsert_catalog(&self, owner_sub: &str, catalog: &SenaCatalog) -> Result<()>;
    async fn get_catalog(&self, owner_sub: &str) -> Result<Option<SenaCatalog>>;
    async fn insert_observation(
        &self,
        owner_sub: &str,
        observation: &SenaObservationInput,
    ) -> Result<SenaObservationRecord>;
    async fn update_observation(
        &self,
        owner_sub: &str,
        observation_id: &str,
        observation: &SenaObservationInput,
    ) -> Result<SenaObservationRecord>;
    async fn delete_observation(&self, owner_sub: &str, observation_id: &str) -> Result<()>;
    async fn list_observations(&self, owner_sub: &str) -> Result<Vec<SenaObservationRecord>>;
    async fn list_observation_page(
        &self,
        owner_sub: &str,
        request: Option<&SenaObservationPageRequest>,
    ) -> Result<SenaObservationPage>;
    async fn get_observation_fingerprint(
        &self,
        owner_sub: &str,
    ) -> Result<SenaObservationFingerprint>;
    async fn get_record_update_context(&self, owner_sub: &str) -> Result<SenaRecordUpdateContext>;
    async fn list_order_batches(
        &self,
        owner_sub: &str,
        filters: Option<&SenaOrderLookupPayload>,
    ) -> Result<Vec<SenaOrderBatchRecord>>;
    async fn create_order_batch(
        &self,
        owner_sub: &str,
        payload: &SenaCreateOrderBatchPayload,
    ) -> Result<SenaOrderBatchRecord>;
    async fn update_order_batch(
        &self,
        owner_sub: &str,
        payload: &SenaUpdateOrderBatchPayload,
    ) -> Result<SenaOrderBatchRecord>;
    async fn update_order_child(
        &self,
        owner_sub: &str,
        payload: &SenaUpdateOrderChildPayload,
    ) -> Result<SenaOrderBatchRecord>;
    async fn split_order_child(
        &self,
        owner_sub: &str,
        payload: &SenaSplitOrderChildPayload,
    ) -> Result<SenaOrderBatchRecord>;
    async fn create_run(
        &self,
        owner_sub: &str,
        algorithm_version: &str,
        parameters: Option<&SenaEngineParameters>,
    ) -> Result<SenaAnalysisRunRecord>;
    async fn get_run(&self, run_id: &str) -> Result<Option<SenaAnalysisRunRecord>>;
    async fn get_latest_run(&self, owner_sub: &str) -> Result<Option<SenaAnalysisRunRecord>>;
    async fn persist_completed_run(
        &self,
        run_id: &str,
        result: &SenaAnalysisResult,
        artifact_key: Option<&str>,
        artifact_payload: Option<&serde_json::Value>,
    ) -> Result<()>;
    async fn load_preprocessed_workspace(
        &self,
        owner_sub: &str,
        algorithm_version: &str,
        catalog_fingerprint: &str,
        observation_fingerprint: &str,
    ) -> Result<Option<PreprocessedWorkspace>>;
    async fn save_preprocessed_workspace(
        &self,
        owner_sub: &str,
        algorithm_version: &str,
        catalog_fingerprint: &str,
        observation_fingerprint: &str,
        workspace: &PreprocessedWorkspace,
    ) -> Result<()>;
    async fn list_analysis_checkpoints(
        &self,
        owner_sub: &str,
        algorithm_version: &str,
        catalog_fingerprint: &str,
    ) -> Result<Vec<SenaAnalysisCheckpoint>>;
    async fn save_analysis_checkpoint(&self, checkpoint: &SenaAnalysisCheckpoint) -> Result<()>;
    async fn mark_run_failed(&self, run_id: &str, error: &str) -> Result<()>;
    async fn load_workspace_summary(
        &self,
        owner_sub: &str,
    ) -> Result<Option<crate::types::SenaWorkspaceSummary>>;
    async fn load_sku_detail(
        &self,
        owner_sub: &str,
        sku_id: &str,
    ) -> Result<Option<crate::types::SenaSkuDetail>>;
    async fn load_service_detail(
        &self,
        owner_sub: &str,
        service_id: &str,
    ) -> Result<Option<crate::types::SenaServiceDetail>>;
    async fn load_diagnostics(
        &self,
        owner_sub: &str,
    ) -> Result<Option<crate::types::SenaDiagnostics>>;
}

pub async fn trigger_analysis_run<R: SenaRepository>(
    repo: &R,
    owner_sub: &str,
    algorithm_version: &str,
) -> Result<SenaAnalysisRunRecord> {
    repo.create_run(owner_sub, algorithm_version, None).await
}

pub async fn trigger_analysis_run_with_parameters<R: SenaRepository>(
    repo: &R,
    owner_sub: &str,
    algorithm_version: &str,
    parameters: Option<&SenaEngineParameters>,
) -> Result<SenaAnalysisRunRecord> {
    repo.create_run(owner_sub, algorithm_version, parameters)
        .await
}

pub async fn execute_analysis_run<R: SenaRepository>(
    repo: &R,
    run_id: &str,
    algorithm_version: &str,
) -> Result<(SenaAnalysisRunRecord, AnalysisArtifacts)> {
    execute_analysis_run_with_parameters(repo, run_id, algorithm_version, None).await
}

pub async fn execute_analysis_run_with_parameters<R: SenaRepository>(
    repo: &R,
    run_id: &str,
    algorithm_version: &str,
    parameters: Option<&SenaEngineParameters>,
) -> Result<(SenaAnalysisRunRecord, AnalysisArtifacts)> {
    let Some(run) = repo.get_run(run_id).await? else {
        return Err(anyhow!("run not found"));
    };
    let Some(catalog) = repo.get_catalog(&run.owner_sub).await? else {
        repo.mark_run_failed(run_id, "catalog not found").await?;
        return Err(anyhow!("catalog not found"));
    };
    let observations = repo.list_observations(&run.owner_sub).await?;
    if observations.is_empty() {
        repo.mark_run_failed(run_id, "no observations").await?;
        return Err(anyhow!("no observations"));
    }
    let fingerprints = build_input_fingerprint(&catalog, &observations, algorithm_version)?;
    let preprocessed = match repo
        .load_preprocessed_workspace(
            &run.owner_sub,
            algorithm_version,
            &fingerprints.catalog_fingerprint,
            &fingerprints.observation_fingerprint,
        )
        .await?
    {
        Some(cached) => cached,
        None => {
            let computed = preprocess_workspace(&catalog, &observations)?;
            repo.save_preprocessed_workspace(
                &run.owner_sub,
                algorithm_version,
                &fingerprints.catalog_fingerprint,
                &fingerprints.observation_fingerprint,
                &computed,
            )
            .await?;
            computed
        }
    };
    let normalized_parameters = parameters
        .cloned()
        .or_else(|| run.engine_parameters.clone())
        .unwrap_or_else(|| SenaEngineParameters::for_algorithm(algorithm_version))
        .normalized_for_algorithm(algorithm_version);
    let should_reuse_checkpoints =
        normalized_parameters.is_default_for_algorithm(algorithm_version);
    let resume_from = if should_reuse_checkpoints {
        latest_reusable_checkpoint(
            repo,
            &run.owner_sub,
            algorithm_version,
            &fingerprints.catalog_fingerprint,
            &observations,
        )
        .await?
    } else {
        None
    };
    let output = run_preprocessed_analysis_with_parameters(
        &run.owner_sub,
        &catalog,
        &observations,
        algorithm_version,
        &preprocessed,
        resume_from.as_ref(),
        if should_reuse_checkpoints {
            Some(8)
        } else {
            None
        },
        Some(&normalized_parameters),
    )?;
    if should_reuse_checkpoints {
        for checkpoint in &output.checkpoints {
            repo.save_analysis_checkpoint(checkpoint).await?;
        }
    }
    let result = output.result;
    let artifacts = output.artifacts;
    repo.persist_completed_run(
        run_id,
        &result,
        Some(&artifacts.primary_artifact_key),
        Some(&artifacts.payload),
    )
    .await?;
    let completed = repo
        .get_run(run_id)
        .await?
        .ok_or_else(|| anyhow!("completed run disappeared"))?;
    Ok((completed, artifacts))
}

async fn latest_reusable_checkpoint<R: SenaRepository>(
    repo: &R,
    owner_sub: &str,
    algorithm_version: &str,
    catalog_fingerprint: &str,
    observations: &[SenaObservationRecord],
) -> Result<Option<SenaAnalysisCheckpoint>> {
    let checkpoints = repo
        .list_analysis_checkpoints(owner_sub, algorithm_version, catalog_fingerprint)
        .await?;
    for checkpoint in checkpoints {
        if checkpoint.metadata.observation_count > observations.len() {
            continue;
        }
        let prefix_fingerprint =
            fingerprint_observation_prefix(observations, checkpoint.metadata.observation_count)?;
        if checkpoint.metadata.observation_prefix_fingerprint == prefix_fingerprint {
            return Ok(Some(checkpoint));
        }
    }
    Ok(None)
}

pub fn now_rfc3339() -> String {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string())
}
