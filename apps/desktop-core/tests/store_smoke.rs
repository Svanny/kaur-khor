use banji_desktop_core::{
    store,
    types::{
        SaveDesktopRankingRequest, StockReportServicePriceAdjustment, StockReportSkuObservation,
        SubmitStockReportRequest, UpdateSistSettingsRequest, UpsertDesktopSkuRequest,
    },
};
use std::{env, fs, path::PathBuf, sync::Mutex};

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
