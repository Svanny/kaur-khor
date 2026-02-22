use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{PgPool, Row};

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
    .fetch_optional(&mut *tx)
    .await?
    {
        let existing_hash: String = row.get("request_hash");
        if existing_hash != request_hash {
            tx.commit().await?;
            return Ok(IdempotencyResult::Conflict);
        }

        let status: String = row.get("status");
        if status == "completed" {
            let status_code: i32 = row.get("response_code");
            let response_body: Value = row.get("response_body");
            tx.commit().await?;
            return Ok(IdempotencyResult::Replay(PersistedResponse {
                status_code,
                body: response_body,
            }));
        }

        if status == "in_progress" {
            tx.commit().await?;
            return Ok(IdempotencyResult::InProgress);
        }

        tx.commit().await?;
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
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;
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
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    let bytes = serde_json::to_vec(body).unwrap_or_default();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

pub fn ensure_header(value: Option<&str>, name: &str) -> Result<String> {
    let v = value.ok_or_else(|| anyhow!("missing required header: {name}"))?;
    if v.trim().is_empty() {
        return Err(anyhow!("header {name} must not be empty"));
    }
    Ok(v.to_string())
}
