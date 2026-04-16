use crate::{
    service::{now_rfc3339, SenaRepository},
    types::{
        SenaAnalysisResult, SenaAnalysisRunRecord, SenaCatalog, SenaCreateOrderBatchPayload,
        SenaDiagnostics, SenaObservationInput, SenaObservationRecord, SenaOrderBatchRecord,
        SenaOrderBatchStatus, SenaOrderChildRecord, SenaOrderChildStatus,
        SenaOrderFieldValues, SenaOrderLookupPayload, SenaRunStatus, SenaServiceDetail,
        SenaSkuDetail, SenaSplitOrderChildPayload, SenaUpdateOrderBatchPayload,
        SenaUpdateOrderChildPayload, SenaWorkspaceSummary,
    },
    PreprocessedWorkspace, SenaAnalysisCheckpoint,
};
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;
use std::sync::Mutex;
use time::{format_description::parse as parse_time_format, OffsetDateTime};
use uuid::Uuid;

pub struct SqliteSenaRepository {
    connection: Mutex<Connection>,
}

impl SqliteSenaRepository {
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        let connection = Connection::open(path)?;
        let repo = Self {
            connection: Mutex::new(connection),
        };
        repo.migrate()?;
        Ok(repo)
    }

    fn migrate(&self) -> Result<()> {
        let connection = self
            .connection
            .lock()
            .map_err(|_| anyhow!("sqlite lock poisoned"))?;
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
            "#,
        )?;
        Ok(())
    }
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
        Ok(())
    }

    async fn list_observations(&self, owner_sub: &str) -> Result<Vec<SenaObservationRecord>> {
        let connection = self
            .connection
            .lock()
            .map_err(|_| anyhow!("sqlite lock poisoned"))?;
        let mut stmt = connection.prepare(
            "SELECT observation_id, payload FROM sena_observation WHERE owner_sub = ?1 ORDER BY observed_at ASC",
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
        let connection = self
            .connection
            .lock()
            .map_err(|_| anyhow!("sqlite lock poisoned"))?;
        let run_id = connection
            .query_row(
                "SELECT run_id FROM sena_run WHERE owner_sub = ?1 ORDER BY created_at DESC LIMIT 1",
                params![owner_sub],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
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
            SELECT payload_json
            FROM sena_analysis_checkpoint
            WHERE owner_sub = ?1
              AND algorithm_version = ?2
              AND catalog_fingerprint = ?3
            ORDER BY observation_count DESC, completed_interval_count DESC
            "#,
        )?;
        let rows = stmt.query_map(
            params![owner_sub, algorithm_version, catalog_fingerprint],
            |row| row.get::<_, String>(0),
        )?;
        let mut checkpoints = Vec::new();
        for row in rows {
            checkpoints.push(serde_json::from_str(&row?)?);
        }
        Ok(checkpoints)
    }

    async fn save_analysis_checkpoint(&self, checkpoint: &SenaAnalysisCheckpoint) -> Result<()> {
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
              updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            ON CONFLICT(owner_sub, algorithm_version, catalog_fingerprint, completed_interval_count)
            DO UPDATE SET
              observation_count = excluded.observation_count,
              observation_prefix_fingerprint = excluded.observation_prefix_fingerprint,
              payload_json = excluded.payload_json,
              updated_at = excluded.updated_at
            "#,
            params![
                checkpoint.metadata.owner_sub,
                checkpoint.metadata.algorithm_version,
                checkpoint.metadata.catalog_fingerprint,
                checkpoint.metadata.observation_count as i64,
                checkpoint.metadata.completed_interval_count as i64,
                checkpoint.metadata.observation_prefix_fingerprint,
                serde_json::to_string(checkpoint)?,
                now_rfc3339(),
            ],
        )?;
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
        let value = connection
            .query_row(
                "SELECT workspace_summary_json FROM sena_read_model WHERE owner_sub = ?1",
                params![owner_sub],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        value
            .map(|raw| serde_json::from_str(&raw).map_err(anyhow::Error::new))
            .transpose()
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
        let connection = self
            .connection
            .lock()
            .map_err(|_| anyhow!("sqlite lock poisoned"))?;
        let value = connection
            .query_row(
                "SELECT payload_json FROM sena_service_detail WHERE owner_sub = ?1 AND service_id = ?2",
                params![owner_sub, service_id],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        value
            .map(|raw| serde_json::from_str(&raw).map_err(anyhow::Error::new))
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
        SenaObservationRecord, SenaOrderSignal, SenaService,
        SenaServicePriceObservation, SenaServiceSkuMaskEntry, SenaSku,
        SenaSplitOrderChildPayload, SenaStockSnapshot, SenaUpdateOrderBatchPayload,
        SenaUpdateOrderChildPayload,
    };
    use futures::executor::block_on;
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
                recipe_usage_hints: Vec::new(),
                notes: None,
            },
        }
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
        assert_eq!(checkpoints.len(), first.checkpoints.len());
        assert!(
            checkpoints[0].metadata.completed_interval_count
                > checkpoints[1].metadata.completed_interval_count
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
