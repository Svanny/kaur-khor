use crate::{
    inference::{
        build_input_fingerprint, fingerprint_observation_prefix, preprocess_workspace,
        run_preprocessed_analysis, AnalysisArtifacts, PreprocessedWorkspace,
        SenaAnalysisCheckpoint,
    },
    types::{
        SenaAnalysisResult, SenaAnalysisRunRecord, SenaCatalog, SenaObservationInput,
        SenaObservationRecord,
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
    async fn list_observations(&self, owner_sub: &str) -> Result<Vec<SenaObservationRecord>>;
    async fn create_run(
        &self,
        owner_sub: &str,
        algorithm_version: &str,
    ) -> Result<SenaAnalysisRunRecord>;
    async fn get_run(&self, run_id: &str) -> Result<Option<SenaAnalysisRunRecord>>;
    async fn get_latest_run(&self, owner_sub: &str) -> Result<Option<SenaAnalysisRunRecord>>;
    async fn persist_completed_run(
        &self,
        run_id: &str,
        result: &SenaAnalysisResult,
        artifact_key: Option<&str>,
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
    repo.create_run(owner_sub, algorithm_version).await
}

pub async fn execute_analysis_run<R: SenaRepository>(
    repo: &R,
    run_id: &str,
    algorithm_version: &str,
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
    let resume_from = latest_reusable_checkpoint(
        repo,
        &run.owner_sub,
        algorithm_version,
        &fingerprints.catalog_fingerprint,
        &observations,
    )
    .await?;
    let output = run_preprocessed_analysis(
        &run.owner_sub,
        &catalog,
        &observations,
        algorithm_version,
        &preprocessed,
        resume_from.as_ref(),
        Some(8),
    )?;
    for checkpoint in &output.checkpoints {
        repo.save_analysis_checkpoint(checkpoint).await?;
    }
    let result = output.result;
    let artifacts = output.artifacts;
    repo.persist_completed_run(run_id, &result, Some(&artifacts.primary_artifact_key))
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
