use crate::{
    service::{now_rfc3339, SenaRepository},
    types::{
        SenaAnalysisResult, SenaAnalysisRunRecord, SenaCatalog, SenaDiagnostics,
        SenaObservationInput, SenaObservationRecord, SenaRunStatus, SenaServiceDetail,
        SenaSkuDetail, SenaWorkspaceSummary,
    },
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
        let connection = self.connection.lock().map_err(|_| anyhow!("sqlite lock poisoned"))?;
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
            "#,
        )?;
        Ok(())
    }
}

#[async_trait(?Send)]
impl SenaRepository for SqliteSenaRepository {
    async fn upsert_catalog(&self, owner_sub: &str, catalog: &SenaCatalog) -> Result<()> {
        let connection = self.connection.lock().map_err(|_| anyhow!("sqlite lock poisoned"))?;
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
        let connection = self.connection.lock().map_err(|_| anyhow!("sqlite lock poisoned"))?;
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
        let connection = self.connection.lock().map_err(|_| anyhow!("sqlite lock poisoned"))?;
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
        let connection = self.connection.lock().map_err(|_| anyhow!("sqlite lock poisoned"))?;
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
        let connection = self.connection.lock().map_err(|_| anyhow!("sqlite lock poisoned"))?;
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
        let connection = self.connection.lock().map_err(|_| anyhow!("sqlite lock poisoned"))?;
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
        let connection = self.connection.lock().map_err(|_| anyhow!("sqlite lock poisoned"))?;
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
        let connection = self.connection.lock().map_err(|_| anyhow!("sqlite lock poisoned"))?;
        let owner_sub = result.workspace_summary.owner_sub.clone();
        let mut summary = result.workspace_summary.clone();
        summary.run_id = run_id.to_string();
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
                serde_json::to_string(&result.sku_details)?,
                serde_json::to_string(&result.service_details)?,
                now_rfc3339(),
                run_id,
            ],
        )?;
        Ok(())
    }

    async fn mark_run_failed(&self, run_id: &str, error: &str) -> Result<()> {
        let connection = self.connection.lock().map_err(|_| anyhow!("sqlite lock poisoned"))?;
        connection.execute(
            "UPDATE sena_run SET status = 'failed', completed_at = ?2, error = ?3 WHERE run_id = ?1",
            params![run_id, now_rfc3339(), error],
        )?;
        Ok(())
    }

    async fn load_workspace_summary(&self, owner_sub: &str) -> Result<Option<SenaWorkspaceSummary>> {
        let connection = self.connection.lock().map_err(|_| anyhow!("sqlite lock poisoned"))?;
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

    async fn load_sku_detail(&self, owner_sub: &str, sku_id: &str) -> Result<Option<SenaSkuDetail>> {
        let connection = self.connection.lock().map_err(|_| anyhow!("sqlite lock poisoned"))?;
        let value = connection
            .query_row(
                "SELECT sku_details_json FROM sena_read_model WHERE owner_sub = ?1",
                params![owner_sub],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        let Some(raw) = value else {
            return Ok(None);
        };
        let details: Vec<SenaSkuDetail> = serde_json::from_str(&raw)?;
        Ok(details.into_iter().find(|detail| detail.summary.sku_id == sku_id))
    }

    async fn load_service_detail(
        &self,
        owner_sub: &str,
        service_id: &str,
    ) -> Result<Option<SenaServiceDetail>> {
        let connection = self.connection.lock().map_err(|_| anyhow!("sqlite lock poisoned"))?;
        let value = connection
            .query_row(
                "SELECT service_details_json FROM sena_read_model WHERE owner_sub = ?1",
                params![owner_sub],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        let Some(raw) = value else {
            return Ok(None);
        };
        let details: Vec<SenaServiceDetail> = serde_json::from_str(&raw)?;
        Ok(details.into_iter().find(|detail| detail.service_id == service_id))
    }

    async fn load_diagnostics(&self, owner_sub: &str) -> Result<Option<SenaDiagnostics>> {
        let connection = self.connection.lock().map_err(|_| anyhow!("sqlite lock poisoned"))?;
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
