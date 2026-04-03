use crate::{
    inference::{run_analysis, AnalysisArtifacts},
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
    let (result, artifacts) = run_analysis(&run.owner_sub, &catalog, &observations, algorithm_version)?;
    repo.persist_completed_run(run_id, &result, Some(&artifacts.primary_artifact_key))
        .await?;
    let completed = repo
        .get_run(run_id)
        .await?
        .ok_or_else(|| anyhow!("completed run disappeared"))?;
    Ok((completed, artifacts))
}

pub fn now_rfc3339() -> String {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string())
}
