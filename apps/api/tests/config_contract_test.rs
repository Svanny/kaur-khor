use banji_api::config::AppConfig;
use std::sync::{Mutex, OnceLock};

fn env_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

#[test]
fn missing_cache_schema_version_fails_validation() {
    let _guard = env_lock().lock().unwrap();

    let old = std::env::var("CACHE_SCHEMA_VERSION").ok();
    std::env::remove_var("CACHE_SCHEMA_VERSION");

    let result = AppConfig::from_env();

    if let Some(v) = old {
        std::env::set_var("CACHE_SCHEMA_VERSION", v);
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
        system: "banji-core".to_string(),
        env: "dev".to_string(),
        service: "api".to_string(),
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
        rabbit_url: Some(rabbit_url),
        rabbit_vhost: "/".to_string(),
        rabbit_exchange_jobs: "banji-core.dev.jobs".to_string(),
        rabbit_dlx_exchange: "banji-core.dev.jobs.dlx".to_string(),
        rabbit_retry_1_ttl_ms: 30_000,
        rabbit_retry_2_ttl_ms: 300_000,
        rabbit_retry_3_ttl_ms: 1_800_000,
        rabbit_prefetch_fast: 20,
        rabbit_prefetch_heavy: 2,
        rabbit_max_attempts: 4,
        redis_url: Some("redis://:secret@redis.example:6379".to_string()),
        database_runtime_url: Some(db_url),
    };

    let rendered = format!("{cfg:?}");
    assert!(!rendered.contains("user:pass"));
    assert!(!rendered.contains("secret@redis"));
    assert!(rendered.contains("<redacted>"));
}
