pub mod cache;
pub mod config;
pub mod events;
pub mod idempotency;
pub mod jobs;
pub mod logging;

use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Json, Router,
};
use cache::{CacheClient, KeyBuilder, NoopCacheClient, RedisCacheClient};
use config::AppConfig;
use events::model::EventRecord;
use idempotency::{IdempotencyResult, PersistedResponse};
use logging::redaction::redact_message;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::PgPool;
use std::{
    collections::HashMap,
    sync::{Arc, Weak},
    time::Duration,
};
use tokio::sync::Mutex;

#[derive(Clone)]
pub struct AppState {
    pub config: AppConfig,
    pub db: Option<PgPool>,
    pub cache: Arc<dyn CacheClient>,
    pub key_builder: KeyBuilder,
    pub singleflight: Arc<Mutex<HashMap<String, Weak<Mutex<()>>>>>,
}

#[derive(Serialize)]
struct Health {
    status: &'static str,
}

#[derive(Debug, Deserialize)]
struct WriteDemoRequest {
    operation: String,
    payload: Value,
}

pub async fn build_state(config: AppConfig) -> anyhow::Result<AppState> {
    let cache: Arc<dyn CacheClient> = if config.cache_enabled {
        match RedisCacheClient::connect(&config).await {
            Ok(client) => Arc::new(client),
            Err(err) => {
                let safe_error = redact_message(&err.to_string());
                tracing::warn!(error = %safe_error, "redis unavailable at startup; using fail-open noop cache");
                Arc::new(NoopCacheClient)
            }
        }
    } else {
        Arc::new(NoopCacheClient)
    };

    let db = match &config.database_runtime_url {
        Some(url) => Some(PgPool::connect(url).await?),
        None => None,
    };

    let key_builder = KeyBuilder::new(
        config.system.clone(),
        config.env.clone(),
        config.service.clone(),
        config.cache_schema_version.clone(),
    );

    Ok(AppState {
        config,
        db,
        cache,
        key_builder,
        singleflight: Arc::new(Mutex::new(HashMap::new())),
    })
}

async fn health() -> Json<Health> {
    Json(Health { status: "ok" })
}

pub fn app() -> Router {
    Router::new().route("/health", get(health))
}

pub fn app_with_state(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/v1/write-demo", post(write_demo))
        .with_state(state)
}

async fn write_demo(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<WriteDemoRequest>,
) -> (StatusCode, Json<Value>) {
    let Some(db) = state.db.as_ref() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"error":"database is not configured"})),
        );
    };

    let caller_id = match idempotency::ensure_header(
        headers.get("x-caller-id").and_then(|v| v.to_str().ok()),
        "x-caller-id",
    ) {
        Ok(v) => v,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({"error": e.to_string()})),
            );
        }
    };

    let idempotency_key = match idempotency::ensure_header(
        headers.get("idempotency-key").and_then(|v| v.to_str().ok()),
        "idempotency-key",
    ) {
        Ok(v) => v,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({"error": e.to_string()})),
            );
        }
    };

    let cache_key = state
        .key_builder
        .idempotency_result_key(&caller_id, &idempotency_key);

    let request_value = serde_json::json!({"operation": body.operation, "payload": body.payload});
    let request_hash = idempotency::hash_request_body(&request_value);

    let key_lock = get_singleflight_lock(&state, &cache_key).await;
    let _guard = key_lock.lock().await;

    let mut tx = match db.begin().await {
        Ok(tx) => tx,
        Err(err) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": format!("transaction begin failed: {err}")})),
            );
        }
    };

    let result =
        match idempotency::check_or_claim_tx(&mut tx, &caller_id, &idempotency_key, &request_hash)
            .await
        {
            Ok(r) => r,
            Err(err) => {
                let _ = tx.rollback().await;
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({"error": format!("idempotency check failed: {err}")})),
                );
            }
        };

    match result {
        IdempotencyResult::Replay(resp) => {
            let _ = tx.commit().await;
            let serialized = serde_json::to_string(&resp).unwrap_or_default();
            let _ = state
                .cache
                .set_string(&cache_key, &serialized, state.config.cache_default_ttl)
                .await;
            (
                StatusCode::from_u16(resp.status_code as u16).unwrap_or(StatusCode::OK),
                Json(resp.body),
            )
        }
        IdempotencyResult::Conflict => {
            let _ = tx.commit().await;
            (
                StatusCode::CONFLICT,
                Json(serde_json::json!({"error":"idempotency key reused with different payload"})),
            )
        }
        IdempotencyResult::InProgress => {
            let _ = tx.commit().await;
            (
                StatusCode::CONFLICT,
                Json(
                    serde_json::json!({"error":"request with same idempotency key is in progress"}),
                ),
            )
        }
        IdempotencyResult::Claimed => {
            let response_body = serde_json::json!({
                "ok": true,
                "operation": body.operation,
                "payload": body.payload,
                "caller_id": caller_id,
            });
            let persisted = PersistedResponse {
                status_code: StatusCode::OK.as_u16() as i32,
                body: response_body.clone(),
            };

            if let Err(err) =
                idempotency::complete_tx(&mut tx, &caller_id, &idempotency_key, &persisted).await
            {
                let _ = tx.rollback().await;
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(
                        serde_json::json!({"error": format!("failed to persist idempotent response: {err}")}),
                    ),
                );
            }

            let stream_name = format!(
                "{}.{}.{}",
                state.config.system, state.config.env, "inventory-updated"
            );
            let event_payload = serde_json::json!({
                "operation": body.operation,
                "payload": body.payload,
                "caller_id": caller_id,
                "idempotency_key": idempotency_key,
                "result": response_body,
            });

            let event_payload_len = serde_json::to_vec(&event_payload)
                .map(|v| v.len())
                .unwrap_or(0);
            if event_payload_len > state.config.event_payload_max_bytes {
                let _ = tx.rollback().await;
                return (
                    StatusCode::PAYLOAD_TOO_LARGE,
                    Json(serde_json::json!({
                        "error": "event payload exceeds EVENT_PAYLOAD_MAX_BYTES; move large blobs to object storage and store pointer/checksum"
                    })),
                );
            }

            let event = EventRecord::new(
                stream_name,
                "inventory.write-demo.completed".to_string(),
                1,
                "write-demo".to_string(),
                caller_id.clone(),
                state.config.service.clone(),
                Some(idempotency_key.clone()),
                headers
                    .get("x-correlation-id")
                    .and_then(|v| v.to_str().ok())
                    .map(|s| s.to_string()),
                None,
                event_payload,
                serde_json::json!({
                    "deployment_id": std::env::var("BANJI_DEPLOYMENT_ID").unwrap_or_else(|_| "unknown".to_string())
                }),
            );

            if let Err(err) = events::publisher::publish_in_tx(&mut tx, &event).await {
                let _ = tx.rollback().await;
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({"error": format!("event publish failed: {err}")})),
                );
            }

            let job_payload = serde_json::json!({
                "operation": body.operation,
                "caller_id": caller_id,
                "idempotency_key": idempotency_key
            });
            let enqueue_key = format!("{}:{}:{}", state.config.service, caller_id, idempotency_key);
            if let Err(err) = jobs::outbox::enqueue_tx(
                &mut tx,
                &enqueue_key,
                "write-demo",
                jobs::types::WorkloadClass::Fast,
                "job.fast.write-demo",
                &job_payload,
            )
            .await
            {
                let _ = tx.rollback().await;
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(
                        serde_json::json!({"error": format!("failed to enqueue job outbox record: {err}")}),
                    ),
                );
            }

            if let Err(err) = tx.commit().await {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({"error": format!("transaction commit failed: {err}")})),
                );
            }

            let serialized = serde_json::to_string(&persisted).unwrap_or_default();
            let _ = state
                .cache
                .set_string(&cache_key, &serialized, state.config.cache_default_ttl)
                .await;

            (StatusCode::OK, Json(response_body))
        }
    }
}

async fn get_singleflight_lock(state: &AppState, key: &str) -> Arc<Mutex<()>> {
    let mut map = state.singleflight.lock().await;

    // Keep only live lock entries so key cardinality does not grow unbounded.
    map.retain(|_, weak_lock| weak_lock.strong_count() > 0);

    if let Some(existing) = map.get(key).and_then(|weak_lock| weak_lock.upgrade()) {
        return existing;
    }

    let new_lock = Arc::new(Mutex::new(()));
    map.insert(key.to_string(), Arc::downgrade(&new_lock));
    new_lock
}

pub async fn best_effort_lock(
    state: &AppState,
    lock_name: &str,
    ttl: Duration,
) -> Option<cache::LockHandle> {
    let key = state.key_builder.build("coord-lock", &[lock_name]);
    state.cache.acquire_lock(&key, ttl).await.ok().flatten()
}

pub async fn best_effort_unlock(state: &AppState, lock: &cache::LockHandle) -> bool {
    state.cache.release_lock(lock).await.unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_config() -> AppConfig {
        AppConfig {
            system: "banji-core".to_string(),
            env: "test".to_string(),
            service: "api".to_string(),
            cache_enabled: false,
            cache_schema_version: "v1".to_string(),
            cache_default_ttl: Duration::from_secs(300),
            cache_ttl_jitter: Duration::from_secs(0),
            redis_connect_timeout: Duration::from_millis(50),
            redis_command_timeout: Duration::from_millis(50),
            redis_circuit_error_threshold: 2,
            redis_circuit_window: Duration::from_secs(3),
            redis_circuit_cooldown: Duration::from_secs(3),
            redis_log_rate_limit: Duration::from_secs(1),
            event_payload_max_bytes: 65_536,
            rabbit_url: None,
            rabbit_vhost: "/".to_string(),
            rabbit_exchange_jobs: "banji-core.test.jobs".to_string(),
            rabbit_dlx_exchange: "banji-core.test.jobs.dlx".to_string(),
            rabbit_retry_1_ttl_ms: 30_000,
            rabbit_retry_2_ttl_ms: 300_000,
            rabbit_retry_3_ttl_ms: 1_800_000,
            rabbit_prefetch_fast: 20,
            rabbit_prefetch_heavy: 2,
            rabbit_max_attempts: 4,
            redis_url: None,
            database_runtime_url: None,
        }
    }

    fn test_state() -> AppState {
        let config = test_config();
        AppState {
            db: None,
            cache: Arc::new(NoopCacheClient),
            key_builder: KeyBuilder::new(
                config.system.clone(),
                config.env.clone(),
                config.service.clone(),
                config.cache_schema_version.clone(),
            ),
            singleflight: Arc::new(Mutex::new(HashMap::new())),
            config,
        }
    }

    #[tokio::test]
    async fn singleflight_removes_stale_keys() {
        let state = test_state();
        let key_a = get_singleflight_lock(&state, "key-a").await;
        drop(key_a);

        let _key_b = get_singleflight_lock(&state, "key-b").await;
        let map = state.singleflight.lock().await;

        assert_eq!(map.len(), 1);
        assert!(map.contains_key("key-b"));
        assert!(!map.contains_key("key-a"));
    }

    #[tokio::test]
    async fn singleflight_reuses_live_lock_for_same_key() {
        let state = test_state();
        let a = get_singleflight_lock(&state, "key-a").await;
        let b = get_singleflight_lock(&state, "key-a").await;
        assert!(Arc::ptr_eq(&a, &b));
    }
}
