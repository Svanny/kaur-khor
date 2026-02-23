use super::types::JobEnvelope;
use anyhow::Result;
use async_trait::async_trait;

#[async_trait]
pub trait ConfirmingPublisher: Send + Sync {
    async fn publish_with_confirm(
        &self,
        exchange: &str,
        routing_key: &str,
        envelope: &JobEnvelope,
    ) -> Result<()>;
}

pub struct NoopConfirmingPublisher;

#[async_trait]
impl ConfirmingPublisher for NoopConfirmingPublisher {
    async fn publish_with_confirm(
        &self,
        _exchange: &str,
        _routing_key: &str,
        _envelope: &JobEnvelope,
    ) -> Result<()> {
        Ok(())
    }
}
