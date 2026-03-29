pub mod auth;
pub mod backfill;
pub mod build_metadata;
pub mod cache;
pub mod config;
pub mod db;
pub mod desktop_inventory;
pub mod edge;
pub mod events;
pub mod idempotency;
pub mod items;
pub mod jobs;
pub mod logging;
pub mod observability;
pub mod projections;
pub mod storage;

use auth::{AuthPrincipal, JwtVerifier};
use axum::{
    extract::{Path, State},
    http::{header::HeaderName, HeaderMap, HeaderValue, StatusCode},
    middleware,
    response::IntoResponse,
    routing::{get, post, put},
    Extension, Json, Router,
};
use cache::{CacheClient, KeyBuilder, NoopCacheClient, RedisCacheClient, RedisRuntime};
use config::AppConfig;
use idempotency::{IdempotencyResult, PersistedResponse};
use items::types::{CreateItemRequest, ItemRecord};
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
    pub cache_runtime_enabled: bool,
    pub jwt_verifier: Option<Arc<JwtVerifier>>,
    pub key_builder: KeyBuilder,
    pub singleflight: Arc<Mutex<HashMap<String, Weak<Mutex<()>>>>>,
    pub rate_limiter: Arc<edge::rate_limit::SharedRateLimiter>,
    pub backpressure_gate: Arc<edge::backpressure::BackpressureGate>,
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
    let redis_runtime = if config.redis_url.is_some() {
        match RedisRuntime::connect(&config).await {
            Ok(runtime) => Some(Arc::new(runtime)),
            Err(err) => {
                let safe_error = redact_message(&err.to_string());
                tracing::warn!(
                    error = %safe_error,
                    "redis unavailable at startup; using local fallback for shared features"
                );
                None
            }
        }
    } else {
        None
    };

    let cache: Arc<dyn CacheClient> = if config.cache_enabled {
        if let Some(runtime) = redis_runtime.clone() {
            Arc::new(RedisCacheClient::from_runtime(runtime))
        } else {
            Arc::new(NoopCacheClient)
        }
    } else {
        Arc::new(NoopCacheClient)
    };

    let db = db::pool::build_runtime_pool(&config).await?;
    let cache_runtime_enabled = config.cache_enabled && redis_runtime.is_some();

    if let Some(pool) = db.as_ref() {
        spawn_db_pool_metrics_sampler(pool.clone());
    }

    let key_builder = KeyBuilder::new(
        config.system.clone(),
        config.env.clone(),
        config.service.clone(),
        config.cache_schema_version.clone(),
    );

    let jwt_verifier = if config.auth_enabled {
        Some(Arc::new(JwtVerifier::new(
            config
                .auth_jwks_url
                .clone()
                .expect("AUTH_JWKS_URL validated when auth enabled"),
            config
                .auth_issuer
                .clone()
                .expect("AUTH_ISSUER validated when auth enabled"),
            config
                .auth_audience
                .clone()
                .expect("AUTH_AUDIENCE validated when auth enabled"),
            config.auth_jwks_cache_ttl,
            config.auth_jwks_timeout,
            config.auth_clock_skew,
        )?))
    } else {
        None
    };

    let rate_limiter = Arc::new(edge::rate_limit::SharedRateLimiter::new(
        &config,
        redis_runtime.clone(),
    ));
    let backpressure_gate = Arc::new(edge::backpressure::BackpressureGate::new(&config));

    if config.app_role == config::AppRole::Api {
        if let Some(pool) = db.as_ref() {
            edge::backpressure::spawn_backpressure_sampler(
                backpressure_gate.clone(),
                pool.clone(),
                config.job_result_kafka_enabled,
            );
            observability::dependency_samplers::spawn_dependency_samplers(
                config.clone(),
                pool.clone(),
            );
        }
    }

    Ok(AppState {
        config,
        db,
        cache,
        cache_runtime_enabled,
        jwt_verifier,
        key_builder,
        singleflight: Arc::new(Mutex::new(HashMap::new())),
        rate_limiter,
        backpressure_gate,
    })
}

async fn health() -> Json<Health> {
    Json(Health { status: "ok" })
}

async fn version() -> Json<build_metadata::VersionInfo> {
    Json(build_metadata::version_info())
}

pub fn app() -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/version", get(version))
        .layer(middleware::from_fn(
            observability::http_observability_middleware,
        ))
}

pub fn app_with_state(state: AppState) -> Router {
    let public = Router::new()
        .route("/health", get(health))
        .route("/version", get(version))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            edge::rate_limit::rate_limit_middleware,
        ));

    // Layer order is intentionally reverse-applied by Axum:
    // auth -> identity -> backpressure -> rate limit -> handlers.
    let application = Router::new()
        .route("/v1/write-demo", post(write_demo))
        .route("/v1/items", post(create_item))
        .route("/v1/items/:item_id", get(get_item))
        .route("/v1/desktop/inventory", get(get_desktop_inventory))
        .route("/v1/desktop/skus", post(create_desktop_sku))
        .route("/v1/desktop/skus/:sku_id", put(update_desktop_sku))
        .route("/v1/desktop/services", post(create_desktop_service))
        .route(
            "/v1/desktop/services/:service_id",
            put(update_desktop_service),
        )
        .route(
            "/v1/desktop/stock-reports",
            post(create_desktop_stock_report),
        )
        .route(
            "/v1/desktop/stock-updates",
            post(apply_desktop_stock_updates),
        )
        .route(
            "/v1/desktop/ranking",
            get(get_desktop_ranking).put(save_desktop_ranking),
        )
        .route("/v1/desktop/sist/sku/:sku_id", get(get_desktop_sist_sku))
        .route(
            "/v1/desktop/sist/settings",
            put(update_desktop_sist_settings),
        )
        .layer(middleware::from_fn_with_state(
            state.clone(),
            edge::rate_limit::rate_limit_middleware,
        ))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            edge::backpressure::backpressure_middleware,
        ))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            edge::identity::identity_middleware,
        ))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            auth::middleware::auth_middleware,
        ));

    Router::new()
        .merge(public)
        .merge(application)
        .layer(middleware::from_fn(
            observability::http_observability_middleware,
        ))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            edge::cors::cors_middleware,
        ))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            edge::request_limits::request_size_limit_middleware,
        ))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            edge::origin_guard::origin_guard_middleware,
        ))
        .with_state(state)
}

async fn create_item(
    State(state): State<AppState>,
    Extension(principal): Extension<AuthPrincipal>,
    headers: HeaderMap,
    Json(body): Json<CreateItemRequest>,
) -> axum::response::Response {
    let Some(db) = state.db.as_ref() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"error":"database is not configured"})),
        )
            .into_response();
    };

    if let Err(err) = body.validate() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error_code":"REQUEST_VALIDATION_FAILED",
                "error": err.to_string()
            })),
        )
            .into_response();
    }

    let idempotency_key = match idempotency::ensure_header(
        headers.get("idempotency-key").and_then(|v| v.to_str().ok()),
        "idempotency-key",
    ) {
        Ok(v) => v,
        Err(err) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "error_code":"REQUEST_VALIDATION_FAILED",
                    "error": err.to_string()
                })),
            )
                .into_response();
        }
    };

    let caller_sub = principal.sub;
    let request_value = serde_json::json!({
      "item_id": body.item_id,
      "sku": body.sku,
      "name": body.normalized_name(),
      "quantity": body.quantity
    });
    let request_hash = idempotency::hash_http_request("POST", "/v1/items", &request_value);

    let idem_cache_key = state
        .key_builder
        .idempotency_result_key(&caller_sub, &idempotency_key);
    let item_cache_key = state
        .key_builder
        .inventory_item_key(&caller_sub, &body.item_id);

    let key_lock = get_singleflight_lock(&state, &idem_cache_key).await;
    let _guard = key_lock.lock().await;

    let mut tx = match db::pool::begin_with_pool_metrics(db).await {
        Ok(tx) => tx,
        Err(err) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error":"transaction begin failed", "details": format!("{err}")})),
            )
                .into_response();
        }
    };

    let idem_result = match idempotency::check_or_claim_tx(
        &mut tx,
        &caller_sub,
        &idempotency_key,
        &request_hash,
    )
    .await
    {
        Ok(v) => v,
        Err(err) => {
            let _ = tx.rollback().await;
            return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({"error":"idempotency check failed", "details": format!("{err}")})),
                )
                    .into_response();
        }
    };

    match idem_result {
        IdempotencyResult::Replay(resp) => {
            let _ = tx.commit().await;
            let serialized = serde_json::to_string(&resp).unwrap_or_default();
            let _ = state
                .cache
                .set_string(&idem_cache_key, &serialized, state.config.cache_default_ttl)
                .await;
            if let Some(item_value) = resp.body.get("item") {
                if let Ok(serialized_item) = serde_json::to_string(item_value) {
                    let _ = state
                        .cache
                        .set_string(
                            &item_cache_key,
                            &serialized_item,
                            state.config.cache_default_ttl,
                        )
                        .await;
                }
            }
            let status =
                StatusCode::from_u16(resp.status_code as u16).unwrap_or(StatusCode::CREATED);
            let mut response = (status, Json(resp.body)).into_response();
            response.headers_mut().insert(
                HeaderName::from_static("x-idempotency-replayed"),
                HeaderValue::from_static("true"),
            );
            response
        }
        IdempotencyResult::Conflict => {
            let _ = tx.commit().await;
            (
                StatusCode::CONFLICT,
                Json(serde_json::json!({
                    "error_code":"IDEMPOTENCY_CONFLICT",
                    "error":"idempotency key reused with different payload"
                })),
            )
                .into_response()
        }
        IdempotencyResult::InProgress => {
            let _ = tx.commit().await;
            (
                StatusCode::CONFLICT,
                Json(serde_json::json!({
                    "error_code":"IDEMPOTENCY_IN_PROGRESS",
                    "error":"request with same idempotency key is in progress"
                })),
            )
                .into_response()
        }
        IdempotencyResult::Claimed => {
            let name = body.normalized_name();
            let created = match items::repository::insert_tx(
                &mut tx,
                &caller_sub,
                &body.item_id,
                &body.sku,
                &name,
                body.quantity,
            )
            .await
            {
                Ok(item) => item,
                Err(err) if is_unique_violation(&err) => {
                    let conflict_body = serde_json::json!({
                      "error_code":"ITEM_ALREADY_EXISTS",
                      "error":"item already exists for this owner"
                    });
                    let persisted = PersistedResponse {
                        status_code: StatusCode::CONFLICT.as_u16() as i32,
                        body: conflict_body.clone(),
                    };
                    if let Err(err) =
                        idempotency::complete_tx(&mut tx, &caller_sub, &idempotency_key, &persisted)
                            .await
                    {
                        let _ = tx.rollback().await;
                        return (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            Json(serde_json::json!({"error":"failed to persist idempotent conflict response", "details": format!("{err}")})),
                        )
                            .into_response();
                    }
                    if let Err(err) = tx.commit().await {
                        return (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            Json(serde_json::json!({"error":"transaction commit failed", "details": format!("{err}")})),
                        )
                            .into_response();
                    }
                    let mut response = (StatusCode::CONFLICT, Json(conflict_body)).into_response();
                    response.headers_mut().insert(
                        HeaderName::from_static("x-idempotency-replayed"),
                        HeaderValue::from_static("false"),
                    );
                    return response;
                }
                Err(err) => {
                    let _ = tx.rollback().await;
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(serde_json::json!({"error":"failed to create item", "details": format!("{err}")})),
                    )
                        .into_response();
                }
            };

            let response_body = serde_json::json!({"item": created});
            let persisted = PersistedResponse {
                status_code: StatusCode::CREATED.as_u16() as i32,
                body: response_body.clone(),
            };
            if let Err(err) =
                idempotency::complete_tx(&mut tx, &caller_sub, &idempotency_key, &persisted).await
            {
                let _ = tx.rollback().await;
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({"error":"failed to persist idempotent response", "details": format!("{err}")})),
                )
                    .into_response();
            }

            let correlation_id = observability::propagation::correlation_id_from_headers_or_context(
                &headers,
                &opentelemetry::Context::current(),
            );
            let observability_metadata = observability::propagation::observability_metadata(
                &correlation_id,
                &opentelemetry::Context::current(),
            );
            let event_metadata = observability::propagation::merge_observability_metadata(
                &serde_json::json!({
                    "deployment_id": std::env::var("BANJI_DEPLOYMENT_ID").unwrap_or_else(|_| "unknown".to_string())
                }),
                observability_metadata
                    .get("observability")
                    .cloned()
                    .unwrap_or_else(|| serde_json::json!({})),
            );
            let event = match events::schema::build_inventory_item_created_v1(
                &state.config.system,
                &state.config.env,
                state.config.service.clone(),
                caller_sub.clone(),
                body.item_id.clone(),
                body.sku.clone(),
                name.clone(),
                body.quantity,
                idempotency_key.clone(),
                Some(correlation_id.clone()),
                event_metadata,
            ) {
                Ok(event) => event,
                Err(err) => {
                    let _ = tx.rollback().await;
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(serde_json::json!({"error_code": err.code.as_str(), "error": err.to_string()})),
                    )
                        .into_response();
                }
            };
            if let Err(err) = events::outbox::enqueue_tx(&mut tx, &event).await {
                let _ = tx.rollback().await;
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({"error":"failed to enqueue event outbox", "details": format!("{err}")})),
                )
                    .into_response();
            }

            if let Err(err) = jobs::service::schedule_item_created_tx(
                &mut tx,
                state.config.service.clone(),
                caller_sub.clone(),
                body.item_id.clone(),
                idempotency_key.clone(),
                correlation_id.clone(),
                observability_metadata,
                state.config.rabbit_max_attempts,
            )
            .await
            {
                let _ = tx.rollback().await;
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(
                        serde_json::json!({"error":"failed to enqueue outbox record", "details": format!("{err}")}),
                    ),
                )
                    .into_response();
            }

            if let Err(err) = tx.commit().await {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({"error":"transaction commit failed", "details": format!("{err}")})),
                )
                    .into_response();
            }

            let serialized = serde_json::to_string(&persisted).unwrap_or_default();
            let _ = state
                .cache
                .set_string(&idem_cache_key, &serialized, state.config.cache_default_ttl)
                .await;
            if let Ok(item_json) = serde_json::to_string(
                response_body
                    .get("item")
                    .unwrap_or(&serde_json::Value::Null),
            ) {
                let _ = state
                    .cache
                    .set_string(&item_cache_key, &item_json, state.config.cache_default_ttl)
                    .await;
            }

            (StatusCode::CREATED, Json(response_body)).into_response()
        }
    }
}

async fn get_item(
    State(state): State<AppState>,
    Extension(principal): Extension<AuthPrincipal>,
    Path(item_id): Path<String>,
) -> axum::response::Response {
    let Some(db) = state.db.as_ref() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({"error":"database is not configured"})),
        )
            .into_response();
    };

    if let Err(err) = items::types::validate_item_id(&item_id) {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "error_code":"REQUEST_VALIDATION_FAILED",
                "error": err.to_string()
            })),
        )
            .into_response();
    }

    let cache_key = state
        .key_builder
        .inventory_item_key(&principal.sub, &item_id);

    if state.cache_runtime_enabled {
        match state.cache.get_string(&cache_key).await {
            Ok(Some(cached)) => match serde_json::from_str::<ItemRecord>(&cached) {
                Ok(item) => {
                    observability::metrics::record_cache_lookup("item_read", "hit");
                    let mut response =
                        (StatusCode::OK, Json(serde_json::json!({"item": item}))).into_response();
                    response.headers_mut().insert(
                        HeaderName::from_static("x-cache"),
                        HeaderValue::from_static("hit"),
                    );
                    return response;
                }
                Err(_) => observability::metrics::record_cache_lookup("item_read", "error"),
            },
            Ok(None) => observability::metrics::record_cache_lookup("item_read", "miss"),
            Err(_) => observability::metrics::record_cache_lookup("item_read", "error"),
        }
    } else {
        observability::metrics::record_cache_lookup("item_read", "disabled");
    }

    match items::repository::get_by_owner_and_id(db, &principal.sub, &item_id).await {
        Ok(Some(item)) => {
            if let Ok(serialized) = serde_json::to_string(&item) {
                let _ = state
                    .cache
                    .set_string(&cache_key, &serialized, state.config.cache_default_ttl)
                    .await;
            }
            let mut response =
                (StatusCode::OK, Json(serde_json::json!({"item": item}))).into_response();
            response.headers_mut().insert(
                HeaderName::from_static("x-cache"),
                HeaderValue::from_static("miss"),
            );
            response
        }
        Ok(None) => {
            let mut response = (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({"error":"item not found"})),
            )
                .into_response();
            response.headers_mut().insert(
                HeaderName::from_static("x-cache"),
                HeaderValue::from_static("miss"),
            );
            response
        }
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error":"failed to read item", "details": format!("{err}")})),
        )
            .into_response(),
    }
}

async fn get_desktop_inventory(
    Extension(principal): Extension<AuthPrincipal>,
) -> axum::response::Response {
    match desktop_inventory::store::load_inventory(&principal.sub) {
        Ok(inventory) => (StatusCode::OK, Json(serde_json::json!(inventory))).into_response(),
        Err(err) => desktop_inventory_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "failed to load desktop inventory",
            err,
        ),
    }
}

async fn create_desktop_sku(
    Extension(principal): Extension<AuthPrincipal>,
    Json(mut body): Json<desktop_inventory::types::UpsertDesktopSkuRequest>,
) -> axum::response::Response {
    if let Err(err) = body.validate() {
        return desktop_inventory_validation_error(err);
    }

    match desktop_inventory::store::create_sku(&principal.sub, body) {
        Ok(sku) => (StatusCode::CREATED, Json(serde_json::json!({ "sku": sku }))).into_response(),
        Err(err) => desktop_inventory_error(StatusCode::BAD_REQUEST, "failed to create sku", err),
    }
}

async fn update_desktop_sku(
    Extension(principal): Extension<AuthPrincipal>,
    Path(sku_id): Path<String>,
    Json(mut body): Json<desktop_inventory::types::UpsertDesktopSkuRequest>,
) -> axum::response::Response {
    if sku_id != body.sku_id {
        return desktop_inventory_validation_error(anyhow::anyhow!(
            "path skuId must match request body skuId"
        ));
    }
    if let Err(err) = body.validate() {
        return desktop_inventory_validation_error(err);
    }

    match desktop_inventory::store::update_sku(&principal.sub, &sku_id, body) {
        Ok(sku) => (StatusCode::OK, Json(serde_json::json!({ "sku": sku }))).into_response(),
        Err(err) => desktop_inventory_error(StatusCode::BAD_REQUEST, "failed to update sku", err),
    }
}

async fn create_desktop_service(
    Extension(principal): Extension<AuthPrincipal>,
    Json(mut body): Json<desktop_inventory::types::UpsertDesktopServiceRequest>,
) -> axum::response::Response {
    if let Err(err) = body.validate() {
        return desktop_inventory_validation_error(err);
    }

    match desktop_inventory::store::create_service(&principal.sub, body) {
        Ok(service) => (
            StatusCode::CREATED,
            Json(serde_json::json!({ "service": service })),
        )
            .into_response(),
        Err(err) => {
            desktop_inventory_error(StatusCode::BAD_REQUEST, "failed to create service", err)
        }
    }
}

async fn update_desktop_service(
    Extension(principal): Extension<AuthPrincipal>,
    Path(service_id): Path<String>,
    Json(mut body): Json<desktop_inventory::types::UpsertDesktopServiceRequest>,
) -> axum::response::Response {
    if service_id != body.service_id {
        return desktop_inventory_validation_error(anyhow::anyhow!(
            "path serviceId must match request body serviceId"
        ));
    }
    if let Err(err) = body.validate() {
        return desktop_inventory_validation_error(err);
    }

    match desktop_inventory::store::update_service(&principal.sub, &service_id, body) {
        Ok(service) => (
            StatusCode::OK,
            Json(serde_json::json!({ "service": service })),
        )
            .into_response(),
        Err(err) => {
            desktop_inventory_error(StatusCode::BAD_REQUEST, "failed to update service", err)
        }
    }
}

async fn apply_desktop_stock_updates(
    Extension(principal): Extension<AuthPrincipal>,
    Json(body): Json<desktop_inventory::types::ApplyDesktopStockUpdatesRequest>,
) -> axum::response::Response {
    if let Err(err) = body.validate() {
        return desktop_inventory_validation_error(err);
    }

    match desktop_inventory::store::apply_stock_updates(&principal.sub, body) {
        Ok(updated) => {
            (StatusCode::OK, Json(serde_json::json!({ "skus": updated }))).into_response()
        }
        Err(err) => desktop_inventory_error(
            StatusCode::BAD_REQUEST,
            "failed to apply stock updates",
            err,
        ),
    }
}

async fn create_desktop_stock_report(
    Extension(principal): Extension<AuthPrincipal>,
    Json(mut body): Json<desktop_inventory::types::SubmitStockReportRequest>,
) -> axum::response::Response {
    if let Err(err) = body.validate() {
        return desktop_inventory_validation_error(err);
    }

    match desktop_inventory::store::submit_stock_report(&principal.sub, body) {
        Ok(report) => (
            StatusCode::CREATED,
            Json(serde_json::json!({ "report": report })),
        )
            .into_response(),
        Err(err) => desktop_inventory_error(
            StatusCode::BAD_REQUEST,
            "failed to submit stock report",
            err,
        ),
    }
}

async fn get_desktop_sist_sku(
    Extension(principal): Extension<AuthPrincipal>,
    Path(sku_id): Path<String>,
) -> axum::response::Response {
    match desktop_inventory::store::load_sku_detail(&principal.sub, &sku_id) {
        Ok(detail) => (StatusCode::OK, Json(serde_json::json!(detail))).into_response(),
        Err(err) => desktop_inventory_error(
            StatusCode::BAD_REQUEST,
            "failed to load sist sku detail",
            err,
        ),
    }
}

async fn update_desktop_sist_settings(
    Extension(principal): Extension<AuthPrincipal>,
    Json(body): Json<desktop_inventory::types::UpdateSistSettingsRequest>,
) -> axum::response::Response {
    if let Err(err) = body.validate() {
        return desktop_inventory_validation_error(err);
    }

    match desktop_inventory::store::update_sist_settings(&principal.sub, body) {
        Ok(settings) => (
            StatusCode::OK,
            Json(serde_json::json!({ "settings": settings })),
        )
            .into_response(),
        Err(err) => desktop_inventory_error(
            StatusCode::BAD_REQUEST,
            "failed to update sist settings",
            err,
        ),
    }
}

async fn get_desktop_ranking(
    Extension(principal): Extension<AuthPrincipal>,
) -> axum::response::Response {
    match desktop_inventory::store::load_ranking(&principal.sub) {
        Ok(entries) => (
            StatusCode::OK,
            Json(serde_json::json!({ "entries": entries })),
        )
            .into_response(),
        Err(err) => desktop_inventory_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "failed to load ranking",
            err,
        ),
    }
}

async fn save_desktop_ranking(
    Extension(principal): Extension<AuthPrincipal>,
    Json(body): Json<desktop_inventory::types::SaveDesktopRankingRequest>,
) -> axum::response::Response {
    if let Err(err) = body.validate() {
        return desktop_inventory_validation_error(err);
    }

    match desktop_inventory::store::save_ranking(&principal.sub, body) {
        Ok(entries) => (
            StatusCode::OK,
            Json(serde_json::json!({ "entries": entries })),
        )
            .into_response(),
        Err(err) => desktop_inventory_error(StatusCode::BAD_REQUEST, "failed to save ranking", err),
    }
}

fn desktop_inventory_validation_error(err: anyhow::Error) -> axum::response::Response {
    (
        StatusCode::BAD_REQUEST,
        Json(serde_json::json!({
            "error_code":"REQUEST_VALIDATION_FAILED",
            "error": err.to_string()
        })),
    )
        .into_response()
}

fn desktop_inventory_error(
    status: StatusCode,
    message: &str,
    err: anyhow::Error,
) -> axum::response::Response {
    (
        status,
        Json(serde_json::json!({
            "error": message,
            "details": err.to_string()
        })),
    )
        .into_response()
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

    let mut tx = match db::pool::begin_with_pool_metrics(db).await {
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

            let event_payload = serde_json::json!({
                "operation": body.operation,
                "payload": body.payload,
                "caller_id": caller_id,
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

            let correlation_id = observability::propagation::correlation_id_from_headers_or_context(
                &headers,
                &opentelemetry::Context::current(),
            );
            let observability_metadata = observability::propagation::observability_metadata(
                &correlation_id,
                &opentelemetry::Context::current(),
            );
            let event_metadata = observability::propagation::merge_observability_metadata(
                &serde_json::json!({
                    "deployment_id": std::env::var("BANJI_DEPLOYMENT_ID").unwrap_or_else(|_| "unknown".to_string())
                }),
                observability_metadata
                    .get("observability")
                    .cloned()
                    .unwrap_or_else(|| serde_json::json!({})),
            );

            let event = match events::schema::build_inventory_write_demo_completed_v1(
                &state.config.system,
                &state.config.env,
                state.config.service.clone(),
                caller_id.clone(),
                body.operation.clone(),
                body.payload.clone(),
                response_body.clone(),
                idempotency_key.clone(),
                Some(correlation_id.clone()),
                event_metadata,
            ) {
                Ok(event) => event,
                Err(err) => {
                    let _ = tx.rollback().await;
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(
                            serde_json::json!({"error_code": err.code.as_str(), "error": err.to_string()}),
                        ),
                    );
                }
            };

            if let Err(err) = events::outbox::enqueue_tx(&mut tx, &event).await {
                let _ = tx.rollback().await;
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(
                        serde_json::json!({"error": format!("failed to enqueue event outbox: {err}")}),
                    ),
                );
            }

            if let Err(err) = jobs::service::schedule_write_demo_tx(
                &mut tx,
                state.config.service.clone(),
                body.operation.clone(),
                caller_id.clone(),
                idempotency_key.clone(),
                correlation_id.clone(),
                observability_metadata,
                state.config.rabbit_max_attempts,
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

fn is_unique_violation(err: &anyhow::Error) -> bool {
    err.downcast_ref::<sqlx::Error>()
        .and_then(|sqlx_err| match sqlx_err {
            sqlx::Error::Database(db_err) => db_err.code().map(|code| code == "23505"),
            _ => None,
        })
        .unwrap_or(false)
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

fn spawn_db_pool_metrics_sampler(pool: PgPool) {
    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(Duration::from_secs(10));
        loop {
            ticker.tick().await;
            observability::metrics::set_db_pool_size(pool.size() as i64);
            observability::metrics::set_db_pool_idle(pool.num_idle() as i64);
            if pool.is_closed() {
                break;
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_config() -> AppConfig {
        AppConfig {
            app_role: config::AppRole::Api,
            system: "banji-core".to_string(),
            env: "test".to_string(),
            service: "api".to_string(),
            instance_id: "api-test-1".to_string(),
            auth_enabled: false,
            auth_jwks_url: None,
            auth_issuer: None,
            auth_audience: None,
            auth_jwks_cache_ttl: Duration::from_secs(300),
            auth_jwks_timeout: Duration::from_millis(1_000),
            auth_clock_skew: Duration::from_secs(30),
            idempotency_retention_days: 30,
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
            event_relay_batch_size: 100,
            event_relay_poll_interval: Duration::from_millis(500),
            event_relay_retry_backoff: Duration::from_millis(1_000),
            event_relay_max_backoff: Duration::from_millis(60_000),
            event_relay_block_after_attempts: 25,
            event_outbox_published_retention_days: 7,
            rabbit_url: None,
            rabbit_vhost: "/".to_string(),
            rabbit_exchange_jobs: "banji-core.test.jobs".to_string(),
            rabbit_exchange_jobs_replay: "banji-core.test.jobs.replay".to_string(),
            rabbit_dlx_exchange: "banji-core.test.jobs.dlx".to_string(),
            rabbit_management_api_base_url: None,
            rabbit_management_username: None,
            rabbit_management_password: None,
            rabbit_retry_1_ttl_ms: 30_000,
            rabbit_retry_2_ttl_ms: 300_000,
            rabbit_retry_3_ttl_ms: 1_800_000,
            rabbit_prefetch_fast: 20,
            rabbit_prefetch_heavy: 2,
            rabbit_replay_prefetch_fast: 5,
            rabbit_replay_prefetch_heavy: 1,
            rabbit_max_attempts: 4,
            job_result_kafka_enabled: false,
            job_result_kafka_topic_prefix: None,
            redis_url: None,
            database_runtime_url: None,
            database_runtime_endpoint_kind: config::DatabaseRuntimeEndpointKind::Direct,
            pgbouncer_pool_mode: None,
            sqlx_pool_max_connections: 2,
            sqlx_pool_min_connections: 1,
            sqlx_pool_acquire_timeout: Duration::from_millis(2_000),
            sqlx_pool_connect_timeout: Duration::from_millis(2_000),
            sqlx_pool_idle_timeout: Duration::from_secs(300),
            sqlx_pool_max_lifetime: Duration::from_secs(1_800),
            postgres_connection_budget_total: 16,
            edge_enforcement_enabled: false,
            edge_origin_auth_header_name: "x-banji-edge-auth".to_string(),
            edge_origin_auth_secret: None,
            edge_origin_auth_secret_next: None,
            edge_rate_limit_enabled: true,
            edge_rate_limit_window: Duration::from_secs(60),
            edge_rate_limit_public_read_max: 120,
            edge_rate_limit_user_read_max: 240,
            edge_rate_limit_user_write_max: 60,
            edge_rate_limit_device_read_max: 120,
            edge_rate_limit_device_write_max: 30,
            edge_rate_limit_fallback_max_keys: 1_000,
            edge_rate_limit_key_ttl: Duration::from_secs(300),
            edge_rate_limit_redis_prefix: "rate-limit".to_string(),
            edge_rate_limit_failover_enabled: true,
            edge_backpressure_enabled: true,
            edge_backpressure_poll_interval: Duration::from_millis(1_000),
            edge_backpressure_retry_after_seconds: 5,
            edge_backpressure_consecutive_unhealthy: 2,
            edge_backpressure_consecutive_healthy: 2,
            edge_backpressure_job_outbox_pending_max: 1_000,
            edge_backpressure_job_outbox_oldest_age_seconds_max: 30,
            edge_backpressure_job_run_pending_max: 2_000,
            edge_backpressure_job_run_oldest_age_seconds_max: 60,
            edge_backpressure_kafka_pending_max: 500,
            edge_backpressure_kafka_oldest_age_seconds_max: 30,
            observability_rabbit_queue_poll_interval: Duration::from_secs(15),
            observability_postgres_lock_poll_interval: Duration::from_secs(15),
            observability_job_pressure_poll_interval: Duration::from_secs(15),
            edge_request_max_bytes: 262_144,
            edge_write_request_max_bytes: 65_536,
            edge_cors_allowed_origins: vec![],
            edge_trust_forwarded_client_ip: false,
        }
    }

    fn test_state() -> AppState {
        let config = test_config();
        AppState {
            db: None,
            cache: Arc::new(NoopCacheClient),
            cache_runtime_enabled: false,
            jwt_verifier: None,
            key_builder: KeyBuilder::new(
                config.system.clone(),
                config.env.clone(),
                config.service.clone(),
                config.cache_schema_version.clone(),
            ),
            singleflight: Arc::new(Mutex::new(HashMap::new())),
            rate_limiter: Arc::new(edge::rate_limit::SharedRateLimiter::new(&config, None)),
            backpressure_gate: Arc::new(edge::backpressure::BackpressureGate::new(&config)),
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
