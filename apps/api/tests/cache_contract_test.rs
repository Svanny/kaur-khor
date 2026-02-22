use banji_api::cache::KeyBuilder;

#[test]
fn key_builder_includes_system_env_service_and_schema_version() {
    let kb = KeyBuilder::new(
        "banji-core".into(),
        "prod".into(),
        "api".into(),
        "v1".into(),
    );

    let key = kb.cache_key("inventory:item", "123");
    assert!(key.starts_with("banji-core:prod:api:v1:cache:"));
}

#[test]
fn idempotency_key_uses_central_prefix() {
    let kb = KeyBuilder::new(
        "banji-core".into(),
        "staging".into(),
        "worker".into(),
        "v2".into(),
    );

    let key = kb.idempotency_result_key("caller-1", "idem-abc");
    assert_eq!(key, "banji-core:staging:worker:v2:idem:caller-1:idem-abc");
}
