use crate::events::schema_types::{InventoryItemCreatedV1Payload, KnownEvent};
use anyhow::{anyhow, Result};
use sqlx::{Postgres, Transaction};

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct ProjectionBatchStats {
    pub applied_count: usize,
    pub last_applied_event_id: Option<i64>,
}

pub async fn apply_inventory_item_created_tx(
    tx: &mut Transaction<'_, Postgres>,
    event_id: i64,
    payload: &InventoryItemCreatedV1Payload,
) -> Result<()> {
    sqlx::query(
        r#"
        INSERT INTO app.inventory_item_projection (
          owner_sub,
          item_id,
          sku,
          name,
          quantity,
          source_event_id,
          projected_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        ON CONFLICT (owner_sub, item_id)
        DO UPDATE SET
          sku = EXCLUDED.sku,
          name = EXCLUDED.name,
          quantity = EXCLUDED.quantity,
          source_event_id = EXCLUDED.source_event_id,
          updated_at = NOW()
        WHERE EXCLUDED.source_event_id > app.inventory_item_projection.source_event_id
        "#,
    )
    .bind(&payload.owner_sub)
    .bind(&payload.item_id)
    .bind(&payload.sku)
    .bind(payload.name.trim())
    .bind(payload.quantity as i32)
    .bind(event_id)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

pub async fn apply_inventory_projection_batch_tx(
    tx: &mut Transaction<'_, Postgres>,
    events: &[(i64, KnownEvent)],
) -> Result<ProjectionBatchStats> {
    let mut stats = ProjectionBatchStats::default();

    for (event_id, event) in events {
        match event {
            KnownEvent::InventoryItemCreatedV1(payload) => {
                apply_inventory_item_created_tx(tx, *event_id, payload).await?;
                stats.applied_count += 1;
                stats.last_applied_event_id = Some(*event_id);
            }
            other => {
                return Err(anyhow!(
                    "inventory projector received unsupported event on configured stream: {:?}",
                    other
                ));
            }
        }
    }

    Ok(stats)
}

pub async fn truncate_inventory_projection_tx(tx: &mut Transaction<'_, Postgres>) -> Result<()> {
    sqlx::query("TRUNCATE TABLE app.inventory_item_projection")
        .execute(&mut **tx)
        .await?;
    Ok(())
}
