use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use time::{format_description::well_known::Rfc3339, OffsetDateTime};

const CONTROL_CHARS: &str = "\u{0000}\u{0001}\u{0002}\u{0003}\u{0004}\u{0005}\u{0006}\u{0007}\u{0008}\u{000B}\u{000C}\u{000E}\u{000F}\u{0010}\u{0011}\u{0012}\u{0013}\u{0014}\u{0015}\u{0016}\u{0017}\u{0018}\u{0019}\u{001A}\u{001B}\u{001C}\u{001D}\u{001E}\u{001F}\u{007F}";
const BIDI_CONTROL_CHARS: &str = "\u{202A}\u{202B}\u{202C}\u{202D}\u{202E}\u{2066}\u{2067}\u{2068}\u{2069}";

pub const SKU_NAME_MAX_LENGTH: usize = 80;
pub const SKU_DESCRIPTION_MAX_LENGTH: usize = 250;
pub const SERVICE_NAME_MAX_LENGTH: usize = 80;
pub const SERVICE_DESCRIPTION_MAX_LENGTH: usize = 250;
pub const REPORT_NOTES_MAX_LENGTH: usize = 500;
pub const INVENTORY_UNITS_MAX: f64 = 1_000_000.0;
pub const MONETARY_AMOUNT_MAX: f64 = 1_000_000_000.0;
pub const LEAD_TIME_MAX_DAYS: f64 = 365.0;
pub const TOP_RANKING_MAX: usize = 10;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum DesktopRankingEntryType {
    Sku,
    Service,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[serde(rename_all = "snake_case")]
pub enum SistRegime {
    Normal,
    Spike,
    Lull,
    StockoutConstrained,
    Correction,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SistConfidence {
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SistAnalysisState {
    Empty,
    Running,
    Ready,
    Stale,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopSkuRecord {
    pub sku_id: String,
    pub name: String,
    pub description: String,
    pub units_in_stock: f64,
    pub cost_per_unit: f64,
    pub sold_as_product: bool,
    pub product_price: Option<f64>,
    pub lead_time_mean_days: Option<f64>,
    pub lead_time_std_days: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopServiceRecord {
    pub service_id: String,
    pub name: String,
    pub description: String,
    pub price: f64,
    pub sku_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopRankingEntry {
    pub entry_type: DesktopRankingEntryType,
    pub entry_id: String,
    pub position: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StockReportSkuObservation {
    pub sku_id: String,
    pub units_in_stock: f64,
    pub cost_per_unit: f64,
    #[serde(default)]
    pub restock_included: bool,
    #[serde(default)]
    pub retail_stockout: bool,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StockReportServiceSignal {
    pub service_id: String,
    #[serde(default)]
    pub stockout: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StockReportRecord {
    pub report_id: String,
    pub report_source: String,
    pub reported_at: String,
    pub sku_observations: Vec<StockReportSkuObservation>,
    pub service_signals: Vec<StockReportServiceSignal>,
    pub top_service_ranking: Vec<String>,
    pub top_retail_ranking: Vec<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LeadTimeSummary {
    pub mean_days: f64,
    pub std_days: f64,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SistAnalysisStatus {
    pub state: SistAnalysisState,
    pub updated_at: Option<String>,
    pub report_count: usize,
    pub confidence: SistConfidence,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SistSkuInsight {
    pub sku_id: String,
    pub latest_posterior_units: f64,
    pub credible_interval_low: f64,
    pub credible_interval_high: f64,
    pub days_of_cover: Option<f64>,
    pub stockout_risk: f64,
    pub reorder_point: f64,
    pub safety_stock: f64,
    pub reorder_trigger_probability: f64,
    pub expected_demand_per_day: f64,
    pub demand_interval_low: f64,
    pub demand_interval_high: f64,
    pub lead_time: LeadTimeSummary,
    pub regime_probabilities: std::collections::BTreeMap<String, f64>,
    pub confidence: SistConfidence,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SistOverview {
    pub status: SistAnalysisStatus,
    pub settings: SistSettings,
    pub as_of: Option<String>,
    pub top_regime: Option<SistRegime>,
    pub pending_reorder_count: usize,
    pub high_risk_sku_ids: Vec<String>,
    pub sku_insights: Vec<SistSkuInsight>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SistSkuDetailResponse {
    pub insight: SistSkuInsight,
    pub reports: Vec<StockReportRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SistSettings {
    pub target_service_level: f64,
    pub forecast_horizon_days: usize,
    pub particle_count: usize,
    pub smoothing_window_reports: usize,
}

impl Default for SistSettings {
    fn default() -> Self {
        Self {
            target_service_level: 0.95,
            forecast_horizon_days: 14,
            particle_count: 512,
            smoothing_window_reports: 90,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopInventoryResponse {
    pub skus: Vec<DesktopSkuRecord>,
    pub services: Vec<DesktopServiceRecord>,
    pub ranking: Vec<DesktopRankingEntry>,
    pub sist: SistOverview,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertDesktopSkuRequest {
    pub sku_id: String,
    pub name: String,
    pub description: String,
    pub units_in_stock: f64,
    pub cost_per_unit: f64,
    pub sold_as_product: bool,
    pub product_price: Option<f64>,
    pub lead_time_mean_days: Option<f64>,
    pub lead_time_std_days: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertDesktopServiceRequest {
    pub service_id: String,
    pub name: String,
    pub description: String,
    pub price: f64,
    pub sku_ids: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopStockUpdateItem {
    pub sku_id: String,
    pub units_in_stock: f64,
    pub cost_per_unit: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyDesktopStockUpdatesRequest {
    pub updates: Vec<DesktopStockUpdateItem>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveDesktopRankingRequest {
    pub entries: Vec<DesktopRankingEntry>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitStockReportRequest {
    pub reported_at: String,
    pub sku_observations: Vec<StockReportSkuObservation>,
    #[serde(default)]
    pub service_signals: Vec<StockReportServiceSignal>,
    #[serde(default)]
    pub top_service_ranking: Vec<String>,
    #[serde(default)]
    pub top_retail_ranking: Vec<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSistSettingsRequest {
    pub target_service_level: f64,
    pub forecast_horizon_days: usize,
    pub particle_count: usize,
    pub smoothing_window_reports: usize,
}

impl UpsertDesktopSkuRequest {
    pub fn validate(&mut self) -> Result<()> {
        validate_entry_id("skuId", &self.sku_id)?;
        self.name = normalize_text(&self.name, SKU_NAME_MAX_LENGTH)?;
        self.description = normalize_text(&self.description, SKU_DESCRIPTION_MAX_LENGTH)?;
        validate_non_negative("unitsInStock", self.units_in_stock, INVENTORY_UNITS_MAX)?;
        validate_non_negative("costPerUnit", self.cost_per_unit, MONETARY_AMOUNT_MAX)?;
        validate_optional_non_negative(
            "leadTimeMeanDays",
            self.lead_time_mean_days,
            LEAD_TIME_MAX_DAYS,
        )?;
        validate_optional_non_negative(
            "leadTimeStdDays",
            self.lead_time_std_days,
            LEAD_TIME_MAX_DAYS,
        )?;
        match self.product_price {
            Some(product_price) => {
                validate_non_negative("productPrice", product_price, MONETARY_AMOUNT_MAX)?;
                if !self.sold_as_product {
                    return Err(anyhow!(
                        "productPrice may only be set when soldAsProduct=true"
                    ));
                }
            }
            None => {
                if self.sold_as_product {
                    return Err(anyhow!("productPrice is required when soldAsProduct=true"));
                }
            }
        }
        Ok(())
    }
}

impl UpsertDesktopServiceRequest {
    pub fn validate(&mut self) -> Result<()> {
        validate_entry_id("serviceId", &self.service_id)?;
        self.name = normalize_text(&self.name, SERVICE_NAME_MAX_LENGTH)?;
        self.description = normalize_text(&self.description, SERVICE_DESCRIPTION_MAX_LENGTH)?;
        validate_non_negative("price", self.price, MONETARY_AMOUNT_MAX)?;
        self.sku_ids.sort();
        self.sku_ids.dedup();
        for sku_id in &self.sku_ids {
            validate_entry_id("skuIds", sku_id)?;
        }
        Ok(())
    }
}

impl ApplyDesktopStockUpdatesRequest {
    pub fn validate(&self) -> Result<()> {
        if self.updates.is_empty() {
            return Err(anyhow!("updates must not be empty"));
        }
        for update in &self.updates {
            validate_entry_id("skuId", &update.sku_id)?;
            validate_non_negative("unitsInStock", update.units_in_stock, INVENTORY_UNITS_MAX)?;
            validate_non_negative("costPerUnit", update.cost_per_unit, MONETARY_AMOUNT_MAX)?;
        }
        Ok(())
    }
}

impl SaveDesktopRankingRequest {
    pub fn validate(&self) -> Result<()> {
        if self.entries.is_empty() {
            return Err(anyhow!("entries must not be empty"));
        }
        let mut seen_ids = HashSet::new();
        let mut seen_positions = HashSet::new();
        for entry in &self.entries {
            validate_entry_id("entryId", &entry.entry_id)?;
            let key = format!("{:?}:{}", entry.entry_type, entry.entry_id);
            if !seen_ids.insert(key) {
                return Err(anyhow!("ranking entries must be unique"));
            }
            if !seen_positions.insert(entry.position) {
                return Err(anyhow!("ranking positions must be unique"));
            }
        }
        Ok(())
    }
}

impl SubmitStockReportRequest {
    pub fn validate(&mut self) -> Result<()> {
        validate_reported_at(&self.reported_at)?;
        let mut seen_skus = HashSet::new();
        for observation in &mut self.sku_observations {
            validate_entry_id("skuId", &observation.sku_id)?;
            validate_non_negative("unitsInStock", observation.units_in_stock, INVENTORY_UNITS_MAX)?;
            validate_non_negative("costPerUnit", observation.cost_per_unit, MONETARY_AMOUNT_MAX)?;
            if let Some(notes) = observation.notes.as_mut() {
                *notes = normalize_text(notes, REPORT_NOTES_MAX_LENGTH)?;
            }
            if !seen_skus.insert(observation.sku_id.clone()) {
                return Err(anyhow!("skuObservations must not contain duplicate skuIds"));
            }
        }

        let mut seen_services = HashSet::new();
        for signal in &self.service_signals {
            validate_entry_id("serviceId", &signal.service_id)?;
            if !seen_services.insert(signal.service_id.clone()) {
                return Err(anyhow!("serviceSignals must not contain duplicate serviceIds"));
            }
        }

        normalize_ranking_ids("topServiceRanking", &mut self.top_service_ranking)?;
        normalize_ranking_ids("topRetailRanking", &mut self.top_retail_ranking)?;

        if let Some(notes) = self.notes.as_mut() {
            *notes = normalize_text(notes, REPORT_NOTES_MAX_LENGTH)?;
        }

        if self.sku_observations.is_empty()
            && self.service_signals.is_empty()
            && self.top_service_ranking.is_empty()
            && self.top_retail_ranking.is_empty()
            && self.notes.is_none()
        {
            return Err(anyhow!("report must include at least one observation, signal, ranking, or note"));
        }
        Ok(())
    }
}

impl UpdateSistSettingsRequest {
    pub fn validate(&self) -> Result<()> {
        if !self.target_service_level.is_finite()
            || self.target_service_level <= 0.5
            || self.target_service_level >= 0.999
        {
            return Err(anyhow!("targetServiceLevel must be between 0.5 and 0.999"));
        }
        if !(1..=180).contains(&self.forecast_horizon_days) {
            return Err(anyhow!("forecastHorizonDays must be between 1 and 180"));
        }
        if !(64..=4096).contains(&self.particle_count) {
            return Err(anyhow!("particleCount must be between 64 and 4096"));
        }
        if !(10..=365).contains(&self.smoothing_window_reports) {
            return Err(anyhow!("smoothingWindowReports must be between 10 and 365"));
        }
        Ok(())
    }
}

pub fn normalize_text(input: &str, max_length: usize) -> Result<String> {
    let mut normalized = String::with_capacity(input.len());
    let mut last_was_space = false;

    for ch in input.trim().chars() {
        if CONTROL_CHARS.contains(ch) || BIDI_CONTROL_CHARS.contains(ch) {
            return Err(anyhow!("text fields must not contain control characters"));
        }
        if ch.is_whitespace() {
            if !last_was_space {
                normalized.push(' ');
                last_was_space = true;
            }
            continue;
        }
        normalized.push(ch);
        last_was_space = false;
    }

    if normalized.is_empty() {
        return Err(anyhow!("text fields are required"));
    }
    if normalized.len() > max_length {
        return Err(anyhow!("text fields must be at most {max_length} characters"));
    }
    Ok(normalized)
}

pub fn validate_entry_id(field_name: &str, value: &str) -> Result<()> {
    if !(3..=64).contains(&value.len()) {
        return Err(anyhow!("{field_name} must be 3..64 characters"));
    }
    if !value
        .chars()
        .all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || matches!(ch, '-' | '_'))
    {
        return Err(anyhow!(
            "{field_name} must contain only lowercase letters, digits, '-' or '_'"
        ));
    }
    Ok(())
}

pub fn validate_non_negative(field_name: &str, value: f64, max_value: f64) -> Result<()> {
    if !value.is_finite() {
        return Err(anyhow!("{field_name} must be a finite number"));
    }
    if value < 0.0 {
        return Err(anyhow!("{field_name} cannot be negative"));
    }
    if value > max_value {
        return Err(anyhow!("{field_name} must be at most {max_value}"));
    }
    Ok(())
}

pub fn validate_optional_non_negative(
    field_name: &str,
    value: Option<f64>,
    max_value: f64,
) -> Result<()> {
    if let Some(value) = value {
        validate_non_negative(field_name, value, max_value)?;
    }
    Ok(())
}

pub fn validate_reported_at(reported_at: &str) -> Result<OffsetDateTime> {
    OffsetDateTime::parse(reported_at, &Rfc3339)
        .map_err(|_| anyhow!("reportedAt must be a valid RFC3339 timestamp"))
}

fn normalize_ranking_ids(field_name: &str, values: &mut Vec<String>) -> Result<()> {
    if values.len() > TOP_RANKING_MAX {
        return Err(anyhow!("{field_name} must contain at most {TOP_RANKING_MAX} entries"));
    }
    let mut normalized = Vec::with_capacity(values.len());
    let mut seen = HashSet::new();
    for value in values.iter() {
        validate_entry_id(field_name, value)?;
        if seen.insert(value.clone()) {
            normalized.push(value.clone());
        }
    }
    *values = normalized;
    Ok(())
}
