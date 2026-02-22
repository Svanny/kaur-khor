use banji_api::{app_with_state, build_state, config::AppConfig};
use reqwest::StatusCode;
use serde_json::json;
use std::{env, time::Duration};

fn test_config_with_bad_redis(db_url: Option<String>) -> AppConfig {
    AppConfig {
        system: "banji-core".to_string(),
        env: "test".to_string(),
        service: "api".to_string(),
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
        redis_url: Some("redis://127.0.0.1:1".to_string()),
        database_runtime_url: db_url,
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
}
