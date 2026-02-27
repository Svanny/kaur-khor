use banji_api::{
    config::{AppConfig, EdgeProvider},
    jobs::{
        retry::{classify_error, next_destination},
        types::{ErrorClass, ErrorReasonCode, WorkloadClass},
    },
};
use std::time::Duration;

fn test_cfg() -> AppConfig {
    AppConfig {
        app_role: banji_api::config::AppRole::Api,
        system: "banji-core".to_string(),
        env: "test".to_string(),
        service: "api".to_string(),
        auth_enabled: false,
        auth_jwks_url: None,
        auth_issuer: None,
        auth_audience: None,
        auth_jwks_cache_ttl: Duration::from_secs(300),
        auth_jwks_timeout: Duration::from_millis(1000),
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
        rabbit_dlx_exchange: "banji-core.test.jobs.dlx".to_string(),
        rabbit_retry_1_ttl_ms: 30_000,
        rabbit_retry_2_ttl_ms: 300_000,
        rabbit_retry_3_ttl_ms: 1_800_000,
        rabbit_prefetch_fast: 20,
        rabbit_prefetch_heavy: 2,
        rabbit_replay_prefetch_fast: 5,
        rabbit_replay_prefetch_heavy: 1,
        rabbit_max_attempts: 4,
        redis_url: None,
        database_runtime_url: None,
        database_runtime_endpoint_kind: banji_api::config::DatabaseRuntimeEndpointKind::Direct,
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
        edge_rate_limit_read_max: 120,
        edge_rate_limit_write_max: 30,
        edge_rate_limit_max_keys: 1_000,
        edge_rate_limit_key_ttl: Duration::from_secs(300),
        edge_request_max_bytes: 262_144,
        edge_write_request_max_bytes: 65_536,
        edge_cors_allowed_origins: vec![],
        edge_trust_cf_connecting_ip: false,
    }
}

#[test]
fn permanent_errors_go_to_dlq_immediately() {
    let cfg = test_cfg();
    let d = next_destination(&cfg, &WorkloadClass::Fast, 1, ErrorClass::Permanent);
    assert!(d.dead_letter);
    assert_eq!(d.destination_routing_key, "job.fast.dlq");
}

#[test]
fn transient_errors_follow_retry_ladder() {
    let cfg = test_cfg();
    let d1 = next_destination(&cfg, &WorkloadClass::Fast, 1, ErrorClass::Transient);
    assert_eq!(d1.destination_routing_key, "job.fast.retry.1");
    assert_eq!(d1.next_attempt, 2);

    let d2 = next_destination(&cfg, &WorkloadClass::Fast, 2, ErrorClass::Transient);
    assert_eq!(d2.destination_routing_key, "job.fast.retry.2");

    let d3 = next_destination(&cfg, &WorkloadClass::Fast, 3, ErrorClass::Transient);
    assert_eq!(d3.destination_routing_key, "job.fast.retry.3");

    let d4 = next_destination(&cfg, &WorkloadClass::Fast, 4, ErrorClass::Transient);
    assert!(d4.dead_letter);
}

#[test]
fn error_classifier_detects_permanent_patterns() {
    let c1 = classify_error("validation failed for schema");
    assert_eq!(c1.class, ErrorClass::Permanent);
    assert_eq!(c1.reason, ErrorReasonCode::SchemaInvalid);

    let c2 = classify_error("missing required field");
    assert_eq!(c2.class, ErrorClass::Permanent);
    assert_eq!(c2.reason, ErrorReasonCode::MissingRequiredRef);

    let c3 = classify_error("network timeout");
    assert_eq!(c3.class, ErrorClass::Transient);
    assert_eq!(c3.reason, ErrorReasonCode::DependencyTimeout);
}

#[test]
fn transient_retry_never_treadmills_past_dlq_ceiling() {
    let cfg = test_cfg();
    let mut attempt = 1u8;
    let mut safety_counter = 0usize;

    loop {
        safety_counter += 1;
        let decision =
            next_destination(&cfg, &WorkloadClass::Heavy, attempt, ErrorClass::Transient);
        attempt = decision.next_attempt;

        if decision.dead_letter {
            assert_eq!(decision.destination_routing_key, "job.heavy.dlq");
            assert_eq!(attempt, cfg.rabbit_max_attempts);
            break;
        }

        assert!(attempt <= cfg.rabbit_max_attempts);
        assert!(safety_counter <= (cfg.rabbit_max_attempts as usize + 2));
    }
}
