use super::repository::{self, BackfillRunRow, NewBackfillRun};
use crate::{
    config::{AppConfig, BackfillConfig, BackfillKind, BackfillMode, BackfillRunStatus},
    events::{consumer, schema, schema_types::InvalidEventPolicy},
    jobs, projections,
};
use anyhow::{anyhow, Result};
use serde_json::json;
use std::env;
use uuid::Uuid;

pub async fn run(pool: &sqlx::PgPool, app_cfg: &AppConfig, cfg: &BackfillConfig) -> Result<()> {
    let run = if let Some(run_id) = cfg.run_id {
        load_existing_run(pool, cfg, run_id).await?
    } else {
        create_new_run(pool, app_cfg, cfg).await?
    };

    if cfg.mode == BackfillMode::Preview {
        tracing::info!(
            run_id = %run.id,
            run_kind = %run.run_kind,
            stream_name = %run.stream_name,
            from_event_id = run.from_event_id,
            resolved_to_event_id = run.resolved_to_event_id,
            candidate_event_count = run.candidate_event_count,
            "backfill preview recorded"
        );
        return Ok(());
    }

    match cfg.kind {
        BackfillKind::Projection => run_projection_backfill(pool, app_cfg, cfg, &run).await,
        BackfillKind::Jobs => run_jobs_backfill(pool, app_cfg, cfg, &run).await,
    }
}

async fn create_new_run(
    pool: &sqlx::PgPool,
    app_cfg: &AppConfig,
    cfg: &BackfillConfig,
) -> Result<BackfillRunRow> {
    let from_event_id = cfg
        .from_event_id
        .ok_or_else(|| anyhow!("BACKFILL_FROM_EVENT_ID is required"))?;
    let resolved_to_event_id = resolve_to_event_id(pool, &cfg.stream_name, cfg.to_event_id).await?;
    let summary = consumer::summarize_stream_range(
        pool,
        &cfg.stream_name,
        inclusive_after_id(from_event_id),
        Some(resolved_to_event_id),
    )
    .await?;
    let checkpoint_start = match cfg.kind {
        BackfillKind::Projection => Some(
            consumer::get_checkpoint(
                pool,
                &cfg.service_name,
                &cfg.consumer_name,
                &cfg.stream_name,
            )
            .await?,
        ),
        BackfillKind::Jobs => None,
    };
    let job_types = match cfg.kind {
        BackfillKind::Projection => Vec::new(),
        BackfillKind::Jobs => {
            jobs::backfill::validate_requested_job_types(&cfg.stream_name, &cfg.job_types)?
        }
    };

    repository::insert_run(
        pool,
        &NewBackfillRun {
            id: cfg.run_id.unwrap_or_else(Uuid::new_v4),
            run_kind: cfg.kind,
            status: BackfillRunStatus::Planned,
            operator_id: cfg
                .operator_id
                .clone()
                .ok_or_else(|| anyhow!("BACKFILL_OPERATOR_ID is required"))?,
            reason: cfg
                .reason
                .clone()
                .ok_or_else(|| anyhow!("BACKFILL_REASON is required"))?,
            stream_name: cfg.stream_name.clone(),
            service_name: match cfg.kind {
                BackfillKind::Projection => cfg.service_name.clone(),
                BackfillKind::Jobs => app_cfg.app_role.as_str().to_string(),
            },
            consumer_name: match cfg.kind {
                BackfillKind::Projection => Some(cfg.consumer_name.clone()),
                BackfillKind::Jobs => None,
            },
            job_types: json!(job_types),
            from_event_id,
            requested_to_event_id: cfg.to_event_id,
            resolved_to_event_id,
            batch_size: cfg.batch_size as i32,
            invalid_event_policy: invalid_policy_name(cfg.invalid_event_policy).to_string(),
            reset_checkpoint: cfg.reset_checkpoint,
            truncate_projection: cfg.truncate_projection,
            checkpoint_start,
            candidate_event_count: summary.candidate_count,
            started_at: None,
        },
    )
    .await
}

async fn load_existing_run(
    pool: &sqlx::PgPool,
    cfg: &BackfillConfig,
    run_id: Uuid,
) -> Result<BackfillRunRow> {
    let run = repository::get_run(pool, run_id)
        .await?
        .ok_or_else(|| anyhow!("backfill run '{run_id}' not found"))?;

    if matches!(
        run.status.as_str(),
        "succeeded" | "completed_with_failures" | "failed" | "cancelled"
    ) {
        return Err(anyhow!(
            "backfill run '{run_id}' is terminal with status '{}'",
            run.status
        ));
    }

    if run.run_kind != cfg.kind.as_str() {
        return Err(anyhow!("BACKFILL_KIND did not match persisted run_kind"));
    }
    if run.stream_name != cfg.stream_name {
        return Err(anyhow!(
            "BACKFILL_STREAM_NAME did not match persisted stream_name"
        ));
    }
    if let Some(from_event_id) = cfg.from_event_id {
        if from_event_id != run.from_event_id {
            return Err(anyhow!(
                "BACKFILL_FROM_EVENT_ID did not match persisted from_event_id"
            ));
        }
    }
    if let Some(to_event_id) = cfg.to_event_id {
        if to_event_id != run.resolved_to_event_id {
            return Err(anyhow!(
                "BACKFILL_TO_EVENT_ID did not match persisted resolved_to_event_id"
            ));
        }
    }
    if cfg.kind == BackfillKind::Projection {
        if run.service_name != cfg.service_name {
            return Err(anyhow!(
                "BACKFILL_SERVICE_NAME did not match persisted service_name"
            ));
        }
        if run.consumer_name.as_deref() != Some(cfg.consumer_name.as_str()) {
            return Err(anyhow!(
                "BACKFILL_CONSUMER_NAME did not match persisted consumer_name"
            ));
        }
    }
    if !cfg.job_types.is_empty() {
        let persisted_job_types = job_types_from_json(&run.job_types)?;
        if persisted_job_types != cfg.job_types {
            return Err(anyhow!(
                "BACKFILL_JOB_TYPES did not match persisted job_types"
            ));
        }
    }
    if env::var_os("BACKFILL_INVALID_EVENT_POLICY").is_some() {
        let persisted_policy = persisted_invalid_event_policy(&run.invalid_event_policy)?;
        if persisted_policy != cfg.invalid_event_policy {
            return Err(anyhow!(
                "BACKFILL_INVALID_EVENT_POLICY did not match persisted invalid_event_policy"
            ));
        }
    }

    Ok(run)
}

async fn run_projection_backfill(
    pool: &sqlx::PgPool,
    app_cfg: &AppConfig,
    _cfg: &BackfillConfig,
    run: &BackfillRunRow,
) -> Result<()> {
    let database_url = app_cfg
        .database_runtime_url
        .as_deref()
        .ok_or_else(|| anyhow!("DATABASE_RUNTIME_URL is required"))?;
    let consumer_name = run
        .consumer_name
        .as_deref()
        .ok_or_else(|| anyhow!("projection backfill run missing consumer_name"))?;

    let lock = consumer::acquire_consumer_lock(
        database_url,
        &run.service_name,
        consumer_name,
        &run.stream_name,
    )
    .await?;

    let result = async {
        if run.status == BackfillRunStatus::Planned.as_str() {
            if run.truncate_projection || run.reset_checkpoint {
                let mut tx = pool.begin().await?;
                if run.truncate_projection {
                    projections::inventory::truncate_inventory_projection_tx(&mut tx).await?;
                }
                if run.reset_checkpoint {
                    consumer::set_checkpoint_tx(
                        &mut tx,
                        &run.service_name,
                        consumer_name,
                        &run.stream_name,
                        reset_checkpoint_value(run.from_event_id),
                    )
                    .await?;
                }
                tx.commit().await?;
            }
            repository::mark_run_running(pool, run.id).await?;
        }

        let mut after_id = if run.last_scanned_event_id > 0 {
            run.last_scanned_event_id
        } else {
            inclusive_after_id(run.from_event_id)
        };
        let invalid_event_policy = persisted_invalid_event_policy(&run.invalid_event_policy)?;

        loop {
            let rows = consumer::poll_stream_in_range(
                pool,
                &run.stream_name,
                after_id,
                Some(run.resolved_to_event_id),
                i64::from(run.batch_size),
            )
            .await?;
            if rows.is_empty() {
                break;
            }

            let mut decoded_events = Vec::new();
            let mut invalid_count = 0i64;
            let mut max_seen_id = after_id;

            for row in rows {
                max_seen_id = max_seen_id.max(row.id);
                match schema::decode_event_row(&row, invalid_event_policy) {
                    Ok(event) => decoded_events.push(consumer::DecodedEvent { row, event }),
                    Err(err) => match err.action {
                        crate::events::schema_types::InvalidEventAction::Halt => {
                            return Err(anyhow!("{} (event_id={})", err, row.id));
                        }
                        crate::events::schema_types::InvalidEventAction::Quarantine => {
                            consumer::quarantine_invalid_event(
                                pool,
                                "backfill-controller",
                                &format!("projection:{}", run.id),
                                &run.stream_name,
                                &row,
                                err.code.as_str(),
                                &err.message,
                            )
                            .await?;
                            invalid_count += 1;
                        }
                        crate::events::schema_types::InvalidEventAction::Skip => {}
                    },
                }
            }

            let mut tx = pool.begin().await?;
            let apply_stats = projections::inventory::apply_inventory_projection_batch_tx(
                &mut tx,
                &decoded_events,
            )
            .await?;
            if max_seen_id > 0 {
                consumer::set_checkpoint_tx(
                    &mut tx,
                    &run.service_name,
                    consumer_name,
                    &run.stream_name,
                    max_seen_id,
                )
                .await?;
                repository::update_progress_tx(
                    &mut tx,
                    run.id,
                    max_seen_id,
                    (decoded_events.len() as i64) + invalid_count,
                    apply_stats.applied_count as i64,
                    0,
                    invalid_count,
                )
                .await?;
            }
            tx.commit().await?;
            after_id = max_seen_id;
        }

        repository::finish_run(pool, run.id, BackfillRunStatus::Succeeded, None).await
    }
    .await;

    lock.release().await?;
    if let Err(err) = &result {
        repository::mark_run_failed(pool, run.id, &err.to_string()).await?;
    }
    result
}

async fn run_jobs_backfill(
    pool: &sqlx::PgPool,
    app_cfg: &AppConfig,
    cfg: &BackfillConfig,
    run: &BackfillRunRow,
) -> Result<()> {
    let scheduling_result = async {
        if run.status == BackfillRunStatus::Planned.as_str() {
            repository::mark_run_running(pool, run.id).await?;
        }

        let selected_job_types = job_types_from_json(&run.job_types)?;
        let invalid_event_policy = persisted_invalid_event_policy(&run.invalid_event_policy)?;

        if run.status != BackfillRunStatus::Waiting.as_str() {
            let mut after_id = if run.last_scanned_event_id > 0 {
                run.last_scanned_event_id
            } else {
                inclusive_after_id(run.from_event_id)
            };

            loop {
                let rows = consumer::poll_stream_in_range(
                    pool,
                    &run.stream_name,
                    after_id,
                    Some(run.resolved_to_event_id),
                    i64::from(run.batch_size),
                )
                .await?;
                if rows.is_empty() {
                    break;
                }

                let mut tx = pool.begin().await?;
                let mut invalid_count = 0i64;
                let mut enqueued_count = 0i64;
                let mut processed_count = 0i64;
                let mut max_seen_id = after_id;

                for row in rows {
                    max_seen_id = max_seen_id.max(row.id);
                    processed_count += 1;
                    match schema::decode_event_row(&row, invalid_event_policy) {
                        Ok(event) => {
                            if let Some(job) = jobs::backfill::build_replay_job(
                                run.id,
                                &run.operator_id,
                                &run.reason,
                                &row,
                                &event,
                                app_cfg.rabbit_max_attempts,
                            )? {
                                if selected_job_types
                                    .iter()
                                    .any(|job_type| job_type == &job.job_type)
                                {
                                    jobs::service::schedule_job_tx(&mut tx, &job).await?;
                                    enqueued_count += 1;
                                }
                            }
                        }
                        Err(err) => match err.action {
                            crate::events::schema_types::InvalidEventAction::Halt => {
                                tx.rollback().await?;
                                return Err(anyhow!("{} (event_id={})", err, row.id));
                            }
                            crate::events::schema_types::InvalidEventAction::Quarantine => {
                                consumer::quarantine_invalid_event(
                                    pool,
                                    "backfill-controller",
                                    &format!("jobs:{}", run.id),
                                    &run.stream_name,
                                    &row,
                                    err.code.as_str(),
                                    &err.message,
                                )
                                .await?;
                                invalid_count += 1;
                            }
                            crate::events::schema_types::InvalidEventAction::Skip => {}
                        },
                    }
                }

                repository::update_progress_tx(
                    &mut tx,
                    run.id,
                    max_seen_id,
                    processed_count,
                    0,
                    enqueued_count,
                    invalid_count,
                )
                .await?;
                tx.commit().await?;
                after_id = max_seen_id;
            }

            if cfg.wait_for_workers {
                repository::mark_run_waiting(pool, run.id, None).await?;
            }
        }

        Ok(())
    }
    .await;

    if let Err(err) = scheduling_result {
        repository::mark_run_failed(pool, run.id, &err.to_string()).await?;
        return Err(err);
    }

    if !cfg.wait_for_workers {
        if run.status != BackfillRunStatus::Waiting.as_str() {
            repository::finish_run(pool, run.id, BackfillRunStatus::Succeeded, None).await?;
        } else {
            finalize_jobs_run_if_idle(pool, run.id).await?;
        }
        return Ok(());
    }

    wait_for_workers(pool, cfg, run.id).await
}

async fn finalize_jobs_run_if_idle(pool: &sqlx::PgPool, run_id: Uuid) -> Result<bool> {
    let counts = jobs::repository::backfill_job_counts(pool, run_id).await?;
    repository::update_wait_counts(
        pool,
        run_id,
        counts.succeeded_count,
        counts.failed_count,
        None,
    )
    .await?;

    if counts.nonterminal_count > 0 {
        return Ok(false);
    }

    let status = if counts.failed_count > 0 {
        BackfillRunStatus::CompletedWithFailures
    } else {
        BackfillRunStatus::Succeeded
    };
    repository::finish_run(pool, run_id, status, None).await?;
    Ok(true)
}

async fn wait_for_workers(pool: &sqlx::PgPool, cfg: &BackfillConfig, run_id: Uuid) -> Result<()> {
    let started = std::time::Instant::now();
    loop {
        if finalize_jobs_run_if_idle(pool, run_id).await? {
            return Ok(());
        }

        if started.elapsed() >= cfg.max_wait {
            let counts = jobs::repository::backfill_job_counts(pool, run_id).await?;
            let err = format!(
                "timed out waiting for workers after {} seconds with {} nonterminal jobs",
                cfg.max_wait.as_secs(),
                counts.nonterminal_count
            );
            repository::update_wait_counts(
                pool,
                run_id,
                counts.succeeded_count,
                counts.failed_count,
                Some(&err),
            )
            .await?;
            repository::mark_run_waiting(pool, run_id, Some(&err)).await?;
            return Err(anyhow!(err));
        }

        tokio::time::sleep(cfg.worker_poll_interval).await;
    }
}

async fn resolve_to_event_id(
    pool: &sqlx::PgPool,
    stream_name: &str,
    requested_to_event_id: Option<i64>,
) -> Result<i64> {
    if let Some(to_event_id) = requested_to_event_id {
        return Ok(to_event_id);
    }

    let max_id: i64 =
        sqlx::query_scalar("SELECT COALESCE(MAX(id), 0) FROM app.event_log WHERE stream_name = $1")
            .bind(stream_name)
            .fetch_one(pool)
            .await?;
    Ok(max_id)
}

fn inclusive_after_id(from_event_id: i64) -> i64 {
    if from_event_id <= 0 {
        -1
    } else {
        from_event_id - 1
    }
}

fn reset_checkpoint_value(from_event_id: i64) -> i64 {
    if from_event_id <= 0 {
        0
    } else {
        from_event_id - 1
    }
}

fn invalid_policy_name(policy: InvalidEventPolicy) -> &'static str {
    match policy {
        InvalidEventPolicy::Halt => "halt",
        InvalidEventPolicy::Quarantine => "quarantine",
        InvalidEventPolicy::Skip => "halt",
    }
}

fn persisted_invalid_event_policy(raw: &str) -> Result<InvalidEventPolicy> {
    match raw {
        "halt" => Ok(InvalidEventPolicy::Halt),
        "quarantine" => Ok(InvalidEventPolicy::Quarantine),
        other => Err(anyhow!(
            "persisted invalid_event_policy '{other}' is not supported"
        )),
    }
}

fn job_types_from_json(value: &serde_json::Value) -> Result<Vec<String>> {
    let Some(items) = value.as_array() else {
        return Err(anyhow!("persisted job_types was not an array"));
    };
    Ok(items
        .iter()
        .filter_map(|item| item.as_str().map(|value| value.to_string()))
        .collect())
}
