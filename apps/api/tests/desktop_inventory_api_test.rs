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

static DESKTOP_STORE_ENV_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));

fn base_config() -> AppConfig {
    AppConfig {
        app_role: banji_api::config::AppRole::Api,
        system: "banji-core".to_string(),
        env: "dev".to_string(),
        service: "api".to_string(),
        instance_id: "api-desktop-test-1".to_string(),
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
        "banji-desktop-inventory-{}-{nonce}.json",
        std::process::id()
    ))
}

fn desktop_client() -> Client {
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
async fn desktop_inventory_endpoints_support_local_crud_and_ranking() {
    let _env_guard = DESKTOP_STORE_ENV_LOCK
        .lock()
        .expect("desktop store env lock should not be poisoned");
    let store_path = unique_store_path();
    env::set_var("BANJI_DESKTOP_DATA_PATH", &store_path);

    let addr = spawn(base_config()).await;
    let client = desktop_client();

    let inventory = client
        .get(format!("http://{addr}/v1/desktop/inventory"))
        .send()
        .await
        .expect("inventory request should succeed");
    assert_eq!(inventory.status(), StatusCode::OK);
    let inventory_body: serde_json::Value = inventory.json().await.expect("json body should parse");
    assert_eq!(inventory_body["skus"].as_array().unwrap().len(), 10);
    assert_eq!(inventory_body["services"].as_array().unwrap().len(), 10);
    assert_eq!(inventory_body["ranking"].as_array().unwrap().len(), 15);
    assert_eq!(
        inventory_body["sist"]["status"]["confidence"],
        json!("high")
    );
    assert!(
        inventory_body["sist"]["status"]["reportCount"]
            .as_u64()
            .expect("seeded report count should be numeric")
            > 260
    );

    let sku_ids = inventory_body["skus"]
        .as_array()
        .expect("skus should be an array")
        .iter()
        .map(|sku| {
            sku["skuId"]
                .as_str()
                .expect("sku id should be a string")
                .to_string()
        })
        .collect::<std::collections::HashSet<_>>();
    for service in inventory_body["services"]
        .as_array()
        .expect("services should be an array")
    {
        let linked_skus = service["skuIds"]
            .as_array()
            .expect("service skuIds should be an array");
        assert!(!linked_skus.is_empty());
        for sku_id in linked_skus {
            assert!(sku_ids.contains(sku_id.as_str().expect("linked sku id should be a string")));
        }
    }

    let seeded_detail = client
        .get(format!("http://{addr}/v1/desktop/sist/sku/sku-001"))
        .send()
        .await
        .expect("seeded sku detail request should succeed");
    assert_eq!(seeded_detail.status(), StatusCode::OK);
    let reports_body: serde_json::Value = seeded_detail
        .json()
        .await
        .expect("seeded sku detail body should parse");
    let reports_array = reports_body["reports"]
        .as_array()
        .expect("seeded sku detail should include reports");
    assert!(reports_array.len() > 260);
    assert_eq!(reports_array[0]["reportSource"], json!("legacy-baseline"));
    assert_eq!(
        reports_array
            .last()
            .expect("seeded reports should not be empty")["reportSource"],
        json!("manual")
    );

    let create_sku = client
        .post(format!("http://{addr}/v1/desktop/skus"))
        .json(&json!({
            "skuId": "sku-200",
            "name": "New retail sku",
            "description": "Fresh local desktop inventory item",
            "unitsInStock": 12.0,
            "costPerUnit": 4.5,
            "soldAsProduct": true,
            "productPrice": 9.75
        }))
        .send()
        .await
        .expect("create sku should succeed");
    assert_eq!(create_sku.status(), StatusCode::CREATED);

    let update_service = client
        .put(format!("http://{addr}/v1/desktop/services/service-001"))
        .json(&json!({
            "serviceId": "service-001",
            "name": "Service #001",
            "description": "Updated package linked to new sku",
            "price": 1350.0,
            "skuIds": ["sku-001", "sku-200"]
        }))
        .send()
        .await
        .expect("update service should succeed");
    assert_eq!(update_service.status(), StatusCode::OK);
    let service_body: serde_json::Value = update_service
        .json()
        .await
        .expect("service body should parse");
    assert_eq!(
        service_body["service"]["skuIds"],
        json!(["sku-001", "sku-200"])
    );

    let stock_update = client
        .post(format!("http://{addr}/v1/desktop/stock-updates"))
        .json(&json!({
            "updates": [
                {
                    "skuId": "sku-200",
                    "unitsInStock": 18.0,
                    "costPerUnit": 4.75
                }
            ]
        }))
        .send()
        .await
        .expect("stock update should succeed");
    assert_eq!(stock_update.status(), StatusCode::OK);

    let ranking = client
        .get(format!("http://{addr}/v1/desktop/ranking"))
        .send()
        .await
        .expect("ranking request should succeed");
    assert_eq!(ranking.status(), StatusCode::OK);
    let ranking_body: serde_json::Value = ranking.json().await.expect("ranking json should parse");
    let ranking_entries = ranking_body["entries"]
        .as_array()
        .expect("ranking entries should be an array");
    assert_eq!(ranking_entries.len(), 16);
    let mut reordered_entries = ranking_entries
        .iter()
        .filter(|entry| entry["entryId"] != "sku-200")
        .cloned()
        .collect::<Vec<_>>();
    reordered_entries.insert(
        0,
        json!({
            "entryType": "sku",
            "entryId": "sku-200",
            "position": 0
        }),
    );
    for (index, entry) in reordered_entries.iter_mut().enumerate() {
        entry["position"] = json!(index);
    }

    let save_ranking = client
        .put(format!("http://{addr}/v1/desktop/ranking"))
        .json(&json!({ "entries": reordered_entries.clone() }))
        .send()
        .await
        .expect("save ranking should succeed");
    assert_eq!(save_ranking.status(), StatusCode::OK);

    let create_service = client
        .post(format!("http://{addr}/v1/desktop/services"))
        .json(&json!({
            "serviceId": "service-200",
            "name": "New bundled service",
            "description": "Appended after the saved ranking order",
            "price": 0.0,
            "skuIds": ["sku-001"]
        }))
        .send()
        .await
        .expect("create service should succeed");
    assert_eq!(create_service.status(), StatusCode::CREATED);

    let create_ranked_sku = client
        .post(format!("http://{addr}/v1/desktop/skus"))
        .json(&json!({
            "skuId": "sku-201",
            "name": "Ranked product sku",
            "description": "Should be appended after the existing ranking",
            "unitsInStock": 6.0,
            "costPerUnit": 2.5,
            "soldAsProduct": true,
            "productPrice": 5.0
        }))
        .send()
        .await
        .expect("create ranked sku should succeed");
    assert_eq!(create_ranked_sku.status(), StatusCode::CREATED);

    let persisted_inventory = client
        .get(format!("http://{addr}/v1/desktop/inventory"))
        .send()
        .await
        .expect("persisted inventory request should succeed");
    assert_eq!(persisted_inventory.status(), StatusCode::OK);
    let persisted_body: serde_json::Value = persisted_inventory
        .json()
        .await
        .expect("persisted inventory body should parse");

    assert!(persisted_body["skus"]
        .as_array()
        .unwrap()
        .iter()
        .any(|sku| sku["skuId"] == "sku-200" && sku["unitsInStock"] == json!(18.0)));
    let mut expected_ranking = reordered_entries;
    expected_ranking.push(json!({
        "entryType": "service",
        "entryId": "service-200",
        "position": expected_ranking.len()
    }));
    expected_ranking.push(json!({
        "entryType": "sku",
        "entryId": "sku-201",
        "position": expected_ranking.len()
    }));
    assert_eq!(persisted_body["ranking"], json!(expected_ranking));

    let invalid_ranking = client
        .put(format!("http://{addr}/v1/desktop/ranking"))
        .json(&json!({
            "entries": [
                {
                    "entryType": "service",
                    "entryId": "service-001",
                    "position": 0
                }
            ]
        }))
        .send()
        .await
        .expect("invalid ranking request should succeed");
    assert_eq!(invalid_ranking.status(), StatusCode::BAD_REQUEST);

    env::remove_var("BANJI_DESKTOP_DATA_PATH");
    let _ = std::fs::remove_file(store_path);
}

#[tokio::test]
async fn desktop_inventory_supports_sist_reports_settings_and_detail_views() {
    let _env_guard = DESKTOP_STORE_ENV_LOCK
        .lock()
        .expect("desktop store env lock should not be poisoned");
    let store_path = unique_store_path();
    env::set_var("BANJI_DESKTOP_DATA_PATH", &store_path);

    std::fs::write(
        &store_path,
        serde_json::to_vec_pretty(&json!({
            "owners": {
                "desktop-tester": {
                    "skus": [
                        {
                            "skuId": "sku-legacy",
                            "name": "Legacy SKU",
                            "description": "Migrated from the old store",
                            "unitsInStock": 10.0,
                            "costPerUnit": 3.5,
                            "soldAsProduct": true,
                            "productPrice": 7.0
                        }
                    ],
                    "services": [
                        {
                            "serviceId": "service-legacy",
                            "name": "Legacy Service",
                            "description": "Legacy bundle",
                            "price": 15.0,
                            "skuIds": ["sku-legacy"]
                        }
                    ],
                    "ranking": [
                        {
                            "entryType": "service",
                            "entryId": "service-legacy",
                            "position": 0
                        },
                        {
                            "entryType": "sku",
                            "entryId": "sku-legacy",
                            "position": 1
                        }
                    ]
                }
            }
        }))
        .expect("legacy json should serialize"),
    )
    .expect("legacy store fixture should write");

    let addr = spawn(base_config()).await;
    let client = desktop_client();

    let migrated_inventory = client
        .get(format!("http://{addr}/v1/desktop/inventory"))
        .send()
        .await
        .expect("inventory request should succeed");
    assert_eq!(migrated_inventory.status(), StatusCode::OK);
    let migrated_body: serde_json::Value = migrated_inventory
        .json()
        .await
        .expect("inventory body should parse");
    assert_eq!(migrated_body["sist"]["status"]["reportCount"], json!(1));
    assert_eq!(
        migrated_body["sist"]["settings"]["particleCount"],
        json!(512)
    );

    let save_settings = client
        .put(format!("http://{addr}/v1/desktop/sist/settings"))
        .json(&json!({
            "targetServiceLevel": 0.97,
            "forecastHorizonDays": 21,
            "particleCount": 768,
            "smoothingWindowReports": 120
        }))
        .send()
        .await
        .expect("settings update should succeed");
    assert_eq!(save_settings.status(), StatusCode::OK);

    let create_report = client
        .post(format!("http://{addr}/v1/desktop/stock-reports"))
        .json(&json!({
            "reportedAt": "2026-03-27T10:00:00Z",
            "skuObservations": [
                {
                    "skuId": "sku-legacy",
                    "unitsInStock": 6.0,
                    "costPerUnit": 3.75,
                    "restockIncluded": false,
                    "retailStockout": true
                }
            ],
            "serviceSignals": [
                {
                    "serviceId": "service-legacy",
                    "stockout": true
                }
            ],
            "topServiceRanking": ["service-legacy"],
            "topRetailRanking": ["sku-legacy"],
            "notes": "Observed constrained demand"
        }))
        .send()
        .await
        .expect("stock report should succeed");
    assert_eq!(create_report.status(), StatusCode::CREATED);

    let detail = client
        .get(format!("http://{addr}/v1/desktop/sist/sku/sku-legacy"))
        .send()
        .await
        .expect("detail request should succeed");
    assert_eq!(detail.status(), StatusCode::OK);
    let detail_body: serde_json::Value = detail.json().await.expect("detail body should parse");
    assert_eq!(detail_body["insight"]["skuId"], json!("sku-legacy"));
    assert_eq!(detail_body["reports"].as_array().unwrap().len(), 2);
    assert_eq!(
        detail_body["reports"][1]["serviceSignals"][0]["stockout"],
        json!(true)
    );

    env::remove_var("BANJI_DESKTOP_DATA_PATH");
    let _ = std::fs::remove_file(store_path);
}
