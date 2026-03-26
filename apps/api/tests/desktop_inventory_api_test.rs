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
        "desktop-test-device".parse().expect("device id should parse"),
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
    assert_eq!(inventory_body["skus"].as_array().unwrap().len(), 4);
    assert_eq!(inventory_body["services"].as_array().unwrap().len(), 2);
    assert_eq!(inventory_body["ranking"].as_array().unwrap().len(), 4);

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
    let reordered_entries = json!([
        {
            "entryType": "sku",
            "entryId": "sku-200",
            "position": 0
        },
        {
            "entryType": "service",
            "entryId": "service-001",
            "position": 1
        },
        {
            "entryType": "service",
            "entryId": "service-002",
            "position": 2
        },
        {
            "entryType": "sku",
            "entryId": "sku-001",
            "position": 3
        },
        {
            "entryType": "sku",
            "entryId": "sku-003",
            "position": 4
        }
    ]);
    assert_eq!(ranking_body["entries"].as_array().unwrap().len(), 5);

    let save_ranking = client
        .put(format!("http://{addr}/v1/desktop/ranking"))
        .json(&json!({ "entries": reordered_entries }))
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
    assert_eq!(
        persisted_body["ranking"],
        json!([
            {
                "entryType": "sku",
                "entryId": "sku-200",
                "position": 0
            },
            {
                "entryType": "service",
                "entryId": "service-001",
                "position": 1
            },
            {
                "entryType": "service",
                "entryId": "service-002",
                "position": 2
            },
            {
                "entryType": "sku",
                "entryId": "sku-001",
                "position": 3
            },
            {
                "entryType": "sku",
                "entryId": "sku-003",
                "position": 4
            },
            {
                "entryType": "service",
                "entryId": "service-200",
                "position": 5
            },
            {
                "entryType": "sku",
                "entryId": "sku-201",
                "position": 6
            }
        ])
    );

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
