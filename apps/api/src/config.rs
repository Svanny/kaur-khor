use anyhow::{anyhow, Context, Result};
use std::env;
use std::fmt;
use std::time::Duration;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DatabaseRuntimeEndpointKind {
    Direct,
    Pgbouncer,
}

impl DatabaseRuntimeEndpointKind {
    fn parse(raw: &str) -> Result<Self> {
        match raw.to_ascii_lowercase().as_str() {
            "direct" => Ok(Self::Direct),
            "pgbouncer" => Ok(Self::Pgbouncer),
            _ => Err(anyhow!(
                "DATABASE_RUNTIME_ENDPOINT_KIND must be one of: direct, pgbouncer"
            )),
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Direct => "direct",
            Self::Pgbouncer => "pgbouncer",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PgbouncerPoolMode {
    Transaction,
    Session,
}

impl PgbouncerPoolMode {
    fn parse(raw: &str) -> Result<Self> {
        match raw.to_ascii_lowercase().as_str() {
            "transaction" => Ok(Self::Transaction),
            "session" => Ok(Self::Session),
            _ => Err(anyhow!(
                "PGBOUNCER_POOL_MODE must be one of: transaction, session"
            )),
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Transaction => "transaction",
            Self::Session => "session",
        }
    }
}

#[derive(Clone)]
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
    pub database_runtime_endpoint_kind: DatabaseRuntimeEndpointKind,
    pub pgbouncer_pool_mode: Option<PgbouncerPoolMode>,
    pub sqlx_pool_max_connections: u32,
    pub sqlx_pool_min_connections: u32,
    pub sqlx_pool_acquire_timeout: Duration,
    pub sqlx_pool_connect_timeout: Duration,
    pub sqlx_pool_idle_timeout: Duration,
    pub sqlx_pool_max_lifetime: Duration,
    pub postgres_connection_budget_total: u32,
}

impl fmt::Debug for AppConfig {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        fn redacted(value: &Option<String>) -> &'static str {
            match value {
                Some(v) if !v.trim().is_empty() => "<redacted>",
                _ => "<unset>",
            }
        }

        f.debug_struct("AppConfig")
            .field("system", &self.system)
            .field("env", &self.env)
            .field("service", &self.service)
            .field("cache_enabled", &self.cache_enabled)
            .field("cache_schema_version", &self.cache_schema_version)
            .field("cache_default_ttl", &self.cache_default_ttl)
            .field("cache_ttl_jitter", &self.cache_ttl_jitter)
            .field("redis_connect_timeout", &self.redis_connect_timeout)
            .field("redis_command_timeout", &self.redis_command_timeout)
            .field(
                "redis_circuit_error_threshold",
                &self.redis_circuit_error_threshold,
            )
            .field("redis_circuit_window", &self.redis_circuit_window)
            .field("redis_circuit_cooldown", &self.redis_circuit_cooldown)
            .field("redis_log_rate_limit", &self.redis_log_rate_limit)
            .field("event_payload_max_bytes", &self.event_payload_max_bytes)
            .field("rabbit_url", &redacted(&self.rabbit_url))
            .field("rabbit_vhost", &self.rabbit_vhost)
            .field("rabbit_exchange_jobs", &self.rabbit_exchange_jobs)
            .field("rabbit_dlx_exchange", &self.rabbit_dlx_exchange)
            .field("rabbit_retry_1_ttl_ms", &self.rabbit_retry_1_ttl_ms)
            .field("rabbit_retry_2_ttl_ms", &self.rabbit_retry_2_ttl_ms)
            .field("rabbit_retry_3_ttl_ms", &self.rabbit_retry_3_ttl_ms)
            .field("rabbit_prefetch_fast", &self.rabbit_prefetch_fast)
            .field("rabbit_prefetch_heavy", &self.rabbit_prefetch_heavy)
            .field("rabbit_max_attempts", &self.rabbit_max_attempts)
            .field("redis_url", &redacted(&self.redis_url))
            .field(
                "database_runtime_url",
                &redacted(&self.database_runtime_url),
            )
            .field(
                "database_runtime_endpoint_kind",
                &self.database_runtime_endpoint_kind.as_str(),
            )
            .field(
                "pgbouncer_pool_mode",
                &self.pgbouncer_pool_mode.map(PgbouncerPoolMode::as_str),
            )
            .field("sqlx_pool_max_connections", &self.sqlx_pool_max_connections)
            .field("sqlx_pool_min_connections", &self.sqlx_pool_min_connections)
            .field("sqlx_pool_acquire_timeout", &self.sqlx_pool_acquire_timeout)
            .field("sqlx_pool_connect_timeout", &self.sqlx_pool_connect_timeout)
            .field("sqlx_pool_idle_timeout", &self.sqlx_pool_idle_timeout)
            .field("sqlx_pool_max_lifetime", &self.sqlx_pool_max_lifetime)
            .field(
                "postgres_connection_budget_total",
                &self.postgres_connection_budget_total,
            )
            .finish()
    }
}

impl AppConfig {
    pub fn from_env() -> Result<Self> {
        if optional_env("DATABASE_MIGRATION_URL").is_some() {
            return Err(anyhow!(
                "DATABASE_MIGRATION_URL must not be set in runtime service environments"
            ));
        }

        let cache_schema_version = required_env("CACHE_SCHEMA_VERSION")?;
        let env_name = env::var("BANJI_ENV").unwrap_or_else(|_| "dev".to_string());
        let database_runtime_url = optional_env("DATABASE_RUNTIME_URL");

        let database_runtime_endpoint_kind =
            DatabaseRuntimeEndpointKind::parse(&required_env("DATABASE_RUNTIME_ENDPOINT_KIND")?)?;

        let pgbouncer_pool_mode = optional_env("PGBOUNCER_POOL_MODE")
            .map(|raw| PgbouncerPoolMode::parse(&raw))
            .transpose()?;

        if database_runtime_endpoint_kind == DatabaseRuntimeEndpointKind::Pgbouncer
            && pgbouncer_pool_mode.is_none()
        {
            return Err(anyhow!(
                "PGBOUNCER_POOL_MODE is required when DATABASE_RUNTIME_ENDPOINT_KIND=pgbouncer"
            ));
        }

        let sqlx_pool_max_connections = parse_u32("SQLX_POOL_MAX_CONNECTIONS", 10)?;
        let sqlx_pool_min_connections = parse_u32("SQLX_POOL_MIN_CONNECTIONS", 1)?;
        if sqlx_pool_max_connections == 0 {
            return Err(anyhow!("SQLX_POOL_MAX_CONNECTIONS must be greater than 0"));
        }
        if sqlx_pool_min_connections > sqlx_pool_max_connections {
            return Err(anyhow!(
                "SQLX_POOL_MIN_CONNECTIONS must be less than or equal to SQLX_POOL_MAX_CONNECTIONS"
            ));
        }

        let sqlx_pool_acquire_timeout =
            Duration::from_millis(parse_u64("SQLX_POOL_ACQUIRE_TIMEOUT_MS", 2_000)?);
        let sqlx_pool_connect_timeout =
            Duration::from_millis(parse_u64("SQLX_POOL_CONNECT_TIMEOUT_MS", 2_000)?);
        let sqlx_pool_idle_timeout =
            Duration::from_secs(parse_u64("SQLX_POOL_IDLE_TIMEOUT_SECONDS", 300)?);
        let sqlx_pool_max_lifetime =
            Duration::from_secs(parse_u64("SQLX_POOL_MAX_LIFETIME_SECONDS", 1_800)?);
        let postgres_connection_budget_total = parse_u32("POSTGRES_CONNECTION_BUDGET_TOTAL", 80)?;
        if postgres_connection_budget_total == 0 {
            return Err(anyhow!(
                "POSTGRES_CONNECTION_BUDGET_TOTAL must be greater than 0"
            ));
        }

        let strict_pooling_env = matches!(env_name.as_str(), "staging" | "prod");
        if strict_pooling_env {
            if database_runtime_url.is_none() {
                return Err(anyhow!(
                    "DATABASE_RUNTIME_URL is required in staging/prod runtime environments"
                ));
            }
            if database_runtime_endpoint_kind != DatabaseRuntimeEndpointKind::Pgbouncer {
                return Err(anyhow!(
                    "staging/prod require DATABASE_RUNTIME_ENDPOINT_KIND=pgbouncer"
                ));
            }
            if pgbouncer_pool_mode != Some(PgbouncerPoolMode::Transaction) {
                return Err(anyhow!(
                    "staging/prod require PGBOUNCER_POOL_MODE=transaction"
                ));
            }
        }

        Ok(Self {
            system: env::var("BANJI_SYSTEM").unwrap_or_else(|_| "banji-core".to_string()),
            env: env_name,
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
            redis_url: optional_env("REDIS_URL"),
            database_runtime_url,
            database_runtime_endpoint_kind,
            pgbouncer_pool_mode,
            sqlx_pool_max_connections,
            sqlx_pool_min_connections,
            sqlx_pool_acquire_timeout,
            sqlx_pool_connect_timeout,
            sqlx_pool_idle_timeout,
            sqlx_pool_max_lifetime,
            postgres_connection_budget_total,
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

fn optional_env(name: &str) -> Option<String> {
    env::var(name)
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
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
