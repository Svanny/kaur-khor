use anyhow::Result;
use async_trait::async_trait;
use banji_api::{
    app_with_state,
    cache::{CacheClient, KeyBuilder, LockHandle},
    config::AppConfig,
    idempotency::{hash_request_body, PersistedResponse},
    AppState,
};
use reqwest::StatusCode;
use serde_json::json;
use std::{collections::HashMap, env, sync::Arc, time::Duration};
use tokio::sync::Mutex;

struct StaticReplayCache {
    value: String,
}

#[async_trait]
impl CacheClient for StaticReplayCache {
    async fn get_string(&self, _key: &str) -> Result<Option<String>> {
        Ok(Some(self.value.clone()))
    }

    async fn set_string(&self, _key: &str, _value: &str, _ttl: Duration) -> Result<()> {
        Ok(())
    }

    async fn acquire_lock(&self, _key: &str, _ttl: Duration) -> Result<Option<LockHandle>> {
        Ok(None)
    }

    async fn release_lock(&self, _lock: &LockHandle) -> Result<bool> {
        Ok(false)
    }
}

fn test_config(db_url: String) -> AppConfig {
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
        rabbit_replay_prefetch_fast: 2,
        rabbit_replay_prefetch_heavy: 1,
        rabbit_max_attempts: 4,
        redis_url: None,
        database_runtime_url: Some(db_url),
        database_runtime_endpoint_kind: banji_api::config::DatabaseRuntimeEndpointKind::Direct,
        pgbouncer_pool_mode: None,
        sqlx_pool_max_connections: 10,
        sqlx_pool_min_connections: 1,
        sqlx_pool_acquire_timeout: Duration::from_millis(2_000),
        sqlx_pool_connect_timeout: Duration::from_millis(2_000),
        sqlx_pool_idle_timeout: Duration::from_secs(300),
        sqlx_pool_max_lifetime: Duration::from_secs(1_800),
        postgres_connection_budget_total: 80,
    }
}

#[tokio::test]
async fn cache_hit_does_not_bypass_conflict_detection() {
    let Some(db_url) = env::var("DATABASE_RUNTIME_URL").ok() else {
        eprintln!("Skipping test: DATABASE_RUNTIME_URL not set");
        return;
    };

    let pool = sqlx::PgPool::connect(&db_url).await.unwrap();
    sqlx::migrate!("./migrations").run(&pool).await.unwrap();

    let caller = "cache-conflict-caller";
    let idem = "cache-conflict-idem";
    sqlx::query(
        "DELETE FROM app.idempotency_request WHERE caller_id = $1 AND idempotency_key = $2",
    )
    .bind(caller)
    .bind(idem)
    .execute(&pool)
    .await
    .unwrap();

    let first_request = json!({
        "operation": "reserve",
        "payload": {"sku":"sku-1","qty":1}
    });
    let request_hash = hash_request_body(&first_request);
    let persisted = PersistedResponse {
        status_code: 200,
        body: json!({
            "ok": true,
            "operation": "reserve",
            "payload": {"sku":"sku-1","qty":1},
            "caller_id": caller,
        }),
    };

    sqlx::query(
        r#"
        INSERT INTO app.idempotency_request (
          caller_id, idempotency_key, request_hash, status, response_code, response_body
        ) VALUES ($1, $2, $3, 'completed', $4, $5)
        "#,
    )
    .bind(caller)
    .bind(idem)
    .bind(request_hash)
    .bind(persisted.status_code)
    .bind(&persisted.body)
    .execute(&pool)
    .await
    .unwrap();

    let cache = Arc::new(StaticReplayCache {
        value: serde_json::to_string(&persisted).unwrap(),
    });
    let cfg = test_config(db_url);
    let state = AppState {
        config: cfg.clone(),
        db: Some(pool),
        cache,
        key_builder: KeyBuilder::new(
            cfg.system.clone(),
            cfg.env.clone(),
            cfg.service.clone(),
            cfg.cache_schema_version.clone(),
        ),
        singleflight: Arc::new(Mutex::new(HashMap::new())),
    };

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move {
        axum::serve(listener, app_with_state(state)).await.unwrap();
    });

    let second_request = json!({"operation":"reserve","payload":{"sku":"sku-2","qty":1}});
    let response = reqwest::Client::new()
        .post(format!("http://{addr}/v1/write-demo"))
        .header("x-caller-id", caller)
        .header("idempotency-key", idem)
        .json(&second_request)
        .send()
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::CONFLICT);
}
