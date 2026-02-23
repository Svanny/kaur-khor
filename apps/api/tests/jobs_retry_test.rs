use banji_api::{
    config::AppConfig,
    jobs::{
        retry::{classify_error, next_destination},
        types::ErrorClass,
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
        rabbit_max_attempts: 4,
        redis_url: None,
        database_runtime_url: None,
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
    assert_eq!(
        classify_error("validation failed for schema"),
        ErrorClass::Permanent
    );
    assert_eq!(
        classify_error("missing required field"),
        ErrorClass::Permanent
    );
    assert_eq!(classify_error("network timeout"), ErrorClass::Transient);
}
