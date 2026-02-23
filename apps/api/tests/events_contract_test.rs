use banji_api::events::model::EventRecord;

#[test]
fn event_record_splits_env_and_topic_from_stream_name() {
    let event = EventRecord::new(
        "banji-core.prod.inventory-updated".to_string(),
        "inventory.write-demo.completed".to_string(),
        1,
        "write-demo".to_string(),
        "caller-1".to_string(),
        "api".to_string(),
        Some("idem-1".to_string()),
        None,
        None,
        serde_json::json!({"ok":true}),
        serde_json::json!({}),
    );

    assert_eq!(event.env_name, "prod");
    assert_eq!(event.topic_name, "inventory-updated");
}
