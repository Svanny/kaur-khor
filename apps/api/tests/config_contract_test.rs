use banji_api::config::{AppConfig, DatabaseRuntimeEndpointKind, EdgeProvider, PgbouncerPoolMode};
use std::sync::{Mutex, OnceLock};

fn env_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

fn lock_env() -> std::sync::MutexGuard<'static, ()> {
    env_lock()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
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
        rabbit_replay_prefetch_fast: 2,
        rabbit_replay_prefetch_heavy: 1,
        rabbit_max_attempts: 4,
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
        edge_provider: EdgeProvider::None,
        edge_origin_auth_header_name: "x-banji-edge-auth".to_string(),
        edge_origin_auth_secret: None,
        edge_origin_auth_secret_next: None,
        edge_rate_limit_enabled: true,
        edge_rate_limit_window: std::time::Duration::from_secs(60),
        edge_rate_limit_read_max: 120,
        edge_rate_limit_write_max: 30,
        edge_rate_limit_max_keys: 1_000,
        edge_rate_limit_key_ttl: std::time::Duration::from_secs(300),
        edge_request_max_bytes: 262_144,
        edge_write_request_max_bytes: 65_536,
        edge_cors_allowed_origins: vec![],
        edge_trust_cf_connecting_ip: false,
    };

    let rendered = format!("{cfg:?}");
    assert!(!rendered.contains("user:pass"));
    assert!(!rendered.contains("secret@redis"));
    assert!(rendered.contains("<redacted>"));
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
    let old_edge_provider = std::env::var("EDGE_PROVIDER").ok();
    let old_edge_secret = std::env::var("EDGE_ORIGIN_AUTH_SECRET").ok();
    let old_edge_cors = std::env::var("EDGE_CORS_ALLOWED_ORIGINS").ok();
    let old_migration_url = std::env::var("DATABASE_MIGRATION_URL").ok();

    std::env::set_var("BANJI_ENV", "staging");
    std::env::set_var("CACHE_SCHEMA_VERSION", "v1");
    std::env::set_var(
        "DATABASE_RUNTIME_URL",
        "postgres://runtime@db.example/banji",
    );
    std::env::set_var("DATABASE_RUNTIME_ENDPOINT_KIND", "direct");
    std::env::set_var("PGBOUNCER_POOL_MODE", "transaction");
    std::env::set_var("EDGE_ENFORCEMENT_ENABLED", "true");
    std::env::set_var("EDGE_PROVIDER", "cloudflare");
    std::env::set_var("EDGE_ORIGIN_AUTH_SECRET", "edge-secret");
    std::env::set_var("EDGE_CORS_ALLOWED_ORIGINS", "https://staging.example.com");
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
    if let Some(v) = old_edge_provider {
        std::env::set_var("EDGE_PROVIDER", v);
    } else {
        std::env::remove_var("EDGE_PROVIDER");
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
fn replay_prefetch_env_values_are_parsed() {
    let _guard = lock_env();

    let old_env = std::env::var("BANJI_ENV").ok();
    let old_cache_schema = std::env::var("CACHE_SCHEMA_VERSION").ok();
    let old_endpoint_kind = std::env::var("DATABASE_RUNTIME_ENDPOINT_KIND").ok();
    let old_replay_fast = std::env::var("RABBIT_REPLAY_PREFETCH_FAST").ok();
    let old_replay_heavy = std::env::var("RABBIT_REPLAY_PREFETCH_HEAVY").ok();
    let old_migration_url = std::env::var("DATABASE_MIGRATION_URL").ok();

    std::env::set_var("BANJI_ENV", "dev");
    std::env::set_var("CACHE_SCHEMA_VERSION", "v1");
    std::env::set_var("DATABASE_RUNTIME_ENDPOINT_KIND", "direct");
    std::env::set_var("RABBIT_REPLAY_PREFETCH_FAST", "7");
    std::env::set_var("RABBIT_REPLAY_PREFETCH_HEAVY", "3");
    std::env::remove_var("DATABASE_MIGRATION_URL");

    let cfg = AppConfig::from_env().expect("config should parse");
    assert_eq!(cfg.rabbit_replay_prefetch_fast, 7);
    assert_eq!(cfg.rabbit_replay_prefetch_heavy, 3);

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
    if let Some(v) = old_replay_fast {
        std::env::set_var("RABBIT_REPLAY_PREFETCH_FAST", v);
    } else {
        std::env::remove_var("RABBIT_REPLAY_PREFETCH_FAST");
    }
    if let Some(v) = old_replay_heavy {
        std::env::set_var("RABBIT_REPLAY_PREFETCH_HEAVY", v);
    } else {
        std::env::remove_var("RABBIT_REPLAY_PREFETCH_HEAVY");
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
    let old_edge_provider = std::env::var("EDGE_PROVIDER").ok();
    let old_edge_secret = std::env::var("EDGE_ORIGIN_AUTH_SECRET").ok();
    let old_migration_url = std::env::var("DATABASE_MIGRATION_URL").ok();

    std::env::set_var("BANJI_ENV", "dev");
    std::env::set_var("CACHE_SCHEMA_VERSION", "v1");
    std::env::set_var("DATABASE_RUNTIME_ENDPOINT_KIND", "direct");
    std::env::set_var("EDGE_ENFORCEMENT_ENABLED", "true");
    std::env::set_var("EDGE_PROVIDER", "cloudflare");
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
    if let Some(v) = old_edge_provider {
        std::env::set_var("EDGE_PROVIDER", v);
    } else {
        std::env::remove_var("EDGE_PROVIDER");
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
    let old_edge_provider = std::env::var("EDGE_PROVIDER").ok();
    let old_edge_secret = std::env::var("EDGE_ORIGIN_AUTH_SECRET").ok();
    let old_cors = std::env::var("EDGE_CORS_ALLOWED_ORIGINS").ok();
    let old_migration_url = std::env::var("DATABASE_MIGRATION_URL").ok();

    std::env::set_var("BANJI_ENV", "staging");
    std::env::set_var("CACHE_SCHEMA_VERSION", "v1");
    std::env::set_var(
        "DATABASE_RUNTIME_URL",
        "postgres://runtime@db.example/banji",
    );
    std::env::set_var("DATABASE_RUNTIME_ENDPOINT_KIND", "pgbouncer");
    std::env::set_var("PGBOUNCER_POOL_MODE", "transaction");
    std::env::set_var("EDGE_ENFORCEMENT_ENABLED", "true");
    std::env::set_var("EDGE_PROVIDER", "cloudflare");
    std::env::set_var("EDGE_ORIGIN_AUTH_SECRET", "edge-secret");
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
    if let Some(v) = old_edge_provider {
        std::env::set_var("EDGE_PROVIDER", v);
    } else {
        std::env::remove_var("EDGE_PROVIDER");
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
}
