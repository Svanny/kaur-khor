use crate::inference::analyze_workspace;
use crate::types::{
    SenaAnalysisOutputs, SenaAnalysisRunSummary, SenaArtifactReference, SenaObservationRecord,
    SenaService, SenaSku, SenaWorkspaceData,
};
use anyhow::{anyhow, Result};
use rusqlite::{params, Connection};
use std::{
    collections::HashMap,
    env, fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};

pub trait SenaRepository {
    fn load_workspace_data(&self, owner_sub: &str) -> Result<SenaWorkspaceData>;
    fn upsert_sku(&self, owner_sub: &str, sku: SenaSku) -> Result<SenaSku>;
    fn upsert_service(&self, owner_sub: &str, service: SenaService) -> Result<SenaService>;
    fn append_observation(
        &self,
        owner_sub: &str,
        observation: SenaObservationRecord,
    ) -> Result<SenaObservationRecord>;
    fn save_analysis_outputs(&self, owner_sub: &str, outputs: &SenaAnalysisOutputs) -> Result<()>;
    fn load_latest_analysis(&self, owner_sub: &str) -> Result<Option<SenaAnalysisOutputs>>;
    fn load_run(&self, owner_sub: &str, run_id: &str) -> Result<Option<SenaAnalysisRunSummary>>;
}

#[derive(Clone, Default)]
pub struct MemorySenaStore {
    inner: Arc<Mutex<HashMap<String, MemoryWorkspace>>>,
}

#[derive(Clone, Default)]
struct MemoryWorkspace {
    skus: Vec<SenaSku>,
    services: Vec<SenaService>,
    observations: Vec<SenaObservationRecord>,
    latest: Option<SenaAnalysisOutputs>,
}

impl SenaRepository for MemorySenaStore {
    fn load_workspace_data(&self, owner_sub: &str) -> Result<SenaWorkspaceData> {
        let guard = self
            .inner
            .lock()
            .map_err(|_| anyhow!("memory store poisoned"))?;
        let workspace = guard.get(owner_sub).cloned().unwrap_or_default();
        Ok(SenaWorkspaceData {
            skus: workspace.skus,
            services: workspace.services,
            observations: workspace.observations,
        })
    }

    fn upsert_sku(&self, owner_sub: &str, sku: SenaSku) -> Result<SenaSku> {
        let mut guard = self
            .inner
            .lock()
            .map_err(|_| anyhow!("memory store poisoned"))?;
        let workspace = guard.entry(owner_sub.to_string()).or_default();
        if let Some(existing) = workspace
            .skus
            .iter_mut()
            .find(|existing| existing.sku_id == sku.sku_id)
        {
            *existing = sku.clone();
        } else {
            workspace.skus.push(sku.clone());
            workspace
                .skus
                .sort_by(|left, right| left.sku_id.cmp(&right.sku_id));
        }
        Ok(sku)
    }

    fn upsert_service(&self, owner_sub: &str, service: SenaService) -> Result<SenaService> {
        let mut guard = self
            .inner
            .lock()
            .map_err(|_| anyhow!("memory store poisoned"))?;
        let workspace = guard.entry(owner_sub.to_string()).or_default();
        if let Some(existing) = workspace
            .services
            .iter_mut()
            .find(|existing| existing.service_id == service.service_id)
        {
            *existing = service.clone();
        } else {
            workspace.services.push(service.clone());
            workspace
                .services
                .sort_by(|left, right| left.service_id.cmp(&right.service_id));
        }
        Ok(service)
    }

    fn append_observation(
        &self,
        owner_sub: &str,
        observation: SenaObservationRecord,
    ) -> Result<SenaObservationRecord> {
        let mut guard = self
            .inner
            .lock()
            .map_err(|_| anyhow!("memory store poisoned"))?;
        let workspace = guard.entry(owner_sub.to_string()).or_default();
        workspace.observations.push(observation.clone());
        workspace
            .observations
            .sort_by(|left, right| left.reported_at.cmp(&right.reported_at));
        Ok(observation)
    }

    fn save_analysis_outputs(&self, owner_sub: &str, outputs: &SenaAnalysisOutputs) -> Result<()> {
        let mut guard = self
            .inner
            .lock()
            .map_err(|_| anyhow!("memory store poisoned"))?;
        let workspace = guard.entry(owner_sub.to_string()).or_default();
        workspace.latest = Some(outputs.clone());
        Ok(())
    }

    fn load_latest_analysis(&self, owner_sub: &str) -> Result<Option<SenaAnalysisOutputs>> {
        let guard = self
            .inner
            .lock()
            .map_err(|_| anyhow!("memory store poisoned"))?;
        Ok(guard
            .get(owner_sub)
            .and_then(|workspace| workspace.latest.clone()))
    }

    fn load_run(&self, owner_sub: &str, run_id: &str) -> Result<Option<SenaAnalysisRunSummary>> {
        Ok(self
            .load_latest_analysis(owner_sub)?
            .and_then(|outputs| (outputs.run.run_id == run_id).then_some(outputs.run)))
    }
}

pub struct SqliteSenaStore {
    path: PathBuf,
}

impl SqliteSenaStore {
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        let path = path.as_ref().to_path_buf();
        let store = Self { path };
        store.ensure_schema()?;
        Ok(store)
    }

    fn connect(&self) -> Result<Connection> {
        let connection = Connection::open(&self.path)?;
        connection.pragma_update(None, "journal_mode", "WAL")?;
        Ok(connection)
    }

    fn ensure_schema(&self) -> Result<()> {
        let connection = self.connect()?;
        connection.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS sena_catalog_sku (
                owner_sub TEXT NOT NULL,
                sku_id TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                PRIMARY KEY (owner_sub, sku_id)
            );
            CREATE TABLE IF NOT EXISTS sena_catalog_service (
                owner_sub TEXT NOT NULL,
                service_id TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                PRIMARY KEY (owner_sub, service_id)
            );
            CREATE TABLE IF NOT EXISTS sena_observation (
                owner_sub TEXT NOT NULL,
                observation_id TEXT NOT NULL,
                reported_at TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                PRIMARY KEY (owner_sub, observation_id)
            );
            CREATE TABLE IF NOT EXISTS sena_analysis_run (
                owner_sub TEXT NOT NULL,
                run_id TEXT NOT NULL,
                summary_json TEXT NOT NULL,
                outputs_json TEXT NOT NULL,
                is_latest INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (owner_sub, run_id)
            );
            "#,
        )?;
        Ok(())
    }
}

impl SenaRepository for SqliteSenaStore {
    fn load_workspace_data(&self, owner_sub: &str) -> Result<SenaWorkspaceData> {
        let connection = self.connect()?;
        let mut sku_stmt = connection.prepare(
            "SELECT payload_json FROM sena_catalog_sku WHERE owner_sub = ?1 ORDER BY sku_id ASC",
        )?;
        let skus = sku_stmt
            .query_map([owner_sub], |row| row.get::<_, String>(0))?
            .map(|row| Ok(serde_json::from_str::<SenaSku>(&row?)?))
            .collect::<Result<Vec<_>>>()?;

        let mut service_stmt = connection.prepare(
            "SELECT payload_json FROM sena_catalog_service WHERE owner_sub = ?1 ORDER BY service_id ASC",
        )?;
        let services = service_stmt
            .query_map([owner_sub], |row| row.get::<_, String>(0))?
            .map(|row| Ok(serde_json::from_str::<SenaService>(&row?)?))
            .collect::<Result<Vec<_>>>()?;

        let mut observation_stmt = connection.prepare(
            "SELECT payload_json FROM sena_observation WHERE owner_sub = ?1 ORDER BY reported_at ASC",
        )?;
        let observations = observation_stmt
            .query_map([owner_sub], |row| row.get::<_, String>(0))?
            .map(|row| Ok(serde_json::from_str::<SenaObservationRecord>(&row?)?))
            .collect::<Result<Vec<_>>>()?;

        Ok(SenaWorkspaceData {
            skus,
            services,
            observations,
        })
    }

    fn upsert_sku(&self, owner_sub: &str, sku: SenaSku) -> Result<SenaSku> {
        let connection = self.connect()?;
        connection.execute(
            r#"
            INSERT INTO sena_catalog_sku (owner_sub, sku_id, payload_json)
            VALUES (?1, ?2, ?3)
            ON CONFLICT(owner_sub, sku_id)
            DO UPDATE SET payload_json = excluded.payload_json
            "#,
            params![owner_sub, sku.sku_id, serde_json::to_string(&sku)?],
        )?;
        Ok(sku)
    }

    fn upsert_service(&self, owner_sub: &str, service: SenaService) -> Result<SenaService> {
        let connection = self.connect()?;
        connection.execute(
            r#"
            INSERT INTO sena_catalog_service (owner_sub, service_id, payload_json)
            VALUES (?1, ?2, ?3)
            ON CONFLICT(owner_sub, service_id)
            DO UPDATE SET payload_json = excluded.payload_json
            "#,
            params![
                owner_sub,
                service.service_id,
                serde_json::to_string(&service)?
            ],
        )?;
        Ok(service)
    }

    fn append_observation(
        &self,
        owner_sub: &str,
        observation: SenaObservationRecord,
    ) -> Result<SenaObservationRecord> {
        let connection = self.connect()?;
        connection.execute(
            r#"
            INSERT INTO sena_observation (owner_sub, observation_id, reported_at, payload_json)
            VALUES (?1, ?2, ?3, ?4)
            ON CONFLICT(owner_sub, observation_id)
            DO UPDATE SET reported_at = excluded.reported_at, payload_json = excluded.payload_json
            "#,
            params![
                owner_sub,
                observation.observation_id,
                observation.reported_at,
                serde_json::to_string(&observation)?
            ],
        )?;
        Ok(observation)
    }

    fn save_analysis_outputs(&self, owner_sub: &str, outputs: &SenaAnalysisOutputs) -> Result<()> {
        let connection = self.connect()?;
        connection.execute(
            "UPDATE sena_analysis_run SET is_latest = 0 WHERE owner_sub = ?1",
            [owner_sub],
        )?;
        connection.execute(
            r#"
            INSERT INTO sena_analysis_run (owner_sub, run_id, summary_json, outputs_json, is_latest)
            VALUES (?1, ?2, ?3, ?4, 1)
            ON CONFLICT(owner_sub, run_id)
            DO UPDATE SET
                summary_json = excluded.summary_json,
                outputs_json = excluded.outputs_json,
                is_latest = 1
            "#,
            params![
                owner_sub,
                outputs.run.run_id,
                serde_json::to_string(&outputs.run)?,
                serde_json::to_string(outputs)?
            ],
        )?;
        Ok(())
    }

    fn load_latest_analysis(&self, owner_sub: &str) -> Result<Option<SenaAnalysisOutputs>> {
        let connection = self.connect()?;
        let mut stmt = connection.prepare(
            "SELECT outputs_json FROM sena_analysis_run WHERE owner_sub = ?1 AND is_latest = 1 LIMIT 1",
        )?;
        let json = stmt.query_row([owner_sub], |row| row.get::<_, String>(0));
        match json {
            Ok(json) => Ok(Some(serde_json::from_str(&json)?)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(err) => Err(err.into()),
        }
    }

    fn load_run(&self, owner_sub: &str, run_id: &str) -> Result<Option<SenaAnalysisRunSummary>> {
        let connection = self.connect()?;
        let mut stmt = connection.prepare(
            "SELECT summary_json FROM sena_analysis_run WHERE owner_sub = ?1 AND run_id = ?2 LIMIT 1",
        )?;
        let json = stmt.query_row(params![owner_sub, run_id], |row| row.get::<_, String>(0));
        match json {
            Ok(json) => Ok(Some(serde_json::from_str(&json)?)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(err) => Err(err.into()),
        }
    }
}

pub fn default_store_path() -> PathBuf {
    if let Ok(path) = env::var("KAUR_KHOR_SENA_DATA_PATH") {
        return PathBuf::from(path);
    }
    if let Ok(path) = env::var("KAUR_KHOR_DESKTOP_DATA_PATH") {
        return PathBuf::from(path);
    }
    env::temp_dir().join("kaur-khor-sena-store.sqlite3")
}

fn artifact_dir_for_store_path(path: &Path) -> PathBuf {
    if let Ok(value) = env::var("KAUR_KHOR_SENA_ARTIFACT_DIR") {
        return PathBuf::from(value);
    }
    let stem = path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("kaur-khor-sena-store");
    path.with_file_name(format!("{stem}-artifacts"))
}

pub fn build_store() -> Result<SqliteSenaStore> {
    SqliteSenaStore::open(default_store_path())
}

pub fn recompute_analysis<R: SenaRepository>(
    repository: &R,
    owner_sub: &str,
) -> Result<SenaAnalysisOutputs> {
    let workspace = repository.load_workspace_data(owner_sub)?;
    let timestamp = OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string());
    let run_id = format!("sena-run-{owner_sub}-{timestamp}");
    let store_path = default_store_path();
    let artifact_dir = artifact_dir_for_store_path(&store_path);
    fs::create_dir_all(&artifact_dir)?;
    let artifact_path = artifact_dir.join(format!("{run_id}.json"));
    let artifact_reference = SenaArtifactReference {
        artifact_role: "analysis_snapshot".to_string(),
        artifact_version: 1,
        path: artifact_path.display().to_string(),
    };
    let outputs = analyze_workspace(&workspace, run_id, Some(artifact_reference.clone()))?;
    fs::write(&artifact_path, serde_json::to_vec_pretty(&outputs)?)?;
    repository.save_analysis_outputs(owner_sub, &outputs)?;
    Ok(outputs)
}
