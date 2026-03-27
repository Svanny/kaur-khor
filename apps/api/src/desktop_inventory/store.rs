use super::types::{
    ApplyDesktopStockUpdatesRequest, DesktopInventoryResponse, DesktopRankingEntry,
    DesktopRankingEntryType, DesktopServiceRecord, DesktopSkuRecord, LeadTimeSummary,
    SaveDesktopRankingRequest, SistAnalysisState, SistAnalysisStatus, SistConfidence,
    SistOverview, SistRegime, SistSettings, SistSkuDetailResponse, SistSkuInsight,
    StockReportRecord, StockReportSkuObservation, SubmitStockReportRequest,
    UpdateSistSettingsRequest, UpsertDesktopServiceRequest, UpsertDesktopSkuRequest,
};
use anyhow::{anyhow, Context, Result};
use once_cell::sync::Lazy;
use rand::{rngs::StdRng, Rng, SeedableRng};
use serde::{Deserialize, Serialize};
use std::{
    cmp::Ordering,
    collections::{BTreeMap, HashMap, HashSet},
    env, fs,
    hash::{Hash, Hasher},
    path::{Path, PathBuf},
    sync::Mutex,
};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};

static STORE_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));

const STORE_SCHEMA_VERSION: u8 = 2;
const SIST_SCHEMA_VERSION: u8 = 1;

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopInventoryStore {
    schema_version: u8,
    owners: HashMap<String, OwnerInventory>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OwnerInventory {
    catalog: CatalogState,
    merchandising: MerchandisingState,
    sist: OwnerSistState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CatalogState {
    skus: Vec<DesktopSkuRecord>,
    services: Vec<DesktopServiceRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MerchandisingState {
    ranking: Vec<DesktopRankingEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OwnerSistState {
    schema_version: u8,
    settings: SistSettings,
    stock_reports: Vec<StockReportRecord>,
    cached_analysis: CachedSistAnalysis,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CachedSistAnalysis {
    overview: SistOverview,
}

#[derive(Debug, Serialize, Deserialize)]
struct LegacyDesktopInventoryStore {
    owners: HashMap<String, LegacyOwnerInventory>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LegacyOwnerInventory {
    skus: Vec<DesktopSkuRecord>,
    services: Vec<DesktopServiceRecord>,
    ranking: Vec<DesktopRankingEntry>,
}

impl OwnerInventory {
    fn seeded() -> Self {
        let skus = vec![
            DesktopSkuRecord {
                sku_id: "sku-001".to_string(),
                name: "SKU #001".to_string(),
                description: "Base ingredient for high volume items.".to_string(),
                units_in_stock: 264.0,
                cost_per_unit: 1296.0 / 264.0,
                sold_as_product: true,
                product_price: Some(10.0),
                lead_time_mean_days: Some(5.0),
                lead_time_std_days: Some(1.5),
            },
            DesktopSkuRecord {
                sku_id: "sku-002".to_string(),
                name: "SKU #002".to_string(),
                description: "Reusable material with stable demand.".to_string(),
                units_in_stock: 146.0,
                cost_per_unit: 601.2 / 146.0,
                sold_as_product: false,
                product_price: None,
                lead_time_mean_days: Some(7.0),
                lead_time_std_days: Some(2.0),
            },
            DesktopSkuRecord {
                sku_id: "sku-003".to_string(),
                name: "SKU #003".to_string(),
                description: "Low-rotation backup stock.".to_string(),
                units_in_stock: 76.0,
                cost_per_unit: 592.0 / 76.0,
                sold_as_product: true,
                product_price: Some(16.0),
                lead_time_mean_days: None,
                lead_time_std_days: None,
            },
            DesktopSkuRecord {
                sku_id: "sku-004".to_string(),
                name: "SKU #004".to_string(),
                description: "Seasonal inventory reserved for peak periods.".to_string(),
                units_in_stock: 98.0,
                cost_per_unit: 931.0 / 98.0,
                sold_as_product: false,
                product_price: None,
                lead_time_mean_days: None,
                lead_time_std_days: None,
            },
        ];
        let services = vec![
            DesktopServiceRecord {
                service_id: "service-001".to_string(),
                name: "Service #001".to_string(),
                description: "Basic package for recurring customers.".to_string(),
                price: 1200.0,
                sku_ids: vec!["sku-001".to_string(), "sku-002".to_string()],
            },
            DesktopServiceRecord {
                service_id: "service-002".to_string(),
                name: "Service #002".to_string(),
                description: "Premium package with deeper SKU usage.".to_string(),
                price: 2200.0,
                sku_ids: vec!["sku-002".to_string(), "sku-003".to_string()],
            },
        ];
        let ranking = build_default_ranking(&skus, &services);
        let mut owner = Self {
            catalog: CatalogState { skus, services },
            merchandising: MerchandisingState { ranking },
            sist: OwnerSistState {
                schema_version: SIST_SCHEMA_VERSION,
                settings: SistSettings::default(),
                stock_reports: Vec::new(),
                cached_analysis: CachedSistAnalysis {
                    overview: empty_overview("seed data initialized"),
                },
            },
        };
        ensure_baseline_report(&mut owner, "manual");
        recompute_analysis("seed", &mut owner);
        owner
    }
}

pub fn load_inventory(owner_sub: &str) -> Result<DesktopInventoryResponse> {
    with_store_mut(|store| {
        let owner = ensure_owner(store, owner_sub);
        normalize_owner(owner);
        Ok(snapshot_from_owner(owner))
    })
}

pub fn create_sku(owner_sub: &str, request: UpsertDesktopSkuRequest) -> Result<DesktopSkuRecord> {
    with_store_mut(|store| {
        let owner = ensure_owner(store, owner_sub);
        if owner
            .catalog
            .skus
            .iter()
            .any(|sku| sku.sku_id == request.sku_id)
        {
            return Err(anyhow!("sku already exists"));
        }
        let record = DesktopSkuRecord {
            sku_id: request.sku_id,
            name: request.name,
            description: request.description,
            units_in_stock: request.units_in_stock,
            cost_per_unit: request.cost_per_unit,
            sold_as_product: request.sold_as_product,
            product_price: request.product_price,
            lead_time_mean_days: request.lead_time_mean_days,
            lead_time_std_days: request.lead_time_std_days,
        };
        owner.catalog.skus.push(record.clone());
        owner.merchandising.ranking =
            normalize_ranking(&owner.merchandising.ranking, &owner.catalog.skus, &owner.catalog.services);
        recompute_analysis(owner_sub, owner);
        Ok(record)
    })
}

pub fn update_sku(
    owner_sub: &str,
    sku_id: &str,
    request: UpsertDesktopSkuRequest,
) -> Result<DesktopSkuRecord> {
    with_store_mut(|store| {
        let owner = ensure_owner(store, owner_sub);
        let existing_index = owner
            .catalog
            .skus
            .iter()
            .position(|sku| sku.sku_id == sku_id)
            .ok_or_else(|| anyhow!("sku not found"))?;
        owner.catalog.skus[existing_index] = DesktopSkuRecord {
            sku_id: sku_id.to_string(),
            name: request.name,
            description: request.description,
            units_in_stock: request.units_in_stock,
            cost_per_unit: request.cost_per_unit,
            sold_as_product: request.sold_as_product,
            product_price: request.product_price,
            lead_time_mean_days: request.lead_time_mean_days,
            lead_time_std_days: request.lead_time_std_days,
        };

        let valid_sku_ids = owner
            .catalog
            .skus
            .iter()
            .map(|sku| sku.sku_id.clone())
            .collect::<HashSet<_>>();
        for service in &mut owner.catalog.services {
            service
                .sku_ids
                .retain(|linked_sku_id| valid_sku_ids.contains(linked_sku_id));
        }
        owner.merchandising.ranking =
            normalize_ranking(&owner.merchandising.ranking, &owner.catalog.skus, &owner.catalog.services);
        recompute_analysis(owner_sub, owner);
        Ok(owner.catalog.skus[existing_index].clone())
    })
}

pub fn create_service(
    owner_sub: &str,
    request: UpsertDesktopServiceRequest,
) -> Result<DesktopServiceRecord> {
    with_store_mut(|store| {
        let owner = ensure_owner(store, owner_sub);
        validate_service_links(owner, &request.sku_ids)?;
        if owner
            .catalog
            .services
            .iter()
            .any(|service| service.service_id == request.service_id)
        {
            return Err(anyhow!("service already exists"));
        }
        let record = DesktopServiceRecord {
            service_id: request.service_id,
            name: request.name,
            description: request.description,
            price: request.price,
            sku_ids: request.sku_ids,
        };
        owner.catalog.services.push(record.clone());
        owner.merchandising.ranking =
            normalize_ranking(&owner.merchandising.ranking, &owner.catalog.skus, &owner.catalog.services);
        recompute_analysis(owner_sub, owner);
        Ok(record)
    })
}

pub fn update_service(
    owner_sub: &str,
    service_id: &str,
    request: UpsertDesktopServiceRequest,
) -> Result<DesktopServiceRecord> {
    with_store_mut(|store| {
        let owner = ensure_owner(store, owner_sub);
        validate_service_links(owner, &request.sku_ids)?;
        let existing_index = owner
            .catalog
            .services
            .iter()
            .position(|service| service.service_id == service_id)
            .ok_or_else(|| anyhow!("service not found"))?;
        owner.catalog.services[existing_index] = DesktopServiceRecord {
            service_id: service_id.to_string(),
            name: request.name,
            description: request.description,
            price: request.price,
            sku_ids: request.sku_ids,
        };
        owner.merchandising.ranking =
            normalize_ranking(&owner.merchandising.ranking, &owner.catalog.skus, &owner.catalog.services);
        recompute_analysis(owner_sub, owner);
        Ok(owner.catalog.services[existing_index].clone())
    })
}

pub fn apply_stock_updates(
    owner_sub: &str,
    request: ApplyDesktopStockUpdatesRequest,
) -> Result<Vec<DesktopSkuRecord>> {
    let reported_at = OffsetDateTime::now_utc().format(&Rfc3339)?;
    let report = SubmitStockReportRequest {
        reported_at,
        sku_observations: request
            .updates
            .into_iter()
            .map(|update| StockReportSkuObservation {
                sku_id: update.sku_id,
                units_in_stock: update.units_in_stock,
                cost_per_unit: update.cost_per_unit,
                restock_included: false,
                retail_stockout: false,
                notes: None,
            })
            .collect(),
        service_signals: Vec::new(),
        top_service_ranking: Vec::new(),
        top_retail_ranking: Vec::new(),
        notes: Some("Created by stock-updates compatibility shim".to_string()),
    };
    submit_stock_report(owner_sub, report)?;
    load_inventory(owner_sub).map(|snapshot| snapshot.skus)
}

pub fn submit_stock_report(
    owner_sub: &str,
    request: SubmitStockReportRequest,
) -> Result<StockReportRecord> {
    with_store_mut(|store| {
        let owner = ensure_owner(store, owner_sub);
        validate_report_against_catalog(owner, &request)?;

        let next_id = owner.sist.stock_reports.len() + 1;
        let report_source = if owner.sist.stock_reports.is_empty() {
            "legacy-baseline".to_string()
        } else {
            "manual".to_string()
        };
        let record = StockReportRecord {
            report_id: format!("report-{next_id:04}"),
            report_source,
            reported_at: request.reported_at,
            sku_observations: request.sku_observations,
            service_signals: request.service_signals,
            top_service_ranking: request.top_service_ranking,
            top_retail_ranking: request.top_retail_ranking,
            notes: request.notes,
        };

        for observation in &record.sku_observations {
            if let Some(sku) = owner
                .catalog
                .skus
                .iter_mut()
                .find(|sku| sku.sku_id == observation.sku_id)
            {
                sku.units_in_stock = observation.units_in_stock;
                sku.cost_per_unit = observation.cost_per_unit;
            }
        }

        owner.sist.stock_reports.push(record.clone());
        owner.sist.stock_reports.sort_by(|left, right| left.reported_at.cmp(&right.reported_at));
        recompute_analysis(owner_sub, owner);
        Ok(record)
    })
}

pub fn load_sku_detail(owner_sub: &str, sku_id: &str) -> Result<SistSkuDetailResponse> {
    with_store_mut(|store| {
        let owner = ensure_owner(store, owner_sub);
        normalize_owner(owner);
        let insight = owner
            .sist
            .cached_analysis
            .overview
            .sku_insights
            .iter()
            .find(|insight| insight.sku_id == sku_id)
            .cloned()
            .ok_or_else(|| anyhow!("sist insight not found"))?;
        let reports = owner
            .sist
            .stock_reports
            .iter()
            .filter(|report| report.sku_observations.iter().any(|observation| observation.sku_id == sku_id))
            .cloned()
            .collect();
        Ok(SistSkuDetailResponse { insight, reports })
    })
}

pub fn load_ranking(owner_sub: &str) -> Result<Vec<DesktopRankingEntry>> {
    with_store_mut(|store| {
        let owner = ensure_owner(store, owner_sub);
        owner.merchandising.ranking =
            normalize_ranking(&owner.merchandising.ranking, &owner.catalog.skus, &owner.catalog.services);
        Ok(owner.merchandising.ranking.clone())
    })
}

pub fn save_ranking(
    owner_sub: &str,
    request: SaveDesktopRankingRequest,
) -> Result<Vec<DesktopRankingEntry>> {
    with_store_mut(|store| {
        let owner = ensure_owner(store, owner_sub);
        validate_ranking_entries(owner, &request.entries)?;
        let mut entries = request.entries;
        entries.sort_by_key(|entry| entry.position);
        owner.merchandising.ranking = entries;
        Ok(owner.merchandising.ranking.clone())
    })
}

pub fn update_sist_settings(
    owner_sub: &str,
    request: UpdateSistSettingsRequest,
) -> Result<SistSettings> {
    with_store_mut(|store| {
        let owner = ensure_owner(store, owner_sub);
        owner.sist.settings = SistSettings {
            target_service_level: request.target_service_level,
            forecast_horizon_days: request.forecast_horizon_days,
            particle_count: request.particle_count,
            smoothing_window_reports: request.smoothing_window_reports,
        };
        recompute_analysis(owner_sub, owner);
        Ok(owner.sist.settings.clone())
    })
}

fn snapshot_from_owner(owner: &OwnerInventory) -> DesktopInventoryResponse {
    DesktopInventoryResponse {
        skus: owner.catalog.skus.clone(),
        services: owner.catalog.services.clone(),
        ranking: owner.merchandising.ranking.clone(),
        sist: owner.sist.cached_analysis.overview.clone(),
    }
}

fn ensure_owner<'a>(store: &'a mut DesktopInventoryStore, owner_sub: &str) -> &'a mut OwnerInventory {
    store
        .owners
        .entry(owner_sub.to_string())
        .or_insert_with(OwnerInventory::seeded)
}

fn normalize_owner(owner: &mut OwnerInventory) {
    if owner.merchandising.ranking.is_empty() {
        owner.merchandising.ranking = build_default_ranking(&owner.catalog.skus, &owner.catalog.services);
    }
    if owner.sist.stock_reports.is_empty() {
        ensure_baseline_report(owner, "legacy-baseline");
    }
    if owner.sist.cached_analysis.overview.status.state == SistAnalysisState::Empty {
        recompute_analysis("normalize", owner);
    }
}

fn ensure_baseline_report(owner: &mut OwnerInventory, source: &str) {
    if !owner.sist.stock_reports.is_empty() {
        return;
    }
    let reported_at = OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string());
    owner.sist.stock_reports.push(StockReportRecord {
        report_id: "report-0001".to_string(),
        report_source: source.to_string(),
        reported_at,
        sku_observations: owner
            .catalog
            .skus
            .iter()
            .map(|sku| StockReportSkuObservation {
                sku_id: sku.sku_id.clone(),
                units_in_stock: sku.units_in_stock,
                cost_per_unit: sku.cost_per_unit,
                restock_included: false,
                retail_stockout: false,
                notes: None,
            })
            .collect(),
        service_signals: Vec::new(),
        top_service_ranking: Vec::new(),
        top_retail_ranking: Vec::new(),
        notes: Some("Migrated from legacy desktop snapshot".to_string()),
    });
}

fn validate_service_links(owner: &OwnerInventory, sku_ids: &[String]) -> Result<()> {
    for sku_id in sku_ids {
        if !owner.catalog.skus.iter().any(|sku| &sku.sku_id == sku_id) {
            return Err(anyhow!("service references unknown sku '{sku_id}'"));
        }
    }
    Ok(())
}

fn validate_report_against_catalog(owner: &OwnerInventory, request: &SubmitStockReportRequest) -> Result<()> {
    let valid_service_ids = owner
        .catalog
        .services
        .iter()
        .map(|service| service.service_id.as_str())
        .collect::<HashSet<_>>();
    let valid_sku_ids = owner
        .catalog
        .skus
        .iter()
        .map(|sku| sku.sku_id.as_str())
        .collect::<HashSet<_>>();
    let rankable_sku_ids = owner
        .catalog
        .skus
        .iter()
        .filter(|sku| sku.sold_as_product && sku.product_price.is_some())
        .map(|sku| sku.sku_id.as_str())
        .collect::<HashSet<_>>();

    for signal in &request.service_signals {
        if !valid_service_ids.contains(signal.service_id.as_str()) {
            return Err(anyhow!("serviceSignals references unknown service '{}'", signal.service_id));
        }
    }

    for sku_id in &request.top_retail_ranking {
        if !rankable_sku_ids.contains(sku_id.as_str()) {
            return Err(anyhow!("topRetailRanking references unknown or unrankable sku '{sku_id}'"));
        }
    }

    for service_id in &request.top_service_ranking {
        if !valid_service_ids.contains(service_id.as_str()) {
            return Err(anyhow!("topServiceRanking references unknown service '{service_id}'"));
        }
    }

    for observation in &request.sku_observations {
        if !valid_sku_ids.contains(observation.sku_id.as_str()) {
            return Err(anyhow!("skuObservations references unknown sku '{}'", observation.sku_id));
        }
    }

    Ok(())
}

fn validate_ranking_entries(owner: &OwnerInventory, entries: &[DesktopRankingEntry]) -> Result<()> {
    let valid_service_ids = owner
        .catalog
        .services
        .iter()
        .map(|service| service.service_id.as_str())
        .collect::<HashSet<_>>();
    let valid_ranked_sku_ids = owner
        .catalog
        .skus
        .iter()
        .filter(|sku| sku.sold_as_product && sku.product_price.is_some())
        .map(|sku| sku.sku_id.as_str())
        .collect::<HashSet<_>>();
    let expected_entries = build_default_ranking(&owner.catalog.skus, &owner.catalog.services);
    let expected_keys = expected_entries
        .iter()
        .map(|entry| (entry.entry_type, entry.entry_id.as_str()))
        .collect::<HashSet<_>>();
    let received_keys = entries
        .iter()
        .map(|entry| (entry.entry_type, entry.entry_id.as_str()))
        .collect::<HashSet<_>>();

    for entry in entries {
        match entry.entry_type {
            DesktopRankingEntryType::Service => {
                if !valid_service_ids.contains(entry.entry_id.as_str()) {
                    return Err(anyhow!("ranking references unknown service '{}'", entry.entry_id));
                }
            }
            DesktopRankingEntryType::Sku => {
                if !valid_ranked_sku_ids.contains(entry.entry_id.as_str()) {
                    return Err(anyhow!(
                        "ranking references unknown or unrankable sku '{}'",
                        entry.entry_id
                    ));
                }
            }
        }
    }

    if received_keys != expected_keys {
        return Err(anyhow!("ranking must contain every rankable service and sku exactly once"));
    }

    Ok(())
}

fn normalize_ranking(
    ranking: &[DesktopRankingEntry],
    skus: &[DesktopSkuRecord],
    services: &[DesktopServiceRecord],
) -> Vec<DesktopRankingEntry> {
    let default = build_default_ranking(skus, services);
    if ranking.is_empty() {
        return default;
    }

    let valid = default
        .iter()
        .map(|entry| (entry.entry_type, entry.entry_id.as_str()))
        .collect::<HashSet<_>>();

    let mut retained = ranking
        .iter()
        .filter(|entry| valid.contains(&(entry.entry_type, entry.entry_id.as_str())))
        .cloned()
        .collect::<Vec<_>>();
    retained.sort_by_key(|entry| entry.position);

    let retained_keys = retained
        .iter()
        .map(|entry| (entry.entry_type, entry.entry_id.clone()))
        .collect::<HashSet<_>>();

    for entry in default {
        if !retained_keys.contains(&(entry.entry_type, entry.entry_id.clone())) {
            retained.push(entry);
        }
    }

    for (index, entry) in retained.iter_mut().enumerate() {
        entry.position = index;
    }

    retained
}

fn build_default_ranking(
    skus: &[DesktopSkuRecord],
    services: &[DesktopServiceRecord],
) -> Vec<DesktopRankingEntry> {
    let mut entries = Vec::new();
    for service in services {
        entries.push(DesktopRankingEntry {
            entry_type: DesktopRankingEntryType::Service,
            entry_id: service.service_id.clone(),
            position: entries.len(),
        });
    }
    for sku in skus {
        if sku.sold_as_product && sku.product_price.is_some() {
            entries.push(DesktopRankingEntry {
                entry_type: DesktopRankingEntryType::Sku,
                entry_id: sku.sku_id.clone(),
                position: entries.len(),
            });
        }
    }
    entries
}

fn empty_overview(reason: &str) -> SistOverview {
    SistOverview {
        status: SistAnalysisStatus {
            state: SistAnalysisState::Empty,
            updated_at: None,
            report_count: 0,
            confidence: SistConfidence::Low,
            reason: Some(reason.to_string()),
        },
        settings: SistSettings::default(),
        as_of: None,
        top_regime: None,
        pending_reorder_count: 0,
        high_risk_sku_ids: Vec::new(),
        sku_insights: Vec::new(),
    }
}

fn recompute_analysis(owner_sub: &str, owner: &mut OwnerInventory) {
    let report_count = owner.sist.stock_reports.len();
    if report_count == 0 {
        owner.sist.cached_analysis.overview = empty_overview("No stock reports yet");
        return;
    }

    let particle_count = owner.sist.settings.particle_count.max(64);
    let mut sku_insights = owner
        .catalog
        .skus
        .iter()
        .map(|sku| analyze_sku(owner_sub, sku, owner, particle_count))
        .collect::<Vec<_>>();
    sku_insights.sort_by(|left, right| {
        right
            .stockout_risk
            .partial_cmp(&left.stockout_risk)
            .unwrap_or(Ordering::Equal)
    });

    let mut regime_scores = BTreeMap::<SistRegime, f64>::new();
    for regime in [
        SistRegime::Normal,
        SistRegime::Spike,
        SistRegime::Lull,
        SistRegime::StockoutConstrained,
        SistRegime::Correction,
    ] {
        regime_scores.insert(regime, 0.0);
    }

    for insight in &sku_insights {
        for (regime, probability) in &insight.regime_probabilities {
            if let Some(score) = regime_scores.get_mut(&regime_from_key(regime)) {
                *score += probability;
            }
        }
    }

    let top_regime = regime_scores
        .into_iter()
        .max_by(|left, right| left.1.partial_cmp(&right.1).unwrap_or(Ordering::Equal))
        .map(|(regime, _)| regime);

    let pending_reorder_count = sku_insights
        .iter()
        .filter(|insight| {
            insight.reorder_trigger_probability >= 0.5
                || insight.latest_posterior_units <= insight.reorder_point
        })
        .count();

    let mut high_risk = sku_insights
        .iter()
        .filter(|insight| insight.stockout_risk >= 0.4)
        .map(|insight| (insight.sku_id.clone(), insight.stockout_risk))
        .collect::<Vec<_>>();
    high_risk.sort_by(|left, right| right.1.partial_cmp(&left.1).unwrap_or(Ordering::Equal));

    let updated_at = OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .ok();
    owner.sist.cached_analysis.overview = SistOverview {
        status: SistAnalysisStatus {
            state: SistAnalysisState::Ready,
            updated_at: updated_at.clone(),
            report_count,
            confidence: confidence_for_report_count(report_count),
            reason: None,
        },
        settings: owner.sist.settings.clone(),
        as_of: owner.sist.stock_reports.last().map(|report| report.reported_at.clone()),
        top_regime,
        pending_reorder_count,
        high_risk_sku_ids: high_risk.into_iter().take(3).map(|entry| entry.0).collect(),
        sku_insights,
    };
}

fn analyze_sku(
    owner_sub: &str,
    sku: &DesktopSkuRecord,
    owner: &OwnerInventory,
    particle_count: usize,
) -> SistSkuInsight {
    let reports = owner
        .sist
        .stock_reports
        .iter()
        .filter_map(|report| {
            report
                .sku_observations
                .iter()
                .find(|observation| observation.sku_id == sku.sku_id)
                .map(|observation| (report, observation))
        })
        .collect::<Vec<_>>();
    let confidence = confidence_for_report_count(reports.len());
    let lead_time = infer_lead_time(sku, &reports);
    let demand_hint = demand_hint_for_sku(sku, owner);
    let mut base_demand = demand_hint.max(0.05);
    let latest_units = reports
        .last()
        .map(|(_, observation)| observation.units_in_stock)
        .unwrap_or(sku.units_in_stock);

    let mut historical_daily_draws = Vec::new();
    let mut strong_restock_events = 0_u32;
    let mut stockout_signals = 0_u32;
    let mut correction_signals = 0_u32;
    let mut ranking_boost = 0.0_f64;

    for window in reports.windows(2) {
        let (previous_report, previous) = window[0];
        let (current_report, current) = window[1];
        let previous_at = parse_report_time(&previous_report.reported_at);
        let current_at = parse_report_time(&current_report.reported_at);
        let gap_days = ((current_at - previous_at).whole_seconds().max(86_400) as f64) / 86_400.0;
        let delta = current.units_in_stock - previous.units_in_stock;
        let observed_draw = (previous.units_in_stock - current.units_in_stock).max(0.0) / gap_days;
        if observed_draw.is_finite() && observed_draw > 0.0 {
            historical_daily_draws.push(observed_draw);
        }
        if current.restock_included || delta > current.units_in_stock.max(1.0) * 0.1 {
            strong_restock_events += 1;
        }
        if current.retail_stockout
            || current_report
                .service_signals
                .iter()
                .any(|signal| {
                    signal.stockout
                        && owner
                            .catalog
                            .services
                            .iter()
                            .find(|service| service.service_id == signal.service_id)
                            .map(|service| service.sku_ids.contains(&sku.sku_id))
                            .unwrap_or(false)
                })
        {
            stockout_signals += 1;
        }
        if delta.abs() > previous.units_in_stock.max(10.0) * 0.5 {
            correction_signals += 1;
        }
        ranking_boost += ranking_signal_boost(sku, owner, current_report);
    }

    if !historical_daily_draws.is_empty() {
        base_demand = mean(&historical_daily_draws).max(demand_hint);
    }

    let seed = stable_seed(&(owner_sub, &sku.sku_id, owner.sist.stock_reports.len()));
    let mut rng = StdRng::seed_from_u64(seed);
    let obs_noise = latest_units.max(1.0).sqrt() * 0.12 + 1.0;
    let drift_sigma = match confidence {
        SistConfidence::Low => 0.35,
        SistConfidence::Medium => 0.22,
        SistConfidence::High => 0.15,
    };
    let stockout_factor = 1.0 + (stockout_signals as f64 * 0.12);
    let ranking_factor = 1.0 + ranking_boost.min(0.45);

    let mut posterior_units = Vec::with_capacity(particle_count);
    let mut demand_draws = Vec::with_capacity(particle_count);
    let mut lead_time_draws = Vec::with_capacity(particle_count);
    let mut lead_time_demand_draws = Vec::with_capacity(particle_count);
    let mut stockout_count = 0_usize;
    let mut regime_counts = BTreeMap::from([
        ("normal".to_string(), 0_usize),
        ("spike".to_string(), 0_usize),
        ("lull".to_string(), 0_usize),
        ("stockout_constrained".to_string(), 0_usize),
        ("correction".to_string(), 0_usize),
    ]);

    for _ in 0..particle_count {
        let shock = sample_standard_normal(&mut rng) * drift_sigma;
        let demand_rate = (base_demand * (1.0 + shock)).max(0.02) * stockout_factor * ranking_factor;
        let inventory_noise = sample_standard_normal(&mut rng) * obs_noise;
        let posterior = (latest_units + inventory_noise).max(0.0);
        let lead_draw = (lead_time.mean_days
            + sample_standard_normal(&mut rng) * lead_time.std_days.max(0.5))
            .max(1.0);
        let lead_time_demand =
            (demand_rate * lead_draw * (1.0 + sample_standard_normal(&mut rng) * 0.2)).max(0.0);
        let regime = pick_regime(
            &mut rng,
            stockout_signals,
            strong_restock_events,
            correction_signals,
            ranking_boost,
        );
        *regime_counts.get_mut(regime).expect("regime should exist") += 1;

        if posterior <= lead_time_demand {
            stockout_count += 1;
        }
        posterior_units.push(posterior);
        demand_draws.push(demand_rate);
        lead_time_draws.push(lead_draw);
        lead_time_demand_draws.push(lead_time_demand);
    }

    posterior_units.sort_by(cmp_f64);
    demand_draws.sort_by(cmp_f64);
    lead_time_demand_draws.sort_by(cmp_f64);

    let latest_posterior_units = mean(&posterior_units).max(0.0);
    let expected_demand_per_day = mean(&demand_draws).max(0.01);
    let reorder_point =
        quantile(&lead_time_demand_draws, owner.sist.settings.target_service_level).max(0.0);
    let mean_lead_time_demand = mean(&lead_time_demand_draws).max(0.0);
    let safety_stock = (reorder_point - mean_lead_time_demand).max(0.0);
    let days_of_cover = if expected_demand_per_day > 0.01 {
        Some(latest_posterior_units / expected_demand_per_day)
    } else {
        None
    };
    let reorder_trigger_probability = if latest_posterior_units <= reorder_point {
        0.8
    } else {
        ((reorder_point / latest_posterior_units).min(1.0) * 0.65).max(0.05)
    };

    SistSkuInsight {
        sku_id: sku.sku_id.clone(),
        latest_posterior_units,
        credible_interval_low: quantile(&posterior_units, 0.1),
        credible_interval_high: quantile(&posterior_units, 0.9),
        days_of_cover,
        stockout_risk: stockout_count as f64 / particle_count as f64,
        reorder_point,
        safety_stock,
        reorder_trigger_probability,
        expected_demand_per_day,
        demand_interval_low: quantile(&demand_draws, 0.1),
        demand_interval_high: quantile(&demand_draws, 0.9),
        lead_time,
        regime_probabilities: regime_counts
            .into_iter()
            .map(|(regime, count)| (regime, count as f64 / particle_count as f64))
            .collect(),
        confidence,
    }
}

fn demand_hint_for_sku(sku: &DesktopSkuRecord, owner: &OwnerInventory) -> f64 {
    let linked_services = owner
        .catalog
        .services
        .iter()
        .filter(|service| service.sku_ids.contains(&sku.sku_id))
        .count() as f64;
    let retail_bonus = if sku.sold_as_product { 0.35 } else { 0.0 };
    (linked_services * 0.4 + retail_bonus).max(0.08)
}

fn ranking_signal_boost(
    sku: &DesktopSkuRecord,
    owner: &OwnerInventory,
    report: &StockReportRecord,
) -> f64 {
    let service_boost = report
        .top_service_ranking
        .iter()
        .enumerate()
        .filter_map(|(index, service_id)| {
            owner.catalog.services.iter().find(|service| service.service_id == *service_id).and_then(
                |service| {
                    if service.sku_ids.contains(&sku.sku_id) {
                        Some((3.0 - index as f64).max(0.0) * 0.04)
                    } else {
                        None
                    }
                },
            )
        })
        .sum::<f64>();
    let retail_boost = report
        .top_retail_ranking
        .iter()
        .position(|entry| entry == &sku.sku_id)
        .map(|index| (3.0 - index as f64).max(0.0) * 0.05)
        .unwrap_or(0.0);
    service_boost + retail_boost
}

fn infer_lead_time(
    sku: &DesktopSkuRecord,
    reports: &[(&StockReportRecord, &StockReportSkuObservation)],
) -> LeadTimeSummary {
    if let Some(mean) = sku.lead_time_mean_days {
        return LeadTimeSummary {
            mean_days: mean,
            std_days: sku.lead_time_std_days.unwrap_or(2.0).max(0.5),
            source: "manual".to_string(),
        };
    }

    let mut restock_times = Vec::new();
    for (report, observation) in reports {
        if observation.restock_included {
            restock_times.push(parse_report_time(&report.reported_at));
        }
    }
    if restock_times.len() >= 2 {
        let gaps = restock_times
            .windows(2)
            .map(|pair| ((pair[1] - pair[0]).whole_seconds().unsigned_abs() as f64) / 86_400.0)
            .collect::<Vec<_>>();
        let mean_days = mean(&gaps).max(1.0);
        let variance = mean(
            &gaps
                .iter()
                .map(|value| (value - mean_days).powi(2))
                .collect::<Vec<_>>(),
        )
        .max(0.5);
        return LeadTimeSummary {
            mean_days,
            std_days: variance.sqrt().max(0.75),
            source: "inferred".to_string(),
        };
    }

    LeadTimeSummary {
        mean_days: 7.0,
        std_days: 3.0,
        source: "fallback".to_string(),
    }
}

fn pick_regime<'a>(
    rng: &mut StdRng,
    stockout_signals: u32,
    restock_events: u32,
    correction_signals: u32,
    ranking_boost: f64,
) -> &'a str {
    let roll = rng.gen::<f64>();
    if correction_signals > 0 && roll < 0.18 {
        return "correction";
    }
    if stockout_signals > 0 && roll < 0.42 {
        return "stockout_constrained";
    }
    if ranking_boost > 0.12 && roll < 0.63 {
        return "spike";
    }
    if restock_events == 0 && roll < 0.78 {
        return "lull";
    }
    "normal"
}

fn regime_from_key(key: &str) -> SistRegime {
    match key {
        "spike" => SistRegime::Spike,
        "lull" => SistRegime::Lull,
        "stockout_constrained" => SistRegime::StockoutConstrained,
        "correction" => SistRegime::Correction,
        _ => SistRegime::Normal,
    }
}

fn confidence_for_report_count(report_count: usize) -> SistConfidence {
    if report_count >= 6 {
        SistConfidence::High
    } else if report_count >= 3 {
        SistConfidence::Medium
    } else {
        SistConfidence::Low
    }
}

fn parse_report_time(value: &str) -> OffsetDateTime {
    OffsetDateTime::parse(value, &Rfc3339).unwrap_or_else(|_| OffsetDateTime::UNIX_EPOCH)
}

fn mean(values: &[f64]) -> f64 {
    if values.is_empty() {
        return 0.0;
    }
    values.iter().sum::<f64>() / values.len() as f64
}

fn quantile(values: &[f64], probability: f64) -> f64 {
    if values.is_empty() {
        return 0.0;
    }
    let index = ((values.len() - 1) as f64 * probability.clamp(0.0, 1.0)).round() as usize;
    values[index]
}

fn sample_standard_normal(rng: &mut StdRng) -> f64 {
    let u1 = (1.0 - rng.gen::<f64>()).clamp(1e-12, 1.0);
    let u2 = rng.gen::<f64>();
    (-2.0 * u1.ln()).sqrt() * (std::f64::consts::TAU * u2).cos()
}

fn stable_seed(value: &impl Hash) -> u64 {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    value.hash(&mut hasher);
    hasher.finish()
}

fn cmp_f64(left: &f64, right: &f64) -> Ordering {
    left.partial_cmp(right).unwrap_or(Ordering::Equal)
}

fn store_path() -> PathBuf {
    if let Ok(path) = env::var("BANJI_DESKTOP_DATA_PATH") {
        return PathBuf::from(path);
    }
    env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("build")
        .join("desktop-inventory-store.json")
}

fn with_store_mut<T>(f: impl FnOnce(&mut DesktopInventoryStore) -> Result<T>) -> Result<T> {
    let _guard = STORE_LOCK.lock().expect("desktop inventory lock poisoned");
    let path = store_path();
    let mut store = load_store(&path)?;
    let result = f(&mut store)?;
    store.schema_version = STORE_SCHEMA_VERSION;
    save_store(&path, &store)?;
    Ok(result)
}

fn load_store(path: &Path) -> Result<DesktopInventoryStore> {
    if !path.exists() {
        return Ok(DesktopInventoryStore::default());
    }
    let raw = fs::read_to_string(path)
        .with_context(|| format!("failed to read desktop inventory store at {}", path.display()))?;
    if raw.trim().is_empty() {
        return Ok(DesktopInventoryStore::default());
    }

    let value: serde_json::Value = serde_json::from_str(&raw)
        .with_context(|| format!("failed to parse desktop inventory store at {}", path.display()))?;
    if value.get("schemaVersion").is_some() {
        let mut store: DesktopInventoryStore = serde_json::from_value(value).with_context(|| {
            format!("failed to decode v2 desktop inventory store at {}", path.display())
        })?;
        for owner in store.owners.values_mut() {
            normalize_owner(owner);
        }
        return Ok(store);
    }

    let legacy: LegacyDesktopInventoryStore = serde_json::from_value(value).with_context(|| {
        format!("failed to decode legacy desktop inventory store at {}", path.display())
    })?;
    Ok(migrate_legacy_store(legacy))
}

fn migrate_legacy_store(legacy: LegacyDesktopInventoryStore) -> DesktopInventoryStore {
    let mut owners = HashMap::new();
    for (owner_sub, legacy_owner) in legacy.owners {
        let mut owner = OwnerInventory {
            catalog: CatalogState {
                skus: legacy_owner
                    .skus
                    .into_iter()
                    .map(|mut sku| {
                        if sku.lead_time_mean_days.is_none() {
                            sku.lead_time_mean_days = None;
                        }
                        if sku.lead_time_std_days.is_none() {
                            sku.lead_time_std_days = None;
                        }
                        sku
                    })
                    .collect(),
                services: legacy_owner.services,
            },
            merchandising: MerchandisingState {
                ranking: legacy_owner.ranking,
            },
            sist: OwnerSistState {
                schema_version: SIST_SCHEMA_VERSION,
                settings: SistSettings::default(),
                stock_reports: Vec::new(),
                cached_analysis: CachedSistAnalysis {
                    overview: empty_overview("Migrated from legacy desktop inventory"),
                },
            },
        };
        ensure_baseline_report(&mut owner, "legacy-baseline");
        recompute_analysis(&owner_sub, &mut owner);
        owners.insert(owner_sub, owner);
    }
    DesktopInventoryStore {
        schema_version: STORE_SCHEMA_VERSION,
        owners,
    }
}

fn save_store(path: &Path, store: &DesktopInventoryStore) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("failed to create store directory {}", parent.display()))?;
    }
    let tmp_path = path.with_extension("tmp");
    let contents = serde_json::to_vec_pretty(store)?;
    fs::write(&tmp_path, contents)
        .with_context(|| format!("failed to write temporary store file {}", tmp_path.display()))?;
    fs::rename(&tmp_path, path)
        .with_context(|| format!("failed to replace store file {}", path.display()))?;
    Ok(())
}
