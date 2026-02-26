use banji_api::{
    app_with_state, build_state,
    config::{AppConfig, DatabaseRuntimeEndpointKind, EdgeProvider},
};
use reqwest::{Client, StatusCode};
use std::{time::Duration, vec};

fn base_config() -> AppConfig {
    AppConfig {
        app_role: banji_api::config::AppRole::Api,
        system: "banji-core".to_string(),
        env: "dev".to_string(),
        service: "api".to_string(),
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
        rabbit_dlx_exchange: "banji-core.test.jobs.dlx".to_string(),
        rabbit_retry_1_ttl_ms: 30_000,
        rabbit_retry_2_ttl_ms: 300_000,
        rabbit_retry_3_ttl_ms: 1_800_000,
        rabbit_prefetch_fast: 20,
        rabbit_prefetch_heavy: 2,
        rabbit_max_attempts: 4,
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
        edge_provider: EdgeProvider::None,
        edge_origin_auth_header_name: "x-banji-edge-auth".to_string(),
        edge_origin_auth_secret: None,
        edge_origin_auth_secret_next: None,
        edge_rate_limit_enabled: true,
        edge_rate_limit_window: Duration::from_secs(60),
        edge_rate_limit_read_max: 120,
        edge_rate_limit_write_max: 30,
        edge_rate_limit_max_keys: 10_000,
        edge_rate_limit_key_ttl: Duration::from_secs(300),
        edge_request_max_bytes: 262_144,
        edge_write_request_max_bytes: 65_536,
        edge_cors_allowed_origins: vec!["https://app.example.com".to_string()],
        edge_trust_cf_connecting_ip: false,
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

#[tokio::test]
async fn guarded_health_requires_origin_auth_header() {
    let mut cfg = base_config();
    cfg.env = "staging".to_string();
    cfg.edge_enforcement_enabled = true;
    cfg.edge_provider = EdgeProvider::Cloudflare;
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
async fn cf_connecting_ip_is_ignored_when_origin_guard_not_enforced() {
    let mut cfg = base_config();
    cfg.edge_rate_limit_read_max = 1;
    cfg.edge_trust_cf_connecting_ip = true;

    let addr = spawn(cfg).await;
    let client = Client::new();

    let first = client
        .get(format!("http://{addr}/health"))
        .header("cf-connecting-ip", "1.1.1.1")
        .send()
        .await
        .expect("request should complete");
    assert_eq!(first.status(), StatusCode::OK);

    let second = client
        .get(format!("http://{addr}/health"))
        .header("cf-connecting-ip", "2.2.2.2")
        .send()
        .await
        .expect("request should complete");
    assert_eq!(second.status(), StatusCode::TOO_MANY_REQUESTS);
}

#[tokio::test]
async fn cf_connecting_ip_is_used_only_after_guard_passes() {
    let mut cfg = base_config();
    cfg.env = "staging".to_string();
    cfg.edge_enforcement_enabled = true;
    cfg.edge_provider = EdgeProvider::Cloudflare;
    cfg.edge_origin_auth_secret = Some("edge-secret".to_string());
    cfg.edge_rate_limit_read_max = 1;
    cfg.edge_trust_cf_connecting_ip = true;

    let addr = spawn(cfg).await;
    let client = Client::new();

    let first = client
        .get(format!("http://{addr}/health"))
        .header("x-banji-edge-auth", "edge-secret")
        .header("cf-connecting-ip", "10.0.0.1")
        .send()
        .await
        .expect("request should complete");
    assert_eq!(first.status(), StatusCode::OK);

    let second = client
        .get(format!("http://{addr}/health"))
        .header("x-banji-edge-auth", "edge-secret")
        .header("cf-connecting-ip", "10.0.0.2")
        .send()
        .await
        .expect("request should complete");
    assert_eq!(second.status(), StatusCode::OK);
}

#[tokio::test]
async fn rate_key_uses_matched_route_not_raw_query_path() {
    let mut cfg = base_config();
    cfg.edge_rate_limit_read_max = 1;

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
    cfg.edge_rate_limit_read_max = 1;
    cfg.edge_rate_limit_write_max = 1;

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
    cfg.edge_provider = EdgeProvider::Cloudflare;
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
