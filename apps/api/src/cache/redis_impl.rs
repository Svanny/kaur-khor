use super::client::{CacheClient, LockHandle};
use crate::config::AppConfig;
use crate::logging::redaction::redact_message;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use rand::RngCore;
use redis::{AsyncCommands, Script};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

#[derive(Clone)]
struct CircuitState {
    errors_in_window: u32,
    window_started_at: Instant,
    open_until: Option<Instant>,
    last_logged: Option<Instant>,
}

impl CircuitState {
    fn new() -> Self {
        Self {
            errors_in_window: 0,
            window_started_at: Instant::now(),
            open_until: None,
            last_logged: None,
        }
    }
}

pub struct RedisCacheClient {
    client: redis::Client,
    cfg: AppConfig,
    state: Arc<Mutex<CircuitState>>,
}

impl RedisCacheClient {
    pub async fn connect(cfg: &AppConfig) -> Result<Self> {
        let url = cfg
            .redis_url
            .clone()
            .ok_or_else(|| anyhow!("REDIS_URL is required when cache enabled"))?;
        let client = redis::Client::open(url)?;

        // Fail fast check during startup.
        let mut conn = tokio::time::timeout(
            cfg.redis_connect_timeout,
            client.get_multiplexed_async_connection(),
        )
        .await
        .map_err(|_| anyhow!("redis connect timeout"))??;
        let _: String = tokio::time::timeout(
            cfg.redis_command_timeout,
            redis::cmd("PING").query_async(&mut conn),
        )
        .await
        .map_err(|_| anyhow!("redis ping timeout"))??;

        Ok(Self {
            client,
            cfg: cfg.clone(),
            state: Arc::new(Mutex::new(CircuitState::new())),
        })
    }

    async fn with_connection<T, F, Fut>(&self, action: F) -> Result<T>
    where
        F: FnOnce(redis::aio::MultiplexedConnection) -> Fut + Send,
        Fut: std::future::Future<Output = Result<T>> + Send,
        T: Send,
    {
        self.ensure_circuit_closed().await?;

        let conn = tokio::time::timeout(
            self.cfg.redis_connect_timeout,
            self.client.get_multiplexed_async_connection(),
        )
        .await
        .map_err(|_| anyhow!("redis connect timeout"));

        match conn {
            Ok(Ok(c)) => {
                let res = tokio::time::timeout(self.cfg.redis_command_timeout, action(c)).await;
                match res {
                    Ok(Ok(v)) => {
                        self.on_success().await;
                        Ok(v)
                    }
                    Ok(Err(e)) => {
                        self.on_error(&e.to_string()).await;
                        Err(e)
                    }
                    Err(_) => {
                        self.on_error("redis command timeout").await;
                        Err(anyhow!("redis command timeout"))
                    }
                }
            }
            Ok(Err(e)) => {
                self.on_error(&e.to_string()).await;
                Err(anyhow!(e))
            }
            Err(_) => {
                self.on_error("redis connect timeout").await;
                Err(anyhow!("redis connect timeout"))
            }
        }
    }

    async fn ensure_circuit_closed(&self) -> Result<()> {
        let mut s = self.state.lock().await;
        if let Some(open_until) = s.open_until {
            if Instant::now() < open_until {
                return Err(anyhow!("redis circuit open"));
            }
            s.open_until = None;
            s.errors_in_window = 0;
            s.window_started_at = Instant::now();
        }
        Ok(())
    }

    async fn on_success(&self) {
        let mut s = self.state.lock().await;
        s.errors_in_window = 0;
        s.window_started_at = Instant::now();
    }

    async fn on_error(&self, msg: &str) {
        let now = Instant::now();
        let mut s = self.state.lock().await;

        if now.duration_since(s.window_started_at) > self.cfg.redis_circuit_window {
            s.window_started_at = now;
            s.errors_in_window = 0;
        }
        s.errors_in_window = s.errors_in_window.saturating_add(1);

        let should_log = s
            .last_logged
            .map(|i| now.duration_since(i) >= self.cfg.redis_log_rate_limit)
            .unwrap_or(true);

        if should_log {
            let safe = redact_message(msg);
            tracing::warn!(error = %safe, "redis operation failed, fail-open path active");
            s.last_logged = Some(now);
        }

        if s.errors_in_window >= self.cfg.redis_circuit_error_threshold {
            s.open_until = Some(now + self.cfg.redis_circuit_cooldown);
            s.errors_in_window = 0;
        }
    }

    fn ttl_secs(&self, ttl: Duration) -> u64 {
        let base = ttl.as_secs().max(1);
        let jitter = self.cfg.cache_ttl_jitter.as_secs();
        if jitter == 0 {
            return base;
        }
        let mut rng = rand::thread_rng();
        let extra = (rng.next_u64() % (jitter + 1)).min(jitter);
        base.saturating_add(extra)
    }
}

#[async_trait]
impl CacheClient for RedisCacheClient {
    async fn get_string(&self, key: &str) -> Result<Option<String>> {
        self.with_connection(|mut conn| async move {
            let value: Option<String> = conn.get(key).await?;
            Ok(value)
        })
        .await
    }

    async fn set_string(&self, key: &str, value: &str, ttl: Duration) -> Result<()> {
        let key = key.to_string();
        let value = value.to_string();
        let ttl = self.ttl_secs(ttl);

        self.with_connection(|mut conn| async move {
            let _: () = conn.set_ex(key, value, ttl).await?;
            Ok(())
        })
        .await
    }

    async fn acquire_lock(&self, key: &str, ttl: Duration) -> Result<Option<LockHandle>> {
        let key = key.to_string();
        let token = uuid::Uuid::new_v4().to_string();
        let seconds = ttl.as_secs().max(1) as i64;

        self.with_connection(|mut conn| async move {
            let acquired: Option<String> = redis::cmd("SET")
                .arg(&key)
                .arg(&token)
                .arg("NX")
                .arg("EX")
                .arg(seconds)
                .query_async(&mut conn)
                .await?;

            if acquired.is_some() {
                Ok(Some(LockHandle { key, token }))
            } else {
                Ok(None)
            }
        })
        .await
    }

    async fn release_lock(&self, lock: &LockHandle) -> Result<bool> {
        let key = lock.key.clone();
        let token = lock.token.clone();

        self.with_connection(|mut conn| async move {
            let script = Script::new(
                "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end",
            );
            let deleted: i32 = script.key(key).arg(token).invoke_async(&mut conn).await?;
            Ok(deleted == 1)
        })
        .await
    }
}
