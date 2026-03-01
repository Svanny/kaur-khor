use banji_api::{
    app_with_state, build_state,
    config::{AppConfig, DatabaseRuntimeEndpointKind},
};
use reqwest::{Client, StatusCode};
use std::{time::Duration, vec};

fn base_config() -> AppConfig {
    AppConfig {
        app_role: banji_api::config::AppRole::Api,
        system: "banji-core".to_string(),
        env: "dev".to_string(),
        service: "api".to_string(),
        instance_id: "api-test-1".to_string(),
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
        sqlx_pool_max_connections: 10,
        sqlx_pool_min_connections: 1,
        sqlx_pool_acquire_timeout: Duration::from_millis(2_000),
        sqlx_pool_connect_timeout: Duration::from_millis(2_000),
        sqlx_pool_idle_timeout: Duration::from_secs(300),
        sqlx_pool_max_lifetime: Duration::from_secs(1_800),
        postgres_connection_budget_total: 80,
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
        edge_cors_allowed_origins: vec!["https://app.example.com".to_string()],
        edge_trust_forwarded_client_ip: false,
    }
}

async fn spawn(cfg: AppConfig) -> std::net::SocketAddr {
    let state = build_state(cfg).await.expect("state should build");
    spawn_state(state).await
}

async fn spawn_state(state: banji_api::AppState) -> std::net::SocketAddr {
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

fn write_demo_payload() -> serde_json::Value {
    serde_json::json!({
        "operation": "write",
        "payload": {"sku":"sku-1","qty":1}
    })
}

#[tokio::test]
async fn guarded_health_requires_origin_auth_header() {
    let mut cfg = base_config();
    cfg.env = "staging".to_string();
    cfg.edge_enforcement_enabled = true;
    cfg.edge_origin_auth_secret = Some("current-secret".to_string());
    cfg.edge_origin_auth_secret_next = Some("next-secret".to_string());

    let addr = spawn(cfg).await;
    let client = Client::new();

    let forbidden = client
        .get(format!("http://{addr}/health"))
        .send()
        .await
        .expect("request should complete");
    assert_eq!(forbidden.status(), StatusCode::FORBIDDEN);

    let allowed_current = client
        .get(format!("http://{addr}/health"))
        .header("x-banji-edge-auth", "current-secret")
        .send()
        .await
        .expect("request should complete");
    assert_eq!(allowed_current.status(), StatusCode::OK);

    let allowed_next = client
        .get(format!("http://{addr}/health"))
        .header("x-banji-edge-auth", "next-secret")
        .send()
        .await
        .expect("request should complete");
    assert_eq!(allowed_next.status(), StatusCode::OK);
}

#[tokio::test]
async fn forwarded_ip_is_ignored_when_origin_guard_not_enforced() {
    let mut cfg = base_config();
    cfg.edge_rate_limit_public_read_max = 1;
    cfg.edge_trust_forwarded_client_ip = true;

    let addr = spawn(cfg).await;
    let client = Client::new();

    let first = client
        .get(format!("http://{addr}/health"))
        .header("x-forwarded-for", "1.1.1.1")
        .send()
        .await
        .expect("request should complete");
    assert_eq!(first.status(), StatusCode::OK);

    let second = client
        .get(format!("http://{addr}/health"))
        .header("x-forwarded-for", "2.2.2.2")
        .send()
        .await
        .expect("request should complete");
    assert_eq!(second.status(), StatusCode::TOO_MANY_REQUESTS);
}

#[tokio::test]
async fn forwarded_ip_is_used_only_after_guard_passes() {
    let mut cfg = base_config();
    cfg.env = "staging".to_string();
    cfg.edge_enforcement_enabled = true;
    cfg.edge_origin_auth_secret = Some("edge-secret".to_string());
    cfg.edge_rate_limit_public_read_max = 1;
    cfg.edge_trust_forwarded_client_ip = true;

    let addr = spawn(cfg).await;
    let client = Client::new();

    let first = client
        .get(format!("http://{addr}/health"))
        .header("x-banji-edge-auth", "edge-secret")
        .header("x-forwarded-for", "10.0.0.1")
        .send()
        .await
        .expect("request should complete");
    assert_eq!(first.status(), StatusCode::OK);

    let second = client
        .get(format!("http://{addr}/health"))
        .header("x-banji-edge-auth", "edge-secret")
        .header("x-forwarded-for", "10.0.0.2")
        .send()
        .await
        .expect("request should complete");
    assert_eq!(second.status(), StatusCode::OK);
}

#[tokio::test]
async fn malformed_forwarded_ip_falls_back_to_peer_identity() {
    let mut cfg = base_config();
    cfg.edge_rate_limit_public_read_max = 1;
    cfg.edge_trust_forwarded_client_ip = true;

    let addr = spawn(cfg).await;
    let client = Client::new();

    let first = client
        .get(format!("http://{addr}/health"))
        .header("x-forwarded-for", "   ")
        .send()
        .await
        .expect("request should complete");
    assert_eq!(first.status(), StatusCode::OK);

    let second = client
        .get(format!("http://{addr}/health"))
        .header("x-forwarded-for", ", ,")
        .send()
        .await
        .expect("request should complete");
    assert_eq!(second.status(), StatusCode::TOO_MANY_REQUESTS);
}

#[tokio::test]
async fn rate_key_uses_matched_route_not_raw_query_path() {
    let mut cfg = base_config();
    cfg.edge_rate_limit_public_read_max = 1;

    let addr = spawn(cfg).await;
    let client = Client::new();

    let first = client
        .get(format!("http://{addr}/health?x=1"))
        .send()
        .await
        .expect("request should complete");
    assert_eq!(first.status(), StatusCode::OK);

    let second = client
        .get(format!("http://{addr}/health?x=2"))
        .send()
        .await
        .expect("request should complete");
    assert_eq!(second.status(), StatusCode::TOO_MANY_REQUESTS);
}

#[tokio::test]
async fn options_preflight_is_not_write_throttled() {
    let mut cfg = base_config();
    cfg.edge_rate_limit_public_read_max = 1;
    cfg.edge_rate_limit_device_write_max = 1;

    let addr = spawn(cfg).await;
    let client = Client::new();

    let first = client
        .request(
            reqwest::Method::OPTIONS,
            format!("http://{addr}/v1/write-demo"),
        )
        .header("origin", "https://app.example.com")
        .header("access-control-request-method", "POST")
        .send()
        .await
        .expect("request should complete");
    assert_eq!(first.status(), StatusCode::NO_CONTENT);

    let second = client
        .request(
            reqwest::Method::OPTIONS,
            format!("http://{addr}/v1/write-demo"),
        )
        .header("origin", "https://app.example.com")
        .header("access-control-request-method", "POST")
        .send()
        .await
        .expect("request should complete");
    assert_eq!(second.status(), StatusCode::NO_CONTENT);
}

#[tokio::test]
async fn oversized_write_body_is_rejected() {
    let cfg = base_config();
    let addr = spawn(cfg).await;

    let oversized = "x".repeat(80_000);
    let payload = serde_json::json!({
        "operation": "write",
        "payload": {"blob": oversized}
    });

    let response = Client::new()
        .post(format!("http://{addr}/v1/write-demo"))
        .header("content-type", "application/json")
        .body(payload.to_string())
        .send()
        .await
        .expect("request should complete");

    assert_eq!(response.status(), StatusCode::PAYLOAD_TOO_LARGE);
}

#[tokio::test]
async fn guarded_http_proto_misconfiguration_is_rejected() {
    let mut cfg = base_config();
    cfg.env = "staging".to_string();
    cfg.edge_enforcement_enabled = true;
    cfg.edge_origin_auth_secret = Some("edge-secret".to_string());

    let addr = spawn(cfg).await;
    let response = Client::new()
        .get(format!("http://{addr}/health"))
        .header("x-banji-edge-auth", "edge-secret")
        .header("x-forwarded-proto", "http")
        .send()
        .await
        .expect("request should complete");

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn write_demo_requires_device_id_header() {
    let cfg = base_config();
    let addr = spawn(cfg).await;

    let response = Client::new()
        .post(format!("http://{addr}/v1/write-demo"))
        .header("content-type", "application/json")
        .header("x-caller-id", "caller-1")
        .body(write_demo_payload().to_string())
        .send()
        .await
        .expect("request should complete");

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    let body: serde_json::Value = response.json().await.expect("body should parse");
    assert_eq!(body["error_code"], "REQUEST_VALIDATION_FAILED");
}

#[tokio::test]
async fn write_demo_rate_limit_returns_retry_after_headers() {
    let mut cfg = base_config();
    cfg.edge_rate_limit_user_write_max = 10;
    cfg.edge_rate_limit_device_write_max = 1;
    let addr = spawn(cfg).await;
    let client = Client::new();

    let first = client
        .post(format!("http://{addr}/v1/write-demo"))
        .header("content-type", "application/json")
        .header("x-caller-id", "caller-1")
        .header("x-banji-device-id", "device-1234")
        .body(write_demo_payload().to_string())
        .send()
        .await
        .expect("request should complete");
    assert_eq!(first.status(), StatusCode::SERVICE_UNAVAILABLE);

    let second = client
        .post(format!("http://{addr}/v1/write-demo"))
        .header("content-type", "application/json")
        .header("x-caller-id", "caller-1")
        .header("x-banji-device-id", "device-1234")
        .body(write_demo_payload().to_string())
        .send()
        .await
        .expect("request should complete");

    // Without a DB the first write short-circuits at the handler, but the quota was still consumed.
    assert_eq!(second.status(), StatusCode::TOO_MANY_REQUESTS);
    assert!(second.headers().contains_key("retry-after"));
    assert_eq!(
        second
            .headers()
            .get("x-ratelimit-scope")
            .and_then(|v| v.to_str().ok()),
        Some("device")
    );
}

#[tokio::test]
async fn backpressure_rejects_async_writes_with_retry_after() {
    let mut cfg = base_config();
    cfg.edge_backpressure_job_outbox_pending_max = 1;
    let state = build_state(cfg).await.expect("state should build");
    let unhealthy = state.backpressure_gate.rabbit_publish_state(2, 0);
    let healthy_worker = state.backpressure_gate.worker_completion_state(0, 0);
    state
        .backpressure_gate
        .update_sample(unhealthy, healthy_worker, None)
        .await;
    state
        .backpressure_gate
        .update_sample(unhealthy, healthy_worker, None)
        .await;

    let addr = spawn_state(state).await;
    let response = Client::new()
        .post(format!("http://{addr}/v1/write-demo"))
        .header("content-type", "application/json")
        .header("x-caller-id", "caller-1")
        .header("x-banji-device-id", "device-1234")
        .body(write_demo_payload().to_string())
        .send()
        .await
        .expect("request should complete");

    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(
        response
            .headers()
            .get("retry-after")
            .and_then(|v| v.to_str().ok()),
        Some("5")
    );
    let body: serde_json::Value = response.json().await.expect("body should parse");
    assert_eq!(body["error_code"], "DEPENDENCY_BACKPRESSURE");
}
