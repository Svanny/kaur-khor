use anyhow::{anyhow, Context, Result};
use axum::http::header::HeaderName;
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

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EdgeProvider {
    Cloudflare,
    None,
}

impl EdgeProvider {
    fn parse(raw: &str) -> Result<Self> {
        match raw.to_ascii_lowercase().as_str() {
            "cloudflare" => Ok(Self::Cloudflare),
            "none" => Ok(Self::None),
            _ => Err(anyhow!("EDGE_PROVIDER must be one of: cloudflare, none")),
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Cloudflare => "cloudflare",
            Self::None => "none",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AppRole {
    Api,
    EventRelay,
    ProjectionConsumer,
}

impl AppRole {
    fn parse(raw: &str) -> Result<Self> {
        match raw.to_ascii_lowercase().as_str() {
            "api" => Ok(Self::Api),
            "event-relay" => Ok(Self::EventRelay),
            "projection-consumer" => Ok(Self::ProjectionConsumer),
            _ => Err(anyhow!(
                "APP_ROLE must be one of: api, event-relay, projection-consumer"
            )),
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Api => "api",
            Self::EventRelay => "event-relay",
            Self::ProjectionConsumer => "projection-consumer",
        }
    }
}

#[derive(Clone)]
pub struct AppConfig {
    pub app_role: AppRole,
    pub system: String,
    pub env: String,
    pub service: String,
    pub auth_enabled: bool,
    pub auth_jwks_url: Option<String>,
    pub auth_issuer: Option<String>,
    pub auth_audience: Option<String>,
    pub auth_jwks_cache_ttl: Duration,
    pub auth_jwks_timeout: Duration,
    pub auth_clock_skew: Duration,
    pub idempotency_retention_days: u64,
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
    pub event_relay_batch_size: u32,
    pub event_relay_poll_interval: Duration,
    pub event_relay_retry_backoff: Duration,
    pub event_relay_max_backoff: Duration,
    pub event_relay_block_after_attempts: u32,
    pub event_outbox_published_retention_days: u32,
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
    pub edge_enforcement_enabled: bool,
    pub edge_provider: EdgeProvider,
    pub edge_origin_auth_header_name: String,
    pub edge_origin_auth_secret: Option<String>,
    pub edge_origin_auth_secret_next: Option<String>,
    pub edge_rate_limit_enabled: bool,
    pub edge_rate_limit_window: Duration,
    pub edge_rate_limit_read_max: u32,
    pub edge_rate_limit_write_max: u32,
    pub edge_rate_limit_max_keys: usize,
    pub edge_rate_limit_key_ttl: Duration,
    pub edge_request_max_bytes: usize,
    pub edge_write_request_max_bytes: usize,
    pub edge_cors_allowed_origins: Vec<String>,
    pub edge_trust_cf_connecting_ip: bool,
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
            .field("app_role", &self.app_role.as_str())
            .field("system", &self.system)
            .field("env", &self.env)
            .field("service", &self.service)
            .field("auth_enabled", &self.auth_enabled)
            .field("auth_jwks_url", &self.auth_jwks_url)
            .field("auth_issuer", &self.auth_issuer)
            .field("auth_audience", &self.auth_audience)
            .field("auth_jwks_cache_ttl", &self.auth_jwks_cache_ttl)
            .field("auth_jwks_timeout", &self.auth_jwks_timeout)
            .field("auth_clock_skew", &self.auth_clock_skew)
            .field(
                "idempotency_retention_days",
                &self.idempotency_retention_days,
            )
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
            .field("event_relay_batch_size", &self.event_relay_batch_size)
            .field("event_relay_poll_interval", &self.event_relay_poll_interval)
            .field("event_relay_retry_backoff", &self.event_relay_retry_backoff)
            .field("event_relay_max_backoff", &self.event_relay_max_backoff)
            .field(
                "event_relay_block_after_attempts",
                &self.event_relay_block_after_attempts,
            )
            .field(
                "event_outbox_published_retention_days",
                &self.event_outbox_published_retention_days,
            )
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
            .field("edge_enforcement_enabled", &self.edge_enforcement_enabled)
            .field("edge_provider", &self.edge_provider.as_str())
            .field(
                "edge_origin_auth_header_name",
                &self.edge_origin_auth_header_name,
            )
            .field(
                "edge_origin_auth_secret",
                &redacted(&self.edge_origin_auth_secret),
            )
            .field(
                "edge_origin_auth_secret_next",
                &redacted(&self.edge_origin_auth_secret_next),
            )
            .field("edge_rate_limit_enabled", &self.edge_rate_limit_enabled)
            .field("edge_rate_limit_window", &self.edge_rate_limit_window)
            .field("edge_rate_limit_read_max", &self.edge_rate_limit_read_max)
            .field("edge_rate_limit_write_max", &self.edge_rate_limit_write_max)
            .field("edge_rate_limit_max_keys", &self.edge_rate_limit_max_keys)
            .field("edge_rate_limit_key_ttl", &self.edge_rate_limit_key_ttl)
            .field("edge_request_max_bytes", &self.edge_request_max_bytes)
            .field(
                "edge_write_request_max_bytes",
                &self.edge_write_request_max_bytes,
            )
            .field("edge_cors_allowed_origins", &self.edge_cors_allowed_origins)
            .field(
                "edge_trust_cf_connecting_ip",
                &self.edge_trust_cf_connecting_ip,
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
        let app_role = AppRole::parse(&env::var("APP_ROLE").unwrap_or_else(|_| "api".to_string()))?;
        let strict_edge_env = matches!(env_name.as_str(), "staging" | "prod");
        let strict_api_env = strict_edge_env && app_role == AppRole::Api;
        let auth_enabled = parse_bool("AUTH_ENABLED", strict_api_env)?;
        let auth_jwks_url = optional_env("AUTH_JWKS_URL");
        let auth_issuer = optional_env("AUTH_ISSUER");
        let auth_audience = optional_env("AUTH_AUDIENCE");
        let auth_jwks_cache_ttl =
            Duration::from_secs(parse_u64("AUTH_JWKS_CACHE_TTL_SECONDS", 300)?);
        let auth_jwks_timeout = Duration::from_millis(parse_u64("AUTH_JWKS_TIMEOUT_MS", 1_000)?);
        let auth_clock_skew = Duration::from_secs(parse_u64("AUTH_CLOCK_SKEW_SECONDS", 30)?);
        let idempotency_retention_days = parse_u64("IDEMPOTENCY_RETENTION_DAYS", 30)?;
        if auth_jwks_cache_ttl.as_secs() == 0 {
            return Err(anyhow!(
                "AUTH_JWKS_CACHE_TTL_SECONDS must be greater than 0"
            ));
        }
        if auth_jwks_timeout.is_zero() {
            return Err(anyhow!("AUTH_JWKS_TIMEOUT_MS must be greater than 0"));
        }
        if idempotency_retention_days == 0 {
            return Err(anyhow!("IDEMPOTENCY_RETENTION_DAYS must be greater than 0"));
        }
        if app_role == AppRole::Api
            && auth_enabled
            && (auth_jwks_url.is_none() || auth_issuer.is_none() || auth_audience.is_none())
        {
            return Err(anyhow!(
                "AUTH_JWKS_URL, AUTH_ISSUER, and AUTH_AUDIENCE are required when AUTH_ENABLED=true"
            ));
        }
        if strict_api_env && !auth_enabled {
            return Err(anyhow!("staging/prod require AUTH_ENABLED=true"));
        }
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

        let edge_enforcement_enabled = parse_bool("EDGE_ENFORCEMENT_ENABLED", strict_api_env)?;
        let edge_provider_raw = env::var("EDGE_PROVIDER").unwrap_or_else(|_| {
            if edge_enforcement_enabled {
                "cloudflare".to_string()
            } else {
                "none".to_string()
            }
        });
        let edge_provider = EdgeProvider::parse(&edge_provider_raw)?;
        let edge_origin_auth_header_name = env::var("EDGE_ORIGIN_AUTH_HEADER_NAME")
            .unwrap_or_else(|_| "x-banji-edge-auth".to_string())
            .trim()
            .to_string();
        if edge_origin_auth_header_name.is_empty() {
            return Err(anyhow!("EDGE_ORIGIN_AUTH_HEADER_NAME must not be empty"));
        }
        HeaderName::from_bytes(edge_origin_auth_header_name.as_bytes()).with_context(|| {
            "EDGE_ORIGIN_AUTH_HEADER_NAME must be a valid HTTP header name".to_string()
        })?;

        let edge_origin_auth_secret = optional_env("EDGE_ORIGIN_AUTH_SECRET");
        let edge_origin_auth_secret_next = optional_env("EDGE_ORIGIN_AUTH_SECRET_NEXT");

        if edge_enforcement_enabled && edge_origin_auth_secret.is_none() {
            return Err(anyhow!(
                "EDGE_ORIGIN_AUTH_SECRET is required when EDGE_ENFORCEMENT_ENABLED=true"
            ));
        }

        let edge_rate_limit_enabled = parse_bool("EDGE_RATE_LIMIT_ENABLED", true)?;
        let edge_rate_limit_window =
            Duration::from_secs(parse_u64("EDGE_RATE_LIMIT_WINDOW_SECONDS", 60)?);
        let edge_rate_limit_read_max = parse_u32("EDGE_RATE_LIMIT_READ_MAX", 120)?;
        let edge_rate_limit_write_max = parse_u32("EDGE_RATE_LIMIT_WRITE_MAX", 30)?;
        let edge_rate_limit_max_keys = parse_usize("EDGE_RATE_LIMIT_MAX_KEYS", 10_000)?;
        let edge_rate_limit_key_ttl =
            Duration::from_secs(parse_u64("EDGE_RATE_LIMIT_KEY_TTL_SECONDS", 300)?);
        let edge_request_max_bytes = parse_usize("EDGE_REQUEST_MAX_BYTES", 262_144)?;
        let edge_write_request_max_bytes = parse_usize("EDGE_WRITE_REQUEST_MAX_BYTES", 65_536)?;
        if edge_rate_limit_window.as_secs() == 0 {
            return Err(anyhow!(
                "EDGE_RATE_LIMIT_WINDOW_SECONDS must be greater than 0"
            ));
        }
        if edge_rate_limit_read_max == 0 {
            return Err(anyhow!("EDGE_RATE_LIMIT_READ_MAX must be greater than 0"));
        }
        if edge_rate_limit_write_max == 0 {
            return Err(anyhow!("EDGE_RATE_LIMIT_WRITE_MAX must be greater than 0"));
        }
        if edge_rate_limit_max_keys == 0 {
            return Err(anyhow!("EDGE_RATE_LIMIT_MAX_KEYS must be greater than 0"));
        }
        if edge_rate_limit_key_ttl.as_secs() == 0 {
            return Err(anyhow!(
                "EDGE_RATE_LIMIT_KEY_TTL_SECONDS must be greater than 0"
            ));
        }
        if edge_request_max_bytes == 0 {
            return Err(anyhow!("EDGE_REQUEST_MAX_BYTES must be greater than 0"));
        }
        if edge_write_request_max_bytes == 0 {
            return Err(anyhow!(
                "EDGE_WRITE_REQUEST_MAX_BYTES must be greater than 0"
            ));
        }
        if edge_write_request_max_bytes > edge_request_max_bytes {
            return Err(anyhow!(
                "EDGE_WRITE_REQUEST_MAX_BYTES must be less than or equal to EDGE_REQUEST_MAX_BYTES"
            ));
        }

        let edge_cors_allowed_origins = parse_csv_env("EDGE_CORS_ALLOWED_ORIGINS");
        if strict_api_env {
            if !edge_enforcement_enabled {
                return Err(anyhow!(
                    "staging/prod require EDGE_ENFORCEMENT_ENABLED=true"
                ));
            }
            if edge_provider != EdgeProvider::Cloudflare {
                return Err(anyhow!("staging/prod require EDGE_PROVIDER=cloudflare"));
            }
            if edge_cors_allowed_origins.is_empty() {
                return Err(anyhow!(
                    "staging/prod require EDGE_CORS_ALLOWED_ORIGINS to be explicitly set"
                ));
            }
            for origin in &edge_cors_allowed_origins {
                if !origin.starts_with("https://") {
                    return Err(anyhow!(
                        "staging/prod EDGE_CORS_ALLOWED_ORIGINS entries must start with https://"
                    ));
                }
                if origin.to_ascii_lowercase().contains("localhost") {
                    return Err(anyhow!(
                        "staging/prod EDGE_CORS_ALLOWED_ORIGINS must not include localhost"
                    ));
                }
            }
        }

        let edge_trust_cf_connecting_ip =
            parse_bool("EDGE_TRUST_CF_CONNECTING_IP", strict_edge_env)?;
        let event_relay_batch_size = parse_u32("EVENT_RELAY_BATCH_SIZE", 100)?;
        let event_relay_poll_interval =
            Duration::from_millis(parse_u64("EVENT_RELAY_POLL_INTERVAL_MS", 500)?);
        let event_relay_retry_backoff =
            Duration::from_millis(parse_u64("EVENT_RELAY_RETRY_BACKOFF_MS", 1_000)?);
        let event_relay_max_backoff =
            Duration::from_millis(parse_u64("EVENT_RELAY_MAX_BACKOFF_MS", 60_000)?);
        let event_relay_block_after_attempts = parse_u32("EVENT_RELAY_BLOCK_AFTER_ATTEMPTS", 25)?;
        let event_outbox_published_retention_days =
            parse_u32("EVENT_OUTBOX_PUBLISHED_RETENTION_DAYS", 7)?;
        if event_relay_batch_size == 0 {
            return Err(anyhow!("EVENT_RELAY_BATCH_SIZE must be greater than 0"));
        }
        if event_relay_poll_interval.is_zero() {
            return Err(anyhow!(
                "EVENT_RELAY_POLL_INTERVAL_MS must be greater than 0"
            ));
        }
        if event_relay_retry_backoff.is_zero() {
            return Err(anyhow!(
                "EVENT_RELAY_RETRY_BACKOFF_MS must be greater than 0"
            ));
        }
        if event_relay_max_backoff < event_relay_retry_backoff {
            return Err(anyhow!(
                "EVENT_RELAY_MAX_BACKOFF_MS must be greater than or equal to EVENT_RELAY_RETRY_BACKOFF_MS"
            ));
        }
        if event_relay_block_after_attempts == 0 {
            return Err(anyhow!(
                "EVENT_RELAY_BLOCK_AFTER_ATTEMPTS must be greater than 0"
            ));
        }
        if event_outbox_published_retention_days == 0 {
            return Err(anyhow!(
                "EVENT_OUTBOX_PUBLISHED_RETENTION_DAYS must be greater than 0"
            ));
        }
        let rabbit_prefetch_fast = parse_u16("RABBIT_PREFETCH_FAST", 20)?;
        let rabbit_prefetch_heavy = parse_u16("RABBIT_PREFETCH_HEAVY", 2)?;
        if rabbit_prefetch_fast == 0 || rabbit_prefetch_heavy == 0 {
            return Err(anyhow!("Rabbit prefetch values must all be greater than 0"));
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
        if matches!(app_role, AppRole::EventRelay | AppRole::ProjectionConsumer)
            && database_runtime_url.is_none()
        {
            return Err(anyhow!(
                "APP_ROLE=event-relay|projection-consumer requires DATABASE_RUNTIME_URL"
            ));
        }

        Ok(Self {
            app_role,
            system: env::var("BANJI_SYSTEM").unwrap_or_else(|_| "banji-core".to_string()),
            env: env_name,
            service: env::var("BANJI_SERVICE").unwrap_or_else(|_| "api".to_string()),
            auth_enabled,
            auth_jwks_url,
            auth_issuer,
            auth_audience,
            auth_jwks_cache_ttl,
            auth_jwks_timeout,
            auth_clock_skew,
            idempotency_retention_days,
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
            event_relay_batch_size,
            event_relay_poll_interval,
            event_relay_retry_backoff,
            event_relay_max_backoff,
            event_relay_block_after_attempts,
            event_outbox_published_retention_days,
            rabbit_url: env::var("RABBIT_URL").ok(),
            rabbit_vhost: env::var("RABBIT_VHOST").unwrap_or_else(|_| "/".to_string()),
            rabbit_exchange_jobs: env::var("RABBIT_EXCHANGE_JOBS")
                .unwrap_or_else(|_| "banji-core.dev.jobs".to_string()),
            rabbit_dlx_exchange: env::var("RABBIT_DLX_EXCHANGE")
                .unwrap_or_else(|_| "banji-core.dev.jobs.dlx".to_string()),
            rabbit_retry_1_ttl_ms: parse_u64("RABBIT_RETRY_1_TTL_MS", 30_000)?,
            rabbit_retry_2_ttl_ms: parse_u64("RABBIT_RETRY_2_TTL_MS", 300_000)?,
            rabbit_retry_3_ttl_ms: parse_u64("RABBIT_RETRY_3_TTL_MS", 1_800_000)?,
            rabbit_prefetch_fast,
            rabbit_prefetch_heavy,
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
            edge_enforcement_enabled,
            edge_provider,
            edge_origin_auth_header_name,
            edge_origin_auth_secret,
            edge_origin_auth_secret_next,
            edge_rate_limit_enabled,
            edge_rate_limit_window,
            edge_rate_limit_read_max,
            edge_rate_limit_write_max,
            edge_rate_limit_max_keys,
            edge_rate_limit_key_ttl,
            edge_request_max_bytes,
            edge_write_request_max_bytes,
            edge_cors_allowed_origins,
            edge_trust_cf_connecting_ip,
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

fn parse_usize(name: &str, default: usize) -> Result<usize> {
    match env::var(name) {
        Ok(v) => v
            .parse::<usize>()
            .with_context(|| format!("{name} must be an integer")),
        Err(_) => Ok(default),
    }
}

fn parse_csv_env(name: &str) -> Vec<String> {
    env::var(name)
        .ok()
        .map(|raw| {
            raw.split(',')
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}
