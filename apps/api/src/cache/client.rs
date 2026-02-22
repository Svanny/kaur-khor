use anyhow::Result;
use async_trait::async_trait;
use std::time::Duration;

#[derive(Clone, Debug)]
pub struct LockHandle {
    pub key: String,
    pub token: String,
}

#[async_trait]
pub trait CacheClient: Send + Sync {
    async fn get_string(&self, key: &str) -> Result<Option<String>>;
    async fn set_string(&self, key: &str, value: &str, ttl: Duration) -> Result<()>;
    async fn acquire_lock(&self, key: &str, ttl: Duration) -> Result<Option<LockHandle>>;
    async fn release_lock(&self, lock: &LockHandle) -> Result<bool>;
}
