use crate::{
    jobs::{outbox, repository},
    observability::{metrics, ResponseClassification},
    AppState,
};
use anyhow::{Context, Result};
use axum::{
    body::Body,
    extract::{MatchedPath, State},
    http::{Method, Request, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};
use std::{
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::sync::RwLock;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BackpressureSignal {
    RabbitPublish,
    WorkerCompletion,
    KafkaResult,
}

impl BackpressureSignal {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::RabbitPublish => "rabbit_publish",
            Self::WorkerCompletion => "worker_completion",
            Self::KafkaResult => "kafka_result",
        }
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct DependencyHealthState {
    pub pending_count: i64,
    pub oldest_age_seconds: i64,
    pub unhealthy: bool,
}

#[derive(Clone, Debug)]
pub struct BackpressureSnapshot {
    pub sampled_at: Option<Instant>,
    pub rabbit_publish: DependencyHealthState,
    pub worker_completion: DependencyHealthState,
    pub kafka_result: Option<DependencyHealthState>,
    pub gate_open: bool,
    pub consecutive_unhealthy: u32,
    pub consecutive_healthy: u32,
    pub active_signal: Option<BackpressureSignal>,
}

impl Default for BackpressureSnapshot {
    fn default() -> Self {
        Self {
            sampled_at: None,
            rabbit_publish: DependencyHealthState::default(),
            worker_completion: DependencyHealthState::default(),
            kafka_result: None,
            gate_open: false,
            consecutive_unhealthy: 0,
            consecutive_healthy: 0,
            active_signal: None,
        }
    }
}

#[derive(Clone)]
pub struct BackpressureGate {
    inner: Arc<RwLock<BackpressureSnapshot>>,
    enabled: bool,
    poll_interval: Duration,
    retry_after_seconds: u64,
    consecutive_unhealthy: u32,
    consecutive_healthy: u32,
    job_outbox_pending_max: i64,
    job_outbox_oldest_age_seconds_max: i64,
    job_run_pending_max: i64,
    job_run_oldest_age_seconds_max: i64,
    kafka_pending_max: i64,
    kafka_oldest_age_seconds_max: i64,
}

impl BackpressureGate {
    pub fn new(cfg: &crate::config::AppConfig) -> Self {
        Self {
            inner: Arc::new(RwLock::new(BackpressureSnapshot::default())),
            enabled: cfg.edge_backpressure_enabled,
            poll_interval: cfg.edge_backpressure_poll_interval,
            retry_after_seconds: cfg.edge_backpressure_retry_after_seconds,
            consecutive_unhealthy: cfg.edge_backpressure_consecutive_unhealthy,
            consecutive_healthy: cfg.edge_backpressure_consecutive_healthy,
            job_outbox_pending_max: cfg.edge_backpressure_job_outbox_pending_max,
            job_outbox_oldest_age_seconds_max: cfg
                .edge_backpressure_job_outbox_oldest_age_seconds_max,
            job_run_pending_max: cfg.edge_backpressure_job_run_pending_max,
            job_run_oldest_age_seconds_max: cfg.edge_backpressure_job_run_oldest_age_seconds_max,
            kafka_pending_max: cfg.edge_backpressure_kafka_pending_max,
            kafka_oldest_age_seconds_max: cfg.edge_backpressure_kafka_oldest_age_seconds_max,
        }
    }

    pub fn retry_after_seconds(&self) -> u64 {
        self.retry_after_seconds
    }

    pub fn enabled(&self) -> bool {
        self.enabled
    }

    pub async fn snapshot(&self) -> BackpressureSnapshot {
        self.inner.read().await.clone()
    }

    pub async fn update_sample(
        &self,
        rabbit_publish: DependencyHealthState,
        worker_completion: DependencyHealthState,
        kafka_result: Option<DependencyHealthState>,
    ) {
        metrics::set_backpressure_signal(
            BackpressureSignal::RabbitPublish.as_str(),
            rabbit_publish.pending_count,
            rabbit_publish.oldest_age_seconds,
        );
        metrics::set_backpressure_signal(
            BackpressureSignal::WorkerCompletion.as_str(),
            worker_completion.pending_count,
            worker_completion.oldest_age_seconds,
        );
        if let Some(kafka_result) = kafka_result {
            metrics::set_backpressure_signal(
                BackpressureSignal::KafkaResult.as_str(),
                kafka_result.pending_count,
                kafka_result.oldest_age_seconds,
            );
        }

        let active_signal = unhealthy_signal(rabbit_publish, worker_completion, kafka_result);
        let mut snapshot = self.inner.write().await;
        snapshot.sampled_at = Some(Instant::now());
        snapshot.rabbit_publish = rabbit_publish;
        snapshot.worker_completion = worker_completion;
        snapshot.kafka_result = kafka_result;

        if let Some(signal) = active_signal {
            snapshot.consecutive_unhealthy = snapshot.consecutive_unhealthy.saturating_add(1);
            snapshot.consecutive_healthy = 0;
            if snapshot.consecutive_unhealthy >= self.consecutive_unhealthy {
                snapshot.gate_open = true;
                snapshot.active_signal = Some(signal);
            }
        } else {
            snapshot.consecutive_healthy = snapshot.consecutive_healthy.saturating_add(1);
            snapshot.consecutive_unhealthy = 0;
            if snapshot.consecutive_healthy >= self.consecutive_healthy {
                snapshot.gate_open = false;
                snapshot.active_signal = None;
            }
        }
    }

    pub async fn should_reject(&self) -> Option<BackpressureSignal> {
        if !self.enabled {
            return None;
        }

        let snapshot = self.inner.read().await;
        let Some(sampled_at) = snapshot.sampled_at else {
            metrics::record_backpressure_stale_snapshot();
            return None;
        };

        let stale_after = self
            .poll_interval
            .checked_mul(3)
            .unwrap_or(self.poll_interval);
        if sampled_at.elapsed() > stale_after {
            metrics::record_backpressure_stale_snapshot();
            return None;
        }

        if snapshot.gate_open {
            return snapshot.active_signal;
        }

        None
    }

    pub fn rabbit_publish_state(
        &self,
        pending_count: i64,
        oldest_age_seconds: i64,
    ) -> DependencyHealthState {
        DependencyHealthState {
            pending_count,
            oldest_age_seconds,
            unhealthy: pending_count >= self.job_outbox_pending_max
                || oldest_age_seconds >= self.job_outbox_oldest_age_seconds_max,
        }
    }

    pub fn worker_completion_state(
        &self,
        pending_count: i64,
        oldest_age_seconds: i64,
    ) -> DependencyHealthState {
        DependencyHealthState {
            pending_count,
            oldest_age_seconds,
            unhealthy: pending_count >= self.job_run_pending_max
                || oldest_age_seconds >= self.job_run_oldest_age_seconds_max,
        }
    }

    pub fn kafka_state(
        &self,
        pending_count: i64,
        oldest_age_seconds: i64,
    ) -> DependencyHealthState {
        DependencyHealthState {
            pending_count,
            oldest_age_seconds,
            unhealthy: pending_count >= self.kafka_pending_max
                || oldest_age_seconds >= self.kafka_oldest_age_seconds_max,
        }
    }
}

type SampledSignals = (
    DependencyHealthState,
    DependencyHealthState,
    Option<DependencyHealthState>,
);

pub fn spawn_backpressure_sampler(
    gate: Arc<BackpressureGate>,
    pool: sqlx::PgPool,
    kafka_enabled: bool,
) {
    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(gate.poll_interval);
        loop {
            ticker.tick().await;
            let sample = collect_sample(gate.as_ref(), &pool, kafka_enabled).await;
            apply_sample_result(gate.as_ref(), sample).await;

            if pool.is_closed() {
                break;
            }
        }
    });
}

async fn collect_sample(
    gate: &BackpressureGate,
    pool: &sqlx::PgPool,
    kafka_enabled: bool,
) -> Result<SampledSignals> {
    let rabbit_fast = outbox::count_pending(pool, crate::jobs::types::WorkloadClass::Fast)
        .await
        .context("querying fast outbox backlog")?;
    let rabbit_heavy = outbox::count_pending(pool, crate::jobs::types::WorkloadClass::Heavy)
        .await
        .context("querying heavy outbox backlog")?;
    let rabbit_oldest = outbox::oldest_pending_age_seconds(pool)
        .await
        .context("querying oldest pending outbox age")?;
    let (job_run_pending, job_run_oldest) = repository::queued_or_retrying_pressure(pool)
        .await
        .context("querying queued or retrying job pressure")?;
    let kafka_result = if kafka_enabled {
        let (pending, oldest) = repository::kafka_result_pressure(pool)
            .await
            .context("querying kafka result pressure")?;
        Some(gate.kafka_state(pending, oldest))
    } else {
        None
    };

    Ok((
        gate.rabbit_publish_state(rabbit_fast + rabbit_heavy, rabbit_oldest),
        gate.worker_completion_state(job_run_pending, job_run_oldest),
        kafka_result,
    ))
}

async fn apply_sample_result(gate: &BackpressureGate, sample: Result<SampledSignals>) {
    match sample {
        Ok((rabbit_publish, worker_completion, kafka_result)) => {
            gate.update_sample(rabbit_publish, worker_completion, kafka_result)
                .await;
        }
        Err(err) => {
            tracing::warn!(error = %err, "backpressure sampler failed");
        }
    }
}

pub async fn backpressure_middleware(
    State(state): State<AppState>,
    request: Request<Body>,
    next: Next,
) -> Response {
    if !state.backpressure_gate.enabled()
        || !request_targets_async_write(&request)
        || request.method() == Method::OPTIONS
    {
        return next.run(request).await;
    }

    if let Some(signal) = state.backpressure_gate.should_reject().await {
        metrics::record_backpressure_reject(signal.as_str());
        let retry_after = state.backpressure_gate.retry_after_seconds();
        let mut response = (
            StatusCode::SERVICE_UNAVAILABLE,
            axum::Json(serde_json::json!({
                "error_code":"DEPENDENCY_BACKPRESSURE",
                "error":"dependency backpressure is active; retry later"
            })),
        )
            .into_response();
        response.headers_mut().insert(
            "retry-after",
            axum::http::HeaderValue::from_str(&retry_after.to_string())
                .unwrap_or_else(|_| axum::http::HeaderValue::from_static("1")),
        );
        response
            .extensions_mut()
            .insert(ResponseClassification::DependencyBackpressure);
        return response;
    }

    next.run(request).await
}

fn request_targets_async_write(request: &Request<Body>) -> bool {
    if request.method() != Method::POST {
        return false;
    }

    request
        .extensions()
        .get::<MatchedPath>()
        .map(MatchedPath::as_str)
        .map(|route| matches!(route, "/v1/items" | "/v1/write-demo"))
        .unwrap_or(false)
}

fn unhealthy_signal(
    rabbit_publish: DependencyHealthState,
    worker_completion: DependencyHealthState,
    kafka_result: Option<DependencyHealthState>,
) -> Option<BackpressureSignal> {
    if rabbit_publish.unhealthy {
        return Some(BackpressureSignal::RabbitPublish);
    }
    if worker_completion.unhealthy {
        return Some(BackpressureSignal::WorkerCompletion);
    }
    if kafka_result.map(|state| state.unhealthy).unwrap_or(false) {
        return Some(BackpressureSignal::KafkaResult);
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{AppConfig, AppRole, DatabaseRuntimeEndpointKind, PgbouncerPoolMode};

    fn test_config() -> AppConfig {
        AppConfig {
            app_role: AppRole::Api,
            system: "banji-core".to_string(),
            env: "test".to_string(),
            service: "api".to_string(),
            instance_id: "api-test-1".to_string(),
            auth_enabled: true,
            auth_jwks_url: Some("https://example.com/.well-known/jwks.json".to_string()),
            auth_issuer: Some("https://issuer.example.com".to_string()),
            auth_audience: Some("banji-api".to_string()),
            auth_jwks_cache_ttl: Duration::from_secs(300),
            auth_jwks_timeout: Duration::from_secs(1),
            auth_clock_skew: Duration::from_secs(30),
            idempotency_retention_days: 30,
            cache_enabled: false,
            cache_schema_version: "v1".to_string(),
            cache_default_ttl: Duration::from_secs(300),
            cache_ttl_jitter: Duration::from_secs(0),
            redis_connect_timeout: Duration::from_secs(1),
            redis_command_timeout: Duration::from_secs(1),
            redis_circuit_error_threshold: 5,
            redis_circuit_window: Duration::from_secs(30),
            redis_circuit_cooldown: Duration::from_secs(30),
            redis_log_rate_limit: Duration::from_secs(30),
            event_payload_max_bytes: 65_536,
            event_relay_batch_size: 100,
            event_relay_poll_interval: Duration::from_millis(500),
            event_relay_retry_backoff: Duration::from_secs(1),
            event_relay_max_backoff: Duration::from_secs(60),
            event_relay_block_after_attempts: 25,
            event_outbox_published_retention_days: 7,
            rabbit_url: None,
            rabbit_vhost: "/".to_string(),
            rabbit_exchange_jobs: "jobs".to_string(),
            rabbit_exchange_jobs_replay: "jobs.replay".to_string(),
            rabbit_dlx_exchange: "jobs.dlx".to_string(),
            rabbit_management_api_base_url: None,
            rabbit_management_username: None,
            rabbit_management_password: None,
            rabbit_retry_1_ttl_ms: 1_000,
            rabbit_retry_2_ttl_ms: 2_000,
            rabbit_retry_3_ttl_ms: 3_000,
            rabbit_prefetch_fast: 5,
            rabbit_prefetch_heavy: 1,
            rabbit_replay_prefetch_fast: 5,
            rabbit_replay_prefetch_heavy: 1,
            rabbit_max_attempts: 4,
            job_result_kafka_enabled: false,
            job_result_kafka_topic_prefix: None,
            redis_url: None,
            database_runtime_url: None,
            database_runtime_endpoint_kind: DatabaseRuntimeEndpointKind::Direct,
            pgbouncer_pool_mode: Some(PgbouncerPoolMode::Session),
            sqlx_pool_max_connections: 2,
            sqlx_pool_min_connections: 1,
            sqlx_pool_acquire_timeout: Duration::from_secs(1),
            sqlx_pool_connect_timeout: Duration::from_secs(1),
            sqlx_pool_idle_timeout: Duration::from_secs(60),
            sqlx_pool_max_lifetime: Duration::from_secs(60),
            postgres_connection_budget_total: 20,
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
            edge_backpressure_poll_interval: Duration::from_millis(10),
            edge_backpressure_retry_after_seconds: 5,
            edge_backpressure_consecutive_unhealthy: 2,
            edge_backpressure_consecutive_healthy: 2,
            edge_backpressure_job_outbox_pending_max: 10,
            edge_backpressure_job_outbox_oldest_age_seconds_max: 30,
            edge_backpressure_job_run_pending_max: 10,
            edge_backpressure_job_run_oldest_age_seconds_max: 60,
            edge_backpressure_kafka_pending_max: 10,
            edge_backpressure_kafka_oldest_age_seconds_max: 30,
            observability_rabbit_queue_poll_interval: Duration::from_secs(15),
            observability_postgres_lock_poll_interval: Duration::from_secs(15),
            observability_job_pressure_poll_interval: Duration::from_secs(15),
            edge_request_max_bytes: 262_144,
            edge_write_request_max_bytes: 65_536,
            edge_cors_allowed_origins: vec![],
            edge_trust_forwarded_client_ip: false,
        }
    }

    #[tokio::test]
    async fn gate_opens_after_required_unhealthy_samples() {
        let gate = BackpressureGate::new(&test_config());
        let unhealthy = gate.rabbit_publish_state(11, 0);
        let healthy_worker = gate.worker_completion_state(0, 0);

        gate.update_sample(unhealthy, healthy_worker, None).await;
        assert_eq!(gate.should_reject().await, None);

        gate.update_sample(unhealthy, healthy_worker, None).await;
        assert_eq!(
            gate.should_reject().await,
            Some(BackpressureSignal::RabbitPublish)
        );
    }

    #[tokio::test]
    async fn stale_snapshot_fails_open() {
        let gate = BackpressureGate::new(&test_config());
        let unhealthy = gate.rabbit_publish_state(11, 0);
        let healthy_worker = gate.worker_completion_state(0, 0);

        gate.update_sample(unhealthy, healthy_worker, None).await;
        gate.update_sample(unhealthy, healthy_worker, None).await;
        {
            let mut snapshot = gate.inner.write().await;
            snapshot.sampled_at = Some(Instant::now() - Duration::from_millis(31));
        }

        assert_eq!(gate.should_reject().await, None);
    }

    #[tokio::test]
    async fn failed_sample_does_not_overwrite_last_good_snapshot() {
        let gate = BackpressureGate::new(&test_config());
        let healthy = gate.rabbit_publish_state(0, 0);
        let healthy_worker = gate.worker_completion_state(0, 0);

        gate.update_sample(healthy, healthy_worker, None).await;
        let before = gate.snapshot().await;

        apply_sample_result(&gate, Err(anyhow::anyhow!("database unavailable"))).await;
        let after = gate.snapshot().await;

        assert_eq!(after.sampled_at, before.sampled_at);
        assert_eq!(after.rabbit_publish, before.rabbit_publish);
        assert_eq!(after.worker_completion, before.worker_completion);
    }
}
