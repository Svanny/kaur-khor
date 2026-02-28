use crate::{config::AppConfig, logging::redaction::redact_message, observability::metrics};
use anyhow::{anyhow, Result};
use reqwest::Client;
use serde::Deserialize;
use sqlx::{PgPool, Row};
use std::{collections::HashMap, time::Duration};
use tokio::time::MissedTickBehavior;

const RABBIT_QUEUE_KINDS: [(&str, &str); 5] = [
    ("primary", ""),
    ("retry_1", ".retry.1"),
    ("retry_2", ".retry.2"),
    ("retry_3", ".retry.3"),
    ("dlq", ".dlq"),
];

#[derive(Debug, Clone, PartialEq, Eq)]
struct QueueDescriptor {
    workload_class: &'static str,
    queue_kind: &'static str,
    queue_name: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct QueueSample {
    workload_class: &'static str,
    queue_kind: &'static str,
    ready: i64,
    unacked: i64,
    depth: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct PostgresLockSnapshot {
    waiting_sessions: i64,
    blocking_sessions: i64,
    oldest_wait_seconds: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct JobPressureSnapshot {
    running_attempts: i64,
    oldest_running_age_seconds: i64,
    stale_heartbeat_count: i64,
}

#[derive(Debug, Deserialize)]
struct RabbitQueueResponse {
    name: String,
    #[serde(default)]
    messages_ready: i64,
    #[serde(default)]
    messages_unacknowledged: i64,
    #[serde(default)]
    messages: i64,
}

pub fn spawn_dependency_samplers(cfg: AppConfig, pool: PgPool) {
    spawn_postgres_lock_sampler(pool.clone(), cfg.observability_postgres_lock_poll_interval);
    spawn_job_pressure_sampler(pool, cfg.observability_job_pressure_poll_interval);
    if let Some(base_url) = cfg.rabbit_management_api_base_url.clone() {
        spawn_rabbit_queue_sampler(cfg, base_url);
    }
}

fn spawn_postgres_lock_sampler(pool: PgPool, poll_interval: Duration) {
    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(poll_interval);
        ticker.set_missed_tick_behavior(MissedTickBehavior::Skip);
        loop {
            ticker.tick().await;
            match sample_postgres_locks(&pool).await {
                Ok(snapshot) => {
                    metrics::set_postgres_lock_waiting_sessions(snapshot.waiting_sessions);
                    metrics::set_postgres_lock_blocking_sessions(snapshot.blocking_sessions);
                    metrics::set_postgres_lock_oldest_wait_seconds(snapshot.oldest_wait_seconds);
                }
                Err(err) => log_sampler_error("postgres lock", &err),
            }
        }
    });
}

fn spawn_job_pressure_sampler(pool: PgPool, poll_interval: Duration) {
    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(poll_interval);
        ticker.set_missed_tick_behavior(MissedTickBehavior::Skip);
        loop {
            ticker.tick().await;
            match sample_job_pressure(&pool).await {
                Ok(snapshot) => {
                    metrics::set_job_attempt_running(snapshot.running_attempts);
                    metrics::set_job_attempt_oldest_running_age_seconds(
                        snapshot.oldest_running_age_seconds,
                    );
                    metrics::set_job_attempt_stale_heartbeat(snapshot.stale_heartbeat_count);
                }
                Err(err) => log_sampler_error("job pressure", &err),
            }
        }
    });
}

fn spawn_rabbit_queue_sampler(cfg: AppConfig, base_url: String) {
    tokio::spawn(async move {
        let Some(username) = cfg.rabbit_management_username.clone() else {
            return;
        };
        let Some(password) = cfg.rabbit_management_password.clone() else {
            return;
        };
        let client = Client::builder()
            .timeout(Duration::from_secs(5))
            .build()
            .expect("reqwest client build should not fail");
        let monitored_queues = monitored_rabbit_queues(&cfg);
        let mut ticker = tokio::time::interval(cfg.observability_rabbit_queue_poll_interval);
        ticker.set_missed_tick_behavior(MissedTickBehavior::Skip);

        loop {
            ticker.tick().await;
            match sample_rabbit_queues(&client, &base_url, &username, &password, &monitored_queues)
                .await
            {
                Ok(samples) => {
                    for sample in samples {
                        metrics::set_rabbit_queue_ready(
                            sample.workload_class,
                            sample.queue_kind,
                            sample.ready,
                        );
                        metrics::set_rabbit_queue_unacked(
                            sample.workload_class,
                            sample.queue_kind,
                            sample.unacked,
                        );
                        metrics::set_rabbit_queue_depth(
                            sample.workload_class,
                            sample.queue_kind,
                            sample.depth,
                        );
                    }
                }
                Err(err) => log_sampler_error("rabbit queue", &err),
            }
        }
    });
}

fn monitored_rabbit_queues(cfg: &AppConfig) -> Vec<QueueDescriptor> {
    let mut descriptors = Vec::with_capacity(10);
    for workload_class in ["fast", "heavy"] {
        let base = format!("{}.{}.{}-jobs", cfg.system, cfg.env, workload_class);
        for (queue_kind, suffix) in RABBIT_QUEUE_KINDS {
            descriptors.push(QueueDescriptor {
                workload_class,
                queue_kind,
                queue_name: format!("{base}{suffix}"),
            });
        }
    }
    descriptors
}

async fn sample_rabbit_queues(
    client: &Client,
    base_url: &str,
    username: &str,
    password: &str,
    descriptors: &[QueueDescriptor],
) -> Result<Vec<QueueSample>> {
    let queues_url = format!("{}/api/queues", base_url.trim_end_matches('/'));
    let response = client
        .get(&queues_url)
        .basic_auth(username, Some(password))
        .send()
        .await
        .map_err(|_| anyhow!("rabbit management request failed"))?;
    if !response.status().is_success() {
        return Err(anyhow!(
            "rabbit management request failed with status {}",
            response.status()
        ));
    }
    let queues: Vec<RabbitQueueResponse> = response
        .json()
        .await
        .map_err(|_| anyhow!("rabbit management response decoding failed"))?;
    Ok(merge_rabbit_queue_samples(descriptors, &queues))
}

fn merge_rabbit_queue_samples(
    descriptors: &[QueueDescriptor],
    queues: &[RabbitQueueResponse],
) -> Vec<QueueSample> {
    let queue_map = queues
        .iter()
        .map(|queue| (queue.name.as_str(), queue))
        .collect::<HashMap<_, _>>();
    descriptors
        .iter()
        .map(|descriptor| {
            let queue = queue_map.get(descriptor.queue_name.as_str());
            QueueSample {
                workload_class: descriptor.workload_class,
                queue_kind: descriptor.queue_kind,
                ready: queue.map(|queue| queue.messages_ready.max(0)).unwrap_or(0),
                unacked: queue
                    .map(|queue| queue.messages_unacknowledged.max(0))
                    .unwrap_or(0),
                depth: queue.map(|queue| queue.messages.max(0)).unwrap_or(0),
            }
        })
        .collect()
}

async fn sample_postgres_locks(pool: &PgPool) -> Result<PostgresLockSnapshot> {
    let row = sqlx::query(
        r#"
        SELECT
          COUNT(*) FILTER (WHERE wait_event_type = 'Lock')::bigint AS waiting_sessions,
          COUNT(DISTINCT blocker_pid)::bigint AS blocking_sessions,
          COALESCE(
            MAX(
              CASE
                WHEN wait_event_type = 'Lock'
                THEN GREATEST(EXTRACT(EPOCH FROM (NOW() - query_start))::bigint, 0)
                ELSE 0
              END
            ),
            0
          )::bigint AS oldest_wait_seconds
        FROM (
          SELECT
            blocked.pid,
            blocked.wait_event_type,
            blocked.query_start,
            unnest(pg_blocking_pids(blocked.pid)) AS blocker_pid
          FROM pg_stat_activity blocked
          WHERE blocked.datname = current_database()
            AND blocked.pid <> pg_backend_pid()
        ) blocked
        "#,
    )
    .fetch_one(pool)
    .await?;

    Ok(postgres_lock_snapshot_from_values(
        row.get::<i64, _>("waiting_sessions"),
        row.get::<i64, _>("blocking_sessions"),
        row.get::<i64, _>("oldest_wait_seconds"),
    ))
}

fn postgres_lock_snapshot_from_values(
    waiting_sessions: i64,
    blocking_sessions: i64,
    oldest_wait_seconds: i64,
) -> PostgresLockSnapshot {
    PostgresLockSnapshot {
        waiting_sessions: waiting_sessions.max(0),
        blocking_sessions: blocking_sessions.max(0),
        oldest_wait_seconds: oldest_wait_seconds.max(0),
    }
}

async fn sample_job_pressure(pool: &PgPool) -> Result<JobPressureSnapshot> {
    let row = sqlx::query(
        r#"
        SELECT
          COUNT(*) FILTER (WHERE status = 'running')::bigint AS running_attempts,
          COALESCE(
            MAX(
              CASE
                WHEN status = 'running'
                THEN GREATEST(EXTRACT(EPOCH FROM (NOW() - started_at))::bigint, 0)
                ELSE 0
              END
            ),
            0
          )::bigint AS oldest_running_age_seconds,
          COUNT(*) FILTER (
            WHERE status = 'running'
              AND lease_expires_at IS NOT NULL
              AND lease_expires_at <= NOW()
          )::bigint AS stale_heartbeat_count
        FROM app.job_run_attempt
        "#,
    )
    .fetch_one(pool)
    .await?;

    Ok(job_pressure_snapshot_from_values(
        row.get::<i64, _>("running_attempts"),
        row.get::<i64, _>("oldest_running_age_seconds"),
        row.get::<i64, _>("stale_heartbeat_count"),
    ))
}

fn job_pressure_snapshot_from_values(
    running_attempts: i64,
    oldest_running_age_seconds: i64,
    stale_heartbeat_count: i64,
) -> JobPressureSnapshot {
    JobPressureSnapshot {
        running_attempts: running_attempts.max(0),
        oldest_running_age_seconds: oldest_running_age_seconds.max(0),
        stale_heartbeat_count: stale_heartbeat_count.max(0),
    }
}

fn log_sampler_error(name: &str, err: &anyhow::Error) {
    let safe_error = redact_message(&format!("{:#}", err));
    tracing::warn!(error = %safe_error, sampler = %name, "dependency sampler failed");
}

#[cfg(test)]
mod tests {
    use super::{
        job_pressure_snapshot_from_values, merge_rabbit_queue_samples, monitored_rabbit_queues,
        postgres_lock_snapshot_from_values, QueueDescriptor, RabbitQueueResponse,
    };
    use crate::config::{AppConfig, AppRole, DatabaseRuntimeEndpointKind, EdgeProvider};
    use std::time::Duration;

    fn base_config() -> AppConfig {
        AppConfig {
            app_role: AppRole::Api,
            system: "banji-core".to_string(),
            env: "prod".to_string(),
            service: "api".to_string(),
            instance_id: "api-1".to_string(),
            auth_enabled: true,
            auth_jwks_url: Some("https://example.com/jwks".to_string()),
            auth_issuer: Some("https://example.com".to_string()),
            auth_audience: Some("banji".to_string()),
            auth_jwks_cache_ttl: Duration::from_secs(300),
            auth_jwks_timeout: Duration::from_secs(1),
            auth_clock_skew: Duration::from_secs(30),
            idempotency_retention_days: 30,
            cache_enabled: true,
            cache_schema_version: "v1".to_string(),
            cache_default_ttl: Duration::from_secs(300),
            cache_ttl_jitter: Duration::from_secs(30),
            redis_connect_timeout: Duration::from_millis(100),
            redis_command_timeout: Duration::from_millis(50),
            redis_circuit_error_threshold: 20,
            redis_circuit_window: Duration::from_secs(30),
            redis_circuit_cooldown: Duration::from_secs(60),
            redis_log_rate_limit: Duration::from_secs(30),
            event_payload_max_bytes: 65_536,
            event_relay_batch_size: 100,
            event_relay_poll_interval: Duration::from_millis(500),
            event_relay_retry_backoff: Duration::from_millis(1_000),
            event_relay_max_backoff: Duration::from_millis(60_000),
            event_relay_block_after_attempts: 25,
            event_outbox_published_retention_days: 7,
            rabbit_url: None,
            rabbit_vhost: "/".to_string(),
            rabbit_exchange_jobs: "banji-core.prod.jobs".to_string(),
            rabbit_exchange_jobs_replay: "banji-core.prod.jobs.replay".to_string(),
            rabbit_dlx_exchange: "banji-core.prod.jobs.dlx".to_string(),
            rabbit_management_api_base_url: Some("https://rabbit.example.com".to_string()),
            rabbit_management_username: Some("banji".to_string()),
            rabbit_management_password: Some("secret".to_string()),
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
            sqlx_pool_acquire_timeout: Duration::from_secs(2),
            sqlx_pool_connect_timeout: Duration::from_secs(2),
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
            edge_backpressure_poll_interval: Duration::from_secs(1),
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

    #[test]
    fn rabbit_queue_descriptors_cover_expected_topology() {
        let descriptors = monitored_rabbit_queues(&base_config());
        assert_eq!(descriptors.len(), 10);
        assert!(descriptors.iter().any(|descriptor| {
            descriptor.workload_class == "fast"
                && descriptor.queue_kind == "retry_2"
                && descriptor.queue_name == "banji-core.prod.fast-jobs.retry.2"
        }));
    }

    #[test]
    fn rabbit_queue_samples_map_ready_unacked_and_depth() {
        let descriptors = vec![QueueDescriptor {
            workload_class: "fast",
            queue_kind: "primary",
            queue_name: "banji-core.prod.fast-jobs".to_string(),
        }];
        let queues = vec![RabbitQueueResponse {
            name: "banji-core.prod.fast-jobs".to_string(),
            messages_ready: 5,
            messages_unacknowledged: 2,
            messages: 7,
        }];

        let samples = merge_rabbit_queue_samples(&descriptors, &queues);
        assert_eq!(samples[0].ready, 5);
        assert_eq!(samples[0].unacked, 2);
        assert_eq!(samples[0].depth, 7);
    }

    #[test]
    fn rabbit_queue_samples_default_missing_queues_to_zero() {
        let descriptors = vec![QueueDescriptor {
            workload_class: "heavy",
            queue_kind: "dlq",
            queue_name: "banji-core.prod.heavy-jobs.dlq".to_string(),
        }];
        let samples = merge_rabbit_queue_samples(&descriptors, &[]);
        assert_eq!(samples[0].ready, 0);
        assert_eq!(samples[0].unacked, 0);
        assert_eq!(samples[0].depth, 0);
    }

    #[test]
    fn postgres_lock_snapshot_clamps_negative_values() {
        let snapshot = postgres_lock_snapshot_from_values(-1, 2, -4);
        assert_eq!(snapshot.waiting_sessions, 0);
        assert_eq!(snapshot.blocking_sessions, 2);
        assert_eq!(snapshot.oldest_wait_seconds, 0);
    }

    #[test]
    fn job_pressure_snapshot_clamps_negative_values() {
        let snapshot = job_pressure_snapshot_from_values(3, -8, -1);
        assert_eq!(snapshot.running_attempts, 3);
        assert_eq!(snapshot.oldest_running_age_seconds, 0);
        assert_eq!(snapshot.stale_heartbeat_count, 0);
    }

    #[test]
    fn alert_rules_define_expected_slo_and_runbook_entries() {
        let rules = include_str!("../../../../tool/otel/alerts/banji-alert-rules.yaml");
        assert!(rules.contains("BanjiApiAvailabilityFastBurn"));
        assert!(rules.contains("BanjiBackpressureCritical"));
        assert!(rules.contains("slo-alerting.md"));
        assert!(rules.contains("Kafka lag intentionally deferred"));
    }
}
