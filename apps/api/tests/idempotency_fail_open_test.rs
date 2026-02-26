use banji_api::{
    app_with_state, build_state,
    config::{AppConfig, EdgeProvider},
};
use reqwest::StatusCode;
use serde_json::json;
use std::{env, time::Duration};

fn test_config_with_bad_redis(db_url: Option<String>) -> AppConfig {
    AppConfig {
        system: "banji-core".to_string(),
        env: "test".to_string(),
        service: "api".to_string(),
        auth_enabled: false,
        auth_jwks_url: None,
        auth_issuer: None,
        auth_audience: None,
        auth_jwks_cache_ttl: Duration::from_secs(300),
        auth_jwks_timeout: Duration::from_millis(1000),
        auth_clock_skew: Duration::from_secs(30),
        idempotency_retention_days: 30,
        cache_enabled: true,
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
        redis_url: Some("redis://127.0.0.1:1".to_string()),
        database_runtime_url: db_url,
        database_runtime_endpoint_kind: banji_api::config::DatabaseRuntimeEndpointKind::Direct,
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
        edge_rate_limit_max_keys: 1_000,
        edge_rate_limit_key_ttl: Duration::from_secs(300),
        edge_request_max_bytes: 262_144,
        edge_write_request_max_bytes: 65_536,
        edge_cors_allowed_origins: vec![],
        edge_trust_cf_connecting_ip: false,
    }
}

#[tokio::test]
async fn api_can_start_with_redis_unreachable_fail_open() {
    let state = build_state(test_config_with_bad_redis(None)).await.unwrap();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();

    tokio::spawn(async move {
        axum::serve(listener, app_with_state(state)).await.unwrap();
    });

    let started = std::time::Instant::now();
    let response = reqwest::get(format!("http://{addr}/health")).await.unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    assert!(started.elapsed() < Duration::from_secs(2));
}

#[tokio::test]
async fn idempotent_write_remains_correct_with_redis_down() {
    let Some(db_url) = env::var("DATABASE_RUNTIME_URL").ok() else {
        eprintln!("Skipping test: DATABASE_RUNTIME_URL not set");
        return;
    };

    let pool = sqlx::PgPool::connect(&db_url).await.unwrap();
    sqlx::migrate!("./migrations").run(&pool).await.unwrap();

    sqlx::query("DELETE FROM app.idempotency_request WHERE caller_id = $1")
        .bind("test-caller")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("DELETE FROM app.event_log WHERE producer_service = $1 AND idempotency_key = $2")
        .bind("api")
        .bind("idem-1")
        .execute(&pool)
        .await
        .unwrap();

    let state = build_state(test_config_with_bad_redis(Some(db_url)))
        .await
        .unwrap();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();

    tokio::spawn(async move {
        axum::serve(listener, app_with_state(state)).await.unwrap();
    });

    let client = reqwest::Client::new();
    let url = format!("http://{addr}/v1/write-demo");
    let payload = json!({"operation":"reserve","payload":{"sku":"sku-1","qty":1}});

    let first = client
        .post(&url)
        .header("x-caller-id", "test-caller")
        .header("idempotency-key", "idem-1")
        .json(&payload)
        .send()
        .await
        .unwrap();
    assert_eq!(first.status(), StatusCode::OK);
    let first_body: serde_json::Value = first.json().await.unwrap();

    let second = client
        .post(&url)
        .header("x-caller-id", "test-caller")
        .header("idempotency-key", "idem-1")
        .json(&payload)
        .send()
        .await
        .unwrap();
    assert_eq!(second.status(), StatusCode::OK);
    let second_body: serde_json::Value = second.json().await.unwrap();

    assert_eq!(first_body, second_body);

    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM app.idempotency_request WHERE caller_id=$1 AND idempotency_key=$2",
    )
    .bind("test-caller")
    .bind("idem-1")
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(count, 1);

    let event_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM app.event_log WHERE producer_service=$1 AND idempotency_key=$2",
    )
    .bind("api")
    .bind("idem-1")
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(event_count, 1);
}
