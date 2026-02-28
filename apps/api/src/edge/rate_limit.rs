use crate::{
    cache::RedisRuntime,
    edge::{identity::RequestIdentity, OriginGuardOutcome},
    observability::{metrics, ResponseClassification},
    AppState,
};
use anyhow::Result;
use axum::{
    body::Body,
    extract::{connect_info::ConnectInfo, State},
    http::{Method, Request, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};
use redis::Script;
use std::{
    collections::HashMap,
    net::SocketAddr,
    sync::{Arc, Mutex},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RateLimitScope {
    User,
    Device,
    Ip,
}

impl RateLimitScope {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::User => "user",
            Self::Device => "device",
            Self::Ip => "ip",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RateLimitMode {
    GlobalRedis,
    LocalFallback,
}

impl RateLimitMode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::GlobalRedis => "global_redis",
            Self::LocalFallback => "local_fallback",
        }
    }
}

#[derive(Clone, Debug)]
struct BucketLimit {
    key: String,
    max: u32,
    scope: RateLimitScope,
}

#[derive(Clone, Copy, Debug)]
pub struct RateLimitDecision {
    pub allowed: bool,
    pub remaining: u32,
    pub retry_after_seconds: u64,
    pub limit: u32,
    pub scope: RateLimitScope,
    pub mode: RateLimitMode,
}

#[derive(Clone)]
pub struct SharedRateLimiter {
    redis: Option<RedisRateLimitStore>,
    fallback: InMemoryRateLimitStore,
    env: String,
    prefix: String,
    window: Duration,
    key_ttl: Duration,
    public_read_max: u32,
    user_read_max: u32,
    user_write_max: u32,
    device_read_max: u32,
    device_write_max: u32,
    failover_enabled: bool,
}

impl SharedRateLimiter {
    pub fn new(config: &crate::config::AppConfig, redis: Option<Arc<RedisRuntime>>) -> Self {
        Self {
            redis: redis.map(RedisRateLimitStore::new),
            fallback: InMemoryRateLimitStore::new(),
            env: config.env.clone(),
            prefix: config.edge_rate_limit_redis_prefix.clone(),
            window: config.edge_rate_limit_window,
            key_ttl: config.edge_rate_limit_key_ttl,
            public_read_max: config.edge_rate_limit_public_read_max,
            user_read_max: config.edge_rate_limit_user_read_max,
            user_write_max: config.edge_rate_limit_user_write_max,
            device_read_max: config.edge_rate_limit_device_read_max,
            device_write_max: config.edge_rate_limit_device_write_max,
            failover_enabled: config.edge_rate_limit_failover_enabled,
        }
    }

    pub async fn check_request(
        &self,
        client_ip: String,
        identity: Option<&RequestIdentity>,
        fallback_max_keys: usize,
    ) -> RateLimitDecision {
        let window_start = current_window_start(self.window);
        let retry_after_seconds = current_window_retry_after(self.window);
        let specs = self.bucket_limits(client_ip, identity, window_start);
        if let Some(redis) = &self.redis {
            match redis.check(&specs, self.key_ttl, retry_after_seconds).await {
                Ok(decision) => return decision,
                Err(err) => {
                    tracing::warn!(error = %err, "shared rate limiter unavailable");
                    metrics::record_rate_limit_fallback_activation("redis_unavailable");
                }
            }
        } else {
            metrics::record_rate_limit_fallback_activation("redis_not_configured");
        }

        if self.failover_enabled {
            return self.fallback.check(
                &specs,
                self.window,
                fallback_max_keys,
                self.key_ttl,
                retry_after_seconds,
            );
        }

        RateLimitDecision {
            allowed: true,
            remaining: 0,
            retry_after_seconds,
            limit: 0,
            scope: RateLimitScope::Ip,
            mode: RateLimitMode::LocalFallback,
        }
    }

    fn bucket_limits(
        &self,
        client_ip: String,
        identity: Option<&RequestIdentity>,
        window_start: u64,
    ) -> Vec<BucketLimit> {
        if let Some(identity) = identity {
            let class = identity.traffic_class.as_str();
            let user_max = match identity.traffic_class {
                crate::edge::identity::TrafficClass::Read => self.user_read_max,
                crate::edge::identity::TrafficClass::Write => self.user_write_max,
            };
            let device_max = match identity.traffic_class {
                crate::edge::identity::TrafficClass::Read => self.device_read_max,
                crate::edge::identity::TrafficClass::Write => self.device_write_max,
            };
            return vec![
                BucketLimit {
                    key: format!(
                        "{}:{}:user:{}:{}:{}",
                        self.prefix, self.env, identity.user_id, class, window_start
                    ),
                    max: user_max,
                    scope: RateLimitScope::User,
                },
                BucketLimit {
                    key: format!(
                        "{}:{}:device:{}:{}:{}:{}",
                        self.prefix,
                        self.env,
                        identity.user_id,
                        identity.device_id,
                        class,
                        window_start
                    ),
                    max: device_max,
                    scope: RateLimitScope::Device,
                },
            ];
        }

        vec![BucketLimit {
            key: format!(
                "{}:{}:ip:{}:public-read:{}",
                self.prefix, self.env, client_ip, window_start
            ),
            max: self.public_read_max,
            scope: RateLimitScope::Ip,
        }]
    }
}

#[derive(Clone)]
struct RedisRateLimitStore {
    runtime: Arc<RedisRuntime>,
    script: Script,
}

impl RedisRateLimitStore {
    fn new(runtime: Arc<RedisRuntime>) -> Self {
        Self {
            runtime,
            script: Script::new(
                r#"
                local retry_after = tonumber(ARGV[#ARGV - 1])
                local ttl = tonumber(ARGV[#ARGV])
                local min_remaining = nil
                local min_limit = nil

                for i = 1, #KEYS do
                  local current = tonumber(redis.call('GET', KEYS[i]) or '0')
                  local limit = tonumber(ARGV[i])
                  if current >= limit then
                    return {0, 0, retry_after, i, limit}
                  end
                end

                for i = 1, #KEYS do
                  local limit = tonumber(ARGV[i])
                  local value = tonumber(redis.call('INCR', KEYS[i]))
                  if value == 1 then
                    redis.call('EXPIRE', KEYS[i], ttl)
                  end
                  local remaining = limit - value
                  if min_remaining == nil or remaining < min_remaining then
                    min_remaining = remaining
                    min_limit = limit
                  end
                end

                return {1, min_remaining, retry_after, 0, min_limit}
                "#,
            ),
        }
    }

    async fn check(
        &self,
        specs: &[BucketLimit],
        ttl: Duration,
        retry_after_seconds: u64,
    ) -> Result<RateLimitDecision> {
        let keys: Vec<String> = specs.iter().map(|spec| spec.key.clone()).collect();
        let limits: Vec<u32> = specs.iter().map(|spec| spec.max).collect();
        let ttl_seconds = ttl.as_secs().max(1) as i64;
        let retry_after_seconds = retry_after_seconds.max(1) as i64;
        let script = self.script.clone();

        self.runtime
            .with_connection(move |mut conn| async move {
                let mut invocation = script.prepare_invoke();
                for key in &keys {
                    invocation.key(key);
                }
                for limit in &limits {
                    invocation.arg(*limit as i64);
                }
                invocation.arg(retry_after_seconds);
                invocation.arg(ttl_seconds);

                let raw: Vec<i64> = invocation.invoke_async(&mut conn).await?;
                if raw.len() != 5 {
                    anyhow::bail!("unexpected redis rate limit response shape");
                }
                let allowed = raw[0] == 1;
                let remaining = raw[1].max(0) as u32;
                let retry_after_seconds = raw[2].max(1) as u64;
                let scope_index = raw[3];
                let limit = raw[4].max(0) as u32;
                let scope = if allowed {
                    specs
                        .iter()
                        .min_by_key(|spec| spec.max)
                        .map(|spec| spec.scope)
                        .unwrap_or(RateLimitScope::Ip)
                } else {
                    specs
                        .get(scope_index.saturating_sub(1) as usize)
                        .map(|spec| spec.scope)
                        .unwrap_or(RateLimitScope::Ip)
                };

                Ok(RateLimitDecision {
                    allowed,
                    remaining,
                    retry_after_seconds,
                    limit,
                    scope,
                    mode: RateLimitMode::GlobalRedis,
                })
            })
            .await
    }
}

#[derive(Clone, Debug)]
pub struct InMemoryRateLimitStore {
    inner: Arc<Mutex<LimiterState>>,
}

#[derive(Debug)]
struct LimiterState {
    entries: HashMap<String, RateEntry>,
    last_cleanup: Instant,
}

#[derive(Clone, Copy, Debug)]
struct RateEntry {
    count: u32,
    window_started_at: Instant,
    last_seen_at: Instant,
}

impl InMemoryRateLimitStore {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(LimiterState {
                entries: HashMap::new(),
                last_cleanup: Instant::now(),
            })),
        }
    }

    fn check(
        &self,
        specs: &[BucketLimit],
        window: Duration,
        max_keys: usize,
        key_ttl: Duration,
        retry_after_seconds: u64,
    ) -> RateLimitDecision {
        let mut guard = match self.inner.lock() {
            Ok(guard) => guard,
            Err(_) => {
                return RateLimitDecision {
                    allowed: true,
                    remaining: 0,
                    retry_after_seconds,
                    limit: 0,
                    scope: RateLimitScope::Ip,
                    mode: RateLimitMode::LocalFallback,
                };
            }
        };

        let now = Instant::now();
        if now.duration_since(guard.last_cleanup) >= Duration::from_secs(5)
            || guard.entries.len() >= max_keys
        {
            guard
                .entries
                .retain(|_, entry| now.duration_since(entry.last_seen_at) <= key_ttl);
            guard.last_cleanup = now;
        }

        for spec in specs {
            if !guard.entries.contains_key(&spec.key) && guard.entries.len() >= max_keys {
                evict_oldest_idle(&mut guard.entries);
            }

            let entry = guard.entries.entry(spec.key.clone()).or_insert(RateEntry {
                count: 0,
                window_started_at: now,
                last_seen_at: now,
            });

            if now.duration_since(entry.window_started_at) >= window {
                entry.count = 0;
                entry.window_started_at = now;
            }
            entry.last_seen_at = now;

            if entry.count >= spec.max {
                return RateLimitDecision {
                    allowed: false,
                    remaining: 0,
                    retry_after_seconds,
                    limit: spec.max,
                    scope: spec.scope,
                    mode: RateLimitMode::LocalFallback,
                };
            }
        }

        let mut min_remaining = u32::MAX;
        let mut min_limit = u32::MAX;
        let mut min_scope = RateLimitScope::Ip;
        for spec in specs {
            let entry = guard.entries.get_mut(&spec.key).expect("entry must exist");
            entry.count += 1;
            let remaining = spec.max.saturating_sub(entry.count);
            if remaining <= min_remaining {
                min_remaining = remaining;
                min_limit = spec.max;
                min_scope = spec.scope;
            }
        }

        RateLimitDecision {
            allowed: true,
            remaining: if min_remaining == u32::MAX {
                0
            } else {
                min_remaining
            },
            retry_after_seconds,
            limit: if min_limit == u32::MAX { 0 } else { min_limit },
            scope: min_scope,
            mode: RateLimitMode::LocalFallback,
        }
    }
}

pub async fn rate_limit_middleware(
    State(state): State<AppState>,
    request: Request<Body>,
    next: Next,
) -> Response {
    if !state.config.edge_rate_limit_enabled || request.method() == Method::OPTIONS {
        return next.run(request).await;
    }

    let client_ip = client_ip_for_rate_limit(&request, &state);
    let identity = request.extensions().get::<RequestIdentity>();
    let decision = state
        .rate_limiter
        .check_request(
            client_ip,
            identity,
            state.config.edge_rate_limit_fallback_max_keys,
        )
        .await;

    if !decision.allowed {
        metrics::record_rate_limit_reject(decision.scope.as_str(), decision.mode.as_str());
        let mut response = (
            StatusCode::TOO_MANY_REQUESTS,
            axum::Json(serde_json::json!({
                "error_code":"RATE_LIMIT_EXCEEDED",
                "error":"rate limit exceeded for request identity"
            })),
        )
            .into_response();
        apply_limit_headers(&mut response, decision);
        response
            .extensions_mut()
            .insert(ResponseClassification::RateLimited);
        return response;
    }

    let mut response = next.run(request).await;
    apply_limit_headers(&mut response, decision);
    response
}

fn apply_limit_headers(response: &mut Response, decision: RateLimitDecision) {
    let headers = response.headers_mut();
    headers.insert(
        "x-ratelimit-limit",
        axum::http::HeaderValue::from_str(&decision.limit.to_string())
            .unwrap_or_else(|_| axum::http::HeaderValue::from_static("0")),
    );
    headers.insert(
        "x-ratelimit-remaining",
        axum::http::HeaderValue::from_str(&decision.remaining.to_string())
            .unwrap_or_else(|_| axum::http::HeaderValue::from_static("0")),
    );
    headers.insert(
        "x-ratelimit-scope",
        axum::http::HeaderValue::from_static(decision.scope.as_str()),
    );
    headers.insert(
        "retry-after",
        axum::http::HeaderValue::from_str(&decision.retry_after_seconds.to_string())
            .unwrap_or_else(|_| axum::http::HeaderValue::from_static("1")),
    );
}

fn current_window_start(window: Duration) -> u64 {
    let window_secs = window.as_secs().max(1);
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_else(|_| Duration::from_secs(0))
        .as_secs();
    now - (now % window_secs)
}

fn current_window_retry_after(window: Duration) -> u64 {
    let window_secs = window.as_secs().max(1);
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_else(|_| Duration::from_secs(0))
        .as_secs();
    remaining_window_seconds(window_secs, now)
}

fn remaining_window_seconds(window_secs: u64, now_secs: u64) -> u64 {
    let window_secs = window_secs.max(1);
    let elapsed = now_secs % window_secs;
    window_secs.saturating_sub(elapsed).max(1)
}

fn client_ip_for_rate_limit(request: &Request<Body>, state: &AppState) -> String {
    let guard_passed = request
        .extensions()
        .get::<OriginGuardOutcome>()
        .map(|outcome| outcome.passed)
        .unwrap_or(false);

    if state.config.edge_trust_cf_connecting_ip && guard_passed {
        if let Some(value) = request
            .headers()
            .get("cf-connecting-ip")
            .and_then(|value| value.to_str().ok())
        {
            let candidate = value.trim();
            if !candidate.is_empty() {
                return candidate.to_string();
            }
        }
    }

    if let Some(ConnectInfo(addr)) = request.extensions().get::<ConnectInfo<SocketAddr>>() {
        return addr.ip().to_string();
    }

    "unknown".to_string()
}

fn evict_oldest_idle(entries: &mut HashMap<String, RateEntry>) {
    if let Some((oldest_key, _)) = entries
        .iter()
        .min_by_key(|(_, entry)| entry.last_seen_at)
        .map(|(key, entry)| (key.clone(), *entry))
    {
        entries.remove(&oldest_key);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::edge::identity::{RequestIdentity, TrafficClass};

    #[test]
    fn fallback_store_blocks_same_user_across_devices() {
        let limiter = SharedRateLimiter {
            redis: None,
            fallback: InMemoryRateLimitStore::new(),
            env: "test".to_string(),
            prefix: "rate-limit".to_string(),
            window: Duration::from_secs(60),
            key_ttl: Duration::from_secs(300),
            public_read_max: 10,
            user_read_max: 1,
            user_write_max: 1,
            device_read_max: 10,
            device_write_max: 10,
            failover_enabled: true,
        };
        let first = RequestIdentity {
            user_id: "user-1".to_string(),
            device_id: "device-1".to_string(),
            traffic_class: TrafficClass::Read,
        };
        let second = RequestIdentity {
            user_id: "user-1".to_string(),
            device_id: "device-2".to_string(),
            traffic_class: TrafficClass::Read,
        };

        let rt = tokio::runtime::Runtime::new().unwrap();
        let allowed =
            rt.block_on(limiter.check_request("127.0.0.1".to_string(), Some(&first), 100));
        let blocked =
            rt.block_on(limiter.check_request("127.0.0.1".to_string(), Some(&second), 100));

        assert!(allowed.allowed);
        assert!(!blocked.allowed);
        assert_eq!(blocked.scope, RateLimitScope::User);
    }

    #[test]
    fn fallback_store_scopes_device_id_by_user() {
        let limiter = InMemoryRateLimitStore::new();
        let window = Duration::from_secs(60);
        let ttl = Duration::from_secs(300);

        let first = vec![BucketLimit {
            key: "k:user-a:device-1".to_string(),
            max: 1,
            scope: RateLimitScope::Device,
        }];
        let second = vec![BucketLimit {
            key: "k:user-b:device-1".to_string(),
            max: 1,
            scope: RateLimitScope::Device,
        }];

        assert!(limiter.check(&first, window, 100, ttl, 60).allowed);
        assert!(limiter.check(&second, window, 100, ttl, 60).allowed);
    }

    #[test]
    fn fallback_store_evicts_oldest_key_when_cap_is_hit() {
        let limiter = InMemoryRateLimitStore::new();
        let window = Duration::from_secs(60);
        let ttl = Duration::from_secs(300);

        assert!(
            limiter
                .check(
                    &[BucketLimit {
                        key: "k1".to_string(),
                        max: 10,
                        scope: RateLimitScope::Ip,
                    }],
                    window,
                    2,
                    ttl,
                    60,
                )
                .allowed
        );
        std::thread::sleep(Duration::from_millis(2));
        assert!(
            limiter
                .check(
                    &[BucketLimit {
                        key: "k2".to_string(),
                        max: 10,
                        scope: RateLimitScope::Ip,
                    }],
                    window,
                    2,
                    ttl,
                    60,
                )
                .allowed
        );
        std::thread::sleep(Duration::from_millis(2));
        assert!(
            limiter
                .check(
                    &[BucketLimit {
                        key: "k3".to_string(),
                        max: 10,
                        scope: RateLimitScope::Ip,
                    }],
                    window,
                    2,
                    ttl,
                    60,
                )
                .allowed
        );

        let inner = limiter.inner.lock().unwrap();
        assert_eq!(inner.entries.len(), 2);
        assert!(!inner.entries.contains_key("k1"));
    }

    #[test]
    fn remaining_window_seconds_tracks_window_boundary() {
        assert_eq!(remaining_window_seconds(60, 120), 60);
        assert_eq!(remaining_window_seconds(60, 121), 59);
        assert_eq!(remaining_window_seconds(60, 179), 1);
    }
}
