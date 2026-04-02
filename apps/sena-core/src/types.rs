use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashSet};
use time::OffsetDateTime;

pub const SENA_SCHEMA_VERSION: i32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaCatalog {
    pub schema_version: i32,
    pub skus: Vec<SenaSku>,
    pub services: Vec<SenaService>,
    #[serde(default)]
    pub bundles: Vec<SenaBundle>,
    #[serde(default)]
    pub sharing_mask: Vec<SenaServiceSkuMaskEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaSku {
    pub sku_id: String,
    pub name: String,
    pub description: String,
    pub cost_per_unit: f64,
    #[serde(default)]
    pub sold_as_product: bool,
    pub product_price: Option<f64>,
    pub lead_time_mean_days_hint: Option<f64>,
    pub lead_time_std_days_hint: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaService {
    pub service_id: String,
    pub name: String,
    pub description: String,
    pub price: f64,
    #[serde(default)]
    pub bundle: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaBundle {
    pub bundle_id: String,
    pub service_id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaServiceSkuMaskEntry {
    pub service_id: String,
    pub sku_id: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    pub usage_probability: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaObservationInput {
    pub observed_at: String,
    pub stock_snapshot: Vec<SenaStockSnapshot>,
    #[serde(default)]
    pub service_rankings: Vec<String>,
    #[serde(default)]
    pub retail_rankings: Vec<String>,
    #[serde(default)]
    pub service_stockouts: Vec<String>,
    #[serde(default)]
    pub retail_stockouts: Vec<String>,
    #[serde(default)]
    pub order_signals: Vec<SenaOrderSignal>,
    #[serde(default)]
    pub service_prices: Vec<SenaServicePriceObservation>,
    #[serde(default)]
    pub retail_prices: Vec<SenaRetailPriceObservation>,
    #[serde(default)]
    pub lead_time_hints: Vec<SenaLeadTimeHint>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaStockSnapshot {
    pub sku_id: String,
    pub units_in_stock: f64,
    pub cost_per_unit: Option<f64>,
    pub product_price: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaOrderSignal {
    pub sku_id: String,
    #[serde(default)]
    pub order_placed: bool,
    #[serde(default)]
    pub receipt_arrived: bool,
    pub approximate_order_quantity: Option<f64>,
    pub approximate_receipt_quantity: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaServicePriceObservation {
    pub service_id: String,
    pub price: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaRetailPriceObservation {
    pub sku_id: String,
    pub price: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaLeadTimeHint {
    pub sku_id: String,
    pub typical_days: Option<f64>,
    pub low_days: Option<f64>,
    pub high_days: Option<f64>,
    pub variability_class: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaObservationRecord {
    pub observation_id: String,
    pub owner_sub: String,
    pub input: SenaObservationInput,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SenaRunStatus {
    Queued,
    Running,
    Succeeded,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaAnalysisRunRecord {
    pub run_id: String,
    pub owner_sub: String,
    pub algorithm_version: String,
    pub status: SenaRunStatus,
    pub observation_count: usize,
    pub created_at: String,
    pub completed_at: Option<String>,
    pub summary: Option<SenaWorkspaceSummary>,
    pub diagnostics: Option<SenaDiagnostics>,
    pub primary_artifact_key: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaWorkspaceSummary {
    pub owner_sub: String,
    pub run_id: String,
    pub latest_observed_at: Option<String>,
    pub sku_count: usize,
    pub service_count: usize,
    pub interval_count: usize,
    pub pending_reorder_count: usize,
    pub top_regime: String,
    pub high_risk_sku_ids: Vec<String>,
    pub sku_summaries: Vec<SenaSkuSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaSkuSummary {
    pub sku_id: String,
    pub latest_posterior_units: f64,
    pub credible_interval_low: f64,
    pub credible_interval_high: f64,
    pub demand_per_day_mean: f64,
    pub stockout_risk: f64,
    pub days_of_cover: Option<f64>,
    pub expected_lead_time_demand: f64,
    pub safety_stock: f64,
    pub reorder_point: f64,
    pub reorder_trigger_probability: f64,
    pub lead_time_mean_days: f64,
    pub lead_time_std_days: f64,
    pub regime_probabilities: BTreeMap<String, f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaSkuDetail {
    pub summary: SenaSkuSummary,
    pub inventory_posterior: Vec<SenaTrajectoryPoint>,
    pub demand_posterior: Vec<SenaIntervalPosterior>,
    pub pipeline_posterior: Vec<SenaPipelinePosteriorPoint>,
    pub lead_time_posterior: Vec<SenaLeadTimePosteriorPoint>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaServiceDetail {
    pub service_id: String,
    pub activity_mean: f64,
    pub activity_interval_low: f64,
    pub activity_interval_high: f64,
    pub bottleneck_probability: f64,
    pub contributors: Vec<SenaServiceContributor>,
    pub regime_timeline: Vec<SenaRegimePosteriorPoint>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaServiceContributor {
    pub sku_id: String,
    pub usage_probability: f64,
    pub bottleneck_probability: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaDiagnostics {
    pub effective_sample_size_mean: f64,
    pub resampling_count: usize,
    pub smoothing_enabled: bool,
    pub change_point_probability: f64,
    pub seasonality_active: bool,
    pub posterior_predictive_error_mean: f64,
    pub coverage_estimate: f64,
    pub regime_history: Vec<SenaRegimePosteriorPoint>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaRegimePosteriorPoint {
    pub interval_index: usize,
    pub start_at: String,
    pub end_at: String,
    pub dominant_regime: String,
    pub regime_probabilities: BTreeMap<String, f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaTrajectoryPoint {
    pub at: String,
    pub mean: f64,
    pub low: f64,
    pub high: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaIntervalPosterior {
    pub interval_index: usize,
    pub start_at: String,
    pub end_at: String,
    pub delta_days: f64,
    pub service_demand_mean: f64,
    pub retail_demand_mean: f64,
    pub unconstrained_demand_mean: f64,
    pub realized_consumption_mean: f64,
    pub adjustments_mean: f64,
    pub receipts_mean: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaPipelinePosteriorPoint {
    pub interval_index: usize,
    pub in_transit_mean: f64,
    pub order_probability: f64,
    pub order_quantity_mean: f64,
    pub receipt_quantity_mean: f64,
    pub age_days_mean: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaLeadTimePosteriorPoint {
    pub interval_index: usize,
    pub log_mean_days: f64,
    pub log_std_days: f64,
    pub mean_days: f64,
    pub std_days: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaAnalysisResult {
    pub workspace_summary: SenaWorkspaceSummary,
    pub sku_details: Vec<SenaSkuDetail>,
    pub service_details: Vec<SenaServiceDetail>,
    pub diagnostics: SenaDiagnostics,
}

fn default_true() -> bool {
    true
}

impl SenaCatalog {
    pub fn validate(&self) -> Result<()> {
        if self.schema_version != SENA_SCHEMA_VERSION {
            return Err(anyhow!("schemaVersion must be {}", SENA_SCHEMA_VERSION));
        }
        if self.skus.is_empty() {
            return Err(anyhow!("catalog must include at least one sku"));
        }
        let mut sku_ids = HashSet::new();
        for sku in &self.skus {
            validate_identifier("skuId", &sku.sku_id)?;
            validate_non_empty("sku name", &sku.name)?;
            if !sku_ids.insert(sku.sku_id.clone()) {
                return Err(anyhow!("duplicate skuId '{}'", sku.sku_id));
            }
        }
        let mut service_ids = HashSet::new();
        for service in &self.services {
            validate_identifier("serviceId", &service.service_id)?;
            validate_non_empty("service name", &service.name)?;
            if !service_ids.insert(service.service_id.clone()) {
                return Err(anyhow!("duplicate serviceId '{}'", service.service_id));
            }
        }
        for entry in &self.sharing_mask {
            if !service_ids.contains(&entry.service_id) {
                return Err(anyhow!(
                    "sharingMask references unknown serviceId '{}'",
                    entry.service_id
                ));
            }
            if !sku_ids.contains(&entry.sku_id) {
                return Err(anyhow!("sharingMask references unknown skuId '{}'", entry.sku_id));
            }
            if let Some(probability) = entry.usage_probability {
                if !(0.0..=1.0).contains(&probability) {
                    return Err(anyhow!("usageProbability must be between 0 and 1"));
                }
            }
        }
        Ok(())
    }
}

impl SenaObservationInput {
    pub fn validate(&self) -> Result<()> {
        if self.stock_snapshot.is_empty() {
            return Err(anyhow!("stockSnapshot must include at least one sku"));
        }
        OffsetDateTime::parse(&self.observed_at, &time::format_description::well_known::Rfc3339)
            .map_err(|err| anyhow!("observedAt must be RFC3339: {err}"))?;
        let mut seen = HashSet::new();
        for snapshot in &self.stock_snapshot {
            validate_identifier("skuId", &snapshot.sku_id)?;
            if snapshot.units_in_stock < 0.0 {
                return Err(anyhow!("unitsInStock must be >= 0"));
            }
            if !seen.insert(snapshot.sku_id.clone()) {
                return Err(anyhow!("duplicate stockSnapshot skuId '{}'", snapshot.sku_id));
            }
        }
        Ok(())
    }
}

pub fn validate_identifier(label: &str, value: &str) -> Result<()> {
    validate_non_empty(label, value)?;
    if value.len() > 80 {
        return Err(anyhow!("{label} must be <= 80 chars"));
    }
    Ok(())
}

pub fn validate_non_empty(label: &str, value: &str) -> Result<()> {
    if value.trim().is_empty() {
        return Err(anyhow!("{label} must not be empty"));
    }
    Ok(())
}
