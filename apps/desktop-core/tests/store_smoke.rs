use banji_desktop_core::{
    store,
    types::{
        SaveDesktopRankingRequest, StockReportServicePriceAdjustment, StockReportSkuObservation,
        SubmitStockReportRequest, UpdateSistSettingsRequest, UpsertDesktopSkuRequest,
    },
};
use serde_json::{json, Value};
use std::{env, fs, path::PathBuf, sync::Mutex, thread::sleep, time::Duration};

static STORE_TEST_LOCK: Mutex<()> = Mutex::new(());

fn temp_store_path(test_name: &str) -> PathBuf {
    let unique = format!(
        "banji-desktop-core-{test_name}-{}-{}.json",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system time should be valid")
            .as_nanos()
    );
    env::temp_dir().join(unique)
}

fn read_store_json(path: &PathBuf) -> Value {
    let raw = fs::read_to_string(path).expect("store file should be readable");
    serde_json::from_str(&raw).expect("store json should decode")
}

fn write_store_json(path: &PathBuf, value: &Value) {
    let raw = serde_json::to_vec_pretty(value).expect("store json should encode");
    fs::write(path, raw).expect("store file should be writable");
}

fn owner_sist_mut<'a>(value: &'a mut Value, owner: &str) -> &'a mut serde_json::Map<String, Value> {
    value
        .get_mut("owners")
        .and_then(Value::as_object_mut)
        .and_then(|owners| owners.get_mut(owner))
        .and_then(Value::as_object_mut)
        .and_then(|owner_value| owner_value.get_mut("sist"))
        .and_then(Value::as_object_mut)
        .expect("owner sist payload should exist")
}

#[test]
fn desktop_core_store_supports_local_crud_and_settings() {
    let _guard = STORE_TEST_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let store_path = temp_store_path("smoke");
    env::set_var("BANJI_DESKTOP_DATA_PATH", &store_path);

    let owner = "desktop-owner";
    let snapshot = store::load_inventory(owner).expect("seeded inventory should load");
    assert!(!snapshot.skus.is_empty());
    assert!(!snapshot.services.is_empty());

    let mut new_sku = UpsertDesktopSkuRequest {
        sku_id: "sku-777".to_string(),
        name: "SKU #777".to_string(),
        description: "New local sku".to_string(),
        units_in_stock: 22.0,
        cost_per_unit: 4.5,
        sold_as_product: true,
        product_price: Some(9.5),
        lead_time_mean_days: Some(6.0),
        lead_time_std_days: Some(1.0),
    };
    new_sku.validate().expect("sku payload should be valid");
    store::create_sku(owner, new_sku).expect("sku should be created");

    let snapshot = store::load_inventory(owner).expect("updated inventory should load");
    assert!(snapshot.skus.iter().any(|sku| sku.sku_id == "sku-777"));

    let reversed_ranking = snapshot
        .ranking
        .iter()
        .rev()
        .enumerate()
        .map(|(index, entry)| {
            let mut next = entry.clone();
            next.position = index;
            next
        })
        .collect();
    store::save_ranking(
        owner,
        SaveDesktopRankingRequest {
            entries: reversed_ranking,
        },
    )
    .expect("ranking should save");

    let settings = store::update_sist_settings(
        owner,
        UpdateSistSettingsRequest {
            target_service_level: 0.96,
            forecast_horizon_days: 21,
            particle_count: 640,
            smoothing_window_reports: 120,
        },
    )
    .expect("settings should update");
    assert_eq!(settings.forecast_horizon_days, 21);

    let raw = fs::read_to_string(&store_path).expect("store file should be written");
    assert!(raw.contains("\"schemaVersion\""));

    let _ = fs::remove_file(store_path);
    env::remove_var("BANJI_DESKTOP_DATA_PATH");
}

#[test]
fn desktop_core_lists_reports_newest_first() {
    let _guard = STORE_TEST_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let store_path = temp_store_path("report-history");
    env::set_var("BANJI_DESKTOP_DATA_PATH", &store_path);

    let owner = "desktop-owner";
    let snapshot = store::load_inventory(owner).expect("seeded inventory should load");
    let sku = snapshot
        .skus
        .first()
        .expect("seeded inventory should include at least one sku");

    store::submit_stock_report(
        owner,
        SubmitStockReportRequest {
            reported_at: "2026-03-25T09:00:00Z".to_string(),
            sku_observations: vec![StockReportSkuObservation {
                sku_id: sku.sku_id.clone(),
                units_in_stock: sku.units_in_stock + 1.0,
                cost_per_unit: sku.cost_per_unit,
                restock_included: false,
                retail_stockout: false,
                notes: Some("Early update".to_string()),
            }],
            service_signals: Vec::new(),
            service_price_adjustments: Vec::new(),
            top_service_ranking: Vec::new(),
            top_retail_ranking: Vec::new(),
            notes: Some("Earlier report".to_string()),
        },
    )
    .expect("earlier report should save");

    store::submit_stock_report(
        owner,
        SubmitStockReportRequest {
            reported_at: "2026-03-27T12:30:00Z".to_string(),
            sku_observations: Vec::new(),
            service_signals: Vec::new(),
            service_price_adjustments: vec![StockReportServicePriceAdjustment {
                service_id: snapshot.services[0].service_id.clone(),
                price: snapshot.services[0].price + 50.0,
            }],
            top_service_ranking: snapshot
                .services
                .iter()
                .take(1)
                .map(|service| service.service_id.clone())
                .collect(),
            top_retail_ranking: snapshot
                .skus
                .iter()
                .filter(|sku| sku.sold_as_product)
                .take(1)
                .map(|sku| sku.sku_id.clone())
                .collect(),
            notes: Some("Merchandising-only update".to_string()),
        },
    )
    .expect("later report should save");

    let reports = store::list_stock_reports(owner).expect("report history should load");
    assert!(reports.len() >= 3);
    let later_report = reports
        .iter()
        .find(|report| report.reported_at == "2026-03-27T12:30:00Z")
        .expect("later report should be present");
    assert_eq!(later_report.top_service_ranking.len(), 1);
    assert_eq!(later_report.service_price_adjustments.len(), 1);
    assert_eq!(later_report.sku_observations.len(), 0);
    assert!(reports
        .iter()
        .any(|report| report.reported_at == "2026-03-25T09:00:00Z"));

    let updated_snapshot = store::load_inventory(owner).expect("inventory should reflect service price edits");
    assert_eq!(
        updated_snapshot.services[0].price,
        snapshot.services[0].price + 50.0
    );

    let earlier_index = reports
        .iter()
        .position(|report| report.reported_at == "2026-03-25T09:00:00Z")
        .expect("earlier report should be present");
    let later_index = reports
        .iter()
        .position(|report| report.reported_at == "2026-03-27T12:30:00Z")
        .expect("later report should be present");
    assert!(later_index < earlier_index);

    let _ = fs::remove_file(store_path);
    env::remove_var("BANJI_DESKTOP_DATA_PATH");
}

#[test]
fn desktop_core_ignores_backfilled_service_price_when_newer_adjustment_exists() {
    let _guard = STORE_TEST_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let store_path = temp_store_path("service-price-ordering");
    env::set_var("BANJI_DESKTOP_DATA_PATH", &store_path);

    let owner = "desktop-owner";
    let snapshot = store::load_inventory(owner).expect("seeded inventory should load");
    let service = snapshot
        .services
        .first()
        .expect("seeded inventory should include at least one service");

    store::submit_stock_report(
        owner,
        SubmitStockReportRequest {
            reported_at: "2026-03-27T12:30:00Z".to_string(),
            sku_observations: Vec::new(),
            service_signals: Vec::new(),
            service_price_adjustments: vec![StockReportServicePriceAdjustment {
                service_id: service.service_id.clone(),
                price: service.price + 50.0,
            }],
            top_service_ranking: Vec::new(),
            top_retail_ranking: Vec::new(),
            notes: Some("Later price update".to_string()),
        },
    )
    .expect("later report should save");

    store::submit_stock_report(
        owner,
        SubmitStockReportRequest {
            reported_at: "2026-03-25T09:00:00Z".to_string(),
            sku_observations: Vec::new(),
            service_signals: Vec::new(),
            service_price_adjustments: vec![StockReportServicePriceAdjustment {
                service_id: service.service_id.clone(),
                price: service.price + 10.0,
            }],
            top_service_ranking: Vec::new(),
            top_retail_ranking: Vec::new(),
            notes: Some("Backfilled older price update".to_string()),
        },
    )
    .expect("backfilled report should save");

    let updated_snapshot =
        store::load_inventory(owner).expect("inventory should keep the newest service price");
    assert_eq!(updated_snapshot.services[0].price, service.price + 50.0);

    let _ = fs::remove_file(store_path);
    env::remove_var("BANJI_DESKTOP_DATA_PATH");
}

#[test]
fn desktop_core_exposes_rich_sist_details_and_settings_effects() {
    let _guard = STORE_TEST_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let store_path = temp_store_path("sist-details");
    env::set_var("BANJI_DESKTOP_DATA_PATH", &store_path);

    let owner = "desktop-owner";
    let snapshot = store::load_inventory(owner).expect("seeded inventory should load");
    let sku = snapshot
        .skus
        .iter()
        .find(|entry| entry.sold_as_product)
        .expect("seeded inventory should include a sellable sku");
    let service = snapshot
        .services
        .iter()
        .find(|entry| entry.sku_ids.contains(&sku.sku_id))
        .expect("seeded inventory should include a linked service");

    let baseline_detail = store::load_sku_detail(owner, &sku.sku_id).expect("sku detail should load");
    assert_eq!(
        baseline_detail.forecast_trajectory.len(),
        snapshot.sist.settings.forecast_horizon_days
    );
    assert!(!baseline_detail.posterior_inventory_trajectory.is_empty());
    assert!(!baseline_detail.interval_demand.is_empty());
    assert!(baseline_detail.reorder_policy.is_some());

    store::update_sist_settings(
        owner,
        UpdateSistSettingsRequest {
            target_service_level: 0.985,
            forecast_horizon_days: 9,
            particle_count: 1024,
            smoothing_window_reports: 30,
        },
    )
    .expect("settings should update");

    let updated_detail = store::load_sku_detail(owner, &sku.sku_id).expect("updated sku detail should load");
    assert_eq!(updated_detail.forecast_trajectory.len(), 9);
    assert!(
        updated_detail
            .reorder_policy
            .as_ref()
            .expect("reorder policy should exist")
            .reorder_point
            >= baseline_detail
                .reorder_policy
                .as_ref()
                .expect("baseline reorder policy should exist")
                .reorder_point
    );

    let service_detail =
        store::load_service_detail(owner, &service.service_id).expect("service detail should load");
    assert_eq!(service_detail.service_id, service.service_id);
    assert_eq!(service_detail.viability_forecast.len(), 9);
    assert!(!service_detail.contributors.is_empty());

    let system_detail = store::load_system_detail(owner).expect("system detail should load");
    assert_eq!(system_detail.model_health.interval_count, system_detail.regime_posterior_history.len());
    assert_eq!(
        system_detail
            .metadata
            .as_ref()
            .expect("metadata should exist")
            .effective_smoothing_window_used,
        30
    );
    assert!(system_detail.model_health.particle_count_used >= 64);

    let _ = fs::remove_file(store_path);
    env::remove_var("BANJI_DESKTOP_DATA_PATH");
}

#[test]
fn desktop_core_repairs_incomplete_sist_cache_on_load() {
    let _guard = STORE_TEST_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let store_path = temp_store_path("sist-cache-repair");
    env::set_var("BANJI_DESKTOP_DATA_PATH", &store_path);

    let owner = "desktop-owner";
    let snapshot = store::load_inventory(owner).expect("seeded inventory should load");
    let sku = snapshot
        .skus
        .iter()
        .find(|entry| entry.sold_as_product)
        .expect("seeded inventory should include a sellable sku");

    let mut raw_store = read_store_json(&store_path);
    {
        let sist = owner_sist_mut(&mut raw_store, owner);
        sist.insert("schemaVersion".to_string(), json!(2));
        let cached = sist
            .get_mut("cachedAnalysis")
            .and_then(Value::as_object_mut)
            .expect("cached analysis should exist");
        cached.insert("skuDetails".to_string(), json!({}));
        cached.insert("serviceDetails".to_string(), json!({}));
        cached.insert(
            "systemDetail".to_string(),
            json!({
                "intervalTimeline": [],
                "regimePosteriorHistory": [],
                "signalIntake": {
                    "rankingObservations": 0,
                    "restockFlags": 0,
                    "stockoutFlags": 0,
                    "priceAdjustments": 0,
                    "correctionSignals": 0
                },
                "modelHealth": {
                    "particleCountUsed": 0,
                    "intervalCount": 0,
                    "effectiveSampleSizeMean": 0.0,
                    "confidence": "low"
                },
                "topRiskyEntities": [],
                "driftDiagnostics": {
                    "seasonalityActive": false,
                    "changePointActive": false,
                    "recentChangePointProbability": 0.0,
                    "serviceDriftScale": 0.0,
                    "retailDriftScale": 0.0
                },
                "metadata": null
            }),
        );
    }
    write_store_json(&store_path, &raw_store);

    let repaired_snapshot = store::load_inventory(owner).expect("inventory load should repair sist cache");
    assert!(!repaired_snapshot.sist.sku_insights.is_empty());

    let repaired_system_detail =
        store::load_system_detail(owner).expect("system detail should load after repair");
    assert!(!repaired_system_detail.interval_timeline.is_empty());
    assert!(!repaired_system_detail.top_risky_entities.is_empty());
    assert!(repaired_system_detail.metadata.is_some());

    let repaired_sku_detail =
        store::load_sku_detail(owner, &sku.sku_id).expect("sku detail should load after repair");
    assert!(!repaired_sku_detail.posterior_inventory_trajectory.is_empty());
    assert!(!repaired_sku_detail.forecast_trajectory.is_empty());

    let repaired_store = read_store_json(&store_path);
    let repaired_sist = repaired_store
        .get("owners")
        .and_then(Value::as_object)
        .and_then(|owners| owners.get(owner))
        .and_then(Value::as_object)
        .and_then(|owner_value| owner_value.get("sist"))
        .and_then(Value::as_object)
        .expect("repaired sist payload should exist");
    assert_eq!(
        repaired_sist
            .get("schemaVersion")
            .and_then(Value::as_u64)
            .expect("schema version should persist"),
        2
    );
    let repaired_cached = repaired_sist
        .get("cachedAnalysis")
        .and_then(Value::as_object)
        .expect("repaired cache should exist");
    assert!(
        repaired_cached
            .get("skuDetails")
            .and_then(Value::as_object)
            .expect("sku details should persist")
            .contains_key(&sku.sku_id)
    );
    assert!(
        repaired_cached
            .get("serviceDetails")
            .and_then(Value::as_object)
            .expect("service details should persist")
            .len()
            == repaired_snapshot.services.len()
    );
    assert!(
        repaired_cached
            .get("systemDetail")
            .and_then(Value::as_object)
            .and_then(|detail| detail.get("metadata"))
            .is_some()
    );

    let _ = fs::remove_file(store_path);
    env::remove_var("BANJI_DESKTOP_DATA_PATH");
}

#[test]
fn desktop_core_rebuilds_sist_cache_when_schema_version_is_stale() {
    let _guard = STORE_TEST_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let store_path = temp_store_path("sist-schema-migration");
    env::set_var("BANJI_DESKTOP_DATA_PATH", &store_path);

    let owner = "desktop-owner";
    let snapshot = store::load_inventory(owner).expect("seeded inventory should load");
    let sku = snapshot
        .skus
        .iter()
        .find(|entry| entry.sold_as_product)
        .expect("seeded inventory should include a sellable sku");

    let mut raw_store = read_store_json(&store_path);
    {
        let sist = owner_sist_mut(&mut raw_store, owner);
        sist.insert("schemaVersion".to_string(), json!(1));
        let cached = sist
            .get_mut("cachedAnalysis")
            .and_then(Value::as_object_mut)
            .expect("cached analysis should exist");
        cached.insert("skuDetails".to_string(), json!({}));
        cached.insert("serviceDetails".to_string(), json!({}));
    }
    write_store_json(&store_path, &raw_store);

    let migrated_snapshot = store::load_inventory(owner).expect("inventory load should migrate schema");
    assert!(!migrated_snapshot.sist.sku_insights.is_empty());
    let migrated_sku_detail =
        store::load_sku_detail(owner, &sku.sku_id).expect("sku detail should load after migration");
    assert!(!migrated_sku_detail.forecast_trajectory.is_empty());
    let migrated_system_detail =
        store::load_system_detail(owner).expect("system detail should load after migration");
    assert!(migrated_system_detail.metadata.is_some());

    let migrated_store = read_store_json(&store_path);
    let migrated_sist = migrated_store
        .get("owners")
        .and_then(Value::as_object)
        .and_then(|owners| owners.get(owner))
        .and_then(Value::as_object)
        .and_then(|owner_value| owner_value.get("sist"))
        .and_then(Value::as_object)
        .expect("migrated sist payload should exist");
    assert_eq!(
        migrated_sist
            .get("schemaVersion")
            .and_then(Value::as_u64)
            .expect("schema version should persist"),
        2
    );

    let _ = fs::remove_file(store_path);
    env::remove_var("BANJI_DESKTOP_DATA_PATH");
}

#[test]
fn desktop_core_read_only_sist_queries_do_not_rewrite_a_valid_store() {
    let _guard = STORE_TEST_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let store_path = temp_store_path("sist-read-no-rewrite");
    env::set_var("BANJI_DESKTOP_DATA_PATH", &store_path);

    let owner = "desktop-owner";
    let snapshot = store::load_inventory(owner).expect("seeded inventory should load");
    let sku = snapshot
        .skus
        .iter()
        .find(|entry| entry.sold_as_product)
        .expect("seeded inventory should include a sellable sku");

    let before = fs::metadata(&store_path)
        .expect("store file should exist after load")
        .modified()
        .expect("store file should expose a modification time");

    sleep(Duration::from_millis(20));

    let _ = store::list_stock_reports(owner).expect("report history should load");
    let _ = store::load_system_detail(owner).expect("system detail should load");
    let _ = store::load_sku_detail(owner, &sku.sku_id).expect("sku detail should load");

    let after = fs::metadata(&store_path)
        .expect("store file should still exist")
        .modified()
        .expect("store file should expose a modification time");
    assert_eq!(after, before);

    let _ = fs::remove_file(store_path);
    env::remove_var("BANJI_DESKTOP_DATA_PATH");
}
