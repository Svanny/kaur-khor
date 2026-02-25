use crate::{edge::OriginGuardOutcome, AppState};
use axum::{
    body::Body,
    extract::{connect_info::ConnectInfo, MatchedPath, State},
    http::{Method, Request, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};
use std::{
    collections::HashMap,
    net::SocketAddr,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

#[derive(Clone, Debug)]
pub struct InMemoryRateLimiter {
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

#[derive(Clone, Copy, Debug)]
pub struct LimitDecision {
    pub allowed: bool,
    pub remaining: u32,
}

impl InMemoryRateLimiter {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(LimiterState {
                entries: HashMap::new(),
                last_cleanup: Instant::now(),
            })),
        }
    }

    pub fn check(
        &self,
        key: &str,
        max_per_window: u32,
        window: Duration,
        max_keys: usize,
        key_ttl: Duration,
    ) -> LimitDecision {
        let mut guard = match self.inner.lock() {
            Ok(guard) => guard,
            Err(_) => {
                return LimitDecision {
                    allowed: true,
                    remaining: max_per_window.saturating_sub(1),
                }
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

        if !guard.entries.contains_key(key) && guard.entries.len() >= max_keys {
            evict_oldest_idle(&mut guard.entries);
        }

        let entry = guard.entries.entry(key.to_string()).or_insert(RateEntry {
            count: 0,
            window_started_at: now,
            last_seen_at: now,
        });

        if now.duration_since(entry.window_started_at) >= window {
            entry.count = 0;
            entry.window_started_at = now;
        }

        entry.last_seen_at = now;

        if entry.count >= max_per_window {
            return LimitDecision {
                allowed: false,
                remaining: 0,
            };
        }

        entry.count += 1;
        LimitDecision {
            allowed: true,
            remaining: max_per_window.saturating_sub(entry.count),
        }
    }
}

pub async fn rate_limit_middleware(
    State(state): State<AppState>,
    request: Request<Body>,
    next: Next,
) -> Response {
    if !state.config.edge_rate_limit_enabled {
        return next.run(request).await;
    }

    if request.method() == Method::OPTIONS {
        return next.run(request).await;
    }

    let route = request
        .extensions()
        .get::<MatchedPath>()
        .map(MatchedPath::as_str)
        .unwrap_or("unknown");

    let client_ip = client_ip_for_rate_limit(&request, &state);
    let key = format!("{}:{}:{}", client_ip, request.method().as_str(), route);
    let max_per_window = if is_write_method(request.method()) {
        state.config.edge_rate_limit_write_max
    } else {
        state.config.edge_rate_limit_read_max
    };

    let decision = state.rate_limiter.check(
        &key,
        max_per_window,
        state.config.edge_rate_limit_window,
        state.config.edge_rate_limit_max_keys,
        state.config.edge_rate_limit_key_ttl,
    );

    if !decision.allowed {
        return (
            StatusCode::TOO_MANY_REQUESTS,
            "rate limit exceeded for method+route client bucket",
        )
            .into_response();
    }

    next.run(request).await
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

fn is_write_method(method: &Method) -> bool {
    matches!(
        *method,
        Method::POST | Method::PUT | Method::PATCH | Method::DELETE
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn limiter_enforces_window_ceiling() {
        let limiter = InMemoryRateLimiter::new();
        let window = Duration::from_secs(60);
        let ttl = Duration::from_secs(300);

        assert!(limiter.check("a", 2, window, 100, ttl).allowed);
        assert!(limiter.check("a", 2, window, 100, ttl).allowed);
        assert!(!limiter.check("a", 2, window, 100, ttl).allowed);
    }

    #[test]
    fn limiter_evicts_oldest_key_when_key_cap_is_hit() {
        let limiter = InMemoryRateLimiter::new();
        let window = Duration::from_secs(60);
        let ttl = Duration::from_secs(300);

        assert!(limiter.check("k1", 10, window, 2, ttl).allowed);
        std::thread::sleep(Duration::from_millis(2));
        assert!(limiter.check("k2", 10, window, 2, ttl).allowed);
        std::thread::sleep(Duration::from_millis(2));
        assert!(limiter.check("k3", 10, window, 2, ttl).allowed);

        let inner = limiter.inner.lock().expect("lock should not poison");
        assert_eq!(inner.entries.len(), 2);
        assert!(!inner.entries.contains_key("k1"));
    }
}
