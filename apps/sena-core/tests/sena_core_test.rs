use banji_sena_core::{
    assign_receipt_quantity, build_intervals, normal_quantile, reorder_point_quantile,
    update_pipeline_units, update_time_since_last_order_days, MemorySenaStore,
    SenaObservationRecord, SenaRepository, SenaService, SenaServiceRecipeLink, SenaSku,
    SqliteSenaStore,
};
use std::{env, fs};

fn sample_sku() -> SenaSku {
    SenaSku {
        sku_id: "sku-1".to_string(),
        name: "SKU 1".to_string(),
        description: "Primary SKU".to_string(),
        sold_as_product: true,
        units_per_retail_sale: 1.0,
        current_stock_units: 20.0,
        reorder_target_service_level: 0.95,
        default_lead_time_days: Some(4.0),
        default_lead_time_variability: Some(1.0),
    }
}

fn sample_service() -> SenaService {
    SenaService {
        service_id: "service-1".to_string(),
        name: "Service 1".to_string(),
        description: "Primary service".to_string(),
        base_price: 20.0,
        recipe_links: vec![SenaServiceRecipeLink {
            sku_id: "sku-1".to_string(),
            usage_probability: 0.8,
        }],
        is_bundle: false,
    }
}

fn sample_observation(
    observation_id: &str,
    reported_at: &str,
    units: f64,
) -> SenaObservationRecord {
    SenaObservationRecord {
        observation_id: observation_id.to_string(),
        reported_at: reported_at.to_string(),
        sku_snapshots: vec![banji_sena_core::SenaSkuSnapshot {
            sku_id: "sku-1".to_string(),
            units_in_stock: units,
        }],
        top_service_ranking: vec!["service-1".to_string()],
        top_retail_ranking: vec!["sku-1".to_string()],
        service_stockouts: vec![],
        retail_stockouts: vec![],
        order_events: vec![banji_sena_core::SenaOrderEventInput {
            sku_id: "sku-1".to_string(),
            order_placed: true,
            order_received: false,
            placed_quantity: Some(5.0),
            received_quantity: None,
        }],
        service_prices: vec![],
        retail_prices: vec![],
        lead_time_hints: vec![banji_sena_core::SenaLeadTimeHint {
            sku_id: "sku-1".to_string(),
            typical_days: Some(4.0),
            low_days: Some(3.0),
            high_days: Some(5.0),
        }],
        notes: None,
    }
}

#[test]
fn normalization_helpers_cover_pipeline_and_reorder_math() {
    assert_eq!(update_pipeline_units(3.0, 5.0, 4.0), 4.0);
    assert_eq!(update_time_since_last_order_days(2.0, 3.0, false), 5.0);
    assert_eq!(update_time_since_last_order_days(2.0, 3.0, true), 0.0);
    assert_eq!(assign_receipt_quantity(None, 2.0, 1.0, 3.0), 3.0);
    assert!(normal_quantile(0.95) > 1.6);
    let (reorder_point, safety_stock) = reorder_point_quantile(0.95, 2.0, 0.5, 4.0, 1.0);
    assert!(reorder_point > 8.0);
    assert!(safety_stock > 0.0);
}

#[test]
fn build_intervals_tracks_demand_and_pipeline() {
    let intervals = build_intervals(
        &[sample_sku()],
        &[
            sample_observation("obs-1", "2026-04-01T09:00:00Z", 14.0),
            sample_observation("obs-2", "2026-04-02T09:00:00Z", 9.0),
        ],
    )
    .expect("intervals should build");
    assert_eq!(intervals.len(), 2);
    assert!(
        intervals[1]
            .demand_by_sku
            .get("sku-1")
            .copied()
            .expect("demand should exist")
            >= 0.0
    );
}

#[test]
fn memory_and_sqlite_stores_round_trip_same_workspace_shape() {
    let owner = "owner-1";
    let memory = MemorySenaStore::default();

    let temp_path = env::temp_dir().join(format!(
        "banji-sena-core-parity-{}-{}.sqlite3",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("time should work")
            .as_nanos()
    ));
    let sqlite = SqliteSenaStore::open(&temp_path).expect("sqlite store should open");

    for store in [
        &memory as &dyn SenaRepository,
        &sqlite as &dyn SenaRepository,
    ] {
        store
            .upsert_sku(owner, sample_sku())
            .expect("sku should save");
        store
            .upsert_service(owner, sample_service())
            .expect("service should save");
        store
            .append_observation(
                owner,
                sample_observation("obs-1", "2026-04-01T09:00:00Z", 12.0),
            )
            .expect("observation should save");
    }

    let memory_workspace = memory
        .load_workspace_data(owner)
        .expect("memory workspace should load");
    let sqlite_workspace = sqlite
        .load_workspace_data(owner)
        .expect("sqlite workspace should load");

    assert_eq!(memory_workspace.skus.len(), sqlite_workspace.skus.len());
    assert_eq!(
        memory_workspace.services.len(),
        sqlite_workspace.services.len()
    );
    assert_eq!(
        memory_workspace.observations.len(),
        sqlite_workspace.observations.len()
    );

    let _ = fs::remove_file(temp_path);
}
