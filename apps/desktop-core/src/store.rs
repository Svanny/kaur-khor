use anyhow::Result;
use banji_sena_core::{
    execute_analysis_run, trigger_analysis_run, SenaAnalysisRunRecord, SenaCatalog,
    SenaDiagnostics, SenaObservationInput, SenaObservationRecord, SenaRepository,
    SenaServiceDetail, SenaSkuDetail, SenaWorkspaceSummary, SqliteSenaRepository,
};
use futures::executor::block_on;
use std::{env, path::PathBuf};

const DEFAULT_OWNER_SUB: &str = "desktop-owner";

fn db_path() -> PathBuf {
    env::var_os("BANJI_DESKTOP_DATA_PATH")
        .map(PathBuf::from)
        .unwrap_or_else(|| env::temp_dir().join("banji-sena.sqlite3"))
}

fn repository() -> Result<SqliteSenaRepository> {
    SqliteSenaRepository::open(db_path())
}

pub fn default_owner() -> &'static str {
    DEFAULT_OWNER_SUB
}

pub fn upsert_catalog(owner_sub: &str, catalog: &SenaCatalog) -> Result<()> {
    block_on(repository()?.upsert_catalog(owner_sub, catalog))
}

pub fn ingest_observation(owner_sub: &str, observation: &SenaObservationInput) -> Result<SenaObservationRecord> {
    block_on(repository()?.insert_observation(owner_sub, observation))
}

pub fn get_catalog(owner_sub: &str) -> Result<Option<SenaCatalog>> {
    block_on(repository()?.get_catalog(owner_sub))
}

pub fn list_observations(owner_sub: &str) -> Result<Vec<SenaObservationRecord>> {
    block_on(repository()?.list_observations(owner_sub))
}

pub fn trigger_run(owner_sub: &str, algorithm_version: &str) -> Result<SenaAnalysisRunRecord> {
    let repo = repository()?;
    let run = block_on(trigger_analysis_run(&repo, owner_sub, algorithm_version))?;
    let (completed, _) = block_on(execute_analysis_run(&repo, &run.run_id, algorithm_version))?;
    Ok(completed)
}

pub fn retry_run(run_id: &str, algorithm_version: &str) -> Result<SenaAnalysisRunRecord> {
    let repo = repository()?;
    let (completed, _) = block_on(execute_analysis_run(&repo, run_id, algorithm_version))?;
    Ok(completed)
}

pub fn get_workspace_summary(owner_sub: &str) -> Result<Option<SenaWorkspaceSummary>> {
    block_on(repository()?.load_workspace_summary(owner_sub))
}

pub fn get_sku_detail(owner_sub: &str, sku_id: &str) -> Result<Option<SenaSkuDetail>> {
    block_on(repository()?.load_sku_detail(owner_sub, sku_id))
}

pub fn get_service_detail(owner_sub: &str, service_id: &str) -> Result<Option<SenaServiceDetail>> {
    block_on(repository()?.load_service_detail(owner_sub, service_id))
}

pub fn get_diagnostics(owner_sub: &str) -> Result<Option<SenaDiagnostics>> {
    block_on(repository()?.load_diagnostics(owner_sub))
}

pub fn get_run(run_id: &str) -> Result<Option<SenaAnalysisRunRecord>> {
    block_on(repository()?.get_run(run_id))
}
