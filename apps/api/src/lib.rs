pub mod cache;
pub mod config;
pub mod idempotency;

use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Json, Router,
};
use cache::{CacheClient, KeyBuilder, NoopCacheClient, RedisCacheClient};
use config::AppConfig;
use idempotency::{IdempotencyResult, PersistedResponse};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::PgPool;
use std::{collections::HashMap, sync::Arc, time::Duration};
use tokio::sync::Mutex;

#[derive(Clone)]
pub struct AppState {
    pub config: AppConfig,
    pub db: Option<PgPool>,
    pub cache: Arc<dyn CacheClient>,
    pub key_builder: KeyBuilder,
    pub singleflight: Arc<Mutex<HashMap<String, Arc<Mutex<()>>>>>,
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
                tracing::warn!(error = %err, "redis unavailable at startup; using fail-open noop cache");
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

    let key_lock = get_singleflight_lock(&state, &cache_key).await;
    let _guard = key_lock.lock().await;

    if let Ok(Some(cached)) = state.cache.get_string(&cache_key).await {
        if let Ok(resp) = serde_json::from_str::<PersistedResponse>(&cached) {
            return (
                StatusCode::from_u16(resp.status_code as u16).unwrap_or(StatusCode::OK),
                Json(resp.body),
            );
        }
    }

    let request_value = serde_json::json!({"operation": body.operation, "payload": body.payload});
    let request_hash = idempotency::hash_request_body(&request_value);

    let result =
        match idempotency::check_or_claim(db, &caller_id, &idempotency_key, &request_hash).await {
            Ok(r) => r,
            Err(err) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({"error": format!("idempotency check failed: {err}")})),
                );
            }
        };

    match result {
        IdempotencyResult::Replay(resp) => {
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
        IdempotencyResult::Conflict => (
            StatusCode::CONFLICT,
            Json(serde_json::json!({"error":"idempotency key reused with different payload"})),
        ),
        IdempotencyResult::InProgress => (
            StatusCode::CONFLICT,
            Json(serde_json::json!({"error":"request with same idempotency key is in progress"})),
        ),
        IdempotencyResult::Claimed => {
            // Demo handler: source-of-truth write result is persisted in Postgres idempotency row.
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
                idempotency::complete(db, &caller_id, &idempotency_key, &persisted).await
            {
                let _ = idempotency::fail(db, &caller_id, &idempotency_key, &err.to_string()).await;
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(
                        serde_json::json!({"error": format!("failed to persist idempotent response: {err}")}),
                    ),
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
    map.entry(key.to_string())
        .or_insert_with(|| Arc::new(Mutex::new(())))
        .clone()
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
