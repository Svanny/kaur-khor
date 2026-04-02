use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaSku {
    pub sku_id: String,
    pub name: String,
    pub description: String,
    pub sold_as_product: bool,
    pub units_per_retail_sale: f64,
    pub current_stock_units: f64,
    pub reorder_target_service_level: f64,
    pub default_lead_time_days: Option<f64>,
    pub default_lead_time_variability: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaServiceRecipeLink {
    pub sku_id: String,
    pub usage_probability: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaService {
    pub service_id: String,
    pub name: String,
    pub description: String,
    pub base_price: f64,
    #[serde(default)]
    pub recipe_links: Vec<SenaServiceRecipeLink>,
    #[serde(default)]
    pub is_bundle: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaServiceMaskUpdateRequest {
    pub service_id: String,
    #[serde(default)]
    pub recipe_links: Vec<SenaServiceRecipeLink>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaUpsertSkuRequest {
    pub sku_id: String,
    pub name: String,
    pub description: String,
    pub sold_as_product: bool,
    #[serde(default = "default_units_per_retail_sale")]
    pub units_per_retail_sale: f64,
    pub current_stock_units: f64,
    #[serde(default = "default_target_service_level")]
    pub reorder_target_service_level: f64,
    #[serde(default)]
    pub default_lead_time_days: Option<f64>,
    #[serde(default)]
    pub default_lead_time_variability: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaUpsertServiceRequest {
    pub service_id: String,
    pub name: String,
    pub description: String,
    pub base_price: f64,
    #[serde(default)]
    pub recipe_links: Vec<SenaServiceRecipeLink>,
    #[serde(default)]
    pub is_bundle: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaSkuSnapshot {
    pub sku_id: String,
    pub units_in_stock: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaOrderEventInput {
    pub sku_id: String,
    #[serde(default)]
    pub order_placed: bool,
    #[serde(default)]
    pub order_received: bool,
    #[serde(default)]
    pub placed_quantity: Option<f64>,
    #[serde(default)]
    pub received_quantity: Option<f64>,
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
    #[serde(default)]
    pub typical_days: Option<f64>,
    #[serde(default)]
    pub low_days: Option<f64>,
    #[serde(default)]
    pub high_days: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SenaRegime {
    Normal,
    Spike,
    Lull,
    StockoutConstrained,
    Promo,
    Correction,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaObservationRecord {
    pub observation_id: String,
    pub reported_at: String,
    pub sku_snapshots: Vec<SenaSkuSnapshot>,
    #[serde(default)]
    pub top_service_ranking: Vec<String>,
    #[serde(default)]
    pub top_retail_ranking: Vec<String>,
    #[serde(default)]
    pub service_stockouts: Vec<String>,
    #[serde(default)]
    pub retail_stockouts: Vec<String>,
    #[serde(default)]
    pub order_events: Vec<SenaOrderEventInput>,
    #[serde(default)]
    pub service_prices: Vec<SenaServicePriceObservation>,
    #[serde(default)]
    pub retail_prices: Vec<SenaRetailPriceObservation>,
    #[serde(default)]
    pub lead_time_hints: Vec<SenaLeadTimeHint>,
    #[serde(default)]
    pub notes: Option<String>,
}

pub type SenaObservationIngestRequest = SenaObservationRecord;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaArtifactReference {
    pub artifact_role: String,
    pub artifact_version: i32,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SenaRunStatus {
    Pending,
    Running,
    Succeeded,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaAnalysisRunSummary {
    pub run_id: String,
    pub status: SenaRunStatus,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub observation_count: usize,
    pub interval_count: usize,
    pub top_regime: Option<SenaRegime>,
    #[serde(default)]
    pub artifacts: Vec<SenaArtifactReference>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaInventoryPosterior {
    pub latest_units_mean: f64,
    pub credible_interval_low: f64,
    pub credible_interval_high: f64,
    pub probability_near_zero: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaDemandPosterior {
    pub demand_rate_mean: f64,
    pub demand_rate_low: f64,
    pub demand_rate_high: f64,
    pub forecast_rate_mean: f64,
    pub lost_demand_mean: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaOrderPipelinePosterior {
    pub placed_quantity_mean: f64,
    pub received_quantity_mean: f64,
    pub pipeline_units_mean: f64,
    pub reorder_trigger_probability: f64,
    pub days_since_last_order: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaLeadTimePosterior {
    pub mean_days: f64,
    pub variance_days: f64,
    pub variability_class: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaReorderPolicy {
    pub target_service_level: f64,
    pub expected_lead_time_demand: f64,
    pub safety_stock: f64,
    pub reorder_point: f64,
    pub reorder_trigger_probability: f64,
    pub days_of_cover: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaIntervalDiagnostics {
    pub interval_index: usize,
    pub start_at: String,
    pub end_at: String,
    pub duration_days: f64,
    pub service_demand_mean: f64,
    pub retail_demand_mean: f64,
    pub total_demand_mean: f64,
    pub placed_quantity_mean: f64,
    pub received_quantity_mean: f64,
    pub correction_mean: f64,
    pub pipeline_units_mean: f64,
    pub stockout_risk: f64,
    pub dominant_regime: SenaRegime,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaSkuPosterior {
    pub sku_id: String,
    pub inventory: SenaInventoryPosterior,
    pub demand: SenaDemandPosterior,
    pub order_pipeline: SenaOrderPipelinePosterior,
    pub lead_time: SenaLeadTimePosterior,
    pub reorder_policy: SenaReorderPolicy,
    #[serde(default)]
    pub intervals: Vec<SenaIntervalDiagnostics>,
    pub regime_probabilities: BTreeMap<String, f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaServicePosterior {
    pub service_id: String,
    pub estimated_activity_per_interval: f64,
    pub bottleneck_probability: f64,
    pub revenue_mean: f64,
    pub dominant_regime: SenaRegime,
    #[serde(default)]
    pub constrained_sku_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaDiagnosticsSummary {
    pub observation_count: usize,
    pub interval_count: usize,
    pub effective_sample_size_hint: f64,
    pub ranking_signal_count: usize,
    pub stockout_signal_count: usize,
    pub order_signal_count: usize,
    pub top_regime: Option<SenaRegime>,
    #[serde(default)]
    pub intervals: Vec<SenaIntervalDiagnostics>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaWorkspaceSummary {
    pub skus: Vec<SenaSku>,
    pub services: Vec<SenaService>,
    pub observations: Vec<SenaObservationRecord>,
    pub latest_run: Option<SenaAnalysisRunSummary>,
    pub diagnostics: SenaDiagnosticsSummary,
    pub high_risk_sku_ids: Vec<String>,
    pub pending_reorder_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaAnalysisOutputs {
    pub run: SenaAnalysisRunSummary,
    pub workspace: SenaWorkspaceSummary,
    pub sku_posteriors: BTreeMap<String, SenaSkuPosterior>,
    pub service_posteriors: BTreeMap<String, SenaServicePosterior>,
    pub diagnostics: SenaDiagnosticsSummary,
}

#[derive(Debug, Clone)]
pub struct SenaWorkspaceData {
    pub skus: Vec<SenaSku>,
    pub services: Vec<SenaService>,
    pub observations: Vec<SenaObservationRecord>,
}

pub fn default_units_per_retail_sale() -> f64 {
    1.0
}

pub fn default_target_service_level() -> f64 {
    0.95
}
