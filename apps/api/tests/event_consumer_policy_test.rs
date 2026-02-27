use banji_api::events::{
    consumer::{get_checkpoint, poll_and_decode_stream},
    key::derive_publish_key,
    schema_types::InvalidEventPolicy,
};
use std::env;

async fn seed_invalid_event(pool: &sqlx::PgPool, suffix: &str) -> i64 {
    let causation_id = format!("consumer-policy-{suffix}");
    let publish_key = derive_publish_key(
        "api",
        "inventory.item.created",
        "item",
        &format!("item-{suffix}"),
        &causation_id,
    );

    sqlx::query("DELETE FROM app.event_log WHERE publish_key = $1")
        .bind(&publish_key)
        .execute(pool)
        .await
        .unwrap();

    sqlx::query_scalar(
        r#"
        INSERT INTO app.event_log (
          publish_key,
          stream_name,
          env_name,
          topic_name,
          event_type,
          event_version,
          aggregate_type,
          aggregate_id,
          producer_service,
          idempotency_key,
          correlation_id,
          causation_id,
          payload,
          metadata
        ) VALUES (
          $1,
          'banji-core.test.inventory-updated',
          'test',
          'inventory-updated',
          'inventory.item.created',
          1,
          'item',
          $2,
          'api',
          $3,
          $4,
          $5,
          '{"owner_sub":"user-1","item_id":"item-x","sku":"SKU-1","name":"Name","quantity":"bad"}'::jsonb,
          '{}'::jsonb
        )
        RETURNING id
        "#,
    )
    .bind(&publish_key)
    .bind(format!("item-{suffix}"))
    .bind(format!("idem-{suffix}"))
    .bind(format!("corr-{suffix}"))
    .bind(causation_id)
    .fetch_one(pool)
    .await
    .unwrap()
}

#[tokio::test]
async fn consumer_halt_policy_sets_error_and_does_not_advance_checkpoint() {
    let Some(db_url) = env::var("DATABASE_RUNTIME_URL").ok() else {
        eprintln!("Skipping test: DATABASE_RUNTIME_URL not set");
        return;
    };

    let pool = sqlx::PgPool::connect(&db_url).await.unwrap();
    sqlx::migrate!("./migrations").run(&pool).await.unwrap();

    let service_name = "projection-consumer";
    let consumer_name = "inventory-projector";
    let stream_name = "banji-core.test.inventory-updated";

    sqlx::query(
        "DELETE FROM app.event_consumer_checkpoint WHERE service_name=$1 AND consumer_name=$2 AND stream_name=$3",
    )
    .bind(service_name)
    .bind(consumer_name)
    .bind(stream_name)
    .execute(&pool)
    .await
    .unwrap();

    let _ = seed_invalid_event(&pool, "halt").await;
    let result = poll_and_decode_stream(
        &pool,
        service_name,
        consumer_name,
        stream_name,
        0,
        100,
        InvalidEventPolicy::Halt,
    )
    .await;
    assert!(result.is_err());

    let checkpoint = get_checkpoint(&pool, service_name, consumer_name, stream_name)
        .await
        .unwrap();
    assert_eq!(checkpoint, 0);

    let last_error: Option<String> = sqlx::query_scalar(
        "SELECT last_error FROM app.event_consumer_checkpoint WHERE service_name=$1 AND consumer_name=$2 AND stream_name=$3",
    )
    .bind(service_name)
    .bind(consumer_name)
    .bind(stream_name)
    .fetch_optional(&pool)
    .await
    .unwrap();
    assert!(last_error
        .unwrap_or_default()
        .contains("PAYLOAD_VALIDATION_FAILED"));
}

#[tokio::test]
async fn consumer_quarantine_policy_records_invalid_rows_and_continues() {
    let Some(db_url) = env::var("DATABASE_RUNTIME_URL").ok() else {
        eprintln!("Skipping test: DATABASE_RUNTIME_URL not set");
        return;
    };

    let pool = sqlx::PgPool::connect(&db_url).await.unwrap();
    sqlx::migrate!("./migrations").run(&pool).await.unwrap();

    let service_name = "projection-consumer";
    let consumer_name = "inventory-projector";
    let stream_name = "banji-core.test.inventory-updated";

    sqlx::query(
        "DELETE FROM app.event_consumer_checkpoint WHERE service_name=$1 AND consumer_name=$2 AND stream_name=$3",
    )
    .bind(service_name)
    .bind(consumer_name)
    .bind(stream_name)
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "DELETE FROM app.event_consumer_quarantine WHERE service_name=$1 AND consumer_name=$2 AND stream_name=$3",
    )
    .bind(service_name)
    .bind(consumer_name)
    .bind(stream_name)
    .execute(&pool)
    .await
    .unwrap();

    let invalid_id = seed_invalid_event(&pool, "quarantine").await;
    let batch = poll_and_decode_stream(
        &pool,
        service_name,
        consumer_name,
        stream_name,
        0,
        100,
        InvalidEventPolicy::Quarantine,
    )
    .await
    .unwrap();

    assert!(batch.events.is_empty());
    assert_eq!(batch.invalid_event_ids, vec![invalid_id]);

    let quarantine_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM app.event_consumer_quarantine WHERE service_name=$1 AND consumer_name=$2 AND stream_name=$3 AND event_id=$4",
    )
    .bind(service_name)
    .bind(consumer_name)
    .bind(stream_name)
    .bind(invalid_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(quarantine_count, 1);
}
