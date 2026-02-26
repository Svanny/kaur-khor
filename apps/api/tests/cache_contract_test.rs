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

#[test]
fn key_builder_encoding_is_collision_safe_for_common_variants() {
    let kb = KeyBuilder::new(
        "banji-core".into(),
        "prod".into(),
        "api".into(),
        "v1".into(),
    );

    let case_a = kb.idempotency_result_key("Caller", "idem");
    let case_b = kb.idempotency_result_key("caller", "idem");
    assert_ne!(case_a, case_b);

    let punct_a = kb.idempotency_result_key("a:b", "idem");
    let punct_b = kb.idempotency_result_key("a-b", "idem");
    assert_ne!(punct_a, punct_b);
}

#[test]
fn inventory_item_key_is_owner_scoped() {
    let kb = KeyBuilder::new(
        "banji-core".into(),
        "prod".into(),
        "api".into(),
        "v1".into(),
    );

    let owner_a = kb.inventory_item_key("user-a", "item-1");
    let owner_b = kb.inventory_item_key("user-b", "item-1");
    assert_ne!(owner_a, owner_b);
    assert!(owner_a.contains(":cache:inventory~3Aitem:user-a:item-1"));
}
