use banji_api::events::consumer::acquire_consumer_lock;
use std::env;

#[tokio::test]
async fn projection_consumer_lock_allows_only_one_active_holder() {
    let Some(db_url) = env::var("DATABASE_RUNTIME_URL").ok() else {
        eprintln!("Skipping test: DATABASE_RUNTIME_URL not set");
        return;
    };

    let service_name = "projection-consumer";
    let consumer_name = format!("inventory-projector-{}", &uuid::Uuid::new_v4().to_string()[..8]);
    let stream_name = "banji-core.test.inventory-updated";

    let first = acquire_consumer_lock(&db_url, service_name, &consumer_name, stream_name)
        .await
        .unwrap();
    let second = acquire_consumer_lock(&db_url, service_name, &consumer_name, stream_name).await;

    assert!(second.is_err());
    assert!(second
        .unwrap_err()
        .to_string()
        .contains("consumer lock already held"));

    first.release().await.unwrap();
}
