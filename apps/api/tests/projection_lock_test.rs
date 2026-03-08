use banji_api::events::consumer::{acquire_consumer_lock, consumer_lock_already_held};
use std::env;

#[tokio::test]
async fn projection_consumer_lock_allows_only_one_active_holder() {
    let Some(db_url) = env::var("DATABASE_RUNTIME_URL").ok() else {
        eprintln!("Skipping test: DATABASE_RUNTIME_URL not set");
        return;
    };

    let service_name = "projection-consumer";
    let consumer_name = format!(
        "inventory-projector-{}",
        &uuid::Uuid::new_v4().to_string()[..8]
    );
    let stream_name = "banji-core.test.inventory-updated";

    let first = acquire_consumer_lock(&db_url, service_name, &consumer_name, stream_name)
        .await
        .unwrap();
    let second = acquire_consumer_lock(&db_url, service_name, &consumer_name, stream_name).await;

    let error = second.expect_err("second lock acquisition should fail");
    let lock_held = consumer_lock_already_held(&error)
        .expect("lock contention should be classified as ConsumerLockAlreadyHeld");
    assert_eq!(lock_held.service_name, service_name);
    assert_eq!(lock_held.consumer_name, consumer_name);
    assert_eq!(lock_held.stream_name, stream_name);

    first.release().await.unwrap();
}
