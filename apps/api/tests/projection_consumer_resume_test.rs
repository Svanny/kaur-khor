use banji_api::events::{
    consumer::{get_checkpoint, poll_and_decode_stream_in_range, set_checkpoint_tx},
    key::derive_publish_key,
    schema_types::InvalidEventPolicy,
};
use banji_api::projections::inventory::apply_inventory_projection_batch_tx;
use std::env;

async fn seed_inventory_event(pool: &sqlx::PgPool, suffix: &str) -> i64 {
    let owner_sub = format!("projection-user-{suffix}");
    let item_id = format!("item-{suffix}");
    let causation_id = format!("projection-causation-{suffix}");
    let publish_key = derive_publish_key(
        "api",
        "inventory.item.created",
        "item",
        &item_id,
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
          jsonb_build_object(
            'owner_sub', $6,
            'item_id', $2,
            'sku', $7,
            'name', $8,
            'quantity', 3
          ),
          '{}'::jsonb
        )
        RETURNING id
        "#,
    )
    .bind(&publish_key)
    .bind(&item_id)
    .bind(format!("idem-{suffix}"))
    .bind(format!("corr-{suffix}"))
    .bind(&causation_id)
    .bind(&owner_sub)
    .bind(format!("SKU-{suffix}"))
    .bind(format!("Item {suffix}"))
    .fetch_one(pool)
    .await
    .unwrap()
}

#[tokio::test]
async fn projector_applies_event_and_resumes_from_checkpoint() {
    let Some(db_url) = env::var("DATABASE_RUNTIME_URL").ok() else {
        eprintln!("Skipping test: DATABASE_RUNTIME_URL not set");
        return;
    };

    let pool = sqlx::PgPool::connect(&db_url).await.unwrap();
    sqlx::migrate!("./migrations").run(&pool).await.unwrap();

    let suffix = &uuid::Uuid::new_v4().to_string()[..8];
    let service_name = "projection-consumer";
    let consumer_name = format!("inventory-projector-{suffix}");
    let stream_name = "banji-core.test.inventory-updated";
    let owner_sub = format!("projection-user-{suffix}");
    let item_id = format!("item-{suffix}");
    let event_id = seed_inventory_event(&pool, suffix).await;

    sqlx::query("DELETE FROM app.inventory_item_projection WHERE owner_sub = $1 AND item_id = $2")
        .bind(&owner_sub)
        .bind(&item_id)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query(
        "DELETE FROM app.event_consumer_checkpoint WHERE service_name = $1 AND consumer_name = $2 AND stream_name = $3",
    )
    .bind(service_name)
    .bind(&consumer_name)
    .bind(stream_name)
    .execute(&pool)
    .await
    .unwrap();

    let batch = poll_and_decode_stream_in_range(
        &pool,
        service_name,
        &consumer_name,
        stream_name,
        event_id - 1,
        Some(event_id),
        100,
        InvalidEventPolicy::Halt,
    )
    .await
    .unwrap();
    assert_eq!(batch.events.len(), 1);

    let mut tx = pool.begin().await.unwrap();
    let apply = apply_inventory_projection_batch_tx(&mut tx, &batch.events)
        .await
        .unwrap();
    set_checkpoint_tx(&mut tx, service_name, &consumer_name, stream_name, event_id)
        .await
        .unwrap();
    tx.commit().await.unwrap();

    assert_eq!(apply.applied_count, 1);
    assert_eq!(
        get_checkpoint(&pool, service_name, &consumer_name, stream_name)
            .await
            .unwrap(),
        event_id
    );

    let projected: (String, String, i64) = sqlx::query_as(
        "SELECT owner_sub, item_id, source_event_id FROM app.inventory_item_projection WHERE owner_sub = $1 AND item_id = $2",
    )
    .bind(&owner_sub)
    .bind(&item_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(projected.0, owner_sub);
    assert_eq!(projected.1, item_id);
    assert_eq!(projected.2, event_id);

    let second_batch = poll_and_decode_stream_in_range(
        &pool,
        service_name,
        &consumer_name,
        stream_name,
        event_id,
        Some(event_id),
        100,
        InvalidEventPolicy::Halt,
    )
    .await
    .unwrap();
    assert!(second_batch.events.is_empty());
}

#[tokio::test]
async fn projection_and_checkpoint_rollback_leave_no_partial_progress() {
    let Some(db_url) = env::var("DATABASE_RUNTIME_URL").ok() else {
        eprintln!("Skipping test: DATABASE_RUNTIME_URL not set");
        return;
    };

    let pool = sqlx::PgPool::connect(&db_url).await.unwrap();
    sqlx::migrate!("./migrations").run(&pool).await.unwrap();

    let suffix = &uuid::Uuid::new_v4().to_string()[..8];
    let service_name = "projection-consumer";
    let consumer_name = format!("inventory-projector-{suffix}");
    let stream_name = "banji-core.test.inventory-updated";
    let owner_sub = format!("projection-user-{suffix}");
    let item_id = format!("item-{suffix}");
    let event_id = seed_inventory_event(&pool, suffix).await;

    sqlx::query("DELETE FROM app.inventory_item_projection WHERE owner_sub = $1 AND item_id = $2")
        .bind(&owner_sub)
        .bind(&item_id)
        .execute(&pool)
        .await
        .unwrap();
    sqlx::query(
        "DELETE FROM app.event_consumer_checkpoint WHERE service_name = $1 AND consumer_name = $2 AND stream_name = $3",
    )
    .bind(service_name)
    .bind(&consumer_name)
    .bind(stream_name)
    .execute(&pool)
    .await
    .unwrap();

    let batch = poll_and_decode_stream_in_range(
        &pool,
        service_name,
        &consumer_name,
        stream_name,
        event_id - 1,
        Some(event_id),
        100,
        InvalidEventPolicy::Halt,
    )
    .await
    .unwrap();

    let mut tx = pool.begin().await.unwrap();
    apply_inventory_projection_batch_tx(&mut tx, &batch.events)
        .await
        .unwrap();
    set_checkpoint_tx(&mut tx, service_name, &consumer_name, stream_name, event_id)
        .await
        .unwrap();
    tx.rollback().await.unwrap();

    let projection_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM app.inventory_item_projection WHERE owner_sub = $1 AND item_id = $2",
    )
    .bind(&owner_sub)
    .bind(&item_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(projection_count, 0);
    assert_eq!(
        get_checkpoint(&pool, service_name, &consumer_name, stream_name)
            .await
            .unwrap(),
        0
    );
}

#[tokio::test]
async fn reapplying_same_event_batch_is_idempotent() {
    let Some(db_url) = env::var("DATABASE_RUNTIME_URL").ok() else {
        eprintln!("Skipping test: DATABASE_RUNTIME_URL not set");
        return;
    };

    let pool = sqlx::PgPool::connect(&db_url).await.unwrap();
    sqlx::migrate!("./migrations").run(&pool).await.unwrap();

    let suffix = &uuid::Uuid::new_v4().to_string()[..8];
    let service_name = "projection-consumer";
    let consumer_name = format!("inventory-projector-{suffix}");
    let stream_name = "banji-core.test.inventory-updated";
    let owner_sub = format!("projection-user-{suffix}");
    let item_id = format!("item-{suffix}");
    let event_id = seed_inventory_event(&pool, suffix).await;

    sqlx::query("DELETE FROM app.inventory_item_projection WHERE owner_sub = $1 AND item_id = $2")
        .bind(&owner_sub)
        .bind(&item_id)
        .execute(&pool)
        .await
        .unwrap();

    let batch = poll_and_decode_stream_in_range(
        &pool,
        service_name,
        &consumer_name,
        stream_name,
        event_id - 1,
        Some(event_id),
        100,
        InvalidEventPolicy::Halt,
    )
    .await
    .unwrap();

    for _ in 0..2 {
        let mut tx = pool.begin().await.unwrap();
        apply_inventory_projection_batch_tx(&mut tx, &batch.events)
            .await
            .unwrap();
        tx.commit().await.unwrap();
    }

    let (source_event_id, quantity): (i64, i32) = sqlx::query_as(
        "SELECT source_event_id, quantity FROM app.inventory_item_projection WHERE owner_sub = $1 AND item_id = $2",
    )
    .bind(&owner_sub)
    .bind(&item_id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(source_event_id, event_id);
    assert_eq!(quantity, 3);
}
