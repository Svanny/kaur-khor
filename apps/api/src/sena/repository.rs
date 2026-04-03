use anyhow::{anyhow, Result};
use async_trait::async_trait;
use banji_sena_core::{
    now_rfc3339, run_analysis, SenaAnalysisResult, SenaAnalysisRunRecord, SenaCatalog,
    SenaDiagnostics, SenaObservationInput, SenaObservationRecord, SenaRepository,
    SenaRunStatus, SenaServiceDetail, SenaSkuDetail, SenaWorkspaceSummary,
};
use sqlx::{postgres::PgRow, PgPool, Postgres, Row, Transaction};
use uuid::Uuid;

pub struct PgSenaRepository {
    pool: PgPool,
}

impl PgSenaRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[async_trait(?Send)]
impl SenaRepository for PgSenaRepository {
    async fn clear_owner(&self, owner_sub: &str) -> Result<()> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("DELETE FROM app.sena_workspace_summary WHERE owner_sub = $1")
            .bind(owner_sub)
            .execute(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM app.sena_sku_summary WHERE owner_sub = $1")
            .bind(owner_sub)
            .execute(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM app.sena_service_summary WHERE owner_sub = $1")
            .bind(owner_sub)
            .execute(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM app.sena_analysis_run WHERE owner_sub = $1")
            .bind(owner_sub)
            .execute(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM app.sena_observation WHERE owner_sub = $1")
            .bind(owner_sub)
            .execute(&mut *tx)
            .await?;
        sqlx::query("DELETE FROM app.sena_catalog WHERE owner_sub = $1")
            .bind(owner_sub)
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(())
    }

    async fn upsert_catalog(&self, owner_sub: &str, catalog: &SenaCatalog) -> Result<()> {
        let mut tx = self.pool.begin().await?;
        upsert_catalog_tx(&mut tx, owner_sub, catalog).await?;
        tx.commit().await?;
        Ok(())
    }

    async fn get_catalog(&self, owner_sub: &str) -> Result<Option<SenaCatalog>> {
        get_catalog(&self.pool, owner_sub).await
    }

    async fn insert_observation(
        &self,
        owner_sub: &str,
        observation: &SenaObservationInput,
    ) -> Result<SenaObservationRecord> {
        let mut tx = self.pool.begin().await?;
        let value = insert_observation_tx(&mut tx, owner_sub, observation).await?;
        tx.commit().await?;
        Ok(value)
    }

    async fn list_observations(&self, owner_sub: &str) -> Result<Vec<SenaObservationRecord>> {
        list_observations(&self.pool, owner_sub).await
    }

    async fn create_run(
        &self,
        owner_sub: &str,
        algorithm_version: &str,
    ) -> Result<SenaAnalysisRunRecord> {
        let mut tx = self.pool.begin().await?;
        let run = create_run_tx(&mut tx, owner_sub, algorithm_version).await?;
        tx.commit().await?;
        Ok(run)
    }

    async fn get_run(&self, run_id: &str) -> Result<Option<SenaAnalysisRunRecord>> {
        get_run(&self.pool, run_id).await
    }

    async fn get_latest_run(&self, owner_sub: &str) -> Result<Option<SenaAnalysisRunRecord>> {
        let run_id: Option<Uuid> = sqlx::query_scalar(
            "SELECT run_id FROM app.sena_analysis_run WHERE owner_sub = $1 ORDER BY created_at DESC LIMIT 1",
        )
        .bind(owner_sub)
        .fetch_optional(&self.pool)
        .await?;
        match run_id {
            Some(run_id) => get_run(&self.pool, &run_id.to_string()).await,
            None => Ok(None),
        }
    }

    async fn persist_completed_run(
        &self,
        run_id: &str,
        result: &SenaAnalysisResult,
        artifact_key: Option<&str>,
    ) -> Result<()> {
        let mut tx = self.pool.begin().await?;
        persist_completed_run_tx(&mut tx, run_id, result, artifact_key).await?;
        tx.commit().await?;
        Ok(())
    }

    async fn mark_run_failed(&self, run_id: &str, error: &str) -> Result<()> {
        sqlx::query(
            "UPDATE app.sena_analysis_run SET status = 'failed', completed_at = NOW(), error = $2 WHERE run_id = $1::uuid",
        )
        .bind(run_id)
        .bind(error)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    async fn load_workspace_summary(&self, owner_sub: &str) -> Result<Option<SenaWorkspaceSummary>> {
        load_workspace_summary(&self.pool, owner_sub).await
    }

    async fn load_sku_detail(&self, owner_sub: &str, sku_id: &str) -> Result<Option<SenaSkuDetail>> {
        load_sku_detail(&self.pool, owner_sub, sku_id).await
    }

    async fn load_service_detail(
        &self,
        owner_sub: &str,
        service_id: &str,
    ) -> Result<Option<SenaServiceDetail>> {
        load_service_detail(&self.pool, owner_sub, service_id).await
    }

    async fn load_diagnostics(&self, owner_sub: &str) -> Result<Option<SenaDiagnostics>> {
        load_diagnostics(&self.pool, owner_sub).await
    }
}

pub async fn upsert_catalog_tx(
    tx: &mut Transaction<'_, Postgres>,
    owner_sub: &str,
    catalog: &SenaCatalog,
) -> Result<()> {
    sqlx::query(
        r#"
        INSERT INTO app.sena_catalog (owner_sub, payload, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (owner_sub)
        DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
        "#,
    )
    .bind(owner_sub)
    .bind(sqlx::types::Json(catalog))
    .execute(&mut **tx)
    .await?;
    Ok(())
}

pub async fn get_catalog(pool: &PgPool, owner_sub: &str) -> Result<Option<SenaCatalog>> {
    let row = sqlx::query("SELECT payload FROM app.sena_catalog WHERE owner_sub = $1")
        .bind(owner_sub)
        .fetch_optional(pool)
        .await?;
    row.map(|row| row.try_get::<sqlx::types::Json<SenaCatalog>, _>("payload"))
        .transpose()
        .map(|value| value.map(|json| json.0))
        .map_err(anyhow::Error::new)
}

pub async fn insert_observation_tx(
    tx: &mut Transaction<'_, Postgres>,
    owner_sub: &str,
    observation: &SenaObservationInput,
) -> Result<SenaObservationRecord> {
    let observation_id = Uuid::new_v4();
    sqlx::query(
        r#"
        INSERT INTO app.sena_observation (
          observation_id, owner_sub, observed_at, payload, created_at
        ) VALUES ($1, $2, $3::timestamptz, $4, NOW())
        "#,
    )
    .bind(observation_id)
    .bind(owner_sub)
    .bind(&observation.observed_at)
    .bind(sqlx::types::Json(observation))
    .execute(&mut **tx)
    .await?;
    Ok(SenaObservationRecord {
        observation_id: observation_id.to_string(),
        owner_sub: owner_sub.to_string(),
        input: observation.clone(),
    })
}

pub async fn list_observations(pool: &PgPool, owner_sub: &str) -> Result<Vec<SenaObservationRecord>> {
    let rows = sqlx::query(
        "SELECT observation_id, payload FROM app.sena_observation WHERE owner_sub = $1 ORDER BY observed_at ASC",
    )
    .bind(owner_sub)
    .fetch_all(pool)
    .await?;
    rows.into_iter()
        .map(|row| {
            Ok(SenaObservationRecord {
                observation_id: row.try_get::<Uuid, _>("observation_id")?.to_string(),
                owner_sub: owner_sub.to_string(),
                input: row.try_get::<sqlx::types::Json<SenaObservationInput>, _>("payload")?.0,
            })
        })
        .collect()
}

pub async fn create_run_tx(
    tx: &mut Transaction<'_, Postgres>,
    owner_sub: &str,
    algorithm_version: &str,
) -> Result<SenaAnalysisRunRecord> {
    let run_id = Uuid::new_v4();
    let observation_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM app.sena_observation WHERE owner_sub = $1",
    )
    .bind(owner_sub)
    .fetch_one(&mut **tx)
    .await?;
    let created_at = now_rfc3339();
    sqlx::query(
        r#"
        INSERT INTO app.sena_analysis_run (
          run_id, owner_sub, algorithm_version, status, observation_count, created_at
        ) VALUES ($1, $2, $3, 'queued', $4, NOW())
        "#,
    )
    .bind(run_id)
    .bind(owner_sub)
    .bind(algorithm_version)
    .bind(observation_count)
    .execute(&mut **tx)
    .await?;
    Ok(SenaAnalysisRunRecord {
        run_id: run_id.to_string(),
        owner_sub: owner_sub.to_string(),
        algorithm_version: algorithm_version.to_string(),
        status: SenaRunStatus::Queued,
        observation_count: observation_count as usize,
        created_at,
        completed_at: None,
        summary: None,
        diagnostics: None,
        primary_artifact_key: None,
        error: None,
    })
}

pub async fn get_run(pool: &PgPool, run_id: &str) -> Result<Option<SenaAnalysisRunRecord>> {
    let row = sqlx::query(
        r#"
        SELECT run_id, owner_sub, algorithm_version, status, observation_count,
               created_at, completed_at, summary, diagnostics, primary_artifact_key, error
        FROM app.sena_analysis_run
        WHERE run_id = $1::uuid
        "#,
    )
    .bind(run_id)
    .fetch_optional(pool)
    .await?;
    row.as_ref().map(run_from_row).transpose()
}

pub async fn persist_completed_run_tx(
    tx: &mut Transaction<'_, Postgres>,
    run_id: &str,
    result: &SenaAnalysisResult,
    artifact_key: Option<&str>,
) -> Result<()> {
    let mut summary = result.workspace_summary.clone();
    summary.run_id = run_id.to_string();
    let owner_sub = summary.owner_sub.clone();
    sqlx::query(
        r#"
        UPDATE app.sena_analysis_run
        SET status = 'succeeded',
            completed_at = NOW(),
            summary = $2,
            diagnostics = $3,
            primary_artifact_key = $4,
            error = NULL
        WHERE run_id = $1::uuid
        "#,
    )
    .bind(run_id)
    .bind(sqlx::types::Json(&summary))
    .bind(sqlx::types::Json(&result.diagnostics))
    .bind(artifact_key)
    .execute(&mut **tx)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO app.sena_latest_projection (
          owner_sub, run_id, workspace_summary, diagnostics, sku_details, service_details, updated_at, source_event_id
        ) VALUES ($1, $2::uuid, $3, $4, $5, $6, NOW(), NULL)
        ON CONFLICT (owner_sub)
        DO UPDATE SET
          run_id = EXCLUDED.run_id,
          workspace_summary = EXCLUDED.workspace_summary,
          diagnostics = EXCLUDED.diagnostics,
          sku_details = EXCLUDED.sku_details,
          service_details = EXCLUDED.service_details,
          updated_at = NOW()
        "#,
    )
    .bind(&owner_sub)
    .bind(run_id)
    .bind(sqlx::types::Json(&summary))
    .bind(sqlx::types::Json(&result.diagnostics))
    .bind(sqlx::types::Json(&result.sku_details))
    .bind(sqlx::types::Json(&result.service_details))
    .execute(&mut **tx)
    .await?;
    Ok(())
}

pub async fn run_analysis_now(
    pool: &PgPool,
    owner_sub: &str,
    algorithm_version: &str,
) -> Result<SenaAnalysisRunRecord> {
    let mut tx = pool.begin().await?;
    let run = create_run_tx(&mut tx, owner_sub, algorithm_version).await?;
    tx.commit().await?;

    let catalog = get_catalog(pool, owner_sub)
        .await?
        .ok_or_else(|| anyhow!("catalog not found"))?;
    let observations = list_observations(pool, owner_sub).await?;
    let (result, _artifacts) = run_analysis(owner_sub, &catalog, &observations, algorithm_version)?;

    let mut tx = pool.begin().await?;
    persist_completed_run_tx(&mut tx, &run.run_id, &result, None).await?;
    tx.commit().await?;
    get_run(pool, &run.run_id)
        .await?
        .ok_or_else(|| anyhow!("completed SENA run disappeared"))
}

pub async fn execute_existing_run_now(
    pool: &PgPool,
    run_id: &str,
    algorithm_version: &str,
) -> Result<SenaAnalysisRunRecord> {
    let existing = get_run(pool, run_id)
        .await?
        .ok_or_else(|| anyhow!("SENA run not found"))?;
    let catalog = get_catalog(pool, &existing.owner_sub)
        .await?
        .ok_or_else(|| anyhow!("catalog not found"))?;
    let observations = list_observations(pool, &existing.owner_sub).await?;
    let (result, _artifacts) = run_analysis(
        &existing.owner_sub,
        &catalog,
        &observations,
        algorithm_version,
    )?;
    let mut tx = pool.begin().await?;
    persist_completed_run_tx(&mut tx, run_id, &result, None).await?;
    tx.commit().await?;
    get_run(pool, run_id)
        .await?
        .ok_or_else(|| anyhow!("completed SENA run disappeared"))
}

pub async fn load_workspace_summary(pool: &PgPool, owner_sub: &str) -> Result<Option<SenaWorkspaceSummary>> {
    let row = sqlx::query(
        "SELECT workspace_summary FROM app.sena_latest_projection WHERE owner_sub = $1",
    )
    .bind(owner_sub)
    .fetch_optional(pool)
    .await?;
    row.map(|row| row.try_get::<sqlx::types::Json<SenaWorkspaceSummary>, _>("workspace_summary"))
        .transpose()
        .map(|value| value.map(|json| json.0))
        .map_err(anyhow::Error::new)
}

pub async fn load_sku_detail(pool: &PgPool, owner_sub: &str, sku_id: &str) -> Result<Option<SenaSkuDetail>> {
    let row = sqlx::query("SELECT sku_details FROM app.sena_latest_projection WHERE owner_sub = $1")
        .bind(owner_sub)
        .fetch_optional(pool)
        .await?;
    let Some(row) = row else {
        return Ok(None);
    };
    let details = row
        .try_get::<sqlx::types::Json<Vec<SenaSkuDetail>>, _>("sku_details")
        .map_err(anyhow::Error::new)?
        .0;
    Ok(details.into_iter().find(|detail| detail.summary.sku_id == sku_id))
}

pub async fn load_service_detail(
    pool: &PgPool,
    owner_sub: &str,
    service_id: &str,
) -> Result<Option<SenaServiceDetail>> {
    let row = sqlx::query("SELECT service_details FROM app.sena_latest_projection WHERE owner_sub = $1")
        .bind(owner_sub)
        .fetch_optional(pool)
        .await?;
    let Some(row) = row else {
        return Ok(None);
    };
    let details = row
        .try_get::<sqlx::types::Json<Vec<SenaServiceDetail>>, _>("service_details")
        .map_err(anyhow::Error::new)?
        .0;
    Ok(details.into_iter().find(|detail| detail.service_id == service_id))
}

pub async fn load_diagnostics(pool: &PgPool, owner_sub: &str) -> Result<Option<SenaDiagnostics>> {
    let row = sqlx::query("SELECT diagnostics FROM app.sena_latest_projection WHERE owner_sub = $1")
        .bind(owner_sub)
        .fetch_optional(pool)
        .await?;
    row.map(|row| row.try_get::<sqlx::types::Json<SenaDiagnostics>, _>("diagnostics"))
        .transpose()
        .map(|value| value.map(|json| json.0))
        .map_err(anyhow::Error::new)
}

pub async fn load_artifact_metadata(pool: &PgPool, artifact_key: &str) -> Result<Option<serde_json::Value>> {
    let row = sqlx::query(
        r#"
        SELECT artifact_key, bucket_name, object_key, object_uri, content_type, content_length, sha256, metadata
        FROM app.object_artifact
        WHERE artifact_key = $1
        "#,
    )
    .bind(artifact_key)
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|row| {
        serde_json::json!({
            "artifactKey": row.get::<String, _>("artifact_key"),
            "bucketName": row.get::<String, _>("bucket_name"),
            "objectKey": row.get::<String, _>("object_key"),
            "objectUri": row.get::<String, _>("object_uri"),
            "contentType": row.get::<String, _>("content_type"),
            "contentLength": row.get::<i64, _>("content_length"),
            "sha256": row.get::<String, _>("sha256"),
            "metadata": row.get::<serde_json::Value, _>("metadata"),
        })
    }))
}

fn run_from_row(row: &PgRow) -> Result<SenaAnalysisRunRecord> {
    Ok(SenaAnalysisRunRecord {
        run_id: row.get::<Uuid, _>("run_id").to_string(),
        owner_sub: row.get("owner_sub"),
        algorithm_version: row.get("algorithm_version"),
        status: match row.get::<String, _>("status").as_str() {
            "running" => SenaRunStatus::Running,
            "succeeded" => SenaRunStatus::Succeeded,
            "failed" => SenaRunStatus::Failed,
            "queued" => SenaRunStatus::Queued,
            other => return Err(anyhow!("unknown sena run status '{other}'")),
        },
        observation_count: row.get::<i64, _>("observation_count") as usize,
        created_at: row.get::<time::OffsetDateTime, _>("created_at").format(&time::format_description::well_known::Rfc3339)?,
        completed_at: row
            .get::<Option<time::OffsetDateTime>, _>("completed_at")
            .map(|value| value.format(&time::format_description::well_known::Rfc3339))
            .transpose()?,
        summary: row
            .get::<Option<sqlx::types::Json<SenaWorkspaceSummary>>, _>("summary")
            .map(|value| value.0),
        diagnostics: row
            .get::<Option<sqlx::types::Json<SenaDiagnostics>>, _>("diagnostics")
            .map(|value| value.0),
        primary_artifact_key: row.get("primary_artifact_key"),
        error: row.get("error"),
    })
}
