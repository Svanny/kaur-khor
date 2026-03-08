use banji_api::config::{
    resolve_api_bind_addr, resolve_service_name_from_env, AppConfig, AppRole,
    DatabaseRuntimeEndpointKind, PgbouncerPoolMode, WorkerConfig,
};
use std::sync::{Mutex, OnceLock};

const WORKER_OBJECT_STORAGE_ENV_KEYS: &[&str] = &[
    "OBJECT_STORAGE_ENABLED",
    "OBJECT_STORAGE_ENDPOINT",
    "OBJECT_STORAGE_REGION",
    "OBJECT_STORAGE_BUCKET_ARTIFACTS",
    "OBJECT_STORAGE_FORCE_PATH_STYLE",
    "OBJECT_STORAGE_ARTIFACT_PREFIX",
    "OBJECT_STORAGE_ARTIFACT_RETENTION_DAYS",
    "OBJECT_STORAGE_CONNECT_TIMEOUT_MS",
    "OBJECT_STORAGE_REQUEST_TIMEOUT_MS",
    "OBJECT_STORAGE_MAX_ARTIFACT_BYTES",
    "ARTIFACT_TMP_DIR",
    "OBJECT_STORAGE_ACCESS_KEY",
    "OBJECT_STORAGE_SECRET_KEY",
    "ALGORITHM_ROLLOUT_HASH_SALT",
    "ALGORITHM_ROLLOUT_HASH_SALT_VERSION",
];

fn env_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

fn lock_env() -> std::sync::MutexGuard<'static, ()> {
    env_lock()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn capture_env<'a>(keys: &'a [&'a str]) -> Vec<(&'a str, Option<String>)> {
    keys.iter()
        .map(|key| (*key, std::env::var(key).ok()))
        .collect()
}

fn restore_env<'a>(values: Vec<(&'a str, Option<String>)>) {
    for (key, value) in values {
        if let Some(value) = value {
            std::env::set_var(key, value);
        } else {
            std::env::remove_var(key);
        }
    }
}

fn set_minimal_worker_object_storage_env() {
    std::env::set_var("OBJECT_STORAGE_ENABLED", "true");
    std::env::set_var("OBJECT_STORAGE_ENDPOINT", "http://minio.local:9000");
    std::env::set_var("OBJECT_STORAGE_REGION", "us-east-1");
    std::env::set_var("OBJECT_STORAGE_BUCKET_ARTIFACTS", "banji-dev-artifacts");
    std::env::set_var("OBJECT_STORAGE_FORCE_PATH_STYLE", "true");
    std::env::set_var("OBJECT_STORAGE_ARTIFACT_PREFIX", "worker");
    std::env::set_var("OBJECT_STORAGE_ARTIFACT_RETENTION_DAYS", "30");
    std::env::set_var("OBJECT_STORAGE_CONNECT_TIMEOUT_MS", "3000");
    std::env::set_var("OBJECT_STORAGE_REQUEST_TIMEOUT_MS", "30000");
    std::env::set_var("OBJECT_STORAGE_MAX_ARTIFACT_BYTES", "104857600");
    std::env::set_var("ARTIFACT_TMP_DIR", "/tmp/banji-artifacts");
    std::env::set_var("OBJECT_STORAGE_ACCESS_KEY", "access");
    std::env::set_var("OBJECT_STORAGE_SECRET_KEY", "secret");
    std::env::set_var("ALGORITHM_ROLLOUT_HASH_SALT", "dev-local-salt");
    std::env::set_var("ALGORITHM_ROLLOUT_HASH_SALT_VERSION", "dev-local");
}

#[test]
fn service_name_defaults_to_app_role() {
    assert_eq!(resolve_service_name_from_env(AppRole::Api), "api");
    assert_eq!(
        resolve_service_name_from_env(AppRole::EventRelay),
        "event-relay"
    );
    assert_eq!(
        resolve_service_name_from_env(AppRole::ProjectionConsumer),
        "projection-consumer"
    );
    assert_eq!(resolve_service_name_from_env(AppRole::Worker), "worker");
    assert_eq!(
        resolve_service_name_from_env(AppRole::BackfillController),
        "backfill-controller"
    );
}

#[test]
fn api_bind_addr_prefers_explicit_bind_then_port_then_default() {
    let _guard = lock_env();
    let keys = ["API_BIND_ADDR", "PORT"];
    let old = capture_env(&keys);

    std::env::set_var("API_BIND_ADDR", "127.0.0.1:9000");
    std::env::set_var("PORT", "8081");
    assert_eq!(
        resolve_api_bind_addr(),
        "127.0.0.1:9000".parse().expect("socket addr")
    );

    std::env::remove_var("API_BIND_ADDR");
    assert_eq!(
        resolve_api_bind_addr(),
        "0.0.0.0:8081".parse().expect("socket addr")
    );

    std::env::set_var("PORT", "invalid");
    assert_eq!(
        resolve_api_bind_addr(),
        "0.0.0.0:8080".parse().expect("socket addr")
    );

    restore_env(old);
}

#[test]
fn missing_cache_schema_version_fails_validation() {
    let _guard = lock_env();

    let old = std::env::var("CACHE_SCHEMA_VERSION").ok();
    let old_endpoint_kind = std::env::var("DATABASE_RUNTIME_ENDPOINT_KIND").ok();
    let old_migration_url = std::env::var("DATABASE_MIGRATION_URL").ok();
    std::env::set_var("DATABASE_RUNTIME_ENDPOINT_KIND", "direct");
    std::env::remove_var("DATABASE_MIGRATION_URL");
    std::env::remove_var("CACHE_SCHEMA_VERSION");

    let result = AppConfig::from_env();

    if let Some(v) = old {
        std::env::set_var("CACHE_SCHEMA_VERSION", v);
    }
    if let Some(v) = old_endpoint_kind {
        std::env::set_var("DATABASE_RUNTIME_ENDPOINT_KIND", v);
    } else {
        std::env::remove_var("DATABASE_RUNTIME_ENDPOINT_KIND");
    }
    if let Some(v) = old_migration_url {
        std::env::set_var("DATABASE_MIGRATION_URL", v);
    } else {
        std::env::remove_var("DATABASE_MIGRATION_URL");
    }

    assert!(result.is_err());
}

#[test]
fn app_config_debug_redacts_secret_fields() {
    let rabbit_creds = ["user", "pass"].join(":");
    let rabbit_url = format!("amqps://{rabbit_creds}@example-host/vhost");
    let db_creds = ["user", "pass"].join(":");
    let db_url = format!("postgres://{db_creds}@db.example/banji");

    let cfg = AppConfig {
        app_role: AppRole::Api,
        system: "banji-core".to_string(),
        env: "dev".to_string(),
        service: "api".to_string(),
        instance_id: "api-test-1".to_string(),
        auth_enabled: false,
        auth_jwks_url: None,
        auth_issuer: None,
        auth_audience: None,
        auth_jwks_cache_ttl: std::time::Duration::from_secs(300),
        auth_jwks_timeout: std::time::Duration::from_millis(1_000),
        auth_clock_skew: std::time::Duration::from_secs(30),
        idempotency_retention_days: 30,
        cache_enabled: true,
        cache_schema_version: "v1".to_string(),
        cache_default_ttl: std::time::Duration::from_secs(300),
        cache_ttl_jitter: std::time::Duration::from_secs(30),
        redis_connect_timeout: std::time::Duration::from_millis(100),
        redis_command_timeout: std::time::Duration::from_millis(50),
        redis_circuit_error_threshold: 20,
        redis_circuit_window: std::time::Duration::from_secs(30),
        redis_circuit_cooldown: std::time::Duration::from_secs(60),
        redis_log_rate_limit: std::time::Duration::from_secs(30),
        event_payload_max_bytes: 65_536,
        event_relay_batch_size: 100,
        event_relay_poll_interval: std::time::Duration::from_millis(500),
        event_relay_retry_backoff: std::time::Duration::from_millis(1_000),
        event_relay_max_backoff: std::time::Duration::from_millis(60_000),
        event_relay_block_after_attempts: 25,
        event_outbox_published_retention_days: 7,
        rabbit_url: Some(rabbit_url),
        rabbit_vhost: "/".to_string(),
        rabbit_exchange_jobs: "banji-core.dev.jobs".to_string(),
        rabbit_exchange_jobs_replay: "banji-core.dev.jobs.replay".to_string(),
        rabbit_dlx_exchange: "banji-core.dev.jobs.dlx".to_string(),
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
        redis_url: Some("redis://:secret@redis.example:6379".to_string()),
        database_runtime_url: Some(db_url),
        database_runtime_endpoint_kind: DatabaseRuntimeEndpointKind::Direct,
        pgbouncer_pool_mode: Some(PgbouncerPoolMode::Session),
        sqlx_pool_max_connections: 10,
        sqlx_pool_min_connections: 1,
        sqlx_pool_acquire_timeout: std::time::Duration::from_millis(2_000),
        sqlx_pool_connect_timeout: std::time::Duration::from_millis(2_000),
        sqlx_pool_idle_timeout: std::time::Duration::from_secs(300),
        sqlx_pool_max_lifetime: std::time::Duration::from_secs(1_800),
        postgres_connection_budget_total: 80,
        edge_enforcement_enabled: false,
        edge_origin_auth_header_name: "x-banji-edge-auth".to_string(),
        edge_origin_auth_secret: None,
        edge_origin_auth_secret_next: None,
        edge_rate_limit_enabled: true,
        edge_rate_limit_window: std::time::Duration::from_secs(60),
        edge_rate_limit_public_read_max: 120,
        edge_rate_limit_user_read_max: 240,
        edge_rate_limit_user_write_max: 60,
        edge_rate_limit_device_read_max: 120,
        edge_rate_limit_device_write_max: 30,
        edge_rate_limit_fallback_max_keys: 1_000,
        edge_rate_limit_key_ttl: std::time::Duration::from_secs(300),
        edge_rate_limit_redis_prefix: "rate-limit".to_string(),
        edge_rate_limit_failover_enabled: true,
        edge_backpressure_enabled: true,
        edge_backpressure_poll_interval: std::time::Duration::from_millis(1_000),
        edge_backpressure_retry_after_seconds: 5,
        edge_backpressure_consecutive_unhealthy: 2,
        edge_backpressure_consecutive_healthy: 2,
        edge_backpressure_job_outbox_pending_max: 1_000,
        edge_backpressure_job_outbox_oldest_age_seconds_max: 30,
        edge_backpressure_job_run_pending_max: 2_000,
        edge_backpressure_job_run_oldest_age_seconds_max: 60,
        edge_backpressure_kafka_pending_max: 500,
        edge_backpressure_kafka_oldest_age_seconds_max: 30,
        observability_rabbit_queue_poll_interval: std::time::Duration::from_secs(15),
        observability_postgres_lock_poll_interval: std::time::Duration::from_secs(15),
        observability_job_pressure_poll_interval: std::time::Duration::from_secs(15),
        edge_request_max_bytes: 262_144,
        edge_write_request_max_bytes: 65_536,
        edge_cors_allowed_origins: vec![],
        edge_trust_forwarded_client_ip: false,
    };

    let rendered = format!("{cfg:?}");
    assert!(!rendered.contains("user:pass"));
    assert!(!rendered.contains("secret@redis"));
    assert!(rendered.contains("<redacted>"));
}

#[test]
fn api_rejects_auth_disabled_outside_dev() {
    let _guard = lock_env();
    let keys = [
        "BANJI_ENV",
        "APP_ROLE",
        "CACHE_SCHEMA_VERSION",
        "DATABASE_RUNTIME_ENDPOINT_KIND",
        "DATABASE_MIGRATION_URL",
        "AUTH_ENABLED",
    ];
    let old = capture_env(&keys);

    std::env::set_var("BANJI_ENV", "test");
    std::env::set_var("APP_ROLE", "api");
    std::env::set_var("CACHE_SCHEMA_VERSION", "v1");
    std::env::set_var("DATABASE_RUNTIME_ENDPOINT_KIND", "direct");
    std::env::set_var("AUTH_ENABLED", "false");
    std::env::remove_var("DATABASE_MIGRATION_URL");

    let result = AppConfig::from_env();
    restore_env(old);

    assert!(result.is_err());
    assert!(result
        .unwrap_err()
        .to_string()
        .contains("AUTH_ENABLED=false in dev"));
}

#[test]
fn backfill_controller_parses_replay_runtime_config() {
    let _guard = lock_env();
    let keys = [
        "BANJI_ENV",
        "BANJI_SYSTEM",
        "CACHE_SCHEMA_VERSION",
        "DATABASE_RUNTIME_ENDPOINT_KIND",
        "DATABASE_RUNTIME_URL",
        "RESTORE_DATABASE_URL",
        "APP_ROLE",
        "AUTH_ENABLED",
        "BACKFILL_KIND",
        "BACKFILL_MODE",
        "BACKFILL_STREAM_NAME",
        "BACKFILL_OPERATOR_ID",
        "BACKFILL_REASON",
        "BACKFILL_FROM_EVENT_ID",
        "BACKFILL_INVALID_EVENT_POLICY",
        "BACKFILL_DATABASE_KIND",
    ];
    let old = capture_env(&keys);

    std::env::set_var("BANJI_ENV", "test");
    std::env::set_var("BANJI_SYSTEM", "banji-core");
    std::env::set_var("CACHE_SCHEMA_VERSION", "v1");
    std::env::set_var("DATABASE_RUNTIME_ENDPOINT_KIND", "direct");
    std::env::remove_var("DATABASE_RUNTIME_URL");
    std::env::set_var(
        "RESTORE_DATABASE_URL",
        "postgres://restore@db.example/banji_restore",
    );
    std::env::set_var("APP_ROLE", "backfill-controller");
    std::env::set_var("AUTH_ENABLED", "false");
    std::env::set_var("BACKFILL_KIND", "projection");
    std::env::set_var("BACKFILL_MODE", "preview");
    std::env::set_var("BACKFILL_STREAM_NAME", "banji-core.test.inventory-updated");
    std::env::set_var("BACKFILL_OPERATOR_ID", "ops-1");
    std::env::set_var("BACKFILL_REASON", "preview");
    std::env::set_var("BACKFILL_FROM_EVENT_ID", "0");
    std::env::set_var("BACKFILL_INVALID_EVENT_POLICY", "quarantine");
    std::env::set_var("BACKFILL_DATABASE_KIND", "restore");

    let cfg = AppConfig::from_env().expect("backfill config should parse");
    let backfill = cfg.backfill_config().expect("backfill config should build");
    restore_env(old);

    assert_eq!(cfg.app_role, AppRole::BackfillController);
    assert!(cfg.database_runtime_url.is_none());
    assert_eq!(backfill.kind.as_str(), "projection");
    assert_eq!(backfill.mode.as_str(), "preview");
    assert_eq!(
        backfill.invalid_event_policy,
        banji_api::events::schema_types::InvalidEventPolicy::Quarantine
    );
    assert_eq!(backfill.database_kind.as_str(), "restore");
    assert_eq!(
        backfill.database_url,
        "postgres://restore@db.example/banji_restore"
    );
}

#[test]
fn backfill_jobs_reject_restore_database_kind() {
    let _guard = lock_env();
    let keys = [
        "BANJI_ENV",
        "BANJI_SYSTEM",
        "CACHE_SCHEMA_VERSION",
        "DATABASE_RUNTIME_ENDPOINT_KIND",
        "DATABASE_RUNTIME_URL",
        "RESTORE_DATABASE_URL",
        "APP_ROLE",
        "AUTH_ENABLED",
        "BACKFILL_KIND",
        "BACKFILL_MODE",
        "BACKFILL_STREAM_NAME",
        "BACKFILL_OPERATOR_ID",
        "BACKFILL_REASON",
        "BACKFILL_FROM_EVENT_ID",
        "BACKFILL_DATABASE_KIND",
        "BACKFILL_ALLOW_BROKER_PUBLISH",
    ];
    let old = capture_env(&keys);

    std::env::set_var("BANJI_ENV", "test");
    std::env::set_var("BANJI_SYSTEM", "banji-core");
    std::env::set_var("CACHE_SCHEMA_VERSION", "v1");
    std::env::set_var("DATABASE_RUNTIME_ENDPOINT_KIND", "direct");
    std::env::set_var(
        "DATABASE_RUNTIME_URL",
        "postgres://runtime@db.example/banji",
    );
    std::env::set_var(
        "RESTORE_DATABASE_URL",
        "postgres://restore@db.example/banji_restore",
    );
    std::env::set_var("APP_ROLE", "backfill-controller");
    std::env::set_var("AUTH_ENABLED", "false");
    std::env::set_var("BACKFILL_KIND", "jobs");
    std::env::set_var("BACKFILL_MODE", "apply");
    std::env::set_var(
        "BACKFILL_STREAM_NAME",
        "banji-core.test.write-demo-completed",
    );
    std::env::set_var("BACKFILL_OPERATOR_ID", "ops-1");
    std::env::set_var("BACKFILL_REASON", "replay");
    std::env::set_var("BACKFILL_FROM_EVENT_ID", "0");
    std::env::set_var("BACKFILL_DATABASE_KIND", "restore");
    std::env::set_var("BACKFILL_ALLOW_BROKER_PUBLISH", "true");

    let result = AppConfig::from_env();
    restore_env(old);

    assert!(result.is_err());
    assert!(result
        .unwrap_err()
        .to_string()
        .contains("does not support BACKFILL_DATABASE_KIND=restore"));
}

#[test]
fn backfill_restore_requires_restore_database_url() {
    let _guard = lock_env();
    let keys = [
        "BANJI_ENV",
        "BANJI_SYSTEM",
        "CACHE_SCHEMA_VERSION",
        "DATABASE_RUNTIME_ENDPOINT_KIND",
        "DATABASE_RUNTIME_URL",
        "RESTORE_DATABASE_URL",
        "APP_ROLE",
        "AUTH_ENABLED",
        "BACKFILL_KIND",
        "BACKFILL_MODE",
        "BACKFILL_STREAM_NAME",
        "BACKFILL_OPERATOR_ID",
        "BACKFILL_REASON",
        "BACKFILL_FROM_EVENT_ID",
        "BACKFILL_DATABASE_KIND",
    ];
    let old = capture_env(&keys);

    std::env::set_var("BANJI_ENV", "test");
    std::env::set_var("BANJI_SYSTEM", "banji-core");
    std::env::set_var("CACHE_SCHEMA_VERSION", "v1");
    std::env::set_var("DATABASE_RUNTIME_ENDPOINT_KIND", "direct");
    std::env::set_var(
        "DATABASE_RUNTIME_URL",
        "postgres://runtime@db.example/banji",
    );
    std::env::remove_var("RESTORE_DATABASE_URL");
    std::env::set_var("APP_ROLE", "backfill-controller");
    std::env::set_var("AUTH_ENABLED", "false");
    std::env::set_var("BACKFILL_KIND", "projection");
    std::env::set_var("BACKFILL_MODE", "preview");
    std::env::set_var("BACKFILL_STREAM_NAME", "banji-core.test.inventory-updated");
    std::env::set_var("BACKFILL_OPERATOR_ID", "ops-1");
    std::env::set_var("BACKFILL_REASON", "preview");
    std::env::set_var("BACKFILL_FROM_EVENT_ID", "0");
    std::env::set_var("BACKFILL_DATABASE_KIND", "restore");

    let result = AppConfig::from_env();
    restore_env(old);

    assert!(result.is_err());
    assert!(result
        .unwrap_err()
        .to_string()
        .contains("RESTORE_DATABASE_URL is required"));
}

#[test]
fn new_edge_rate_limit_and_backpressure_values_are_parsed() {
    let _guard = lock_env();
    let keys = [
        "BANJI_ENV",
        "APP_ROLE",
        "CACHE_SCHEMA_VERSION",
        "DATABASE_RUNTIME_ENDPOINT_KIND",
        "DATABASE_MIGRATION_URL",
        "AUTH_ENABLED",
        "EDGE_RATE_LIMIT_USER_READ_MAX",
        "EDGE_RATE_LIMIT_USER_WRITE_MAX",
        "EDGE_RATE_LIMIT_DEVICE_READ_MAX",
        "EDGE_RATE_LIMIT_DEVICE_WRITE_MAX",
        "EDGE_RATE_LIMIT_FALLBACK_MAX_KEYS",
        "EDGE_RATE_LIMIT_REDIS_PREFIX",
        "EDGE_RATE_LIMIT_FAILOVER_ENABLED",
        "EDGE_BACKPRESSURE_ENABLED",
        "EDGE_BACKPRESSURE_POLL_INTERVAL_MS",
        "EDGE_BACKPRESSURE_RETRY_AFTER_SECONDS",
        "EDGE_BACKPRESSURE_CONSECUTIVE_UNHEALTHY",
        "EDGE_BACKPRESSURE_CONSECUTIVE_HEALTHY",
        "EDGE_BACKPRESSURE_JOB_OUTBOX_PENDING_MAX",
        "EDGE_BACKPRESSURE_JOB_OUTBOX_OLDEST_AGE_SECONDS_MAX",
        "EDGE_BACKPRESSURE_JOB_RUN_PENDING_MAX",
        "EDGE_BACKPRESSURE_JOB_RUN_OLDEST_AGE_SECONDS_MAX",
        "EDGE_BACKPRESSURE_KAFKA_PENDING_MAX",
        "EDGE_BACKPRESSURE_KAFKA_OLDEST_AGE_SECONDS_MAX",
        "JOB_RESULT_KAFKA_ENABLED",
        "JOB_RESULT_KAFKA_TOPIC_PREFIX",
    ];
    let old = capture_env(&keys);

    std::env::set_var("BANJI_ENV", "dev");
    std::env::set_var("APP_ROLE", "api");
    std::env::set_var("CACHE_SCHEMA_VERSION", "v1");
    std::env::set_var("DATABASE_RUNTIME_ENDPOINT_KIND", "direct");
    std::env::set_var("AUTH_ENABLED", "false");
    std::env::remove_var("DATABASE_MIGRATION_URL");
    std::env::set_var("EDGE_RATE_LIMIT_USER_READ_MAX", "301");
    std::env::set_var("EDGE_RATE_LIMIT_USER_WRITE_MAX", "71");
    std::env::set_var("EDGE_RATE_LIMIT_DEVICE_READ_MAX", "151");
    std::env::set_var("EDGE_RATE_LIMIT_DEVICE_WRITE_MAX", "21");
    std::env::set_var("EDGE_RATE_LIMIT_FALLBACK_MAX_KEYS", "3333");
    std::env::set_var("EDGE_RATE_LIMIT_REDIS_PREFIX", "shared-rl");
    std::env::set_var("EDGE_RATE_LIMIT_FAILOVER_ENABLED", "false");
    std::env::set_var("EDGE_BACKPRESSURE_ENABLED", "true");
    std::env::set_var("EDGE_BACKPRESSURE_POLL_INTERVAL_MS", "1500");
    std::env::set_var("EDGE_BACKPRESSURE_RETRY_AFTER_SECONDS", "7");
    std::env::set_var("EDGE_BACKPRESSURE_CONSECUTIVE_UNHEALTHY", "3");
    std::env::set_var("EDGE_BACKPRESSURE_CONSECUTIVE_HEALTHY", "4");
    std::env::set_var("EDGE_BACKPRESSURE_JOB_OUTBOX_PENDING_MAX", "11");
    std::env::set_var("EDGE_BACKPRESSURE_JOB_OUTBOX_OLDEST_AGE_SECONDS_MAX", "12");
    std::env::set_var("EDGE_BACKPRESSURE_JOB_RUN_PENDING_MAX", "13");
    std::env::set_var("EDGE_BACKPRESSURE_JOB_RUN_OLDEST_AGE_SECONDS_MAX", "14");
    std::env::set_var("EDGE_BACKPRESSURE_KAFKA_PENDING_MAX", "15");
    std::env::set_var("EDGE_BACKPRESSURE_KAFKA_OLDEST_AGE_SECONDS_MAX", "16");
    std::env::set_var("JOB_RESULT_KAFKA_ENABLED", "true");
    std::env::set_var("JOB_RESULT_KAFKA_TOPIC_PREFIX", "banji-results");

    let result = AppConfig::from_env();
    restore_env(old);
    let cfg = result.expect("config should parse");

    assert_eq!(cfg.edge_rate_limit_user_read_max, 301);
    assert_eq!(cfg.edge_rate_limit_user_write_max, 71);
    assert_eq!(cfg.edge_rate_limit_device_read_max, 151);
    assert_eq!(cfg.edge_rate_limit_device_write_max, 21);
    assert_eq!(cfg.edge_rate_limit_fallback_max_keys, 3333);
    assert_eq!(cfg.edge_rate_limit_redis_prefix, "shared-rl");
    assert!(!cfg.edge_rate_limit_failover_enabled);
    assert_eq!(cfg.edge_backpressure_poll_interval.as_millis(), 1500);
    assert_eq!(cfg.edge_backpressure_retry_after_seconds, 7);
    assert_eq!(cfg.edge_backpressure_consecutive_unhealthy, 3);
    assert_eq!(cfg.edge_backpressure_consecutive_healthy, 4);
    assert_eq!(cfg.edge_backpressure_job_outbox_pending_max, 11);
    assert_eq!(cfg.edge_backpressure_job_run_pending_max, 13);
    assert_eq!(cfg.edge_backpressure_kafka_pending_max, 15);
    assert!(cfg.job_result_kafka_enabled);
    assert_eq!(
        cfg.job_result_kafka_topic_prefix.as_deref(),
        Some("banji-results")
    );
}

#[test]
fn deprecated_cloudflare_env_keys_are_ignored() {
    let _guard = lock_env();
    let keys = [
        "BANJI_ENV",
        "CACHE_SCHEMA_VERSION",
        "DATABASE_RUNTIME_ENDPOINT_KIND",
        "DATABASE_MIGRATION_URL",
        "EDGE_PROVIDER",
    ];
    let old = capture_env(&keys);

    std::env::set_var("BANJI_ENV", "dev");
    std::env::set_var("CACHE_SCHEMA_VERSION", "v1");
    std::env::set_var("DATABASE_RUNTIME_ENDPOINT_KIND", "direct");
    std::env::set_var("EDGE_PROVIDER", "cloudflare");
    std::env::remove_var("DATABASE_MIGRATION_URL");

    let result = AppConfig::from_env();
    restore_env(old);

    assert!(result.is_ok());
}

#[test]
fn forwarded_client_ip_flag_defaults_false_and_parses_when_enabled() {
    let _guard = lock_env();
    let keys = [
        "BANJI_ENV",
        "CACHE_SCHEMA_VERSION",
        "DATABASE_RUNTIME_ENDPOINT_KIND",
        "EDGE_TRUST_FORWARDED_CLIENT_IP",
        "DATABASE_MIGRATION_URL",
    ];
    let old = capture_env(&keys);

    std::env::set_var("BANJI_ENV", "dev");
    std::env::set_var("CACHE_SCHEMA_VERSION", "v1");
    std::env::set_var("DATABASE_RUNTIME_ENDPOINT_KIND", "direct");
    std::env::remove_var("EDGE_TRUST_FORWARDED_CLIENT_IP");
    std::env::remove_var("DATABASE_MIGRATION_URL");

    let default_cfg = AppConfig::from_env().expect("default config should parse");
    assert!(!default_cfg.edge_trust_forwarded_client_ip);

    std::env::set_var("EDGE_TRUST_FORWARDED_CLIENT_IP", "true");
    let enabled_cfg = AppConfig::from_env().expect("enabled config should parse");
    restore_env(old);

    assert!(enabled_cfg.edge_trust_forwarded_client_ip);
}

#[test]
fn staging_requires_pgbouncer_transaction_mode() {
    let _guard = lock_env();

    let old_env = std::env::var("BANJI_ENV").ok();
    let old_cache_schema = std::env::var("CACHE_SCHEMA_VERSION").ok();
    let old_runtime_url = std::env::var("DATABASE_RUNTIME_URL").ok();
    let old_endpoint_kind = std::env::var("DATABASE_RUNTIME_ENDPOINT_KIND").ok();
    let old_pool_mode = std::env::var("PGBOUNCER_POOL_MODE").ok();
    let old_edge_enabled = std::env::var("EDGE_ENFORCEMENT_ENABLED").ok();
    let old_edge_secret = std::env::var("EDGE_ORIGIN_AUTH_SECRET").ok();
    let old_edge_cors = std::env::var("EDGE_CORS_ALLOWED_ORIGINS").ok();
    let old_migration_url = std::env::var("DATABASE_MIGRATION_URL").ok();
    let old_auth_enabled = std::env::var("AUTH_ENABLED").ok();
    let old_auth_jwks_url = std::env::var("AUTH_JWKS_URL").ok();
    let old_auth_issuer = std::env::var("AUTH_ISSUER").ok();
    let old_auth_audience = std::env::var("AUTH_AUDIENCE").ok();

    std::env::set_var("BANJI_ENV", "staging");
    std::env::set_var("CACHE_SCHEMA_VERSION", "v1");
    std::env::set_var(
        "DATABASE_RUNTIME_URL",
        "postgres://runtime@db.example/banji",
    );
    std::env::set_var("DATABASE_RUNTIME_ENDPOINT_KIND", "direct");
    std::env::set_var("PGBOUNCER_POOL_MODE", "transaction");
    std::env::set_var("EDGE_ENFORCEMENT_ENABLED", "true");
    std::env::set_var("EDGE_ORIGIN_AUTH_SECRET", "edge-secret");
    std::env::set_var("EDGE_CORS_ALLOWED_ORIGINS", "https://staging.example.com");
    std::env::set_var("AUTH_ENABLED", "true");
    std::env::set_var(
        "AUTH_JWKS_URL",
        "https://issuer.example/.well-known/jwks.json",
    );
    std::env::set_var("AUTH_ISSUER", "https://issuer.example/");
    std::env::set_var("AUTH_AUDIENCE", "banji-api");
    std::env::remove_var("DATABASE_MIGRATION_URL");

    let direct_result = AppConfig::from_env();
    assert!(direct_result.is_err());

    std::env::set_var("DATABASE_RUNTIME_ENDPOINT_KIND", "pgbouncer");
    std::env::set_var("PGBOUNCER_POOL_MODE", "session");
    let session_result = AppConfig::from_env();
    assert!(session_result.is_err());

    std::env::set_var("PGBOUNCER_POOL_MODE", "transaction");
    let ok_result = AppConfig::from_env();
    assert!(ok_result.is_ok());

    if let Some(v) = old_env {
        std::env::set_var("BANJI_ENV", v);
    } else {
        std::env::remove_var("BANJI_ENV");
    }
    if let Some(v) = old_cache_schema {
        std::env::set_var("CACHE_SCHEMA_VERSION", v);
    } else {
        std::env::remove_var("CACHE_SCHEMA_VERSION");
    }
    if let Some(v) = old_runtime_url {
        std::env::set_var("DATABASE_RUNTIME_URL", v);
    } else {
        std::env::remove_var("DATABASE_RUNTIME_URL");
    }
    if let Some(v) = old_endpoint_kind {
        std::env::set_var("DATABASE_RUNTIME_ENDPOINT_KIND", v);
    } else {
        std::env::remove_var("DATABASE_RUNTIME_ENDPOINT_KIND");
    }
    if let Some(v) = old_pool_mode {
        std::env::set_var("PGBOUNCER_POOL_MODE", v);
    } else {
        std::env::remove_var("PGBOUNCER_POOL_MODE");
    }
    if let Some(v) = old_edge_enabled {
        std::env::set_var("EDGE_ENFORCEMENT_ENABLED", v);
    } else {
        std::env::remove_var("EDGE_ENFORCEMENT_ENABLED");
    }
    if let Some(v) = old_edge_secret {
        std::env::set_var("EDGE_ORIGIN_AUTH_SECRET", v);
    } else {
        std::env::remove_var("EDGE_ORIGIN_AUTH_SECRET");
    }
    if let Some(v) = old_edge_cors {
        std::env::set_var("EDGE_CORS_ALLOWED_ORIGINS", v);
    } else {
        std::env::remove_var("EDGE_CORS_ALLOWED_ORIGINS");
    }
    if let Some(v) = old_migration_url {
        std::env::set_var("DATABASE_MIGRATION_URL", v);
    } else {
        std::env::remove_var("DATABASE_MIGRATION_URL");
    }
    if let Some(v) = old_auth_enabled {
        std::env::set_var("AUTH_ENABLED", v);
    } else {
        std::env::remove_var("AUTH_ENABLED");
    }
    if let Some(v) = old_auth_jwks_url {
        std::env::set_var("AUTH_JWKS_URL", v);
    } else {
        std::env::remove_var("AUTH_JWKS_URL");
    }
    if let Some(v) = old_auth_issuer {
        std::env::set_var("AUTH_ISSUER", v);
    } else {
        std::env::remove_var("AUTH_ISSUER");
    }
    if let Some(v) = old_auth_audience {
        std::env::set_var("AUTH_AUDIENCE", v);
    } else {
        std::env::remove_var("AUTH_AUDIENCE");
    }
}

#[test]
fn non_api_roles_do_not_require_http_edge_or_auth_settings() {
    let _guard = lock_env();

    let old_env = std::env::var("BANJI_ENV").ok();
    let old_role = std::env::var("APP_ROLE").ok();
    let old_cache_schema = std::env::var("CACHE_SCHEMA_VERSION").ok();
    let old_runtime_url = std::env::var("DATABASE_RUNTIME_URL").ok();
    let old_endpoint_kind = std::env::var("DATABASE_RUNTIME_ENDPOINT_KIND").ok();
    let old_pool_mode = std::env::var("PGBOUNCER_POOL_MODE").ok();
    let old_edge_enabled = std::env::var("EDGE_ENFORCEMENT_ENABLED").ok();
    let old_edge_secret = std::env::var("EDGE_ORIGIN_AUTH_SECRET").ok();
    let old_edge_cors = std::env::var("EDGE_CORS_ALLOWED_ORIGINS").ok();
    let old_auth_enabled = std::env::var("AUTH_ENABLED").ok();
    let old_auth_jwks_url = std::env::var("AUTH_JWKS_URL").ok();
    let old_auth_issuer = std::env::var("AUTH_ISSUER").ok();
    let old_auth_audience = std::env::var("AUTH_AUDIENCE").ok();
    let old_migration_url = std::env::var("DATABASE_MIGRATION_URL").ok();
    let old_run_mode = std::env::var("EVENT_CONSUMER_RUN_MODE").ok();
    let old_replay_from = std::env::var("EVENT_CONSUMER_REPLAY_FROM_ID").ok();
    let old_replay_to = std::env::var("EVENT_CONSUMER_REPLAY_TO_ID").ok();
    let old_rabbit_url = std::env::var("RABBIT_URL").ok();
    let old_object_storage = capture_env(WORKER_OBJECT_STORAGE_ENV_KEYS);

    std::env::set_var("BANJI_ENV", "staging");
    std::env::set_var("APP_ROLE", "event-relay");
    std::env::set_var("CACHE_SCHEMA_VERSION", "v1");
    std::env::set_var(
        "DATABASE_RUNTIME_URL",
        "postgres://runtime@db.example/banji",
    );
    std::env::set_var("DATABASE_RUNTIME_ENDPOINT_KIND", "pgbouncer");
    std::env::set_var("PGBOUNCER_POOL_MODE", "transaction");
    std::env::remove_var("EDGE_ENFORCEMENT_ENABLED");
    std::env::remove_var("EDGE_ORIGIN_AUTH_SECRET");
    std::env::remove_var("EDGE_CORS_ALLOWED_ORIGINS");
    std::env::remove_var("AUTH_ENABLED");
    std::env::remove_var("AUTH_JWKS_URL");
    std::env::remove_var("AUTH_ISSUER");
    std::env::remove_var("AUTH_AUDIENCE");
    std::env::remove_var("DATABASE_MIGRATION_URL");

    let result = AppConfig::from_env();
    assert!(result.is_ok());
    assert_eq!(result.unwrap().app_role, AppRole::EventRelay);

    std::env::set_var("APP_ROLE", "projection-consumer");
    let projection_result = AppConfig::from_env();
    assert!(projection_result.is_ok());
    assert_eq!(
        projection_result.unwrap().app_role,
        AppRole::ProjectionConsumer
    );

    std::env::set_var("APP_ROLE", "worker");
    std::env::set_var("RABBIT_URL", "amqp://guest:guest@localhost:5672/%2f");
    set_minimal_worker_object_storage_env();
    let worker_result = AppConfig::from_env();
    assert!(worker_result.is_ok());
    assert_eq!(worker_result.unwrap().app_role, AppRole::Worker);

    if let Some(v) = old_env {
        std::env::set_var("BANJI_ENV", v);
    } else {
        std::env::remove_var("BANJI_ENV");
    }
    if let Some(v) = old_role {
        std::env::set_var("APP_ROLE", v);
    } else {
        std::env::remove_var("APP_ROLE");
    }
    if let Some(v) = old_cache_schema {
        std::env::set_var("CACHE_SCHEMA_VERSION", v);
    } else {
        std::env::remove_var("CACHE_SCHEMA_VERSION");
    }
    if let Some(v) = old_runtime_url {
        std::env::set_var("DATABASE_RUNTIME_URL", v);
    } else {
        std::env::remove_var("DATABASE_RUNTIME_URL");
    }
    if let Some(v) = old_endpoint_kind {
        std::env::set_var("DATABASE_RUNTIME_ENDPOINT_KIND", v);
    } else {
        std::env::remove_var("DATABASE_RUNTIME_ENDPOINT_KIND");
    }
    if let Some(v) = old_pool_mode {
        std::env::set_var("PGBOUNCER_POOL_MODE", v);
    } else {
        std::env::remove_var("PGBOUNCER_POOL_MODE");
    }
    if let Some(v) = old_edge_enabled {
        std::env::set_var("EDGE_ENFORCEMENT_ENABLED", v);
    } else {
        std::env::remove_var("EDGE_ENFORCEMENT_ENABLED");
    }
    if let Some(v) = old_edge_secret {
        std::env::set_var("EDGE_ORIGIN_AUTH_SECRET", v);
    } else {
        std::env::remove_var("EDGE_ORIGIN_AUTH_SECRET");
    }
    if let Some(v) = old_edge_cors {
        std::env::set_var("EDGE_CORS_ALLOWED_ORIGINS", v);
    } else {
        std::env::remove_var("EDGE_CORS_ALLOWED_ORIGINS");
    }
    if let Some(v) = old_auth_enabled {
        std::env::set_var("AUTH_ENABLED", v);
    } else {
        std::env::remove_var("AUTH_ENABLED");
    }
    if let Some(v) = old_auth_jwks_url {
        std::env::set_var("AUTH_JWKS_URL", v);
    } else {
        std::env::remove_var("AUTH_JWKS_URL");
    }
    if let Some(v) = old_auth_issuer {
        std::env::set_var("AUTH_ISSUER", v);
    } else {
        std::env::remove_var("AUTH_ISSUER");
    }
    if let Some(v) = old_auth_audience {
        std::env::set_var("AUTH_AUDIENCE", v);
    } else {
        std::env::remove_var("AUTH_AUDIENCE");
    }
    if let Some(v) = old_migration_url {
        std::env::set_var("DATABASE_MIGRATION_URL", v);
    } else {
        std::env::remove_var("DATABASE_MIGRATION_URL");
    }
    if let Some(v) = old_run_mode {
        std::env::set_var("EVENT_CONSUMER_RUN_MODE", v);
    } else {
        std::env::remove_var("EVENT_CONSUMER_RUN_MODE");
    }
    if let Some(v) = old_replay_from {
        std::env::set_var("EVENT_CONSUMER_REPLAY_FROM_ID", v);
    } else {
        std::env::remove_var("EVENT_CONSUMER_REPLAY_FROM_ID");
    }
    if let Some(v) = old_replay_to {
        std::env::set_var("EVENT_CONSUMER_REPLAY_TO_ID", v);
    } else {
        std::env::remove_var("EVENT_CONSUMER_REPLAY_TO_ID");
    }
    if let Some(v) = old_rabbit_url {
        std::env::set_var("RABBIT_URL", v);
    } else {
        std::env::remove_var("RABBIT_URL");
    }
    restore_env(old_object_storage);
}

#[test]
fn worker_requires_rabbit_url() {
    let _guard = lock_env();

    let old_env = std::env::var("BANJI_ENV").ok();
    let old_role = std::env::var("APP_ROLE").ok();
    let old_cache_schema = std::env::var("CACHE_SCHEMA_VERSION").ok();
    let old_runtime_url = std::env::var("DATABASE_RUNTIME_URL").ok();
    let old_endpoint_kind = std::env::var("DATABASE_RUNTIME_ENDPOINT_KIND").ok();
    let old_pool_mode = std::env::var("PGBOUNCER_POOL_MODE").ok();
    let old_rabbit_url = std::env::var("RABBIT_URL").ok();
    let old_migration_url = std::env::var("DATABASE_MIGRATION_URL").ok();
    let old_object_storage = capture_env(WORKER_OBJECT_STORAGE_ENV_KEYS);

    std::env::set_var("BANJI_ENV", "staging");
    std::env::set_var("APP_ROLE", "worker");
    std::env::set_var("CACHE_SCHEMA_VERSION", "v1");
    std::env::set_var(
        "DATABASE_RUNTIME_URL",
        "postgres://runtime@db.example/banji",
    );
    std::env::set_var("DATABASE_RUNTIME_ENDPOINT_KIND", "pgbouncer");
    std::env::set_var("PGBOUNCER_POOL_MODE", "transaction");
    std::env::remove_var("RABBIT_URL");
    set_minimal_worker_object_storage_env();
    std::env::remove_var("DATABASE_MIGRATION_URL");

    let result = AppConfig::from_env();
    assert!(result.is_err());
    assert!(result
        .unwrap_err()
        .to_string()
        .contains("APP_ROLE=worker requires RABBIT_URL"));

    if let Some(v) = old_env {
        std::env::set_var("BANJI_ENV", v);
    } else {
        std::env::remove_var("BANJI_ENV");
    }
    if let Some(v) = old_role {
        std::env::set_var("APP_ROLE", v);
    } else {
        std::env::remove_var("APP_ROLE");
    }
    if let Some(v) = old_cache_schema {
        std::env::set_var("CACHE_SCHEMA_VERSION", v);
    } else {
        std::env::remove_var("CACHE_SCHEMA_VERSION");
    }
    if let Some(v) = old_runtime_url {
        std::env::set_var("DATABASE_RUNTIME_URL", v);
    } else {
        std::env::remove_var("DATABASE_RUNTIME_URL");
    }
    if let Some(v) = old_endpoint_kind {
        std::env::set_var("DATABASE_RUNTIME_ENDPOINT_KIND", v);
    } else {
        std::env::remove_var("DATABASE_RUNTIME_ENDPOINT_KIND");
    }
    if let Some(v) = old_pool_mode {
        std::env::set_var("PGBOUNCER_POOL_MODE", v);
    } else {
        std::env::remove_var("PGBOUNCER_POOL_MODE");
    }
    if let Some(v) = old_rabbit_url {
        std::env::set_var("RABBIT_URL", v);
    } else {
        std::env::remove_var("RABBIT_URL");
    }
    if let Some(v) = old_migration_url {
        std::env::set_var("DATABASE_MIGRATION_URL", v);
    } else {
        std::env::remove_var("DATABASE_MIGRATION_URL");
    }
    restore_env(old_object_storage);
}

#[test]
fn worker_rejects_rabbit_url_without_host() {
    let _guard = lock_env();

    let old_env = std::env::var("BANJI_ENV").ok();
    let old_role = std::env::var("APP_ROLE").ok();
    let old_cache_schema = std::env::var("CACHE_SCHEMA_VERSION").ok();
    let old_runtime_url = std::env::var("DATABASE_RUNTIME_URL").ok();
    let old_endpoint_kind = std::env::var("DATABASE_RUNTIME_ENDPOINT_KIND").ok();
    let old_pool_mode = std::env::var("PGBOUNCER_POOL_MODE").ok();
    let old_rabbit_url = std::env::var("RABBIT_URL").ok();
    let old_migration_url = std::env::var("DATABASE_MIGRATION_URL").ok();
    let old_object_storage = capture_env(WORKER_OBJECT_STORAGE_ENV_KEYS);

    std::env::set_var("BANJI_ENV", "staging");
    std::env::set_var("APP_ROLE", "worker");
    std::env::set_var("CACHE_SCHEMA_VERSION", "v1");
    std::env::set_var(
        "DATABASE_RUNTIME_URL",
        "postgres://runtime@db.example/banji",
    );
    std::env::set_var("DATABASE_RUNTIME_ENDPOINT_KIND", "pgbouncer");
    std::env::set_var("PGBOUNCER_POOL_MODE", "transaction");
    std::env::set_var("RABBIT_URL", "amqps://guest:guest@/%2f");
    std::env::remove_var("DATABASE_MIGRATION_URL");
    set_minimal_worker_object_storage_env();

    let result = AppConfig::from_env();
    assert!(result.is_err());
    assert!(result
        .unwrap_err()
        .to_string()
        .contains("RABBIT_URL must be a valid URL: empty host"));

    if let Some(v) = old_env {
        std::env::set_var("BANJI_ENV", v);
    } else {
        std::env::remove_var("BANJI_ENV");
    }
    if let Some(v) = old_role {
        std::env::set_var("APP_ROLE", v);
    } else {
        std::env::remove_var("APP_ROLE");
    }
    if let Some(v) = old_cache_schema {
        std::env::set_var("CACHE_SCHEMA_VERSION", v);
    } else {
        std::env::remove_var("CACHE_SCHEMA_VERSION");
    }
    if let Some(v) = old_runtime_url {
        std::env::set_var("DATABASE_RUNTIME_URL", v);
    } else {
        std::env::remove_var("DATABASE_RUNTIME_URL");
    }
    if let Some(v) = old_endpoint_kind {
        std::env::set_var("DATABASE_RUNTIME_ENDPOINT_KIND", v);
    } else {
        std::env::remove_var("DATABASE_RUNTIME_ENDPOINT_KIND");
    }
    if let Some(v) = old_pool_mode {
        std::env::set_var("PGBOUNCER_POOL_MODE", v);
    } else {
        std::env::remove_var("PGBOUNCER_POOL_MODE");
    }
    if let Some(v) = old_rabbit_url {
        std::env::set_var("RABBIT_URL", v);
    } else {
        std::env::remove_var("RABBIT_URL");
    }
    if let Some(v) = old_migration_url {
        std::env::set_var("DATABASE_MIGRATION_URL", v);
    } else {
        std::env::remove_var("DATABASE_MIGRATION_URL");
    }
    restore_env(old_object_storage);
}

#[test]
fn worker_requires_object_storage_config() {
    let _guard = lock_env();

    let old_env = std::env::var("BANJI_ENV").ok();
    let old_role = std::env::var("APP_ROLE").ok();
    let old_cache_schema = std::env::var("CACHE_SCHEMA_VERSION").ok();
    let old_runtime_url = std::env::var("DATABASE_RUNTIME_URL").ok();
    let old_endpoint_kind = std::env::var("DATABASE_RUNTIME_ENDPOINT_KIND").ok();
    let old_pool_mode = std::env::var("PGBOUNCER_POOL_MODE").ok();
    let old_rabbit_url = std::env::var("RABBIT_URL").ok();
    let old_migration_url = std::env::var("DATABASE_MIGRATION_URL").ok();
    let old_object_storage = capture_env(WORKER_OBJECT_STORAGE_ENV_KEYS);

    std::env::set_var("BANJI_ENV", "staging");
    std::env::set_var("APP_ROLE", "worker");
    std::env::set_var("CACHE_SCHEMA_VERSION", "v1");
    std::env::set_var(
        "DATABASE_RUNTIME_URL",
        "postgres://runtime@db.example/banji",
    );
    std::env::set_var("DATABASE_RUNTIME_ENDPOINT_KIND", "pgbouncer");
    std::env::set_var("PGBOUNCER_POOL_MODE", "transaction");
    std::env::set_var("RABBIT_URL", "amqp://guest:guest@localhost:5672/%2f");
    std::env::remove_var("DATABASE_MIGRATION_URL");
    std::env::remove_var("OBJECT_STORAGE_ENABLED");

    let result = AppConfig::from_env();
    assert!(result.is_err());
    assert!(result
        .unwrap_err()
        .to_string()
        .contains("OBJECT_STORAGE_ENABLED"));

    if let Some(v) = old_env {
        std::env::set_var("BANJI_ENV", v);
    } else {
        std::env::remove_var("BANJI_ENV");
    }
    if let Some(v) = old_role {
        std::env::set_var("APP_ROLE", v);
    } else {
        std::env::remove_var("APP_ROLE");
    }
    if let Some(v) = old_cache_schema {
        std::env::set_var("CACHE_SCHEMA_VERSION", v);
    } else {
        std::env::remove_var("CACHE_SCHEMA_VERSION");
    }
    if let Some(v) = old_runtime_url {
        std::env::set_var("DATABASE_RUNTIME_URL", v);
    } else {
        std::env::remove_var("DATABASE_RUNTIME_URL");
    }
    if let Some(v) = old_endpoint_kind {
        std::env::set_var("DATABASE_RUNTIME_ENDPOINT_KIND", v);
    } else {
        std::env::remove_var("DATABASE_RUNTIME_ENDPOINT_KIND");
    }
    if let Some(v) = old_pool_mode {
        std::env::set_var("PGBOUNCER_POOL_MODE", v);
    } else {
        std::env::remove_var("PGBOUNCER_POOL_MODE");
    }
    if let Some(v) = old_rabbit_url {
        std::env::set_var("RABBIT_URL", v);
    } else {
        std::env::remove_var("RABBIT_URL");
    }
    if let Some(v) = old_migration_url {
        std::env::set_var("DATABASE_MIGRATION_URL", v);
    } else {
        std::env::remove_var("DATABASE_MIGRATION_URL");
    }
    restore_env(old_object_storage);
}

#[test]
fn worker_rejects_object_storage_endpoint_without_host() {
    let _guard = lock_env();

    let old_env = std::env::var("BANJI_ENV").ok();
    let old_role = std::env::var("APP_ROLE").ok();
    let old_cache_schema = std::env::var("CACHE_SCHEMA_VERSION").ok();
    let old_runtime_url = std::env::var("DATABASE_RUNTIME_URL").ok();
    let old_endpoint_kind = std::env::var("DATABASE_RUNTIME_ENDPOINT_KIND").ok();
    let old_pool_mode = std::env::var("PGBOUNCER_POOL_MODE").ok();
    let old_rabbit_url = std::env::var("RABBIT_URL").ok();
    let old_migration_url = std::env::var("DATABASE_MIGRATION_URL").ok();
    let old_object_storage = capture_env(WORKER_OBJECT_STORAGE_ENV_KEYS);

    std::env::set_var("BANJI_ENV", "staging");
    std::env::set_var("APP_ROLE", "worker");
    std::env::set_var("CACHE_SCHEMA_VERSION", "v1");
    std::env::set_var(
        "DATABASE_RUNTIME_URL",
        "postgres://runtime@db.example/banji",
    );
    std::env::set_var("DATABASE_RUNTIME_ENDPOINT_KIND", "pgbouncer");
    std::env::set_var("PGBOUNCER_POOL_MODE", "transaction");
    std::env::set_var("RABBIT_URL", "amqp://guest:guest@localhost:5672/%2f");
    std::env::remove_var("DATABASE_MIGRATION_URL");
    set_minimal_worker_object_storage_env();
    std::env::set_var("OBJECT_STORAGE_ENDPOINT", "https://");

    let result = AppConfig::from_env();
    assert!(result.is_err());
    assert!(result
        .unwrap_err()
        .to_string()
        .contains("OBJECT_STORAGE_ENDPOINT must be a valid URL: empty host"));

    if let Some(v) = old_env {
        std::env::set_var("BANJI_ENV", v);
    } else {
        std::env::remove_var("BANJI_ENV");
    }
    if let Some(v) = old_role {
        std::env::set_var("APP_ROLE", v);
    } else {
        std::env::remove_var("APP_ROLE");
    }
    if let Some(v) = old_cache_schema {
        std::env::set_var("CACHE_SCHEMA_VERSION", v);
    } else {
        std::env::remove_var("CACHE_SCHEMA_VERSION");
    }
    if let Some(v) = old_runtime_url {
        std::env::set_var("DATABASE_RUNTIME_URL", v);
    } else {
        std::env::remove_var("DATABASE_RUNTIME_URL");
    }
    if let Some(v) = old_endpoint_kind {
        std::env::set_var("DATABASE_RUNTIME_ENDPOINT_KIND", v);
    } else {
        std::env::remove_var("DATABASE_RUNTIME_ENDPOINT_KIND");
    }
    if let Some(v) = old_pool_mode {
        std::env::set_var("PGBOUNCER_POOL_MODE", v);
    } else {
        std::env::remove_var("PGBOUNCER_POOL_MODE");
    }
    if let Some(v) = old_rabbit_url {
        std::env::set_var("RABBIT_URL", v);
    } else {
        std::env::remove_var("RABBIT_URL");
    }
    if let Some(v) = old_migration_url {
        std::env::set_var("DATABASE_MIGRATION_URL", v);
    } else {
        std::env::remove_var("DATABASE_MIGRATION_URL");
    }
    restore_env(old_object_storage);
}

#[test]
fn worker_default_id_includes_host_identity_when_available() {
    let _guard = lock_env();

    let old_worker_id = std::env::var("WORKER_ID").ok();
    let old_hostname = std::env::var("HOSTNAME").ok();
    let old_replica = std::env::var("RAILWAY_REPLICA_ID").ok();
    let old_object_storage = capture_env(WORKER_OBJECT_STORAGE_ENV_KEYS);

    std::env::remove_var("WORKER_ID");
    std::env::set_var("HOSTNAME", "worker-host-42");
    std::env::remove_var("RAILWAY_REPLICA_ID");
    set_minimal_worker_object_storage_env();

    let worker_cfg = WorkerConfig::from_env().unwrap();

    assert!(worker_cfg.worker_id.starts_with("worker-worker-host-42-"));
    assert!(worker_cfg.worker_id.len() > "worker-worker-host-42-".len());

    if let Some(v) = old_worker_id {
        std::env::set_var("WORKER_ID", v);
    } else {
        std::env::remove_var("WORKER_ID");
    }
    if let Some(v) = old_hostname {
        std::env::set_var("HOSTNAME", v);
    } else {
        std::env::remove_var("HOSTNAME");
    }
    if let Some(v) = old_replica {
        std::env::set_var("RAILWAY_REPLICA_ID", v);
    } else {
        std::env::remove_var("RAILWAY_REPLICA_ID");
    }
    restore_env(old_object_storage);
}

#[test]
fn worker_config_debug_redacts_rollout_hash_salt() {
    let _guard = lock_env();
    let old_object_storage = capture_env(WORKER_OBJECT_STORAGE_ENV_KEYS);

    set_minimal_worker_object_storage_env();
    std::env::set_var("ALGORITHM_ROLLOUT_HASH_SALT", "very-secret-salt");
    std::env::set_var("ALGORITHM_ROLLOUT_HASH_SALT_VERSION", "salt-v1");

    let worker_cfg = WorkerConfig::from_env().unwrap();
    let rendered = format!("{worker_cfg:?}");

    assert!(!rendered.contains("very-secret-salt"));
    assert!(rendered.contains("<redacted>"));
    assert!(rendered.contains("salt-v1"));

    restore_env(old_object_storage);
}

#[test]
fn staging_worker_requires_rollout_hash_salt() {
    let _guard = lock_env();

    let keys = [
        "BANJI_ENV",
        "APP_ROLE",
        "CACHE_SCHEMA_VERSION",
        "DATABASE_RUNTIME_URL",
        "DATABASE_RUNTIME_ENDPOINT_KIND",
        "PGBOUNCER_POOL_MODE",
        "RABBIT_URL",
        "DATABASE_MIGRATION_URL",
    ];
    let old = capture_env(&keys);
    let old_object_storage = capture_env(WORKER_OBJECT_STORAGE_ENV_KEYS);

    std::env::set_var("BANJI_ENV", "staging");
    std::env::set_var("APP_ROLE", "worker");
    std::env::set_var("CACHE_SCHEMA_VERSION", "v1");
    std::env::set_var(
        "DATABASE_RUNTIME_URL",
        "postgres://runtime@db.example/banji",
    );
    std::env::set_var("DATABASE_RUNTIME_ENDPOINT_KIND", "pgbouncer");
    std::env::set_var("PGBOUNCER_POOL_MODE", "transaction");
    std::env::set_var("RABBIT_URL", "amqp://guest:guest@localhost:5672/%2f");
    std::env::remove_var("DATABASE_MIGRATION_URL");
    set_minimal_worker_object_storage_env();
    std::env::remove_var("ALGORITHM_ROLLOUT_HASH_SALT");

    let result = AppConfig::from_env();

    restore_env(old);
    restore_env(old_object_storage);

    assert!(result.is_err());
    assert!(result
        .unwrap_err()
        .to_string()
        .contains("ALGORITHM_ROLLOUT_HASH_SALT"));
}

#[test]
fn projection_consumer_validates_replay_bounds() {
    let _guard = lock_env();

    let old_env = std::env::var("BANJI_ENV").ok();
    let old_role = std::env::var("APP_ROLE").ok();
    let old_cache_schema = std::env::var("CACHE_SCHEMA_VERSION").ok();
    let old_runtime_url = std::env::var("DATABASE_RUNTIME_URL").ok();
    let old_endpoint_kind = std::env::var("DATABASE_RUNTIME_ENDPOINT_KIND").ok();
    let old_pool_mode = std::env::var("PGBOUNCER_POOL_MODE").ok();
    let old_run_mode = std::env::var("EVENT_CONSUMER_RUN_MODE").ok();
    let old_replay_from = std::env::var("EVENT_CONSUMER_REPLAY_FROM_ID").ok();
    let old_replay_to = std::env::var("EVENT_CONSUMER_REPLAY_TO_ID").ok();
    let old_migration_url = std::env::var("DATABASE_MIGRATION_URL").ok();

    std::env::set_var("BANJI_ENV", "staging");
    std::env::set_var("APP_ROLE", "projection-consumer");
    std::env::set_var("CACHE_SCHEMA_VERSION", "v1");
    std::env::set_var(
        "DATABASE_RUNTIME_URL",
        "postgres://runtime@db.example/banji",
    );
    std::env::set_var("DATABASE_RUNTIME_ENDPOINT_KIND", "pgbouncer");
    std::env::set_var("PGBOUNCER_POOL_MODE", "transaction");
    std::env::set_var("EVENT_CONSUMER_RUN_MODE", "replay-apply");
    std::env::set_var("EVENT_CONSUMER_REPLAY_FROM_ID", "10");
    std::env::set_var("EVENT_CONSUMER_REPLAY_TO_ID", "9");
    std::env::remove_var("DATABASE_MIGRATION_URL");

    let result = AppConfig::from_env();
    assert!(result.is_err());
    assert!(result
        .unwrap_err()
        .to_string()
        .contains("EVENT_CONSUMER_REPLAY_TO_ID"));

    if let Some(v) = old_env {
        std::env::set_var("BANJI_ENV", v);
    } else {
        std::env::remove_var("BANJI_ENV");
    }
    if let Some(v) = old_role {
        std::env::set_var("APP_ROLE", v);
    } else {
        std::env::remove_var("APP_ROLE");
    }
    if let Some(v) = old_cache_schema {
        std::env::set_var("CACHE_SCHEMA_VERSION", v);
    } else {
        std::env::remove_var("CACHE_SCHEMA_VERSION");
    }
    if let Some(v) = old_runtime_url {
        std::env::set_var("DATABASE_RUNTIME_URL", v);
    } else {
        std::env::remove_var("DATABASE_RUNTIME_URL");
    }
    if let Some(v) = old_endpoint_kind {
        std::env::set_var("DATABASE_RUNTIME_ENDPOINT_KIND", v);
    } else {
        std::env::remove_var("DATABASE_RUNTIME_ENDPOINT_KIND");
    }
    if let Some(v) = old_pool_mode {
        std::env::set_var("PGBOUNCER_POOL_MODE", v);
    } else {
        std::env::remove_var("PGBOUNCER_POOL_MODE");
    }
    if let Some(v) = old_run_mode {
        std::env::set_var("EVENT_CONSUMER_RUN_MODE", v);
    } else {
        std::env::remove_var("EVENT_CONSUMER_RUN_MODE");
    }
    if let Some(v) = old_replay_from {
        std::env::set_var("EVENT_CONSUMER_REPLAY_FROM_ID", v);
    } else {
        std::env::remove_var("EVENT_CONSUMER_REPLAY_FROM_ID");
    }
    if let Some(v) = old_replay_to {
        std::env::set_var("EVENT_CONSUMER_REPLAY_TO_ID", v);
    } else {
        std::env::remove_var("EVENT_CONSUMER_REPLAY_TO_ID");
    }
    if let Some(v) = old_migration_url {
        std::env::set_var("DATABASE_MIGRATION_URL", v);
    } else {
        std::env::remove_var("DATABASE_MIGRATION_URL");
    }
}

#[test]
fn projection_consumer_rejects_truncate_without_checkpoint_reset() {
    let _guard = lock_env();

    let old_env = std::env::var("BANJI_ENV").ok();
    let old_role = std::env::var("APP_ROLE").ok();
    let old_cache_schema = std::env::var("CACHE_SCHEMA_VERSION").ok();
    let old_runtime_url = std::env::var("DATABASE_RUNTIME_URL").ok();
    let old_endpoint_kind = std::env::var("DATABASE_RUNTIME_ENDPOINT_KIND").ok();
    let old_pool_mode = std::env::var("PGBOUNCER_POOL_MODE").ok();
    let old_run_mode = std::env::var("EVENT_CONSUMER_RUN_MODE").ok();
    let old_reset = std::env::var("EVENT_CONSUMER_REPLAY_RESET_CHECKPOINT").ok();
    let old_truncate = std::env::var("EVENT_CONSUMER_REPLAY_TRUNCATE_PROJECTION").ok();
    let old_migration_url = std::env::var("DATABASE_MIGRATION_URL").ok();

    std::env::set_var("BANJI_ENV", "staging");
    std::env::set_var("APP_ROLE", "projection-consumer");
    std::env::set_var("CACHE_SCHEMA_VERSION", "v1");
    std::env::set_var(
        "DATABASE_RUNTIME_URL",
        "postgres://runtime@db.example/banji",
    );
    std::env::set_var("DATABASE_RUNTIME_ENDPOINT_KIND", "pgbouncer");
    std::env::set_var("PGBOUNCER_POOL_MODE", "transaction");
    std::env::set_var("EVENT_CONSUMER_RUN_MODE", "replay-apply");
    std::env::set_var("EVENT_CONSUMER_REPLAY_RESET_CHECKPOINT", "false");
    std::env::set_var("EVENT_CONSUMER_REPLAY_TRUNCATE_PROJECTION", "true");
    std::env::remove_var("DATABASE_MIGRATION_URL");

    let result = AppConfig::from_env();
    assert!(result.is_err());
    assert!(result
        .unwrap_err()
        .to_string()
        .contains("EVENT_CONSUMER_REPLAY_TRUNCATE_PROJECTION"));

    if let Some(v) = old_env {
        std::env::set_var("BANJI_ENV", v);
    } else {
        std::env::remove_var("BANJI_ENV");
    }
    if let Some(v) = old_role {
        std::env::set_var("APP_ROLE", v);
    } else {
        std::env::remove_var("APP_ROLE");
    }
    if let Some(v) = old_cache_schema {
        std::env::set_var("CACHE_SCHEMA_VERSION", v);
    } else {
        std::env::remove_var("CACHE_SCHEMA_VERSION");
    }
    if let Some(v) = old_runtime_url {
        std::env::set_var("DATABASE_RUNTIME_URL", v);
    } else {
        std::env::remove_var("DATABASE_RUNTIME_URL");
    }
    if let Some(v) = old_endpoint_kind {
        std::env::set_var("DATABASE_RUNTIME_ENDPOINT_KIND", v);
    } else {
        std::env::remove_var("DATABASE_RUNTIME_ENDPOINT_KIND");
    }
    if let Some(v) = old_pool_mode {
        std::env::set_var("PGBOUNCER_POOL_MODE", v);
    } else {
        std::env::remove_var("PGBOUNCER_POOL_MODE");
    }
    if let Some(v) = old_run_mode {
        std::env::set_var("EVENT_CONSUMER_RUN_MODE", v);
    } else {
        std::env::remove_var("EVENT_CONSUMER_RUN_MODE");
    }
    if let Some(v) = old_reset {
        std::env::set_var("EVENT_CONSUMER_REPLAY_RESET_CHECKPOINT", v);
    } else {
        std::env::remove_var("EVENT_CONSUMER_REPLAY_RESET_CHECKPOINT");
    }
    if let Some(v) = old_truncate {
        std::env::set_var("EVENT_CONSUMER_REPLAY_TRUNCATE_PROJECTION", v);
    } else {
        std::env::remove_var("EVENT_CONSUMER_REPLAY_TRUNCATE_PROJECTION");
    }
    if let Some(v) = old_migration_url {
        std::env::set_var("DATABASE_MIGRATION_URL", v);
    } else {
        std::env::remove_var("DATABASE_MIGRATION_URL");
    }
}

#[test]
fn projection_consumer_rejects_non_inventory_stream() {
    let _guard = lock_env();

    let old_env = std::env::var("BANJI_ENV").ok();
    let old_role = std::env::var("APP_ROLE").ok();
    let old_cache_schema = std::env::var("CACHE_SCHEMA_VERSION").ok();
    let old_runtime_url = std::env::var("DATABASE_RUNTIME_URL").ok();
    let old_endpoint_kind = std::env::var("DATABASE_RUNTIME_ENDPOINT_KIND").ok();
    let old_pool_mode = std::env::var("PGBOUNCER_POOL_MODE").ok();
    let old_stream_name = std::env::var("EVENT_CONSUMER_STREAM_NAME").ok();
    let old_migration_url = std::env::var("DATABASE_MIGRATION_URL").ok();

    std::env::set_var("BANJI_ENV", "staging");
    std::env::set_var("APP_ROLE", "projection-consumer");
    std::env::set_var("CACHE_SCHEMA_VERSION", "v1");
    std::env::set_var(
        "DATABASE_RUNTIME_URL",
        "postgres://runtime@db.example/banji",
    );
    std::env::set_var("DATABASE_RUNTIME_ENDPOINT_KIND", "pgbouncer");
    std::env::set_var("PGBOUNCER_POOL_MODE", "transaction");
    std::env::set_var(
        "EVENT_CONSUMER_STREAM_NAME",
        "banji-core.staging.write-demo-completed",
    );
    std::env::remove_var("DATABASE_MIGRATION_URL");

    let result = AppConfig::from_env();
    assert!(result.is_err());
    assert!(result
        .unwrap_err()
        .to_string()
        .contains("EVENT_CONSUMER_STREAM_NAME must be"));

    if let Some(v) = old_env {
        std::env::set_var("BANJI_ENV", v);
    } else {
        std::env::remove_var("BANJI_ENV");
    }
    if let Some(v) = old_role {
        std::env::set_var("APP_ROLE", v);
    } else {
        std::env::remove_var("APP_ROLE");
    }
    if let Some(v) = old_cache_schema {
        std::env::set_var("CACHE_SCHEMA_VERSION", v);
    } else {
        std::env::remove_var("CACHE_SCHEMA_VERSION");
    }
    if let Some(v) = old_runtime_url {
        std::env::set_var("DATABASE_RUNTIME_URL", v);
    } else {
        std::env::remove_var("DATABASE_RUNTIME_URL");
    }
    if let Some(v) = old_endpoint_kind {
        std::env::set_var("DATABASE_RUNTIME_ENDPOINT_KIND", v);
    } else {
        std::env::remove_var("DATABASE_RUNTIME_ENDPOINT_KIND");
    }
    if let Some(v) = old_pool_mode {
        std::env::set_var("PGBOUNCER_POOL_MODE", v);
    } else {
        std::env::remove_var("PGBOUNCER_POOL_MODE");
    }
    if let Some(v) = old_stream_name {
        std::env::set_var("EVENT_CONSUMER_STREAM_NAME", v);
    } else {
        std::env::remove_var("EVENT_CONSUMER_STREAM_NAME");
    }
    if let Some(v) = old_migration_url {
        std::env::set_var("DATABASE_MIGRATION_URL", v);
    } else {
        std::env::remove_var("DATABASE_MIGRATION_URL");
    }
}

#[test]
fn runtime_rejects_migration_url_presence() {
    let _guard = lock_env();

    let old_cache_schema = std::env::var("CACHE_SCHEMA_VERSION").ok();
    let old_endpoint_kind = std::env::var("DATABASE_RUNTIME_ENDPOINT_KIND").ok();
    let old_migration_url = std::env::var("DATABASE_MIGRATION_URL").ok();

    std::env::set_var("CACHE_SCHEMA_VERSION", "v1");
    std::env::set_var("DATABASE_RUNTIME_ENDPOINT_KIND", "direct");
    std::env::set_var(
        "DATABASE_MIGRATION_URL",
        "postgres://migrator@db.example/banji",
    );

    let result = AppConfig::from_env();
    assert!(result.is_err());

    if let Some(v) = old_cache_schema {
        std::env::set_var("CACHE_SCHEMA_VERSION", v);
    } else {
        std::env::remove_var("CACHE_SCHEMA_VERSION");
    }
    if let Some(v) = old_endpoint_kind {
        std::env::set_var("DATABASE_RUNTIME_ENDPOINT_KIND", v);
    } else {
        std::env::remove_var("DATABASE_RUNTIME_ENDPOINT_KIND");
    }
    if let Some(v) = old_migration_url {
        std::env::set_var("DATABASE_MIGRATION_URL", v);
    } else {
        std::env::remove_var("DATABASE_MIGRATION_URL");
    }
}

#[test]
fn auth_enabled_requires_jwks_issuer_and_audience() {
    let _guard = lock_env();

    let old_auth_enabled = std::env::var("AUTH_ENABLED").ok();
    let old_auth_jwks_url = std::env::var("AUTH_JWKS_URL").ok();
    let old_auth_issuer = std::env::var("AUTH_ISSUER").ok();
    let old_auth_audience = std::env::var("AUTH_AUDIENCE").ok();
    let old_cache_schema = std::env::var("CACHE_SCHEMA_VERSION").ok();
    let old_endpoint_kind = std::env::var("DATABASE_RUNTIME_ENDPOINT_KIND").ok();
    let old_migration_url = std::env::var("DATABASE_MIGRATION_URL").ok();
    let old_env = std::env::var("BANJI_ENV").ok();

    std::env::set_var("BANJI_ENV", "dev");
    std::env::set_var("CACHE_SCHEMA_VERSION", "v1");
    std::env::set_var("DATABASE_RUNTIME_ENDPOINT_KIND", "direct");
    std::env::remove_var("DATABASE_MIGRATION_URL");
    std::env::set_var("AUTH_ENABLED", "true");
    std::env::remove_var("AUTH_JWKS_URL");
    std::env::remove_var("AUTH_ISSUER");
    std::env::remove_var("AUTH_AUDIENCE");
    assert!(AppConfig::from_env().is_err());

    std::env::set_var(
        "AUTH_JWKS_URL",
        "https://issuer.example/.well-known/jwks.json",
    );
    std::env::set_var("AUTH_ISSUER", "https://issuer.example/");
    std::env::set_var("AUTH_AUDIENCE", "banji-api");
    assert!(AppConfig::from_env().is_ok());

    if let Some(v) = old_auth_enabled {
        std::env::set_var("AUTH_ENABLED", v);
    } else {
        std::env::remove_var("AUTH_ENABLED");
    }
    if let Some(v) = old_auth_jwks_url {
        std::env::set_var("AUTH_JWKS_URL", v);
    } else {
        std::env::remove_var("AUTH_JWKS_URL");
    }
    if let Some(v) = old_auth_issuer {
        std::env::set_var("AUTH_ISSUER", v);
    } else {
        std::env::remove_var("AUTH_ISSUER");
    }
    if let Some(v) = old_auth_audience {
        std::env::set_var("AUTH_AUDIENCE", v);
    } else {
        std::env::remove_var("AUTH_AUDIENCE");
    }
    if let Some(v) = old_cache_schema {
        std::env::set_var("CACHE_SCHEMA_VERSION", v);
    } else {
        std::env::remove_var("CACHE_SCHEMA_VERSION");
    }
    if let Some(v) = old_endpoint_kind {
        std::env::set_var("DATABASE_RUNTIME_ENDPOINT_KIND", v);
    } else {
        std::env::remove_var("DATABASE_RUNTIME_ENDPOINT_KIND");
    }
    if let Some(v) = old_migration_url {
        std::env::set_var("DATABASE_MIGRATION_URL", v);
    } else {
        std::env::remove_var("DATABASE_MIGRATION_URL");
    }
    if let Some(v) = old_env {
        std::env::set_var("BANJI_ENV", v);
    } else {
        std::env::remove_var("BANJI_ENV");
    }
}

#[test]
fn rabbit_prefetch_env_values_are_parsed() {
    let _guard = lock_env();

    let old_env = std::env::var("BANJI_ENV").ok();
    let old_cache_schema = std::env::var("CACHE_SCHEMA_VERSION").ok();
    let old_endpoint_kind = std::env::var("DATABASE_RUNTIME_ENDPOINT_KIND").ok();
    let old_prefetch_fast = std::env::var("RABBIT_PREFETCH_FAST").ok();
    let old_prefetch_heavy = std::env::var("RABBIT_PREFETCH_HEAVY").ok();
    let old_migration_url = std::env::var("DATABASE_MIGRATION_URL").ok();

    std::env::set_var("BANJI_ENV", "dev");
    std::env::set_var("CACHE_SCHEMA_VERSION", "v1");
    std::env::set_var("DATABASE_RUNTIME_ENDPOINT_KIND", "direct");
    std::env::set_var("RABBIT_PREFETCH_FAST", "10");
    std::env::set_var("RABBIT_PREFETCH_HEAVY", "4");
    std::env::remove_var("DATABASE_MIGRATION_URL");

    let cfg = AppConfig::from_env().expect("config should parse");
    assert_eq!(cfg.rabbit_prefetch_fast, 10);
    assert_eq!(cfg.rabbit_prefetch_heavy, 4);

    if let Some(v) = old_env {
        std::env::set_var("BANJI_ENV", v);
    } else {
        std::env::remove_var("BANJI_ENV");
    }
    if let Some(v) = old_cache_schema {
        std::env::set_var("CACHE_SCHEMA_VERSION", v);
    } else {
        std::env::remove_var("CACHE_SCHEMA_VERSION");
    }
    if let Some(v) = old_endpoint_kind {
        std::env::set_var("DATABASE_RUNTIME_ENDPOINT_KIND", v);
    } else {
        std::env::remove_var("DATABASE_RUNTIME_ENDPOINT_KIND");
    }
    if let Some(v) = old_prefetch_fast {
        std::env::set_var("RABBIT_PREFETCH_FAST", v);
    } else {
        std::env::remove_var("RABBIT_PREFETCH_FAST");
    }
    if let Some(v) = old_prefetch_heavy {
        std::env::set_var("RABBIT_PREFETCH_HEAVY", v);
    } else {
        std::env::remove_var("RABBIT_PREFETCH_HEAVY");
    }
    if let Some(v) = old_migration_url {
        std::env::set_var("DATABASE_MIGRATION_URL", v);
    } else {
        std::env::remove_var("DATABASE_MIGRATION_URL");
    }
}

#[test]
fn rabbit_prefetch_values_must_be_positive() {
    let _guard = lock_env();

    let old_env = std::env::var("BANJI_ENV").ok();
    let old_cache_schema = std::env::var("CACHE_SCHEMA_VERSION").ok();
    let old_endpoint_kind = std::env::var("DATABASE_RUNTIME_ENDPOINT_KIND").ok();
    let old_prefetch_fast = std::env::var("RABBIT_PREFETCH_FAST").ok();
    let old_migration_url = std::env::var("DATABASE_MIGRATION_URL").ok();

    std::env::set_var("BANJI_ENV", "dev");
    std::env::set_var("CACHE_SCHEMA_VERSION", "v1");
    std::env::set_var("DATABASE_RUNTIME_ENDPOINT_KIND", "direct");
    std::env::set_var("RABBIT_PREFETCH_FAST", "0");
    std::env::remove_var("DATABASE_MIGRATION_URL");

    let result = AppConfig::from_env();
    assert!(result.is_err());

    if let Some(v) = old_env {
        std::env::set_var("BANJI_ENV", v);
    } else {
        std::env::remove_var("BANJI_ENV");
    }
    if let Some(v) = old_cache_schema {
        std::env::set_var("CACHE_SCHEMA_VERSION", v);
    } else {
        std::env::remove_var("CACHE_SCHEMA_VERSION");
    }
    if let Some(v) = old_endpoint_kind {
        std::env::set_var("DATABASE_RUNTIME_ENDPOINT_KIND", v);
    } else {
        std::env::remove_var("DATABASE_RUNTIME_ENDPOINT_KIND");
    }
    if let Some(v) = old_prefetch_fast {
        std::env::set_var("RABBIT_PREFETCH_FAST", v);
    } else {
        std::env::remove_var("RABBIT_PREFETCH_FAST");
    }
    if let Some(v) = old_migration_url {
        std::env::set_var("DATABASE_MIGRATION_URL", v);
    } else {
        std::env::remove_var("DATABASE_MIGRATION_URL");
    }
}

#[test]
fn edge_enforcement_requires_origin_secret_when_enabled() {
    let _guard = lock_env();

    let old_env = std::env::var("BANJI_ENV").ok();
    let old_cache_schema = std::env::var("CACHE_SCHEMA_VERSION").ok();
    let old_endpoint_kind = std::env::var("DATABASE_RUNTIME_ENDPOINT_KIND").ok();
    let old_edge_enabled = std::env::var("EDGE_ENFORCEMENT_ENABLED").ok();
    let old_edge_secret = std::env::var("EDGE_ORIGIN_AUTH_SECRET").ok();
    let old_migration_url = std::env::var("DATABASE_MIGRATION_URL").ok();

    std::env::set_var("BANJI_ENV", "dev");
    std::env::set_var("CACHE_SCHEMA_VERSION", "v1");
    std::env::set_var("DATABASE_RUNTIME_ENDPOINT_KIND", "direct");
    std::env::set_var("EDGE_ENFORCEMENT_ENABLED", "true");
    std::env::remove_var("EDGE_ORIGIN_AUTH_SECRET");
    std::env::remove_var("DATABASE_MIGRATION_URL");

    let result = AppConfig::from_env();
    assert!(result.is_err());

    if let Some(v) = old_env {
        std::env::set_var("BANJI_ENV", v);
    } else {
        std::env::remove_var("BANJI_ENV");
    }
    if let Some(v) = old_cache_schema {
        std::env::set_var("CACHE_SCHEMA_VERSION", v);
    } else {
        std::env::remove_var("CACHE_SCHEMA_VERSION");
    }
    if let Some(v) = old_endpoint_kind {
        std::env::set_var("DATABASE_RUNTIME_ENDPOINT_KIND", v);
    } else {
        std::env::remove_var("DATABASE_RUNTIME_ENDPOINT_KIND");
    }
    if let Some(v) = old_edge_enabled {
        std::env::set_var("EDGE_ENFORCEMENT_ENABLED", v);
    } else {
        std::env::remove_var("EDGE_ENFORCEMENT_ENABLED");
    }
    if let Some(v) = old_edge_secret {
        std::env::set_var("EDGE_ORIGIN_AUTH_SECRET", v);
    } else {
        std::env::remove_var("EDGE_ORIGIN_AUTH_SECRET");
    }
    if let Some(v) = old_migration_url {
        std::env::set_var("DATABASE_MIGRATION_URL", v);
    } else {
        std::env::remove_var("DATABASE_MIGRATION_URL");
    }
}

#[test]
fn staging_rejects_non_https_and_localhost_cors_origins() {
    let _guard = lock_env();

    let old_env = std::env::var("BANJI_ENV").ok();
    let old_cache_schema = std::env::var("CACHE_SCHEMA_VERSION").ok();
    let old_runtime_url = std::env::var("DATABASE_RUNTIME_URL").ok();
    let old_endpoint_kind = std::env::var("DATABASE_RUNTIME_ENDPOINT_KIND").ok();
    let old_pool_mode = std::env::var("PGBOUNCER_POOL_MODE").ok();
    let old_edge_enabled = std::env::var("EDGE_ENFORCEMENT_ENABLED").ok();
    let old_edge_secret = std::env::var("EDGE_ORIGIN_AUTH_SECRET").ok();
    let old_cors = std::env::var("EDGE_CORS_ALLOWED_ORIGINS").ok();
    let old_migration_url = std::env::var("DATABASE_MIGRATION_URL").ok();
    let old_auth_enabled = std::env::var("AUTH_ENABLED").ok();
    let old_auth_jwks_url = std::env::var("AUTH_JWKS_URL").ok();
    let old_auth_issuer = std::env::var("AUTH_ISSUER").ok();
    let old_auth_audience = std::env::var("AUTH_AUDIENCE").ok();

    std::env::set_var("BANJI_ENV", "staging");
    std::env::set_var("CACHE_SCHEMA_VERSION", "v1");
    std::env::set_var(
        "DATABASE_RUNTIME_URL",
        "postgres://runtime@db.example/banji",
    );
    std::env::set_var("DATABASE_RUNTIME_ENDPOINT_KIND", "pgbouncer");
    std::env::set_var("PGBOUNCER_POOL_MODE", "transaction");
    std::env::set_var("EDGE_ENFORCEMENT_ENABLED", "true");
    std::env::set_var("EDGE_ORIGIN_AUTH_SECRET", "edge-secret");
    std::env::set_var("AUTH_ENABLED", "true");
    std::env::set_var(
        "AUTH_JWKS_URL",
        "https://issuer.example/.well-known/jwks.json",
    );
    std::env::set_var("AUTH_ISSUER", "https://issuer.example/");
    std::env::set_var("AUTH_AUDIENCE", "banji-api");
    std::env::remove_var("DATABASE_MIGRATION_URL");

    std::env::set_var(
        "EDGE_CORS_ALLOWED_ORIGINS",
        "http://app.example.com,https://valid.example.com",
    );
    let non_https = AppConfig::from_env();
    assert!(non_https.is_err());

    std::env::set_var(
        "EDGE_CORS_ALLOWED_ORIGINS",
        "https://localhost:3000,https://valid.example.com",
    );
    let localhost = AppConfig::from_env();
    assert!(localhost.is_err());

    std::env::set_var("EDGE_CORS_ALLOWED_ORIGINS", "https://valid.example.com");
    let ok = AppConfig::from_env();
    assert!(ok.is_ok());

    if let Some(v) = old_env {
        std::env::set_var("BANJI_ENV", v);
    } else {
        std::env::remove_var("BANJI_ENV");
    }
    if let Some(v) = old_cache_schema {
        std::env::set_var("CACHE_SCHEMA_VERSION", v);
    } else {
        std::env::remove_var("CACHE_SCHEMA_VERSION");
    }
    if let Some(v) = old_runtime_url {
        std::env::set_var("DATABASE_RUNTIME_URL", v);
    } else {
        std::env::remove_var("DATABASE_RUNTIME_URL");
    }
    if let Some(v) = old_endpoint_kind {
        std::env::set_var("DATABASE_RUNTIME_ENDPOINT_KIND", v);
    } else {
        std::env::remove_var("DATABASE_RUNTIME_ENDPOINT_KIND");
    }
    if let Some(v) = old_pool_mode {
        std::env::set_var("PGBOUNCER_POOL_MODE", v);
    } else {
        std::env::remove_var("PGBOUNCER_POOL_MODE");
    }
    if let Some(v) = old_edge_enabled {
        std::env::set_var("EDGE_ENFORCEMENT_ENABLED", v);
    } else {
        std::env::remove_var("EDGE_ENFORCEMENT_ENABLED");
    }
    if let Some(v) = old_edge_secret {
        std::env::set_var("EDGE_ORIGIN_AUTH_SECRET", v);
    } else {
        std::env::remove_var("EDGE_ORIGIN_AUTH_SECRET");
    }
    if let Some(v) = old_cors {
        std::env::set_var("EDGE_CORS_ALLOWED_ORIGINS", v);
    } else {
        std::env::remove_var("EDGE_CORS_ALLOWED_ORIGINS");
    }
    if let Some(v) = old_migration_url {
        std::env::set_var("DATABASE_MIGRATION_URL", v);
    } else {
        std::env::remove_var("DATABASE_MIGRATION_URL");
    }
    if let Some(v) = old_auth_enabled {
        std::env::set_var("AUTH_ENABLED", v);
    } else {
        std::env::remove_var("AUTH_ENABLED");
    }
    if let Some(v) = old_auth_jwks_url {
        std::env::set_var("AUTH_JWKS_URL", v);
    } else {
        std::env::remove_var("AUTH_JWKS_URL");
    }
    if let Some(v) = old_auth_issuer {
        std::env::set_var("AUTH_ISSUER", v);
    } else {
        std::env::remove_var("AUTH_ISSUER");
    }
    if let Some(v) = old_auth_audience {
        std::env::set_var("AUTH_AUDIENCE", v);
    } else {
        std::env::remove_var("AUTH_AUDIENCE");
    }
}
