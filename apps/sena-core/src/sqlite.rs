use crate::{
    benchmark,
    service::{now_rfc3339, SenaRepository},
    types::{
        SenaAnalysisArtifactRecord, SenaAnalysisResult, SenaAnalysisRunRecord, SenaCatalog,
        SenaCreateOrderBatchPayload, SenaDiagnostics, SenaObservationFingerprint,
        SenaObservationInput, SenaObservationPage, SenaObservationPageCursor,
        SenaObservationPageRequest, SenaObservationRecord, SenaOrderBatchRecord,
        SenaOrderBatchStatus, SenaOrderChildRecord, SenaOrderChildStatus, SenaOrderFieldValues,
        SenaOrderLookupPayload, SenaRecordActivityEntry, SenaRecordActivityType,
        SenaRecordUpdateAnchor, SenaRecordUpdateContext, SenaRecordUpdateOpenTickets,
        SenaRunStatus, SenaServiceDetail, SenaSkuDetail, SenaSkuSummary,
        SenaSplitOrderChildPayload, SenaTicketEvent, SenaTicketFamily, SenaTicketLifecycle,
        SenaTicketSummary, SenaUpdateOrderBatchPayload, SenaUpdateOrderChildPayload,
        SenaWorkspaceSummary,
    },
    PreprocessedWorkspace, SenaAnalysisCheckpoint, SenaEngineParameters,
};
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use serde_json::{json, Value};
use std::cmp::Ordering;
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
              engine_parameters_json TEXT,
              artifact_payload_json TEXT,
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
        ensure_column(
            &connection,
            "sena_run",
            "engine_parameters_json",
            "ALTER TABLE sena_run ADD COLUMN engine_parameters_json TEXT",
        )?;
        ensure_column(
            &connection,
            "sena_run",
            "artifact_payload_json",
            "ALTER TABLE sena_run ADD COLUMN artifact_payload_json TEXT",
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

fn confined_checkpoint_payload_path(checkpoint_root: &Path, payload_path: &str) -> Option<PathBuf> {
    let root = fs::canonicalize(checkpoint_root).ok()?;
    let path = fs::canonicalize(payload_path).ok()?;
    path.starts_with(root).then_some(path)
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
) -> Result<bool> {
    Ok(compare_observation_position(
        next_observed_at,
        next_observation_id,
        current_observed_at,
        current_observation_id,
    )? == Ordering::Greater)
}

fn parse_observed_at(value: &str) -> Result<OffsetDateTime> {
    OffsetDateTime::parse(value, &time::format_description::well_known::Rfc3339)
        .map_err(|err| anyhow!("observedAt must be RFC3339: {err}"))
}

fn usize_from_db_count(label: &str, value: i64) -> Result<usize> {
    usize::try_from(value).map_err(|_| anyhow!("{label} must be a non-negative count"))
}

fn compare_observation_position(
    left_observed_at: &str,
    left_observation_id: &str,
    right_observed_at: &str,
    right_observation_id: &str,
) -> Result<Ordering> {
    Ok(parse_observed_at(left_observed_at)?
        .cmp(&parse_observed_at(right_observed_at)?)
        .then_with(|| left_observation_id.cmp(right_observation_id)))
}

struct ParsedObservationRow {
    observation_id: String,
    observed_at: String,
    observed_time: OffsetDateTime,
    payload: String,
}

fn parsed_observation_rows(
    raw_rows: Vec<(String, String, String)>,
) -> Result<Vec<ParsedObservationRow>> {
    raw_rows
        .into_iter()
        .map(|(observation_id, observed_at, payload)| {
            let observed_time = parse_observed_at(&observed_at)?;
            Ok(ParsedObservationRow {
                observation_id,
                observed_at,
                observed_time,
                payload,
            })
        })
        .collect()
}

struct RecordUpdateAnchorWrite<'a, T> {
    anchor_kind: &'a str,
    entity_id: &'a str,
    observation_id: &'a str,
    observed_at: &'a str,
    value: &'a T,
    updated_at: &'a str,
}

fn upsert_record_update_anchor_locked<T: Serialize>(
    connection: &Connection,
    owner_sub: &str,
    anchor: RecordUpdateAnchorWrite<'_, T>,
) -> Result<()> {
    let current = connection
        .query_row(
            r#"
            SELECT observed_at, observation_id
            FROM sena_record_update_anchor_hot
            WHERE owner_sub = ?1 AND anchor_kind = ?2 AND entity_id = ?3
            "#,
            params![owner_sub, anchor.anchor_kind, anchor.entity_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()?;
    if let Some((current_observed_at, current_observation_id)) = current {
        if !is_newer_record_update_anchor(
            &current_observed_at,
            &current_observation_id,
            anchor.observed_at,
            anchor.observation_id,
        )? {
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
            anchor.anchor_kind,
            anchor.entity_id,
            anchor.observation_id,
            anchor.observed_at,
            serde_json::to_string(anchor.value)?,
            anchor.updated_at,
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
        discount: event.discount.clone(),
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
    let requested_rows = limit.saturating_mul(4);
    let mut stmt = connection.prepare(
        r#"
        SELECT observation_id, payload
        FROM sena_observation
        WHERE owner_sub = ?1
        ORDER BY observed_at DESC, observation_id DESC
        LIMIT ?2
        "#,
    )?;
    let rows = stmt.query_map(
        params![owner_sub, i64::try_from(requested_rows).unwrap_or(i64::MAX)],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
    )?;
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
            RecordUpdateAnchorWrite {
                anchor_kind: "stock",
                entity_id: &snapshot.sku_id,
                observation_id,
                observed_at: &input.observed_at,
                value: snapshot,
                updated_at,
            },
        )?;
    }
    for sale in &input.retail_sales_snapshot {
        if sale.units_sold > 0.0 {
            upsert_record_update_anchor_locked(
                connection,
                owner_sub,
                RecordUpdateAnchorWrite {
                    anchor_kind: "retail_sale",
                    entity_id: &sale.sku_id,
                    observation_id,
                    observed_at: &input.observed_at,
                    value: sale,
                    updated_at,
                },
            )?;
        }
    }
    for sale in &input.service_sales_snapshot {
        if sale.units_sold > 0.0 {
            upsert_record_update_anchor_locked(
                connection,
                owner_sub,
                RecordUpdateAnchorWrite {
                    anchor_kind: "service_sale",
                    entity_id: &sale.service_id,
                    observation_id,
                    observed_at: &input.observed_at,
                    value: sale,
                    updated_at,
                },
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
                RecordUpdateAnchorWrite {
                    anchor_kind: "order",
                    entity_id: &signal.sku_id,
                    observation_id,
                    observed_at,
                    value: signal,
                    updated_at,
                },
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
                RecordUpdateAnchorWrite {
                    anchor_kind: "receipt",
                    entity_id: &signal.sku_id,
                    observation_id,
                    observed_at,
                    value: signal,
                    updated_at,
                },
            )?;
        }
    }
    if let Some(delivery_fee) = &input.delivery_fee {
        upsert_record_update_anchor_locked(
            connection,
            owner_sub,
            RecordUpdateAnchorWrite {
                anchor_kind: "delivery_fee",
                entity_id: delivery_fee_bucket_key(&delivery_fee.bucket),
                observation_id,
                observed_at: &input.observed_at,
                value: delivery_fee,
                updated_at,
            },
        )?;
    }
    for event in &input.ticket_events {
        let summary = ticket_summary_from_event(event);
        upsert_record_update_anchor_locked(
            connection,
            owner_sub,
            RecordUpdateAnchorWrite {
                anchor_kind: "ticket",
                entity_id: &event.ticket_id,
                observation_id,
                observed_at: &event.occurred_at,
                value: &summary,
                updated_at,
            },
        )?;
        if let Some(delivery_fee) = &event.delivery_fee {
            upsert_record_update_anchor_locked(
                connection,
                owner_sub,
                RecordUpdateAnchorWrite {
                    anchor_kind: "delivery_fee",
                    entity_id: delivery_fee_bucket_key(&delivery_fee.bucket),
                    observation_id,
                    observed_at: &event.occurred_at,
                    value: delivery_fee,
                    updated_at,
                },
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
                    row.get::<_, i64>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, i64>(4)?,
                    row.get::<_, i64>(5)?,
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
        sku_count: usize_from_db_count("workspace summary sku_count", row.2)?,
        service_count: usize_from_db_count("workspace summary service_count", row.3)?,
        interval_count: usize_from_db_count("workspace summary interval_count", row.4)?,
        pending_reorder_count: usize_from_db_count(
            "workspace summary pending_reorder_count",
            row.5,
        )?,
        top_regime: row.6,
        high_risk_sku_ids: serde_json::from_str(&row.7)?,
        sku_summaries,
    }))
}

fn observation_fingerprint_locked(
    connection: &Connection,
    owner_sub: &str,
) -> Result<SenaObservationFingerprint> {
    let mut stmt = connection.prepare(
        r#"
        SELECT observation_id, observed_at, payload
        FROM sena_observation
        WHERE owner_sub = ?1
        "#,
    )?;
    let rows = stmt.query_map(params![owner_sub], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
        ))
    })?;
    let mut fingerprint_rows = Vec::new();
    for row in rows {
        fingerprint_rows.push(row?);
    }
    let mut fingerprint_rows = parsed_observation_rows(fingerprint_rows)?;
    fingerprint_rows.sort_by(|left, right| {
        left.observed_time
            .cmp(&right.observed_time)
            .then_with(|| left.observation_id.cmp(&right.observation_id))
    });
    let latest = fingerprint_rows.last();
    let fingerprint_payload_rows = fingerprint_rows
        .iter()
        .map(|row| {
            (
                row.observation_id.as_str(),
                row.observed_at.as_str(),
                row.payload.as_str(),
            )
        })
        .collect::<Vec<_>>();
    Ok(SenaObservationFingerprint {
        count: fingerprint_rows.len(),
        latest_observed_at: latest.map(|row| row.observed_at.clone()),
        latest_observation_id: latest.map(|row| row.observation_id.clone()),
        content_fingerprint: Some(crate::inference::fingerprint_value(
            &fingerprint_payload_rows,
        )?),
    })
}

fn assert_earliest_observation_has_stock_locked(
    connection: &Connection,
    owner_sub: &str,
) -> Result<()> {
    let mut statement = connection.prepare(
        r#"
        SELECT observation_id, observed_at, payload
        FROM sena_observation
        WHERE owner_sub = ?1
        "#,
    )?;
    let rows = statement.query_map(params![owner_sub], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
        ))
    })?;
    let mut rows_with_time = Vec::new();
    for row in rows {
        let (observation_id, observed_at, payload) = row?;
        rows_with_time.push((observation_id, parse_observed_at(&observed_at)?, payload));
    }
    let Some(earliest_time) = rows_with_time
        .iter()
        .map(|(_observation_id, observed_at, _payload)| *observed_at)
        .min()
    else {
        return Ok(());
    };

    for (_observation_id, observed_at, payload) in rows_with_time {
        if observed_at != earliest_time {
            continue;
        }
        let input: SenaObservationInput = serde_json::from_str(&payload)?;
        if !input.stock_snapshot.is_empty() {
            return Ok(());
        }
    }

    Err(anyhow!(
        "earliest SENA observation must include at least one stock snapshot"
    ))
}

fn merge_order_fields(
    base: &SenaOrderFieldValues,
    overrides: &SenaOrderFieldValues,
) -> SenaOrderFieldValues {
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
        discount: overrides.discount.clone().or_else(|| base.discount.clone()),
    }
}

fn validate_optional_non_negative_finite(context: &str, value: Option<f64>) -> Result<()> {
    if let Some(value) = value {
        if !value.is_finite() || value < 0.0 {
            return Err(anyhow!("{context} must be a finite non-negative number"));
        }
    }
    Ok(())
}

fn validate_optional_finite(context: &str, value: Option<f64>) -> Result<()> {
    if let Some(value) = value {
        if !value.is_finite() {
            return Err(anyhow!("{context} must be finite"));
        }
    }
    Ok(())
}

fn validate_optional_rfc3339(context: &str, value: &Option<String>) -> Result<()> {
    if let Some(value) = value {
        if value.trim().is_empty() {
            return Err(anyhow!("{context} must not be blank"));
        }
        OffsetDateTime::parse(value, &time::format_description::well_known::Rfc3339)
            .map_err(|_| anyhow!("{context} must be an RFC3339 timestamp"))?;
    }
    Ok(())
}

fn validate_delivery_fee(
    context: &str,
    value: &crate::types::SenaDeliveryFeeMetadata,
) -> Result<()> {
    validate_optional_non_negative_finite(&format!("{context}.feeUsd"), value.fee_usd)?;
    validate_optional_non_negative_finite(&format!("{context}.subtotalUsd"), value.subtotal_usd)?;
    validate_optional_non_negative_finite(
        &format!("{context}.displayDeliveryUsd"),
        value.display_delivery_usd,
    )?;
    validate_optional_non_negative_finite(
        &format!("{context}.displayTotalUsd"),
        value.display_total_usd,
    )?;
    validate_optional_finite(
        &format!("{context}.netSettlementUsd"),
        value.net_settlement_usd,
    )?;
    Ok(())
}

fn validate_discount(context: &str, value: &crate::types::SenaDiscountMetadata) -> Result<()> {
    validate_optional_non_negative_finite(&format!("{context}.amountUsd"), value.amount_usd)?;
    if let Some(percent) = value.percent {
        if !percent.is_finite() || !(0.0..=100.0).contains(&percent) {
            return Err(anyhow!("{context}.percent must be between 0 and 100"));
        }
    }
    validate_optional_non_negative_finite(&format!("{context}.subtotalUsd"), value.subtotal_usd)?;
    validate_optional_non_negative_finite(
        &format!("{context}.displayDiscountUsd"),
        value.display_discount_usd,
    )?;
    validate_optional_non_negative_finite(
        &format!("{context}.discountedSubtotalUsd"),
        value.discounted_subtotal_usd,
    )?;
    Ok(())
}

fn validate_order_fields(context: &str, fields: &SenaOrderFieldValues) -> Result<()> {
    validate_optional_non_negative_finite(
        &format!("{context}.orderedQuantity"),
        fields.ordered_quantity,
    )?;
    validate_optional_non_negative_finite(
        &format!("{context}.receivedQuantity"),
        fields.received_quantity,
    )?;
    validate_optional_non_negative_finite(&format!("{context}.costPerUnit"), fields.cost_per_unit)?;
    validate_optional_non_negative_finite(
        &format!("{context}.leadTimeDaysHint"),
        fields.lead_time_days_hint,
    )?;
    validate_optional_rfc3339(
        &format!("{context}.expectedArrivalAt"),
        &fields.expected_arrival_at,
    )?;
    validate_optional_rfc3339(
        &format!("{context}.placementTimestamp"),
        &fields.placement_timestamp,
    )?;
    validate_optional_rfc3339(
        &format!("{context}.receiptTimestamp"),
        &fields.receipt_timestamp,
    )?;
    if let Some(delivery_fee) = &fields.delivery_fee {
        validate_delivery_fee(&format!("{context}.deliveryFee"), delivery_fee)?;
    }
    if let Some(discount) = &fields.discount {
        validate_discount(&format!("{context}.discount"), discount)?;
    }
    if let (Some(ordered), Some(received)) = (fields.ordered_quantity, fields.received_quantity) {
        if received > ordered {
            return Err(anyhow!(
                "{context}.receivedQuantity cannot exceed orderedQuantity"
            ));
        }
    }
    Ok(())
}

fn validate_order_batch_record(batch: &SenaOrderBatchRecord) -> Result<()> {
    if batch.children.is_empty() {
        return Err(anyhow!("order batch requires at least one child"));
    }
    validate_order_fields("orderBatch.shared", &batch.shared)?;
    for child in &batch.children {
        if child.sku_id.trim().is_empty() {
            return Err(anyhow!("order child skuId must not be blank"));
        }
        validate_order_fields("orderChild.overrides", &child.overrides)?;
        validate_order_fields("orderChild.effective", &child.effective)?;
    }
    Ok(())
}

fn validate_create_order_batch_payload(payload: &SenaCreateOrderBatchPayload) -> Result<()> {
    if payload.children.is_empty() {
        return Err(anyhow!("order batch requires at least one child"));
    }
    validate_order_fields("orderBatch.shared", &payload.shared)?;
    for child in &payload.children {
        if child.sku_id.trim().is_empty() {
            return Err(anyhow!("order child skuId must not be blank"));
        }
        if let Some(overrides) = &child.overrides {
            validate_order_fields("orderChild.overrides", overrides)?;
        }
    }
    Ok(())
}

fn validate_update_order_batch_payload(payload: &SenaUpdateOrderBatchPayload) -> Result<()> {
    if payload.batch_order_id.trim().is_empty() {
        return Err(anyhow!("batchOrderId must not be blank"));
    }
    if let Some(shared) = &payload.shared {
        validate_order_fields("orderBatch.shared", shared)?;
    }
    Ok(())
}

fn validate_update_order_child_payload(payload: &SenaUpdateOrderChildPayload) -> Result<()> {
    if payload.child_order_id.trim().is_empty() {
        return Err(anyhow!("childOrderId must not be blank"));
    }
    if let Some(sku_id) = &payload.sku_id {
        if sku_id.trim().is_empty() {
            return Err(anyhow!("order child skuId must not be blank"));
        }
    }
    if let Some(overrides) = &payload.overrides {
        validate_order_fields("orderChild.overrides", overrides)?;
    }
    Ok(())
}

fn order_child_status_for_fields(fields: &SenaOrderFieldValues) -> SenaOrderChildStatus {
    if fields.receipt_timestamp.is_some()
        || fields.received_quantity.is_some_and(|value| value > 0.0)
    {
        return SenaOrderChildStatus::Received;
    }
    if fields.expected_arrival_at.is_some() {
        if let Some(expected) = &fields.expected_arrival_at {
            if let Ok(date) =
                OffsetDateTime::parse(expected, &time::format_description::well_known::Rfc3339)
            {
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
    if children.iter().all(|child| {
        child.status == SenaOrderChildStatus::Received
            || child.status == SenaOrderChildStatus::Reviewed
    }) {
        return SenaOrderBatchStatus::Received;
    }
    if children.iter().any(|child| {
        child.status == SenaOrderChildStatus::Received
            || child.status == SenaOrderChildStatus::Reviewed
    }) {
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
        if let Ok(parsed) =
            OffsetDateTime::parse(now, &time::format_description::well_known::Rfc3339)
        {
            let formatted = parsed
                .format(&format)
                .unwrap_or_else(|_| "1970/01/01/000000".to_string());
            let mut parts = formatted.split('/');
            let year = parts.next().unwrap_or("1970").to_string();
            let month = parts.next().unwrap_or("01").to_string();
            let day = parts.next().unwrap_or("01").to_string();
            let time = parts.next().unwrap_or("000000").to_string();
            return (year, month, day, time);
        }
    }
    (
        "1970".to_string(),
        "01".to_string(),
        "01".to_string(),
        "000000".to_string(),
    )
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
    let affected_rows = connection.execute(
        r#"
        INSERT INTO sena_order_batch (batch_order_id, owner_sub, supplier_name, status, updated_at, payload_json)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6)
        ON CONFLICT(batch_order_id) DO UPDATE SET
          supplier_name = excluded.supplier_name,
          status = excluded.status,
          updated_at = excluded.updated_at,
          payload_json = excluded.payload_json
        WHERE sena_order_batch.owner_sub = excluded.owner_sub
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
    if affected_rows == 0 {
        return Err(anyhow!("order batch id already belongs to another owner"));
    }
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
        let checkpoint_root = self.checkpoint_root();
        let mut connection = self
            .connection
            .lock()
            .map_err(|_| anyhow!("sqlite lock poisoned"))?;
        let transaction = connection.transaction()?;
        let checkpoint_paths = {
            let mut stmt = transaction.prepare(
                "SELECT payload_path FROM sena_analysis_checkpoint WHERE owner_sub = ?1",
            )?;
            let rows = stmt.query_map(params![owner_sub], |row| row.get::<_, Option<String>>(0))?;
            let mut paths = Vec::new();
            for row in rows {
                if let Some(path) = row? {
                    if let Some(confined_path) =
                        confined_checkpoint_payload_path(&checkpoint_root, &path)
                    {
                        paths.push(confined_path);
                    }
                }
            }
            paths
        };
        transaction.execute(
            "DELETE FROM sena_analysis_checkpoint WHERE owner_sub = ?1",
            params![owner_sub],
        )?;
        transaction.execute(
            "DELETE FROM sena_preprocessed_cache WHERE owner_sub = ?1",
            params![owner_sub],
        )?;
        transaction.execute(
            "DELETE FROM sena_service_detail WHERE owner_sub = ?1",
            params![owner_sub],
        )?;
        transaction.execute(
            "DELETE FROM sena_sku_detail WHERE owner_sub = ?1",
            params![owner_sub],
        )?;
        transaction.execute(
            "DELETE FROM sena_read_model WHERE owner_sub = ?1",
            params![owner_sub],
        )?;
        transaction.execute(
            "DELETE FROM sena_sku_summary_hot WHERE owner_sub = ?1",
            params![owner_sub],
        )?;
        transaction.execute(
            "DELETE FROM sena_workspace_summary_hot WHERE owner_sub = ?1",
            params![owner_sub],
        )?;
        transaction.execute(
            "DELETE FROM sena_run WHERE owner_sub = ?1",
            params![owner_sub],
        )?;
        transaction.execute(
            "DELETE FROM sena_observation WHERE owner_sub = ?1",
            params![owner_sub],
        )?;
        transaction.execute(
            "DELETE FROM sena_order_child_lookup WHERE owner_sub = ?1",
            params![owner_sub],
        )?;
        transaction.execute(
            "DELETE FROM sena_order_batch WHERE owner_sub = ?1",
            params![owner_sub],
        )?;
        transaction.execute(
            "DELETE FROM sena_record_update_anchor_hot WHERE owner_sub = ?1",
            params![owner_sub],
        )?;
        transaction.execute(
            "DELETE FROM sena_catalog WHERE owner_sub = ?1",
            params![owner_sub],
        )?;
        transaction.commit()?;
        for path in checkpoint_paths {
            let _ = fs::remove_file(path);
        }
        Ok(())
    }

    async fn upsert_catalog(&self, owner_sub: &str, catalog: &SenaCatalog) -> Result<()> {
        catalog.validate()?;
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
        observation.validate()?;
        let record = SenaObservationRecord {
            observation_id: Uuid::new_v4().to_string(),
            owner_sub: owner_sub.to_string(),
            input: observation.clone(),
        };
        let mut connection = self
            .connection
            .lock()
            .map_err(|_| anyhow!("sqlite lock poisoned"))?;
        let transaction = connection.transaction()?;
        transaction.execute(
            "INSERT INTO sena_observation (observation_id, owner_sub, observed_at, payload) VALUES (?1, ?2, ?3, ?4)",
            params![
                record.observation_id,
                record.owner_sub,
                record.input.observed_at,
                serde_json::to_string(&record.input)?
            ],
        )?;
        upsert_record_update_anchors_for_observation_locked(
            &transaction,
            owner_sub,
            &record.observation_id,
            &record.input,
            &now_rfc3339(),
        )?;
        assert_earliest_observation_has_stock_locked(&transaction, owner_sub)?;
        transaction.commit()?;
        Ok(record)
    }

    async fn update_observation(
        &self,
        owner_sub: &str,
        observation_id: &str,
        observation: &SenaObservationInput,
    ) -> Result<SenaObservationRecord> {
        observation.validate()?;
        let mut connection = self
            .connection
            .lock()
            .map_err(|_| anyhow!("sqlite lock poisoned"))?;
        let transaction = connection.transaction()?;
        let updated = transaction.execute(
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
        rebuild_record_update_anchors_locked(&transaction, owner_sub)?;
        assert_earliest_observation_has_stock_locked(&transaction, owner_sub)?;
        transaction.commit()?;
        Ok(SenaObservationRecord {
            observation_id: observation_id.to_string(),
            owner_sub: owner_sub.to_string(),
            input: observation.clone(),
        })
    }

    async fn delete_observation(&self, owner_sub: &str, observation_id: &str) -> Result<()> {
        let mut connection = self
            .connection
            .lock()
            .map_err(|_| anyhow!("sqlite lock poisoned"))?;
        let transaction = connection.transaction()?;
        let deleted = transaction.execute(
            "DELETE FROM sena_observation WHERE observation_id = ?1 AND owner_sub = ?2",
            params![observation_id, owner_sub],
        )?;
        if deleted == 0 {
            return Err(anyhow!("observation not found"));
        }
        rebuild_record_update_anchors_locked(&transaction, owner_sub)?;
        assert_earliest_observation_has_stock_locked(&transaction, owner_sub)?;
        transaction.commit()?;
        Ok(())
    }

    async fn list_observations(&self, owner_sub: &str) -> Result<Vec<SenaObservationRecord>> {
        let connection = self
            .connection
            .lock()
            .map_err(|_| anyhow!("sqlite lock poisoned"))?;
        let mut stmt = connection.prepare(
            "SELECT observation_id, observed_at, payload FROM sena_observation WHERE owner_sub = ?1",
        )?;
        let rows = stmt.query_map(params![owner_sub], |row| {
            let observation_id: String = row.get(0)?;
            let observed_at: String = row.get(1)?;
            let payload: String = row.get(2)?;
            Ok((observation_id, observed_at, payload))
        })?;
        let mut raw_rows = Vec::new();
        for row in rows {
            raw_rows.push(row?);
        }
        let mut raw_rows = parsed_observation_rows(raw_rows)?;
        raw_rows.sort_by(|left, right| {
            left.observed_time
                .cmp(&right.observed_time)
                .then_with(|| left.observation_id.cmp(&right.observation_id))
        });
        raw_rows
            .into_iter()
            .map(|row| {
                serde_json::from_str(&row.payload).map(|input| SenaObservationRecord {
                    observation_id: row.observation_id,
                    owner_sub: owner_sub.to_string(),
                    input,
                })
            })
            .collect::<std::result::Result<Vec<_>, _>>()
            .map_err(anyhow::Error::new)
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
        let fetch_limit = limit + 1;
        let mut raw_rows = Vec::new();
        if let Some(before_observed_at) = request.before_observed_at.as_deref() {
            parse_observed_at(before_observed_at)?;
            let before_observation_id = request.before_observation_id.as_deref().unwrap_or("");
            let mut stmt = connection.prepare(
                r#"
                SELECT observation_id, observed_at, payload
                FROM sena_observation
                WHERE owner_sub = ?1
                  AND (
                    unixepoch(observed_at) < unixepoch(?2)
                    OR (unixepoch(observed_at) = unixepoch(?2) AND observation_id < ?3)
                  )
                ORDER BY unixepoch(observed_at) DESC, observation_id DESC
                LIMIT ?4
                "#,
            )?;
            let rows = stmt.query_map(
                params![
                    owner_sub,
                    before_observed_at,
                    before_observation_id,
                    fetch_limit as i64
                ],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                    ))
                },
            )?;
            for row in rows {
                raw_rows.push(row?);
            }
        } else {
            let mut stmt = connection.prepare(
                r#"
                SELECT observation_id, observed_at, payload
                FROM sena_observation
                WHERE owner_sub = ?1
                ORDER BY unixepoch(observed_at) DESC, observation_id DESC
                LIMIT ?2
                "#,
            )?;
            let rows = stmt.query_map(params![owner_sub, fetch_limit as i64], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })?;
            for row in rows {
                raw_rows.push(row?);
            }
        }
        let mut raw_rows = parsed_observation_rows(raw_rows)?;
        raw_rows.sort_by(|left, right| {
            right
                .observed_time
                .cmp(&left.observed_time)
                .then_with(|| right.observation_id.cmp(&left.observation_id))
        });
        let has_older = raw_rows.len() > limit;
        raw_rows.truncate(limit);
        let next_cursor = if has_older {
            raw_rows.last().map(|row| SenaObservationPageCursor {
                observation_id: row.observation_id.clone(),
                observed_at: row.observed_at.clone(),
            })
        } else {
            None
        };
        let observations = raw_rows
            .into_iter()
            .map(|row| {
                serde_json::from_str(&row.payload).map(|input| SenaObservationRecord {
                    observation_id: row.observation_id,
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
                    latest_stock_by_sku.insert(
                        entity_id.clone(),
                        SenaRecordUpdateAnchor {
                            observation_id: observation_id.clone(),
                            observed_at: observed_at.clone(),
                            value: serde_json::from_str(&payload)?,
                        },
                    );
                }
                "retail_sale" => {
                    latest_retail_sale_by_sku.insert(
                        entity_id.clone(),
                        SenaRecordUpdateAnchor {
                            observation_id: observation_id.clone(),
                            observed_at: observed_at.clone(),
                            value: serde_json::from_str(&payload)?,
                        },
                    );
                }
                "service_sale" => {
                    latest_service_sale_by_service.insert(
                        entity_id.clone(),
                        SenaRecordUpdateAnchor {
                            observation_id: observation_id.clone(),
                            observed_at: observed_at.clone(),
                            value: serde_json::from_str(&payload)?,
                        },
                    );
                }
                "order" => {
                    latest_order_by_sku.insert(
                        entity_id.clone(),
                        SenaRecordUpdateAnchor {
                            observation_id: observation_id.clone(),
                            observed_at: observed_at.clone(),
                            value: serde_json::from_str(&payload)?,
                        },
                    );
                }
                "receipt" => {
                    latest_receipt_by_sku.insert(
                        entity_id.clone(),
                        SenaRecordUpdateAnchor {
                            observation_id: observation_id.clone(),
                            observed_at: observed_at.clone(),
                            value: serde_json::from_str(&payload)?,
                        },
                    );
                }
                "ticket" => {
                    latest_tickets_by_id.insert(
                        entity_id.clone(),
                        SenaRecordUpdateAnchor {
                            observation_id: observation_id.clone(),
                            observed_at: observed_at.clone(),
                            value: serde_json::from_str::<SenaTicketSummary>(&payload)?,
                        },
                    );
                }
                "delivery_fee" => {
                    latest_delivery_fee_by_bucket.insert(
                        entity_id.clone(),
                        SenaRecordUpdateAnchor {
                            observation_id: observation_id.clone(),
                            observed_at: observed_at.clone(),
                            value: serde_json::from_str(&payload)?,
                        },
                    );
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
                    if !batch
                        .children
                        .iter()
                        .any(|child| &child.child_order_id == child_order_id)
                    {
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
        validate_create_order_batch_payload(payload)?;
        let now = now_rfc3339();
        let batch_order_id = build_batch_order_id(
            &now,
            payload
                .supplier_name
                .as_deref()
                .or(payload.shared.supplier_name.as_deref()),
        );
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
        validate_order_batch_record(&batch)?;
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
        validate_update_order_batch_payload(payload)?;
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
        validate_order_batch_record(&batch)?;
        persist_batch(&connection, &batch)?;
        Ok(batch)
    }

    async fn update_order_child(
        &self,
        owner_sub: &str,
        payload: &SenaUpdateOrderChildPayload,
    ) -> Result<SenaOrderBatchRecord> {
        validate_update_order_child_payload(payload)?;
        let connection = self
            .connection
            .lock()
            .map_err(|_| anyhow!("sqlite lock poisoned"))?;
        let mut batch = load_all_batches(&connection, owner_sub)?
            .into_iter()
            .find(|batch| {
                batch
                    .children
                    .iter()
                    .any(|child| child.child_order_id == payload.child_order_id)
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
        validate_order_batch_record(&batch)?;
        persist_batch(&connection, &batch)?;
        Ok(batch)
    }

    async fn split_order_child(
        &self,
        owner_sub: &str,
        payload: &SenaSplitOrderChildPayload,
    ) -> Result<SenaOrderBatchRecord> {
        if payload.child_order_id.trim().is_empty() {
            return Err(anyhow!("childOrderId must not be blank"));
        }
        let connection = self
            .connection
            .lock()
            .map_err(|_| anyhow!("sqlite lock poisoned"))?;
        let mut batches = load_all_batches(&connection, owner_sub)?;
        let source_index = batches
            .iter()
            .position(|batch| {
                batch
                    .children
                    .iter()
                    .any(|child| child.child_order_id == payload.child_order_id)
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
            validate_order_batch_record(&source)?;
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
        new_batch.children[0].status = child.status;
        new_batch.status = order_batch_status(&new_batch.children);
        validate_order_batch_record(&new_batch)?;
        persist_batch(&connection, &new_batch)?;
        Ok(new_batch)
    }

    async fn create_run(
        &self,
        owner_sub: &str,
        algorithm_version: &str,
        parameters: Option<&SenaEngineParameters>,
    ) -> Result<SenaAnalysisRunRecord> {
        let observations = self.list_observations(owner_sub).await?;
        let engine_parameters =
            parameters.map(|value| value.normalized_for_algorithm(algorithm_version));
        let record = SenaAnalysisRunRecord {
            run_id: Uuid::new_v4().to_string(),
            owner_sub: owner_sub.to_string(),
            algorithm_version: algorithm_version.to_string(),
            engine_parameters,
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
              run_id, owner_sub, algorithm_version, status, observation_count, created_at,
              engine_parameters_json
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            "#,
            params![
                record.run_id,
                record.owner_sub,
                record.algorithm_version,
                "queued",
                record.observation_count as i64,
                record.created_at,
                record
                    .engine_parameters
                    .as_ref()
                    .map(serde_json::to_string)
                    .transpose()?,
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
                       summary_json, diagnostics_json, primary_artifact_key, error,
                       engine_parameters_json
                FROM sena_run
                WHERE run_id = ?1
                "#,
                params![run_id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, i64>(3)?,
                        row.get::<_, String>(4)?,
                        row.get::<_, Option<String>>(5)?,
                        row.get::<_, Option<String>>(6)?,
                        row.get::<_, Option<String>>(7)?,
                        row.get::<_, Option<String>>(8)?,
                        row.get::<_, Option<String>>(9)?,
                        row.get::<_, Option<String>>(10)?,
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
        let engine_parameters = row
            .10
            .map(|value| serde_json::from_str(&value))
            .transpose()?;
        Ok(Some(SenaAnalysisRunRecord {
            run_id: run_id.to_string(),
            owner_sub: row.0,
            algorithm_version: row.1,
            engine_parameters,
            status: parse_run_status(&row.2),
            observation_count: usize_from_db_count("run observation_count", row.3)?,
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
        artifact_payload: Option<&Value>,
    ) -> Result<()> {
        let completed_at = now_rfc3339();
        let mut connection = self
            .connection
            .lock()
            .map_err(|_| anyhow!("sqlite lock poisoned"))?;
        let owner_sub = result.workspace_summary.owner_sub.clone();
        let mut summary = result.workspace_summary.clone();
        summary.run_id = run_id.to_string();
        let updated_at = now_rfc3339();
        let transaction = connection.transaction()?;
        transaction.execute(
            r#"
            UPDATE sena_run
            SET status = 'succeeded',
                completed_at = ?2,
                summary_json = ?3,
                diagnostics_json = ?4,
                primary_artifact_key = ?5,
                artifact_payload_json = ?6,
                error = NULL
            WHERE run_id = ?1
            "#,
            params![
                run_id,
                completed_at,
                serde_json::to_string(&summary)?,
                serde_json::to_string(&result.diagnostics)?,
                artifact_key.map(str::to_string),
                artifact_payload.map(serde_json::to_string).transpose()?,
            ],
        )?;
        transaction.execute(
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
        persist_hot_workspace_summary(&transaction, &summary, &updated_at)?;
        for detail in &result.sku_details {
            transaction.execute(
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
            transaction.execute(
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
        transaction.execute(
            "DELETE FROM sena_sku_detail WHERE owner_sub = ?1 AND run_id <> ?2",
            params![owner_sub, run_id],
        )?;
        transaction.execute(
            "DELETE FROM sena_service_detail WHERE owner_sub = ?1 AND run_id <> ?2",
            params![owner_sub, run_id],
        )?;
        transaction.commit()?;
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
                let path =
                    payload_path.ok_or_else(|| anyhow!("checkpoint payload path missing"))?;
                let Some(path) = confined_checkpoint_payload_path(&self.checkpoint_root(), &path)
                else {
                    continue;
                };
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
                    if let Some(confined_path) =
                        confined_checkpoint_payload_path(&self.checkpoint_root(), &path)
                    {
                        paths.push(confined_path);
                    }
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

impl SqliteSenaRepository {
    pub async fn load_analysis_artifact(
        &self,
        run_id: &str,
    ) -> Result<Option<SenaAnalysisArtifactRecord>> {
        let connection = self
            .connection
            .lock()
            .map_err(|_| anyhow!("sqlite lock poisoned"))?;
        let row = connection
            .query_row(
                r#"
                SELECT owner_sub, algorithm_version, created_at, completed_at,
                       summary_json, diagnostics_json, primary_artifact_key,
                       engine_parameters_json, artifact_payload_json
                FROM sena_run
                WHERE run_id = ?1
                "#,
                params![run_id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, Option<String>>(3)?,
                        row.get::<_, Option<String>>(4)?,
                        row.get::<_, Option<String>>(5)?,
                        row.get::<_, Option<String>>(6)?,
                        row.get::<_, Option<String>>(7)?,
                        row.get::<_, Option<String>>(8)?,
                    ))
                },
            )
            .optional()?;
        let Some(row) = row else {
            return Ok(None);
        };
        if let Some(raw_payload) = row.8 {
            return Ok(Some(SenaAnalysisArtifactRecord {
                run_id: run_id.to_string(),
                primary_artifact_key: row.6,
                synthesized: false,
                payload: serde_json::from_str(&raw_payload)?,
            }));
        }

        let summary = row
            .4
            .as_deref()
            .map(serde_json::from_str::<Value>)
            .transpose()?
            .or_else(|| {
                match connection
                    .query_row(
                        "SELECT workspace_summary_json FROM sena_read_model WHERE owner_sub = ?1",
                        params![&row.0],
                        |row| row.get::<_, String>(0),
                    )
                    .optional()
                {
                    Ok(Some(raw)) => serde_json::from_str(&raw).ok(),
                    _ => None,
                }
            });
        let diagnostics = row
            .5
            .as_deref()
            .map(serde_json::from_str::<Value>)
            .transpose()?
            .or_else(|| {
                match connection
                    .query_row(
                        "SELECT diagnostics_json FROM sena_read_model WHERE owner_sub = ?1",
                        params![&row.0],
                        |row| row.get::<_, String>(0),
                    )
                    .optional()
                {
                    Ok(Some(raw)) => serde_json::from_str(&raw).ok(),
                    _ => None,
                }
            });
        let engine_parameters = row
            .7
            .as_deref()
            .map(serde_json::from_str::<Value>)
            .transpose()?;

        let sku_details =
            load_artifact_detail_values(&connection, "sena_sku_detail", "sku_id", &row.0, run_id)?;
        let service_details = load_artifact_detail_values(
            &connection,
            "sena_service_detail",
            "service_id",
            &row.0,
            run_id,
        )?;
        let sku_summaries = summary
            .as_ref()
            .and_then(|value| value.get("skuSummaries").cloned())
            .unwrap_or_else(|| Value::Array(Vec::new()));

        Ok(Some(SenaAnalysisArtifactRecord {
            run_id: run_id.to_string(),
            primary_artifact_key: row.6.clone(),
            synthesized: true,
            payload: json!({
                "generatedAt": row.3.as_ref().unwrap_or(&row.2),
                "algorithmVersion": row.1,
                "run": {
                    "runId": run_id,
                    "ownerSub": &row.0,
                    "createdAt": &row.2,
                    "completedAt": &row.3,
                    "primaryArtifactKey": &row.6,
                    "synthesized": true,
                },
                "engineParameters": engine_parameters,
                "workspaceSummary": summary,
                "skuSummaries": sku_summaries,
                "skuDetails": sku_details,
                "serviceDetails": service_details,
                "diagnostics": diagnostics,
            }),
        }))
    }
}

fn load_artifact_detail_values(
    connection: &Connection,
    table_name: &str,
    id_column: &str,
    owner_sub: &str,
    run_id: &str,
) -> Result<Vec<Value>> {
    let run_specific_sql = format!(
        "SELECT payload_json FROM {table_name} WHERE owner_sub = ?1 AND run_id = ?2 ORDER BY {id_column}"
    );
    let mut statement = connection.prepare(&run_specific_sql)?;
    let rows = statement.query_map(params![owner_sub, run_id], |row| row.get::<_, String>(0))?;
    let run_specific = rows
        .map(|row| {
            row.map_err(anyhow::Error::new)
                .and_then(|raw| serde_json::from_str(&raw).map_err(anyhow::Error::new))
        })
        .collect::<Result<Vec<Value>>>()?;
    if !run_specific.is_empty() {
        return Ok(run_specific);
    }

    let fallback_sql =
        format!("SELECT payload_json FROM {table_name} WHERE owner_sub = ?1 ORDER BY {id_column}");
    let mut statement = connection.prepare(&fallback_sql)?;
    let rows = statement.query_map(params![owner_sub], |row| row.get::<_, String>(0))?;
    rows.map(|row| {
        row.map_err(anyhow::Error::new)
            .and_then(|raw| serde_json::from_str(&raw).map_err(anyhow::Error::new))
    })
    .collect::<Result<Vec<Value>>>()
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
    use super::{load_all_batches, persist_batch, SqliteSenaRepository};
    use crate::lead_time::SenaLeadTimeVariabilityClass;
    use crate::types::{
        SenaDeliveryFeeBucket, SenaDeliveryFeeMetadata, SenaDeliveryFeePayer, SenaTicketEvent,
        SenaTicketEventType, SenaTicketFamily, SenaTicketLifecycle, SenaTicketLine,
        SenaTicketPartyMetadata, SenaTicketStage,
    };
    use crate::{
        build_checkpoint_metadata, fingerprint_catalog, preprocess_workspace,
        service::SenaRepository, PreprocessedWorkspace, SenaCatalog, SenaCreateOrderBatchPayload,
        SenaEngineParameters, SenaLeadTimeHint, SenaObservationInput, SenaObservationPageRequest,
        SenaObservationRecord, SenaOrderBatchRecord, SenaOrderBatchStatus, SenaOrderChildRecord,
        SenaOrderChildStatus, SenaOrderFieldValues, SenaOrderSignal, SenaService,
        SenaServicePriceObservation, SenaServiceSkuMaskEntry, SenaSku, SenaSplitOrderChildPayload,
        SenaStockSnapshot, SenaUpdateOrderBatchPayload, SenaUpdateOrderChildPayload,
    };
    use futures::executor::block_on;
    use rusqlite::{params, OptionalExtension};
    use std::{
        env, fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    fn temp_store_path(label: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after epoch")
            .as_nanos();
        env::temp_dir().join(format!("kaur-khor-sena-core-{label}-{nonce}.sqlite3"))
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
                discount: None,
                recipe_usage_hints: Vec::new(),
                notes: None,
            },
        }
    }

    fn stockless_observation(observed_at: &str) -> SenaObservationInput {
        let mut input = observation(observed_at, 0.0).input;
        input.stock_snapshot.clear();
        input
    }

    fn supplier_ticket_event(
        ticket_id: &str,
        observed_at: &str,
        lifecycle: SenaTicketLifecycle,
    ) -> SenaTicketEvent {
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
                received_quantity: if lifecycle == SenaTicketLifecycle::Resolved {
                    Some(4.0)
                } else {
                    None
                },
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
            discount: None,
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

    fn raw_observation_payload(
        repo: &SqliteSenaRepository,
        observation_id: &str,
    ) -> Option<String> {
        let connection = repo
            .connection
            .lock()
            .expect("sqlite lock should be available");
        connection
            .query_row(
                "SELECT payload FROM sena_observation WHERE observation_id = ?1",
                params![observation_id],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .expect("payload lookup should succeed")
    }

    fn stored_observation_count(repo: &SqliteSenaRepository) -> i64 {
        let connection = repo
            .connection
            .lock()
            .expect("sqlite lock should be available");
        connection
            .query_row("SELECT COUNT(*) FROM sena_observation", [], |row| {
                row.get(0)
            })
            .expect("observation count should load")
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
    fn invalid_catalog_writes_are_rejected() {
        let path = temp_store_path("catalog-validation");
        let repo = SqliteSenaRepository::open(&path).expect("repo should open");
        let mut invalid = sample_catalog();
        invalid.skus.clear();

        let insert_error = block_on(repo.upsert_catalog("owner", &invalid))
            .expect_err("invalid catalog insert should be rejected");
        assert!(insert_error
            .to_string()
            .contains("catalog must include at least one sku"));
        assert!(
            block_on(repo.get_catalog("owner"))
                .expect("catalog lookup should succeed")
                .is_none(),
            "invalid catalog insert should not persist a row"
        );

        let valid = sample_catalog();
        block_on(repo.upsert_catalog("owner", &valid)).expect("valid catalog should insert");
        let upsert_error = block_on(repo.upsert_catalog("owner", &invalid))
            .expect_err("invalid catalog upsert should be rejected");
        assert!(upsert_error
            .to_string()
            .contains("catalog must include at least one sku"));
        assert_eq!(
            block_on(repo.get_catalog("owner")).expect("catalog lookup should succeed"),
            Some(valid.clone()),
            "failed catalog upsert should preserve the existing catalog",
        );

        let invalid_numeric_catalog_cases: [(&str, fn(&mut SenaCatalog), &str); 4] = [
            (
                "negative sku cost",
                |catalog: &mut SenaCatalog| catalog.skus[0].cost_per_unit = -1.0,
                "costPerUnit must be >= 0",
            ),
            (
                "negative product price",
                |catalog: &mut SenaCatalog| catalog.skus[0].product_price = Some(-1.0),
                "productPrice must be >= 0",
            ),
            (
                "negative lead-time mean",
                |catalog: &mut SenaCatalog| catalog.skus[0].lead_time_mean_days_hint = Some(-1.0),
                "leadTimeMeanDaysHint must be >= 0",
            ),
            (
                "negative service price",
                |catalog: &mut SenaCatalog| catalog.services[0].price = -1.0,
                "service price must be >= 0",
            ),
        ];
        for (label, mutate, expected_error) in invalid_numeric_catalog_cases {
            let mut invalid_numeric_catalog = valid.clone();
            mutate(&mut invalid_numeric_catalog);
            let error = block_on(repo.upsert_catalog("owner", &invalid_numeric_catalog))
                .expect_err(&format!("{label} should be rejected"));
            assert!(
                error.to_string().contains(expected_error),
                "{label} returned unexpected error: {error}",
            );
            assert_eq!(
                block_on(repo.get_catalog("owner")).expect("catalog lookup should succeed"),
                Some(valid.clone()),
                "{label} should not overwrite the existing catalog",
            );
        }
    }

    #[test]
    fn invalid_observation_insert_is_rejected() {
        let path = temp_store_path("observation-insert-validation");
        let repo = SqliteSenaRepository::open(&path).expect("repo should open");
        let mut invalid = observation("2026-04-01T00:00:00Z", 14.0).input;
        invalid.stock_snapshot[0].units_in_stock = -1.0;

        let error = block_on(repo.insert_observation("owner", &invalid))
            .expect_err("invalid observation insert should be rejected");
        assert!(error.to_string().contains("unitsInStock must be >= 0"));
        assert_eq!(
            stored_observation_count(&repo),
            0,
            "invalid observation insert should not persist a row",
        );
    }

    #[test]
    fn invalid_observation_update_preserves_existing_row() {
        let path = temp_store_path("observation-update-validation");
        let repo = SqliteSenaRepository::open(&path).expect("repo should open");
        let inserted = block_on(
            repo.insert_observation("owner", &observation("2026-04-01T00:00:00Z", 14.0).input),
        )
        .expect("valid observation should insert");
        let original_payload = raw_observation_payload(&repo, &inserted.observation_id)
            .expect("valid payload should exist");

        let mut invalid = inserted.input.clone();
        invalid.stock_snapshot[0].units_in_stock = -1.0;
        let error = block_on(repo.update_observation("owner", &inserted.observation_id, &invalid))
            .expect_err("invalid observation update should be rejected");
        assert!(error.to_string().contains("unitsInStock must be >= 0"));
        assert_eq!(
            raw_observation_payload(&repo, &inserted.observation_id).as_deref(),
            Some(original_payload.as_str()),
            "failed invalid update should preserve the previous valid row",
        );
    }

    #[test]
    fn repository_rejects_stockless_earliest_observation() {
        let path = temp_store_path("earliest-stock-invariant");
        let repo = SqliteSenaRepository::open(&path).expect("repo should open");

        let error = block_on(
            repo.insert_observation("owner", &stockless_observation("2026-04-01T00:00:00Z")),
        )
        .expect_err("stockless first observation should be rejected");
        assert!(error
            .to_string()
            .contains("earliest SENA observation must include at least one stock snapshot"));
        assert_eq!(stored_observation_count(&repo), 0);

        let first = block_on(
            repo.insert_observation("owner", &observation("2026-04-01T00:00:00Z", 14.0).input),
        )
        .expect("stock first observation should insert");
        block_on(repo.insert_observation("owner", &stockless_observation("2026-04-02T00:00:00Z")))
            .expect("later stockless observation should insert");
        let original_payload = raw_observation_payload(&repo, &first.observation_id)
            .expect("first payload should exist");

        let error = block_on(repo.update_observation(
            "owner",
            &first.observation_id,
            &stockless_observation("2026-04-01T00:00:00Z"),
        ))
        .expect_err("making earliest observation stockless should be rejected");
        assert!(error
            .to_string()
            .contains("earliest SENA observation must include at least one stock snapshot"));
        assert_eq!(
            raw_observation_payload(&repo, &first.observation_id).as_deref(),
            Some(original_payload.as_str()),
            "rejected earliest-stock update should roll back",
        );

        let error = block_on(repo.delete_observation("owner", &first.observation_id))
            .expect_err("deleting only stock-bearing earliest observation should be rejected");
        assert!(error
            .to_string()
            .contains("earliest SENA observation must include at least one stock snapshot"));
        assert!(
            raw_observation_payload(&repo, &first.observation_id).is_some(),
            "rejected earliest-stock delete should roll back",
        );
    }

    #[test]
    fn repository_allows_same_timestamp_earliest_stock_baseline_group() {
        let path = temp_store_path("earliest-stock-tie");
        let repo = SqliteSenaRepository::open(&path).expect("repo should open");

        let first = block_on(
            repo.insert_observation("owner", &observation("2026-04-01T00:00:00Z", 14.0).input),
        )
        .expect("stock-bearing baseline should insert");
        block_on(repo.insert_observation("owner", &stockless_observation("2026-04-01T00:00:00Z")))
            .expect("same-timestamp stockless follow-up should share the baseline group");
        assert_eq!(stored_observation_count(&repo), 2);

        let error = block_on(repo.update_observation(
            "owner",
            &first.observation_id,
            &stockless_observation("2026-04-01T00:00:00Z"),
        ))
        .expect_err("baseline group should still require at least one stock snapshot");
        assert!(error
            .to_string()
            .contains("earliest SENA observation must include at least one stock snapshot"));
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
        assert!(std::path::Path::new(
            payload_path
                .as_deref()
                .expect("checkpoint payload path should be stored")
        )
        .is_file());
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
    fn checkpoint_payload_paths_are_confined_to_checkpoint_root() {
        let path = temp_store_path("checkpoint-confinement");
        let repo = SqliteSenaRepository::open(&path).expect("repo should open");
        let checkpoint_root = repo.checkpoint_root();
        fs::create_dir_all(&checkpoint_root).expect("checkpoint root should be created");
        let outside_path = path.with_extension("outside-payload");
        fs::write(&outside_path, b"outside checkpoint payload")
            .expect("outside payload should write");
        let linked_outside_path = checkpoint_root.join("linked-outside-payload");
        let _ = fs::remove_file(&linked_outside_path);
        #[cfg(unix)]
        std::os::unix::fs::symlink(&outside_path, &linked_outside_path)
            .expect("outside payload symlink should be created");
        #[cfg(windows)]
        std::os::windows::fs::symlink_file(&outside_path, &linked_outside_path)
            .expect("outside payload symlink should be created");

        {
            let connection = repo
                .connection
                .lock()
                .expect("sqlite lock should be available");
            connection
                .execute(
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
                    "#,
                    params![
                        "owner",
                        "sena-analysis-v3",
                        "catalog",
                        1_i64,
                        0_i64,
                        "prefix",
                        "",
                        "zstd",
                        outside_path.to_string_lossy().as_ref(),
                        26_i64,
                        "2026-04-01T00:00:00Z",
                    ],
                )
                .expect("malicious checkpoint row should insert");
            connection
                .execute(
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
                    "#,
                    params![
                        "owner",
                        "sena-analysis-v3",
                        "catalog",
                        1_i64,
                        1_i64,
                        "prefix",
                        "",
                        "zstd",
                        linked_outside_path.to_string_lossy().as_ref(),
                        26_i64,
                        "2026-04-01T00:00:00Z",
                    ],
                )
                .expect("symlink checkpoint row should insert");
        }

        let checkpoints =
            block_on(repo.list_analysis_checkpoints("owner", "sena-analysis-v3", "catalog"))
                .expect("out-of-root checkpoint path should be skipped");
        assert!(checkpoints.is_empty());
        assert!(
            outside_path.is_file(),
            "listing checkpoints should not read or remove outside payloads"
        );

        block_on(repo.clear_owner("owner")).expect("owner should clear");
        assert!(
            outside_path.is_file(),
            "clear_owner should not delete out-of-root checkpoint payloads"
        );
    }

    #[test]
    fn observations_can_be_updated_and_deleted() {
        let path = temp_store_path("observation-mutations");
        let repo = SqliteSenaRepository::open(&path).expect("repo should open");
        let inserted = block_on(
            repo.insert_observation("owner", &observation("2026-04-01T00:00:00Z", 14.0).input),
        )
        .expect("observation should insert");

        let mut updated_input = inserted.input.clone();
        updated_input.notes = Some("edited".to_string());
        updated_input.observed_at = "2026-04-02T00:00:00Z".to_string();

        let updated =
            block_on(repo.update_observation("owner", &inserted.observation_id, &updated_input))
                .expect("observation should update");
        assert_eq!(updated.observation_id, inserted.observation_id);
        assert_eq!(updated.input.notes.as_deref(), Some("edited"));

        let observations =
            block_on(repo.list_observations("owner")).expect("observations should load");
        assert_eq!(observations.len(), 1);
        assert_eq!(observations[0].input.observed_at, "2026-04-02T00:00:00Z");

        block_on(repo.delete_observation("owner", &inserted.observation_id))
            .expect("observation should delete");
        let remaining =
            block_on(repo.list_observations("owner")).expect("observations should load");
        assert!(remaining.is_empty());
    }

    #[test]
    fn observation_mutations_roll_back_when_anchor_rebuild_fails() {
        let path = temp_store_path("observation-mutation-atomicity");
        let repo = SqliteSenaRepository::open(&path).expect("repo should open");
        let valid = block_on(
            repo.insert_observation("owner", &observation("2026-04-02T00:00:00Z", 14.0).input),
        )
        .expect("valid observation should insert");
        let original_payload = raw_observation_payload(&repo, &valid.observation_id)
            .expect("valid payload should exist");

        {
            let connection = repo
                .connection
                .lock()
                .expect("sqlite lock should be available");
            connection
                .execute(
                    "INSERT INTO sena_observation (observation_id, owner_sub, observed_at, payload) VALUES (?1, ?2, ?3, ?4)",
                    params!["corrupt-observation", "owner", "2026-04-01T00:00:00Z", "{not-json"],
                )
                .expect("corrupt legacy row should insert");
        }

        let mut updated = valid.input.clone();
        updated.notes = Some("edited".to_string());
        block_on(repo.update_observation("owner", &valid.observation_id, &updated))
            .expect_err("anchor rebuild failure should reject update");
        assert_eq!(
            raw_observation_payload(&repo, &valid.observation_id).as_deref(),
            Some(original_payload.as_str()),
            "failed anchor rebuild should roll back the observation update",
        );

        block_on(repo.delete_observation("owner", &valid.observation_id))
            .expect_err("anchor rebuild failure should reject delete");
        assert!(
            raw_observation_payload(&repo, &valid.observation_id).is_some(),
            "failed anchor rebuild should roll back the observation delete",
        );
    }

    #[test]
    fn observations_with_duplicate_timestamps_have_stable_order() {
        let path = temp_store_path("duplicate-observation-order");
        let repo = SqliteSenaRepository::open(&path).expect("repo should open");

        insert_observation_with_id(&repo, "obs-b", "2026-04-01T00:00:00Z", 14.0);
        insert_observation_with_id(&repo, "obs-a", "2026-04-01T00:00:00Z", 12.0);

        let observations =
            block_on(repo.list_observations("owner")).expect("observations should load");

        assert_eq!(
            observations
                .iter()
                .map(|observation| observation.observation_id.as_str())
                .collect::<Vec<_>>(),
            vec!["obs-a", "obs-b"]
        );
    }

    #[test]
    fn malformed_observation_timestamps_return_errors_instead_of_panicking() {
        let path = temp_store_path("malformed-observation-timestamp");
        let repo = SqliteSenaRepository::open(&path).expect("repo should open");

        insert_observation_with_id(&repo, "obs-good", "2026-04-01T00:00:00Z", 14.0);
        {
            let connection = repo
                .connection
                .lock()
                .expect("sqlite lock should be available");
            connection
                .execute(
                    "INSERT INTO sena_observation (observation_id, owner_sub, observed_at, payload) VALUES (?1, ?2, ?3, ?4)",
                    params![
                        "obs-bad-time",
                        "owner",
                        "not-a-timestamp",
                        serde_json::to_string(&observation("2026-04-02T00:00:00Z", 12.0).input)
                            .expect("payload should serialize"),
                    ],
                )
                .expect("malformed timestamp row should insert");
        }

        let list_error = block_on(repo.list_observations("owner"))
            .expect_err("malformed timestamp should reject full observation listing");
        assert!(list_error
            .to_string()
            .contains("observedAt must be RFC3339"));

        let page_error = block_on(repo.list_observation_page("owner", None))
            .expect_err("malformed timestamp should reject paged observation listing");
        assert!(page_error
            .to_string()
            .contains("observedAt must be RFC3339"));

        let fingerprint_error = block_on(repo.get_observation_fingerprint("owner"))
            .expect_err("malformed timestamp should reject observation fingerprinting");
        assert!(fingerprint_error
            .to_string()
            .contains("observedAt must be RFC3339"));
    }

    #[test]
    fn observations_with_offsets_are_listed_chronologically() {
        let path = temp_store_path("offset-observation-order");
        let repo = SqliteSenaRepository::open(&path).expect("repo should open");

        insert_observation_with_id(&repo, "obs-z", "2026-04-01T01:00:00-05:00", 8.0);
        insert_observation_with_id(&repo, "obs-a", "2026-04-01T05:00:00Z", 12.0);
        insert_observation_with_id(&repo, "obs-m", "2026-04-01T07:00:00+01:00", 10.0);

        let observations =
            block_on(repo.list_observations("owner")).expect("observations should load");

        assert_eq!(
            observations
                .iter()
                .map(|observation| observation.observation_id.as_str())
                .collect::<Vec<_>>(),
            vec!["obs-a", "obs-m", "obs-z"]
        );
    }

    #[test]
    fn stockless_offset_observation_after_baseline_is_allowed() {
        let path = temp_store_path("offset-earliest-stock-baseline");
        let repo = SqliteSenaRepository::open(&path).expect("repo should open");

        block_on(
            repo.insert_observation("owner", &observation("2026-04-01T05:00:00Z", 12.0).input),
        )
        .expect("stock baseline should insert");
        block_on(
            repo.insert_observation("owner", &stockless_observation("2026-04-01T01:00:00-05:00")),
        )
        .expect("later stockless observation should insert");
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
    fn observation_fingerprint_orders_offset_timestamps_by_instant() {
        let path = temp_store_path("observation-fingerprint-offset");
        let repo = SqliteSenaRepository::open(&path).expect("repo should open");

        insert_observation_with_id(&repo, "obs-z", "2026-04-01T01:00:00-05:00", 8.0);
        insert_observation_with_id(&repo, "obs-a", "2026-04-01T05:00:00Z", 12.0);
        insert_observation_with_id(&repo, "obs-m", "2026-04-01T07:00:00+01:00", 10.0);

        let fingerprint =
            block_on(repo.get_observation_fingerprint("owner")).expect("fingerprint should load");

        assert_eq!(fingerprint.count, 3);
        assert_eq!(
            fingerprint.latest_observed_at.as_deref(),
            Some("2026-04-01T01:00:00-05:00")
        );
        assert_eq!(fingerprint.latest_observation_id.as_deref(), Some("obs-z"));
    }

    #[test]
    fn observation_fingerprint_changes_when_older_payload_changes() {
        let path = temp_store_path("observation-fingerprint-payload");
        let repo = SqliteSenaRepository::open(&path).expect("repo should open");
        let older = block_on(
            repo.insert_observation("owner", &observation("2026-04-01T00:00:00Z", 14.0).input),
        )
        .expect("older observation should insert");
        block_on(
            repo.insert_observation("owner", &observation("2026-04-02T00:00:00Z", 12.0).input),
        )
        .expect("latest observation should insert");
        let before = block_on(repo.get_observation_fingerprint("owner"))
            .expect("fingerprint should load before update");

        let mut updated = older.input.clone();
        updated.notes = Some("older payload changed".to_string());
        block_on(repo.update_observation("owner", &older.observation_id, &updated))
            .expect("older observation should update");
        let after = block_on(repo.get_observation_fingerprint("owner"))
            .expect("fingerprint should load after update");

        assert_eq!(before.count, after.count);
        assert_eq!(before.latest_observed_at, after.latest_observed_at);
        assert_eq!(before.latest_observation_id, after.latest_observation_id);
        assert_ne!(before.content_fingerprint, after.content_fingerprint);
    }

    #[test]
    fn observation_pages_are_descending_and_cursor_stable() {
        let path = temp_store_path("observation-page");
        let repo = SqliteSenaRepository::open(&path).expect("repo should open");

        let empty =
            block_on(repo.list_observation_page("owner", None)).expect("empty page should load");
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
            next.observations
                .iter()
                .map(|observation| observation.observation_id.as_str())
                .collect::<Vec<_>>(),
            vec!["obs-b", "obs-c"]
        );
        assert!(!next.has_older);
        assert_eq!(
            next.latest_observed_at.as_deref(),
            Some("2026-04-03T00:00:00Z")
        );
    }

    #[test]
    fn observation_pages_order_offset_timestamps_by_instant() {
        let path = temp_store_path("observation-page-offset");
        let repo = SqliteSenaRepository::open(&path).expect("repo should open");

        insert_observation_with_id(&repo, "obs-z", "2026-04-01T01:00:00-05:00", 8.0);
        insert_observation_with_id(&repo, "obs-a", "2026-04-01T05:00:00Z", 12.0);
        insert_observation_with_id(&repo, "obs-m", "2026-04-01T07:00:00+01:00", 10.0);

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
            vec!["obs-z", "obs-m"]
        );
        assert!(first.has_older);
        let cursor = first.next_cursor.expect("older cursor should exist");
        assert_eq!(cursor.observed_at, "2026-04-01T07:00:00+01:00");
        assert_eq!(cursor.observation_id, "obs-m");

        let next = block_on(repo.list_observation_page(
            "owner",
            Some(&SenaObservationPageRequest {
                before_observed_at: Some(cursor.observed_at),
                before_observation_id: Some(cursor.observation_id),
                limit: Some(2),
            }),
        ))
        .expect("next page should load");
        assert_eq!(
            next.observations
                .iter()
                .map(|observation| observation.observation_id.as_str())
                .collect::<Vec<_>>(),
            vec!["obs-a"]
        );
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
        block_on(repo.insert_observation("owner", &older))
            .expect("older observation should insert");

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
        block_on(repo.insert_observation("owner", &latest))
            .expect("latest observation should insert");

        let context = block_on(repo.get_record_update_context("owner"))
            .expect("record update context should load");
        assert_eq!(context.observation_fingerprint.count, 2);
        assert_eq!(
            context.latest_observed_at.as_deref(),
            Some("2026-04-02T00:00:00Z")
        );
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
            .any(
                |entry| entry.activity_type == crate::types::SenaRecordActivityType::Ticket
                    && entry.ticket_id.as_deref() == Some("ticket-supplier-1")
            ));
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
        assert!(ticket_revisions
            .iter()
            .any(|id| id.ends_with(":ticket:ticket-supplier-1:1")));
        assert!(ticket_revisions
            .iter()
            .any(|id| id.ends_with(":ticket:ticket-supplier-1:2")));
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
        let record = block_on(
            repo.insert_observation("owner", &observation("2026-04-01T00:00:00Z", 12.0).input),
        )
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
    fn clear_owner_removes_record_update_anchors() {
        let path = temp_store_path("clear-owner-record-update-anchors");
        let repo = SqliteSenaRepository::open(&path).expect("repo should open");
        block_on(
            repo.insert_observation("owner", &observation("2026-04-01T00:00:00Z", 12.0).input),
        )
        .expect("observation should insert");

        let before_clear = block_on(repo.get_record_update_context("owner"))
            .expect("context should load before clear");
        assert!(before_clear.latest_stock_by_sku.contains_key("sku-1"));

        block_on(repo.clear_owner("owner")).expect("owner should clear");

        {
            let connection = repo
                .connection
                .lock()
                .expect("sqlite lock should be available");
            let anchor_count: i64 = connection
                .query_row(
                    "SELECT COUNT(*) FROM sena_record_update_anchor_hot WHERE owner_sub = ?1",
                    params!["owner"],
                    |row| row.get(0),
                )
                .expect("anchor count should load");
            assert_eq!(anchor_count, 0);
        }

        let after_clear = block_on(repo.get_record_update_context("owner"))
            .expect("context should load after clear");
        assert_eq!(after_clear.observation_fingerprint.count, 0);
        assert!(after_clear.latest_stock_by_sku.is_empty());
        assert!(after_clear.latest_retail_sale_by_sku.is_empty());
        assert!(after_clear.latest_service_sale_by_service.is_empty());
        assert!(after_clear.latest_order_by_sku.is_empty());
        assert!(after_clear.latest_receipt_by_sku.is_empty());
        assert!(after_clear.latest_tickets_by_id.is_empty());
        assert!(after_clear.latest_delivery_fee_by_bucket.is_empty());
        assert!(after_clear.recent_activity.is_empty());
    }

    #[test]
    fn record_update_anchors_rebuild_after_update_and_delete() {
        let path = temp_store_path("record-update-anchor-maintenance");
        let repo = SqliteSenaRepository::open(&path).expect("repo should open");
        let older = block_on(
            repo.insert_observation("owner", &observation("2026-04-01T00:00:00Z", 8.0).input),
        )
        .expect("older observation should insert");
        let latest = block_on(
            repo.insert_observation("owner", &observation("2026-04-02T00:00:00Z", 5.0).input),
        )
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
    fn stale_detail_rows_are_removed_after_completed_run() {
        let path = temp_store_path("stale-detail-rows");
        let repo = SqliteSenaRepository::open(&path).expect("repo should open");
        let (catalog, observations, preprocessed) = sample_preprocessed_workspace();
        let mut first = crate::run_preprocessed_analysis(
            "owner",
            &catalog,
            &observations,
            "sena-analysis-v3",
            &preprocessed,
            None,
            None,
        )
        .expect("analysis should succeed")
        .result;

        let mut stale_sku = first.sku_details[0].clone();
        stale_sku.summary.sku_id = "sku-stale".to_string();
        let mut current_sku = first.sku_details[0].clone();
        current_sku.summary.sku_id = "sku-current".to_string();
        current_sku.summary.latest_posterior_units = 21.0;
        first.sku_details = vec![stale_sku, current_sku.clone()];

        let mut stale_service = first.service_details[0].clone();
        stale_service.service_id = "svc-stale".to_string();
        let mut current_service = first.service_details[0].clone();
        current_service.service_id = "svc-current".to_string();
        current_service.activity_mean = 7.0;
        first.service_details = vec![stale_service, current_service.clone()];

        let first_run = block_on(repo.create_run("owner", "sena-analysis-v3", None))
            .expect("first run should create");
        block_on(repo.persist_completed_run(&first_run.run_id, &first, None, None))
            .expect("first run should persist");
        assert!(block_on(repo.load_sku_detail("owner", "sku-stale"))
            .expect("stale sku should load before refresh")
            .is_some());
        assert!(block_on(repo.load_service_detail("owner", "svc-stale"))
            .expect("stale service should load before refresh")
            .is_some());

        let mut second = first.clone();
        let mut refreshed_sku = current_sku;
        refreshed_sku.summary.latest_posterior_units = 42.0;
        second.sku_details = vec![refreshed_sku];
        let mut refreshed_service = current_service;
        refreshed_service.activity_mean = 11.0;
        second.service_details = vec![refreshed_service];
        let second_run = block_on(repo.create_run("owner", "sena-analysis-v3", None))
            .expect("second run should create");
        block_on(repo.persist_completed_run(&second_run.run_id, &second, None, None))
            .expect("second run should persist");

        assert!(block_on(repo.load_sku_detail("owner", "sku-stale"))
            .expect("stale sku lookup should succeed")
            .is_none());
        assert!(block_on(repo.load_service_detail("owner", "svc-stale"))
            .expect("stale service lookup should succeed")
            .is_none());
        let loaded_sku = block_on(repo.load_sku_detail("owner", "sku-current"))
            .expect("current sku lookup should succeed")
            .expect("current sku should remain");
        assert_eq!(loaded_sku.summary.sku_id, "sku-current");
        assert_eq!(loaded_sku.summary.latest_posterior_units, 42.0);
        let loaded_service = block_on(repo.load_service_detail("owner", "svc-current"))
            .expect("current service lookup should succeed")
            .expect("current service should remain");
        assert_eq!(loaded_service.service_id, "svc-current");
        assert_eq!(loaded_service.activity_mean, 11.0);

        let connection = repo
            .connection
            .lock()
            .expect("sqlite lock should be available");
        let stale_sku_rows: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sena_sku_detail WHERE owner_sub = ?1 AND run_id <> ?2",
                params!["owner", second_run.run_id],
                |row| row.get(0),
            )
            .expect("stale sku row count should load");
        assert_eq!(stale_sku_rows, 0);
        let stale_service_rows: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sena_service_detail WHERE owner_sub = ?1 AND run_id <> ?2",
                params!["owner", second_run.run_id],
                |row| row.get(0),
            )
            .expect("stale service row count should load");
        assert_eq!(stale_service_rows, 0);
    }

    #[test]
    fn run_parameters_round_trip_through_sqlite() {
        let path = temp_store_path("run-parameters");
        let repo = SqliteSenaRepository::open(&path).expect("repo should open");
        let parameters = SenaEngineParameters {
            particle_count: 64,
            target_service_level: 0.8,
            recommendation_quantile: 0.7,
            interval_low_quantile: 0.2,
            interval_high_quantile: 0.8,
            need_probability_gate: 0.4,
            review_delay_days: 3.0,
            smoothing_enabled: true,
        };

        let run = block_on(repo.create_run("owner", "sena-analysis-v3", Some(&parameters)))
            .expect("run should create");
        let loaded = block_on(repo.get_run(&run.run_id))
            .expect("run should load")
            .expect("run should exist");

        assert_eq!(
            loaded.engine_parameters,
            Some(parameters.normalized_for_algorithm("sena-analysis-v3"))
        );
    }

    #[test]
    fn analysis_artifact_payload_round_trips_through_sqlite() {
        let path = temp_store_path("analysis-artifact");
        let repo = SqliteSenaRepository::open(&path).expect("repo should open");
        let (catalog, observations, preprocessed) = sample_preprocessed_workspace();
        let result = crate::run_preprocessed_analysis(
            "owner",
            &catalog,
            &observations,
            "sena-analysis-v3",
            &preprocessed,
            None,
            None,
        )
        .expect("analysis should succeed")
        .result;
        let run = block_on(repo.create_run("owner", "sena-analysis-v3", None))
            .expect("run should create");
        let payload = serde_json::json!({
            "engineParameters": { "particleCount": 64 },
            "diagnostics": { "posteriorPredictiveErrorMean": 0.25 },
            "skuDetails": [{ "summary": { "skuId": "sku-1" } }],
        });

        block_on(repo.persist_completed_run(
            &run.run_id,
            &result,
            Some("artifact/run"),
            Some(&payload),
        ))
        .expect("run should persist");

        let loaded = block_on(repo.load_analysis_artifact(&run.run_id))
            .expect("artifact should load")
            .expect("artifact should exist");
        assert!(!loaded.synthesized);
        assert_eq!(loaded.primary_artifact_key.as_deref(), Some("artifact/run"));
        assert_eq!(loaded.payload, payload);
    }

    #[test]
    fn analysis_artifact_synthesizes_legacy_payload_from_read_models() {
        let path = temp_store_path("analysis-artifact-legacy");
        let repo = SqliteSenaRepository::open(&path).expect("repo should open");
        let (catalog, observations, preprocessed) = sample_preprocessed_workspace();
        let result = crate::run_preprocessed_analysis(
            "owner",
            &catalog,
            &observations,
            "sena-analysis-v3",
            &preprocessed,
            None,
            None,
        )
        .expect("analysis should succeed")
        .result;
        let run = block_on(repo.create_run("owner", "sena-analysis-v3", None))
            .expect("run should create");
        block_on(repo.persist_completed_run(&run.run_id, &result, Some("artifact/run"), None))
            .expect("run should persist");

        let loaded = block_on(repo.load_analysis_artifact(&run.run_id))
            .expect("artifact should load")
            .expect("artifact should exist");
        assert!(loaded.synthesized);
        assert_eq!(
            loaded
                .payload
                .get("skuDetails")
                .and_then(|value| value.as_array())
                .map(Vec::len),
            Some(result.sku_details.len())
        );
        assert!(loaded.payload.get("engineParameters").is_some());
        assert!(loaded.payload.get("diagnostics").is_some());
    }

    #[test]
    fn run_loading_rejects_negative_persisted_counts() {
        let path = temp_store_path("run-negative-count");
        let repo = SqliteSenaRepository::open(&path).expect("repo should open");
        let run = block_on(repo.create_run("owner", "sena-analysis-v3", None))
            .expect("run should create");
        {
            let connection = repo
                .connection
                .lock()
                .expect("sqlite lock should be available");
            connection
                .execute(
                    "UPDATE sena_run SET observation_count = -1 WHERE run_id = ?1",
                    params![run.run_id],
                )
                .expect("run count should corrupt");
        }

        let error = block_on(repo.get_run(&run.run_id)).expect_err("corrupt run should fail");
        assert!(error
            .to_string()
            .contains("run observation_count must be a non-negative count"));
    }

    #[test]
    fn workspace_summary_loading_rejects_negative_hot_counts() {
        let path = temp_store_path("workspace-summary-negative-count");
        let repo = SqliteSenaRepository::open(&path).expect("repo should open");
        let (catalog, observations, preprocessed) = sample_preprocessed_workspace();
        let result = crate::run_preprocessed_analysis(
            "owner",
            &catalog,
            &observations,
            "sena-analysis-v3",
            &preprocessed,
            None,
            None,
        )
        .expect("analysis should succeed")
        .result;
        let run = block_on(repo.create_run("owner", "sena-analysis-v3", None))
            .expect("run should create");
        block_on(repo.persist_completed_run(&run.run_id, &result, None, None))
            .expect("completed run should persist");
        {
            let connection = repo
                .connection
                .lock()
                .expect("sqlite lock should be available");
            connection
                .execute(
                    "UPDATE sena_workspace_summary_hot SET sku_count = -1 WHERE owner_sub = ?1",
                    params!["owner"],
                )
                .expect("workspace summary count should corrupt");
        }

        let error = block_on(repo.load_workspace_summary("owner"))
            .expect_err("corrupt hot summary should fail");
        assert!(error
            .to_string()
            .contains("workspace summary sku_count must be a non-negative count"));
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
            discount: None,
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
            discount: None,
        };

        let merged = super::merge_order_fields(&base, &overrides);

        assert_eq!(merged.supplier_name.as_deref(), Some("Base Supplier"));
        assert_eq!(merged.supplier_note.as_deref(), Some("override note"));
        assert_eq!(merged.ordered_quantity, Some(4.0));
        assert_eq!(merged.received_quantity, Some(3.0));
        assert_eq!(merged.cost_per_unit, Some(2.5));
        assert_eq!(
            merged.expected_arrival_at.as_deref(),
            Some("2026-04-20T00:00:00Z")
        );
        assert_eq!(
            merged.placement_timestamp.as_deref(),
            Some("2026-04-12T00:00:00Z")
        );
        assert_eq!(
            merged.receipt_timestamp.as_deref(),
            Some("2026-04-13T00:00:00Z")
        );
        assert_eq!(merged.lead_time_days_hint, Some(5.0));
        assert_eq!(
            merged.lead_time_variability,
            Some(SenaLeadTimeVariabilityClass::Wide)
        );
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
                    discount: None,
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
        assert!(batch
            .children
            .iter()
            .all(|child| child.child_order_id.starts_with(&batch.batch_order_id)));
        assert_eq!(
            batch.children[0].effective.supplier_note.as_deref(),
            Some("batch note")
        );
        assert_eq!(batch.children[0].effective.ordered_quantity, Some(10.0));
    }

    #[test]
    fn order_batches_reject_semantically_invalid_payloads() {
        let path = temp_store_path("order-validation");
        let repo = SqliteSenaRepository::open(&path).expect("repo should open");

        let blank_sku_error = block_on(repo.create_order_batch(
            "owner",
            &SenaCreateOrderBatchPayload {
                supplier_name: Some("Mekong Looms".to_string()),
                shared: SenaOrderFieldValues::default(),
                children: vec![crate::types::SenaOrderBatchCreateChildInput {
                    sku_id: " ".to_string(),
                    overrides: None,
                }],
            },
        ))
        .expect_err("blank sku id should be rejected");
        assert!(blank_sku_error.to_string().contains("skuId"));

        let impossible_quantity_error = block_on(repo.create_order_batch(
            "owner",
            &SenaCreateOrderBatchPayload {
                supplier_name: Some("Mekong Looms".to_string()),
                shared: SenaOrderFieldValues::default(),
                children: vec![crate::types::SenaOrderBatchCreateChildInput {
                    sku_id: "shirt".to_string(),
                    overrides: Some(SenaOrderFieldValues {
                        ordered_quantity: Some(3.0),
                        received_quantity: Some(4.0),
                        ..Default::default()
                    }),
                }],
            },
        ))
        .expect_err("received quantity above ordered quantity should be rejected");
        assert!(impossible_quantity_error
            .to_string()
            .contains("receivedQuantity"));

        let bad_timestamp_error = block_on(repo.create_order_batch(
            "owner",
            &SenaCreateOrderBatchPayload {
                supplier_name: Some("Mekong Looms".to_string()),
                shared: SenaOrderFieldValues {
                    expected_arrival_at: Some("tomorrow".to_string()),
                    ..Default::default()
                },
                children: vec![crate::types::SenaOrderBatchCreateChildInput {
                    sku_id: "shirt".to_string(),
                    overrides: None,
                }],
            },
        ))
        .expect_err("non-rfc3339 timestamps should be rejected");
        assert!(bad_timestamp_error.to_string().contains("RFC3339"));

        let valid = block_on(repo.create_order_batch(
            "owner",
            &SenaCreateOrderBatchPayload {
                supplier_name: Some("Mekong Looms".to_string()),
                shared: SenaOrderFieldValues::default(),
                children: vec![crate::types::SenaOrderBatchCreateChildInput {
                    sku_id: "shirt".to_string(),
                    overrides: None,
                }],
            },
        ))
        .expect("valid order batch should create");
        let child_id = valid.children[0].child_order_id.clone();

        let invalid_update_error = block_on(repo.update_order_child(
            "owner",
            &SenaUpdateOrderChildPayload {
                child_order_id: child_id,
                sku_id: None,
                overrides: Some(SenaOrderFieldValues {
                    cost_per_unit: Some(f64::NAN),
                    ..Default::default()
                }),
                status: None,
                append_supplier_note: None,
            },
        ))
        .expect_err("non-finite child updates should be rejected");
        assert!(invalid_update_error.to_string().contains("finite"));
    }

    #[test]
    fn order_batch_persistence_rejects_cross_owner_id_collisions() {
        let path = temp_store_path("order-owner-isolation");
        let repo = SqliteSenaRepository::open(&path).expect("repo should open");
        let base_child = SenaOrderChildRecord {
            child_order_id: "orders/shared/sku-1".to_string(),
            sku_id: "sku-1".to_string(),
            status: SenaOrderChildStatus::Open,
            created_at: "2026-04-01T00:00:00Z".to_string(),
            updated_at: "2026-04-01T00:00:00Z".to_string(),
            inherited_from_batch: true,
            effective: SenaOrderFieldValues::default(),
            overrides: SenaOrderFieldValues::default(),
        };
        let owner_one_batch = SenaOrderBatchRecord {
            batch_order_id: "orders/shared".to_string(),
            owner_sub: "owner-one".to_string(),
            supplier_name: Some("Owner One Supplier".to_string()),
            status: SenaOrderBatchStatus::Open,
            created_at: "2026-04-01T00:00:00Z".to_string(),
            updated_at: "2026-04-01T00:00:00Z".to_string(),
            shared: SenaOrderFieldValues::default(),
            children: vec![base_child.clone()],
        };
        let owner_two_batch = SenaOrderBatchRecord {
            owner_sub: "owner-two".to_string(),
            supplier_name: Some("Owner Two Supplier".to_string()),
            children: vec![SenaOrderChildRecord {
                child_order_id: "orders/shared/sku-2".to_string(),
                sku_id: "sku-2".to_string(),
                ..base_child
            }],
            ..owner_one_batch.clone()
        };

        {
            let connection = repo
                .connection
                .lock()
                .expect("sqlite lock should be available");
            persist_batch(&connection, &owner_one_batch).expect("first owner batch should persist");
            let collision = persist_batch(&connection, &owner_two_batch)
                .expect_err("second owner should not overwrite first owner batch");
            assert!(collision.to_string().contains("another owner"));
        }

        let owner_one_batches = {
            let connection = repo
                .connection
                .lock()
                .expect("sqlite lock should be available");
            load_all_batches(&connection, "owner-one").expect("owner one batches should load")
        };
        assert_eq!(owner_one_batches.len(), 1);
        assert_eq!(owner_one_batches[0].owner_sub, "owner-one");
        assert_eq!(
            owner_one_batches[0].supplier_name.as_deref(),
            Some("Owner One Supplier")
        );
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
        assert!(updated_batch.children.iter().all(|child| child
            .effective
            .supplier_note
            .as_deref()
            == Some("shared update")));

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
        assert_eq!(
            changed_child.status,
            crate::types::SenaOrderChildStatus::Received
        );
        assert_eq!(changed_child.effective.received_quantity, Some(5.0));

        let split_batch = block_on(repo.split_order_child(
            "owner",
            &SenaSplitOrderChildPayload {
                child_order_id: child_id,
            },
        ))
        .expect("child should split");
        assert_ne!(split_batch.batch_order_id, batch.batch_order_id);
        assert_eq!(split_batch.children.len(), 1);
        assert_eq!(
            split_batch.children[0].effective.received_quantity,
            Some(5.0)
        );
    }

    #[test]
    fn split_order_child_preserves_manual_review_status() {
        let path = temp_store_path("order-split-reviewed");
        let repo = SqliteSenaRepository::open(&path).expect("repo should open");
        let batch = block_on(repo.create_order_batch(
            "owner",
            &SenaCreateOrderBatchPayload {
                supplier_name: Some("Mekong Looms".to_string()),
                shared: SenaOrderFieldValues::default(),
                children: vec![
                    crate::types::SenaOrderBatchCreateChildInput {
                        sku_id: "shirt".to_string(),
                        overrides: Some(SenaOrderFieldValues {
                            received_quantity: Some(5.0),
                            receipt_timestamp: Some("2026-04-21T00:00:00Z".to_string()),
                            ..Default::default()
                        }),
                    },
                    crate::types::SenaOrderBatchCreateChildInput {
                        sku_id: "pants".to_string(),
                        overrides: None,
                    },
                ],
            },
        ))
        .expect("order batch should create");
        let child_id = batch.children[0].child_order_id.clone();

        let reviewed = block_on(repo.update_order_child(
            "owner",
            &SenaUpdateOrderChildPayload {
                child_order_id: child_id.clone(),
                sku_id: None,
                overrides: None,
                status: Some(crate::types::SenaOrderChildStatus::Reviewed),
                append_supplier_note: None,
            },
        ))
        .expect("order child should mark reviewed");
        assert_eq!(
            reviewed.children[0].status,
            crate::types::SenaOrderChildStatus::Reviewed
        );

        let split_batch = block_on(repo.split_order_child(
            "owner",
            &SenaSplitOrderChildPayload {
                child_order_id: child_id,
            },
        ))
        .expect("reviewed child should split");

        assert_eq!(
            split_batch.children[0].status,
            crate::types::SenaOrderChildStatus::Reviewed
        );
        assert_eq!(
            split_batch.status,
            crate::types::SenaOrderBatchStatus::Reviewed
        );
    }
}
