use banji_api::{
    backfill::controller,
    config::{
        AppConfig, AppRole, BackfillConfig, BackfillDatabaseKind, BackfillKind, BackfillMode,
        DatabaseRuntimeEndpointKind,
    },
    events::{consumer::get_checkpoint, key::derive_publish_key, schema_types::InvalidEventPolicy},
};
use sqlx::Row;
use std::{env, time::Duration};

fn test_app_config(db_url: String) -> AppConfig {
    AppConfig {
        app_role: AppRole::BackfillController,
        system: "banji-core".to_string(),
        env: "test".to_string(),
        service: "backfill-controller".to_string(),
        instance_id: "backfill-test-1".to_string(),
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
        database_runtime_url: Some(db_url),
        database_runtime_endpoint_kind: DatabaseRuntimeEndpointKind::Direct,
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

async fn seed_inventory_created_event(pool: &sqlx::PgPool, suffix: &str) -> i64 {
    let item_id = format!("item-{suffix}");
    let publish_key = derive_publish_key(
        "api",
        "inventory.item.created",
        "item",
        &item_id,
        &format!("cause-{suffix}"),
    );

    sqlx::query("DELETE FROM app.event_log WHERE publish_key = $1")
        .bind(&publish_key)
        .execute(pool)
        .await
        .unwrap();

    sqlx::query_scalar(
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
        ) VALUES (
          $1,
          'banji-core.test.inventory-updated',
          'test',
          'inventory-updated',
          'inventory.item.created',
          1,
          'item',
          $2,
          'api',
          $3,
          $4,
          $5,
          jsonb_build_object(
            'owner_sub', $6,
            'item_id', $2,
            'sku', $7,
            'name', $8,
            'quantity', 5
          ),
          '{}'::jsonb
        )
        RETURNING id
        "#,
    )
    .bind(&publish_key)
    .bind(&item_id)
    .bind(format!("idem-{suffix}"))
    .bind(format!("corr-{suffix}"))
    .bind(format!("cause-{suffix}"))
    .bind(format!("owner-{suffix}"))
    .bind(format!("SKU-{suffix}"))
    .bind(format!("Item {suffix}"))
    .fetch_one(pool)
    .await
    .unwrap()
}

async fn seed_inventory_projection_row(pool: &sqlx::PgPool, suffix: &str, source_event_id: i64) {
    sqlx::query(
        r#"
        INSERT INTO app.inventory_item_projection (
          owner_sub,
          item_id,
          sku,
          name,
          quantity,
          source_event_id
        ) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (owner_sub, item_id)
        DO UPDATE SET
          sku = EXCLUDED.sku,
          name = EXCLUDED.name,
          quantity = EXCLUDED.quantity,
          source_event_id = EXCLUDED.source_event_id,
          updated_at = NOW()
        "#,
    )
    .bind(format!("stale-owner-{suffix}"))
    .bind(format!("stale-item-{suffix}"))
    .bind(format!("STALE-SKU-{suffix}"))
    .bind(format!("Stale Item {suffix}"))
    .bind(99_i32)
    .bind(source_event_id)
    .execute(pool)
    .await
    .unwrap();
}

async fn set_inventory_projection_checkpoint(
    pool: &sqlx::PgPool,
    service_name: &str,
    consumer_name: &str,
    stream_name: &str,
    last_event_id: i64,
) {
    sqlx::query(
        r#"
        INSERT INTO app.event_consumer_checkpoint (
          service_name,
          consumer_name,
          stream_name,
          last_event_id,
          last_heartbeat_at,
          updated_at,
          last_error
        ) VALUES ($1, $2, $3, $4, NOW(), NOW(), NULL)
        ON CONFLICT (service_name, consumer_name, stream_name)
        DO UPDATE SET
          last_event_id = EXCLUDED.last_event_id,
          last_heartbeat_at = NOW(),
          updated_at = NOW(),
          last_error = NULL
        "#,
    )
    .bind(service_name)
    .bind(consumer_name)
    .bind(stream_name)
    .bind(last_event_id)
    .execute(pool)
    .await
    .unwrap();
}

#[tokio::test]
async fn projection_preview_persists_planned_backfill_run() {
    let Some(db_url) = env::var("DATABASE_RUNTIME_URL").ok() else {
        eprintln!("Skipping test: DATABASE_RUNTIME_URL not set");
        return;
    };

    let pool = sqlx::PgPool::connect(&db_url).await.unwrap();
    sqlx::migrate!("./migrations").run(&pool).await.unwrap();

    let suffix = &uuid::Uuid::new_v4().to_string()[..8];
    let event_id = seed_inventory_created_event(&pool, suffix).await;
    let cfg = BackfillConfig {
        kind: BackfillKind::Projection,
        mode: BackfillMode::Preview,
        stream_name: "banji-core.test.inventory-updated".to_string(),
        batch_size: 100,
        invalid_event_policy: InvalidEventPolicy::Halt,
        database_kind: BackfillDatabaseKind::Primary,
        database_url: db_url.clone(),
        run_id: None,
        operator_id: Some("ops-preview".to_string()),
        reason: Some("preview-projection".to_string()),
        from_event_id: Some(event_id),
        to_event_id: None,
        service_name: "projection-consumer".to_string(),
        consumer_name: "inventory-projector".to_string(),
        reset_checkpoint: false,
        truncate_projection: false,
        job_types: vec![],
        wait_for_workers: true,
        worker_poll_interval: Duration::from_millis(10),
        max_wait: Duration::from_secs(1),
        allow_broker_publish: false,
    };

    controller::run(&pool, &test_app_config(db_url.clone()), &cfg)
        .await
        .unwrap();

    let row = sqlx::query(
        r#"
        SELECT status, run_kind, candidate_event_count, resolved_to_event_id
        FROM app.backfill_run
        WHERE operator_id = 'ops-preview' AND reason = 'preview-projection'
        ORDER BY created_at DESC
        LIMIT 1
        "#,
    )
    .fetch_one(&pool)
    .await
    .unwrap();

    let status: String = row.get("status");
    let run_kind: String = row.get("run_kind");
    let candidate_event_count: i64 = row.get("candidate_event_count");
    let resolved_to_event_id: i64 = row.get("resolved_to_event_id");
    assert_eq!(status, "planned");
    assert_eq!(run_kind, "projection");
    assert!(candidate_event_count >= 1);
    assert!(resolved_to_event_id >= event_id);
}

#[tokio::test]
async fn jobs_apply_schedules_replay_scoped_job_rows() {
    let Some(db_url) = env::var("DATABASE_RUNTIME_URL").ok() else {
        eprintln!("Skipping test: DATABASE_RUNTIME_URL not set");
        return;
    };

    let pool = sqlx::PgPool::connect(&db_url).await.unwrap();
    sqlx::migrate!("./migrations").run(&pool).await.unwrap();

    let suffix = &uuid::Uuid::new_v4().to_string()[..8];
    let event_id = seed_inventory_created_event(&pool, suffix).await;
    let cfg = BackfillConfig {
        kind: BackfillKind::Jobs,
        mode: BackfillMode::Apply,
        stream_name: "banji-core.test.inventory-updated".to_string(),
        batch_size: 100,
        invalid_event_policy: InvalidEventPolicy::Halt,
        database_kind: BackfillDatabaseKind::Primary,
        database_url: db_url.clone(),
        run_id: None,
        operator_id: Some("ops-jobs".to_string()),
        reason: Some("replay-jobs".to_string()),
        from_event_id: Some(event_id),
        to_event_id: Some(event_id),
        service_name: "projection-consumer".to_string(),
        consumer_name: "inventory-projector".to_string(),
        reset_checkpoint: false,
        truncate_projection: false,
        job_types: vec![],
        wait_for_workers: false,
        worker_poll_interval: Duration::from_millis(10),
        max_wait: Duration::from_secs(1),
        allow_broker_publish: true,
    };

    controller::run(&pool, &test_app_config(db_url.clone()), &cfg)
        .await
        .unwrap();

    let run = sqlx::query(
        r#"
        SELECT id, status, enqueued_job_count, finished_at
        FROM app.backfill_run
        WHERE operator_id = 'ops-jobs' AND reason = 'replay-jobs'
        ORDER BY created_at DESC
        LIMIT 1
        "#,
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    let run_id: uuid::Uuid = run.get("id");
    let run_status: String = run.get("status");
    let enqueued_job_count: i64 = run.get("enqueued_job_count");
    let finished_at: Option<time::OffsetDateTime> = run.get("finished_at");
    assert_eq!(run_status, "succeeded");
    assert_eq!(enqueued_job_count, 1);
    assert!(finished_at.is_some());

    let job_run = sqlx::query(
        r#"
        SELECT job_type, source_event_id
        FROM app.job_run
        WHERE backfill_run_id = $1
        "#,
    )
    .bind(run_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    let job_type: String = job_run.get("job_type");
    let source_event_id: i64 = job_run.get("source_event_id");
    assert_eq!(job_type, "item-created");
    assert_eq!(source_event_id, event_id);

    let outbox = sqlx::query(
        r#"
        SELECT delivery_mode, routing_key
        FROM app.job_outbox
        WHERE backfill_run_id = $1
        "#,
    )
    .bind(run_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    let delivery_mode: String = outbox.get("delivery_mode");
    let routing_key: String = outbox.get("routing_key");
    assert_eq!(delivery_mode, "replay");
    assert_eq!(routing_key, "job.fast.replay");
}

#[tokio::test]
async fn projection_apply_fresh_run_executes_checkpoint_reset_and_truncate_setup() {
    let Some(db_url) = env::var("DATABASE_RUNTIME_URL").ok() else {
        eprintln!("Skipping test: DATABASE_RUNTIME_URL not set");
        return;
    };

    let pool = sqlx::PgPool::connect(&db_url).await.unwrap();
    sqlx::migrate!("./migrations").run(&pool).await.unwrap();

    let suffix = &uuid::Uuid::new_v4().to_string()[..8];
    let event_id = seed_inventory_created_event(&pool, suffix).await;
    let service_name = format!("projection-consumer-{suffix}");
    let consumer_name = format!("inventory-projector-{suffix}");
    seed_inventory_projection_row(&pool, suffix, event_id - 1).await;
    set_inventory_projection_checkpoint(
        &pool,
        &service_name,
        &consumer_name,
        "banji-core.test.inventory-updated",
        event_id + 50,
    )
    .await;

    let cfg = BackfillConfig {
        kind: BackfillKind::Projection,
        mode: BackfillMode::Apply,
        stream_name: "banji-core.test.inventory-updated".to_string(),
        batch_size: 100,
        invalid_event_policy: InvalidEventPolicy::Halt,
        database_kind: BackfillDatabaseKind::Primary,
        database_url: db_url.clone(),
        run_id: None,
        operator_id: Some("ops-projection-apply".to_string()),
        reason: Some("projection-setup".to_string()),
        from_event_id: Some(event_id),
        to_event_id: Some(event_id),
        service_name: service_name.clone(),
        consumer_name: consumer_name.clone(),
        reset_checkpoint: true,
        truncate_projection: true,
        job_types: vec![],
        wait_for_workers: true,
        worker_poll_interval: Duration::from_millis(10),
        max_wait: Duration::from_secs(1),
        allow_broker_publish: false,
    };

    controller::run(&pool, &test_app_config(db_url.clone()), &cfg)
        .await
        .unwrap();

    let checkpoint = get_checkpoint(
        &pool,
        &service_name,
        &consumer_name,
        "banji-core.test.inventory-updated",
    )
    .await
    .unwrap();
    assert_eq!(checkpoint, event_id);

    let refreshed = sqlx::query(
        r#"
        SELECT source_event_id
        FROM app.inventory_item_projection
        WHERE owner_sub = $1 AND item_id = $2
        "#,
    )
    .bind(format!("owner-{suffix}"))
    .bind(format!("item-{suffix}"))
    .fetch_one(&pool)
    .await
    .unwrap();
    let source_event_id: i64 = refreshed.get("source_event_id");
    assert_eq!(source_event_id, event_id);

    let stale_exists: bool = sqlx::query_scalar(
        r#"
        SELECT EXISTS (
          SELECT 1
          FROM app.inventory_item_projection
          WHERE owner_sub = $1 AND item_id = $2
        )
        "#,
    )
    .bind(format!("stale-owner-{suffix}"))
    .bind(format!("stale-item-{suffix}"))
    .fetch_one(&pool)
    .await
    .unwrap();
    assert!(!stale_exists);
}

#[tokio::test]
async fn jobs_apply_without_worker_wait_finishes_when_no_jobs_were_enqueued() {
    let Some(db_url) = env::var("DATABASE_RUNTIME_URL").ok() else {
        eprintln!("Skipping test: DATABASE_RUNTIME_URL not set");
        return;
    };

    let pool = sqlx::PgPool::connect(&db_url).await.unwrap();
    sqlx::migrate!("./migrations").run(&pool).await.unwrap();

    let suffix = &uuid::Uuid::new_v4().to_string()[..8];
    let event_id = seed_inventory_created_event(&pool, suffix).await;
    let empty_range_event_id = event_id + 1;
    let cfg = BackfillConfig {
        kind: BackfillKind::Jobs,
        mode: BackfillMode::Apply,
        stream_name: "banji-core.test.inventory-updated".to_string(),
        batch_size: 100,
        invalid_event_policy: InvalidEventPolicy::Halt,
        database_kind: BackfillDatabaseKind::Primary,
        database_url: db_url.clone(),
        run_id: None,
        operator_id: Some("ops-jobs-empty".to_string()),
        reason: Some("replay-jobs-empty".to_string()),
        from_event_id: Some(empty_range_event_id),
        to_event_id: Some(empty_range_event_id),
        service_name: "projection-consumer".to_string(),
        consumer_name: "inventory-projector".to_string(),
        reset_checkpoint: false,
        truncate_projection: false,
        job_types: vec![],
        wait_for_workers: false,
        worker_poll_interval: Duration::from_millis(10),
        max_wait: Duration::from_secs(1),
        allow_broker_publish: true,
    };

    controller::run(&pool, &test_app_config(db_url.clone()), &cfg)
        .await
        .unwrap();

    let run = sqlx::query(
        r#"
        SELECT status, enqueued_job_count, finished_at
        FROM app.backfill_run
        WHERE operator_id = 'ops-jobs-empty' AND reason = 'replay-jobs-empty'
        ORDER BY created_at DESC
        LIMIT 1
        "#,
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    let run_status: String = run.get("status");
    let enqueued_job_count: i64 = run.get("enqueued_job_count");
    let finished_at: Option<time::OffsetDateTime> = run.get("finished_at");
    assert_eq!(run_status, "succeeded");
    assert_eq!(enqueued_job_count, 0);
    assert!(finished_at.is_some());
}

#[tokio::test]
async fn resume_rejects_invalid_event_policy_override() {
    let Some(db_url) = env::var("DATABASE_RUNTIME_URL").ok() else {
        eprintln!("Skipping test: DATABASE_RUNTIME_URL not set");
        return;
    };

    let pool = sqlx::PgPool::connect(&db_url).await.unwrap();
    sqlx::migrate!("./migrations").run(&pool).await.unwrap();

    let suffix = &uuid::Uuid::new_v4().to_string()[..8];
    let event_id = seed_inventory_created_event(&pool, suffix).await;
    let preview_cfg = BackfillConfig {
        kind: BackfillKind::Projection,
        mode: BackfillMode::Preview,
        stream_name: "banji-core.test.inventory-updated".to_string(),
        batch_size: 100,
        invalid_event_policy: InvalidEventPolicy::Quarantine,
        database_kind: BackfillDatabaseKind::Primary,
        database_url: db_url.clone(),
        run_id: None,
        operator_id: Some("ops-policy".to_string()),
        reason: Some("persist-policy".to_string()),
        from_event_id: Some(event_id),
        to_event_id: Some(event_id),
        service_name: "projection-consumer".to_string(),
        consumer_name: "inventory-projector".to_string(),
        reset_checkpoint: false,
        truncate_projection: false,
        job_types: vec![],
        wait_for_workers: true,
        worker_poll_interval: Duration::from_millis(10),
        max_wait: Duration::from_secs(1),
        allow_broker_publish: false,
    };

    controller::run(&pool, &test_app_config(db_url.clone()), &preview_cfg)
        .await
        .unwrap();

    let run_id: uuid::Uuid = sqlx::query_scalar(
        r#"
        SELECT id
        FROM app.backfill_run
        WHERE operator_id = 'ops-policy' AND reason = 'persist-policy'
        ORDER BY created_at DESC
        LIMIT 1
        "#,
    )
    .fetch_one(&pool)
    .await
    .unwrap();

    let apply_cfg = BackfillConfig {
        mode: BackfillMode::Apply,
        run_id: Some(run_id),
        invalid_event_policy: InvalidEventPolicy::Halt,
        operator_id: None,
        reason: None,
        from_event_id: None,
        ..preview_cfg
    };

    unsafe {
        std::env::set_var("BACKFILL_INVALID_EVENT_POLICY", "halt");
    }
    let result = controller::run(&pool, &test_app_config(db_url.clone()), &apply_cfg).await;
    unsafe {
        std::env::remove_var("BACKFILL_INVALID_EVENT_POLICY");
    }

    let err = result.unwrap_err();
    assert!(err
        .to_string()
        .contains("BACKFILL_INVALID_EVENT_POLICY did not match persisted invalid_event_policy"));
}
