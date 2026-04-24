use crate::benchmark;
use anyhow::Result;
use banji_sena_core::{
    classify_relative_width, derive_relative_width, execute_analysis_run,
    execute_analysis_run_with_parameters, trigger_analysis_run, SenaAdjustmentSignal,
    SenaAnalysisRunRecord, SenaBundle, SenaCatalog, SenaCreateOrderBatchPayload, SenaDiagnostics,
    SenaEngineParameters, SenaLeadTimeHint, SenaObservationFingerprint, SenaObservationInput,
    SenaObservationPage, SenaObservationPageRequest, SenaObservationRecord,
    SenaObservationRegimeHint, SenaOrderBatchRecord, SenaOrderLookupPayload, SenaOrderSignal,
    SenaRecipeUsageHint, SenaRecordUpdateContext, SenaRepository, SenaRetailPriceObservation,
    SenaService, SenaServiceDetail, SenaServicePriceObservation, SenaServiceSkuMaskEntry, SenaSku,
    SenaSkuDetail, SenaSplitOrderChildPayload, SenaStockSnapshot, SenaUpdateOrderBatchPayload,
    SenaUpdateOrderChildPayload, SenaWorkspaceSummary, SqliteSenaRepository,
};
use futures::executor::block_on;
use rand::{rngs::StdRng, Rng, SeedableRng};
use serde::Serialize;
use serde_json::json;
use std::{env, fs, path::PathBuf};
use std::time::Instant;
use time::{Date, Duration, Month, PrimitiveDateTime, Time};

const DEFAULT_OWNER_SUB: &str = "desktop-owner";
const DEV_SEED_VERSION: &str = "cambodian-clothing-v5";
const DEV_SEED_OBSERVATION_COUNT: usize = 30;
const LEGACY_DEV_SEED_NOTE: &str = "Seeded dev observation";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SenaSkuDetailPage {
    pub detail: SenaSkuDetail,
    pub page_limit: usize,
    pub has_older: bool,
    pub next_before_interval_index: Option<usize>,
    pub latest_interval_index: Option<usize>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SenaServiceDetailPage {
    pub detail: SenaServiceDetail,
    pub page_limit: usize,
    pub has_older: bool,
    pub next_before_interval_index: Option<usize>,
    pub latest_interval_index: Option<usize>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SenaStartupWorkspace {
    pub catalog: Option<SenaCatalog>,
    pub workspace_summary: Option<SenaWorkspaceSummary>,
    pub latest_run: Option<SenaAnalysisRunRecord>,
    pub observation_fingerprint: SenaObservationFingerprint,
}

fn bounded_page_limit(limit: usize) -> usize {
    limit.clamp(1, 20)
}

fn page_bounds(
    interval_indices: &[usize],
    before_interval_index: Option<usize>,
    limit: usize,
) -> Option<(usize, usize, bool, Option<usize>, Option<usize>)> {
    if interval_indices.is_empty() {
        return None;
    }
    let latest_interval_index = interval_indices.last().copied();
    let upper_exclusive = before_interval_index
        .and_then(|value| interval_indices.iter().position(|index| *index >= value))
        .unwrap_or(interval_indices.len());
    if upper_exclusive == 0 {
        return Some((0, 0, false, None, latest_interval_index));
    }
    let start = upper_exclusive.saturating_sub(limit);
    let has_older = start > 0;
    let next_before_interval_index = has_older.then(|| interval_indices[start]);
    Some((
        start,
        upper_exclusive,
        has_older,
        next_before_interval_index,
        latest_interval_index,
    ))
}

fn page_sku_detail(
    detail: SenaSkuDetail,
    before_interval_index: Option<usize>,
    limit: usize,
) -> SenaSkuDetailPage {
    let limit = bounded_page_limit(limit);
    let interval_indices: Vec<usize> = detail
        .demand_posterior
        .iter()
        .map(|interval| interval.interval_index)
        .collect();
    let Some((start, end, has_older, next_before_interval_index, latest_interval_index)) =
        page_bounds(&interval_indices, before_interval_index, limit)
    else {
        return SenaSkuDetailPage {
            detail,
            page_limit: limit,
            has_older: false,
            next_before_interval_index: None,
            latest_interval_index: None,
        };
    };

    SenaSkuDetailPage {
        detail: SenaSkuDetail {
            summary: detail.summary,
            inventory_posterior: detail.inventory_posterior
                [start..end.min(detail.inventory_posterior.len())]
                .to_vec(),
            demand_posterior: detail.demand_posterior[start..end].to_vec(),
            pipeline_posterior: detail.pipeline_posterior
                [start..end.min(detail.pipeline_posterior.len())]
                .to_vec(),
            lead_time_posterior: detail.lead_time_posterior
                [start..end.min(detail.lead_time_posterior.len())]
                .to_vec(),
        },
        page_limit: limit,
        has_older,
        next_before_interval_index,
        latest_interval_index,
    }
}

fn page_service_detail(
    detail: SenaServiceDetail,
    before_interval_index: Option<usize>,
    limit: usize,
) -> SenaServiceDetailPage {
    let limit = bounded_page_limit(limit);
    let interval_indices: Vec<usize> = detail
        .regime_timeline
        .iter()
        .map(|interval| interval.interval_index)
        .collect();
    let Some((start, end, has_older, next_before_interval_index, latest_interval_index)) =
        page_bounds(&interval_indices, before_interval_index, limit)
    else {
        return SenaServiceDetailPage {
            detail,
            page_limit: limit,
            has_older: false,
            next_before_interval_index: None,
            latest_interval_index: None,
        };
    };

    SenaServiceDetailPage {
        detail: SenaServiceDetail {
            service_id: detail.service_id,
            activity_mean: detail.activity_mean,
            activity_interval_low: detail.activity_interval_low,
            activity_interval_high: detail.activity_interval_high,
            bottleneck_probability: detail.bottleneck_probability,
            contributors: detail.contributors,
            regime_timeline: detail.regime_timeline[start..end].to_vec(),
        },
        page_limit: limit,
        has_older,
        next_before_interval_index,
        latest_interval_index,
    }
}

fn db_path() -> PathBuf {
    env::var_os("BANJI_DESKTOP_DATA_PATH")
        .map(PathBuf::from)
        .unwrap_or_else(|| env::temp_dir().join("banji-sena.sqlite3"))
}

fn repository() -> Result<SqliteSenaRepository> {
    SqliteSenaRepository::open(db_path())
}

fn dev_seed_marker_path() -> PathBuf {
    db_path()
        .parent()
        .unwrap_or_else(|| std::path::Path::new("."))
        .join("desktop-sena-dev-seed.txt")
}

pub fn default_owner() -> &'static str {
    DEFAULT_OWNER_SUB
}

#[derive(Clone, Copy)]
struct SeedSkuProfile {
    sku_id: &'static str,
    name: &'static str,
    description: &'static str,
    supplier_name: Option<&'static str>,
    cost_per_unit: f64,
    sold_as_product: bool,
    product_price: Option<f64>,
    lead_time_mean_days_hint: f64,
    lead_time_std_days_hint: f64,
    opening_units: f64,
    reorder_target_units: f64,
    reorder_batch_units: f64,
    base_daily_demand: f64,
}

#[derive(Clone, Copy)]
struct SeedServiceProfile {
    service_id: &'static str,
    name: &'static str,
    description: &'static str,
    price: f64,
    bundle: bool,
    mask: &'static [(&'static str, f64)],
}

const SEED_SKUS: [SeedSkuProfile; 10] = [
    SeedSkuProfile {
        sku_id: "sku-001",
        name: "Krama Cotton Scarf",
        description: "Hand-loomed krama scarf in deep indigo stripes.",
        supplier_name: Some("Mekong Looms"),
        cost_per_unit: 3.2,
        sold_as_product: true,
        product_price: Some(9.5),
        lead_time_mean_days_hint: 4.0,
        lead_time_std_days_hint: 1.0,
        opening_units: 74.0,
        reorder_target_units: 34.0,
        reorder_batch_units: 52.0,
        base_daily_demand: 1.6,
    },
    SeedSkuProfile {
        sku_id: "sku-002",
        name: "Silk Sampot Skirt",
        description: "Dress sampot woven for wedding and festival season.",
        supplier_name: Some("Phnom Silk Collective"),
        cost_per_unit: 12.8,
        sold_as_product: true,
        product_price: Some(29.0),
        lead_time_mean_days_hint: 9.0,
        lead_time_std_days_hint: 2.5,
        opening_units: 42.0,
        reorder_target_units: 20.0,
        reorder_batch_units: 24.0,
        base_daily_demand: 0.52,
    },
    SeedSkuProfile {
        sku_id: "sku-003",
        name: "Linen Sarong Pants",
        description: "Relaxed-fit pants popular with tourists and local creatives.",
        supplier_name: Some("Tonle Linen Works"),
        cost_per_unit: 8.4,
        sold_as_product: true,
        product_price: Some(21.0),
        lead_time_mean_days_hint: 7.0,
        lead_time_std_days_hint: 1.8,
        opening_units: 58.0,
        reorder_target_units: 26.0,
        reorder_batch_units: 38.0,
        base_daily_demand: 0.9,
    },
    SeedSkuProfile {
        sku_id: "sku-004",
        name: "Temple White Blouse",
        description: "Lightweight blouse for ceremonies and office wear.",
        supplier_name: Some("Mekong Looms"),
        cost_per_unit: 6.2,
        sold_as_product: true,
        product_price: Some(16.0),
        lead_time_mean_days_hint: 6.0,
        lead_time_std_days_hint: 1.4,
        opening_units: 64.0,
        reorder_target_units: 28.0,
        reorder_batch_units: 42.0,
        base_daily_demand: 1.1,
    },
    SeedSkuProfile {
        sku_id: "sku-005",
        name: "Indigo Farmer Shirt",
        description: "Boxy overshirt dyed in traditional indigo.",
        supplier_name: Some("Tonle Linen Works"),
        cost_per_unit: 7.8,
        sold_as_product: true,
        product_price: Some(18.5),
        lead_time_mean_days_hint: 7.0,
        lead_time_std_days_hint: 1.9,
        opening_units: 55.0,
        reorder_target_units: 24.0,
        reorder_batch_units: 36.0,
        base_daily_demand: 0.88,
    },
    SeedSkuProfile {
        sku_id: "sku-006",
        name: "Rattan Market Tote",
        description: "Structured tote sold heavily during holiday gifting windows.",
        supplier_name: Some("Siem Reap Rattan"),
        cost_per_unit: 5.1,
        sold_as_product: true,
        product_price: Some(14.0),
        lead_time_mean_days_hint: 5.0,
        lead_time_std_days_hint: 1.2,
        opening_units: 70.0,
        reorder_target_units: 32.0,
        reorder_batch_units: 44.0,
        base_daily_demand: 1.3,
    },
    SeedSkuProfile {
        sku_id: "sku-007",
        name: "Festival Silk Shawl",
        description: "Higher-ticket shawl with strong Khmer New Year and wedding demand.",
        supplier_name: Some("Phnom Silk Collective"),
        cost_per_unit: 10.6,
        sold_as_product: true,
        product_price: Some(25.0),
        lead_time_mean_days_hint: 8.0,
        lead_time_std_days_hint: 2.3,
        opening_units: 36.0,
        reorder_target_units: 16.0,
        reorder_batch_units: 20.0,
        base_daily_demand: 0.42,
    },
    SeedSkuProfile {
        sku_id: "sku-008",
        name: "Children's Krama Set",
        description: "Small-size scarf set merchandised near checkout.",
        supplier_name: Some("Mekong Looms"),
        cost_per_unit: 2.7,
        sold_as_product: true,
        product_price: Some(8.0),
        lead_time_mean_days_hint: 4.0,
        lead_time_std_days_hint: 0.8,
        opening_units: 82.0,
        reorder_target_units: 38.0,
        reorder_batch_units: 56.0,
        base_daily_demand: 1.7,
    },
    SeedSkuProfile {
        sku_id: "sku-009",
        name: "Handwoven Belt",
        description: "Accessory used in bundles and upsell styling services.",
        supplier_name: None,
        cost_per_unit: 2.1,
        sold_as_product: true,
        product_price: Some(7.0),
        lead_time_mean_days_hint: 3.0,
        lead_time_std_days_hint: 0.7,
        opening_units: 90.0,
        reorder_target_units: 40.0,
        reorder_batch_units: 60.0,
        base_daily_demand: 1.0,
    },
    SeedSkuProfile {
        sku_id: "sku-010",
        name: "Premium Wedding Sampot",
        description: "Special-order ceremonial sampot kept in smaller volumes.",
        supplier_name: Some("Phnom Silk Collective"),
        cost_per_unit: 22.0,
        sold_as_product: true,
        product_price: Some(54.0),
        lead_time_mean_days_hint: 12.0,
        lead_time_std_days_hint: 3.0,
        opening_units: 18.0,
        reorder_target_units: 8.0,
        reorder_batch_units: 10.0,
        base_daily_demand: 0.18,
    },
];

const SERVICE_001_MASK: [(&str, f64); 2] = [("sku-004", 0.75), ("sku-009", 0.35)];
const SERVICE_002_MASK: [(&str, f64); 2] = [("sku-001", 0.85), ("sku-008", 0.45)];
const SERVICE_003_MASK: [(&str, f64); 2] = [("sku-003", 0.8), ("sku-005", 0.6)];
const SERVICE_004_MASK: [(&str, f64); 2] = [("sku-002", 0.85), ("sku-007", 0.4)];
const SERVICE_005_MASK: [(&str, f64); 2] = [("sku-006", 0.9), ("sku-009", 0.2)];
const SERVICE_006_MASK: [(&str, f64); 3] = [("sku-001", 0.5), ("sku-004", 0.7), ("sku-009", 0.3)];
const SERVICE_007_MASK: [(&str, f64); 2] = [("sku-002", 0.95), ("sku-010", 0.65)];
const SERVICE_008_MASK: [(&str, f64); 2] = [("sku-006", 0.6), ("sku-008", 0.55)];
const SERVICE_009_MASK: [(&str, f64); 3] = [("sku-001", 0.45), ("sku-003", 0.5), ("sku-006", 0.4)];
const SERVICE_010_MASK: [(&str, f64); 3] = [("sku-002", 0.7), ("sku-007", 0.65), ("sku-010", 0.55)];

const SEED_SERVICES: [SeedServiceProfile; 10] = [
    SeedServiceProfile {
        service_id: "service-001",
        name: "Office Blouse Styling",
        description: "Daily styling package centered on ceremony-safe blouses.",
        price: 19.0,
        bundle: false,
        mask: &SERVICE_001_MASK,
    },
    SeedServiceProfile {
        service_id: "service-002",
        name: "Tourist Gift Pairing",
        description: "Gift pairing for visitors buying lightweight textiles.",
        price: 15.0,
        bundle: false,
        mask: &SERVICE_002_MASK,
    },
    SeedServiceProfile {
        service_id: "service-003",
        name: "Weekend Linen Look",
        description: "Relaxed weekend outfit with linen staples.",
        price: 28.0,
        bundle: true,
        mask: &SERVICE_003_MASK,
    },
    SeedServiceProfile {
        service_id: "service-004",
        name: "Wedding Guest Edit",
        description: "Festival-ready styling for wedding guest traffic.",
        price: 36.0,
        bundle: true,
        mask: &SERVICE_004_MASK,
    },
    SeedServiceProfile {
        service_id: "service-005",
        name: "Market Tote Add-On",
        description: "Impulse tote styling placed near checkout.",
        price: 13.0,
        bundle: false,
        mask: &SERVICE_005_MASK,
    },
    SeedServiceProfile {
        service_id: "service-006",
        name: "Khmer New Year Capsule",
        description: "Seasonal capsule promoted around Khmer New Year.",
        price: 31.0,
        bundle: true,
        mask: &SERVICE_006_MASK,
    },
    SeedServiceProfile {
        service_id: "service-007",
        name: "Wedding Premium Bundle",
        description: "High-ticket ceremony bundle with premium sampot mix.",
        price: 74.0,
        bundle: true,
        mask: &SERVICE_007_MASK,
    },
    SeedServiceProfile {
        service_id: "service-008",
        name: "Back-to-School Family Promo",
        description: "Promo bundle for August family traffic.",
        price: 18.0,
        bundle: true,
        mask: &SERVICE_008_MASK,
    },
    SeedServiceProfile {
        service_id: "service-009",
        name: "Water Festival Streetwear Promo",
        description: "November promo built for Water Festival crowds.",
        price: 26.0,
        bundle: true,
        mask: &SERVICE_009_MASK,
    },
    SeedServiceProfile {
        service_id: "service-010",
        name: "Pchum Ben Ceremony Set",
        description: "Seasonal ceremony set promoted during Pchum Ben.",
        price: 42.0,
        bundle: true,
        mask: &SERVICE_010_MASK,
    },
];

#[derive(Clone)]
struct PendingOrder {
    arrival_day: usize,
    quantity: f64,
    lead_time_days: f64,
}

#[derive(Clone)]
struct SeedSkuRuntime {
    on_hand: f64,
    current_cost: f64,
    recent_lead_time_days: f64,
    last_order_day: Option<usize>,
    pending_orders: Vec<PendingOrder>,
}

#[derive(Clone)]
struct RecipeUsageProfile {
    service_id: String,
    sku_id: String,
    usage_probability: f64,
    typical_units_per_instance: f64,
    variability: f64,
}

#[derive(Clone)]
struct ServiceIntervalOutcome {
    service_id: String,
    rank_score: f64,
    stockout: bool,
    recipe_profiles: Vec<RecipeUsageProfile>,
}

#[derive(Clone)]
struct SkuIntervalOutcome {
    sku_id: String,
    units_in_stock: f64,
    cost_per_unit: f64,
    product_price: Option<f64>,
    retail_stockout: bool,
    order_quantity: Option<f64>,
    receipt_quantity: Option<f64>,
    retail_rank_score: f64,
    lost_demand: f64,
}

fn sample_catalog() -> SenaCatalog {
    let skus = SEED_SKUS
        .iter()
        .map(|profile| SenaSku {
            sku_id: profile.sku_id.to_string(),
            name: profile.name.to_string(),
            description: profile.description.to_string(),
            image_path: seed_sku_image_path(profile.sku_id).map(str::to_string),
            supplier_name: profile.supplier_name.map(str::to_string),
            cost_per_unit: profile.cost_per_unit,
            archived: false,
            sold_as_product: profile.sold_as_product,
            product_price: profile.product_price,
            lead_time_mean_days_hint: Some(profile.lead_time_mean_days_hint),
            lead_time_std_days_hint: Some(profile.lead_time_std_days_hint),
        })
        .collect();

    let services = SEED_SERVICES
        .iter()
        .map(|profile| SenaService {
            service_id: profile.service_id.to_string(),
            name: profile.name.to_string(),
            description: profile.description.to_string(),
            image_path: seed_service_image_path(profile.service_id).map(str::to_string),
            price: profile.price,
            archived: false,
            bundle: profile.bundle,
        })
        .collect();

    let bundles = SEED_SERVICES
        .iter()
        .filter(|profile| profile.bundle)
        .enumerate()
        .map(|(index, profile)| SenaBundle {
            bundle_id: format!("bundle-{:03}", index + 1),
            service_id: profile.service_id.to_string(),
            name: profile.name.to_string(),
        })
        .collect();

    let sharing_mask = SEED_SERVICES
        .iter()
        .flat_map(|profile| {
            profile
                .mask
                .iter()
                .map(move |(sku_id, usage_probability)| SenaServiceSkuMaskEntry {
                    service_id: profile.service_id.to_string(),
                    sku_id: (*sku_id).to_string(),
                    enabled: true,
                    usage_probability: Some(*usage_probability),
                })
        })
        .collect();

    SenaCatalog {
        schema_version: 1,
        skus,
        services,
        bundles,
        sharing_mask,
    }
}

fn seed_sku_image_path(sku_id: &str) -> Option<&'static str> {
    match sku_id {
        "sku-001" => Some("banji-dev-sku-001-krama-cotton-scarf.png"),
        "sku-002" => Some("banji-dev-sku-002-silk-sampot-skirt.png"),
        "sku-003" => Some("banji-dev-sku-003-linen-sarong-pants.png"),
        "sku-004" => Some("banji-dev-sku-004-temple-white-blouse.png"),
        "sku-005" => Some("banji-dev-sku-005-indigo-farmer-shirt.png"),
        "sku-006" => Some("banji-dev-sku-006-rattan-market-tote.png"),
        "sku-007" => Some("banji-dev-sku-007-festival-silk-shawl.png"),
        "sku-008" => Some("banji-dev-sku-008-childrens-krama-set.png"),
        "sku-009" => Some("banji-dev-sku-009-handwoven-belt.png"),
        _ => None,
    }
}

fn seed_service_image_path(service_id: &str) -> Option<&'static str> {
    match service_id {
        "service-001" => Some("banji-dev-service-001-office-blouse-styling.png"),
        "service-002" => Some("banji-dev-service-002-tourist-gift-pairing.png"),
        "service-003" => Some("banji-dev-service-003-weekend-linen-look.png"),
        "service-004" => Some("banji-dev-service-004-wedding-guest-edit.png"),
        "service-005" => Some("banji-dev-service-005-market-tote-add-on.png"),
        "service-006" => Some("banji-dev-service-006-khmer-new-year-capsule.png"),
        "service-007" => Some("banji-dev-service-007-wedding-premium-bundle.png"),
        "service-008" => Some("banji-dev-service-008-back-to-school-family-promo.png"),
        "service-009" => Some("banji-dev-service-009-water-festival-streetwear-promo.png"),
        _ => None,
    }
}

fn read_dev_seed_version() -> Option<String> {
    fs::read_to_string(dev_seed_marker_path())
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn write_dev_seed_version() -> Result<()> {
    let path = dev_seed_marker_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, format!("{DEV_SEED_VERSION}\n"))?;
    Ok(())
}

fn workspace_matches_current_dev_seed(
    catalog: &SenaCatalog,
    observations: &[SenaObservationRecord],
) -> bool {
    catalog.skus.len() == SEED_SKUS.len()
        && catalog.services.len() == SEED_SERVICES.len()
        && observations.len() == DEV_SEED_OBSERVATION_COUNT
        && observations.iter().all(|observation| {
            observation
                .input
                .notes
                .as_deref()
                .is_some_and(|notes| notes.starts_with("Daily Phnom Penh storefront closeout"))
        })
}

fn looks_like_legacy_dev_seed(
    catalog: Option<&SenaCatalog>,
    observations: &[SenaObservationRecord],
) -> bool {
    if catalog.is_none() {
        return false;
    }
    !observations.is_empty()
        && observations.len() <= 14
        && observations
            .iter()
            .all(|observation| observation.input.notes.as_deref() == Some(LEGACY_DEV_SEED_NOTE))
}

fn round2(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

fn stable_seed(label: &str, left: usize, right: usize) -> u64 {
    let mut hash = 1469598103934665603_u64;
    for byte in label.bytes() {
        hash ^= byte as u64;
        hash = hash.wrapping_mul(1099511628211);
    }
    hash ^= left as u64;
    hash = hash.wrapping_mul(1099511628211);
    hash ^= right as u64;
    hash = hash.wrapping_mul(1099511628211);
    hash
}

fn seeded_rng(label: &str, left: usize, right: usize) -> StdRng {
    StdRng::seed_from_u64(stable_seed(label, left, right))
}

fn scheduled_regime(day_index: usize) -> SenaObservationRegimeHint {
    match day_index {
        5..=7 => SenaObservationRegimeHint::Spike,
        11..=14 => SenaObservationRegimeHint::Promo,
        18..=20 => SenaObservationRegimeHint::Lull,
        24..=26 => SenaObservationRegimeHint::Correction,
        _ => SenaObservationRegimeHint::Normal,
    }
}

fn regime_multiplier(regime: SenaObservationRegimeHint) -> f64 {
    match regime {
        SenaObservationRegimeHint::Normal => 1.0,
        SenaObservationRegimeHint::Spike => 1.3,
        SenaObservationRegimeHint::Lull => 0.72,
        SenaObservationRegimeHint::StockoutConstrained => 1.08,
        SenaObservationRegimeHint::Promo => 1.24,
        SenaObservationRegimeHint::Correction => 0.94,
    }
}

fn observation_timestamp_with_hour(date: Date, hour: u8) -> String {
    PrimitiveDateTime::new(
        date,
        Time::from_hms(hour, 0, 0).expect("seed hours should be valid"),
    )
    .assume_utc()
    .format(&time::format_description::well_known::Rfc3339)
    .expect("seed timestamps should format")
}

fn observation_timestamp(date: Date) -> String {
    observation_timestamp_with_hour(date, 9)
}

fn seasonal_multiplier(day_index: usize, date: Date) -> f64 {
    let weekly = match day_index % 7 {
        4 => 1.05,
        5 => 1.1,
        6 => 1.14,
        _ => 0.97,
    };
    let payday = if date.day() >= 24 { 1.07 } else { 1.0 };
    let weather = if matches!(date.month(), Month::March | Month::April) {
        1.04
    } else {
        1.0
    };
    weekly * payday * weather
}

fn service_promo_multiplier(service_id: &str, day_index: usize) -> f64 {
    match service_id {
        "service-004" if (5..=8).contains(&day_index) => 1.15,
        "service-006" if (11..=14).contains(&day_index) => 1.26,
        "service-008" if (11..=14).contains(&day_index) => 1.18,
        "service-009" if (24..=26).contains(&day_index) => 0.92,
        "service-007" if (27..=29).contains(&day_index) => 1.16,
        _ => 1.0,
    }
}

fn retail_promo_multiplier(sku_id: &str, day_index: usize) -> f64 {
    match sku_id {
        "sku-001" if (11..=14).contains(&day_index) => 1.12,
        "sku-006" if (11..=14).contains(&day_index) => 1.09,
        "sku-007" if (27..=29).contains(&day_index) => 1.15,
        "sku-008" if (11..=14).contains(&day_index) => 1.11,
        _ => 1.0,
    }
}

fn maybe_discounted_price(
    base_price: Option<f64>,
    date: Date,
    sku_id: &str,
    regime: SenaObservationRegimeHint,
) -> Option<f64> {
    base_price.map(|price| {
        let date_discount = match sku_id {
            "sku-001" if date.day() >= 13 && date.day() <= 16 => 0.95,
            "sku-006" if date.day() >= 20 && date.day() <= 22 => 0.93,
            "sku-008" if date.day() >= 10 && date.day() <= 12 => 0.95,
            _ => 1.0,
        };
        let regime_factor = match regime {
            SenaObservationRegimeHint::Promo => 0.94,
            SenaObservationRegimeHint::Spike => 0.98,
            SenaObservationRegimeHint::Correction => 1.0,
            SenaObservationRegimeHint::Lull => 0.99,
            SenaObservationRegimeHint::StockoutConstrained => 1.02,
            SenaObservationRegimeHint::Normal => 1.0,
        };
        round2(price * date_discount * regime_factor)
    })
}

fn maybe_discounted_service_price(
    base_price: f64,
    date: Date,
    service_id: &str,
    regime: SenaObservationRegimeHint,
) -> f64 {
    let date_discount = match service_id {
        "service-006" if date.day() >= 13 && date.day() <= 16 => 0.92,
        "service-005" if date.day() >= 20 && date.day() <= 22 => 0.95,
        "service-007" if date.day() >= 25 && date.day() <= 28 => 0.94,
        _ => 1.0,
    };
    let regime_factor = match regime {
        SenaObservationRegimeHint::Promo => 0.96,
        SenaObservationRegimeHint::Spike => 0.99,
        SenaObservationRegimeHint::Correction => 1.0,
        SenaObservationRegimeHint::Lull => 1.0,
        SenaObservationRegimeHint::StockoutConstrained => 1.03,
        SenaObservationRegimeHint::Normal => 1.0,
    };
    round2(base_price * date_discount * regime_factor)
}

fn service_base_activity(service: &SeedServiceProfile) -> f64 {
    let bundle_lift = if service.bundle { 0.45 } else { 0.1 };
    0.65 + service.mask.len() as f64 * 0.42 + bundle_lift
}

fn recipe_profile_for_interval(
    service: &SeedServiceProfile,
    day_index: usize,
    link_index: usize,
    regime: SenaObservationRegimeHint,
) -> RecipeUsageProfile {
    let mut rng = seeded_rng("recipe", day_index, link_index + service.name.len());
    let (sku_id, base_probability) = service.mask[link_index];
    let mut usage_probability = base_probability
        + if service.bundle { 0.08 } else { 0.0 }
        + if matches!(regime, SenaObservationRegimeHint::Promo) && service.bundle {
            0.08
        } else {
            0.0
        }
        - if matches!(regime, SenaObservationRegimeHint::Lull) {
            0.04
        } else {
            0.0
        }
        + rng.gen_range(-0.04..0.04);
    usage_probability = usage_probability.clamp(0.18, 0.98);

    let typical_units_per_instance = (0.55
        + link_index as f64 * 0.18
        + if service.bundle { 0.28 } else { 0.08 }
        + if matches!(regime, SenaObservationRegimeHint::Promo) {
            0.12
        } else {
            0.0
        }
        + rng.gen_range(-0.05..0.09))
    .max(0.12);
    let variability = (0.18 + link_index as f64 * 0.04 + rng.gen_range(0.0..0.08)).min(0.5);

    RecipeUsageProfile {
        service_id: service.service_id.to_string(),
        sku_id: sku_id.to_string(),
        usage_probability: round2(usage_probability),
        typical_units_per_instance: round2(typical_units_per_instance),
        variability: round2(variability),
    }
}

fn build_lead_time_hint(profile: &SeedSkuProfile, state: &SeedSkuRuntime) -> SenaLeadTimeHint {
    let typical_days = state.recent_lead_time_days.max(1.0);
    let spread = (profile.lead_time_std_days_hint * 0.85).max(0.75);
    let low_days = (typical_days - spread).max(1.0);
    let high_days = typical_days + spread;
    SenaLeadTimeHint {
        sku_id: profile.sku_id.to_string(),
        typical_days: Some(round2(typical_days)),
        low_days: Some(round2(low_days)),
        high_days: Some(round2(high_days)),
        variability_class: derive_relative_width(Some(low_days), Some(high_days))
            .and_then(classify_relative_width),
    }
}

fn note_for_regime(
    date: Date,
    regime: SenaObservationRegimeHint,
    stockout_count: usize,
    adjustment_count: usize,
) -> String {
    let regime_note = match regime {
        SenaObservationRegimeHint::Normal => "baseline trading flow",
        SenaObservationRegimeHint::Spike => "event-driven demand spike",
        SenaObservationRegimeHint::Lull => "quiet demand lull",
        SenaObservationRegimeHint::StockoutConstrained => "stockout-constrained selling window",
        SenaObservationRegimeHint::Promo => "promotion-led mix shift",
        SenaObservationRegimeHint::Correction => "inventory reconciliation window",
    };
    let pressure = if stockout_count > 0 {
        " stock pressure showed up across linked items."
    } else {
        ""
    };
    let correction = if adjustment_count > 0 {
        " Recount and shrinkage adjustments were recorded."
    } else {
        ""
    };
    format!(
        "Daily Phnom Penh storefront closeout for {date} with {regime_note}.{pressure}{correction}"
    )
}

fn generate_dev_seed_observations() -> Vec<SenaObservationInput> {
    let start =
        Date::from_calendar_date(2026, Month::March, 1).expect("seed start date should be valid");
    let mut sku_states: Vec<SeedSkuRuntime> = SEED_SKUS
        .iter()
        .map(|profile| SeedSkuRuntime {
            on_hand: profile.opening_units,
            current_cost: profile.cost_per_unit,
            recent_lead_time_days: profile.lead_time_mean_days_hint,
            last_order_day: None,
            pending_orders: Vec::new(),
        })
        .collect();
    let mut observations = Vec::with_capacity(DEV_SEED_OBSERVATION_COUNT);

    for day_index in 0..DEV_SEED_OBSERVATION_COUNT {
        let date = start + Duration::days(day_index as i64);
        let observed_at = observation_timestamp(date);
        let interval_multiplier = seasonal_multiplier(day_index, date);
        let scheduled_regime = scheduled_regime(day_index);
        let mut service_demand_by_sku = vec![0.0_f64; SEED_SKUS.len()];
        let mut service_outcomes = Vec::<ServiceIntervalOutcome>::new();
        let mut retail_latent_demand = vec![0.0_f64; SEED_SKUS.len()];
        let mut receipts_by_sku = vec![0.0_f64; SEED_SKUS.len()];
        let mut receipt_timestamps: Vec<Option<String>> = vec![None; SEED_SKUS.len()];

        for (sku_index, state) in sku_states.iter_mut().enumerate() {
            let mut arrivals = Vec::new();
            state.pending_orders.retain(|order| {
                if order.arrival_day == day_index {
                    arrivals.push(order.clone());
                    false
                } else {
                    true
                }
            });
            if !arrivals.is_empty() {
                let receipt_qty: f64 = arrivals.iter().map(|order| order.quantity).sum();
                state.on_hand += receipt_qty;
                receipts_by_sku[sku_index] = round2(receipt_qty);
                receipt_timestamps[sku_index] = arrivals
                    .first()
                    .map(|_| observation_timestamp_with_hour(date, 16));
                state.recent_lead_time_days = arrivals
                    .iter()
                    .map(|order| order.lead_time_days)
                    .sum::<f64>()
                    / arrivals.len() as f64;
            }
        }

        for (service_index, service) in SEED_SERVICES.iter().enumerate() {
            let service_price = maybe_discounted_service_price(
                service.price,
                date,
                service.service_id,
                scheduled_regime,
            );
            let price_lift = (service.price / service_price.max(1.0)).powf(0.45);
            let mut rng = seeded_rng("service", day_index, service_index);
            let base_count = service_base_activity(service)
                * interval_multiplier
                * regime_multiplier(scheduled_regime)
                * service_promo_multiplier(service.service_id, day_index)
                * price_lift
                * (1.0 + rng.gen_range(-0.12..0.14));
            let service_count = base_count.max(0.0);

            let mut recipe_profiles = Vec::new();
            for link_index in 0..service.mask.len() {
                let recipe_profile =
                    recipe_profile_for_interval(service, day_index, link_index, scheduled_regime);
                let sku_index = SEED_SKUS
                    .iter()
                    .position(|profile| profile.sku_id == recipe_profile.sku_id)
                    .expect("seed sku should exist");
                let usage_noise =
                    1.0 + rng.gen_range(-recipe_profile.variability..recipe_profile.variability);
                service_demand_by_sku[sku_index] += service_count
                    * recipe_profile.usage_probability
                    * recipe_profile.typical_units_per_instance
                    * usage_noise.max(0.5);
                recipe_profiles.push(recipe_profile);
            }

            let rank_score = service_count
                * (if service.bundle { 1.08 } else { 0.94 })
                * (1.0 + rng.gen_range(-0.08..0.08));
            service_outcomes.push(ServiceIntervalOutcome {
                service_id: service.service_id.to_string(),
                rank_score: round2(rank_score.max(0.01)),
                stockout: false,
                recipe_profiles,
            });
        }

        for (sku_index, profile) in SEED_SKUS.iter().enumerate() {
            if !profile.sold_as_product {
                continue;
            }
            let retail_price = maybe_discounted_price(
                profile.product_price,
                date,
                profile.sku_id,
                scheduled_regime,
            )
            .unwrap_or(profile.product_price.unwrap_or(1.0));
            let price_lift = profile
                .product_price
                .map(|base| (base / retail_price.max(0.5)).powf(0.55))
                .unwrap_or(1.0);
            let mut rng = seeded_rng("retail", day_index, sku_index);
            let base_retail = profile.base_daily_demand
                * interval_multiplier
                * regime_multiplier(scheduled_regime)
                * retail_promo_multiplier(profile.sku_id, day_index)
                * price_lift
                * (1.0 + rng.gen_range(-0.15..0.18));
            retail_latent_demand[sku_index] = base_retail.max(0.0);
        }

        let mut sku_outcomes = Vec::<SkuIntervalOutcome>::new();
        let mut retail_stockouts = Vec::new();
        let mut adjustment_signals = Vec::new();
        let mut order_signals = Vec::new();
        let mut stockout_pressure_detected = false;

        for (sku_index, profile) in SEED_SKUS.iter().enumerate() {
            let mut rng = seeded_rng("sku", day_index, sku_index);
            let state = &mut sku_states[sku_index];
            let pipeline_units: f64 = state
                .pending_orders
                .iter()
                .map(|order| order.quantity)
                .sum();
            let unconstrained_demand =
                service_demand_by_sku[sku_index] + retail_latent_demand[sku_index];
            let available_inventory = state.on_hand;

            let order_age_days = state
                .last_order_day
                .map(|last_order_day| (day_index - last_order_day) as f64)
                .unwrap_or((day_index + 1) as f64);
            let inventory_gap =
                (profile.reorder_target_units - (state.on_hand + pipeline_units)).max(0.0);
            let order_score = 0.12
                + (inventory_gap / profile.reorder_target_units.max(1.0)) * 0.74
                + (order_age_days / profile.lead_time_mean_days_hint.max(1.0)) * 0.08
                - (pipeline_units / profile.reorder_batch_units.max(1.0)) * 0.18
                + if matches!(
                    scheduled_regime,
                    SenaObservationRegimeHint::Spike | SenaObservationRegimeHint::Promo
                ) {
                    0.05
                } else {
                    0.0
                };
            let order_probability = order_score.clamp(0.02, 0.92);

            let mut order_quantity = None;
            let mut placement_timestamp = None;
            let mut lead_time_days_hint = None;
            if rng.gen::<f64>() < order_probability {
                let lead_time_days = (profile.lead_time_mean_days_hint
                    + rng.gen_range(
                        -profile.lead_time_std_days_hint..profile.lead_time_std_days_hint * 1.2,
                    )
                    + if matches!(
                        scheduled_regime,
                        SenaObservationRegimeHint::Promo | SenaObservationRegimeHint::Spike
                    ) {
                        0.6
                    } else {
                        0.0
                    })
                .max(1.0);
                let quantity = (profile.reorder_batch_units
                    * (0.86 + inventory_gap / profile.reorder_target_units.max(1.0) * 0.55)
                    * (1.0 + rng.gen_range(-0.12..0.18)))
                .max(6.0);
                let placement = observation_timestamp_with_hour(date, 12);
                let arrival_day = day_index + lead_time_days.ceil() as usize;
                state.pending_orders.push(PendingOrder {
                    arrival_day,
                    quantity,
                    lead_time_days,
                });
                state.last_order_day = Some(day_index);
                order_quantity = Some(round2(quantity));
                placement_timestamp = Some(placement);
                lead_time_days_hint = Some(round2(lead_time_days));
            }

            let adjustment_delta =
                if matches!(scheduled_regime, SenaObservationRegimeHint::Correction)
                    && ((sku_index + day_index) % 3 == 0)
                {
                    let sign = if (sku_index + day_index) % 2 == 0 {
                        -1.0
                    } else {
                        1.0
                    };
                    sign * round2(rng.gen_range(0.8..3.4))
                } else if rng.gen::<f64>() < 0.04 {
                    -round2(rng.gen_range(0.2..1.1))
                } else {
                    0.0
                };

            let realized_consumption = unconstrained_demand.min(available_inventory);
            let lost_demand = (unconstrained_demand - realized_consumption).max(0.0);
            state.on_hand =
                (available_inventory + adjustment_delta - realized_consumption).max(0.0);

            if receipts_by_sku[sku_index] > 0.0 {
                state.current_cost = round2(
                    state.current_cost
                        * (1.0
                            + if matches!(scheduled_regime, SenaObservationRegimeHint::Promo) {
                                0.025
                            } else if matches!(
                                scheduled_regime,
                                SenaObservationRegimeHint::Correction
                            ) {
                                0.01
                            } else {
                                0.0
                            }
                            + rng.gen_range(-0.008..0.016)),
                )
                .max(0.5);
            }

            let retail_stockout = lost_demand > 0.35
                || (profile.sold_as_product
                    && state.on_hand <= (profile.base_daily_demand * 1.8).max(2.0));
            if retail_stockout {
                retail_stockouts.push(profile.sku_id.to_string());
            }
            if lost_demand > 0.35 {
                stockout_pressure_detected = true;
            }
            if adjustment_delta != 0.0 {
                adjustment_signals.push(SenaAdjustmentSignal {
                    sku_id: profile.sku_id.to_string(),
                    quantity_delta: adjustment_delta,
                    reason: if adjustment_delta < 0.0 {
                        "cycle_count_write_off".to_string()
                    } else {
                        "cycle_count_recount".to_string()
                    },
                });
            }

            if order_quantity.is_some() || receipts_by_sku[sku_index] > 0.0 {
                order_signals.push(SenaOrderSignal {
                    sku_id: profile.sku_id.to_string(),
                    order_placed: order_quantity.is_some(),
                    receipt_arrived: receipts_by_sku[sku_index] > 0.0,
                    approximate_order_quantity: order_quantity,
                    approximate_receipt_quantity: (receipts_by_sku[sku_index] > 0.0)
                        .then_some(round2(receipts_by_sku[sku_index])),
                    placement_timestamp,
                    receipt_timestamp: receipt_timestamps[sku_index].clone(),
                    lead_time_days_hint,
                });
            }

            let retail_rank_score =
                round2((retail_latent_demand[sku_index] + lost_demand * 0.25).max(0.0));
            sku_outcomes.push(SkuIntervalOutcome {
                sku_id: profile.sku_id.to_string(),
                units_in_stock: state.on_hand.round(),
                cost_per_unit: round2(state.current_cost),
                product_price: maybe_discounted_price(
                    profile.product_price,
                    date,
                    profile.sku_id,
                    scheduled_regime,
                ),
                retail_stockout,
                order_quantity,
                receipt_quantity: (receipts_by_sku[sku_index] > 0.0)
                    .then_some(round2(receipts_by_sku[sku_index])),
                retail_rank_score,
                lost_demand: round2(lost_demand),
            });
        }

        let binding_stockouts = sku_outcomes
            .iter()
            .filter(|outcome| outcome.retail_stockout || outcome.lost_demand > 0.5)
            .count();
        let final_regime = if stockout_pressure_detected
            && matches!(
                scheduled_regime,
                SenaObservationRegimeHint::Normal | SenaObservationRegimeHint::Lull
            )
            && binding_stockouts >= 2
        {
            SenaObservationRegimeHint::StockoutConstrained
        } else {
            scheduled_regime
        };

        for outcome in &mut service_outcomes {
            let linked_stockout = SEED_SERVICES
                .iter()
                .find(|service| service.service_id == outcome.service_id)
                .is_some_and(|service| {
                    service.mask.iter().any(|(sku_id, _)| {
                        sku_outcomes
                            .iter()
                            .find(|outcome| outcome.sku_id == *sku_id)
                            .is_some_and(|outcome| {
                                outcome.retail_stockout || outcome.lost_demand > 0.35
                            })
                    })
                });
            outcome.stockout = linked_stockout;
        }

        let service_stockouts: Vec<String> = service_outcomes
            .iter()
            .filter(|outcome| outcome.stockout)
            .map(|outcome| outcome.service_id.clone())
            .collect();

        let stock_snapshot = sku_outcomes
            .iter()
            .map(|outcome| SenaStockSnapshot {
                sku_id: outcome.sku_id.clone(),
                units_in_stock: outcome.units_in_stock,
                cost_per_unit: Some(outcome.cost_per_unit),
                product_price: outcome.product_price,
            })
            .collect();

        let service_prices = SEED_SERVICES
            .iter()
            .map(|service| SenaServicePriceObservation {
                service_id: service.service_id.to_string(),
                price: maybe_discounted_service_price(
                    service.price,
                    date,
                    service.service_id,
                    final_regime,
                ),
            })
            .collect();

        let retail_prices = sku_outcomes
            .iter()
            .filter_map(|outcome| {
                outcome
                    .product_price
                    .map(|price| SenaRetailPriceObservation {
                        sku_id: outcome.sku_id.clone(),
                        price,
                    })
            })
            .collect();

        let lead_time_hints = SEED_SKUS
            .iter()
            .enumerate()
            .filter_map(|(sku_index, profile)| {
                let state = &sku_states[sku_index];
                let emit = day_index == 0
                    || sku_outcomes[sku_index].order_quantity.is_some()
                    || sku_outcomes[sku_index].receipt_quantity.is_some()
                    || matches!(
                        final_regime,
                        SenaObservationRegimeHint::Promo | SenaObservationRegimeHint::Correction
                    );
                emit.then(|| build_lead_time_hint(profile, state))
            })
            .collect();

        let mut service_rankings: Vec<(String, f64)> = service_outcomes
            .iter()
            .map(|outcome| (outcome.service_id.clone(), outcome.rank_score))
            .collect();
        let mut retail_rankings: Vec<(String, f64)> = sku_outcomes
            .iter()
            .map(|outcome| (outcome.sku_id.clone(), outcome.retail_rank_score))
            .collect();
        service_rankings.sort_by(|left, right| right.1.total_cmp(&left.1));
        retail_rankings.sort_by(|left, right| right.1.total_cmp(&left.1));

        let adjustment_count = adjustment_signals.len();
        let stockout_count = retail_stockouts.len() + service_stockouts.len();
        observations.push(SenaObservationInput {
            observed_at,
            stock_snapshot,
            retail_sales_snapshot: Vec::new(),
            service_sales_snapshot: Vec::new(),
            service_rankings: service_rankings
                .into_iter()
                .take(5)
                .map(|(id, _)| id)
                .collect(),
            retail_rankings: retail_rankings
                .into_iter()
                .filter(|(_, score)| *score > 0.0)
                .take(5)
                .map(|(id, _)| id)
                .collect(),
            service_stockouts,
            retail_stockouts,
            order_signals,
            service_prices,
            retail_prices,
            lead_time_hints,
            regime_hint: Some(final_regime),
            adjustment_signals,
            commercial_events: Vec::new(),
            ticket_events: Vec::new(),
            delivery_fee: None,
            recipe_usage_hints: service_outcomes
                .iter()
                .flat_map(|outcome| outcome.recipe_profiles.iter())
                .map(|profile| SenaRecipeUsageHint {
                    service_id: profile.service_id.clone(),
                    sku_id: profile.sku_id.clone(),
                    usage_probability: profile.usage_probability,
                    typical_units_per_instance: profile.typical_units_per_instance,
                    variability: profile.variability,
                })
                .collect(),
            notes: Some(note_for_regime(
                date,
                final_regime,
                stockout_count,
                adjustment_count,
            )),
        });
    }

    observations
}

fn seed_workspace(repo: &SqliteSenaRepository, owner_sub: &str) -> Result<()> {
    let catalog = sample_catalog();
    block_on(repo.upsert_catalog(owner_sub, &catalog))?;
    for observation in generate_dev_seed_observations() {
        block_on(repo.insert_observation(owner_sub, &observation))?;
    }

    let run = block_on(trigger_analysis_run(repo, owner_sub, "sena-analysis-v3"))?;
    let _ = block_on(execute_analysis_run(repo, &run.run_id, "sena-analysis-v3"))?;
    write_dev_seed_version()?;
    Ok(())
}

pub fn upsert_catalog(owner_sub: &str, catalog: &SenaCatalog) -> Result<()> {
    block_on(repository()?.upsert_catalog(owner_sub, catalog))
}

pub fn ingest_observation(
    owner_sub: &str,
    observation: &SenaObservationInput,
) -> Result<SenaObservationRecord> {
    block_on(repository()?.insert_observation(owner_sub, observation))
}

pub fn update_observation(
    owner_sub: &str,
    observation_id: &str,
    observation: &SenaObservationInput,
) -> Result<SenaObservationRecord> {
    block_on(repository()?.update_observation(owner_sub, observation_id, observation))
}

pub fn delete_observation(owner_sub: &str, observation_id: &str) -> Result<()> {
    block_on(repository()?.delete_observation(owner_sub, observation_id))
}

pub fn get_catalog(owner_sub: &str) -> Result<Option<SenaCatalog>> {
    block_on(repository()?.get_catalog(owner_sub))
}

pub fn list_observations(owner_sub: &str) -> Result<Vec<SenaObservationRecord>> {
    block_on(repository()?.list_observations(owner_sub))
}

pub fn list_observation_page(
    owner_sub: &str,
    request: Option<&SenaObservationPageRequest>,
) -> Result<SenaObservationPage> {
    block_on(repository()?.list_observation_page(owner_sub, request))
}

pub fn get_observation_fingerprint(owner_sub: &str) -> Result<SenaObservationFingerprint> {
    block_on(repository()?.get_observation_fingerprint(owner_sub))
}

pub fn get_record_update_context(owner_sub: &str) -> Result<SenaRecordUpdateContext> {
    block_on(repository()?.get_record_update_context(owner_sub))
}

pub fn get_startup_workspace(owner_sub: &str) -> Result<SenaStartupWorkspace> {
    let repo = repository()?;
    let catalog = block_on(repo.get_catalog(owner_sub))?;
    let workspace_summary = block_on(repo.load_workspace_summary(owner_sub))?;
    let latest_run = block_on(repo.get_latest_run(owner_sub))?;
    let observation_fingerprint = block_on(repo.get_observation_fingerprint(owner_sub))?;
    Ok(SenaStartupWorkspace {
        catalog,
        workspace_summary,
        latest_run,
        observation_fingerprint,
    })
}

pub fn list_order_batches(
    owner_sub: &str,
    filters: Option<&SenaOrderLookupPayload>,
) -> Result<Vec<SenaOrderBatchRecord>> {
    block_on(repository()?.list_order_batches(owner_sub, filters))
}

pub fn create_order_batch(
    owner_sub: &str,
    payload: &SenaCreateOrderBatchPayload,
) -> Result<SenaOrderBatchRecord> {
    block_on(repository()?.create_order_batch(owner_sub, payload))
}

pub fn update_order_batch(
    owner_sub: &str,
    payload: &SenaUpdateOrderBatchPayload,
) -> Result<SenaOrderBatchRecord> {
    block_on(repository()?.update_order_batch(owner_sub, payload))
}

pub fn update_order_child(
    owner_sub: &str,
    payload: &SenaUpdateOrderChildPayload,
) -> Result<SenaOrderBatchRecord> {
    block_on(repository()?.update_order_child(owner_sub, payload))
}

pub fn split_order_child(
    owner_sub: &str,
    payload: &SenaSplitOrderChildPayload,
) -> Result<SenaOrderBatchRecord> {
    block_on(repository()?.split_order_child(owner_sub, payload))
}

pub fn trigger_run(owner_sub: &str, algorithm_version: &str) -> Result<SenaAnalysisRunRecord> {
    trigger_run_with_parameters(owner_sub, algorithm_version, None)
}

pub fn trigger_run_with_parameters(
    owner_sub: &str,
    algorithm_version: &str,
    parameters: Option<&SenaEngineParameters>,
) -> Result<SenaAnalysisRunRecord> {
    let repo = repository()?;
    let run = block_on(trigger_analysis_run(&repo, owner_sub, algorithm_version))?;
    let (completed, _) = block_on(execute_analysis_run_with_parameters(
        &repo,
        &run.run_id,
        algorithm_version,
        parameters,
    ))?;
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

pub fn get_sku_detail(
    owner_sub: &str,
    sku_id: &str,
    before_interval_index: Option<usize>,
    limit: usize,
) -> Result<Option<SenaSkuDetailPage>> {
    Ok(block_on(repository()?.load_sku_detail(owner_sub, sku_id))?
        .map(|detail| page_sku_detail(detail, before_interval_index, limit)))
}

pub fn get_service_detail(
    owner_sub: &str,
    service_id: &str,
    before_interval_index: Option<usize>,
    limit: usize,
) -> Result<Option<SenaServiceDetailPage>> {
    let load_started_at = Instant::now();
    let detail = block_on(repository()?.load_service_detail(owner_sub, service_id))?;
    benchmark::record_duration(
        "core.service-detail.store.load",
        Some("sena.getServiceDetail"),
        load_started_at.elapsed(),
        json!({
            "hit": detail.is_some(),
            "serviceId": service_id,
        }),
    );
    let Some(detail) = detail else {
        return Ok(None);
    };

    let page_started_at = Instant::now();
    let page = page_service_detail(detail, before_interval_index, limit);
    benchmark::record_duration(
        "core.service-detail.store.page",
        Some("sena.getServiceDetail"),
        page_started_at.elapsed(),
        json!({
            "beforeIntervalIndex": before_interval_index,
            "hasOlder": page.has_older,
            "intervalCount": page.detail.regime_timeline.len(),
            "limit": limit,
            "nextBeforeIntervalIndex": page.next_before_interval_index,
            "serviceId": service_id,
        }),
    );
    Ok(Some(page))
}

pub fn get_diagnostics(owner_sub: &str) -> Result<Option<SenaDiagnostics>> {
    block_on(repository()?.load_diagnostics(owner_sub))
}

pub fn get_run(run_id: &str) -> Result<Option<SenaAnalysisRunRecord>> {
    block_on(repository()?.get_run(run_id))
}

pub fn ensure_dev_seed(owner_sub: &str) -> Result<bool> {
    let repo = repository()?;

    let existing_catalog = block_on(repo.get_catalog(owner_sub))?;
    let existing_observations = block_on(repo.list_observations(owner_sub))?;
    let marker_version = read_dev_seed_version();
    let workspace_empty = existing_catalog.is_none() && existing_observations.is_empty();

    if workspace_empty {
        seed_workspace(&repo, owner_sub)?;
        return Ok(true);
    }

    if existing_catalog
        .as_ref()
        .is_some_and(|catalog| workspace_matches_current_dev_seed(catalog, &existing_observations))
    {
        if marker_version.as_deref() == Some(DEV_SEED_VERSION) {
            return Ok(false);
        }

        block_on(repo.clear_owner(owner_sub))?;
        seed_workspace(&repo, owner_sub)?;
        return Ok(true);
    }

    let should_upgrade = marker_version
        .as_deref()
        .is_some_and(|version| version != DEV_SEED_VERSION)
        || looks_like_legacy_dev_seed(existing_catalog.as_ref(), &existing_observations);

    if !should_upgrade {
        return Ok(false);
    }

    block_on(repo.clear_owner(owner_sub))?;
    seed_workspace(&repo, owner_sub)?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::{generate_dev_seed_observations, sample_catalog, SenaObservationRegimeHint};
    use std::collections::BTreeMap;

    #[test]
    fn dev_seed_observations_separate_orders_receipts_and_adjustments() {
        let observations = generate_dev_seed_observations();
        assert!(!observations.is_empty());
        assert!(observations.iter().any(|observation| {
            observation
                .order_signals
                .iter()
                .any(|signal| signal.order_placed && !signal.receipt_arrived)
        }));
        assert!(observations.iter().any(|observation| {
            observation
                .order_signals
                .iter()
                .any(|signal| !signal.order_placed && signal.receipt_arrived)
        }));
        assert!(observations.iter().any(|observation| {
            observation.regime_hint == Some(SenaObservationRegimeHint::Correction)
                && !observation.adjustment_signals.is_empty()
        }));
    }

    #[test]
    fn dev_seed_observations_keep_pipeline_non_negative_and_stockouts_tight() {
        let observations = generate_dev_seed_observations();
        let mut pipeline_by_sku = BTreeMap::<String, f64>::new();

        for observation in &observations {
            let stock_by_sku = observation
                .stock_snapshot
                .iter()
                .map(|snapshot| (snapshot.sku_id.clone(), snapshot.units_in_stock))
                .collect::<BTreeMap<_, _>>();

            for signal in &observation.order_signals {
                let pipeline = pipeline_by_sku.entry(signal.sku_id.clone()).or_insert(0.0);
                *pipeline += signal.approximate_order_quantity.unwrap_or(0.0);
                *pipeline -= signal.approximate_receipt_quantity.unwrap_or(0.0);
                assert!(
                    *pipeline >= -1e-6,
                    "pipeline dipped below zero for {}",
                    signal.sku_id
                );
            }

            for sku_id in &observation.retail_stockouts {
                let units = stock_by_sku.get(sku_id).copied().unwrap_or(f64::INFINITY);
                assert!(
                    units <= 6.0,
                    "stockout flag should correspond to tight stock for {sku_id}"
                );
            }
        }
    }

    #[test]
    fn sample_catalog_assigns_seed_images_except_placeholder_controls() {
        let catalog = sample_catalog();

        assert_eq!(
            catalog.skus.iter().filter(|sku| sku.image_path.is_some()).count(),
            9
        );
        assert_eq!(
            catalog.services.iter().filter(|service| service.image_path.is_some()).count(),
            9
        );
        assert_eq!(
            catalog
                .skus
                .iter()
                .find(|sku| sku.sku_id == "sku-001")
                .and_then(|sku| sku.image_path.as_deref()),
            Some("banji-dev-sku-001-krama-cotton-scarf.png")
        );
        assert_eq!(
            catalog
                .services
                .iter()
                .find(|service| service.service_id == "service-001")
                .and_then(|service| service.image_path.as_deref()),
            Some("banji-dev-service-001-office-blouse-styling.png")
        );
        assert_eq!(
            catalog
                .skus
                .iter()
                .find(|sku| sku.sku_id == "sku-010")
                .and_then(|sku| sku.image_path.as_deref()),
            None
        );
        assert_eq!(
            catalog
                .services
                .iter()
                .find(|service| service.service_id == "service-010")
                .and_then(|service| service.image_path.as_deref()),
            None
        );
    }
}
