use banji_api::{
    app_with_state, build_state,
    config::{AppConfig, DatabaseRuntimeEndpointKind},
};
use once_cell::sync::Lazy;
use reqwest::{Client, StatusCode};
use serde_json::json;
use std::{
    env,
    sync::Mutex,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

static SENA_STORE_ENV_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));

fn base_config() -> AppConfig {
    AppConfig {
        app_role: banji_api::config::AppRole::Api,
        system: "banji-core".to_string(),
        env: "dev".to_string(),
        service: "api".to_string(),
        instance_id: "api-sena-test-1".to_string(),
        auth_enabled: false,
        auth_jwks_url: None,
        auth_issuer: None,
        auth_audience: None,
        auth_jwks_cache_ttl: Duration::from_secs(300),
        auth_jwks_timeout: Duration::from_millis(1000),
        auth_clock_skew: Duration::from_secs(30),
        idempotency_retention_days: 30,
        cache_enabled: false,
        cache_schema_version: "v1".to_string(),
        cache_default_ttl: Duration::from_secs(300),
        cache_ttl_jitter: Duration::from_secs(30),
        redis_connect_timeout: Duration::from_millis(50),
        redis_command_timeout: Duration::from_millis(50),
        redis_circuit_error_threshold: 2,
        redis_circuit_window: Duration::from_secs(3),
        redis_circuit_cooldown: Duration::from_secs(3),
        redis_log_rate_limit: Duration::from_secs(1),
        event_payload_max_bytes: 65_536,
        event_relay_batch_size: 100,
        event_relay_poll_interval: Duration::from_millis(500),
        event_relay_retry_backoff: Duration::from_millis(1_000),
        event_relay_max_backoff: Duration::from_millis(60_000),
        event_relay_block_after_attempts: 25,
        event_outbox_published_retention_days: 7,
        rabbit_url: None,
        rabbit_vhost: "/".to_string(),
        rabbit_exchange_jobs: "banji-core.test.jobs".to_string(),
        rabbit_exchange_jobs_replay: "banji-core.test.jobs.replay".to_string(),
        rabbit_dlx_exchange: "banji-core.test.jobs.dlx".to_string(),
        rabbit_management_api_base_url: None,
        rabbit_management_username: None,
        rabbit_management_password: None,
        rabbit_retry_1_ttl_ms: 30_000,
        rabbit_retry_2_ttl_ms: 300_000,
        rabbit_retry_3_ttl_ms: 1_800_000,
        rabbit_prefetch_fast: 20,
        rabbit_prefetch_heavy: 2,
        rabbit_replay_prefetch_fast: 5,
        rabbit_replay_prefetch_heavy: 1,
        rabbit_max_attempts: 4,
        job_result_kafka_enabled: false,
        job_result_kafka_topic_prefix: None,
        redis_url: None,
        database_runtime_url: None,
        database_runtime_endpoint_kind: DatabaseRuntimeEndpointKind::Direct,
        pgbouncer_pool_mode: None,
        sqlx_pool_max_connections: 2,
        sqlx_pool_min_connections: 1,
        sqlx_pool_acquire_timeout: Duration::from_millis(2_000),
        sqlx_pool_connect_timeout: Duration::from_millis(2_000),
        sqlx_pool_idle_timeout: Duration::from_secs(300),
        sqlx_pool_max_lifetime: Duration::from_secs(1_800),
        postgres_connection_budget_total: 16,
        edge_enforcement_enabled: false,
        edge_origin_auth_header_name: "x-banji-edge-auth".to_string(),
        edge_origin_auth_secret: None,
        edge_origin_auth_secret_next: None,
        edge_rate_limit_enabled: true,
        edge_rate_limit_window: Duration::from_secs(60),
        edge_rate_limit_public_read_max: 120,
        edge_rate_limit_user_read_max: 240,
        edge_rate_limit_user_write_max: 60,
        edge_rate_limit_device_read_max: 120,
        edge_rate_limit_device_write_max: 30,
        edge_rate_limit_fallback_max_keys: 10_000,
        edge_rate_limit_key_ttl: Duration::from_secs(300),
        edge_rate_limit_redis_prefix: "rate-limit".to_string(),
        edge_rate_limit_failover_enabled: true,
        edge_backpressure_enabled: true,
        edge_backpressure_poll_interval: Duration::from_millis(1_000),
        edge_backpressure_retry_after_seconds: 5,
        edge_backpressure_consecutive_unhealthy: 2,
        edge_backpressure_consecutive_healthy: 2,
        edge_backpressure_job_outbox_pending_max: 1_000,
        edge_backpressure_job_outbox_oldest_age_seconds_max: 30,
        edge_backpressure_job_run_pending_max: 2_000,
        edge_backpressure_job_run_oldest_age_seconds_max: 60,
        edge_backpressure_kafka_pending_max: 500,
        edge_backpressure_kafka_oldest_age_seconds_max: 30,
        observability_rabbit_queue_poll_interval: Duration::from_secs(15),
        observability_postgres_lock_poll_interval: Duration::from_secs(15),
        observability_job_pressure_poll_interval: Duration::from_secs(15),
        edge_request_max_bytes: 262_144,
        edge_write_request_max_bytes: 65_536,
        edge_cors_allowed_origins: vec!["http://localhost:5173".to_string(), "null".to_string()],
        edge_trust_forwarded_client_ip: false,
    }
}

async fn spawn(cfg: AppConfig) -> std::net::SocketAddr {
    let state = build_state(cfg).await.expect("state should build");
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("listener should bind");
    let addr = listener.local_addr().expect("addr should exist");
    tokio::spawn(async move {
        axum::serve(listener, app_with_state(state))
            .await
            .expect("server should run");
    });
    addr
}

fn unique_store_path() -> std::path::PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time should be after epoch")
        .as_nanos();
    env::temp_dir().join(format!(
        "banji-sena-api-{}-{nonce}.sqlite3",
        std::process::id()
    ))
}

fn client() -> Client {
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        "x-banji-device-id",
        "desktop-test-device"
            .parse()
            .expect("device id should parse"),
    );
    headers.insert(
        "x-caller-id",
        "desktop-tester".parse().expect("caller id should parse"),
    );
    Client::builder()
        .default_headers(headers)
        .build()
        .expect("client should build")
}

#[tokio::test]
async fn sena_api_supports_catalog_observation_and_analysis_reads() {
    let _env_guard = SENA_STORE_ENV_LOCK
        .lock()
        .expect("sena store env lock should not be poisoned");
    let store_path = unique_store_path();
    env::set_var("BANJI_SENA_DATA_PATH", &store_path);

    let addr = spawn(base_config()).await;
    let client = client();

    let empty_summary = client
        .get(format!("http://{addr}/v1/sena/summary"))
        .send()
        .await
        .expect("summary request should succeed");
    if empty_summary.status() == StatusCode::SERVICE_UNAVAILABLE {
        env::remove_var("BANJI_SENA_DATA_PATH");
        let _ = std::fs::remove_file(store_path);
        return;
    }
    assert_eq!(empty_summary.status(), StatusCode::NOT_FOUND);

    let upsert_catalog = client
        .put(format!("http://{addr}/v1/sena/catalog"))
        .json(&json!({
            "schemaVersion": 1,
            "skus": [
                {
                    "skuId": "sku-001",
                    "name": "SENA Tee",
                    "description": "Imported tee for SENA flow",
                    "costPerUnit": 4.0,
                    "soldAsProduct": true,
                    "productPrice": 12.0,
                    "leadTimeMeanDaysHint": 4.0,
                    "leadTimeStdDaysHint": 1.5
                }
            ],
            "services": [
                {
                    "serviceId": "service-001",
                    "name": "Bundle Look",
                    "description": "Primary styling bundle",
                    "price": 24.0,
                    "bundle": true
                }
            ],
            "bundles": [],
            "sharingMask": [
                {
                    "serviceId": "service-001",
                    "skuId": "sku-001",
                    "enabled": true,
                    "usageProbability": 0.85
                }
            ]
        }))
        .send()
        .await
        .expect("catalog upsert should succeed");
    assert_eq!(upsert_catalog.status(), StatusCode::OK);

    let first_observation = client
        .post(format!("http://{addr}/v1/sena/observations"))
        .json(&json!({
            "observedAt": "2026-04-01T10:00:00Z",
            "stockSnapshot": [
                { "skuId": "sku-001", "unitsInStock": 18.0 }
            ],
            "serviceRankings": ["service-001"],
            "retailRankings": ["sku-001"],
            "serviceStockouts": [],
            "retailStockouts": [],
            "orderSignals": [
                {
                    "skuId": "sku-001",
                    "orderPlaced": true,
                    "receiptArrived": false,
                    "approximateOrderQuantity": 12.0
                }
            ],
            "servicePrices": [
                { "serviceId": "service-001", "price": 25.0 }
            ],
            "retailPrices": [
                { "skuId": "sku-001", "price": 12.0 }
            ],
            "leadTimeHints": [
                { "skuId": "sku-001", "typicalDays": 5.0, "lowDays": 4.0, "highDays": 7.0 }
            ],
            "notes": "first sena observation"
        }))
        .send()
        .await
        .expect("first observation should succeed");
    assert_eq!(first_observation.status(), StatusCode::CREATED);

    let second_observation = client
        .post(format!("http://{addr}/v1/sena/observations"))
        .json(&json!({
            "observedAt": "2026-04-03T10:00:00Z",
            "stockSnapshot": [
                { "skuId": "sku-001", "unitsInStock": 6.0 }
            ],
            "serviceRankings": ["service-001"],
            "retailRankings": ["sku-001"],
            "serviceStockouts": ["service-001"],
            "retailStockouts": ["sku-001"],
            "orderSignals": [
                {
                    "skuId": "sku-001",
                    "orderPlaced": false,
                    "receiptArrived": true,
                    "approximateReceiptQuantity": 5.0
                }
            ],
            "servicePrices": [
                { "serviceId": "service-001", "price": 18.0 }
            ],
            "retailPrices": [
                { "skuId": "sku-001", "price": 10.0 }
            ],
            "leadTimeHints": [
                { "skuId": "sku-001", "typicalDays": 4.0, "lowDays": 2.0, "highDays": 6.0 }
            ],
            "notes": "second sena observation"
        }))
        .send()
        .await
        .expect("second observation should succeed");
    assert_eq!(second_observation.status(), StatusCode::CREATED);

    let trigger = client
        .post(format!("http://{addr}/v1/sena/runs"))
        .json(&json!({}))
        .send()
        .await
        .expect("analysis trigger should succeed");
    assert_eq!(trigger.status(), StatusCode::CREATED);
    let trigger_body: serde_json::Value = trigger.json().await.expect("trigger body should parse");
    let run_id = trigger_body["run"]["runId"]
        .as_str()
        .expect("run id should be present")
        .to_string();
    assert_eq!(
        trigger_body["run"]["algorithmVersion"],
        json!("sena-analysis-v3")
    );

    let summary = client
        .get(format!("http://{addr}/v1/sena/summary"))
        .send()
        .await
        .expect("summary request should succeed");
    assert_eq!(summary.status(), StatusCode::OK);
    let summary_body: serde_json::Value = summary.json().await.expect("summary json should parse");
    assert_eq!(summary_body["skuCount"], json!(1));
    assert_eq!(summary_body["serviceCount"], json!(1));
    assert_eq!(summary_body["intervalCount"], json!(1));
    assert_eq!(
        summary_body["skuSummaries"][0]["regimeProbabilities"]
            .as_object()
            .expect("regime probabilities should be an object")
            .len(),
        6
    );

    let sku_detail = client
        .get(format!("http://{addr}/v1/sena/skus/sku-001"))
        .send()
        .await
        .expect("sku detail request should succeed");
    assert_eq!(sku_detail.status(), StatusCode::OK);
    let sku_body: serde_json::Value = sku_detail.json().await.expect("sku json should parse");
    assert_eq!(sku_body["detail"]["summary"]["skuId"], json!("sku-001"));
    assert!(
        sku_body["detail"]["summary"]["reorderPoint"]
            .as_f64()
            .expect("reorder point should be numeric")
            > 0.0
    );
    assert!(sku_body["detail"]["summary"]["reorderTriggerProbability"].is_number());
    assert!(sku_body["detail"]["summary"]["reorderQuantity"]["recommendedUnits"].is_number());
    assert!(sku_body["detail"]["summary"]["reorderQuantity"]["needProbability"].is_number());
    assert!(sku_body["detail"]["summary"]["reorderQuantity"]["likelyRangeLow"].is_number());
    assert!(sku_body["detail"]["summary"]["reorderQuantity"]["likelyRangeHigh"].is_number());
    assert!(sku_body["detail"]["demandPosterior"][0]["lostDemandMean"].is_number());
    assert!(sku_body["detail"]["demandPosterior"][0]["inventoryPositionMean"].is_number());
    assert!(sku_body["detail"]["leadTimePosterior"][0]["varianceDaysSquared"].is_number());
    assert!(sku_body["detail"]["leadTimePosterior"][0]["shapeSigma"].is_number());

    let service_detail = client
        .get(format!("http://{addr}/v1/sena/services/service-001"))
        .send()
        .await
        .expect("service detail request should succeed");
    assert_eq!(service_detail.status(), StatusCode::OK);
    let service_body: serde_json::Value = service_detail
        .json()
        .await
        .expect("service body should parse");
    assert_eq!(service_body["detail"]["serviceId"], json!("service-001"));
    assert!(service_body["detail"]["activityMean"].is_number());
    assert!(
        service_body["detail"]["contributors"][0]["reorderQuantity"]["recommendedUnits"]
            .is_number()
    );
    assert!(
        service_body["detail"]["contributors"][0]["reorderQuantity"]["needProbability"].is_number()
    );

    let diagnostics = client
        .get(format!("http://{addr}/v1/sena/diagnostics"))
        .send()
        .await
        .expect("diagnostics request should succeed");
    assert_eq!(diagnostics.status(), StatusCode::OK);
    let diagnostics_body: serde_json::Value = diagnostics
        .json()
        .await
        .expect("diagnostics body should parse");
    assert_eq!(
        diagnostics_body["regimeHistory"].as_array().unwrap().len(),
        1
    );
    assert!(diagnostics_body["latestChangePointProbability"].is_number());

    let run = client
        .get(format!("http://{addr}/v1/sena/runs/{run_id}"))
        .send()
        .await
        .expect("run request should succeed");
    assert_eq!(run.status(), StatusCode::OK);

    env::remove_var("BANJI_SENA_DATA_PATH");
    let _ = std::fs::remove_file(store_path);
}
