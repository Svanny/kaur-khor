use super::types::ItemRecord;
use anyhow::Result;
use sqlx::{PgPool, Postgres, Row, Transaction};

pub async fn insert_tx(
    tx: &mut Transaction<'_, Postgres>,
    owner_sub: &str,
    item_id: &str,
    sku: &str,
    name: &str,
    quantity: i64,
) -> Result<ItemRecord> {
    let row = sqlx::query(
        r#"
        INSERT INTO app.inventory_item (
          owner_sub,
          item_id,
          sku,
          name,
          quantity
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING owner_sub, item_id, sku, name, quantity
        "#,
    )
    .bind(owner_sub)
    .bind(item_id)
    .bind(sku)
    .bind(name)
    .bind(quantity)
    .fetch_one(&mut **tx)
    .await?;

    Ok(ItemRecord {
        owner_sub: row.get("owner_sub"),
        item_id: row.get("item_id"),
        sku: row.get("sku"),
        name: row.get("name"),
        quantity: row.get("quantity"),
    })
}

pub async fn get_by_owner_and_id(
    pool: &PgPool,
    owner_sub: &str,
    item_id: &str,
) -> Result<Option<ItemRecord>> {
    let row = sqlx::query(
        r#"
        SELECT owner_sub, item_id, sku, name, quantity
        FROM app.inventory_item
        WHERE owner_sub = $1 AND item_id = $2
        "#,
    )
    .bind(owner_sub)
    .bind(item_id)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|r| ItemRecord {
        owner_sub: r.get("owner_sub"),
        item_id: r.get("item_id"),
        sku: r.get("sku"),
        name: r.get("name"),
        quantity: r.get("quantity"),
    }))
}
