use banji_api::events::model::EventRecord;
use banji_api::events::outbox;
use banji_api::events::publisher::validate_event_payload_contract;
use std::env;

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
        "idem-1".to_string(),
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

#[tokio::test]
async fn event_outbox_rejects_payload_drift_for_same_publish_key() {
    let Some(db_url) = env::var("DATABASE_RUNTIME_URL").ok() else {
        eprintln!("Skipping test: DATABASE_RUNTIME_URL not set");
        return;
    };

    let pool = sqlx::PgPool::connect(&db_url).await.unwrap();
    sqlx::migrate!("./migrations").run(&pool).await.unwrap();

    let causation_id = format!("evt-drift-{}", uuid::Uuid::new_v4());
    let event = EventRecord::new(
        "banji-core.test.inventory-updated".to_string(),
        "inventory.item.created".to_string(),
        1,
        "item".to_string(),
        "item-1".to_string(),
        "api".to_string(),
        Some(causation_id.clone()),
        Some("corr-1".to_string()),
        causation_id.clone(),
        serde_json::json!({"value":"a"}),
        serde_json::json!({"m":"1"}),
    );

    sqlx::query("DELETE FROM app.event_outbox WHERE publish_key = $1")
        .bind(&event.publish_key)
        .execute(&pool)
        .await
        .unwrap();

    let mut tx = pool.begin().await.unwrap();
    let _ = outbox::enqueue_tx(&mut tx, &event).await.unwrap();
    tx.commit().await.unwrap();

    let drifted = EventRecord {
        payload: serde_json::json!({"value":"b"}),
        ..event.clone()
    };

    let mut tx2 = pool.begin().await.unwrap();
    let err = outbox::enqueue_tx(&mut tx2, &drifted).await.unwrap_err();
    tx2.rollback().await.unwrap();
    assert!(err
        .to_string()
        .contains("publish_key conflict with mismatched"));

    sqlx::query("DELETE FROM app.event_outbox WHERE publish_key = $1")
        .bind(&event.publish_key)
        .execute(&pool)
        .await
        .unwrap();
}
