use async_trait::async_trait;
use axum::{extract::State, routing::get, Json, Router};
use banji_api::{
    app_with_state,
    auth::JwtVerifier,
    cache::{CacheClient, KeyBuilder, LockHandle},
    config::{AppConfig, DatabaseRuntimeEndpointKind, EdgeProvider},
    AppState,
};
use base64::Engine;
use reqwest::StatusCode;
use rsa::{
    pkcs1v15,
    signature::{SignatureEncoding, Signer},
    traits::PublicKeyParts,
    RsaPrivateKey,
};
use serde_json::json;
use std::{
    collections::HashMap,
    env,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tokio::sync::{Mutex, RwLock};

#[derive(Clone)]
struct MockJwksState {
    doc: Arc<RwLock<serde_json::Value>>,
    fail: Arc<AtomicBool>,
}

async fn jwks_handler(State(state): State<MockJwksState>) -> (StatusCode, Json<serde_json::Value>) {
    if state.fail.load(Ordering::Relaxed) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error":"forced failure"})),
        );
    }
    (StatusCode::OK, Json(state.doc.read().await.clone()))
}

struct RunningJwksServer {
    base_url: String,
    doc: Arc<RwLock<serde_json::Value>>,
    fail: Arc<AtomicBool>,
}

async fn start_jwks_server(initial_doc: serde_json::Value) -> RunningJwksServer {
    let doc = Arc::new(RwLock::new(initial_doc));
    let fail = Arc::new(AtomicBool::new(false));
    let state = MockJwksState {
        doc: doc.clone(),
        fail: fail.clone(),
    };
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move {
        let app = Router::new()
            .route("/jwks", get(jwks_handler))
            .with_state(state);
        axum::serve(listener, app).await.unwrap();
    });
    RunningJwksServer {
        base_url: format!("http://{addr}"),
        doc,
        fail,
    }
}

#[derive(Default)]
struct MemoryCache {
    values: Mutex<HashMap<String, String>>,
}

#[async_trait]
impl CacheClient for MemoryCache {
    async fn get_string(&self, key: &str) -> anyhow::Result<Option<String>> {
        Ok(self.values.lock().await.get(key).cloned())
    }

    async fn set_string(&self, key: &str, value: &str, _ttl: Duration) -> anyhow::Result<()> {
        self.values
            .lock()
            .await
            .insert(key.to_string(), value.to_string());
        Ok(())
    }

    async fn acquire_lock(&self, _key: &str, _ttl: Duration) -> anyhow::Result<Option<LockHandle>> {
        Ok(None)
    }

    async fn release_lock(&self, _lock: &LockHandle) -> anyhow::Result<bool> {
        Ok(false)
    }
}

fn build_jwt(
    sub: &str,
    kid: &str,
    private_key: &RsaPrivateKey,
    issuer: &str,
    audience: &str,
) -> String {
    let header = json!({
      "alg":"RS256",
      "typ":"JWT",
      "kid": kid,
    });
    let payload = json!({
      "sub": sub,
      "iss": issuer,
      "aud": [audience],
      "exp": (SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() + 3600) as i64
    });
    let header_b64 = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .encode(serde_json::to_vec(&header).unwrap());
    let payload_b64 = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .encode(serde_json::to_vec(&payload).unwrap());
    let signing_input = format!("{header_b64}.{payload_b64}");
    let signing_key = pkcs1v15::SigningKey::<sha2::Sha256>::new(private_key.clone());
    let signature = signing_key.sign(signing_input.as_bytes());
    let signature_b64 =
        base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(signature.to_bytes());
    format!("{signing_input}.{signature_b64}")
}

fn jwk_for(kid: &str, private_key: &RsaPrivateKey) -> serde_json::Value {
    let public_key = private_key.to_public_key();
    let n = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(public_key.n().to_bytes_be());
    let e = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(public_key.e().to_bytes_be());
    json!({
      "kty":"RSA",
      "use":"sig",
      "alg":"RS256",
      "kid": kid,
      "n": n,
      "e": e
    })
}

fn test_config(db_url: String, jwks_url: String) -> AppConfig {
    AppConfig {
        app_role: banji_api::config::AppRole::Api,
        system: "banji-core".to_string(),
        env: "test".to_string(),
        service: "api".to_string(),
        auth_enabled: true,
        auth_jwks_url: Some(jwks_url),
        auth_issuer: Some("https://issuer.example/".to_string()),
        auth_audience: Some("banji-api".to_string()),
        auth_jwks_cache_ttl: Duration::from_secs(2),
        auth_jwks_timeout: Duration::from_millis(500),
        auth_clock_skew: Duration::from_secs(30),
        idempotency_retention_days: 30,
        cache_enabled: true,
        cache_schema_version: "v1".to_string(),
        cache_default_ttl: Duration::from_secs(300),
        cache_ttl_jitter: Duration::from_secs(30),
        redis_connect_timeout: Duration::from_millis(100),
        redis_command_timeout: Duration::from_millis(50),
        redis_circuit_error_threshold: 20,
        redis_circuit_window: Duration::from_secs(30),
        redis_circuit_cooldown: Duration::from_secs(60),
        redis_log_rate_limit: Duration::from_secs(30),
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
        rabbit_dlx_exchange: "banji-core.test.jobs.dlx".to_string(),
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
        database_runtime_url: Some(db_url),
        database_runtime_endpoint_kind: DatabaseRuntimeEndpointKind::Direct,
        pgbouncer_pool_mode: None,
        sqlx_pool_max_connections: 10,
        sqlx_pool_min_connections: 1,
        sqlx_pool_acquire_timeout: Duration::from_millis(2_000),
        sqlx_pool_connect_timeout: Duration::from_millis(2_000),
        sqlx_pool_idle_timeout: Duration::from_secs(300),
        sqlx_pool_max_lifetime: Duration::from_secs(1_800),
        postgres_connection_budget_total: 80,
        edge_enforcement_enabled: false,
        edge_provider: EdgeProvider::None,
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
        edge_request_max_bytes: 262_144,
        edge_write_request_max_bytes: 65_536,
        edge_cors_allowed_origins: vec![],
        edge_trust_cf_connecting_ip: false,
    }
}

async fn launch_api(
    cfg: AppConfig,
    pool: sqlx::PgPool,
    cache: Arc<dyn CacheClient>,
) -> std::net::SocketAddr {
    let jwt_verifier = Arc::new(
        JwtVerifier::new(
            cfg.auth_jwks_url.clone().unwrap(),
            cfg.auth_issuer.clone().unwrap(),
            cfg.auth_audience.clone().unwrap(),
            cfg.auth_jwks_cache_ttl,
            cfg.auth_jwks_timeout,
            cfg.auth_clock_skew,
        )
        .unwrap(),
    );
    let state = AppState {
        config: cfg.clone(),
        db: Some(pool),
        cache,
        jwt_verifier: Some(jwt_verifier),
        key_builder: KeyBuilder::new(
            cfg.system.clone(),
            cfg.env.clone(),
            cfg.service.clone(),
            cfg.cache_schema_version.clone(),
        ),
        singleflight: Arc::new(Mutex::new(HashMap::new())),
        rate_limiter: Arc::new(banji_api::edge::rate_limit::SharedRateLimiter::new(&cfg, None)),
        backpressure_gate: Arc::new(banji_api::edge::backpressure::BackpressureGate::new(&cfg)),
    };

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move {
        axum::serve(listener, app_with_state(state)).await.unwrap();
    });
    addr
}

#[tokio::test]
async fn create_read_replay_is_owner_scoped_and_idempotent() {
    let Some(db_url) = env::var("DATABASE_RUNTIME_URL").ok() else {
        eprintln!("Skipping test: DATABASE_RUNTIME_URL not set");
        return;
    };
    let pool = sqlx::PgPool::connect(&db_url).await.unwrap();
    sqlx::migrate!("./migrations").run(&pool).await.unwrap();
    sqlx::query("DELETE FROM app.inventory_item")
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query("DELETE FROM app.idempotency_request")
        .execute(&pool)
        .await
        .unwrap();

    let mut rng = rsa::rand_core::OsRng;
    let key_a = RsaPrivateKey::new(&mut rng, 2048).unwrap();
    let key_b = RsaPrivateKey::new(&mut rng, 2048).unwrap();
    let jwks_server = start_jwks_server(json!({"keys":[jwk_for("k1", &key_a)]})).await;

    let cfg = test_config(db_url.clone(), format!("{}/jwks", jwks_server.base_url));
    let addr = launch_api(cfg.clone(), pool.clone(), Arc::new(MemoryCache::default())).await;

    let token_a = build_jwt(
        "user-a",
        "k1",
        &key_a,
        "https://issuer.example/",
        "banji-api",
    );
    let token_b = build_jwt(
        "user-b",
        "k1",
        &key_a,
        "https://issuer.example/",
        "banji-api",
    );
    let client = reqwest::Client::new();

    let body = json!({
      "item_id":"item-shared",
      "sku":"SKU-100",
      "name":"  Item Shared  ",
      "quantity":5
    });
    let create = client
        .post(format!("http://{addr}/v1/items"))
        .header("authorization", format!("Bearer {token_a}"))
        .header("idempotency-key", "idem-item-a-1")
        .json(&body)
        .send()
        .await
        .unwrap();
    assert_eq!(create.status(), StatusCode::CREATED);

    let replay = client
        .post(format!("http://{addr}/v1/items"))
        .header("authorization", format!("Bearer {token_a}"))
        .header("idempotency-key", "idem-item-a-1")
        .json(&body)
        .send()
        .await
        .unwrap();
    assert_eq!(replay.status(), StatusCode::CREATED);
    assert_eq!(
        replay
            .headers()
            .get("x-idempotency-replayed")
            .and_then(|h| h.to_str().ok()),
        Some("true")
    );

    let body_b = json!({
      "item_id":"item-shared",
      "sku":"SKU-100",
      "name":"Item Shared B",
      "quantity":9
    });
    let create_b = client
        .post(format!("http://{addr}/v1/items"))
        .header("authorization", format!("Bearer {token_b}"))
        .header("idempotency-key", "idem-item-b-1")
        .json(&body_b)
        .send()
        .await
        .unwrap();
    assert_eq!(create_b.status(), StatusCode::CREATED);

    let a_get = client
        .get(format!("http://{addr}/v1/items/item-shared"))
        .header("authorization", format!("Bearer {token_a}"))
        .send()
        .await
        .unwrap();
    assert_eq!(a_get.status(), StatusCode::OK);
    let a_json: serde_json::Value = a_get.json().await.unwrap();
    assert_eq!(a_json["item"]["owner_sub"], "user-a");

    let b_get = client
        .get(format!("http://{addr}/v1/items/item-shared"))
        .header("authorization", format!("Bearer {token_b}"))
        .send()
        .await
        .unwrap();
    assert_eq!(b_get.status(), StatusCode::OK);
    let b_json: serde_json::Value = b_get.json().await.unwrap();
    assert_eq!(b_json["item"]["owner_sub"], "user-b");

    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM app.inventory_item WHERE owner_sub = $1 AND item_id = $2",
    )
    .bind("user-a")
    .bind("item-shared")
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(count, 1);

    let outbox_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM app.event_outbox WHERE producer_service = $1 AND idempotency_key = $2",
    )
    .bind("api")
    .bind("idem-item-a-1")
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(outbox_count, 1);

    let relay_stats = banji_api::events::relay::relay_once(&pool, &cfg)
        .await
        .unwrap();
    assert!(relay_stats.published >= 1);

    let event_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM app.event_log WHERE producer_service = $1 AND idempotency_key = $2",
    )
    .bind("api")
    .bind("idem-item-a-1")
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(event_count, 1);

    let missing_auth = client
        .post(format!("http://{addr}/v1/items"))
        .header("idempotency-key", "idem-no-auth")
        .json(&body)
        .send()
        .await
        .unwrap();
    assert_eq!(missing_auth.status(), StatusCode::UNAUTHORIZED);

    let item_direct = "item-cache-test";
    sqlx::query(
        "INSERT INTO app.inventory_item (owner_sub, item_id, sku, name, quantity) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
    )
    .bind("user-a")
    .bind(item_direct)
    .bind("SKU-CACHE")
    .bind("Cache Item")
    .bind(1_i32)
    .execute(&pool)
    .await
    .unwrap();

    let read1 = client
        .get(format!("http://{addr}/v1/items/{item_direct}"))
        .header("authorization", format!("Bearer {token_a}"))
        .send()
        .await
        .unwrap();
    assert_eq!(read1.status(), StatusCode::OK);
    assert_eq!(
        read1.headers().get("x-cache").and_then(|h| h.to_str().ok()),
        Some("miss")
    );

    let read2 = client
        .get(format!("http://{addr}/v1/items/{item_direct}"))
        .header("authorization", format!("Bearer {token_a}"))
        .send()
        .await
        .unwrap();
    assert_eq!(read2.status(), StatusCode::OK);
    assert_eq!(
        read2.headers().get("x-cache").and_then(|h| h.to_str().ok()),
        Some("hit")
    );

    *jwks_server.doc.write().await = json!({"keys":[jwk_for("k2", &key_b)]});
    let token_rotated = build_jwt(
        "user-a",
        "k2",
        &key_b,
        "https://issuer.example/",
        "banji-api",
    );
    let rotated = client
        .get(format!("http://{addr}/v1/items/item-shared"))
        .header("authorization", format!("Bearer {token_rotated}"))
        .send()
        .await
        .unwrap();
    assert_eq!(rotated.status(), StatusCode::OK);
}

#[tokio::test]
async fn jwks_unreachable_after_cache_expiry_fails_closed() {
    let mut rng = rsa::rand_core::OsRng;
    let key = RsaPrivateKey::new(&mut rng, 2048).unwrap();
    let jwks_server = start_jwks_server(json!({"keys":[jwk_for("k1", &key)]})).await;
    let verifier = JwtVerifier::new(
        format!("{}/jwks", jwks_server.base_url),
        "https://issuer.example/".to_string(),
        "banji-api".to_string(),
        Duration::from_millis(100),
        Duration::from_millis(500),
        Duration::from_secs(30),
    )
    .unwrap();
    let token = build_jwt("user-a", "k1", &key, "https://issuer.example/", "banji-api");

    verifier.verify_bearer(&token).await.unwrap();
    jwks_server.fail.store(true, Ordering::Relaxed);

    // Cache still valid.
    verifier.verify_bearer(&token).await.unwrap();

    tokio::time::sleep(Duration::from_millis(150)).await;
    let result = verifier.verify_bearer(&token).await;
    assert!(result.is_err());
}
