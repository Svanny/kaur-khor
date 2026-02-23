use anyhow::{anyhow, Context, Result};
use std::env;
use std::time::Duration;

#[derive(Clone, Debug)]
pub struct AppConfig {
    pub system: String,
    pub env: String,
    pub service: String,
    pub cache_enabled: bool,
    pub cache_schema_version: String,
    pub cache_default_ttl: Duration,
    pub cache_ttl_jitter: Duration,
    pub redis_connect_timeout: Duration,
    pub redis_command_timeout: Duration,
    pub redis_circuit_error_threshold: u32,
    pub redis_circuit_window: Duration,
    pub redis_circuit_cooldown: Duration,
    pub redis_log_rate_limit: Duration,
    pub event_payload_max_bytes: usize,
    pub rabbit_url: Option<String>,
    pub rabbit_vhost: String,
    pub rabbit_exchange_jobs: String,
    pub rabbit_dlx_exchange: String,
    pub rabbit_retry_1_ttl_ms: u64,
    pub rabbit_retry_2_ttl_ms: u64,
    pub rabbit_retry_3_ttl_ms: u64,
    pub rabbit_prefetch_fast: u16,
    pub rabbit_prefetch_heavy: u16,
    pub rabbit_max_attempts: u8,
    pub redis_url: Option<String>,
    pub database_runtime_url: Option<String>,
}

impl AppConfig {
    pub fn from_env() -> Result<Self> {
        let cache_schema_version = required_env("CACHE_SCHEMA_VERSION")?;

        Ok(Self {
            system: env::var("BANJI_SYSTEM").unwrap_or_else(|_| "banji-core".to_string()),
            env: env::var("BANJI_ENV").unwrap_or_else(|_| "dev".to_string()),
            service: env::var("BANJI_SERVICE").unwrap_or_else(|_| "api".to_string()),
            cache_enabled: parse_bool("CACHE_ENABLED", true)?,
            cache_schema_version,
            cache_default_ttl: Duration::from_secs(parse_u64("CACHE_DEFAULT_TTL_SECONDS", 300)?),
            cache_ttl_jitter: Duration::from_secs(parse_u64("CACHE_TTL_JITTER_SECONDS", 30)?),
            redis_connect_timeout: Duration::from_millis(parse_u64(
                "REDIS_CONNECT_TIMEOUT_MS",
                100,
            )?),
            redis_command_timeout: Duration::from_millis(parse_u64(
                "REDIS_COMMAND_TIMEOUT_MS",
                50,
            )?),
            redis_circuit_error_threshold: parse_u32("REDIS_CIRCUIT_ERROR_THRESHOLD", 20)?,
            redis_circuit_window: Duration::from_secs(parse_u64(
                "REDIS_CIRCUIT_WINDOW_SECONDS",
                30,
            )?),
            redis_circuit_cooldown: Duration::from_secs(parse_u64(
                "REDIS_CIRCUIT_COOLDOWN_SECONDS",
                60,
            )?),
            redis_log_rate_limit: Duration::from_secs(parse_u64(
                "REDIS_LOG_RATE_LIMIT_SECONDS",
                30,
            )?),
            event_payload_max_bytes: parse_u64("EVENT_PAYLOAD_MAX_BYTES", 65536)? as usize,
            rabbit_url: env::var("RABBIT_URL").ok(),
            rabbit_vhost: env::var("RABBIT_VHOST").unwrap_or_else(|_| "/".to_string()),
            rabbit_exchange_jobs: env::var("RABBIT_EXCHANGE_JOBS")
                .unwrap_or_else(|_| "banji-core.dev.jobs".to_string()),
            rabbit_dlx_exchange: env::var("RABBIT_DLX_EXCHANGE")
                .unwrap_or_else(|_| "banji-core.dev.jobs.dlx".to_string()),
            rabbit_retry_1_ttl_ms: parse_u64("RABBIT_RETRY_1_TTL_MS", 30_000)?,
            rabbit_retry_2_ttl_ms: parse_u64("RABBIT_RETRY_2_TTL_MS", 300_000)?,
            rabbit_retry_3_ttl_ms: parse_u64("RABBIT_RETRY_3_TTL_MS", 1_800_000)?,
            rabbit_prefetch_fast: parse_u16("RABBIT_PREFETCH_FAST", 20)?,
            rabbit_prefetch_heavy: parse_u16("RABBIT_PREFETCH_HEAVY", 2)?,
            rabbit_max_attempts: parse_u8("RABBIT_MAX_ATTEMPTS", 4)?,
            redis_url: env::var("REDIS_URL").ok(),
            database_runtime_url: env::var("DATABASE_RUNTIME_URL").ok(),
        })
    }
}

fn required_env(name: &str) -> Result<String> {
    let value = env::var(name).with_context(|| format!("{name} is required"))?;
    if value.trim().is_empty() {
        return Err(anyhow!("{name} must not be empty"));
    }
    Ok(value)
}

fn parse_bool(name: &str, default: bool) -> Result<bool> {
    match env::var(name) {
        Ok(v) => match v.to_ascii_lowercase().as_str() {
            "1" | "true" | "yes" => Ok(true),
            "0" | "false" | "no" => Ok(false),
            _ => Err(anyhow!("{name} must be boolean")),
        },
        Err(_) => Ok(default),
    }
}

fn parse_u64(name: &str, default: u64) -> Result<u64> {
    match env::var(name) {
        Ok(v) => v
            .parse::<u64>()
            .with_context(|| format!("{name} must be an integer")),
        Err(_) => Ok(default),
    }
}

fn parse_u32(name: &str, default: u32) -> Result<u32> {
    match env::var(name) {
        Ok(v) => v
            .parse::<u32>()
            .with_context(|| format!("{name} must be an integer")),
        Err(_) => Ok(default),
    }
}

fn parse_u16(name: &str, default: u16) -> Result<u16> {
    match env::var(name) {
        Ok(v) => v
            .parse::<u16>()
            .with_context(|| format!("{name} must be an integer")),
        Err(_) => Ok(default),
    }
}

fn parse_u8(name: &str, default: u8) -> Result<u8> {
    match env::var(name) {
        Ok(v) => v
            .parse::<u8>()
            .with_context(|| format!("{name} must be an integer")),
        Err(_) => Ok(default),
    }
}
