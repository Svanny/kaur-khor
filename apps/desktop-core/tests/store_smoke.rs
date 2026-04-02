use banji_desktop_core::{
    service,
    types::{
        SenaObservationIngestRequest, SenaServiceMaskUpdateRequest, SenaUpsertServiceRequest,
        SenaUpsertSkuRequest,
    },
};
use std::{env, fs, path::PathBuf, sync::Mutex};

static STORE_TEST_LOCK: Mutex<()> = Mutex::new(());

fn temp_store_path(test_name: &str) -> PathBuf {
    let unique = format!(
        "banji-sena-core-{test_name}-{}-{}.sqlite3",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system time should be valid")
            .as_nanos()
    );
    env::temp_dir().join(unique)
}

#[test]
fn desktop_core_supports_sena_catalog_and_analysis_flow() {
    let _guard = STORE_TEST_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let store_path = temp_store_path("smoke");
    env::set_var("BANJI_SENA_DATA_PATH", &store_path);

    let owner = "desktop-owner";
    let sku = service::upsert_sku(
        owner,
        SenaUpsertSkuRequest {
            sku_id: "sku-777".to_string(),
            name: "SKU #777".to_string(),
            description: "New SENA sku".to_string(),
            sold_as_product: true,
            units_per_retail_sale: 1.0,
            current_stock_units: 22.0,
            reorder_target_service_level: 0.96,
            default_lead_time_days: Some(6.0),
            default_lead_time_variability: Some(1.0),
        },
    )
    .expect("sku should upsert");
    assert_eq!(sku.sku_id, "sku-777");

    let service_record = service::upsert_service(
        owner,
        SenaUpsertServiceRequest {
            service_id: "service-777".to_string(),
            name: "Bundle 777".to_string(),
            description: "SENA service".to_string(),
            base_price: 18.0,
            recipe_links: vec![],
            is_bundle: true,
        },
    )
    .expect("service should upsert");
    assert_eq!(service_record.service_id, "service-777");

    let service_record = service::update_service_mask(
        owner,
        SenaServiceMaskUpdateRequest {
            service_id: "service-777".to_string(),
            recipe_links: vec![banji_desktop_core::types::SenaServiceRecipeLink {
                sku_id: "sku-777".to_string(),
                usage_probability: 0.9,
            }],
        },
    )
    .expect("service mask should update");
    assert_eq!(service_record.recipe_links.len(), 1);

    service::record_observation(
        owner,
        SenaObservationIngestRequest {
            observation_id: "obs-777".to_string(),
            reported_at: "2026-04-02T12:00:00Z".to_string(),
            sku_snapshots: vec![banji_desktop_core::types::SenaSkuSnapshot {
                sku_id: "sku-777".to_string(),
                units_in_stock: 8.0,
            }],
            top_service_ranking: vec!["service-777".to_string()],
            top_retail_ranking: vec!["sku-777".to_string()],
            service_stockouts: vec!["service-777".to_string()],
            retail_stockouts: vec!["sku-777".to_string()],
            order_events: vec![banji_desktop_core::types::SenaOrderEventInput {
                sku_id: "sku-777".to_string(),
                order_placed: true,
                order_received: false,
                placed_quantity: Some(6.0),
                received_quantity: None,
            }],
            service_prices: vec![],
            retail_prices: vec![],
            lead_time_hints: vec![banji_desktop_core::types::SenaLeadTimeHint {
                sku_id: "sku-777".to_string(),
                typical_days: Some(5.0),
                low_days: Some(4.0),
                high_days: Some(8.0),
            }],
            notes: Some("desktop-core SENA report".to_string()),
        },
    )
    .expect("observation should save");

    let run = service::trigger_analysis(owner).expect("analysis should run");
    assert_eq!(run.observation_count, 1);

    let workspace = service::load_workspace(owner).expect("workspace should load");
    assert_eq!(workspace.skus.len(), 1);
    assert_eq!(workspace.services.len(), 1);
    assert_eq!(workspace.observations.len(), 1);
    assert_eq!(workspace.pending_reorder_count, 1);

    let sku_posterior =
        service::load_sku_posterior(owner, "sku-777").expect("sku posterior should load");
    assert_eq!(sku_posterior.sku_id, "sku-777");
    assert!(sku_posterior.reorder_policy.reorder_point > 0.0);

    let diagnostics = service::load_diagnostics(owner).expect("diagnostics should load");
    assert_eq!(diagnostics.observation_count, 1);

    let _ = fs::remove_file(store_path);
    env::remove_var("BANJI_SENA_DATA_PATH");
}
