use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{PgPool, Postgres, Row, Transaction};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PersistedResponse {
    pub status_code: i32,
    pub body: Value,
}

#[derive(Debug)]
pub enum IdempotencyResult {
    Replay(PersistedResponse),
    Conflict,
    InProgress,
    Claimed,
}

pub async fn check_or_claim(
    db: &PgPool,
    caller_id: &str,
    idempotency_key: &str,
    request_hash: &str,
) -> Result<IdempotencyResult> {
    let mut tx = db.begin().await?;
    let result = check_or_claim_tx(&mut tx, caller_id, idempotency_key, request_hash).await?;
    tx.commit().await?;
    Ok(result)
}

pub async fn check_or_claim_tx(
    tx: &mut Transaction<'_, Postgres>,
    caller_id: &str,
    idempotency_key: &str,
    request_hash: &str,
) -> Result<IdempotencyResult> {
    if let Some(row) = sqlx::query(
        r#"
        SELECT request_hash, status, response_code, response_body
        FROM app.idempotency_request
        WHERE caller_id = $1 AND idempotency_key = $2
        FOR UPDATE
        "#,
    )
    .bind(caller_id)
    .bind(idempotency_key)
    .fetch_optional(&mut **tx)
    .await?
    {
        let existing_hash: String = row.get("request_hash");
        if existing_hash != request_hash {
            return Ok(IdempotencyResult::Conflict);
        }

        let status: String = row.get("status");
        if status == "completed" {
            let status_code: i32 = row.get("response_code");
            let response_body: Value = row.get("response_body");
            return Ok(IdempotencyResult::Replay(PersistedResponse {
                status_code,
                body: response_body,
            }));
        }

        if status == "in_progress" {
            return Ok(IdempotencyResult::InProgress);
        }

        return Ok(IdempotencyResult::Conflict);
    }

    sqlx::query(
        r#"
        INSERT INTO app.idempotency_request (
            caller_id,
            idempotency_key,
            request_hash,
            status,
            response_code,
            response_body
        ) VALUES ($1, $2, $3, 'in_progress', 0, '{}'::jsonb)
        "#,
    )
    .bind(caller_id)
    .bind(idempotency_key)
    .bind(request_hash)
    .execute(&mut **tx)
    .await?;

    Ok(IdempotencyResult::Claimed)
}

pub async fn complete(
    db: &PgPool,
    caller_id: &str,
    idempotency_key: &str,
    response: &PersistedResponse,
) -> Result<()> {
    sqlx::query(
        r#"
        UPDATE app.idempotency_request
        SET
            status = 'completed',
            response_code = $3,
            response_body = $4,
            updated_at = NOW()
        WHERE caller_id = $1 AND idempotency_key = $2
        "#,
    )
    .bind(caller_id)
    .bind(idempotency_key)
    .bind(response.status_code)
    .bind(&response.body)
    .execute(db)
    .await?;
    Ok(())
}

pub async fn complete_tx(
    tx: &mut Transaction<'_, Postgres>,
    caller_id: &str,
    idempotency_key: &str,
    response: &PersistedResponse,
) -> Result<()> {
    sqlx::query(
        r#"
        UPDATE app.idempotency_request
        SET
            status = 'completed',
            response_code = $3,
            response_body = $4,
            updated_at = NOW()
        WHERE caller_id = $1 AND idempotency_key = $2
        "#,
    )
    .bind(caller_id)
    .bind(idempotency_key)
    .bind(response.status_code)
    .bind(&response.body)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

pub async fn fail(
    db: &PgPool,
    caller_id: &str,
    idempotency_key: &str,
    message: &str,
) -> Result<()> {
    sqlx::query(
        r#"
        UPDATE app.idempotency_request
        SET
            status = 'failed',
            error_message = $3,
            updated_at = NOW()
        WHERE caller_id = $1 AND idempotency_key = $2
        "#,
    )
    .bind(caller_id)
    .bind(idempotency_key)
    .bind(message)
    .execute(db)
    .await?;
    Ok(())
}

pub fn hash_request_body(body: &Value) -> String {
    hash_canonical_value(&canonicalize_json(body))
}

pub fn hash_http_request(method: &str, route: &str, body: &Value) -> String {
    let envelope = serde_json::json!({
        "method": method.to_ascii_uppercase(),
        "route": route,
        "body": canonicalize_json(body),
    });
    hash_canonical_value(&envelope)
}

fn hash_canonical_value(value: &Value) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    let bytes = serde_json::to_vec(value).unwrap_or_default();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

fn canonicalize_json(value: &Value) -> Value {
    match value {
        Value::Array(arr) => Value::Array(arr.iter().map(canonicalize_json).collect()),
        Value::Object(map) => {
            let mut sorted = serde_json::Map::with_capacity(map.len());
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort_unstable();
            for key in keys {
                if let Some(v) = map.get(key) {
                    sorted.insert(key.clone(), canonicalize_json(v));
                }
            }
            Value::Object(sorted)
        }
        _ => value.clone(),
    }
}

pub fn ensure_header(value: Option<&str>, name: &str) -> Result<String> {
    let v = value.ok_or_else(|| anyhow!("missing required header: {name}"))?;
    let trimmed = v.trim();
    if trimmed.is_empty() {
        return Err(anyhow!("header {name} must not be empty"));
    }
    if name.eq_ignore_ascii_case("idempotency-key") {
        validate_idempotency_key(trimmed)?;
    }
    Ok(trimmed.to_string())
}

fn validate_idempotency_key(value: &str) -> Result<()> {
    if value.len() > 128 {
        return Err(anyhow!(
            "header idempotency-key must be at most 128 characters"
        ));
    }
    if !value
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
    {
        return Err(anyhow!(
            "header idempotency-key must contain only alphanumeric, '-', '_' or '.'"
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn canonical_hash_ignores_object_field_order() {
        let a = json!({"a":1,"b":{"x":1,"y":2}});
        let b = json!({"b":{"y":2,"x":1},"a":1});
        assert_eq!(hash_request_body(&a), hash_request_body(&b));
    }

    #[test]
    fn http_request_hash_includes_method_and_route() {
        let body = json!({"item_id":"abc"});
        let post_hash = hash_http_request("POST", "/v1/items", &body);
        let get_hash = hash_http_request("GET", "/v1/items", &body);
        assert_ne!(post_hash, get_hash);
    }

    #[test]
    fn idempotency_key_validation_enforces_contract() {
        assert!(ensure_header(Some("abc-123._"), "idempotency-key").is_ok());
        assert!(ensure_header(Some("has space"), "idempotency-key").is_err());
        assert!(ensure_header(Some(&"a".repeat(129)), "idempotency-key").is_err());
    }
}
