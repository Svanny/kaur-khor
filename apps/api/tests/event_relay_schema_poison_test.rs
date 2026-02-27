use banji_api::{
    config::{AppConfig, AppRole, DatabaseRuntimeEndpointKind, EdgeProvider},
    events::{key::derive_publish_key, relay::relay_once},
};
use std::{env, time::Duration};

fn test_cfg(db_url: String) -> AppConfig {
    AppConfig {
        app_role: AppRole::EventRelay,
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
        cache_enabled: false,
        cache_schema_version: "v1".to_string(),
        cache_default_ttl: Duration::from_secs(300),
        cache_ttl_jitter: Duration::from_secs(0),
        redis_connect_timeout: Duration::from_millis(50),
        redis_command_timeout: Duration::from_millis(50),
        redis_circuit_error_threshold: 2,
        redis_circuit_window: Duration::from_secs(3),
        redis_circuit_cooldown: Duration::from_secs(3),
        redis_log_rate_limit: Duration::from_secs(1),
        event_payload_max_bytes: 65_536,
        event_relay_batch_size: 10,
        event_relay_poll_interval: Duration::from_millis(100),
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
        rabbit_replay_prefetch_fast: 5,
        rabbit_replay_prefetch_heavy: 1,
        rabbit_max_attempts: 4,
        job_result_kafka_enabled: false,
        job_result_kafka_topic_prefix: None,
        redis_url: None,
        database_runtime_url: Some(db_url),
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
        edge_rate_limit_public_read_max: 120,
        edge_rate_limit_user_read_max: 240,
        edge_rate_limit_user_write_max: 60,
        edge_rate_limit_device_read_max: 120,
        edge_rate_limit_device_write_max: 30,
        edge_rate_limit_fallback_max_keys: 1_000,
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
        edge_request_max_bytes: 262_144,
        edge_write_request_max_bytes: 65_536,
        edge_cors_allowed_origins: vec![],
        edge_trust_cf_connecting_ip: false,
    }
}

#[tokio::test]
async fn relay_blocks_schema_poison_with_blocked_timestamp() {
    let Some(db_url) = env::var("DATABASE_RUNTIME_URL").ok() else {
        eprintln!("Skipping test: DATABASE_RUNTIME_URL not set");
        return;
    };

    let pool = sqlx::PgPool::connect(&db_url).await.unwrap();
    sqlx::migrate!("./migrations").run(&pool).await.unwrap();

    let causation_id = "relay-schema-poison-1";
    let publish_key = derive_publish_key(
        "api",
        "inventory.item.created",
        "item",
        "item-schema-poison",
        causation_id,
    );

    sqlx::query("DELETE FROM app.event_outbox WHERE publish_key = $1")
        .bind(&publish_key)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("DELETE FROM app.event_log WHERE publish_key = $1")
        .bind(&publish_key)
        .execute(&pool)
        .await
        .unwrap();

    sqlx::query(
        r#"
        INSERT INTO app.event_outbox (
          publish_key,
          stream_name,
          env_name,
          topic_name,
          event_type,
          event_version,
          aggregate_type,
          aggregate_id,
          producer_service,
          idempotency_key,
          correlation_id,
          causation_id,
          payload,
          metadata,
          status,
          attempt_count,
          next_attempt_at,
          updated_at
        ) VALUES (
          $1,
          'banji-core.test.inventory-updated',
          'test',
          'inventory-updated',
          'inventory.item.created',
          1,
          'item',
          'item-schema-poison',
          'api',
          'idem-schema-poison',
          'corr-schema-poison',
          $2,
          '{"owner_sub":"user-1","item_id":"item-schema-poison","sku":"SKU-1","name":"Name","quantity":"bad"}'::jsonb,
          '{}'::jsonb,
          'pending',
          0,
          NOW(),
          NOW()
        )
        "#,
    )
    .bind(&publish_key)
    .bind(causation_id)
    .execute(&pool)
    .await
    .unwrap();

    let cfg = test_cfg(db_url);
    let stats = relay_once(&pool, &cfg).await.unwrap();
    assert_eq!(stats.blocked, 1);

    let (status, blocked_at, last_error): (String, Option<String>, Option<String>) = sqlx::query_as(
        "SELECT status, blocked_at::text, last_error FROM app.event_outbox WHERE publish_key = $1",
    )
    .bind(&publish_key)
    .fetch_one(&pool)
    .await
    .unwrap();

    assert_eq!(status, "blocked");
    assert!(blocked_at.is_some());
    assert!(last_error
        .unwrap_or_default()
        .contains("PAYLOAD_VALIDATION_FAILED"));

    let event_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM app.event_log WHERE publish_key = $1")
            .bind(&publish_key)
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(event_count, 0);
}
