use banji_desktop_core::store;
use banji_sena_core::{SenaCatalog, SenaObservationInput};
use serde_json::json;
use std::{env, path::PathBuf, time::{SystemTime, UNIX_EPOCH}};

fn temp_store_path(label: &str) -> PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time should be after epoch")
        .as_nanos();
    env::temp_dir().join(format!("banji-sena-{label}-{nonce}.sqlite3"))
}

fn sample_catalog() -> SenaCatalog {
    serde_json::from_value(json!({
        "schemaVersion": 1,
        "skus": [
            {
                "skuId": "sku-001",
                "name": "Bangkok Tee",
                "description": "Core retail tee",
                "costPerUnit": 4.2,
                "soldAsProduct": true,
                "productPrice": 11.0,
                "leadTimeMeanDaysHint": 7.0,
                "leadTimeStdDaysHint": 2.0
            },
            {
                "skuId": "sku-002",
                "name": "Linen Pants",
                "description": "Core pants",
                "costPerUnit": 6.5,
                "soldAsProduct": false,
                "productPrice": null,
                "leadTimeMeanDaysHint": 9.0,
                "leadTimeStdDaysHint": 3.0
            }
        ],
        "services": [
            {
                "serviceId": "service-001",
                "name": "Weekend Set",
                "description": "Promo set",
                "price": 24.0,
                "bundle": true
            }
        ],
        "bundles": [
            {
                "bundleId": "bundle-001",
                "serviceId": "service-001",
                "name": "Weekend Set"
            }
        ],
        "sharingMask": [
            {
                "serviceId": "service-001",
                "skuId": "sku-001",
                "enabled": true,
                "usageProbability": 0.95
            },
            {
                "serviceId": "service-001",
                "skuId": "sku-002",
                "enabled": true,
                "usageProbability": 0.70
            }
        ]
    }))
    .expect("sample catalog should parse")
}

fn observation(at: &str, sku1: f64, sku2: f64) -> SenaObservationInput {
    serde_json::from_value(json!({
        "observedAt": at,
        "stockSnapshot": [
            {"skuId": "sku-001", "unitsInStock": sku1, "costPerUnit": 4.2, "productPrice": 11.0},
            {"skuId": "sku-002", "unitsInStock": sku2, "costPerUnit": 6.5, "productPrice": null}
        ],
        "serviceRankings": ["service-001"],
        "retailRankings": ["sku-001"],
        "serviceStockouts": [],
        "retailStockouts": [],
        "orderSignals": [],
        "servicePrices": [{"serviceId": "service-001", "price": 24.0}],
        "retailPrices": [{"skuId": "sku-001", "price": 11.0}],
        "leadTimeHints": [{"skuId": "sku-001", "typicalDays": 7.0, "lowDays": 5.0, "highDays": 9.0}]
    }))
    .expect("observation should parse")
}

#[test]
fn desktop_core_runs_sena_analysis_and_reads_summary() {
    let store_path = temp_store_path("summary");
    env::set_var("BANJI_DESKTOP_DATA_PATH", &store_path);

    store::upsert_catalog(store::default_owner(), &sample_catalog()).expect("catalog should save");
    store::ingest_observation(store::default_owner(), &observation("2026-04-01T00:00:00Z", 24.0, 18.0))
        .expect("first observation should save");
    store::ingest_observation(store::default_owner(), &observation("2026-04-08T00:00:00Z", 15.0, 11.0))
        .expect("second observation should save");
    let run = store::trigger_run(store::default_owner(), "sena-analysis-v1")
        .expect("run should complete");
    assert_eq!(run.algorithm_version, "sena-analysis-v1");

    let summary = store::get_workspace_summary(store::default_owner())
        .expect("summary load should succeed")
        .expect("summary should exist");
    assert_eq!(summary.sku_count, 2);
    assert_eq!(summary.service_count, 1);
    assert_eq!(summary.interval_count, 1);
    assert_eq!(summary.sku_summaries.len(), 2);
}

#[test]
fn desktop_core_exposes_sku_service_and_diagnostics_reads() {
    let store_path = temp_store_path("details");
    env::set_var("BANJI_DESKTOP_DATA_PATH", &store_path);

    store::upsert_catalog(store::default_owner(), &sample_catalog()).expect("catalog should save");
    store::ingest_observation(store::default_owner(), &observation("2026-04-01T00:00:00Z", 30.0, 22.0))
        .expect("first observation should save");
    store::ingest_observation(store::default_owner(), &observation("2026-04-10T00:00:00Z", 9.0, 7.0))
        .expect("second observation should save");
    let run = store::trigger_run(store::default_owner(), "sena-analysis-v2")
        .expect("run should complete");

    let sku_detail = store::get_sku_detail(store::default_owner(), "sku-001")
        .expect("sku detail should load")
        .expect("sku detail should exist");
    assert!(!sku_detail.inventory_posterior.is_empty());
    assert!(!sku_detail.pipeline_posterior.is_empty());

    let service_detail = store::get_service_detail(store::default_owner(), "service-001")
        .expect("service detail should load")
        .expect("service detail should exist");
    assert!(!service_detail.contributors.is_empty());

    let diagnostics = store::get_diagnostics(store::default_owner())
        .expect("diagnostics should load")
        .expect("diagnostics should exist");
    assert!(diagnostics.effective_sample_size_mean > 0.0);
    assert!(diagnostics.smoothing_enabled);

    let run_status = store::get_run(&run.run_id)
        .expect("run status should load")
        .expect("run should exist");
    assert_eq!(run_status.primary_artifact_key.as_deref(), Some("sena-analysis/desktop-owner/sena-analysis-v2/posterior-draws"));
}
