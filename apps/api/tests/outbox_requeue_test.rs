use anyhow::{anyhow, Result};
use async_trait::async_trait;
use banji_api::{
    config::{AppConfig, EdgeProvider},
    jobs::{
        outbox,
        publisher::ConfirmingPublisher,
        relay::relay_once,
        schema::build_write_demo_job_v1,
        types::{JobEnvelope, WorkloadClass},
    },
};
use std::{
    env,
    sync::{Arc, Mutex},
    time::Duration,
};

struct FailingPublisher;
#[derive(Clone, Default)]
struct RecordingPublisher {
    published: Arc<Mutex<Vec<(JobEnvelope, banji_api::jobs::publisher::MessageHeaders)>>>,
}

#[async_trait]
impl ConfirmingPublisher for FailingPublisher {
    async fn publish_with_confirm(
        &self,
        _exchange: &str,
        _routing_key: &str,
        _envelope: &JobEnvelope,
        _headers: &banji_api::jobs::publisher::MessageHeaders,
    ) -> Result<()> {
        Err(anyhow!("broker unavailable"))
    }
}

#[async_trait]
impl ConfirmingPublisher for RecordingPublisher {
    async fn publish_with_confirm(
        &self,
        _exchange: &str,
        _routing_key: &str,
        envelope: &JobEnvelope,
        headers: &banji_api::jobs::publisher::MessageHeaders,
    ) -> Result<()> {
        self.published
            .lock()
            .unwrap()
            .push((envelope.clone(), headers.clone()));
        Ok(())
    }
}

fn test_cfg(db_url: String) -> AppConfig {
    AppConfig {
        app_role: banji_api::config::AppRole::Api,
        system: "banji-core".to_string(),
        env: "test".to_string(),
        service: "outbox-relay".to_string(),
        instance_id: "outbox-relay-test-1".to_string(),
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
        observability_rabbit_queue_poll_interval: Duration::from_secs(15),
        observability_postgres_lock_poll_interval: Duration::from_secs(15),
        observability_job_pressure_poll_interval: Duration::from_secs(15),
        edge_request_max_bytes: 262_144,
        edge_write_request_max_bytes: 65_536,
        edge_cors_allowed_origins: vec![],
        edge_trust_cf_connecting_ip: false,
    }
}

#[tokio::test]
async fn relay_publish_failures_are_requeued_as_pending() {
    let Some(db_url) = env::var("DATABASE_RUNTIME_URL").ok() else {
        eprintln!("Skipping test: DATABASE_RUNTIME_URL not set");
        return;
    };

    let pool = sqlx::PgPool::connect(&db_url).await.unwrap();
    sqlx::migrate!("./migrations").run(&pool).await.unwrap();

    let enqueue_key = banji_api::jobs::key::derive_job_key(
        "api",
        "write-demo",
        "write-demo",
        "caller-relay:relay-requeue",
        "idem-relay-requeue",
    );
    sqlx::query("DELETE FROM app.job_outbox WHERE enqueue_key = $1")
        .bind(&enqueue_key)
        .execute(&pool)
        .await
        .unwrap();

    let mut tx = pool.begin().await.unwrap();
    let job = build_write_demo_job_v1(
        "api".to_string(),
        "relay-requeue".to_string(),
        "caller-relay".to_string(),
        "idem-relay-requeue".to_string(),
        "corr-relay-requeue-test".to_string(),
        4,
    )
    .unwrap();
    assert_eq!(job.job_key, enqueue_key);
    let row_id = outbox::enqueue_tx(&mut tx, &job).await.unwrap();
    tx.commit().await.unwrap();

    let cfg = test_cfg(db_url);
    let published = relay_once(&pool, &cfg, WorkloadClass::Fast, &FailingPublisher, 10)
        .await
        .unwrap();
    assert_eq!(published, 0);

    let (status, last_error): (String, Option<String>) =
        sqlx::query_as("SELECT status, last_error FROM app.job_outbox WHERE id = $1")
            .bind(row_id)
            .fetch_one(&pool)
            .await
            .unwrap();

    assert_eq!(status, "pending");
    assert!(last_error
        .unwrap_or_default()
        .contains("broker unavailable"));
}

#[tokio::test]
async fn relay_uses_persisted_observability_headers_when_present() {
    let Some(db_url) = env::var("DATABASE_RUNTIME_URL").ok() else {
        eprintln!("Skipping test: DATABASE_RUNTIME_URL not set");
        return;
    };

    let pool = sqlx::PgPool::connect(&db_url).await.unwrap();
    sqlx::migrate!("./migrations").run(&pool).await.unwrap();

    let enqueue_key = banji_api::jobs::key::derive_job_key(
        "api",
        "write-demo",
        "write-demo",
        "caller-relay:relay-observability",
        "idem-relay-observability",
    );
    sqlx::query("DELETE FROM app.job_outbox WHERE enqueue_key = $1")
        .bind(&enqueue_key)
        .execute(&pool)
        .await
        .unwrap();

    let mut tx = pool.begin().await.unwrap();
    let mut job = build_write_demo_job_v1(
        "api".to_string(),
        "relay-observability".to_string(),
        "caller-relay".to_string(),
        "idem-relay-observability".to_string(),
        "corr-relay-observability".to_string(),
        4,
    )
    .unwrap();
    job.metadata = serde_json::json!({
        "observability": {
            "x-correlation-id": "corr-relay-observability",
            "traceparent": "00-22222222222222222222222222222222-00f067aa0ba902b7-01"
        }
    });
    outbox::enqueue_tx(&mut tx, &job).await.unwrap();
    tx.commit().await.unwrap();

    let publisher = RecordingPublisher::default();
    let cfg = test_cfg(db_url);
    let published = relay_once(&pool, &cfg, WorkloadClass::Fast, &publisher, 10)
        .await
        .unwrap();
    assert_eq!(published, 1);

    let published = publisher.published.lock().unwrap();
    assert_eq!(published.len(), 1);
    assert_eq!(published[0].0.correlation_id, "corr-relay-observability");
    assert_eq!(
        published[0].1.get("x-correlation-id").map(String::as_str),
        Some("corr-relay-observability")
    );
    assert_eq!(
        published[0].1.get("traceparent").map(String::as_str),
        Some("00-22222222222222222222222222222222-00f067aa0ba902b7-01")
    );
}

#[tokio::test]
async fn relay_keeps_human_correlation_for_legacy_rows_without_w3c_headers() {
    let Some(db_url) = env::var("DATABASE_RUNTIME_URL").ok() else {
        eprintln!("Skipping test: DATABASE_RUNTIME_URL not set");
        return;
    };

    let pool = sqlx::PgPool::connect(&db_url).await.unwrap();
    sqlx::migrate!("./migrations").run(&pool).await.unwrap();

    let enqueue_key = banji_api::jobs::key::derive_job_key(
        "api",
        "write-demo",
        "write-demo",
        "caller-relay:relay-legacy",
        "idem-relay-legacy",
    );
    sqlx::query("DELETE FROM app.job_outbox WHERE enqueue_key = $1")
        .bind(&enqueue_key)
        .execute(&pool)
        .await
        .unwrap();

    let mut tx = pool.begin().await.unwrap();
    let job = build_write_demo_job_v1(
        "api".to_string(),
        "relay-legacy".to_string(),
        "caller-relay".to_string(),
        "idem-relay-legacy".to_string(),
        "corr-relay-legacy".to_string(),
        4,
    )
    .unwrap();
    outbox::enqueue_tx(&mut tx, &job).await.unwrap();
    tx.commit().await.unwrap();

    let publisher = RecordingPublisher::default();
    let cfg = test_cfg(db_url);
    let published = relay_once(&pool, &cfg, WorkloadClass::Fast, &publisher, 10)
        .await
        .unwrap();
    assert_eq!(published, 1);

    let published = publisher.published.lock().unwrap();
    assert_eq!(published.len(), 1);
    assert_eq!(published[0].0.correlation_id, "corr-relay-legacy");
    assert_eq!(
        published[0].1.get("x-correlation-id").map(String::as_str),
        Some("corr-relay-legacy")
    );
    assert!(!published[0].1.contains_key("traceparent"));
}
