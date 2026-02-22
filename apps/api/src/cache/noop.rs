use super::client::{CacheClient, LockHandle};
use anyhow::Result;
use async_trait::async_trait;
use std::time::Duration;

#[derive(Default)]
pub struct NoopCacheClient;

#[async_trait]
impl CacheClient for NoopCacheClient {
    async fn get_string(&self, _key: &str) -> Result<Option<String>> {
        Ok(None)
    }

    async fn set_string(&self, _key: &str, _value: &str, _ttl: Duration) -> Result<()> {
        Ok(())
    }

    async fn acquire_lock(&self, _key: &str, _ttl: Duration) -> Result<Option<LockHandle>> {
        Ok(None)
    }

    async fn release_lock(&self, _lock: &LockHandle) -> Result<bool> {
        Ok(false)
    }
}
