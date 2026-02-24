use anyhow::{anyhow, Result};
use async_trait::async_trait;
use banji_api::{
    config::AppConfig,
    jobs::{
        outbox,
        publisher::ConfirmingPublisher,
        relay::relay_once,
        types::{JobEnvelope, WorkloadClass},
    },
};
use std::{env, time::Duration};

struct FailingPublisher;

#[async_trait]
impl ConfirmingPublisher for FailingPublisher {
    async fn publish_with_confirm(
        &self,
        _exchange: &str,
        _routing_key: &str,
        _envelope: &JobEnvelope,
    ) -> Result<()> {
        Err(anyhow!("broker unavailable"))
    }
}

fn test_cfg(db_url: String) -> AppConfig {
    AppConfig {
        system: "banji-core".to_string(),
        env: "test".to_string(),
        service: "outbox-relay".to_string(),
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
        database_runtime_url: Some(db_url),
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

    let enqueue_key = "relay-requeue-test-key";
    sqlx::query("DELETE FROM app.job_outbox WHERE enqueue_key = $1")
        .bind(enqueue_key)
        .execute(&pool)
        .await
        .unwrap();

    let mut tx = pool.begin().await.unwrap();
    let row_id = outbox::enqueue_tx(
        &mut tx,
        enqueue_key,
        "write-demo",
        WorkloadClass::Fast,
        "job.fast.write-demo",
        &serde_json::json!({"demo":true}),
    )
    .await
    .unwrap();
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
