use super::types::JobEnvelope;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use lapin::{
    options::{BasicPublishOptions, ConfirmSelectOptions},
    types::{AMQPValue, FieldTable, LongString, ShortString},
    BasicProperties, Channel, Connection, ConnectionProperties,
};
use std::collections::BTreeMap;

pub type MessageHeaders = BTreeMap<String, String>;

#[async_trait]
pub trait ConfirmingPublisher: Send + Sync {
    async fn publish_with_confirm(
        &self,
        exchange: &str,
        routing_key: &str,
        envelope: &JobEnvelope,
        headers: &MessageHeaders,
    ) -> Result<()>;
}

#[derive(Clone)]
pub struct RabbitConfirmingPublisher {
    channel: Channel,
}

impl RabbitConfirmingPublisher {
    pub async fn connect(rabbit_url: &str) -> Result<(Connection, Self)> {
        let connection = Connection::connect(rabbit_url, ConnectionProperties::default()).await?;
        let publisher = Self::from_connection(&connection).await?;
        Ok((connection, publisher))
    }

    pub async fn from_connection(connection: &Connection) -> Result<Self> {
        let channel = connection.create_channel().await?;
        channel
            .confirm_select(ConfirmSelectOptions::default())
            .await?;
        Ok(Self { channel })
    }
}

pub struct NoopConfirmingPublisher;

#[async_trait]
impl ConfirmingPublisher for NoopConfirmingPublisher {
    async fn publish_with_confirm(
        &self,
        _exchange: &str,
        _routing_key: &str,
        _envelope: &JobEnvelope,
        _headers: &MessageHeaders,
    ) -> Result<()> {
        Ok(())
    }
}

#[async_trait]
impl ConfirmingPublisher for RabbitConfirmingPublisher {
    async fn publish_with_confirm(
        &self,
        exchange: &str,
        routing_key: &str,
        envelope: &JobEnvelope,
        headers: &MessageHeaders,
    ) -> Result<()> {
        let payload = serde_json::to_vec(envelope)?;
        let properties = BasicProperties::default()
            .with_content_type(ShortString::from("application/json"))
            .with_delivery_mode(2)
            .with_message_id(ShortString::from(envelope.message_id.clone()))
            .with_correlation_id(ShortString::from(envelope.correlation_id.clone()))
            .with_headers(to_field_table(headers));

        let confirmation = self
            .channel
            .basic_publish(
                exchange,
                routing_key,
                BasicPublishOptions::default(),
                &payload,
                properties,
            )
            .await?
            .await?;

        if !confirmation.is_ack() {
            return Err(anyhow!(
                "rabbit publish did not receive broker ack for routing_key '{routing_key}'"
            ));
        }

        Ok(())
    }
}

fn to_field_table(headers: &MessageHeaders) -> FieldTable {
    let mut table = FieldTable::default();
    for (key, value) in headers {
        table.insert(
            ShortString::from(key.as_str()),
            AMQPValue::LongString(LongString::from(value.as_str())),
        );
    }
    table
}
