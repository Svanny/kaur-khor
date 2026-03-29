#[path = "analysis.rs"]
mod analysis;

use super::types::{
    ApplyDesktopStockUpdatesRequest, DesktopInventoryResponse, DesktopRankingEntry,
    DesktopRankingEntryType, DesktopServiceRecord, DesktopSkuRecord, LeadTimeSummary,
    MONETARY_AMOUNT_MAX, SaveDesktopRankingRequest, SistAnalysisState, SistAnalysisStatus,
    SistConfidence, SistOverview, SistRegime, SistServiceDetailResponse, SistSettings,
    SistSkuDetailResponse, SistSkuInsight, SistSystemDetailResponse, StockReportRecord,
    StockReportSkuObservation, SubmitStockReportRequest, UpdateSistSettingsRequest,
    UpsertDesktopServiceRequest, UpsertDesktopSkuRequest,
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
use time::{format_description::well_known::Rfc3339, Duration, OffsetDateTime};

static STORE_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));

const STORE_SCHEMA_VERSION: u8 = 2;
const SIST_SCHEMA_VERSION: u8 = 2;
const SEEDED_HISTORY_REPORT_COUNT: usize = 272;
const SEEDED_HISTORY_INTERVAL_DAYS: i64 = 14;
const SEEDED_HISTORY_LATEST_AT: &str = "2026-03-27T09:00:00Z";
const SEEDED_CATALOG_SEED: u64 = 0xBA4A_110C_5EED;
const SEEDED_HISTORY_SEED: u64 = 0xBA4A_110C_7001;
const SEEDED_SERVICE_FLAVORS: [(&str, &str); 10] = [
    (
        "Market Day Outfit Set",
        "An easy front-rack look that pairs bestsellers into a full outfit shoppers can grab in one go.",
    ),
    (
        "After-Hours Satin Edit",
        "A dressier imported pairing for dinner plans, built to feel polished without looking overworked.",
    ),
    (
        "Monsoon Layer Bundle",
        "Lightweight layers chosen for humid afternoons, scooter rides, and sudden rain on the way home.",
    ),
    (
        "Travel Capsule Pairing",
        "Two-and-three piece staples customers pick for weekend flights and tight carry-on space.",
    ),
    (
        "Office to Alley Set",
        "Sharp enough for desk hours, relaxed enough for a late noodle stop after closing.",
    ),
    (
        "Soft Weekend Uniform",
        "Comfort-first separates with enough texture and shape to still feel intentionally styled.",
    ),
    (
        "Night Market Gift Pack",
        "A ready-made bundle popular with returning customers buying a quick present for sisters and cousins.",
    ),
    (
        "Resort Linen Story",
        "Airy imported pieces merchandised together for holiday shoppers chasing a breezy coastal look.",
    ),
    (
        "Denim Refresh Bundle",
        "An updated casual set that lifts core denim with one standout imported accent piece.",
    ),
    (
        "Festival Color Mix",
        "A playful, high-margin combination built around bright fabric and easy try-on appeal.",
    ),
];

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
    #[serde(default)]
    sku_details: BTreeMap<String, SistSkuDetailResponse>,
    #[serde(default)]
    service_details: BTreeMap<String, SistServiceDetailResponse>,
    #[serde(default = "empty_system_detail")]
    system_detail: SistSystemDetailResponse,
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
        let mut skus = build_seeded_skus();
        let mut services = build_seeded_services(&skus);
        let stock_reports = build_seeded_stock_reports(&skus, &services);
        sync_catalog_with_latest_history(&mut skus, &mut services, &stock_reports);
        let ranking = build_default_ranking(&skus, &services);
        let mut owner = Self {
            catalog: CatalogState { skus, services },
            merchandising: MerchandisingState { ranking },
            sist: OwnerSistState {
                schema_version: SIST_SCHEMA_VERSION,
                settings: SistSettings::default(),
                stock_reports,
                cached_analysis: CachedSistAnalysis {
                    overview: empty_overview("seed data initialized"),
                    sku_details: BTreeMap::new(),
                    service_details: BTreeMap::new(),
                    system_detail: empty_system_detail(),
                },
            },
        };
        recompute_analysis("seed", &mut owner);
        owner
    }
}

fn build_seeded_skus() -> Vec<DesktopSkuRecord> {
    let definitions = [
        (
            "sku-001",
            "Bangkok Market Tee",
            "Soft imported cotton tee from a Bangkok overrun lot; easy to sell with denim, skirts, and sandals.",
            248.0,
            5.10,
            true,
            Some(12.0),
            Some(5.0),
            Some(1.5),
        ),
        (
            "sku-002",
            "Osaka Pleat Midi",
            "Japanese-inspired pleated midi skirt with a forgiving waist and steady repeat demand from office shoppers.",
            168.0,
            4.35,
            false,
            None,
            Some(7.0),
            Some(2.0),
        ),
        (
            "sku-003",
            "Seoul Cafe Cardigan",
            "Light knit cardigan bought as an easy add-on when weather shifts or air-con is too cold.",
            118.0,
            7.90,
            true,
            Some(18.0),
            None,
            None,
        ),
        (
            "sku-004",
            "Hanoi Ribbon Blouse",
            "A drapey blouse with tie-neck detail that the shop keeps in reserve for dressier customer requests.",
            142.0,
            6.75,
            false,
            None,
            None,
            None,
        ),
        (
            "sku-005",
            "Busan Stripe Socks",
            "Colorful imported ankle socks stacked near checkout for quick add-on sales and gift bundles.",
            96.0,
            3.40,
            true,
            Some(9.0),
            Some(4.0),
            Some(1.0),
        ),
        (
            "sku-006",
            "Kyoto Linen Trousers",
            "Relaxed linen trousers with clean tailoring, often used as the anchor piece in higher-ticket outfit sets.",
            132.0,
            8.25,
            false,
            None,
            Some(11.0),
            Some(3.0),
        ),
        (
            "sku-007",
            "Taipei Sunset Dress",
            "Printed day dress that flies during payday weekends and slows the minute the promo table comes down.",
            110.0,
            6.10,
            true,
            Some(15.0),
            None,
            None,
        ),
        (
            "sku-008",
            "Incheon Cropped Jacket",
            "A structured cropped jacket with slower inbound replenishment and strong appeal for layered looks.",
            88.0,
            9.80,
            false,
            None,
            Some(14.0),
            Some(4.5),
        ),
        (
            "sku-009",
            "Milan Satin Cami",
            "Glossy satin camisole that repeat buyers grab in multiple colors once they trust the fit.",
            156.0,
            5.95,
            true,
            Some(13.5),
            Some(6.0),
            Some(1.8),
        ),
        (
            "sku-010",
            "Phnom Penh Denim Short",
            "A dependable warm-weather short kept deep in back stock to steady the floor when other fits run thin.",
            174.0,
            7.15,
            false,
            None,
            None,
            None,
        ),
    ];

    definitions
        .into_iter()
        .map(
            |(
                sku_id,
                name,
                description,
                units_in_stock,
                cost_per_unit,
                sold_as_product,
                product_price,
                lead_time_mean_days,
                lead_time_std_days,
            )| DesktopSkuRecord {
                sku_id: sku_id.to_string(),
                name: name.to_string(),
                description: description.to_string(),
                units_in_stock,
                cost_per_unit,
                sold_as_product,
                product_price,
                lead_time_mean_days,
                lead_time_std_days,
            },
        )
        .collect()
}

fn build_seeded_services(skus: &[DesktopSkuRecord]) -> Vec<DesktopServiceRecord> {
    let mut rng = StdRng::seed_from_u64(SEEDED_CATALOG_SEED);
    let sku_ids = skus.iter().map(|sku| sku.sku_id.clone()).collect::<Vec<_>>();
    let mut services = Vec::with_capacity(10);

    for (index, (name, description)) in SEEDED_SERVICE_FLAVORS.iter().enumerate() {
        let mut linked_skus = Vec::new();
        let target_links = 2 + rng.gen_range(0..3);
        while linked_skus.len() < target_links {
            let candidate = sku_ids[rng.gen_range(0..sku_ids.len())].clone();
            if !linked_skus.contains(&candidate) {
                linked_skus.push(candidate);
            }
        }
        linked_skus.sort();

        let service_number = index + 1;
        services.push(DesktopServiceRecord {
            service_id: format!("service-{service_number:03}"),
            name: (*name).to_string(),
            description: (*description).to_string(),
            price: 900.0 + service_number as f64 * 135.0 + rng.gen_range(0.0..140.0),
            sku_ids: linked_skus,
        });
    }

    for (index, sku_id) in sku_ids.iter().enumerate() {
        if services
            .iter()
            .any(|service| service.sku_ids.iter().any(|linked| linked == sku_id))
        {
            continue;
        }
        let service_count = services.len();
        let service = &mut services[index % service_count];
        service.sku_ids.push(sku_id.clone());
        service.sku_ids.sort();
        service.sku_ids.dedup();
    }

    services
}

fn build_seeded_stock_reports(
    skus: &[DesktopSkuRecord],
    services: &[DesktopServiceRecord],
) -> Vec<StockReportRecord> {
    let mut rng = StdRng::seed_from_u64(SEEDED_HISTORY_SEED);
    let latest_at = OffsetDateTime::parse(SEEDED_HISTORY_LATEST_AT, &Rfc3339)
        .expect("seeded history timestamp should parse");
    let start_at = latest_at
        - Duration::days(SEEDED_HISTORY_INTERVAL_DAYS * (SEEDED_HISTORY_REPORT_COUNT as i64 - 1));
    let mut report_time = start_at;
    let mut sku_units = skus.iter().map(|sku| sku.units_in_stock).collect::<Vec<_>>();
    let mut sku_costs = skus.iter().map(|sku| sku.cost_per_unit).collect::<Vec<_>>();
    let mut service_prices = services.iter().map(|service| service.price).collect::<Vec<_>>();
    let retail_sku_ids = skus
        .iter()
        .filter(|sku| sku.sold_as_product && sku.product_price.is_some())
        .map(|sku| sku.sku_id.clone())
        .collect::<Vec<_>>();
    let mut reports = Vec::with_capacity(SEEDED_HISTORY_REPORT_COUNT);

    for report_index in 0..SEEDED_HISTORY_REPORT_COUNT {
        let mut sku_observations = Vec::with_capacity(skus.len());
        let mut retail_stockout_flags = vec![false; skus.len()];
        let mut service_price_adjustments = Vec::new();

        for (sku_index, sku) in skus.iter().enumerate() {
            let periodic_draw =
                10.0 + (sku_index % 4) as f64 * 3.0 + ((report_index + sku_index) % 5) as f64;
            let seasonal_draw = if (report_index + sku_index * 2) % 13 == 0 {
                9.0
            } else if (report_index + sku_index) % 9 == 0 {
                -4.0
            } else {
                0.0
            };
            let draw = (periodic_draw + seasonal_draw).max(2.0);
            let low_stock_threshold = 18.0 + sku_index as f64 * 1.8;
            let restock_included =
                sku_units[sku_index] <= low_stock_threshold || (report_index + sku_index * 3) % 17 == 0;
            let restock_units = if restock_included {
                36.0 + sku_index as f64 * 5.0 + rng.gen_range(0.0..22.0)
            } else {
                0.0
            };
            let next_units = (sku_units[sku_index] + restock_units - draw).max(0.0);
            let cost_drift = ((report_index + sku_index * 5) % 7) as f64 * 0.03;
            let next_cost = (sku_costs[sku_index] * (1.0 + cost_drift / 10.0)
                + if restock_included {
                    rng.gen_range(0.02..0.18)
                } else {
                    0.0
                })
            .min(MONETARY_AMOUNT_MAX / 100.0);
            let retail_stockout = sku.sold_as_product && next_units <= 10.0 + sku_index as f64;

            retail_stockout_flags[sku_index] = retail_stockout;
            sku_units[sku_index] = next_units;
            sku_costs[sku_index] = next_cost;
            sku_observations.push(StockReportSkuObservation {
                sku_id: sku.sku_id.clone(),
                units_in_stock: next_units,
                cost_per_unit: next_cost,
                restock_included,
                retail_stockout,
                notes: if restock_included {
                    Some("Scheduled replenishment landed before close.".to_string())
                } else if retail_stockout {
                    Some("Retail shelf pressure observed.".to_string())
                } else {
                    None
                },
            });
        }

        if report_index % 9 == 0 {
            let service_index = (report_index / 9) % services.len();
            service_prices[service_index] =
                (service_prices[service_index] + rng.gen_range(15.0..85.0)).min(MONETARY_AMOUNT_MAX / 10.0);
            service_price_adjustments.push(super::types::StockReportServicePriceAdjustment {
                service_id: services[service_index].service_id.clone(),
                price: service_prices[service_index],
            });
        }

        let service_signals = services
            .iter()
            .filter_map(|service| {
                let linked_low = service.sku_ids.iter().any(|sku_id| {
                    skus.iter().position(|sku| &sku.sku_id == sku_id).map_or(false, |position| {
                        retail_stockout_flags[position] || sku_units[position] <= 12.0
                    })
                });
                if linked_low || (report_index + service.sku_ids.len()) % 23 == 0 {
                    Some(super::types::StockReportServiceSignal {
                        service_id: service.service_id.clone(),
                        stockout: linked_low,
                    })
                } else {
                    None
                }
            })
            .collect::<Vec<_>>();

        let top_service_ranking = if report_index % 4 == 0 {
            ranked_service_ids_for_report(report_index, services)
        } else {
            Vec::new()
        };
        let top_retail_ranking = if report_index % 3 == 0 {
            ranked_retail_sku_ids_for_report(report_index, &retail_sku_ids)
        } else {
            Vec::new()
        };

        reports.push(StockReportRecord {
            report_id: format!("report-{:04}", report_index + 1),
            report_source: if report_index == 0 {
                "legacy-baseline".to_string()
            } else {
                "manual".to_string()
            },
            reported_at: report_time
                .format(&Rfc3339)
                .expect("seeded history timestamp should format"),
            sku_observations,
            service_signals,
            service_price_adjustments,
            top_service_ranking,
            top_retail_ranking,
            notes: if report_index % 12 == 0 {
                Some("Synthetic biweekly operating snapshot.".to_string())
            } else {
                None
            },
        });

        report_time += Duration::days(SEEDED_HISTORY_INTERVAL_DAYS);
    }

    reports
}

fn ranked_service_ids_for_report(
    report_index: usize,
    services: &[DesktopServiceRecord],
) -> Vec<String> {
    let service_count = services.len().min(3);
    (0..service_count)
        .map(|offset| services[(report_index + offset) % services.len()].service_id.clone())
        .collect()
}

fn ranked_retail_sku_ids_for_report(report_index: usize, retail_sku_ids: &[String]) -> Vec<String> {
    let retail_count = retail_sku_ids.len().min(3);
    (0..retail_count)
        .map(|offset| retail_sku_ids[(report_index + offset) % retail_sku_ids.len()].clone())
        .collect()
}

fn sync_catalog_with_latest_history(
    skus: &mut [DesktopSkuRecord],
    services: &mut [DesktopServiceRecord],
    reports: &[StockReportRecord],
) {
    for report in reports {
        for observation in &report.sku_observations {
            if let Some(sku) = skus.iter_mut().find(|sku| sku.sku_id == observation.sku_id) {
                sku.units_in_stock = observation.units_in_stock;
                sku.cost_per_unit = observation.cost_per_unit;
            }
        }
        for adjustment in &report.service_price_adjustments {
            if let Some(service) = services
                .iter_mut()
                .find(|service| service.service_id == adjustment.service_id)
            {
                service.price = adjustment.price;
            }
        }
    }
}

pub fn load_inventory(owner_sub: &str) -> Result<DesktopInventoryResponse> {
    with_store_mut(|store| {
        let owner = ensure_owner(store, owner_sub);
        normalize_owner(owner);
        Ok(snapshot_from_owner(owner))
    })
}

pub fn list_stock_reports(owner_sub: &str) -> Result<Vec<StockReportRecord>> {
    with_store_mut(|store| {
        let owner = ensure_owner(store, owner_sub);
        normalize_owner(owner);
        let mut reports = owner.sist.stock_reports.clone();
        reports.sort_by(|left, right| right.reported_at.cmp(&left.reported_at));
        Ok(reports)
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
        service_price_adjustments: Vec::new(),
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
            service_price_adjustments: request.service_price_adjustments,
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

        for adjustment in &record.service_price_adjustments {
            let should_apply_price = !has_later_service_price_adjustment(
                owner,
                &adjustment.service_id,
                &record.reported_at,
            );
            if should_apply_price {
                if let Some(service) = owner
                    .catalog
                    .services
                    .iter_mut()
                    .find(|service| service.service_id == adjustment.service_id)
                {
                    service.price = adjustment.price;
                }
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
        owner
            .sist
            .cached_analysis
            .sku_details
            .get(sku_id)
            .cloned()
            .ok_or_else(|| anyhow!("sist insight not found"))
    })
}

pub fn load_service_detail(owner_sub: &str, service_id: &str) -> Result<SistServiceDetailResponse> {
    with_store_mut(|store| {
        let owner = ensure_owner(store, owner_sub);
        normalize_owner(owner);
        owner
            .sist
            .cached_analysis
            .service_details
            .get(service_id)
            .cloned()
            .ok_or_else(|| anyhow!("sist service detail not found"))
    })
}

pub fn load_system_detail(owner_sub: &str) -> Result<SistSystemDetailResponse> {
    with_store_mut(|store| {
        let owner = ensure_owner(store, owner_sub);
        normalize_owner(owner);
        Ok(owner.sist.cached_analysis.system_detail.clone())
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
    if !sist_cache_is_valid(owner) {
        owner.sist.schema_version = SIST_SCHEMA_VERSION;
        recompute_analysis("normalize", owner);
    }
}

fn sist_cache_is_valid(owner: &OwnerInventory) -> bool {
    if owner.sist.schema_version != SIST_SCHEMA_VERSION {
        return false;
    }
    if owner.sist.cached_analysis.overview.status.state == SistAnalysisState::Empty {
        return false;
    }

    let expected_sku_ids = owner
        .catalog
        .skus
        .iter()
        .map(|sku| sku.sku_id.as_str())
        .collect::<HashSet<_>>();
    if owner.sist.cached_analysis.sku_details.len() != expected_sku_ids.len() {
        return false;
    }
    if owner
        .sist
        .cached_analysis
        .sku_details
        .keys()
        .any(|sku_id| !expected_sku_ids.contains(sku_id.as_str()))
    {
        return false;
    }

    let expected_service_ids = owner
        .catalog
        .services
        .iter()
        .map(|service| service.service_id.as_str())
        .collect::<HashSet<_>>();
    if owner.sist.cached_analysis.service_details.len() != expected_service_ids.len() {
        return false;
    }
    if owner
        .sist
        .cached_analysis
        .service_details
        .keys()
        .any(|service_id| !expected_service_ids.contains(service_id.as_str()))
    {
        return false;
    }

    if system_detail_is_placeholder(&owner.sist.cached_analysis.system_detail)
        && !owner.sist.stock_reports.is_empty()
    {
        return false;
    }

    true
}

fn system_detail_is_placeholder(detail: &SistSystemDetailResponse) -> bool {
    detail.interval_timeline.is_empty()
        && detail.regime_posterior_history.is_empty()
        && detail.top_risky_entities.is_empty()
        && detail.metadata.is_none()
}

fn ensure_baseline_report(owner: &mut OwnerInventory, source: &str) {
    if !owner.sist.stock_reports.is_empty() {
        return;
    }
    owner.sist.stock_reports.push(StockReportRecord {
        report_id: "report-0001".to_string(),
        report_source: source.to_string(),
        // Keep the synthetic migration baseline older than operator-entered reports so
        // history ordering and detail drill-downs stay deterministic.
        reported_at: "2000-01-01T00:00:00Z".to_string(),
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
        service_price_adjustments: Vec::new(),
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

    for adjustment in &request.service_price_adjustments {
        if !valid_service_ids.contains(adjustment.service_id.as_str()) {
            return Err(anyhow!(
                "servicePriceAdjustments references unknown service '{}'",
                adjustment.service_id
            ));
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

fn has_later_service_price_adjustment(
    owner: &OwnerInventory,
    service_id: &str,
    reported_at: &str,
) -> bool {
    let reported_at = parse_report_time(reported_at);
    owner.sist.stock_reports.iter().any(|report| {
        parse_report_time(&report.reported_at) > reported_at
            && report
                .service_price_adjustments
                .iter()
                .any(|adjustment| adjustment.service_id == service_id)
    })
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
        metadata: None,
    }
}

fn empty_system_detail() -> SistSystemDetailResponse {
    SistSystemDetailResponse {
        interval_timeline: Vec::new(),
        regime_posterior_history: Vec::new(),
        signal_intake: super::types::SistSignalIntakeSummary {
            ranking_observations: 0,
            restock_flags: 0,
            stockout_flags: 0,
            price_adjustments: 0,
            correction_signals: 0,
        },
        model_health: super::types::SistModelHealthSummary {
            particle_count_used: 0,
            interval_count: 0,
            effective_sample_size_mean: 0.0,
            confidence: SistConfidence::Low,
        },
        top_risky_entities: Vec::new(),
        drift_diagnostics: super::types::SistDriftDiagnostics {
            seasonality_active: false,
            change_point_active: false,
            recent_change_point_probability: 0.0,
            service_drift_scale: 0.0,
            retail_drift_scale: 0.0,
        },
        metadata: None,
    }
}

fn recompute_analysis(owner_sub: &str, owner: &mut OwnerInventory) {
    let report_count = owner.sist.stock_reports.len();
    if report_count == 0 {
        owner.sist.cached_analysis.overview = empty_overview("No stock reports yet");
        owner.sist.cached_analysis.sku_details.clear();
        owner.sist.cached_analysis.service_details.clear();
        owner.sist.cached_analysis.system_detail = empty_system_detail();
        return;
    }
    let computed = analysis::compute_sist_analysis(owner_sub, owner);
    owner.sist.cached_analysis.overview = computed.overview;
    owner.sist.cached_analysis.sku_details = computed.sku_details;
    owner.sist.cached_analysis.service_details = computed.service_details;
    owner.sist.cached_analysis.system_detail = computed.system_detail;
}

#[allow(dead_code)]
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

#[allow(dead_code)]
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

#[allow(dead_code)]
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

#[allow(dead_code)]
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
                    sku_details: BTreeMap::new(),
                    service_details: BTreeMap::new(),
                    system_detail: empty_system_detail(),
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
