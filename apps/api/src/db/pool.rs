use crate::{
    config::{AppConfig, DatabaseRuntimeEndpointKind, PgbouncerPoolMode},
    observability::metrics,
};
use anyhow::{Context, Result};
use sqlx::{
    postgres::{PgConnectOptions, PgPoolOptions},
    PgPool, Postgres, Transaction,
};
use std::{str::FromStr, time::Instant};

pub fn should_disable_statement_cache(config: &AppConfig) -> bool {
    config.database_runtime_endpoint_kind == DatabaseRuntimeEndpointKind::Pgbouncer
        && config.pgbouncer_pool_mode == Some(PgbouncerPoolMode::Transaction)
}

pub async fn build_runtime_pool(config: &AppConfig) -> Result<Option<PgPool>> {
    let Some(runtime_url) = config.database_runtime_url.as_deref() else {
        return Ok(None);
    };

    let runtime_url_with_connect_timeout = with_connect_timeout(
        runtime_url,
        duration_ms_to_seconds_ceil(config.sqlx_pool_connect_timeout),
    );

    let mut connect_options = PgConnectOptions::from_str(&runtime_url_with_connect_timeout)
        .context("failed to parse DATABASE_RUNTIME_URL")?
        .application_name(&format!(
            "{}-{}-{}",
            config.system, config.env, config.service
        ));

    if should_disable_statement_cache(config) {
        connect_options = connect_options.statement_cache_capacity(0);
    }

    let pool = PgPoolOptions::new()
        .max_connections(config.sqlx_pool_max_connections)
        .min_connections(config.sqlx_pool_min_connections)
        .acquire_timeout(config.sqlx_pool_acquire_timeout)
        .idle_timeout(Some(config.sqlx_pool_idle_timeout))
        .max_lifetime(Some(config.sqlx_pool_max_lifetime))
        .connect_with(connect_options)
        .await
        .context("failed to connect SQLx runtime pool")?;

    Ok(Some(pool))
}

pub async fn warmup_runtime_pool(pool: &PgPool) -> Result<()> {
    let started = Instant::now();
    let warmup_result = sqlx::query_scalar::<_, i32>("SELECT 1")
        .fetch_one(pool)
        .await;
    metrics::record_db_pool_acquire_wait(started.elapsed().as_secs_f64());

    if let Err(error) = &warmup_result {
        metrics::record_db_pool_acquire_failure(classify_acquire_failure(error));
    }

    warmup_result.context("database warmup query failed")?;
    Ok(())
}

pub async fn begin_with_pool_metrics(
    pool: &PgPool,
) -> Result<Transaction<'_, Postgres>, sqlx::Error> {
    let started = Instant::now();
    let begin_result = pool.begin().await;
    metrics::record_db_pool_acquire_wait(started.elapsed().as_secs_f64());

    if let Err(error) = &begin_result {
        metrics::record_db_pool_acquire_failure(classify_acquire_failure(error));
    }

    begin_result
}

fn classify_acquire_failure(error: &sqlx::Error) -> &'static str {
    let lowered = error.to_string().to_ascii_lowercase();
    if lowered.contains("timeout") || lowered.contains("timed out") {
        "timeout"
    } else {
        "other"
    }
}

fn with_connect_timeout(runtime_url: &str, timeout_seconds: u64) -> String {
    if runtime_url.contains("connect_timeout=") {
        return runtime_url.to_string();
    }
    let separator = if runtime_url.contains('?') { "&" } else { "?" };
    format!("{runtime_url}{separator}connect_timeout={timeout_seconds}")
}

fn duration_ms_to_seconds_ceil(duration: std::time::Duration) -> u64 {
    let millis = duration.as_millis().max(1);
    let seconds = millis.div_ceil(1000);
    seconds.min(u64::MAX as u128) as u64
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    fn base_config() -> AppConfig {
        AppConfig {
            app_role: crate::config::AppRole::Api,
            system: "banji-core".to_string(),
            env: "test".to_string(),
            service: "api".to_string(),
            auth_enabled: false,
            auth_jwks_url: None,
            auth_issuer: None,
            auth_audience: None,
            auth_jwks_cache_ttl: Duration::from_secs(300),
            auth_jwks_timeout: Duration::from_millis(1_000),
            auth_clock_skew: Duration::from_secs(30),
            idempotency_retention_days: 30,
            cache_enabled: false,
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
            rabbit_exchange_jobs: "banji-core.test.jobs".to_string(),
            rabbit_dlx_exchange: "banji-core.test.jobs.dlx".to_string(),
            rabbit_retry_1_ttl_ms: 30_000,
            rabbit_retry_2_ttl_ms: 300_000,
            rabbit_retry_3_ttl_ms: 1_800_000,
            rabbit_prefetch_fast: 20,
            rabbit_prefetch_heavy: 2,
            rabbit_max_attempts: 4,
            redis_url: None,
            database_runtime_url: Some("postgres://example.invalid/banji".to_string()),
            database_runtime_endpoint_kind: DatabaseRuntimeEndpointKind::Pgbouncer,
            pgbouncer_pool_mode: Some(PgbouncerPoolMode::Transaction),
            sqlx_pool_max_connections: 10,
            sqlx_pool_min_connections: 1,
            sqlx_pool_acquire_timeout: Duration::from_millis(2_000),
            sqlx_pool_connect_timeout: Duration::from_millis(2_000),
            sqlx_pool_idle_timeout: Duration::from_secs(300),
            sqlx_pool_max_lifetime: Duration::from_secs(1_800),
            postgres_connection_budget_total: 80,
            edge_enforcement_enabled: false,
            edge_provider: crate::config::EdgeProvider::None,
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

    #[test]
    fn transaction_mode_on_pgbouncer_disables_statement_cache() {
        let cfg = base_config();
        assert!(should_disable_statement_cache(&cfg));
    }

    #[test]
    fn direct_endpoint_does_not_force_statement_cache_disable() {
        let mut cfg = base_config();
        cfg.database_runtime_endpoint_kind = DatabaseRuntimeEndpointKind::Direct;
        cfg.pgbouncer_pool_mode = None;
        assert!(!should_disable_statement_cache(&cfg));
    }

    #[test]
    fn connect_timeout_is_added_when_missing() {
        let url = with_connect_timeout("postgres://db.example/banji", 2);
        assert!(url.contains("connect_timeout=2"));
    }

    #[test]
    fn existing_connect_timeout_is_not_overridden() {
        let url = with_connect_timeout("postgres://db.example/banji?connect_timeout=5", 2);
        assert!(url.ends_with("connect_timeout=5"));
    }

    #[test]
    fn duration_ms_to_seconds_uses_ceil() {
        assert_eq!(duration_ms_to_seconds_ceil(Duration::from_millis(1_500)), 2);
        assert_eq!(duration_ms_to_seconds_ceil(Duration::from_millis(2_000)), 2);
        assert_eq!(duration_ms_to_seconds_ceil(Duration::from_millis(0)), 1);
    }
}
