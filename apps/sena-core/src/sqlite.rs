use crate::{
    service::{now_rfc3339, SenaRepository},
    types::{
        SenaAnalysisResult, SenaAnalysisRunRecord, SenaCatalog, SenaDiagnostics,
        SenaObservationInput, SenaObservationRecord, SenaRunStatus, SenaServiceDetail,
        SenaSkuDetail, SenaWorkspaceSummary,
    },
    PreprocessedWorkspace, SenaAnalysisCheckpoint,
};
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;
use std::sync::Mutex;
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
        service::SenaRepository, PreprocessedWorkspace, SenaCatalog, SenaLeadTimeHint,
        SenaObservationInput, SenaObservationRecord, SenaOrderSignal, SenaService,
        SenaServicePriceObservation, SenaServiceSkuMaskEntry, SenaSku, SenaStockSnapshot,
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
                cost_per_unit: 2.0,
                sold_as_product: true,
                product_price: Some(5.0),
                lead_time_mean_days_hint: Some(2.0),
                lead_time_std_days_hint: Some(1.0),
            }],
            services: vec![SenaService {
                service_id: "svc-1".to_string(),
                name: "Service".to_string(),
                description: "Linked service".to_string(),
                price: 10.0,
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
}
