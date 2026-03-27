use banji_desktop_core::{
    store,
    types::{SaveDesktopRankingRequest, UpdateSistSettingsRequest, UpsertDesktopSkuRequest},
};
use std::{env, fs, path::PathBuf};

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
