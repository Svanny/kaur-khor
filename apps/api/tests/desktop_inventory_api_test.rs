use banji_api::{
    app_with_state, build_state,
    config::{AppConfig, DatabaseRuntimeEndpointKind},
};
use reqwest::{Client, StatusCode};
use serde_json::json;
use std::time::Duration;

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
async fn old_desktop_routes_are_not_mounted_anymore() {
    let addr = spawn(base_config()).await;
    let client = desktop_client();

    let response = client
        .get(format!("http://{addr}/v1/desktop/sist/system"))
        .send()
        .await
        .expect("request should succeed");
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn sena_routes_exist_and_require_database_backing() {
    let addr = spawn(base_config()).await;
    let client = desktop_client();

    let upsert = client
        .put(format!("http://{addr}/v1/sena/catalog"))
        .json(&json!({
            "schemaVersion": 1,
            "skus": [{
                "skuId": "sku-001",
                "name": "Bangkok Tee",
                "description": "Core retail tee",
                "costPerUnit": 4.2,
                "soldAsProduct": true,
                "productPrice": 11.0,
                "leadTimeMeanDaysHint": 7.0,
                "leadTimeStdDaysHint": 2.0
            }],
            "services": [{
                "serviceId": "service-001",
                "name": "Weekend Set",
                "description": "Promo set",
                "price": 24.0,
                "bundle": true
            }],
            "bundles": [],
            "sharingMask": [{
                "serviceId": "service-001",
                "skuId": "sku-001",
                "enabled": true,
                "usageProbability": 0.95
            }]
        }))
        .send()
        .await
        .expect("request should succeed");
    assert_eq!(upsert.status(), StatusCode::SERVICE_UNAVAILABLE);

    let summary = client
        .get(format!("http://{addr}/v1/sena/summary"))
        .send()
        .await
        .expect("request should succeed");
    assert_eq!(summary.status(), StatusCode::SERVICE_UNAVAILABLE);
}
