use crate::legacy_inventory::{
    store as legacy_store,
    types::{DesktopInventoryResponse, StockReportRecord, SubmitStockReportRequest},
};
use anyhow::Result;
use banji_sena_core::{
    classify_relative_width, derive_relative_width,
    execute_analysis_run, trigger_analysis_run, SenaAnalysisRunRecord, SenaBundle, SenaCatalog,
    SenaDiagnostics, SenaLeadTimeHint, SenaObservationInput, SenaObservationRecord,
    SenaOrderSignal, SenaRepository, SenaRetailPriceObservation, SenaService,
    SenaServiceDetail, SenaServicePriceObservation, SenaServiceSkuMaskEntry, SenaSku,
    SenaSkuDetail, SenaStockSnapshot, SenaWorkspaceSummary, SqliteSenaRepository,
};
use futures::executor::block_on;
use std::{env, fs, path::PathBuf};
use time::{Date, Duration, Month, PrimitiveDateTime, Time};

const DEFAULT_OWNER_SUB: &str = "desktop-owner";
const DEV_SEED_VERSION: &str = "cambodian-clothing-v4";
const DEV_SEED_OBSERVATION_COUNT: usize = 30;
const LEGACY_DEV_SEED_NOTE: &str = "Seeded dev observation";

fn db_path() -> PathBuf {
    env::var_os("BANJI_DESKTOP_DATA_PATH")
        .map(PathBuf::from)
        .unwrap_or_else(|| env::temp_dir().join("banji-sena.sqlite3"))
}

fn repository() -> Result<SqliteSenaRepository> {
    SqliteSenaRepository::open(db_path())
}

fn legacy_store_path() -> PathBuf {
    let current = db_path();
    current
        .parent()
        .unwrap_or_else(|| std::path::Path::new("."))
        .join("desktop-inventory-store.json")
}

fn dev_seed_marker_path() -> PathBuf {
    db_path()
        .parent()
        .unwrap_or_else(|| std::path::Path::new("."))
        .join("desktop-sena-dev-seed.txt")
}

fn with_legacy_store_env<T>(task: impl FnOnce() -> Result<T>) -> Result<T> {
    let previous = env::var_os("BANJI_DESKTOP_DATA_PATH");
    env::set_var("BANJI_DESKTOP_DATA_PATH", legacy_store_path());
    let result = task();
    if let Some(value) = previous {
        env::set_var("BANJI_DESKTOP_DATA_PATH", value);
    } else {
        env::remove_var("BANJI_DESKTOP_DATA_PATH");
    }
    result
}

pub fn default_owner() -> &'static str {
    DEFAULT_OWNER_SUB
}

#[derive(Clone, Copy)]
struct SeedSkuProfile {
    sku_id: &'static str,
    name: &'static str,
    description: &'static str,
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

fn sample_catalog() -> SenaCatalog {
    let skus = SEED_SKUS
        .iter()
        .map(|profile| SenaSku {
            sku_id: profile.sku_id.to_string(),
            name: profile.name.to_string(),
            description: profile.description.to_string(),
            cost_per_unit: profile.cost_per_unit,
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
            price: profile.price,
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
            profile.mask.iter().map(move |(sku_id, usage_probability)| SenaServiceSkuMaskEntry {
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
        && observations.iter().all(|observation| {
            observation.input.notes.as_deref() == Some(LEGACY_DEV_SEED_NOTE)
        })
}

fn demand_multiplier(day_index: usize, date: Date) -> f64 {
    let weekly = match day_index % 7 {
        4 => 1.06,
        5 => 1.12,
        6 => 1.16,
        _ => 0.97,
    };
    let payday = if date.day() >= 25 { 1.08 } else { 1.0 };
    let hot_weather_bump = if matches!(date.month(), Month::March | Month::April) {
        1.05
    } else {
        1.0
    };
    weekly * payday * hot_weather_bump
}

fn service_promo_multiplier(service_id: &str, day_index: usize) -> f64 {
    match service_id {
        "service-004" if (6..=8).contains(&day_index) => 1.22,
        "service-006" if (12..=15).contains(&day_index) => 1.28,
        "service-005" if (19..=21).contains(&day_index) => 1.18,
        "service-007" if (24..=27).contains(&day_index) => 1.2,
        _ => 1.0,
    }
}

fn retail_promo_multiplier(sku_id: &str, day_index: usize) -> f64 {
    match sku_id {
        "sku-001" if (12..=15).contains(&day_index) => 1.1,
        "sku-006" if (19..=21).contains(&day_index) => 1.14,
        "sku-007" if (24..=27).contains(&day_index) => 1.16,
        "sku-008" if (9..=11).contains(&day_index) => 1.12,
        _ => 1.0,
    }
}

fn observation_timestamp(date: Date) -> String {
    PrimitiveDateTime::new(date, Time::MIDNIGHT)
        .assume_utc()
        .format(&time::format_description::well_known::Rfc3339)
        .expect("seed timestamps should format")
}

fn maybe_discounted_price(base_price: Option<f64>, date: Date, sku_id: &str) -> Option<f64> {
    base_price.map(|price| {
        let discount = match sku_id {
            "sku-001" if date.day() >= 13 && date.day() <= 16 => 0.95,
            "sku-006" if date.day() >= 20 && date.day() <= 22 => 0.93,
            "sku-008" if date.day() >= 10 && date.day() <= 12 => 0.95,
            _ => 1.0,
        };
        (price * discount * 100.0).round() / 100.0
    })
}

fn maybe_discounted_service_price(base_price: f64, date: Date, service_id: &str) -> f64 {
    let discount = match service_id {
        "service-006" if date.day() >= 13 && date.day() <= 16 => 0.92,
        "service-005" if date.day() >= 20 && date.day() <= 22 => 0.95,
        "service-007" if date.day() >= 25 && date.day() <= 28 => 0.94,
        _ => 1.0,
    };
    (base_price * discount * 100.0).round() / 100.0
}

fn generate_dev_seed_observations() -> Vec<SenaObservationInput> {
    let start = Date::from_calendar_date(2026, Month::March, 1)
        .expect("seed start date should be valid");
    let mut on_hand: Vec<f64> = SEED_SKUS.iter().map(|profile| profile.opening_units).collect();
    let mut pipeline: Vec<Vec<(usize, f64)>> = vec![Vec::new(); SEED_SKUS.len()];
    let mut observations = Vec::with_capacity(DEV_SEED_OBSERVATION_COUNT);

    for day_index in 0..DEV_SEED_OBSERVATION_COUNT {
        let date = start + Duration::days(day_index as i64);
        let timestamp = observation_timestamp(date);
        let seasonal = demand_multiplier(day_index, date);
        let mut order_signals = Vec::new();
        let mut retail_rank_scores = Vec::<(String, f64)>::new();
        let mut service_rank_scores = Vec::<(String, f64)>::new();
        let mut retail_stockouts = Vec::new();
        let mut service_stockouts = Vec::new();
        let mut daily_receipts = vec![0.0_f64; SEED_SKUS.len()];

        for (sku_index, _profile) in SEED_SKUS.iter().enumerate() {
            let mut receipt_qty = 0.0;
            pipeline[sku_index].retain(|(arrival_day, qty)| {
                if *arrival_day == day_index {
                    receipt_qty += *qty;
                    false
                } else {
                    true
                }
            });
            if receipt_qty > 0.0 {
                on_hand[sku_index] += receipt_qty;
                daily_receipts[sku_index] = receipt_qty;
            }
        }

        for (sku_index, profile) in SEED_SKUS.iter().enumerate() {
            let promo = retail_promo_multiplier(profile.sku_id, day_index);
            let phase = ((day_index as f64 / 6.0) + sku_index as f64 * 0.45).sin() * 0.08;
            let retail_demand = if profile.sold_as_product {
                (profile.base_daily_demand * seasonal * promo * (1.0 + phase)).clamp(0.05, 4.0)
            } else {
                0.0
            };
            let sold_units = retail_demand.min(on_hand[sku_index]);
            on_hand[sku_index] = (on_hand[sku_index] - sold_units).max(0.0);
            retail_rank_scores.push((profile.sku_id.to_string(), retail_demand));
            if on_hand[sku_index] <= 2.0 {
                retail_stockouts.push(profile.sku_id.to_string());
            }

            let pipeline_units: f64 = pipeline[sku_index].iter().map(|(_, qty)| *qty).sum();
            if on_hand[sku_index] + pipeline_units <= profile.reorder_target_units {
                let expected_lead = profile.lead_time_mean_days_hint.round() as usize;
                let jitter = (day_index + sku_index) % 3;
                let arrival_day =
                    (day_index + expected_lead.max(2) + jitter).min(DEV_SEED_OBSERVATION_COUNT + 14);
                let quantity = profile.reorder_batch_units;
                pipeline[sku_index].push((arrival_day, quantity));
                order_signals.push(SenaOrderSignal {
                    sku_id: profile.sku_id.to_string(),
                    order_placed: true,
                    receipt_arrived: daily_receipts[sku_index] > 0.0,
                    approximate_order_quantity: Some(quantity),
                    approximate_receipt_quantity: if daily_receipts[sku_index] > 0.0 {
                        Some(daily_receipts[sku_index])
                    } else {
                        None
                    },
                });
            } else if daily_receipts[sku_index] > 0.0 {
                order_signals.push(SenaOrderSignal {
                    sku_id: profile.sku_id.to_string(),
                    order_placed: false,
                    receipt_arrived: true,
                    approximate_order_quantity: None,
                    approximate_receipt_quantity: Some(daily_receipts[sku_index]),
                });
            }
        }

        for service in &SEED_SERVICES {
            let promo = service_promo_multiplier(service.service_id, day_index);
            let availability = service
                .mask
                .iter()
                .map(|(sku_id, usage)| {
                    let idx = SEED_SKUS
                        .iter()
                        .position(|profile| profile.sku_id == *sku_id)
                        .expect("seed sku should exist");
                    let stock_ratio =
                        (on_hand[idx] / (SEED_SKUS[idx].opening_units * usage.max(0.35))).clamp(0.25, 1.4);
                    stock_ratio
                })
                .sum::<f64>()
                / service.mask.len().max(1) as f64;
            let popularity = 1.0 + ((day_index as f64 / 7.0) + service.name.len() as f64).cos() * 0.08;
            let rank_score = (promo
                * popularity
                * if service.bundle { 1.06 } else { 0.98 }
                * availability)
                .clamp(0.2, 2.5);
            service_rank_scores.push((service.service_id.to_string(), rank_score));
            if service.mask.iter().any(|(sku_id, _)| {
                let idx = SEED_SKUS
                    .iter()
                    .position(|profile| profile.sku_id == *sku_id)
                    .expect("seed sku should exist");
                on_hand[idx] <= 1.0
            }) {
                service_stockouts.push(service.service_id.to_string());
            }
        }

        retail_rank_scores.sort_by(|left, right| right.1.total_cmp(&left.1));
        service_rank_scores.sort_by(|left, right| right.1.total_cmp(&left.1));

        let stock_snapshot = SEED_SKUS
            .iter()
            .enumerate()
            .map(|(sku_index, profile)| SenaStockSnapshot {
                sku_id: profile.sku_id.to_string(),
                units_in_stock: on_hand[sku_index].round(),
                cost_per_unit: Some(profile.cost_per_unit),
                product_price: maybe_discounted_price(profile.product_price, date, profile.sku_id),
            })
            .collect();

        let service_prices = SEED_SERVICES
            .iter()
            .map(|service| SenaServicePriceObservation {
                service_id: service.service_id.to_string(),
                price: maybe_discounted_service_price(service.price, date, service.service_id),
            })
            .collect();

        let retail_prices = SEED_SKUS
            .iter()
            .filter_map(|profile| {
                maybe_discounted_price(profile.product_price, date, profile.sku_id).map(|price| {
                    SenaRetailPriceObservation {
                        sku_id: profile.sku_id.to_string(),
                        price,
                    }
                })
            })
            .collect();

        let lead_time_hints = if day_index % 30 == 0 || matches!(date.month(), Month::April | Month::November) && date.day() == 1 {
            SEED_SKUS
                .iter()
                .map(|profile| {
                    let low_days =
                        (profile.lead_time_mean_days_hint - profile.lead_time_std_days_hint).max(1.0);
                    let high_days =
                        profile.lead_time_mean_days_hint + profile.lead_time_std_days_hint + 1.0;
                    SenaLeadTimeHint {
                        sku_id: profile.sku_id.to_string(),
                        typical_days: Some(profile.lead_time_mean_days_hint),
                        low_days: Some(low_days),
                        high_days: Some(high_days),
                        variability_class: derive_relative_width(Some(low_days), Some(high_days))
                            .and_then(classify_relative_width),
                    }
                })
                .collect()
        } else if day_index == 14 {
            SEED_SKUS
                .iter()
                .map(|profile| {
                    let low_days =
                        (profile.lead_time_mean_days_hint - profile.lead_time_std_days_hint).max(1.0);
                    let high_days =
                        profile.lead_time_mean_days_hint + profile.lead_time_std_days_hint + 1.0;
                    SenaLeadTimeHint {
                        sku_id: profile.sku_id.to_string(),
                        typical_days: Some(profile.lead_time_mean_days_hint),
                        low_days: Some(low_days),
                        high_days: Some(high_days),
                        variability_class: derive_relative_width(Some(low_days), Some(high_days))
                            .and_then(classify_relative_width),
                    }
                })
                .collect()
        } else {
            Vec::new()
        };

        observations.push(SenaObservationInput {
            observed_at: timestamp,
            stock_snapshot,
            service_rankings: service_rank_scores.iter().take(5).map(|(id, _)| id.clone()).collect(),
            retail_rankings: retail_rank_scores.iter().take(5).map(|(id, _)| id.clone()).collect(),
            service_stockouts,
            retail_stockouts,
            order_signals,
            service_prices,
            retail_prices,
            lead_time_hints,
            notes: Some(format!(
                "Daily Phnom Penh storefront closeout for {}.",
                date
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

    let run = block_on(trigger_analysis_run(repo, owner_sub, "sena-analysis-v1"))?;
    let _ = block_on(execute_analysis_run(repo, &run.run_id, "sena-analysis-v1"))?;
    write_dev_seed_version()?;
    Ok(())
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

pub fn load_inventory_snapshot(owner_sub: &str) -> Result<DesktopInventoryResponse> {
    with_legacy_store_env(|| legacy_store::load_inventory(owner_sub))
}

pub fn list_stock_reports(owner_sub: &str) -> Result<Vec<StockReportRecord>> {
    with_legacy_store_env(|| legacy_store::list_stock_reports(owner_sub))
}

pub fn submit_stock_report(
    owner_sub: &str,
    request: SubmitStockReportRequest,
) -> Result<StockReportRecord> {
    with_legacy_store_env(|| legacy_store::submit_stock_report(owner_sub, request))
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
