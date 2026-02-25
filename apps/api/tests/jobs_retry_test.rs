use banji_api::{
    config::AppConfig,
    jobs::{
        retry::{classify_error, next_destination},
        types::{ErrorClass, ErrorReasonCode},
    },
};
use std::time::Duration;

fn test_cfg() -> AppConfig {
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
        rabbit_replay_prefetch_fast: 2,
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
    }
}

#[test]
fn permanent_errors_go_to_dlq_immediately() {
    let cfg = test_cfg();
    let d = next_destination(&cfg, "banji-core.test.fast-jobs", 1, ErrorClass::Permanent);
    assert!(d.dead_letter);
    assert_eq!(d.destination_queue, "banji-core.test.fast-jobs.dlq");
}

#[test]
fn transient_errors_follow_retry_ladder() {
    let cfg = test_cfg();
    let d1 = next_destination(&cfg, "banji-core.test.fast-jobs", 1, ErrorClass::Transient);
    assert_eq!(d1.destination_queue, "banji-core.test.fast-jobs.retry.1");
    assert_eq!(d1.next_attempt, 2);

    let d2 = next_destination(&cfg, "banji-core.test.fast-jobs", 2, ErrorClass::Transient);
    assert_eq!(d2.destination_queue, "banji-core.test.fast-jobs.retry.2");

    let d3 = next_destination(&cfg, "banji-core.test.fast-jobs", 3, ErrorClass::Transient);
    assert_eq!(d3.destination_queue, "banji-core.test.fast-jobs.retry.3");

    let d4 = next_destination(&cfg, "banji-core.test.fast-jobs", 4, ErrorClass::Transient);
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
        let decision = next_destination(
            &cfg,
            "banji-core.test.heavy-jobs",
            attempt,
            ErrorClass::Transient,
        );
        attempt = decision.next_attempt;

        if decision.dead_letter {
            assert_eq!(decision.destination_queue, "banji-core.test.heavy-jobs.dlq");
            assert_eq!(attempt, cfg.rabbit_max_attempts);
            break;
        }

        assert!(attempt <= cfg.rabbit_max_attempts);
        assert!(safety_counter <= (cfg.rabbit_max_attempts as usize + 2));
    }
}
