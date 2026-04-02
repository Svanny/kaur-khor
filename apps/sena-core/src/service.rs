use crate::store::{build_store, recompute_analysis, SenaRepository};
use crate::types::{
    SenaAnalysisRunSummary, SenaObservationIngestRequest, SenaObservationRecord, SenaService,
    SenaServiceMaskUpdateRequest, SenaServicePosterior, SenaSku, SenaSkuPosterior,
    SenaUpsertServiceRequest, SenaUpsertSkuRequest, SenaWorkspaceSummary,
};
use crate::validation::{
    validate_observation_request, validate_service_mask_request, validate_service_request,
    validate_sku_request,
};
use anyhow::{anyhow, Result};

pub fn load_workspace(owner_sub: &str) -> Result<SenaWorkspaceSummary> {
    let store = build_store()?;
    let latest = store.load_latest_analysis(owner_sub)?;
    if let Some(outputs) = latest {
        return Ok(outputs.workspace);
    }
    let workspace = store.load_workspace_data(owner_sub)?;
    Ok(SenaWorkspaceSummary {
        skus: workspace.skus,
        services: workspace.services,
        observations: workspace.observations,
        latest_run: None,
        diagnostics: crate::types::SenaDiagnosticsSummary {
            observation_count: 0,
            interval_count: 0,
            effective_sample_size_hint: 0.0,
            ranking_signal_count: 0,
            stockout_signal_count: 0,
            order_signal_count: 0,
            top_regime: None,
            intervals: Vec::new(),
        },
        high_risk_sku_ids: Vec::new(),
        pending_reorder_count: 0,
    })
}

pub fn upsert_sku(owner_sub: &str, request: SenaUpsertSkuRequest) -> Result<SenaSku> {
    validate_sku_request(&request)?;
    let store = build_store()?;
    let sku = SenaSku {
        sku_id: request.sku_id,
        name: request.name,
        description: request.description,
        sold_as_product: request.sold_as_product,
        units_per_retail_sale: request.units_per_retail_sale,
        current_stock_units: request.current_stock_units,
        reorder_target_service_level: request.reorder_target_service_level,
        default_lead_time_days: request.default_lead_time_days,
        default_lead_time_variability: request.default_lead_time_variability,
    };
    let saved = store.upsert_sku(owner_sub, sku)?;
    let _ = recompute_analysis(&store, owner_sub)?;
    Ok(saved)
}

pub fn upsert_service(owner_sub: &str, request: SenaUpsertServiceRequest) -> Result<SenaService> {
    validate_service_request(&request)?;
    let store = build_store()?;
    let service = SenaService {
        service_id: request.service_id,
        name: request.name,
        description: request.description,
        base_price: request.base_price,
        recipe_links: request.recipe_links,
        is_bundle: request.is_bundle,
    };
    let saved = store.upsert_service(owner_sub, service)?;
    let _ = recompute_analysis(&store, owner_sub)?;
    Ok(saved)
}

pub fn update_service_mask(
    owner_sub: &str,
    request: SenaServiceMaskUpdateRequest,
) -> Result<SenaService> {
    validate_service_mask_request(&request)?;
    let store = build_store()?;
    let workspace = store.load_workspace_data(owner_sub)?;
    let Some(existing) = workspace
        .services
        .into_iter()
        .find(|service| service.service_id == request.service_id)
    else {
        return Err(anyhow!("service not found"));
    };
    let updated = SenaService {
        recipe_links: request.recipe_links,
        ..existing
    };
    let saved = store.upsert_service(owner_sub, updated)?;
    let _ = recompute_analysis(&store, owner_sub)?;
    Ok(saved)
}

pub fn record_observation(
    owner_sub: &str,
    request: SenaObservationIngestRequest,
) -> Result<SenaObservationRecord> {
    validate_observation_request(&request)?;
    let store = build_store()?;
    let saved = store.append_observation(owner_sub, request)?;
    let _ = recompute_analysis(&store, owner_sub)?;
    Ok(saved)
}

pub fn trigger_analysis(owner_sub: &str) -> Result<SenaAnalysisRunSummary> {
    let store = build_store()?;
    let outputs = recompute_analysis(&store, owner_sub)?;
    Ok(outputs.run)
}

pub fn load_run(owner_sub: &str, run_id: &str) -> Result<SenaAnalysisRunSummary> {
    let store = build_store()?;
    store
        .load_run(owner_sub, run_id)?
        .ok_or_else(|| anyhow!("analysis run not found"))
}

pub fn load_sku_posterior(owner_sub: &str, sku_id: &str) -> Result<SenaSkuPosterior> {
    let store = build_store()?;
    let Some(outputs) = store.load_latest_analysis(owner_sub)? else {
        return Err(anyhow!("analysis has not run yet"));
    };
    outputs
        .sku_posteriors
        .get(sku_id)
        .cloned()
        .ok_or_else(|| anyhow!("sku posterior not found"))
}

pub fn load_service_posterior(owner_sub: &str, service_id: &str) -> Result<SenaServicePosterior> {
    let store = build_store()?;
    let Some(outputs) = store.load_latest_analysis(owner_sub)? else {
        return Err(anyhow!("analysis has not run yet"));
    };
    outputs
        .service_posteriors
        .get(service_id)
        .cloned()
        .ok_or_else(|| anyhow!("service posterior not found"))
}

pub fn load_diagnostics(owner_sub: &str) -> Result<crate::types::SenaDiagnosticsSummary> {
    let store = build_store()?;
    let Some(outputs) = store.load_latest_analysis(owner_sub)? else {
        return Err(anyhow!("analysis has not run yet"));
    };
    Ok(outputs.diagnostics)
}
