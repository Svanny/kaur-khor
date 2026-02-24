use banji_api::events::model::EventRecord;
use banji_api::events::publisher::validate_event_payload_contract;

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

#[test]
fn event_payload_contract_rejects_sensitive_fields() {
    let payload = serde_json::json!({
        "operation": "update",
        "api_key": "should-not-be-here"
    });
    let metadata = serde_json::json!({});
    let result = validate_event_payload_contract(&payload, &metadata);
    assert!(result.is_err());
}

#[test]
fn event_payload_contract_rejects_credential_bearing_urls() {
    let creds = ["user", "secret"].join(":");
    let callback_url = format!("https://{creds}@example.com/hook");

    let payload = serde_json::json!({
        "callback_url": callback_url
    });
    let metadata = serde_json::json!({});
    let result = validate_event_payload_contract(&payload, &metadata);
    assert!(result.is_err());
}
