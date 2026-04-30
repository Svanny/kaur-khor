use crate::{
    benchmark,
    service::{now_rfc3339, SenaRepository},
    types::{
        SenaAnalysisResult, SenaAnalysisRunRecord, SenaCatalog, SenaCreateOrderBatchPayload,
        SenaDiagnostics, SenaObservationFingerprint, SenaObservationInput, SenaObservationPage,
        SenaObservationPageCursor, SenaObservationPageRequest, SenaObservationRecord,
        SenaOrderBatchRecord, SenaOrderBatchStatus, SenaOrderChildRecord, SenaOrderChildStatus,
        SenaOrderFieldValues, SenaOrderLookupPayload, SenaRecordActivityEntry,
        SenaRecordActivityType, SenaRecordUpdateAnchor, SenaRecordUpdateContext,
        SenaRecordUpdateOpenTickets, SenaRunStatus, SenaServiceDetail, SenaSkuDetail,
        SenaSkuSummary, SenaSplitOrderChildPayload, SenaTicketEvent, SenaTicketFamily,
        SenaTicketLifecycle, SenaTicketSummary, SenaUpdateOrderBatchPayload,
        SenaUpdateOrderChildPayload, SenaWorkspaceSummary,
    },
    PreprocessedWorkspace, SenaAnalysisCheckpoint,
};
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use serde_json::json;
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Instant;
use time::{format_description::parse as parse_time_format, OffsetDateTime};
use uuid::Uuid;

pub struct SqliteSenaRepository {
    connection: Mutex<Connection>,
    store_path: PathBuf,
}

impl SqliteSenaRepository {
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        let store_path = path.as_ref().to_path_buf();
        let connection = Connection::open(&store_path)?;
        let repo = Self {
            connection: Mutex::new(connection),
            store_path,
        };
        repo.migrate()?;
        Ok(repo)
    }

    fn migrate(&self) -> Result<()> {
        let connection = self
            .connection
            .lock()
            .map_err(|_| anyhow!("sqlite lock poisoned"))?;
        let previous_user_version: i64 =
            connection.query_row("PRAGMA user_version", [], |row| row.get(0))?;
        connection.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS sena_catalog (
              owner_sub TEXT PRIMARY KEY,
              payload TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sena_observation (
              observation_id TEXT PRIMARY KEY,
              owner_sub TEXT NOT NULL,
              observed_at TEXT NOT NULL,
              payload TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_sena_observation_owner_observed_at
              ON sena_observation (owner_sub, observed_at);
            CREATE INDEX IF NOT EXISTS idx_sena_observation_owner_latest
              ON sena_observation (owner_sub, observed_at DESC, observation_id DESC);
            CREATE TABLE IF NOT EXISTS sena_order_batch (
              batch_order_id TEXT PRIMARY KEY,
              owner_sub TEXT NOT NULL,
              supplier_name TEXT,
              status TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              payload_json TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_sena_order_batch_owner_updated_at
              ON sena_order_batch (owner_sub, updated_at DESC);
            CREATE TABLE IF NOT EXISTS sena_order_child_lookup (
              child_order_id TEXT PRIMARY KEY,
              batch_order_id TEXT NOT NULL,
              owner_sub TEXT NOT NULL,
              sku_id TEXT NOT NULL,
              supplier_name TEXT,
              status TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_sena_order_child_lookup_owner_sku
              ON sena_order_child_lookup (owner_sub, sku_id, updated_at DESC);
            CREATE INDEX IF NOT EXISTS idx_sena_order_child_lookup_owner_batch
              ON sena_order_child_lookup (owner_sub, batch_order_id, updated_at DESC);
            CREATE TABLE IF NOT EXISTS sena_run (
              run_id TEXT PRIMARY KEY,
              owner_sub TEXT NOT NULL,
              algorithm_version TEXT NOT NULL,
              status TEXT NOT NULL,
              observation_count INTEGER NOT NULL,
              created_at TEXT NOT NULL,
              completed_at TEXT,
              summary_json TEXT,
              diagnostics_json TEXT,
              primary_artifact_key TEXT,
              error TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_sena_run_owner_created_at
              ON sena_run (owner_sub, created_at DESC);
            CREATE TABLE IF NOT EXISTS sena_read_model (
              owner_sub TEXT PRIMARY KEY,
              workspace_summary_json TEXT NOT NULL,
              diagnostics_json TEXT NOT NULL,
              sku_details_json TEXT NOT NULL,
              service_details_json TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              run_id TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sena_workspace_summary_hot (
              owner_sub TEXT PRIMARY KEY,
              run_id TEXT NOT NULL,
              latest_observed_at TEXT,
              sku_count INTEGER NOT NULL,
              service_count INTEGER NOT NULL,
              interval_count INTEGER NOT NULL,
              pending_reorder_count INTEGER NOT NULL,
              top_regime TEXT NOT NULL,
              high_risk_sku_ids_json TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sena_sku_summary_hot (
              owner_sub TEXT NOT NULL,
              sku_id TEXT NOT NULL,
              run_id TEXT NOT NULL,
              latest_posterior_units REAL NOT NULL,
              credible_interval_low REAL NOT NULL,
              credible_interval_high REAL NOT NULL,
              demand_per_day_mean REAL NOT NULL,
              stockout_risk REAL NOT NULL,
              days_of_cover REAL,
              expected_lead_time_demand REAL NOT NULL,
              safety_stock REAL NOT NULL,
              reorder_point REAL NOT NULL,
              reorder_trigger_probability REAL NOT NULL,
              reorder_quantity_json TEXT NOT NULL,
              lead_time_mean_days REAL NOT NULL,
              lead_time_std_days REAL NOT NULL,
              regime_probabilities_json TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              PRIMARY KEY (owner_sub, sku_id)
            );
            CREATE INDEX IF NOT EXISTS idx_sena_sku_summary_hot_owner_risk
              ON sena_sku_summary_hot (owner_sub, stockout_risk DESC);
            CREATE TABLE IF NOT EXISTS sena_sku_detail (
              owner_sub TEXT NOT NULL,
              sku_id TEXT NOT NULL,
              payload_json TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              run_id TEXT NOT NULL,
              PRIMARY KEY (owner_sub, sku_id)
            );
            CREATE TABLE IF NOT EXISTS sena_service_detail (
              owner_sub TEXT NOT NULL,
              service_id TEXT NOT NULL,
              payload_json TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              run_id TEXT NOT NULL,
              PRIMARY KEY (owner_sub, service_id)
            );
            CREATE TABLE IF NOT EXISTS sena_preprocessed_cache (
              owner_sub TEXT NOT NULL,
              algorithm_version TEXT NOT NULL,
              catalog_fingerprint TEXT NOT NULL,
              observation_fingerprint TEXT NOT NULL,
              payload_json TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              PRIMARY KEY (owner_sub, algorithm_version, catalog_fingerprint, observation_fingerprint)
            );
            CREATE TABLE IF NOT EXISTS sena_analysis_checkpoint (
              owner_sub TEXT NOT NULL,
              algorithm_version TEXT NOT NULL,
              catalog_fingerprint TEXT NOT NULL,
              observation_count INTEGER NOT NULL,
              completed_interval_count INTEGER NOT NULL,
              observation_prefix_fingerprint TEXT NOT NULL,
              payload_json TEXT NOT NULL,
              payload_codec TEXT,
              payload_path TEXT,
              payload_bytes INTEGER,
              updated_at TEXT NOT NULL,
              PRIMARY KEY (owner_sub, algorithm_version, catalog_fingerprint, completed_interval_count)
            );
            CREATE INDEX IF NOT EXISTS idx_sena_checkpoint_lookup
              ON sena_analysis_checkpoint (
                owner_sub,
                algorithm_version,
                catalog_fingerprint,
                observation_count DESC,
                completed_interval_count DESC
              );
            CREATE TABLE IF NOT EXISTS sena_record_update_anchor_hot (
              owner_sub TEXT NOT NULL,
              anchor_kind TEXT NOT NULL,
              entity_id TEXT NOT NULL,
              observation_id TEXT NOT NULL,
              observed_at TEXT NOT NULL,
              payload_json TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              PRIMARY KEY (owner_sub, anchor_kind, entity_id)
            );
            CREATE INDEX IF NOT EXISTS idx_sena_record_update_anchor_owner_kind
              ON sena_record_update_anchor_hot (owner_sub, anchor_kind);
            CREATE INDEX IF NOT EXISTS idx_sena_record_update_anchor_owner_observation
              ON sena_record_update_anchor_hot (owner_sub, observation_id);
            PRAGMA user_version = 3;
            "#,
        )?;
        ensure_column(
            &connection,
            "sena_analysis_checkpoint",
            "payload_codec",
            "ALTER TABLE sena_analysis_checkpoint ADD COLUMN payload_codec TEXT",
        )?;
        ensure_column(
            &connection,
            "sena_analysis_checkpoint",
            "payload_path",
            "ALTER TABLE sena_analysis_checkpoint ADD COLUMN payload_path TEXT",
        )?;
        ensure_column(
            &connection,
            "sena_analysis_checkpoint",
            "payload_bytes",
            "ALTER TABLE sena_analysis_checkpoint ADD COLUMN payload_bytes INTEGER",
        )?;
        if previous_user_version < 3 {
            backfill_record_update_anchors_locked(&connection)?;
        }
        Ok(())
    }

    fn checkpoint_root(&self) -> PathBuf {
        self.store_path
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .join("sena-checkpoints")
    }

    fn checkpoint_payload_path(&self, checkpoint: &SenaAnalysisCheckpoint) -> PathBuf {
        self.checkpoint_root()
            .join(safe_path_segment(&checkpoint.metadata.owner_sub))
            .join(safe_path_segment(&checkpoint.metadata.algorithm_version))
            .join(safe_path_segment(&checkpoint.metadata.catalog_fingerprint))
            .join(format!(
                "{}.json.zst",
                checkpoint.metadata.completed_interval_count
            ))
    }
}

fn safe_path_segment(value: &str) -> String {
    value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.') {
                character
            } else {
                '_'
            }
        })
        .collect()
}

fn ensure_column(
    connection: &Connection,
    table_name: &str,
    column_name: &str,
    alter_sql: &str,
) -> Result<()> {
    let mut stmt = connection.prepare(&format!("PRAGMA table_info({table_name})"))?;
    let columns = stmt.query_map([], |row| row.get::<_, String>(1))?;
    for column in columns {
        if column? == column_name {
            return Ok(());
        }
    }
    connection.execute(alter_sql, [])?;
    Ok(())
}

fn is_newer_record_update_anchor(
    current_observed_at: &str,
    current_observation_id: &str,
    next_observed_at: &str,
    next_observation_id: &str,
) -> bool {
    next_observed_at > current_observed_at
        || (next_observed_at == current_observed_at && next_observation_id > current_observation_id)
}

fn upsert_record_update_anchor_locked<T: Serialize>(
    connection: &Connection,
    owner_sub: &str,
    anchor_kind: &str,
    entity_id: &str,
    observation_id: &str,
    observed_at: &str,
    value: &T,
    updated_at: &str,
) -> Result<()> {
    let current = connection
        .query_row(
            r#"
            SELECT observed_at, observation_id
            FROM sena_record_update_anchor_hot
            WHERE owner_sub = ?1 AND anchor_kind = ?2 AND entity_id = ?3
            "#,
            params![owner_sub, anchor_kind, entity_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()?;
    if let Some((current_observed_at, current_observation_id)) = current {
        if !is_newer_record_update_anchor(
            &current_observed_at,
            &current_observation_id,
            observed_at,
            observation_id,
        ) {
            return Ok(());
        }
    }

    connection.execute(
        r#"
        INSERT INTO sena_record_update_anchor_hot (
          owner_sub, anchor_kind, entity_id, observation_id, observed_at, payload_json, updated_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
        ON CONFLICT(owner_sub, anchor_kind, entity_id) DO UPDATE SET
          observation_id = excluded.observation_id,
          observed_at = excluded.observed_at,
          payload_json = excluded.payload_json,
          updated_at = excluded.updated_at
        "#,
        params![
            owner_sub,
            anchor_kind,
            entity_id,
            observation_id,
            observed_at,
            serde_json::to_string(value)?,
            updated_at,
        ],
    )?;
    Ok(())
}

fn delivery_fee_bucket_key(bucket: &crate::types::SenaDeliveryFeeBucket) -> &'static str {
    match bucket {
        crate::types::SenaDeliveryFeeBucket::Supplier => "supplier",
        crate::types::SenaDeliveryFeeBucket::CustomerOrder => "customer_order",
        crate::types::SenaDeliveryFeeBucket::ImmediateSale => "immediate_sale",
    }
}

fn ticket_family_label(family: &SenaTicketFamily) -> &'static str {
    match family {
        SenaTicketFamily::Customer => "Customer",
        SenaTicketFamily::Supplier => "Supplier",
        SenaTicketFamily::Adjustment => "Adjustment",
    }
}

fn ticket_summary_from_event(event: &SenaTicketEvent) -> SenaTicketSummary {
    SenaTicketSummary {
        ticket_id: event.ticket_id.clone(),
        ticket_family: event.ticket_family,
        lifecycle: event.lifecycle,
        stage: event.stage,
        revision: event.revision,
        event_type: event.event_type,
        occurred_at: event.occurred_at.clone(),
        next_touch_at: event.next_touch_at.clone(),
        party: event.party.clone(),
        lines: event.lines.clone(),
        delivery_fee: event.delivery_fee.clone(),
        note: event.note.clone(),
    }
}

fn record_activity_from_anchor(
    anchor_kind: &str,
    entity_id: &str,
    observation_id: &str,
    observed_at: &str,
    payload: &str,
) -> Result<Option<SenaRecordActivityEntry>> {
    let entry = match anchor_kind {
        "stock" => Some(SenaRecordActivityEntry {
            activity_id: format!("{observation_id}:stock:{entity_id}"),
            activity_type: SenaRecordActivityType::Stock,
            observation_id: observation_id.to_string(),
            observed_at: observed_at.to_string(),
            entity_id: entity_id.to_string(),
            ticket_id: None,
            ticket_family: None,
            lifecycle: None,
            event_type: None,
            summary: "Stock counted".to_string(),
            detail: None,
        }),
        "retail_sale" => Some(SenaRecordActivityEntry {
            activity_id: format!("{observation_id}:retail-sale:{entity_id}"),
            activity_type: SenaRecordActivityType::RetailSale,
            observation_id: observation_id.to_string(),
            observed_at: observed_at.to_string(),
            entity_id: entity_id.to_string(),
            ticket_id: None,
            ticket_family: None,
            lifecycle: None,
            event_type: None,
            summary: "Retail sale captured".to_string(),
            detail: None,
        }),
        "service_sale" => Some(SenaRecordActivityEntry {
            activity_id: format!("{observation_id}:service-sale:{entity_id}"),
            activity_type: SenaRecordActivityType::ServiceSale,
            observation_id: observation_id.to_string(),
            observed_at: observed_at.to_string(),
            entity_id: entity_id.to_string(),
            ticket_id: None,
            ticket_family: None,
            lifecycle: None,
            event_type: None,
            summary: "Service sale captured".to_string(),
            detail: None,
        }),
        "order" => Some(SenaRecordActivityEntry {
            activity_id: format!("{observation_id}:order:{entity_id}"),
            activity_type: SenaRecordActivityType::Order,
            observation_id: observation_id.to_string(),
            observed_at: observed_at.to_string(),
            entity_id: entity_id.to_string(),
            ticket_id: None,
            ticket_family: None,
            lifecycle: None,
            event_type: None,
            summary: "Order signal captured".to_string(),
            detail: None,
        }),
        "receipt" => Some(SenaRecordActivityEntry {
            activity_id: format!("{observation_id}:receipt:{entity_id}"),
            activity_type: SenaRecordActivityType::Receipt,
            observation_id: observation_id.to_string(),
            observed_at: observed_at.to_string(),
            entity_id: entity_id.to_string(),
            ticket_id: None,
            ticket_family: None,
            lifecycle: None,
            event_type: None,
            summary: "Receipt signal captured".to_string(),
            detail: None,
        }),
        "ticket" => {
            let ticket: SenaTicketSummary = serde_json::from_str(payload)?;
            Some(SenaRecordActivityEntry {
                activity_id: format!(
                    "{observation_id}:ticket:{}:{}",
                    ticket.ticket_id, ticket.revision
                ),
                activity_type: SenaRecordActivityType::Ticket,
                observation_id: observation_id.to_string(),
                observed_at: observed_at.to_string(),
                entity_id: entity_id.to_string(),
                ticket_id: Some(ticket.ticket_id.clone()),
                ticket_family: Some(ticket.ticket_family),
                lifecycle: Some(ticket.lifecycle),
                event_type: Some(ticket.event_type),
                summary: format!(
                    "{} ticket updated",
                    ticket_family_label(&ticket.ticket_family)
                ),
                detail: ticket.note.clone(),
            })
        }
        "delivery_fee" => Some(SenaRecordActivityEntry {
            activity_id: format!("{observation_id}:delivery-fee:{entity_id}"),
            activity_type: SenaRecordActivityType::DeliveryFee,
            observation_id: observation_id.to_string(),
            observed_at: observed_at.to_string(),
            entity_id: entity_id.to_string(),
            ticket_id: None,
            ticket_family: None,
            lifecycle: None,
            event_type: None,
            summary: "Delivery fee captured".to_string(),
            detail: None,
        }),
        _ => None,
    };
    Ok(entry)
}

fn push_record_activity<T: Serialize>(
    rows: &mut Vec<SenaRecordActivityEntry>,
    anchor_kind: &str,
    entity_id: &str,
    observation_id: &str,
    observed_at: &str,
    payload: &T,
) -> Result<()> {
    let payload_json = serde_json::to_string(payload)?;
    if let Some(activity) = record_activity_from_anchor(
        anchor_kind,
        entity_id,
        observation_id,
        observed_at,
        &payload_json,
    )? {
        rows.push(activity);
    }
    Ok(())
}

fn load_recent_record_activity_locked(
    connection: &Connection,
    owner_sub: &str,
    limit: usize,
) -> Result<Vec<SenaRecordActivityEntry>> {
    let requested_rows = (limit * 4).max(limit);
    let mut stmt = connection.prepare(
        r#"
        SELECT observation_id, payload
        FROM sena_observation
        WHERE owner_sub = ?1
        ORDER BY observed_at DESC, observation_id DESC
        LIMIT ?2
        "#,
    )?;
    let rows = stmt.query_map(params![owner_sub, requested_rows as i64], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    let mut recent_activity = Vec::new();
    for row in rows {
        let (observation_id, payload) = row?;
        let input: SenaObservationInput = match serde_json::from_str(&payload) {
            Ok(input) => input,
            Err(_) => continue,
        };
        for snapshot in &input.stock_snapshot {
            push_record_activity(
                &mut recent_activity,
                "stock",
                &snapshot.sku_id,
                &observation_id,
                &input.observed_at,
                snapshot,
            )?;
        }
        for sale in &input.retail_sales_snapshot {
            if sale.units_sold > 0.0 {
                push_record_activity(
                    &mut recent_activity,
                    "retail_sale",
                    &sale.sku_id,
                    &observation_id,
                    &input.observed_at,
                    sale,
                )?;
            }
        }
        for sale in &input.service_sales_snapshot {
            if sale.units_sold > 0.0 {
                push_record_activity(
                    &mut recent_activity,
                    "service_sale",
                    &sale.service_id,
                    &observation_id,
                    &input.observed_at,
                    sale,
                )?;
            }
        }
        for signal in &input.order_signals {
            if signal.order_placed || signal.approximate_order_quantity.is_some() {
                let observed_at = signal
                    .placement_timestamp
                    .as_deref()
                    .unwrap_or(input.observed_at.as_str());
                push_record_activity(
                    &mut recent_activity,
                    "order",
                    &signal.sku_id,
                    &observation_id,
                    observed_at,
                    signal,
                )?;
            }
            if signal.receipt_arrived || signal.approximate_receipt_quantity.is_some() {
                let observed_at = signal
                    .receipt_timestamp
                    .as_deref()
                    .unwrap_or(input.observed_at.as_str());
                push_record_activity(
                    &mut recent_activity,
                    "receipt",
                    &signal.sku_id,
                    &observation_id,
                    observed_at,
                    signal,
                )?;
            }
        }
        if let Some(delivery_fee) = &input.delivery_fee {
            push_record_activity(
                &mut recent_activity,
                "delivery_fee",
                delivery_fee_bucket_key(&delivery_fee.bucket),
                &observation_id,
                &input.observed_at,
                delivery_fee,
            )?;
        }
        for event in &input.ticket_events {
            let summary = ticket_summary_from_event(event);
            push_record_activity(
                &mut recent_activity,
                "ticket",
                &event.ticket_id,
                &observation_id,
                &event.occurred_at,
                &summary,
            )?;
            if let Some(delivery_fee) = &event.delivery_fee {
                push_record_activity(
                    &mut recent_activity,
                    "delivery_fee",
                    delivery_fee_bucket_key(&delivery_fee.bucket),
                    &observation_id,
                    &event.occurred_at,
                    delivery_fee,
                )?;
            }
        }
    }
    recent_activity.sort_by(|left, right| {
        right
            .observed_at
            .cmp(&left.observed_at)
            .then_with(|| right.activity_id.cmp(&left.activity_id))
    });
    recent_activity.truncate(limit);
    Ok(recent_activity)
}

fn upsert_record_update_anchors_for_observation_locked(
    connection: &Connection,
    owner_sub: &str,
    observation_id: &str,
    input: &SenaObservationInput,
    updated_at: &str,
) -> Result<()> {
    for snapshot in &input.stock_snapshot {
        upsert_record_update_anchor_locked(
            connection,
            owner_sub,
            "stock",
            &snapshot.sku_id,
            observation_id,
            &input.observed_at,
            snapshot,
            updated_at,
        )?;
    }
    for sale in &input.retail_sales_snapshot {
        if sale.units_sold > 0.0 {
            upsert_record_update_anchor_locked(
                connection,
                owner_sub,
                "retail_sale",
                &sale.sku_id,
                observation_id,
                &input.observed_at,
                sale,
                updated_at,
            )?;
        }
    }
    for sale in &input.service_sales_snapshot {
        if sale.units_sold > 0.0 {
            upsert_record_update_anchor_locked(
                connection,
                owner_sub,
                "service_sale",
                &sale.service_id,
                observation_id,
                &input.observed_at,
                sale,
                updated_at,
            )?;
        }
    }
    for signal in &input.order_signals {
        if signal.order_placed || signal.approximate_order_quantity.is_some() {
            let observed_at = signal
                .placement_timestamp
                .as_deref()
                .unwrap_or(input.observed_at.as_str());
            upsert_record_update_anchor_locked(
                connection,
                owner_sub,
                "order",
                &signal.sku_id,
                observation_id,
                observed_at,
                signal,
                updated_at,
            )?;
        }
        if signal.receipt_arrived || signal.approximate_receipt_quantity.is_some() {
            let observed_at = signal
                .receipt_timestamp
                .as_deref()
                .unwrap_or(input.observed_at.as_str());
            upsert_record_update_anchor_locked(
                connection,
                owner_sub,
                "receipt",
                &signal.sku_id,
                observation_id,
                observed_at,
                signal,
                updated_at,
            )?;
        }
    }
    if let Some(delivery_fee) = &input.delivery_fee {
        upsert_record_update_anchor_locked(
            connection,
            owner_sub,
            "delivery_fee",
            delivery_fee_bucket_key(&delivery_fee.bucket),
            observation_id,
            &input.observed_at,
            delivery_fee,
            updated_at,
        )?;
    }
    for event in &input.ticket_events {
        let summary = ticket_summary_from_event(event);
        upsert_record_update_anchor_locked(
            connection,
            owner_sub,
            "ticket",
            &event.ticket_id,
            observation_id,
            &event.occurred_at,
            &summary,
            updated_at,
        )?;
        if let Some(delivery_fee) = &event.delivery_fee {
            upsert_record_update_anchor_locked(
                connection,
                owner_sub,
                "delivery_fee",
                delivery_fee_bucket_key(&delivery_fee.bucket),
                observation_id,
                &event.occurred_at,
                delivery_fee,
                updated_at,
            )?;
        }
    }
    Ok(())
}

fn rebuild_record_update_anchors_locked(connection: &Connection, owner_sub: &str) -> Result<()> {
    connection.execute(
        "DELETE FROM sena_record_update_anchor_hot WHERE owner_sub = ?1",
        params![owner_sub],
    )?;
    let updated_at = now_rfc3339();
    let mut stmt = connection.prepare(
        r#"
        SELECT observation_id, payload
        FROM sena_observation
        WHERE owner_sub = ?1
        "#,
    )?;
    let rows = stmt.query_map(params![owner_sub], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    for row in rows {
        let (observation_id, payload) = row?;
        let input: SenaObservationInput = serde_json::from_str(&payload)?;
        upsert_record_update_anchors_for_observation_locked(
            connection,
            owner_sub,
            &observation_id,
            &input,
            &updated_at,
        )?;
    }
    Ok(())
}

fn backfill_record_update_anchors_locked(connection: &Connection) -> Result<()> {
    let mut stmt = connection.prepare("SELECT DISTINCT owner_sub FROM sena_observation")?;
    let owners = stmt
        .query_map([], |row| row.get::<_, String>(0))?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    for owner_sub in owners {
        rebuild_record_update_anchors_locked(connection, &owner_sub)?;
    }
    Ok(())
}

fn persist_hot_workspace_summary(
    connection: &Connection,
    summary: &SenaWorkspaceSummary,
    updated_at: &str,
) -> Result<()> {
    connection.execute(
        r#"
        INSERT INTO sena_workspace_summary_hot (
          owner_sub, run_id, latest_observed_at, sku_count, service_count, interval_count,
          pending_reorder_count, top_regime, high_risk_sku_ids_json, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
        ON CONFLICT(owner_sub) DO UPDATE SET
          run_id = excluded.run_id,
          latest_observed_at = excluded.latest_observed_at,
          sku_count = excluded.sku_count,
          service_count = excluded.service_count,
          interval_count = excluded.interval_count,
          pending_reorder_count = excluded.pending_reorder_count,
          top_regime = excluded.top_regime,
          high_risk_sku_ids_json = excluded.high_risk_sku_ids_json,
          updated_at = excluded.updated_at
        "#,
        params![
            &summary.owner_sub,
            &summary.run_id,
            &summary.latest_observed_at,
            summary.sku_count as i64,
            summary.service_count as i64,
            summary.interval_count as i64,
            summary.pending_reorder_count as i64,
            &summary.top_regime,
            serde_json::to_string(&summary.high_risk_sku_ids)?,
            updated_at,
        ],
    )?;
    connection.execute(
        "DELETE FROM sena_sku_summary_hot WHERE owner_sub = ?1",
        params![&summary.owner_sub],
    )?;
    for sku in &summary.sku_summaries {
        connection.execute(
            r#"
            INSERT INTO sena_sku_summary_hot (
              owner_sub, sku_id, run_id, latest_posterior_units, credible_interval_low,
              credible_interval_high, demand_per_day_mean, stockout_risk, days_of_cover,
              expected_lead_time_demand, safety_stock, reorder_point,
              reorder_trigger_probability, reorder_quantity_json, lead_time_mean_days,
              lead_time_std_days, regime_probabilities_json, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)
            "#,
            params![
                &summary.owner_sub,
                &sku.sku_id,
                &summary.run_id,
                sku.latest_posterior_units,
                sku.credible_interval_low,
                sku.credible_interval_high,
                sku.demand_per_day_mean,
                sku.stockout_risk,
                sku.days_of_cover,
                sku.expected_lead_time_demand,
                sku.safety_stock,
                sku.reorder_point,
                sku.reorder_trigger_probability,
                serde_json::to_string(&sku.reorder_quantity)?,
                sku.lead_time_mean_days,
                sku.lead_time_std_days,
                serde_json::to_string(&sku.regime_probabilities)?,
                updated_at,
            ],
        )?;
    }
    Ok(())
}

fn load_hot_workspace_summary(
    connection: &Connection,
    owner_sub: &str,
) -> Result<Option<SenaWorkspaceSummary>> {
    let row = connection
        .query_row(
            r#"
            SELECT run_id, latest_observed_at, sku_count, service_count, interval_count,
                   pending_reorder_count, top_regime, high_risk_sku_ids_json
            FROM sena_workspace_summary_hot
            WHERE owner_sub = ?1
            "#,
            params![owner_sub],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, i64>(2)? as usize,
                    row.get::<_, i64>(3)? as usize,
                    row.get::<_, i64>(4)? as usize,
                    row.get::<_, i64>(5)? as usize,
                    row.get::<_, String>(6)?,
                    row.get::<_, String>(7)?,
                ))
            },
        )
        .optional()?;
    let Some(row) = row else {
        return Ok(None);
    };
    let mut stmt = connection.prepare(
        r#"
        SELECT sku_id, latest_posterior_units, credible_interval_low, credible_interval_high,
               demand_per_day_mean, stockout_risk, days_of_cover, expected_lead_time_demand,
               safety_stock, reorder_point, reorder_trigger_probability, reorder_quantity_json,
               lead_time_mean_days, lead_time_std_days, regime_probabilities_json
        FROM sena_sku_summary_hot
        WHERE owner_sub = ?1
        ORDER BY sku_id ASC
        "#,
    )?;
    let sku_rows = stmt.query_map(params![owner_sub], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, f64>(1)?,
            row.get::<_, f64>(2)?,
            row.get::<_, f64>(3)?,
            row.get::<_, f64>(4)?,
            row.get::<_, f64>(5)?,
            row.get::<_, Option<f64>>(6)?,
            row.get::<_, f64>(7)?,
            row.get::<_, f64>(8)?,
            row.get::<_, f64>(9)?,
            row.get::<_, f64>(10)?,
            row.get::<_, String>(11)?,
            row.get::<_, f64>(12)?,
            row.get::<_, f64>(13)?,
            row.get::<_, String>(14)?,
        ))
    })?;
    let mut sku_summaries = Vec::new();
    for sku_row in sku_rows {
        let row = sku_row?;
        sku_summaries.push(SenaSkuSummary {
            sku_id: row.0,
            latest_posterior_units: row.1,
            credible_interval_low: row.2,
            credible_interval_high: row.3,
            demand_per_day_mean: row.4,
            stockout_risk: row.5,
            days_of_cover: row.6,
            expected_lead_time_demand: row.7,
            safety_stock: row.8,
            reorder_point: row.9,
            reorder_trigger_probability: row.10,
            reorder_quantity: serde_json::from_str(&row.11)?,
            lead_time_mean_days: row.12,
            lead_time_std_days: row.13,
            regime_probabilities: serde_json::from_str(&row.14)?,
        });
    }
    Ok(Some(SenaWorkspaceSummary {
        owner_sub: owner_sub.to_string(),
        run_id: row.0,
        latest_observed_at: row.1,
        sku_count: row.2,
        service_count: row.3,
        interval_count: row.4,
        pending_reorder_count: row.5,
        top_regime: row.6,
        high_risk_sku_ids: serde_json::from_str(&row.7)?,
        sku_summaries,
    }))
}

fn observation_fingerprint_locked(
    connection: &Connection,
    owner_sub: &str,
) -> Result<SenaObservationFingerprint> {
    let count = connection.query_row(
        "SELECT COUNT(*) FROM sena_observation WHERE owner_sub = ?1",
        params![owner_sub],
        |row| row.get::<_, i64>(0),
    )? as usize;
    let latest = connection
        .query_row(
            r#"
            SELECT observed_at, observation_id
            FROM sena_observation
            WHERE owner_sub = ?1
            ORDER BY observed_at DESC, observation_id DESC
            LIMIT 1
            "#,
            params![owner_sub],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()?;
    Ok(SenaObservationFingerprint {
        count,
        latest_observed_at: latest.as_ref().map(|row| row.0.clone()),
        latest_observation_id: latest.map(|row| row.1),
    })
}

fn merge_order_fields(base: &SenaOrderFieldValues, overrides: &SenaOrderFieldValues) -> SenaOrderFieldValues {
    SenaOrderFieldValues {
        supplier_name: overrides
            .supplier_name
            .clone()
            .or_else(|| base.supplier_name.clone()),
        supplier_note: overrides
            .supplier_note
            .clone()
            .or_else(|| base.supplier_note.clone()),
        ordered_quantity: overrides.ordered_quantity.or(base.ordered_quantity),
        received_quantity: overrides.received_quantity.or(base.received_quantity),
        cost_per_unit: overrides.cost_per_unit.or(base.cost_per_unit),
        expected_arrival_at: overrides
            .expected_arrival_at
            .clone()
            .or_else(|| base.expected_arrival_at.clone()),
        placement_timestamp: overrides
            .placement_timestamp
            .clone()
            .or_else(|| base.placement_timestamp.clone()),
        receipt_timestamp: overrides
            .receipt_timestamp
            .clone()
            .or_else(|| base.receipt_timestamp.clone()),
        lead_time_days_hint: overrides.lead_time_days_hint.or(base.lead_time_days_hint),
        lead_time_variability: overrides
            .lead_time_variability
            .or(base.lead_time_variability),
        delivery_fee: overrides
            .delivery_fee
            .clone()
            .or_else(|| base.delivery_fee.clone()),
    }
}

fn order_child_status_for_fields(fields: &SenaOrderFieldValues) -> SenaOrderChildStatus {
    if fields.receipt_timestamp.is_some()
        || fields
            .received_quantity
            .is_some_and(|value| value > 0.0)
    {
        return SenaOrderChildStatus::Received;
    }
    if fields.expected_arrival_at.is_some() {
        if let Some(expected) = &fields.expected_arrival_at {
            if let Ok(date) = OffsetDateTime::parse(
                expected,
                &time::format_description::well_known::Rfc3339,
            ) {
                if date < OffsetDateTime::now_utc() {
                    return SenaOrderChildStatus::FollowUp;
                }
            }
        }
        return SenaOrderChildStatus::AwaitingReceipt;
    }
    SenaOrderChildStatus::Open
}

fn order_batch_status(children: &[SenaOrderChildRecord]) -> SenaOrderBatchStatus {
    if children.is_empty() {
        return SenaOrderBatchStatus::Open;
    }
    if children
        .iter()
        .all(|child| child.status == SenaOrderChildStatus::Reviewed)
    {
        return SenaOrderBatchStatus::Reviewed;
    }
    if children
        .iter()
        .all(|child| child.status == SenaOrderChildStatus::Received || child.status == SenaOrderChildStatus::Reviewed)
    {
        return SenaOrderBatchStatus::Received;
    }
    if children
        .iter()
        .any(|child| child.status == SenaOrderChildStatus::Received || child.status == SenaOrderChildStatus::Reviewed)
    {
        return SenaOrderBatchStatus::PartialReceipt;
    }
    if children
        .iter()
        .any(|child| child.status == SenaOrderChildStatus::FollowUp)
    {
        return SenaOrderBatchStatus::FollowUp;
    }
    if children
        .iter()
        .any(|child| child.status == SenaOrderChildStatus::AwaitingReceipt)
    {
        return SenaOrderBatchStatus::AwaitingReceipt;
    }
    SenaOrderBatchStatus::Open
}

fn slug_segment(value: Option<&str>, fallback: &str) -> String {
    let mut out = String::new();
    for ch in value.unwrap_or("").trim().chars() {
        let lower = ch.to_ascii_lowercase();
        if lower.is_ascii_alphanumeric() {
            out.push(lower);
        } else if (lower.is_ascii_whitespace() || matches!(lower, '-' | '_' | '/'))
            && !out.ends_with('-')
        {
            out.push('-');
        }
    }
    let trimmed = out.trim_matches('-');
    if trimmed.is_empty() {
        fallback.to_string()
    } else {
        trimmed.to_string()
    }
}

fn unique_suffix() -> String {
    Uuid::new_v4()
        .simple()
        .to_string()
        .chars()
        .take(8)
        .collect()
}

fn order_timestamp_parts(now: &str) -> (String, String, String, String) {
    if let Ok(format) = parse_time_format("[year]/[month]/[day]/[hour][minute][second]") {
        if let Ok(parsed) = OffsetDateTime::parse(now, &time::format_description::well_known::Rfc3339) {
            let formatted = parsed.format(&format).unwrap_or_else(|_| "1970/01/01/000000".to_string());
            let mut parts = formatted.split('/');
            let year = parts.next().unwrap_or("1970").to_string();
            let month = parts.next().unwrap_or("01").to_string();
            let day = parts.next().unwrap_or("01").to_string();
            let time = parts.next().unwrap_or("000000").to_string();
            return (year, month, day, time);
        }
    }
    ("1970".to_string(), "01".to_string(), "01".to_string(), "000000".to_string())
}

fn build_batch_order_id(now: &str, supplier_name: Option<&str>) -> String {
    let (year, month, day, time) = order_timestamp_parts(now);
    format!(
        "orders/{year}/{month}/{day}/{time}/{}/{}",
        slug_segment(supplier_name, "unknown-supplier"),
        unique_suffix()
    )
}

fn build_child_order_id(batch_order_id: &str, sku_id: &str) -> String {
    format!(
        "{batch_order_id}/items/{}/{}",
        slug_segment(Some(sku_id), "sku"),
        unique_suffix()
    )
}

fn refresh_batch(batch: &mut SenaOrderBatchRecord) {
    let shared = batch.shared.clone();
    for child in &mut batch.children {
        child.effective = merge_order_fields(&shared, &child.overrides);
        child.inherited_from_batch = child.overrides == SenaOrderFieldValues::default();
        child.status = order_child_status_for_fields(&child.effective);
    }
    batch.status = order_batch_status(&batch.children);
}

fn persist_batch(connection: &Connection, batch: &SenaOrderBatchRecord) -> Result<()> {
    connection.execute(
        r#"
        INSERT INTO sena_order_batch (batch_order_id, owner_sub, supplier_name, status, updated_at, payload_json)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6)
        ON CONFLICT(batch_order_id) DO UPDATE SET
          supplier_name = excluded.supplier_name,
          status = excluded.status,
          updated_at = excluded.updated_at,
          payload_json = excluded.payload_json
        "#,
        params![
            batch.batch_order_id,
            batch.owner_sub,
            batch.supplier_name,
            serde_json::to_string(&batch.status)?,
            batch.updated_at,
            serde_json::to_string(batch)?,
        ],
    )?;
    connection.execute(
        "DELETE FROM sena_order_child_lookup WHERE batch_order_id = ?1",
        params![batch.batch_order_id],
    )?;
    for child in &batch.children {
        connection.execute(
            r#"
            INSERT INTO sena_order_child_lookup
              (child_order_id, batch_order_id, owner_sub, sku_id, supplier_name, status, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            "#,
            params![
                child.child_order_id,
                batch.batch_order_id,
                batch.owner_sub,
                child.sku_id,
                batch.supplier_name,
                serde_json::to_string(&child.status)?,
                child.updated_at,
            ],
        )?;
    }
    Ok(())
}

fn load_all_batches(connection: &Connection, owner_sub: &str) -> Result<Vec<SenaOrderBatchRecord>> {
    let mut stmt = connection.prepare(
        "SELECT payload_json FROM sena_order_batch WHERE owner_sub = ?1 ORDER BY updated_at DESC",
    )?;
    let rows = stmt.query_map(params![owner_sub], |row| row.get::<_, String>(0))?;
    let mut batches = Vec::new();
    for row in rows {
        batches.push(serde_json::from_str::<SenaOrderBatchRecord>(&row?)?);
    }
    Ok(batches)
}

#[async_trait(?Send)]
impl SenaRepository for SqliteSenaRepository {
    async fn clear_owner(&self, owner_sub: &str) -> Result<()> {
        let connection = self
            .connection
            .lock()
            .map_err(|_| anyhow!("sqlite lock poisoned"))?;
        let checkpoint_paths = {
            let mut stmt = connection.prepare(
                "SELECT payload_path FROM sena_analysis_checkpoint WHERE owner_sub = ?1",
            )?;
            let rows = stmt.query_map(params![owner_sub], |row| row.get::<_, Option<String>>(0))?;
            let mut paths = Vec::new();
            for row in rows {
                if let Some(path) = row? {
                    paths.push(path);
                }
            }
            paths
        };
        connection.execute(
            "DELETE FROM sena_analysis_checkpoint WHERE owner_sub = ?1",
            params![owner_sub],
        )?;
        connection.execute(
            "DELETE FROM sena_preprocessed_cache WHERE owner_sub = ?1",
            params![owner_sub],
        )?;
        connection.execute(
            "DELETE FROM sena_service_detail WHERE owner_sub = ?1",
            params![owner_sub],
        )?;
        connection.execute(
            "DELETE FROM sena_sku_detail WHERE owner_sub = ?1",
            params![owner_sub],
        )?;
        connection.execute(
            "DELETE FROM sena_read_model WHERE owner_sub = ?1",
            params![owner_sub],
        )?;
        connection.execute(
            "DELETE FROM sena_sku_summary_hot WHERE owner_sub = ?1",
            params![owner_sub],
        )?;
        connection.execute(
            "DELETE FROM sena_workspace_summary_hot WHERE owner_sub = ?1",
            params![owner_sub],
        )?;
        connection.execute(
            "DELETE FROM sena_run WHERE owner_sub = ?1",
            params![owner_sub],
        )?;
        connection.execute(
            "DELETE FROM sena_observation WHERE owner_sub = ?1",
            params![owner_sub],
        )?;
        connection.execute(
            "DELETE FROM sena_order_child_lookup WHERE owner_sub = ?1",
            params![owner_sub],
        )?;
        connection.execute(
            "DELETE FROM sena_order_batch WHERE owner_sub = ?1",
            params![owner_sub],
        )?;
        connection.execute(
            "DELETE FROM sena_catalog WHERE owner_sub = ?1",
            params![owner_sub],
        )?;
        for path in checkpoint_paths {
            let _ = fs::remove_file(path);
        }
        Ok(())
    }

    async fn upsert_catalog(&self, owner_sub: &str, catalog: &SenaCatalog) -> Result<()> {
        let connection = self
            .connection
            .lock()
            .map_err(|_| anyhow!("sqlite lock poisoned"))?;
        connection.execute(
            r#"
            INSERT INTO sena_catalog (owner_sub, payload, updated_at)
            VALUES (?1, ?2, ?3)
            ON CONFLICT(owner_sub) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at
            "#,
            params![owner_sub, serde_json::to_string(catalog)?, now_rfc3339()],
        )?;
        Ok(())
    }

    async fn get_catalog(&self, owner_sub: &str) -> Result<Option<SenaCatalog>> {
        let connection = self
            .connection
            .lock()
            .map_err(|_| anyhow!("sqlite lock poisoned"))?;
        let payload = connection
            .query_row(
                "SELECT payload FROM sena_catalog WHERE owner_sub = ?1",
                params![owner_sub],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        payload
            .map(|value| serde_json::from_str(&value).map_err(anyhow::Error::new))
            .transpose()
    }

    async fn insert_observation(
        &self,
        owner_sub: &str,
        observation: &SenaObservationInput,
    ) -> Result<SenaObservationRecord> {
        let record = SenaObservationRecord {
            observation_id: Uuid::new_v4().to_string(),
            owner_sub: owner_sub.to_string(),
            input: observation.clone(),
        };
        let connection = self
            .connection
            .lock()
            .map_err(|_| anyhow!("sqlite lock poisoned"))?;
        connection.execute(
            "INSERT INTO sena_observation (observation_id, owner_sub, observed_at, payload) VALUES (?1, ?2, ?3, ?4)",
            params![
                record.observation_id,
                record.owner_sub,
                record.input.observed_at,
                serde_json::to_string(&record.input)?
            ],
        )?;
        upsert_record_update_anchors_for_observation_locked(
            &connection,
            owner_sub,
            &record.observation_id,
            &record.input,
            &now_rfc3339(),
        )?;
        Ok(record)
    }

    async fn update_observation(
        &self,
        owner_sub: &str,
        observation_id: &str,
        observation: &SenaObservationInput,
    ) -> Result<SenaObservationRecord> {
        let connection = self
            .connection
            .lock()
            .map_err(|_| anyhow!("sqlite lock poisoned"))?;
        let updated = connection.execute(
            r#"
            UPDATE sena_observation
            SET observed_at = ?3, payload = ?4
            WHERE observation_id = ?1 AND owner_sub = ?2
            "#,
            params![
                observation_id,
                owner_sub,
                observation.observed_at,
                serde_json::to_string(observation)?,
            ],
        )?;
        if updated == 0 {
            return Err(anyhow!("observation not found"));
        }
        rebuild_record_update_anchors_locked(&connection, owner_sub)?;
        Ok(SenaObservationRecord {
            observation_id: observation_id.to_string(),
            owner_sub: owner_sub.to_string(),
            input: observation.clone(),
        })
    }

    async fn delete_observation(&self, owner_sub: &str, observation_id: &str) -> Result<()> {
        let connection = self
            .connection
            .lock()
            .map_err(|_| anyhow!("sqlite lock poisoned"))?;
        let deleted = connection.execute(
            "DELETE FROM sena_observation WHERE observation_id = ?1 AND owner_sub = ?2",
            params![observation_id, owner_sub],
        )?;
        if deleted == 0 {
            return Err(anyhow!("observation not found"));
        }
        rebuild_record_update_anchors_locked(&connection, owner_sub)?;
        Ok(())
    }

    async fn list_observations(&self, owner_sub: &str) -> Result<Vec<SenaObservationRecord>> {
        let connection = self
            .connection
            .lock()
            .map_err(|_| anyhow!("sqlite lock poisoned"))?;
        let mut stmt = connection.prepare(
            "SELECT observation_id, payload FROM sena_observation WHERE owner_sub = ?1 ORDER BY observed_at ASC, observation_id ASC",
        )?;
        let rows = stmt.query_map(params![owner_sub], |row| {
            let observation_id: String = row.get(0)?;
            let payload: String = row.get(1)?;
            Ok((observation_id, payload))
        })?;
        let mut records = Vec::new();
        for row in rows {
            let (observation_id, payload) = row?;
            records.push(SenaObservationRecord {
                observation_id,
                owner_sub: owner_sub.to_string(),
                input: serde_json::from_str(&payload)?,
            });
        }
        Ok(records)
    }

    async fn list_observation_page(
        &self,
        owner_sub: &str,
        request: Option<&SenaObservationPageRequest>,
    ) -> Result<SenaObservationPage> {
        let request = request.cloned().unwrap_or_default();
        let limit = request.limit.unwrap_or(100).clamp(1, 500);
        let connection = self
            .connection
            .lock()
            .map_err(|_| anyhow!("sqlite lock poisoned"))?;
        let fingerprint = observation_fingerprint_locked(&connection, owner_sub)?;
        let query = if request.before_observed_at.is_some() && request.before_observation_id.is_some() {
            r#"
            SELECT observation_id, observed_at, payload
            FROM sena_observation
            WHERE owner_sub = ?1
              AND (observed_at < ?2 OR (observed_at = ?2 AND observation_id < ?3))
            ORDER BY observed_at DESC, observation_id DESC
            LIMIT ?4
            "#
        } else if request.before_observed_at.is_some() {
            r#"
            SELECT observation_id, observed_at, payload
            FROM sena_observation
            WHERE owner_sub = ?1 AND observed_at < ?2
            ORDER BY observed_at DESC, observation_id DESC
            LIMIT ?4
            "#
        } else {
            r#"
            SELECT observation_id, observed_at, payload
            FROM sena_observation
            WHERE owner_sub = ?1
            ORDER BY observed_at DESC, observation_id DESC
            LIMIT ?4
            "#
        };
        let mut stmt = connection.prepare(query)?;
        let requested_rows = (limit + 1) as i64;
        let row_mapper = |row: &rusqlite::Row<'_>| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        };
        let rows = if request.before_observed_at.is_some() && request.before_observation_id.is_some() {
            stmt.query_map(
                params![
                    owner_sub,
                    request.before_observed_at.as_deref(),
                    request.before_observation_id.as_deref(),
                    requested_rows,
                ],
                row_mapper,
            )?
        } else if request.before_observed_at.is_some() {
            stmt.query_map(
                params![
                    owner_sub,
                    request.before_observed_at.as_deref(),
                    rusqlite::types::Null,
                    requested_rows,
                ],
                row_mapper,
            )?
        } else {
            stmt.query_map(
                params![owner_sub, rusqlite::types::Null, rusqlite::types::Null, requested_rows],
                row_mapper,
            )?
        };
        let mut raw_rows = Vec::new();
        for row in rows {
            raw_rows.push(row?);
        }
        let has_older = raw_rows.len() > limit;
        raw_rows.truncate(limit);
        let next_cursor = if has_older {
            raw_rows.last().map(|row| SenaObservationPageCursor {
                observation_id: row.0.clone(),
                observed_at: row.1.clone(),
            })
        } else {
            None
        };
        let observations = raw_rows
            .into_iter()
            .map(|(observation_id, _observed_at, payload)| {
                serde_json::from_str(&payload).map(|input| SenaObservationRecord {
                    observation_id,
                    owner_sub: owner_sub.to_string(),
                    input,
                })
            })
            .collect::<std::result::Result<Vec<_>, _>>()?;
        Ok(SenaObservationPage {
            observations,
            next_cursor,
            has_older,
            total_count: fingerprint.count,
            latest_observed_at: fingerprint.latest_observed_at,
        })
    }

    async fn get_observation_fingerprint(
        &self,
        owner_sub: &str,
    ) -> Result<SenaObservationFingerprint> {
        let connection = self
            .connection
            .lock()
            .map_err(|_| anyhow!("sqlite lock poisoned"))?;
        observation_fingerprint_locked(&connection, owner_sub)
    }

    async fn get_record_update_context(&self, owner_sub: &str) -> Result<SenaRecordUpdateContext> {
        let connection = self
            .connection
            .lock()
            .map_err(|_| anyhow!("sqlite lock poisoned"))?;
        let observation_fingerprint = observation_fingerprint_locked(&connection, owner_sub)?;
        let mut latest_stock_by_sku = BTreeMap::new();
        let mut latest_retail_sale_by_sku = BTreeMap::new();
        let mut latest_service_sale_by_service = BTreeMap::new();
        let mut latest_order_by_sku = BTreeMap::new();
        let mut latest_receipt_by_sku = BTreeMap::new();
        let mut latest_tickets_by_id = BTreeMap::new();
        let mut latest_delivery_fee_by_bucket = BTreeMap::new();

        let anchor_count: i64 = connection.query_row(
            "SELECT COUNT(*) FROM sena_record_update_anchor_hot WHERE owner_sub = ?1",
            params![owner_sub],
            |row| row.get(0),
        )?;
        if observation_fingerprint.count > 0 && anchor_count == 0 {
            rebuild_record_update_anchors_locked(&connection, owner_sub)?;
        }

        let mut stmt = connection.prepare(
            r#"
            SELECT anchor_kind, entity_id, observation_id, observed_at, payload_json
            FROM sena_record_update_anchor_hot
            WHERE owner_sub = ?1
            ORDER BY anchor_kind ASC, entity_id ASC
            "#,
        )?;
        let rows = stmt.query_map(params![owner_sub], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
            ))
        })?;
        for row in rows {
            let (anchor_kind, entity_id, observation_id, observed_at, payload) = row?;
            match anchor_kind.as_str() {
                "stock" => {
                    latest_stock_by_sku.insert(entity_id.clone(), SenaRecordUpdateAnchor {
                        observation_id: observation_id.clone(),
                        observed_at: observed_at.clone(),
                        value: serde_json::from_str(&payload)?,
                    });
                }
                "retail_sale" => {
                    latest_retail_sale_by_sku.insert(entity_id.clone(), SenaRecordUpdateAnchor {
                        observation_id: observation_id.clone(),
                        observed_at: observed_at.clone(),
                        value: serde_json::from_str(&payload)?,
                    });
                }
                "service_sale" => {
                    latest_service_sale_by_service.insert(entity_id.clone(), SenaRecordUpdateAnchor {
                        observation_id: observation_id.clone(),
                        observed_at: observed_at.clone(),
                        value: serde_json::from_str(&payload)?,
                    });
                }
                "order" => {
                    latest_order_by_sku.insert(entity_id.clone(), SenaRecordUpdateAnchor {
                        observation_id: observation_id.clone(),
                        observed_at: observed_at.clone(),
                        value: serde_json::from_str(&payload)?,
                    });
                }
                "receipt" => {
                    latest_receipt_by_sku.insert(entity_id.clone(), SenaRecordUpdateAnchor {
                        observation_id: observation_id.clone(),
                        observed_at: observed_at.clone(),
                        value: serde_json::from_str(&payload)?,
                    });
                }
                "ticket" => {
                    latest_tickets_by_id.insert(entity_id.clone(), SenaRecordUpdateAnchor {
                        observation_id: observation_id.clone(),
                        observed_at: observed_at.clone(),
                        value: serde_json::from_str::<SenaTicketSummary>(&payload)?,
                    });
                }
                "delivery_fee" => {
                    latest_delivery_fee_by_bucket.insert(entity_id.clone(), SenaRecordUpdateAnchor {
                        observation_id: observation_id.clone(),
                        observed_at: observed_at.clone(),
                        value: serde_json::from_str(&payload)?,
                    });
                }
                _ => {}
            }
        }
        let recent_activity = load_recent_record_activity_locked(&connection, owner_sub, 24)?;
        let mut customer_tickets = latest_tickets_by_id
            .values()
            .filter(|anchor| {
                anchor.value.ticket_family == SenaTicketFamily::Customer
                    && anchor.value.lifecycle == SenaTicketLifecycle::Open
            })
            .map(|anchor| anchor.value.clone())
            .collect::<Vec<_>>();
        let mut supplier_tickets = latest_tickets_by_id
            .values()
            .filter(|anchor| {
                anchor.value.ticket_family == SenaTicketFamily::Supplier
                    && anchor.value.lifecycle == SenaTicketLifecycle::Open
            })
            .map(|anchor| anchor.value.clone())
            .collect::<Vec<_>>();
        customer_tickets.sort_by(|left, right| {
            right
                .occurred_at
                .cmp(&left.occurred_at)
                .then_with(|| right.ticket_id.cmp(&left.ticket_id))
        });
        supplier_tickets.sort_by(|left, right| {
            right
                .occurred_at
                .cmp(&left.occurred_at)
                .then_with(|| right.ticket_id.cmp(&left.ticket_id))
        });
        Ok(SenaRecordUpdateContext {
            latest_observed_at: observation_fingerprint.latest_observed_at.clone(),
            observation_fingerprint,
            latest_stock_by_sku,
            latest_retail_sale_by_sku,
            latest_service_sale_by_service,
            latest_order_by_sku,
            latest_receipt_by_sku,
            open_tickets_by_family: SenaRecordUpdateOpenTickets {
                customer: customer_tickets,
                supplier: supplier_tickets,
            },
            latest_tickets_by_id,
            latest_delivery_fee_by_bucket,
            recent_activity,
        })
    }

    async fn list_order_batches(
        &self,
        owner_sub: &str,
        filters: Option<&SenaOrderLookupPayload>,
    ) -> Result<Vec<SenaOrderBatchRecord>> {
        let connection = self
            .connection
            .lock()
            .map_err(|_| anyhow!("sqlite lock poisoned"))?;
        let mut batches = load_all_batches(&connection, owner_sub)?;
        if let Some(filters) = filters {
            batches.retain(|batch| {
                if let Some(batch_order_id) = &filters.batch_order_id {
                    if &batch.batch_order_id != batch_order_id {
                        return false;
                    }
                }
                if let Some(supplier_name) = &filters.supplier_name {
                    if batch.supplier_name.as_deref() != Some(supplier_name.as_str()) {
                        return false;
                    }
                }
                if let Some(status) = filters.status {
                    if batch.status != status {
                        return false;
                    }
                }
                if let Some(child_order_id) = &filters.child_order_id {
                    if !batch.children.iter().any(|child| &child.child_order_id == child_order_id) {
                        return false;
                    }
                }
                if let Some(sku_id) = &filters.sku_id {
                    if !batch.children.iter().any(|child| &child.sku_id == sku_id) {
                        return false;
                    }
                }
                true
            });
        }
        Ok(batches)
    }

    async fn create_order_batch(
        &self,
        owner_sub: &str,
        payload: &SenaCreateOrderBatchPayload,
    ) -> Result<SenaOrderBatchRecord> {
        if payload.children.is_empty() {
            return Err(anyhow!("order batch requires at least one child"));
        }
        let now = now_rfc3339();
        let batch_order_id = build_batch_order_id(&now, payload.supplier_name.as_deref().or(payload.shared.supplier_name.as_deref()));
        let shared = SenaOrderFieldValues {
            supplier_name: payload
                .supplier_name
                .clone()
                .or_else(|| payload.shared.supplier_name.clone()),
            ..payload.shared.clone()
        };
        let mut batch = SenaOrderBatchRecord {
            batch_order_id: batch_order_id.clone(),
            owner_sub: owner_sub.to_string(),
            supplier_name: payload
                .supplier_name
                .clone()
                .or_else(|| payload.shared.supplier_name.clone()),
            status: SenaOrderBatchStatus::Open,
            created_at: now.clone(),
            updated_at: now.clone(),
            shared,
            children: payload
                .children
                .iter()
                .map(|child| SenaOrderChildRecord {
                    child_order_id: build_child_order_id(&batch_order_id, &child.sku_id),
                    sku_id: child.sku_id.clone(),
                    status: SenaOrderChildStatus::Open,
                    created_at: now.clone(),
                    updated_at: now.clone(),
                    inherited_from_batch: child.overrides.is_none(),
                    effective: SenaOrderFieldValues::default(),
                    overrides: child.overrides.clone().unwrap_or_default(),
                })
                .collect(),
        };
        refresh_batch(&mut batch);
        let connection = self
            .connection
            .lock()
            .map_err(|_| anyhow!("sqlite lock poisoned"))?;
        persist_batch(&connection, &batch)?;
        Ok(batch)
    }

    async fn update_order_batch(
        &self,
        owner_sub: &str,
        payload: &SenaUpdateOrderBatchPayload,
    ) -> Result<SenaOrderBatchRecord> {
        let connection = self
            .connection
            .lock()
            .map_err(|_| anyhow!("sqlite lock poisoned"))?;
        let mut batch = load_all_batches(&connection, owner_sub)?
            .into_iter()
            .find(|batch| batch.batch_order_id == payload.batch_order_id)
            .ok_or_else(|| anyhow!("order batch not found"))?;
        let now = now_rfc3339();
        if let Some(shared) = &payload.shared {
            batch.shared = merge_order_fields(&batch.shared, shared);
        }
        if let Some(supplier_name) = &payload.supplier_name {
            batch.supplier_name = Some(supplier_name.clone());
            batch.shared.supplier_name = Some(supplier_name.clone());
        }
        if let Some(status) = payload.status {
            batch.status = status;
        }
        batch.updated_at = now.clone();
        for child in &mut batch.children {
            child.updated_at = now.clone();
        }
        refresh_batch(&mut batch);
        if let Some(status) = payload.status {
            batch.status = status;
        }
        persist_batch(&connection, &batch)?;
        Ok(batch)
    }

    async fn update_order_child(
        &self,
        owner_sub: &str,
        payload: &SenaUpdateOrderChildPayload,
    ) -> Result<SenaOrderBatchRecord> {
        let connection = self
            .connection
            .lock()
            .map_err(|_| anyhow!("sqlite lock poisoned"))?;
        let mut batch = load_all_batches(&connection, owner_sub)?
            .into_iter()
            .find(|batch| {
                batch.children.iter().any(|child| child.child_order_id == payload.child_order_id)
            })
            .ok_or_else(|| anyhow!("order child not found"))?;
        let now = now_rfc3339();
        let child = batch
            .children
            .iter_mut()
            .find(|child| child.child_order_id == payload.child_order_id)
            .ok_or_else(|| anyhow!("order child not found"))?;
        if let Some(sku_id) = &payload.sku_id {
            child.sku_id = sku_id.clone();
        }
        if let Some(overrides) = &payload.overrides {
            child.overrides = merge_order_fields(&child.overrides, overrides);
        }
        if let Some(note) = &payload.append_supplier_note {
            let mut joined = batch.shared.supplier_note.clone().unwrap_or_default();
            if !joined.is_empty() && !note.trim().is_empty() {
                joined.push('\n');
            }
            joined.push_str(note.trim());
            batch.shared.supplier_note = if joined.trim().is_empty() {
                None
            } else {
                Some(joined)
            };
        }
        child.updated_at = now.clone();
        if let Some(status) = payload.status {
            child.status = status;
        }
        batch.updated_at = now;
        refresh_batch(&mut batch);
        if let Some(status) = payload.status {
            let child = batch
                .children
                .iter_mut()
                .find(|child| child.child_order_id == payload.child_order_id)
                .ok_or_else(|| anyhow!("order child not found"))?;
            child.status = status;
            batch.status = order_batch_status(&batch.children);
        }
        persist_batch(&connection, &batch)?;
        Ok(batch)
    }

    async fn split_order_child(
        &self,
        owner_sub: &str,
        payload: &SenaSplitOrderChildPayload,
    ) -> Result<SenaOrderBatchRecord> {
        let connection = self
            .connection
            .lock()
            .map_err(|_| anyhow!("sqlite lock poisoned"))?;
        let mut batches = load_all_batches(&connection, owner_sub)?;
        let source_index = batches
            .iter()
            .position(|batch| {
                batch.children.iter().any(|child| child.child_order_id == payload.child_order_id)
            })
            .ok_or_else(|| anyhow!("order child not found"))?;
        let mut source = batches.remove(source_index);
        let child_index = source
            .children
            .iter()
            .position(|child| child.child_order_id == payload.child_order_id)
            .ok_or_else(|| anyhow!("order child not found"))?;
        let child = source.children.remove(child_index);
        if source.children.is_empty() {
            connection.execute(
                "DELETE FROM sena_order_child_lookup WHERE batch_order_id = ?1",
                params![source.batch_order_id],
            )?;
            connection.execute(
                "DELETE FROM sena_order_batch WHERE batch_order_id = ?1",
                params![source.batch_order_id],
            )?;
        } else {
            source.updated_at = now_rfc3339();
            refresh_batch(&mut source);
            persist_batch(&connection, &source)?;
        }
        let now = now_rfc3339();
        let new_batch_id = build_batch_order_id(&now, source.supplier_name.as_deref());
        let mut new_batch = SenaOrderBatchRecord {
            batch_order_id: new_batch_id.clone(),
            owner_sub: owner_sub.to_string(),
            supplier_name: source.supplier_name.clone(),
            status: SenaOrderBatchStatus::Open,
            created_at: now.clone(),
            updated_at: now.clone(),
            shared: source.shared.clone(),
            children: vec![SenaOrderChildRecord {
                child_order_id: build_child_order_id(&new_batch_id, &child.sku_id),
                sku_id: child.sku_id,
                status: child.status,
                created_at: now.clone(),
                updated_at: now.clone(),
                inherited_from_batch: child.inherited_from_batch,
                effective: child.effective,
                overrides: child.overrides,
            }],
        };
        refresh_batch(&mut new_batch);
        persist_batch(&connection, &new_batch)?;
        Ok(new_batch)
    }

    async fn create_run(
        &self,
        owner_sub: &str,
        algorithm_version: &str,
    ) -> Result<SenaAnalysisRunRecord> {
        let observations = self.list_observations(owner_sub).await?;
        let record = SenaAnalysisRunRecord {
            run_id: Uuid::new_v4().to_string(),
            owner_sub: owner_sub.to_string(),
            algorithm_version: algorithm_version.to_string(),
            status: SenaRunStatus::Queued,
            observation_count: observations.len(),
            created_at: now_rfc3339(),
            completed_at: None,
            summary: None,
            diagnostics: None,
            primary_artifact_key: None,
            error: None,
        };
        let connection = self
            .connection
            .lock()
            .map_err(|_| anyhow!("sqlite lock poisoned"))?;
        connection.execute(
            r#"
            INSERT INTO sena_run (
              run_id, owner_sub, algorithm_version, status, observation_count, created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            "#,
            params![
                record.run_id,
                record.owner_sub,
                record.algorithm_version,
                "queued",
                record.observation_count as i64,
                record.created_at,
            ],
        )?;
        Ok(record)
    }

    async fn get_run(&self, run_id: &str) -> Result<Option<SenaAnalysisRunRecord>> {
        let connection = self
            .connection
            .lock()
            .map_err(|_| anyhow!("sqlite lock poisoned"))?;
        let row = connection
            .query_row(
                r#"
                SELECT owner_sub, algorithm_version, status, observation_count, created_at, completed_at,
                       summary_json, diagnostics_json, primary_artifact_key, error
                FROM sena_run
                WHERE run_id = ?1
                "#,
                params![run_id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, i64>(3)? as usize,
                        row.get::<_, String>(4)?,
                        row.get::<_, Option<String>>(5)?,
                        row.get::<_, Option<String>>(6)?,
                        row.get::<_, Option<String>>(7)?,
                        row.get::<_, Option<String>>(8)?,
                        row.get::<_, Option<String>>(9)?,
                    ))
                }
            )
            .optional()?;
        let Some(row) = row else {
            return Ok(None);
        };
        let summary = row
            .6
            .map(|value| serde_json::from_str(&value))
            .transpose()?;
        let diagnostics = row
            .7
            .map(|value| serde_json::from_str(&value))
            .transpose()?;
        Ok(Some(SenaAnalysisRunRecord {
            run_id: run_id.to_string(),
            owner_sub: row.0,
            algorithm_version: row.1,
            status: parse_run_status(&row.2),
            observation_count: row.3,
            created_at: row.4,
            completed_at: row.5,
            summary,
            diagnostics,
            primary_artifact_key: row.8,
            error: row.9,
        }))
    }

    async fn get_latest_run(&self, owner_sub: &str) -> Result<Option<SenaAnalysisRunRecord>> {
        let run_id = {
            let connection = self
                .connection
                .lock()
                .map_err(|_| anyhow!("sqlite lock poisoned"))?;
            connection
                .query_row(
                    "SELECT run_id FROM sena_run WHERE owner_sub = ?1 ORDER BY created_at DESC LIMIT 1",
                    params![owner_sub],
                    |row| row.get::<_, String>(0),
                )
                .optional()?
        };
        match run_id {
            Some(value) => self.get_run(&value).await,
            None => Ok(None),
        }
    }

    async fn persist_completed_run(
        &self,
        run_id: &str,
        result: &SenaAnalysisResult,
        artifact_key: Option<&str>,
    ) -> Result<()> {
        let completed_at = now_rfc3339();
        let connection = self
            .connection
            .lock()
            .map_err(|_| anyhow!("sqlite lock poisoned"))?;
        let owner_sub = result.workspace_summary.owner_sub.clone();
        let mut summary = result.workspace_summary.clone();
        summary.run_id = run_id.to_string();
        let updated_at = now_rfc3339();
        connection.execute(
            r#"
            UPDATE sena_run
            SET status = 'succeeded',
                completed_at = ?2,
                summary_json = ?3,
                diagnostics_json = ?4,
                primary_artifact_key = ?5,
                error = NULL
            WHERE run_id = ?1
            "#,
            params![
                run_id,
                completed_at,
                serde_json::to_string(&summary)?,
                serde_json::to_string(&result.diagnostics)?,
                artifact_key.map(str::to_string),
            ],
        )?;
        connection.execute(
            r#"
            INSERT INTO sena_read_model (
              owner_sub, workspace_summary_json, diagnostics_json, sku_details_json, service_details_json, updated_at, run_id
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            ON CONFLICT(owner_sub) DO UPDATE SET
              workspace_summary_json = excluded.workspace_summary_json,
              diagnostics_json = excluded.diagnostics_json,
              sku_details_json = excluded.sku_details_json,
              service_details_json = excluded.service_details_json,
              updated_at = excluded.updated_at,
              run_id = excluded.run_id
            "#,
            params![
                owner_sub,
                serde_json::to_string(&summary)?,
                serde_json::to_string(&result.diagnostics)?,
                "[]",
                "[]",
                updated_at,
                run_id,
            ],
        )?;
        persist_hot_workspace_summary(&connection, &summary, &updated_at)?;
        for detail in &result.sku_details {
            connection.execute(
                r#"
                INSERT INTO sena_sku_detail (owner_sub, sku_id, payload_json, updated_at, run_id)
                VALUES (?1, ?2, ?3, ?4, ?5)
                ON CONFLICT(owner_sub, sku_id) DO UPDATE SET
                  payload_json = excluded.payload_json,
                  updated_at = excluded.updated_at,
                  run_id = excluded.run_id
                "#,
                params![
                    owner_sub,
                    detail.summary.sku_id,
                    serde_json::to_string(detail)?,
                    updated_at,
                    run_id,
                ],
            )?;
        }
        for detail in &result.service_details {
            connection.execute(
                r#"
                INSERT INTO sena_service_detail (owner_sub, service_id, payload_json, updated_at, run_id)
                VALUES (?1, ?2, ?3, ?4, ?5)
                ON CONFLICT(owner_sub, service_id) DO UPDATE SET
                  payload_json = excluded.payload_json,
                  updated_at = excluded.updated_at,
                  run_id = excluded.run_id
                "#,
                params![
                    owner_sub,
                    detail.service_id,
                    serde_json::to_string(detail)?,
                    updated_at,
                    run_id,
                ],
            )?;
        }
        Ok(())
    }

    async fn load_preprocessed_workspace(
        &self,
        owner_sub: &str,
        algorithm_version: &str,
        catalog_fingerprint: &str,
        observation_fingerprint: &str,
    ) -> Result<Option<PreprocessedWorkspace>> {
        let connection = self
            .connection
            .lock()
            .map_err(|_| anyhow!("sqlite lock poisoned"))?;
        let value = connection
            .query_row(
                r#"
                SELECT payload_json
                FROM sena_preprocessed_cache
                WHERE owner_sub = ?1
                  AND algorithm_version = ?2
                  AND catalog_fingerprint = ?3
                  AND observation_fingerprint = ?4
                "#,
                params![
                    owner_sub,
                    algorithm_version,
                    catalog_fingerprint,
                    observation_fingerprint
                ],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        value
            .map(|raw| serde_json::from_str(&raw).map_err(anyhow::Error::new))
            .transpose()
    }

    async fn save_preprocessed_workspace(
        &self,
        owner_sub: &str,
        algorithm_version: &str,
        catalog_fingerprint: &str,
        observation_fingerprint: &str,
        workspace: &PreprocessedWorkspace,
    ) -> Result<()> {
        let connection = self
            .connection
            .lock()
            .map_err(|_| anyhow!("sqlite lock poisoned"))?;
        connection.execute(
            r#"
            INSERT INTO sena_preprocessed_cache (
              owner_sub, algorithm_version, catalog_fingerprint, observation_fingerprint, payload_json, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            ON CONFLICT(owner_sub, algorithm_version, catalog_fingerprint, observation_fingerprint)
            DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at
            "#,
            params![
                owner_sub,
                algorithm_version,
                catalog_fingerprint,
                observation_fingerprint,
                serde_json::to_string(workspace)?,
                now_rfc3339(),
            ],
        )?;
        Ok(())
    }

    async fn list_analysis_checkpoints(
        &self,
        owner_sub: &str,
        algorithm_version: &str,
        catalog_fingerprint: &str,
    ) -> Result<Vec<SenaAnalysisCheckpoint>> {
        let connection = self
            .connection
            .lock()
            .map_err(|_| anyhow!("sqlite lock poisoned"))?;
        let mut stmt = connection.prepare(
            r#"
            SELECT payload_json, payload_codec, payload_path
            FROM sena_analysis_checkpoint
            WHERE owner_sub = ?1
              AND algorithm_version = ?2
              AND catalog_fingerprint = ?3
            ORDER BY observation_count DESC, completed_interval_count DESC
            "#,
        )?;
        let rows = stmt.query_map(
            params![owner_sub, algorithm_version, catalog_fingerprint],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, Option<String>>(2)?,
                ))
            },
        )?;
        let mut checkpoints = Vec::new();
        for row in rows {
            let (payload_json, payload_codec, payload_path) = row?;
            if payload_codec.as_deref() == Some("zstd") {
                let path = payload_path.ok_or_else(|| anyhow!("checkpoint payload path missing"))?;
                let compressed = fs::read(path)?;
                let raw = zstd::decode_all(&compressed[..])?;
                checkpoints.push(serde_json::from_slice(&raw)?);
            } else {
                checkpoints.push(serde_json::from_str(&payload_json)?);
            }
        }
        Ok(checkpoints)
    }

    async fn save_analysis_checkpoint(&self, checkpoint: &SenaAnalysisCheckpoint) -> Result<()> {
        let payload = serde_json::to_vec(checkpoint)?;
        let compressed = zstd::encode_all(&payload[..], 3)?;
        let payload_path = self.checkpoint_payload_path(checkpoint);
        if let Some(parent) = payload_path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&payload_path, &compressed)?;
        let connection = self
            .connection
            .lock()
            .map_err(|_| anyhow!("sqlite lock poisoned"))?;
        connection.execute(
            r#"
            INSERT INTO sena_analysis_checkpoint (
              owner_sub,
              algorithm_version,
              catalog_fingerprint,
              observation_count,
              completed_interval_count,
              observation_prefix_fingerprint,
              payload_json,
              payload_codec,
              payload_path,
              payload_bytes,
              updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
            ON CONFLICT(owner_sub, algorithm_version, catalog_fingerprint, completed_interval_count)
            DO UPDATE SET
              observation_count = excluded.observation_count,
              observation_prefix_fingerprint = excluded.observation_prefix_fingerprint,
              payload_json = excluded.payload_json,
              payload_codec = excluded.payload_codec,
              payload_path = excluded.payload_path,
              payload_bytes = excluded.payload_bytes,
              updated_at = excluded.updated_at
            "#,
            params![
                &checkpoint.metadata.owner_sub,
                &checkpoint.metadata.algorithm_version,
                &checkpoint.metadata.catalog_fingerprint,
                checkpoint.metadata.observation_count as i64,
                checkpoint.metadata.completed_interval_count as i64,
                &checkpoint.metadata.observation_prefix_fingerprint,
                "",
                "zstd",
                payload_path.to_string_lossy().as_ref(),
                compressed.len() as i64,
                now_rfc3339(),
            ],
        )?;
        let stale_paths = {
            let mut stmt = connection.prepare(
                r#"
                SELECT payload_path
                FROM sena_analysis_checkpoint
                WHERE owner_sub = ?1
                  AND algorithm_version = ?2
                  AND catalog_fingerprint = ?3
                  AND completed_interval_count NOT IN (
                    SELECT completed_interval_count
                    FROM sena_analysis_checkpoint
                    WHERE owner_sub = ?1
                      AND algorithm_version = ?2
                      AND catalog_fingerprint = ?3
                    ORDER BY observation_count DESC, completed_interval_count DESC
                    LIMIT 1
                  )
                "#,
            )?;
            let rows = stmt.query_map(
                params![
                    &checkpoint.metadata.owner_sub,
                    &checkpoint.metadata.algorithm_version,
                    &checkpoint.metadata.catalog_fingerprint,
                ],
                |row| row.get::<_, Option<String>>(0),
            )?;
            let mut paths = Vec::new();
            for row in rows {
                if let Some(path) = row? {
                    paths.push(path);
                }
            }
            paths
        };
        connection.execute(
            r#"
            DELETE FROM sena_analysis_checkpoint
            WHERE owner_sub = ?1
              AND algorithm_version = ?2
              AND catalog_fingerprint = ?3
              AND completed_interval_count NOT IN (
                SELECT completed_interval_count
                FROM sena_analysis_checkpoint
                WHERE owner_sub = ?1
                  AND algorithm_version = ?2
                  AND catalog_fingerprint = ?3
                ORDER BY observation_count DESC, completed_interval_count DESC
                LIMIT 1
              )
            "#,
            params![
                &checkpoint.metadata.owner_sub,
                &checkpoint.metadata.algorithm_version,
                &checkpoint.metadata.catalog_fingerprint,
            ],
        )?;
        for path in stale_paths {
            let _ = fs::remove_file(path);
        }
        Ok(())
    }

    async fn mark_run_failed(&self, run_id: &str, error: &str) -> Result<()> {
        let connection = self
            .connection
            .lock()
            .map_err(|_| anyhow!("sqlite lock poisoned"))?;
        connection.execute(
            "UPDATE sena_run SET status = 'failed', completed_at = ?2, error = ?3 WHERE run_id = ?1",
            params![run_id, now_rfc3339(), error],
        )?;
        Ok(())
    }

    async fn load_workspace_summary(
        &self,
        owner_sub: &str,
    ) -> Result<Option<SenaWorkspaceSummary>> {
        let connection = self
            .connection
            .lock()
            .map_err(|_| anyhow!("sqlite lock poisoned"))?;
        if let Some(summary) = load_hot_workspace_summary(&connection, owner_sub)? {
            return Ok(Some(summary));
        }
        let value = connection
            .query_row(
                "SELECT workspace_summary_json FROM sena_read_model WHERE owner_sub = ?1",
                params![owner_sub],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        let summary = value
            .map(|raw| serde_json::from_str(&raw).map_err(anyhow::Error::new))
            .transpose()?;
        if let Some(summary) = &summary {
            persist_hot_workspace_summary(&connection, summary, &now_rfc3339())?;
        }
        Ok(summary)
    }

    async fn load_sku_detail(
        &self,
        owner_sub: &str,
        sku_id: &str,
    ) -> Result<Option<SenaSkuDetail>> {
        let connection = self
            .connection
            .lock()
            .map_err(|_| anyhow!("sqlite lock poisoned"))?;
        let value = connection
            .query_row(
                "SELECT payload_json FROM sena_sku_detail WHERE owner_sub = ?1 AND sku_id = ?2",
                params![owner_sub, sku_id],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        value
            .map(|raw| serde_json::from_str(&raw).map_err(anyhow::Error::new))
            .transpose()
    }

    async fn load_service_detail(
        &self,
        owner_sub: &str,
        service_id: &str,
    ) -> Result<Option<SenaServiceDetail>> {
        let lock_started_at = Instant::now();
        let (value, lock_duration, query_duration) = {
            let connection = self
                .connection
                .lock()
                .map_err(|_| anyhow!("sqlite lock poisoned"))?;
            let lock_duration = lock_started_at.elapsed();
            let query_started_at = Instant::now();
            let value = connection
                .query_row(
                    "SELECT payload_json FROM sena_service_detail WHERE owner_sub = ?1 AND service_id = ?2",
                    params![owner_sub, service_id],
                    |row| row.get::<_, String>(0),
                )
                .optional()?;
            (value, lock_duration, query_started_at.elapsed())
        };
        benchmark::record_duration(
            "core.service-detail.sqlite.lock",
            Some("sena.getServiceDetail"),
            lock_duration,
            json!({
                "ownerSub": owner_sub,
                "serviceId": service_id,
            }),
        );
        benchmark::record_duration(
            "core.service-detail.sqlite.query",
            Some("sena.getServiceDetail"),
            query_duration,
            json!({
                "hit": value.is_some(),
                "ownerSub": owner_sub,
                "serviceId": service_id,
            }),
        );
        benchmark::record_instant(
            "core.service-detail.sqlite.row",
            Some("sena.getServiceDetail"),
            json!({
                "hit": value.is_some(),
                "ownerSub": owner_sub,
                "payloadBytes": value.as_ref().map(|raw| raw.len()).unwrap_or(0),
                "serviceId": service_id,
            }),
        );
        value
            .map(|raw| {
                let deserialize_started_at = Instant::now();
                let parsed = serde_json::from_str(&raw).map_err(anyhow::Error::new);
                benchmark::record_duration(
                    "core.service-detail.sqlite.deserialize",
                    Some("sena.getServiceDetail"),
                    deserialize_started_at.elapsed(),
                    json!({
                        "ok": parsed.is_ok(),
                        "payloadBytes": raw.len(),
                        "serviceId": service_id,
                    }),
                );
                parsed
            })
            .transpose()
    }

    async fn load_diagnostics(&self, owner_sub: &str) -> Result<Option<SenaDiagnostics>> {
        let connection = self
            .connection
            .lock()
            .map_err(|_| anyhow!("sqlite lock poisoned"))?;
        let value = connection
            .query_row(
                "SELECT diagnostics_json FROM sena_read_model WHERE owner_sub = ?1",
                params![owner_sub],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        value
            .map(|raw| serde_json::from_str(&raw).map_err(anyhow::Error::new))
            .transpose()
    }
}

fn parse_run_status(value: &str) -> SenaRunStatus {
    match value {
        "running" => SenaRunStatus::Running,
        "succeeded" => SenaRunStatus::Succeeded,
        "failed" => SenaRunStatus::Failed,
        _ => SenaRunStatus::Queued,
    }
}

#[cfg(test)]
mod tests {
    use super::SqliteSenaRepository;
    use crate::{
        build_checkpoint_metadata, fingerprint_catalog, preprocess_workspace,
        service::SenaRepository, PreprocessedWorkspace, SenaCatalog,
        SenaCreateOrderBatchPayload, SenaLeadTimeHint, SenaObservationInput,
        SenaObservationPageRequest, SenaObservationRecord, SenaOrderFieldValues,
        SenaOrderSignal, SenaService, SenaServicePriceObservation,
        SenaServiceSkuMaskEntry, SenaSku, SenaSplitOrderChildPayload, SenaStockSnapshot,
        SenaUpdateOrderBatchPayload, SenaUpdateOrderChildPayload,
    };
    use crate::lead_time::SenaLeadTimeVariabilityClass;
    use crate::types::{
        SenaDeliveryFeeBucket, SenaDeliveryFeeMetadata, SenaDeliveryFeePayer,
        SenaTicketEvent, SenaTicketEventType, SenaTicketFamily, SenaTicketLifecycle,
        SenaTicketLine, SenaTicketPartyMetadata, SenaTicketStage,
    };
    use futures::executor::block_on;
    use rusqlite::params;
    use std::{
        env,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    fn temp_store_path(label: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after epoch")
            .as_nanos();
        env::temp_dir().join(format!("banji-sena-core-{label}-{nonce}.sqlite3"))
    }

    fn sample_catalog() -> SenaCatalog {
        SenaCatalog {
            schema_version: crate::types::SENA_SCHEMA_VERSION,
            skus: vec![SenaSku {
                sku_id: "sku-1".to_string(),
                name: "SKU 1".to_string(),
                description: "Inventory".to_string(),
                image_path: None,
                supplier_name: Some("Seed supplier".to_string()),
                cost_per_unit: 2.0,
                archived: false,
                sold_as_product: true,
                product_price: Some(5.0),
                lead_time_mean_days_hint: Some(2.0),
                lead_time_std_days_hint: Some(1.0),
            }],
            services: vec![SenaService {
                service_id: "svc-1".to_string(),
                name: "Service".to_string(),
                description: "Linked service".to_string(),
                image_path: None,
                price: 10.0,
                archived: false,
                bundle: true,
            }],
            bundles: Vec::new(),
            sharing_mask: vec![SenaServiceSkuMaskEntry {
                service_id: "svc-1".to_string(),
                sku_id: "sku-1".to_string(),
                enabled: true,
                usage_probability: Some(1.0),
            }],
        }
    }

    fn observation(observed_at: &str, units_in_stock: f64) -> SenaObservationRecord {
        SenaObservationRecord {
            observation_id: format!("obs-{observed_at}"),
            owner_sub: "owner".to_string(),
            input: SenaObservationInput {
                observed_at: observed_at.to_string(),
                stock_snapshot: vec![SenaStockSnapshot {
                    sku_id: "sku-1".to_string(),
                    units_in_stock,
                    cost_per_unit: Some(2.0),
                    product_price: Some(5.0),
                }],
                retail_sales_snapshot: Vec::new(),
                service_sales_snapshot: Vec::new(),
                service_rankings: vec!["svc-1".to_string()],
                retail_rankings: vec!["sku-1".to_string()],
                service_stockouts: Vec::new(),
                retail_stockouts: Vec::new(),
                order_signals: vec![SenaOrderSignal {
                    sku_id: "sku-1".to_string(),
                    order_placed: false,
                    receipt_arrived: false,
                    approximate_order_quantity: None,
                    approximate_receipt_quantity: None,
                    placement_timestamp: None,
                    receipt_timestamp: None,
                    lead_time_days_hint: Some(2.0),
                }],
                service_prices: vec![SenaServicePriceObservation {
                    service_id: "svc-1".to_string(),
                    price: 10.0,
                }],
                retail_prices: vec![crate::types::SenaRetailPriceObservation {
                    sku_id: "sku-1".to_string(),
                    price: 5.0,
                }],
                lead_time_hints: vec![SenaLeadTimeHint {
                    sku_id: "sku-1".to_string(),
                    typical_days: Some(2.0),
                    low_days: Some(1.0),
                    high_days: Some(3.0),
                    variability_class: None,
                }],
                regime_hint: None,
                adjustment_signals: Vec::new(),
                commercial_events: Vec::new(),
                ticket_events: Vec::new(),
                delivery_fee: None,
                recipe_usage_hints: Vec::new(),
                notes: None,
            },
        }
    }

    fn supplier_ticket_event(ticket_id: &str, observed_at: &str, lifecycle: SenaTicketLifecycle) -> SenaTicketEvent {
        SenaTicketEvent {
            ticket_id: ticket_id.to_string(),
            ticket_family: SenaTicketFamily::Supplier,
            lifecycle,
            stage: if lifecycle == SenaTicketLifecycle::Resolved {
                SenaTicketStage::Received
            } else {
                SenaTicketStage::OrderedWaiting
            },
            revision: 1,
            event_type: if lifecycle == SenaTicketLifecycle::Resolved {
                SenaTicketEventType::FullyReceived
            } else {
                SenaTicketEventType::Created
            },
            occurred_at: observed_at.to_string(),
            next_touch_at: None,
            party: Some(SenaTicketPartyMetadata {
                role: "supplier".to_string(),
                channel_key: None,
                channel_label: None,
                customer_name: None,
                customer_name_key: None,
                phone: None,
                phone_key: None,
                supplier_name: Some("Mekong Looms".to_string()),
            }),
            lines: vec![SenaTicketLine {
                entity_type: crate::types::SenaCommercialEntityType::Sku,
                entity_id: "sku-1".to_string(),
                quantity_delta: None,
                ordered_quantity: Some(4.0),
                received_quantity: if lifecycle == SenaTicketLifecycle::Resolved { Some(4.0) } else { None },
                promised_at: None,
                expected_arrival_at: None,
                unit_cost: Some(2.0),
                note: None,
            }],
            delivery_fee: Some(SenaDeliveryFeeMetadata {
                fee_usd: Some(1.25),
                payer: SenaDeliveryFeePayer::Merchant,
                bucket: SenaDeliveryFeeBucket::Supplier,
                subtotal_usd: Some(8.0),
                display_delivery_usd: Some(1.25),
                display_total_usd: Some(9.25),
                net_settlement_usd: Some(9.25),
            }),
            note: Some("Supplier ticket note".to_string()),
        }
    }

    fn insert_observation_with_id(
        repo: &SqliteSenaRepository,
        observation_id: &str,
        observed_at: &str,
        units_in_stock: f64,
    ) {
        let connection = repo
            .connection
            .lock()
            .expect("sqlite lock should be available");
        connection
            .execute(
                "INSERT INTO sena_observation (observation_id, owner_sub, observed_at, payload) VALUES (?1, ?2, ?3, ?4)",
                params![
                    observation_id,
                    "owner",
                    observed_at,
                    serde_json::to_string(&observation(observed_at, units_in_stock).input)
                        .expect("payload should serialize")
                ],
            )
            .expect("observation should insert");
    }

    fn sample_preprocessed_workspace() -> (
        SenaCatalog,
        Vec<SenaObservationRecord>,
        PreprocessedWorkspace,
    ) {
        let catalog = sample_catalog();
        let observations = vec![
            observation("2026-04-01T00:00:00Z", 14.0),
            observation("2026-04-02T00:00:00Z", 12.0),
            observation("2026-04-03T00:00:00Z", 10.0),
            observation("2026-04-04T00:00:00Z", 8.0),
            observation("2026-04-05T00:00:00Z", 6.0),
            observation("2026-04-06T00:00:00Z", 4.0),
            observation("2026-04-07T00:00:00Z", 3.0),
            observation("2026-04-08T00:00:00Z", 2.0),
            observation("2026-04-09T00:00:00Z", 1.0),
        ];
        let preprocessed =
            preprocess_workspace(&catalog, &observations).expect("preprocessing should succeed");
        (catalog, observations, preprocessed)
    }

    #[test]
    fn preprocessed_workspace_round_trips_through_sqlite() {
        let path = temp_store_path("preprocessed");
        let repo = SqliteSenaRepository::open(&path).expect("repo should open");
        let (catalog, observations, preprocessed) = sample_preprocessed_workspace();
        let catalog_fingerprint =
            fingerprint_catalog(&catalog).expect("catalog fingerprint should compute");
        let observation_fingerprint = crate::fingerprint_observations(&observations)
            .expect("observation fingerprint should compute");

        block_on(repo.save_preprocessed_workspace(
            "owner",
            "sena-analysis-v3",
            &catalog_fingerprint,
            &observation_fingerprint,
            &preprocessed,
        ))
        .expect("preprocessed workspace should save");

        let loaded = block_on(repo.load_preprocessed_workspace(
            "owner",
            "sena-analysis-v3",
            &catalog_fingerprint,
            &observation_fingerprint,
        ))
        .expect("preprocessed workspace should load")
        .expect("preprocessed workspace should exist");
        assert_eq!(preprocessed, loaded);
    }

    #[test]
    fn latest_checkpoint_ordering_round_trips_through_sqlite() {
        let path = temp_store_path("checkpoint");
        let repo = SqliteSenaRepository::open(&path).expect("repo should open");
        let (catalog, observations, preprocessed) = sample_preprocessed_workspace();
        let catalog_fingerprint =
            fingerprint_catalog(&catalog).expect("catalog fingerprint should compute");
        let first = crate::run_preprocessed_analysis(
            "owner",
            &catalog,
            &observations,
            "sena-analysis-v3",
            &preprocessed,
            None,
            Some(4),
        )
        .expect("analysis should succeed");

        for checkpoint in &first.checkpoints {
            block_on(repo.save_analysis_checkpoint(checkpoint)).expect("checkpoint should save");
        }

        let checkpoints = block_on(repo.list_analysis_checkpoints(
            "owner",
            "sena-analysis-v3",
            &catalog_fingerprint,
        ))
        .expect("checkpoints should load");
        assert_eq!(checkpoints.len(), 1);
        let (codec, payload_json, payload_path): (Option<String>, String, Option<String>) = {
            let connection = repo
                .connection
                .lock()
                .expect("sqlite lock should be available");
            connection
                .query_row(
                    "SELECT payload_codec, payload_json, payload_path FROM sena_analysis_checkpoint",
                    [],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                )
                .expect("checkpoint metadata should be readable")
        };
        assert_eq!(codec.as_deref(), Some("zstd"));
        assert!(payload_json.is_empty());
        assert!(
            std::path::Path::new(
                payload_path
                    .as_deref()
                    .expect("checkpoint payload path should be stored")
            )
            .is_file()
        );
        assert_eq!(
            checkpoints[0].metadata.completed_interval_count,
            first
                .checkpoints
                .iter()
                .map(|checkpoint| checkpoint.metadata.completed_interval_count)
                .max()
                .expect("at least one checkpoint should exist")
        );

        let metadata = build_checkpoint_metadata(
            "owner",
            "sena-analysis-v3",
            &catalog_fingerprint,
            &observations,
            checkpoints[0].metadata.completed_interval_count,
        )
        .expect("checkpoint metadata should rebuild");
        assert_eq!(
            metadata.observation_prefix_fingerprint,
            checkpoints[0].metadata.observation_prefix_fingerprint
        );
    }

    #[test]
    fn observations_can_be_updated_and_deleted() {
        let path = temp_store_path("observation-mutations");
        let repo = SqliteSenaRepository::open(&path).expect("repo should open");
        let inserted = block_on(repo.insert_observation(
            "owner",
            &observation("2026-04-01T00:00:00Z", 14.0).input,
        ))
        .expect("observation should insert");

        let mut updated_input = inserted.input.clone();
        updated_input.notes = Some("edited".to_string());
        updated_input.observed_at = "2026-04-02T00:00:00Z".to_string();

        let updated = block_on(repo.update_observation("owner", &inserted.observation_id, &updated_input))
            .expect("observation should update");
        assert_eq!(updated.observation_id, inserted.observation_id);
        assert_eq!(updated.input.notes.as_deref(), Some("edited"));

        let observations = block_on(repo.list_observations("owner")).expect("observations should load");
        assert_eq!(observations.len(), 1);
        assert_eq!(observations[0].input.observed_at, "2026-04-02T00:00:00Z");

        block_on(repo.delete_observation("owner", &inserted.observation_id))
            .expect("observation should delete");
        let remaining = block_on(repo.list_observations("owner")).expect("observations should load");
        assert!(remaining.is_empty());
    }

    #[test]
    fn observations_with_duplicate_timestamps_have_stable_order() {
        let path = temp_store_path("duplicate-observation-order");
        let repo = SqliteSenaRepository::open(&path).expect("repo should open");

        insert_observation_with_id(&repo, "obs-b", "2026-04-01T00:00:00Z", 14.0);
        insert_observation_with_id(&repo, "obs-a", "2026-04-01T00:00:00Z", 12.0);

        let observations = block_on(repo.list_observations("owner")).expect("observations should load");

        assert_eq!(
            observations
                .iter()
                .map(|observation| observation.observation_id.as_str())
                .collect::<Vec<_>>(),
            vec!["obs-a", "obs-b"]
        );
    }

    #[test]
    fn observation_fingerprint_uses_metadata_without_deserializing_observations() {
        let path = temp_store_path("observation-fingerprint");
        let repo = SqliteSenaRepository::open(&path).expect("repo should open");

        let empty = block_on(repo.get_observation_fingerprint("owner"))
            .expect("empty fingerprint should load");
        assert_eq!(empty.count, 0);
        assert_eq!(empty.latest_observed_at, None);
        assert_eq!(empty.latest_observation_id, None);

        let first = block_on(
            repo.insert_observation("owner", &observation("2026-04-01T00:00:00Z", 14.0).input),
        )
        .expect("first observation should insert");
        let single = block_on(repo.get_observation_fingerprint("owner"))
            .expect("single fingerprint should load");
        assert_eq!(single.count, 1);
        assert_eq!(
            single.latest_observed_at.as_deref(),
            Some("2026-04-01T00:00:00Z")
        );
        assert_eq!(
            single.latest_observation_id.as_deref(),
            Some(first.observation_id.as_str())
        );

        let latest = block_on(
            repo.insert_observation("owner", &observation("2026-04-03T00:00:00Z", 10.0).input),
        )
        .expect("latest observation should insert");
        let older = block_on(
            repo.insert_observation("owner", &observation("2026-04-02T00:00:00Z", 12.0).input),
        )
        .expect("older observation should insert");
        assert_ne!(older.observation_id, latest.observation_id);
        let fingerprint = block_on(repo.get_observation_fingerprint("owner"))
            .expect("multi-row fingerprint should load");
        assert_eq!(fingerprint.count, 3);
        assert_eq!(
            fingerprint.latest_observed_at.as_deref(),
            Some("2026-04-03T00:00:00Z")
        );
        assert_eq!(
            fingerprint.latest_observation_id.as_deref(),
            Some(latest.observation_id.as_str())
        );
    }

    #[test]
    fn observation_fingerprint_tiebreaks_latest_timestamp_by_id() {
        let path = temp_store_path("observation-fingerprint-tie");
        let repo = SqliteSenaRepository::open(&path).expect("repo should open");
        let connection = repo
            .connection
            .lock()
            .expect("sqlite lock should be available");
        connection
            .execute(
                "INSERT INTO sena_observation (observation_id, owner_sub, observed_at, payload) VALUES (?1, ?2, ?3, ?4)",
                params![
                    "obs-a",
                    "owner",
                    "2026-04-03T00:00:00Z",
                    serde_json::to_string(&observation("2026-04-03T00:00:00Z", 10.0).input)
                        .expect("payload should serialize")
                ],
            )
            .expect("first tied observation should insert");
        connection
            .execute(
                "INSERT INTO sena_observation (observation_id, owner_sub, observed_at, payload) VALUES (?1, ?2, ?3, ?4)",
                params![
                    "obs-z",
                    "owner",
                    "2026-04-03T00:00:00Z",
                    serde_json::to_string(&observation("2026-04-03T00:00:00Z", 8.0).input)
                        .expect("payload should serialize")
                ],
            )
            .expect("second tied observation should insert");
        drop(connection);

        let fingerprint =
            block_on(repo.get_observation_fingerprint("owner")).expect("fingerprint should load");
        assert_eq!(fingerprint.count, 2);
        assert_eq!(
            fingerprint.latest_observed_at.as_deref(),
            Some("2026-04-03T00:00:00Z")
        );
        assert_eq!(fingerprint.latest_observation_id.as_deref(), Some("obs-z"));
    }

    #[test]
    fn observation_pages_are_descending_and_cursor_stable() {
        let path = temp_store_path("observation-page");
        let repo = SqliteSenaRepository::open(&path).expect("repo should open");

        let empty = block_on(repo.list_observation_page("owner", None))
            .expect("empty page should load");
        assert!(empty.observations.is_empty());
        assert!(!empty.has_older);
        assert_eq!(empty.total_count, 0);

        insert_observation_with_id(&repo, "obs-c", "2026-04-01T00:00:00Z", 3.0);
        insert_observation_with_id(&repo, "obs-b", "2026-04-02T00:00:00Z", 2.0);
        insert_observation_with_id(&repo, "obs-a", "2026-04-03T00:00:00Z", 1.0);
        insert_observation_with_id(&repo, "obs-z", "2026-04-03T00:00:00Z", 4.0);

        let first = block_on(repo.list_observation_page(
            "owner",
            Some(&SenaObservationPageRequest {
                before_observed_at: None,
                before_observation_id: None,
                limit: Some(2),
            }),
        ))
        .expect("first page should load");
        assert_eq!(
            first
                .observations
                .iter()
                .map(|observation| observation.observation_id.as_str())
                .collect::<Vec<_>>(),
            vec!["obs-z", "obs-a"]
        );
        assert!(first.has_older);
        assert_eq!(first.total_count, 4);
        let cursor = first.next_cursor.expect("older cursor should exist");
        assert_eq!(cursor.observed_at, "2026-04-03T00:00:00Z");
        assert_eq!(cursor.observation_id, "obs-a");

        let next = block_on(repo.list_observation_page(
            "owner",
            Some(&SenaObservationPageRequest {
                before_observed_at: Some(cursor.observed_at),
                before_observation_id: Some(cursor.observation_id),
                limit: Some(10),
            }),
        ))
        .expect("next page should load");
        assert_eq!(
            next
                .observations
                .iter()
                .map(|observation| observation.observation_id.as_str())
                .collect::<Vec<_>>(),
            vec!["obs-b", "obs-c"]
        );
        assert!(!next.has_older);
        assert_eq!(next.latest_observed_at.as_deref(), Some("2026-04-03T00:00:00Z"));
    }

    #[test]
    fn record_update_context_tracks_latest_update_anchors() {
        let path = temp_store_path("record-update-context");
        let repo = SqliteSenaRepository::open(&path).expect("repo should open");

        let mut older = observation("2026-04-01T00:00:00Z", 8.0).input;
        older.retail_sales_snapshot = vec![crate::types::SenaRetailSalesSnapshot {
            sku_id: "sku-1".to_string(),
            units_sold: 2.0,
        }];
        block_on(repo.insert_observation("owner", &older)).expect("older observation should insert");

        let mut latest = observation("2026-04-02T00:00:00Z", 5.0).input;
        latest.service_sales_snapshot = vec![crate::types::SenaServiceSalesSnapshot {
            service_id: "svc-1".to_string(),
            units_sold: 3.0,
        }];
        latest.order_signals = vec![SenaOrderSignal {
            sku_id: "sku-1".to_string(),
            order_placed: true,
            receipt_arrived: true,
            approximate_order_quantity: Some(7.0),
            approximate_receipt_quantity: Some(6.0),
            placement_timestamp: Some("2026-04-02T01:00:00Z".to_string()),
            receipt_timestamp: Some("2026-04-02T02:00:00Z".to_string()),
            lead_time_days_hint: None,
        }];
        latest.ticket_events = vec![supplier_ticket_event(
            "ticket-supplier-1",
            "2026-04-02T03:00:00Z",
            SenaTicketLifecycle::Open,
        )];
        block_on(repo.insert_observation("owner", &latest)).expect("latest observation should insert");

        let context = block_on(repo.get_record_update_context("owner"))
            .expect("record update context should load");
        assert_eq!(context.observation_fingerprint.count, 2);
        assert_eq!(context.latest_observed_at.as_deref(), Some("2026-04-02T00:00:00Z"));
        assert_eq!(
            context
                .latest_stock_by_sku
                .get("sku-1")
                .expect("latest stock should exist")
                .value
                .units_in_stock,
            5.0
        );
        assert_eq!(
            context
                .latest_retail_sale_by_sku
                .get("sku-1")
                .expect("retail sale anchor should exist")
                .value
                .units_sold,
            2.0
        );
        assert_eq!(
            context
                .latest_service_sale_by_service
                .get("svc-1")
                .expect("service sale anchor should exist")
                .value
                .units_sold,
            3.0
        );
        assert_eq!(
            context
                .latest_order_by_sku
                .get("sku-1")
                .expect("order anchor should exist")
                .observed_at,
            "2026-04-02T01:00:00Z"
        );
        assert_eq!(
            context
                .latest_receipt_by_sku
                .get("sku-1")
                .expect("receipt anchor should exist")
                .observed_at,
            "2026-04-02T02:00:00Z"
        );
        let ticket = context
            .latest_tickets_by_id
            .get("ticket-supplier-1")
            .expect("ticket anchor should exist");
        assert_eq!(ticket.observed_at, "2026-04-02T03:00:00Z");
        assert_eq!(ticket.value.lines[0].entity_id, "sku-1");
        assert_eq!(context.open_tickets_by_family.supplier.len(), 1);
        assert_eq!(context.open_tickets_by_family.customer.len(), 0);
        assert_eq!(
            context
                .latest_delivery_fee_by_bucket
                .get("supplier")
                .expect("supplier delivery fee anchor should exist")
                .value
                .fee_usd,
            Some(1.25)
        );
        assert!(context
            .recent_activity
            .iter()
            .any(|entry| entry.activity_type == crate::types::SenaRecordActivityType::Ticket
                && entry.ticket_id.as_deref() == Some("ticket-supplier-1")));
    }

    #[test]
    fn record_update_context_recent_activity_keeps_multiple_ticket_revisions() {
        let path = temp_store_path("record-update-activity-revisions");
        let repo = SqliteSenaRepository::open(&path).expect("repo should open");

        let mut created = observation("2026-04-01T00:00:00Z", 8.0).input;
        let mut created_ticket = supplier_ticket_event(
            "ticket-supplier-1",
            "2026-04-01T01:00:00Z",
            SenaTicketLifecycle::Open,
        );
        created_ticket.revision = 1;
        created.ticket_events = vec![created_ticket];
        block_on(repo.insert_observation("owner", &created)).expect("created ticket should insert");

        let mut updated = observation("2026-04-02T00:00:00Z", 7.0).input;
        let mut updated_ticket = supplier_ticket_event(
            "ticket-supplier-1",
            "2026-04-02T01:00:00Z",
            SenaTicketLifecycle::Open,
        );
        updated_ticket.revision = 2;
        updated_ticket.note = Some("ETA updated".to_string());
        updated.ticket_events = vec![updated_ticket];
        block_on(repo.insert_observation("owner", &updated)).expect("updated ticket should insert");

        let context = block_on(repo.get_record_update_context("owner"))
            .expect("record update context should load");
        assert_eq!(
            context
                .latest_tickets_by_id
                .get("ticket-supplier-1")
                .expect("latest ticket anchor should exist")
                .value
                .revision,
            2
        );
        let ticket_revisions = context
            .recent_activity
            .iter()
            .filter(|entry| {
                entry.activity_type == crate::types::SenaRecordActivityType::Ticket
                    && entry.ticket_id.as_deref() == Some("ticket-supplier-1")
            })
            .map(|entry| entry.activity_id.clone())
            .collect::<Vec<_>>();
        assert!(ticket_revisions.iter().any(|id| id.ends_with(":ticket:ticket-supplier-1:1")));
        assert!(ticket_revisions.iter().any(|id| id.ends_with(":ticket:ticket-supplier-1:2")));
    }

    #[test]
    fn migration_backfills_record_update_anchor_rows_from_legacy_observations() {
        let path = temp_store_path("record-update-anchor-backfill");
        {
            let connection = rusqlite::Connection::open(&path).expect("legacy db should open");
            connection
                .execute_batch(
                    r#"
                    CREATE TABLE sena_observation (
                      observation_id TEXT PRIMARY KEY,
                      owner_sub TEXT NOT NULL,
                      observed_at TEXT NOT NULL,
                      payload TEXT NOT NULL
                    );
                    PRAGMA user_version = 2;
                    "#,
                )
                .expect("legacy schema should create");
            connection
                .execute(
                    "INSERT INTO sena_observation (observation_id, owner_sub, observed_at, payload) VALUES (?1, ?2, ?3, ?4)",
                    params![
                        "legacy-obs",
                        "owner",
                        "2026-04-01T00:00:00Z",
                        serde_json::to_string(&observation("2026-04-01T00:00:00Z", 12.0).input)
                            .expect("payload should serialize")
                    ],
                )
                .expect("legacy observation should insert");
        }

        let repo = SqliteSenaRepository::open(&path).expect("repo should migrate");
        let connection = repo
            .connection
            .lock()
            .expect("sqlite lock should be available");
        let count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sena_record_update_anchor_hot WHERE owner_sub = ?1",
                params!["owner"],
                |row| row.get(0),
            )
            .expect("anchor count should load");
        assert!(count > 0);
    }

    #[test]
    fn record_update_context_reads_anchor_rows_without_observation_payload_scan() {
        let path = temp_store_path("record-update-anchor-read");
        let repo = SqliteSenaRepository::open(&path).expect("repo should open");
        let record = block_on(repo.insert_observation(
            "owner",
            &observation("2026-04-01T00:00:00Z", 12.0).input,
        ))
        .expect("observation should insert");
        {
            let connection = repo
                .connection
                .lock()
                .expect("sqlite lock should be available");
            connection
                .execute(
                    "UPDATE sena_observation SET payload = ?2 WHERE observation_id = ?1",
                    params![record.observation_id, "{not-json"],
                )
                .expect("payload should corrupt");
        }

        let context = block_on(repo.get_record_update_context("owner"))
            .expect("context should load from anchors");
        assert_eq!(
            context
                .latest_stock_by_sku
                .get("sku-1")
                .expect("stock anchor should exist")
                .value
                .units_in_stock,
            12.0
        );
    }

    #[test]
    fn record_update_anchors_rebuild_after_update_and_delete() {
        let path = temp_store_path("record-update-anchor-maintenance");
        let repo = SqliteSenaRepository::open(&path).expect("repo should open");
        let older = block_on(repo.insert_observation(
            "owner",
            &observation("2026-04-01T00:00:00Z", 8.0).input,
        ))
        .expect("older observation should insert");
        let latest = block_on(repo.insert_observation(
            "owner",
            &observation("2026-04-02T00:00:00Z", 5.0).input,
        ))
        .expect("latest observation should insert");

        block_on(repo.delete_observation("owner", &latest.observation_id))
            .expect("latest observation should delete");
        let after_delete = block_on(repo.get_record_update_context("owner"))
            .expect("context should load after delete");
        assert_eq!(
            after_delete
                .latest_stock_by_sku
                .get("sku-1")
                .expect("stock anchor should exist")
                .value
                .units_in_stock,
            8.0
        );

        let mut updated = observation("2026-04-03T00:00:00Z", 3.0).input;
        updated.retail_sales_snapshot = vec![crate::types::SenaRetailSalesSnapshot {
            sku_id: "sku-1".to_string(),
            units_sold: 4.0,
        }];
        block_on(repo.update_observation("owner", &older.observation_id, &updated))
            .expect("older observation should update");
        let after_update = block_on(repo.get_record_update_context("owner"))
            .expect("context should load after update");
        assert_eq!(
            after_update
                .latest_stock_by_sku
                .get("sku-1")
                .expect("stock anchor should exist")
                .value
                .units_in_stock,
            3.0
        );
        assert_eq!(
            after_update
                .latest_retail_sale_by_sku
                .get("sku-1")
                .expect("retail sale anchor should exist")
                .value
                .units_sold,
            4.0
        );
    }

    #[test]
    fn latest_run_releases_lookup_connection_before_loading_run() {
        let path = temp_store_path("latest-run");
        let repo = SqliteSenaRepository::open(&path).expect("repo should open");
        let connection = repo
            .connection
            .lock()
            .expect("sqlite lock should be available");
        connection
            .execute(
                r#"
                INSERT INTO sena_run (
                  run_id, owner_sub, algorithm_version, status, observation_count,
                  created_at, completed_at, summary_json, diagnostics_json,
                  primary_artifact_key, error
                )
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL, NULL, NULL, NULL)
                "#,
                params![
                    "run-old",
                    "owner",
                    "test-algo",
                    "completed",
                    1_i64,
                    "2026-04-01T00:00:00Z",
                    "2026-04-01T00:01:00Z"
                ],
            )
            .expect("older run should insert");
        connection
            .execute(
                r#"
                INSERT INTO sena_run (
                  run_id, owner_sub, algorithm_version, status, observation_count,
                  created_at, completed_at, summary_json, diagnostics_json,
                  primary_artifact_key, error
                )
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL, NULL, NULL, NULL)
                "#,
                params![
                    "run-latest",
                    "owner",
                    "test-algo",
                    "completed",
                    2_i64,
                    "2026-04-02T00:00:00Z",
                    "2026-04-02T00:01:00Z"
                ],
            )
            .expect("latest run should insert");
        drop(connection);

        let latest = block_on(repo.get_latest_run("owner")).expect("latest run should load");
        assert_eq!(
            latest.as_ref().map(|record| record.run_id.as_str()),
            Some("run-latest")
        );
    }

    #[test]
    fn merge_order_fields_prefers_overrides_and_preserves_base_values() {
        let base = SenaOrderFieldValues {
            supplier_name: Some("Base Supplier".to_string()),
            supplier_note: Some("base note".to_string()),
            ordered_quantity: Some(4.0),
            received_quantity: Some(1.0),
            cost_per_unit: Some(2.5),
            expected_arrival_at: Some("2026-04-20T00:00:00Z".to_string()),
            placement_timestamp: Some("2026-04-10T00:00:00Z".to_string()),
            receipt_timestamp: None,
            lead_time_days_hint: Some(5.0),
            lead_time_variability: Some(SenaLeadTimeVariabilityClass::Normal),
            delivery_fee: Some(SenaDeliveryFeeMetadata {
                fee_usd: Some(1.25),
                payer: SenaDeliveryFeePayer::Customer,
                bucket: SenaDeliveryFeeBucket::Supplier,
                subtotal_usd: Some(10.0),
                display_delivery_usd: Some(1.25),
                display_total_usd: Some(11.25),
                net_settlement_usd: Some(11.25),
            }),
        };
        let overrides = SenaOrderFieldValues {
            supplier_name: None,
            supplier_note: Some("override note".to_string()),
            ordered_quantity: None,
            received_quantity: Some(3.0),
            cost_per_unit: None,
            expected_arrival_at: None,
            placement_timestamp: Some("2026-04-12T00:00:00Z".to_string()),
            receipt_timestamp: Some("2026-04-13T00:00:00Z".to_string()),
            lead_time_days_hint: None,
            lead_time_variability: Some(SenaLeadTimeVariabilityClass::Wide),
            delivery_fee: Some(SenaDeliveryFeeMetadata {
                fee_usd: Some(2.5),
                payer: SenaDeliveryFeePayer::Merchant,
                bucket: SenaDeliveryFeeBucket::CustomerOrder,
                subtotal_usd: Some(10.0),
                display_delivery_usd: Some(0.0),
                display_total_usd: Some(10.0),
                net_settlement_usd: Some(7.5),
            }),
        };

        let merged = super::merge_order_fields(&base, &overrides);

        assert_eq!(merged.supplier_name.as_deref(), Some("Base Supplier"));
        assert_eq!(merged.supplier_note.as_deref(), Some("override note"));
        assert_eq!(merged.ordered_quantity, Some(4.0));
        assert_eq!(merged.received_quantity, Some(3.0));
        assert_eq!(merged.cost_per_unit, Some(2.5));
        assert_eq!(merged.expected_arrival_at.as_deref(), Some("2026-04-20T00:00:00Z"));
        assert_eq!(merged.placement_timestamp.as_deref(), Some("2026-04-12T00:00:00Z"));
        assert_eq!(merged.receipt_timestamp.as_deref(), Some("2026-04-13T00:00:00Z"));
        assert_eq!(merged.lead_time_days_hint, Some(5.0));
        assert_eq!(merged.lead_time_variability, Some(SenaLeadTimeVariabilityClass::Wide));
        assert_eq!(
            merged.delivery_fee,
            Some(SenaDeliveryFeeMetadata {
                fee_usd: Some(2.5),
                payer: SenaDeliveryFeePayer::Merchant,
                bucket: SenaDeliveryFeeBucket::CustomerOrder,
                subtotal_usd: Some(10.0),
                display_delivery_usd: Some(0.0),
                display_total_usd: Some(10.0),
                net_settlement_usd: Some(7.5),
            }),
        );
    }

    #[test]
    fn order_batches_create_path_style_ids_and_child_records() {
        let path = temp_store_path("order-create");
        let repo = SqliteSenaRepository::open(&path).expect("repo should open");
        let batch = block_on(repo.create_order_batch(
            "owner",
            &SenaCreateOrderBatchPayload {
                supplier_name: Some("Mekong Looms".to_string()),
                shared: crate::types::SenaOrderFieldValues {
                    supplier_name: Some("Mekong Looms".to_string()),
                    ordered_quantity: None,
                    received_quantity: None,
                    cost_per_unit: None,
                    supplier_note: Some("batch note".to_string()),
                    expected_arrival_at: Some("2026-04-20T00:00:00Z".to_string()),
                    placement_timestamp: Some("2026-04-15T00:00:00Z".to_string()),
                    receipt_timestamp: None,
                    lead_time_days_hint: Some(5.0),
                    lead_time_variability: None,
                    delivery_fee: None,
                },
                children: vec![
                    crate::types::SenaOrderBatchCreateChildInput {
                        sku_id: "shirt".to_string(),
                        overrides: Some(crate::types::SenaOrderFieldValues {
                            ordered_quantity: Some(10.0),
                            ..Default::default()
                        }),
                    },
                    crate::types::SenaOrderBatchCreateChildInput {
                        sku_id: "pants".to_string(),
                        overrides: Some(crate::types::SenaOrderFieldValues {
                            ordered_quantity: Some(8.0),
                            ..Default::default()
                        }),
                    },
                ],
            },
        ))
        .expect("order batch should create");

        assert!(batch.batch_order_id.starts_with("orders/"));
        assert_eq!(batch.children.len(), 2);
        assert!(batch.children.iter().all(|child| child.child_order_id.starts_with(&batch.batch_order_id)));
        assert_eq!(batch.children[0].effective.supplier_note.as_deref(), Some("batch note"));
        assert_eq!(batch.children[0].effective.ordered_quantity, Some(10.0));
    }

    #[test]
    fn order_batches_update_child_inheritance_and_split() {
        let path = temp_store_path("order-update");
        let repo = SqliteSenaRepository::open(&path).expect("repo should open");
        let batch = block_on(repo.create_order_batch(
            "owner",
            &SenaCreateOrderBatchPayload {
                supplier_name: Some("Mekong Looms".to_string()),
                shared: crate::types::SenaOrderFieldValues {
                    supplier_name: Some("Mekong Looms".to_string()),
                    expected_arrival_at: Some("2026-04-20T00:00:00Z".to_string()),
                    ..Default::default()
                },
                children: vec![
                    crate::types::SenaOrderBatchCreateChildInput {
                        sku_id: "shirt".to_string(),
                        overrides: Some(crate::types::SenaOrderFieldValues {
                            ordered_quantity: Some(10.0),
                            ..Default::default()
                        }),
                    },
                    crate::types::SenaOrderBatchCreateChildInput {
                        sku_id: "pants".to_string(),
                        overrides: Some(crate::types::SenaOrderFieldValues {
                            ordered_quantity: Some(8.0),
                            ..Default::default()
                        }),
                    },
                ],
            },
        ))
        .expect("order batch should create");

        let updated_batch = block_on(repo.update_order_batch(
            "owner",
            &SenaUpdateOrderBatchPayload {
                batch_order_id: batch.batch_order_id.clone(),
                shared: Some(crate::types::SenaOrderFieldValues {
                    supplier_note: Some("shared update".to_string()),
                    ..Default::default()
                }),
                supplier_name: None,
                status: None,
            },
        ))
        .expect("order batch should update");
        assert!(updated_batch.children.iter().all(|child| child.effective.supplier_note.as_deref() == Some("shared update")));

        let child_id = updated_batch.children[0].child_order_id.clone();
        let child_updated = block_on(repo.update_order_child(
            "owner",
            &SenaUpdateOrderChildPayload {
                child_order_id: child_id.clone(),
                sku_id: None,
                overrides: Some(crate::types::SenaOrderFieldValues {
                    received_quantity: Some(5.0),
                    receipt_timestamp: Some("2026-04-21T00:00:00Z".to_string()),
                    ..Default::default()
                }),
                status: Some(crate::types::SenaOrderChildStatus::Received),
                append_supplier_note: None,
            },
        ))
        .expect("order child should update");
        let changed_child = child_updated
            .children
            .iter()
            .find(|child| child.child_order_id == child_id)
            .expect("updated child should exist");
        assert_eq!(changed_child.status, crate::types::SenaOrderChildStatus::Received);
        assert_eq!(changed_child.effective.received_quantity, Some(5.0));

        let split_batch = block_on(repo.split_order_child(
            "owner",
            &SenaSplitOrderChildPayload { child_order_id: child_id },
        ))
        .expect("child should split");
        assert_ne!(split_batch.batch_order_id, batch.batch_order_id);
        assert_eq!(split_batch.children.len(), 1);
        assert_eq!(split_batch.children[0].effective.received_quantity, Some(5.0));
    }
}
