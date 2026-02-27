use super::model::EventRecord;
use super::schema::validate_event_record;
use anyhow::{anyhow, Result};
use serde_json::Value;
use sqlx::{Postgres, Row, Transaction};

pub async fn publish_in_tx(tx: &mut Transaction<'_, Postgres>, event: &EventRecord) -> Result<i64> {
    validate_event_record(event).map_err(anyhow::Error::new)?;
    validate_event_payload_contract(&event.payload, &event.metadata)?;

    let inserted = sqlx::query(
        r#"
        INSERT INTO app.event_log (
          publish_key,
          stream_name,
          env_name,
          topic_name,
          event_type,
          event_version,
          aggregate_type,
          aggregate_id,
          producer_service,
          idempotency_key,
          correlation_id,
          causation_id,
          payload,
          metadata
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT (publish_key) DO NOTHING
        RETURNING id
        "#,
    )
    .bind(&event.publish_key)
    .bind(&event.stream_name)
    .bind(&event.env_name)
    .bind(&event.topic_name)
    .bind(&event.event_type)
    .bind(event.event_version)
    .bind(&event.aggregate_type)
    .bind(&event.aggregate_id)
    .bind(&event.producer_service)
    .bind(&event.idempotency_key)
    .bind(&event.correlation_id)
    .bind(&event.causation_id)
    .bind(&event.payload)
    .bind(&event.metadata)
    .fetch_optional(&mut **tx)
    .await?;

    if let Some(row) = inserted {
        return Ok(row.get("id"));
    }

    let row = sqlx::query(
        r#"
        SELECT id
        FROM app.event_log
        WHERE publish_key = $1
        LIMIT 1
        "#,
    )
    .bind(&event.publish_key)
    .fetch_optional(&mut **tx)
    .await?;

    if let Some(found) = row {
        return Ok(found.get("id"));
    }

    Err(anyhow!(
        "event insert failed without existing dedupe record"
    ))
}

const SENSITIVE_FIELD_MARKERS: &[&str] = &[
    "password",
    "secret",
    "token",
    "api_key",
    "access_key",
    "authorization",
    "cookie",
    "set-cookie",
];

pub fn validate_event_payload_contract(payload: &Value, metadata: &Value) -> Result<()> {
    if let Some(path) = find_sensitive_path(payload, "payload") {
        return Err(anyhow!(
            "event payload contains restricted field at path {path}"
        ));
    }
    if let Some(path) = find_sensitive_path(metadata, "metadata") {
        return Err(anyhow!(
            "event metadata contains restricted field at path {path}"
        ));
    }
    Ok(())
}

fn find_sensitive_path(value: &Value, path: &str) -> Option<String> {
    match value {
        Value::Object(map) => {
            for (k, v) in map {
                let key_path = format!("{path}.{k}");
                if is_sensitive_key(k) {
                    return Some(key_path);
                }
                if let Some(found) = find_sensitive_path(v, &key_path) {
                    return Some(found);
                }
            }
            None
        }
        Value::Array(items) => items
            .iter()
            .enumerate()
            .find_map(|(idx, item)| find_sensitive_path(item, &format!("{path}[{idx}]"))),
        Value::String(s) => {
            if appears_credential_url(s) {
                Some(path.to_string())
            } else {
                None
            }
        }
        _ => None,
    }
}

fn is_sensitive_key(key: &str) -> bool {
    let normalized = key.to_ascii_lowercase().replace('-', "_");
    SENSITIVE_FIELD_MARKERS
        .iter()
        .any(|marker| normalized.contains(&marker.replace('-', "_")))
}

fn appears_credential_url(s: &str) -> bool {
    if !s.contains("://") || !s.contains('@') {
        return false;
    }
    let redacted = crate::logging::redaction::redact_message(s);
    redacted != s
}
