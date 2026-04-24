use banji_desktop_core::store;
use banji_sena_core::{
    fingerprint_catalog, SenaCatalog, SenaObservationInput, SenaRepository, SqliteSenaRepository,
};
use futures::executor::block_on;
use serde_json::json;
use std::{
    env,
    path::PathBuf,
    sync::{Mutex, OnceLock},
    time::{SystemTime, UNIX_EPOCH},
};

fn env_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

fn temp_store_path(label: &str) -> PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time should be after epoch")
        .as_nanos();
    env::temp_dir().join(format!("banji-sena-{label}-{nonce}.sqlite3"))
}

fn reset_benchmark_env() {
    env::remove_var("BANJI_BENCHMARK");
    env::remove_var("BANJI_BENCHMARK_RUN_ID");
    env::remove_var("BANJI_BENCHMARK_OUTPUT_DIR");
    env::remove_var("BANJI_CORE_WORKER_ROLE");
    env::remove_var("BANJI_CORE_WORKER_INDEX");
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
    let _guard = env_lock().lock().expect("env lock should acquire");
    let store_path = temp_store_path("summary");
    env::set_var("BANJI_DESKTOP_DATA_PATH", &store_path);

    store::upsert_catalog(store::default_owner(), &sample_catalog()).expect("catalog should save");
    store::ingest_observation(
        store::default_owner(),
        &observation("2026-04-01T00:00:00Z", 24.0, 18.0),
    )
    .expect("first observation should save");
    store::ingest_observation(
        store::default_owner(),
        &observation("2026-04-08T00:00:00Z", 15.0, 11.0),
    )
    .expect("second observation should save");
    let run = store::trigger_run(store::default_owner(), "sena-analysis-v3")
        .expect("run should complete");
    assert_eq!(run.algorithm_version, "sena-analysis-v3");

    let summary = store::get_workspace_summary(store::default_owner())
        .expect("summary load should succeed")
        .expect("summary should exist");
    assert_eq!(summary.sku_count, 2);
    assert_eq!(summary.service_count, 1);
    assert!(summary.interval_count >= 1);
    assert_eq!(summary.sku_summaries.len(), 2);
}

#[test]
fn desktop_core_exposes_sku_service_and_diagnostics_reads() {
    let _guard = env_lock().lock().expect("env lock should acquire");
    let store_path = temp_store_path("details");
    env::set_var("BANJI_DESKTOP_DATA_PATH", &store_path);

    store::upsert_catalog(store::default_owner(), &sample_catalog()).expect("catalog should save");
    store::ingest_observation(
        store::default_owner(),
        &observation("2026-04-01T00:00:00Z", 30.0, 22.0),
    )
    .expect("first observation should save");
    store::ingest_observation(
        store::default_owner(),
        &observation("2026-04-10T00:00:00Z", 9.0, 7.0),
    )
    .expect("second observation should save");
    let run = store::trigger_run(store::default_owner(), "sena-analysis-v3")
        .expect("run should complete");

    let sku_detail = store::get_sku_detail(store::default_owner(), "sku-001", None, 20)
        .expect("sku detail should load")
        .expect("sku detail should exist");
    assert!(!sku_detail.detail.inventory_posterior.is_empty());
    assert!(!sku_detail.detail.pipeline_posterior.is_empty());

    let service_detail = store::get_service_detail(store::default_owner(), "service-001", None, 20)
        .expect("service detail should load")
        .expect("service detail should exist");
    assert!(!service_detail.detail.contributors.is_empty());

    let diagnostics = store::get_diagnostics(store::default_owner())
        .expect("diagnostics should load")
        .expect("diagnostics should exist");
    assert!(diagnostics.effective_sample_size_mean > 0.0);
    assert!(!diagnostics.regime_history.is_empty());

    let run_status = store::get_run(&run.run_id)
        .expect("run status should load")
        .expect("run should exist");
    assert_eq!(
        run_status.primary_artifact_key.as_deref(),
        Some("sena-analysis/desktop-owner/sena-analysis-v3/posterior-draws")
    );
}

#[test]
fn desktop_core_records_service_detail_benchmark_events() {
    let _guard = env_lock().lock().expect("env lock should acquire");
    let store_path = temp_store_path("service-detail-benchmark");
    let output_path = temp_store_path("service-detail-events");
    let _ = std::fs::remove_dir_all(&output_path);
    env::set_var("BANJI_DESKTOP_DATA_PATH", &store_path);
    reset_benchmark_env();
    env::set_var("BANJI_BENCHMARK", "1");
    env::set_var("BANJI_BENCHMARK_RUN_ID", "service-detail-test");
    env::set_var("BANJI_BENCHMARK_OUTPUT_DIR", &output_path);
    env::set_var("BANJI_CORE_WORKER_ROLE", "writer");
    env::set_var("BANJI_CORE_WORKER_INDEX", "0");

    store::upsert_catalog(store::default_owner(), &sample_catalog()).expect("catalog should save");
    store::ingest_observation(
        store::default_owner(),
        &observation("2026-04-01T00:00:00Z", 30.0, 22.0),
    )
    .expect("first observation should save");
    store::ingest_observation(
        store::default_owner(),
        &observation("2026-04-10T00:00:00Z", 9.0, 7.0),
    )
    .expect("second observation should save");
    store::trigger_run(store::default_owner(), "sena-analysis-v3")
        .expect("run should complete");

    let detail = store::get_service_detail(store::default_owner(), "service-001", None, 20)
        .expect("service detail should load")
        .expect("service detail should exist");
    assert!(!detail.detail.contributors.is_empty());

    let events = std::fs::read_dir(&output_path)
        .expect("event output directory should exist")
        .collect::<Result<Vec<_>, _>>()
        .expect("event files should be readable")
        .into_iter()
        .flat_map(|entry| {
            std::fs::read_to_string(entry.path())
                .expect("event stream should read")
                .lines()
                .map(str::to_owned)
                .collect::<Vec<_>>()
        })
        .map(|line| serde_json::from_str::<serde_json::Value>(&line).expect("event should parse"))
        .collect::<Vec<_>>();
    let event_names = events
        .iter()
        .filter_map(|event| event.get("name").and_then(|name| name.as_str()))
        .collect::<Vec<_>>();
    assert!(event_names.contains(&"core.service-detail.store.load"));
    assert!(event_names.contains(&"core.service-detail.store.page"));
    assert!(event_names.contains(&"core.service-detail.sqlite.query"));
    assert!(event_names.contains(&"core.service-detail.sqlite.deserialize"));

    reset_benchmark_env();
    let _ = std::fs::remove_dir_all(&output_path);
}

#[test]
fn desktop_core_dev_seed_is_idempotent_and_populates_workspace() {
    let _guard = env_lock().lock().expect("env lock should acquire");
    let store_path = temp_store_path("seeded-dev");
    env::set_var("BANJI_DESKTOP_DATA_PATH", &store_path);

    let seeded = store::ensure_dev_seed(store::default_owner()).expect("seed should succeed");
    assert!(seeded);

    let catalog = store::get_catalog(store::default_owner())
        .expect("catalog load should succeed")
        .expect("catalog should exist");
    assert_eq!(catalog.skus.len(), 10);
    assert_eq!(catalog.services.len(), 10);
    assert!(catalog.bundles.len() >= 4);

    let observations =
        store::list_observations(store::default_owner()).expect("observations load should succeed");
    assert_eq!(observations.len(), 30);
    assert!(observations
        .iter()
        .any(|observation| observation.input.regime_hint.is_some()));
    assert!(observations
        .iter()
        .any(|observation| !observation.input.recipe_usage_hints.is_empty()));
    assert!(observations
        .iter()
        .any(|observation| !observation.input.adjustment_signals.is_empty()));
    assert!(observations.iter().any(|observation| {
        observation
            .input
            .order_signals
            .iter()
            .any(|signal| signal.order_placed && !signal.receipt_arrived)
    }));

    let summary = store::get_workspace_summary(store::default_owner())
        .expect("summary should load")
        .expect("summary should exist");
    assert_eq!(summary.sku_count, 10);
    assert_eq!(summary.service_count, 10);
    assert_eq!(summary.interval_count, 29);
    assert!(summary
        .sku_summaries
        .iter()
        .all(|sku| sku.latest_posterior_units.is_finite() && sku.latest_posterior_units <= 500.0));
    assert!(summary
        .sku_summaries
        .iter()
        .all(|sku| sku.demand_per_day_mean.is_finite() && sku.demand_per_day_mean <= 50.0));

    let seeded_again =
        store::ensure_dev_seed(store::default_owner()).expect("second seed should succeed");
    assert!(!seeded_again);
}

#[test]
fn desktop_core_append_only_rerun_keeps_checkpoint_state_available() {
    let _guard = env_lock().lock().expect("env lock should acquire");
    let store_path = temp_store_path("append-rerun");
    env::set_var("BANJI_DESKTOP_DATA_PATH", &store_path);

    let catalog = sample_catalog();
    store::upsert_catalog(store::default_owner(), &catalog).expect("catalog should save");
    for (at, sku1, sku2) in [
        ("2026-04-01T00:00:00Z", 28.0, 19.0),
        ("2026-04-02T00:00:00Z", 26.0, 18.0),
        ("2026-04-03T00:00:00Z", 24.0, 17.0),
        ("2026-04-04T00:00:00Z", 22.0, 16.0),
        ("2026-04-05T00:00:00Z", 20.0, 15.0),
        ("2026-04-06T00:00:00Z", 18.0, 14.0),
        ("2026-04-07T00:00:00Z", 16.0, 13.0),
        ("2026-04-08T00:00:00Z", 14.0, 12.0),
        ("2026-04-09T00:00:00Z", 12.0, 10.0),
    ] {
        store::ingest_observation(store::default_owner(), &observation(at, sku1, sku2))
            .expect("observation should save");
    }

    store::trigger_run(store::default_owner(), "sena-analysis-v3")
        .expect("first run should complete");

    let repo = SqliteSenaRepository::open(&store_path).expect("repo should open");
    let checkpoints = block_on(repo.list_analysis_checkpoints(
        store::default_owner(),
        "sena-analysis-v3",
        &fingerprint_catalog(&catalog).expect("catalog fingerprint should compute"),
    ))
    .expect("checkpoints should load");
    assert!(checkpoints
        .iter()
        .any(|checkpoint| checkpoint.metadata.completed_interval_count == 8));

    store::ingest_observation(
        store::default_owner(),
        &observation("2026-04-10T00:00:00Z", 10.0, 8.0),
    )
    .expect("appended observation should save");
    let second_run = store::trigger_run(store::default_owner(), "sena-analysis-v3")
        .expect("second run should complete");
    assert_eq!(second_run.observation_count, 10);

    let summary = store::get_workspace_summary(store::default_owner())
        .expect("summary should load")
        .expect("summary should exist");
    assert_eq!(summary.interval_count, 9);
}

#[test]
fn desktop_core_updates_and_deletes_observations() {
    let _guard = env_lock().lock().expect("env lock should acquire");
    let store_path = temp_store_path("mutate-observation");
    env::set_var("BANJI_DESKTOP_DATA_PATH", &store_path);

    store::upsert_catalog(store::default_owner(), &sample_catalog()).expect("catalog should save");
    let inserted = store::ingest_observation(
        store::default_owner(),
        &observation("2026-04-01T00:00:00Z", 24.0, 18.0),
    )
    .expect("observation should save");

    let mut updated = inserted.input.clone();
    updated.notes = Some("Edited observation".to_string());
    updated.observed_at = "2026-04-02T00:00:00Z".to_string();
    store::update_observation(store::default_owner(), &inserted.observation_id, &updated)
        .expect("observation should update");

    let observations =
        store::list_observations(store::default_owner()).expect("observations load should succeed");
    assert_eq!(observations.len(), 1);
    assert_eq!(observations[0].input.notes.as_deref(), Some("Edited observation"));
    assert_eq!(observations[0].observation_id, inserted.observation_id);

    store::delete_observation(store::default_owner(), &inserted.observation_id)
        .expect("observation should delete");
    let remaining =
        store::list_observations(store::default_owner()).expect("observations load should succeed");
    assert!(remaining.is_empty());
}
