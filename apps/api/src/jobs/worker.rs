use super::{
    consumer::republish_with_confirm_before_ack,
    handlers,
    publisher::{ConfirmingPublisher, RabbitConfirmingPublisher},
    relay, repository,
    repository::AttemptClaimOutcome,
    result_publisher::{DisabledJobResultPublisher, JobResultPublisher},
    schema::{validate_job_envelope, JobSchemaError},
    types::{ErrorReasonCode, JobEnvelope, WorkloadClass},
};
use crate::{
    config::{AppConfig, WorkerConfig},
    logging::redaction::redact_message,
    observability::metrics,
    storage::{
        key::{derive_artifact_key, object_key_for_job_artifact},
        types::{ArtifactUploadSpec, StoredArtifact},
        ObjectStorageClient, S3ObjectStorageClient,
    },
};
use anyhow::{anyhow, Result};
use base64::Engine;
use futures_util::StreamExt;
use lapin::{
    message::Delivery,
    options::{BasicAckOptions, BasicConsumeOptions, BasicNackOptions, BasicQosOptions},
    types::FieldTable,
    Channel, Connection, ConnectionProperties,
};
use std::{future::Future, sync::Arc, time::Duration};
use time::Duration as TimeDuration;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WorkerDisposition {
    Ack,
    RequeueAfter(Duration),
}

pub async fn run_worker_loop<F>(pool: sqlx::PgPool, cfg: AppConfig, shutdown: F) -> Result<()>
where
    F: Future<Output = ()>,
{
    let worker_cfg = cfg.worker_config()?;
    let rabbit_url = cfg
        .rabbit_url
        .clone()
        .ok_or_else(|| anyhow!("RABBIT_URL is required for APP_ROLE=worker"))?;

    let connection = Connection::connect(&rabbit_url, ConnectionProperties::default()).await?;
    let connection = Arc::new(connection);
    let result_publisher = Arc::new(DisabledJobResultPublisher);
    let storage_client: Arc<dyn ObjectStorageClient> =
        Arc::new(S3ObjectStorageClient::new(worker_cfg.object_storage.clone()).await?);

    let mut tasks = Vec::new();

    for class in &worker_cfg.enabled_classes {
        let relay_pool = pool.clone();
        let relay_cfg = cfg.clone();
        let relay_worker_cfg = worker_cfg.clone();
        let relay_connection = connection.clone();
        let relay_class = class.clone();
        tasks.push(tokio::spawn(async move {
            let publisher = RabbitConfirmingPublisher::from_connection(&relay_connection).await?;
            let mut ticker = tokio::time::interval(relay_worker_cfg.poll_interval);
            loop {
                ticker.tick().await;
                let _ = relay::relay_once(
                    &relay_pool,
                    &relay_cfg,
                    relay_class.clone(),
                    &publisher,
                    relay_worker_cfg.job_relay_batch_size,
                )
                .await?;
            }
            #[allow(unreachable_code)]
            Ok::<(), anyhow::Error>(())
        }));

        let primary_queue = queue_name(&cfg, class, false);
        tasks.push(spawn_consumer_task(
            pool.clone(),
            cfg.clone(),
            worker_cfg.clone(),
            connection.clone(),
            result_publisher.clone(),
            storage_client.clone(),
            primary_queue,
            class.primary_prefetch(&cfg),
        ));

        if worker_cfg.consume_replay_queues {
            let replay_queue = queue_name(&cfg, class, true);
            tasks.push(spawn_consumer_task(
                pool.clone(),
                cfg.clone(),
                worker_cfg.clone(),
                connection.clone(),
                result_publisher.clone(),
                storage_client.clone(),
                replay_queue,
                class.replay_prefetch(&cfg),
            ));
        }
    }

    tokio::pin!(shutdown);
    shutdown.await;
    for task in &tasks {
        task.abort();
    }

    tokio::time::sleep(worker_cfg.shutdown_grace).await;
    Ok(())
}

fn spawn_consumer_task(
    pool: sqlx::PgPool,
    cfg: AppConfig,
    worker_cfg: WorkerConfig,
    connection: Arc<Connection>,
    result_publisher: Arc<dyn JobResultPublisher>,
    storage_client: Arc<dyn ObjectStorageClient>,
    queue_name: String,
    prefetch: u16,
) -> tokio::task::JoinHandle<Result<()>> {
    tokio::spawn(async move {
        let channel = connection.create_channel().await?;
        channel
            .basic_qos(prefetch, BasicQosOptions::default())
            .await?;
        let consumer = channel
            .basic_consume(
                &queue_name,
                &worker_cfg.worker_id,
                BasicConsumeOptions::default(),
                FieldTable::default(),
            )
            .await?;
        let publisher = RabbitConfirmingPublisher::from_connection(&connection).await?;
        consume_loop(
            pool,
            cfg,
            worker_cfg,
            queue_name,
            channel,
            consumer,
            publisher,
            result_publisher,
            storage_client,
        )
        .await
    })
}

async fn consume_loop(
    pool: sqlx::PgPool,
    cfg: AppConfig,
    worker_cfg: WorkerConfig,
    queue_name: String,
    _channel: Channel,
    mut consumer: lapin::Consumer,
    publisher: RabbitConfirmingPublisher,
    result_publisher: Arc<dyn JobResultPublisher>,
    storage_client: Arc<dyn ObjectStorageClient>,
) -> Result<()> {
    while let Some(next) = consumer.next().await {
        let delivery = next?;
        process_delivery(
            &pool,
            &cfg,
            &worker_cfg,
            &publisher,
            result_publisher.as_ref(),
            storage_client.as_ref(),
            &queue_name,
            delivery,
        )
        .await?;
    }
    Ok(())
}

async fn process_delivery(
    pool: &sqlx::PgPool,
    cfg: &AppConfig,
    worker_cfg: &WorkerConfig,
    publisher: &impl ConfirmingPublisher,
    result_publisher: &dyn JobResultPublisher,
    storage_client: &dyn ObjectStorageClient,
    queue_name: &str,
    delivery: Delivery,
) -> Result<()> {
    let raw_json: serde_json::Value = match serde_json::from_slice(&delivery.data) {
        Ok(value) => value,
        Err(err) => {
            let invalid_envelope =
                invalid_delivery_envelope(queue_name, &delivery.data, None, None, None, None, None);
            record_raw_invalid_delivery(
                pool,
                &worker_cfg.worker_id,
                &delivery.data,
                None,
                None,
                1,
                "invalid_envelope",
                &sanitize_error_message(&format!("invalid envelope json: {err}")),
            )
            .await?;
            let dlq_message = format!("validation schema invalid: invalid envelope json: {err}");
            republish_with_confirm_before_ack(
                publisher,
                cfg,
                &cfg.rabbit_dlx_exchange,
                invalid_envelope,
                &dlq_message,
            )
            .await?;
            delivery.ack(BasicAckOptions::default()).await?;
            return Ok(());
        }
    };

    let envelope: JobEnvelope = match serde_json::from_value(raw_json.clone()) {
        Ok(value) => value,
        Err(err) => {
            let job_key = raw_json
                .get("message_id")
                .and_then(|value| value.as_str())
                .unwrap_or("invalid-message")
                .to_string();
            let attempt = raw_json
                .get("attempt")
                .and_then(|value| value.as_u64())
                .unwrap_or(1) as u8;
            let correlation_id = raw_json
                .get("correlation_id")
                .and_then(|value| value.as_str());
            let job_type = raw_json.get("job_type").and_then(|value| value.as_str());
            let invalid_envelope = invalid_delivery_envelope(
                queue_name,
                &delivery.data,
                Some(&raw_json),
                Some(&job_key),
                correlation_id,
                job_type,
                raw_json.get("attempt").and_then(|value| value.as_u64()),
            );
            record_raw_invalid_delivery(
                pool,
                &worker_cfg.worker_id,
                &delivery.data,
                correlation_id,
                job_type,
                attempt,
                "invalid_envelope",
                &sanitize_error_message(&format!("invalid envelope shape: {err}")),
            )
            .await?;
            let dlq_message = format!("validation schema invalid: invalid envelope shape: {err}");
            republish_with_confirm_before_ack(
                publisher,
                cfg,
                &cfg.rabbit_dlx_exchange,
                invalid_envelope,
                &dlq_message,
            )
            .await?;
            delivery.ack(BasicAckOptions::default()).await?;
            return Ok(());
        }
    };

    let disposition = process_job_envelope(
        pool,
        cfg,
        worker_cfg,
        publisher,
        result_publisher,
        storage_client,
        &envelope,
    )
    .await?;

    match disposition {
        WorkerDisposition::Ack => {
            delivery.ack(BasicAckOptions::default()).await?;
        }
        WorkerDisposition::RequeueAfter(delay) => {
            tokio::time::sleep(delay).await;
            delivery
                .nack(BasicNackOptions {
                    multiple: false,
                    requeue: true,
                })
                .await?;
        }
    }

    let _ = queue_name;
    Ok(())
}

pub async fn process_job_envelope(
    pool: &sqlx::PgPool,
    cfg: &AppConfig,
    worker_cfg: &WorkerConfig,
    publisher: &impl ConfirmingPublisher,
    result_publisher: &dyn JobResultPublisher,
    storage_client: &dyn ObjectStorageClient,
    envelope: &JobEnvelope,
) -> Result<WorkerDisposition> {
    let started = std::time::Instant::now();
    let known_job = match validate_job_envelope(envelope) {
        Ok(job) => job,
        Err(err) => {
            handle_invalid_envelope(pool, worker_cfg, publisher, cfg, envelope, &err).await?;
            return Ok(WorkerDisposition::Ack);
        }
    };

    let mut tx = pool.begin().await?;
    let Some(job_run) =
        repository::get_job_run_for_update_tx(&mut tx, &envelope.message_id).await?
    else {
        repository::record_delivery_violation_tx(
            &mut tx,
            &worker_cfg.worker_id,
            envelope,
            ErrorReasonCode::MissingJobRun.as_str(),
            "missing job run for delivered envelope",
        )
        .await?;
        tx.commit().await?;
        let _ = republish_with_confirm_before_ack(
            publisher,
            cfg,
            &cfg.rabbit_dlx_exchange,
            envelope.clone(),
            "missing job run",
        )
        .await?;
        metrics::record_job_run_duration(
            envelope.workload_class.as_str(),
            &envelope.job_type,
            "failed",
            started.elapsed().as_secs_f64(),
        );
        return Ok(WorkerDisposition::Ack);
    };

    if job_run.status == "succeeded" {
        metrics::record_job_run_duration(
            envelope.workload_class.as_str(),
            &envelope.job_type,
            "duplicate_skipped",
            started.elapsed().as_secs_f64(),
        );
        tx.commit().await?;
        return Ok(WorkerDisposition::Ack);
    }

    if i32::from(envelope.attempt) > job_run.max_attempts {
        repository::record_delivery_violation_tx(
            &mut tx,
            &worker_cfg.worker_id,
            envelope,
            ErrorReasonCode::UnknownPermanent.as_str(),
            "delivery attempt exceeds configured max_attempts",
        )
        .await?;
        sqlx::query(
            r#"
            UPDATE app.job_run
            SET
              status = 'failed',
              current_attempt = $2,
              last_error_class = 'permanent',
              last_error_reason = $3,
              last_error = $4,
              finished_at = NOW(),
              updated_at = NOW()
            WHERE id = $1
            "#,
        )
        .bind(job_run.id)
        .bind(i32::from(envelope.attempt))
        .bind(ErrorReasonCode::UnknownPermanent.as_str())
        .bind("delivery attempt exceeds configured max_attempts")
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        let _ = republish_with_confirm_before_ack(
            publisher,
            cfg,
            &cfg.rabbit_dlx_exchange,
            envelope.clone(),
            "unknown permanent: delivery attempt exceeds configured max_attempts",
        )
        .await?;
        return Ok(WorkerDisposition::Ack);
    }

    let claim_outcome = repository::claim_attempt_tx(
        &mut tx,
        job_run.id,
        envelope.attempt,
        &worker_cfg.worker_id,
        worker_cfg.attempt_lease,
    )
    .await?;

    match claim_outcome {
        AttemptClaimOutcome::DuplicateInProgress(wait) => {
            tx.commit().await?;
            metrics::record_job_duplicate_detected(&envelope.job_type, "in_progress");
            return Ok(WorkerDisposition::RequeueAfter(duplicate_requeue_delay(
                wait,
                worker_cfg.poll_interval,
            )));
        }
        AttemptClaimOutcome::TerminalExisting => {
            tx.commit().await?;
            metrics::record_job_duplicate_detected(&envelope.job_type, "terminal_existing");
            return Ok(WorkerDisposition::Ack);
        }
        AttemptClaimOutcome::LeaseStolen => {
            metrics::record_job_lease_steal(&envelope.job_type);
        }
        AttemptClaimOutcome::Claimed | AttemptClaimOutcome::Resumed => {}
    }

    repository::mark_run_started_tx(&mut tx, job_run.id, envelope.attempt).await?;
    tx.commit().await?;

    let heartbeat_stop = Arc::new(tokio::sync::Notify::new());
    let heartbeat_stop_task = heartbeat_stop.clone();
    let heartbeat_pool = pool.clone();
    let worker_id = worker_cfg.worker_id.clone();
    let attempt = envelope.attempt;
    let job_run_id = job_run.id;
    let heartbeat_interval = worker_cfg.attempt_heartbeat;
    let heartbeat_lease = worker_cfg.attempt_lease;
    let heartbeat_task = tokio::spawn(async move {
        let mut ticker = tokio::time::interval(heartbeat_interval);
        loop {
            tokio::select! {
                _ = heartbeat_stop_task.notified() => break,
                _ = ticker.tick() => {
                    let _ = repository::heartbeat_attempt(
                        &heartbeat_pool,
                        job_run_id,
                        attempt,
                        &worker_id,
                        heartbeat_lease,
                    ).await;
                }
            }
        }
    });

    let execution_ctx = handlers::JobExecutionContext {
        job_key: job_run.job_key.clone(),
        job_created_at: job_run.created_at,
        artifact_tmp_dir: worker_cfg.object_storage.tmp_dir.clone(),
        producer_service: cfg.service.clone(),
        producer_role: cfg.app_role.as_str().to_string(),
    };
    let handler_future = handlers::handle_job(pool, &execution_ctx, &known_job);
    let handler_result = match worker_cfg.handler_max_runtime {
        Some(limit) => tokio::time::timeout(limit, handler_future)
            .await
            .map_err(|_| anyhow!("timeout: job handler exceeded configured max runtime"))?,
        None => handler_future.await,
    };

    heartbeat_stop.notify_waiters();
    let _ = heartbeat_task.await;

    match handler_result {
        Ok(output) => {
            handlers::validate_handler_result(&output).map_err(anyhow::Error::new)?;
            let finalize_result = finalize_execution(
                pool,
                cfg,
                worker_cfg,
                result_publisher,
                storage_client,
                &job_run,
                envelope,
                &output,
            )
            .await;
            handlers::cleanup_execution_paths(&output.cleanup_paths);
            metrics::record_object_storage_temp_cleanup(
                &envelope.job_type,
                if output.cleanup_paths.is_empty() {
                    "none"
                } else {
                    "success"
                },
            );

            match finalize_result {
                Ok(publish_status) => {
                    metrics::record_job_run_total(
                        envelope.workload_class.as_str(),
                        &envelope.job_type,
                        "success",
                    );
                    metrics::record_job_result_write(&envelope.job_type, publish_status.as_str());
                    metrics::record_job_run_duration(
                        envelope.workload_class.as_str(),
                        &envelope.job_type,
                        "success",
                        started.elapsed().as_secs_f64(),
                    );
                    Ok(WorkerDisposition::Ack)
                }
                Err(err) => {
                    handle_job_failure(
                        pool, cfg, worker_cfg, publisher, &job_run, envelope, started, err,
                    )
                    .await
                }
            }
        }
        Err(err) => {
            handle_job_failure(
                pool, cfg, worker_cfg, publisher, &job_run, envelope, started, err,
            )
            .await
        }
    }
}

async fn finalize_execution(
    pool: &sqlx::PgPool,
    cfg: &AppConfig,
    worker_cfg: &WorkerConfig,
    result_publisher: &dyn JobResultPublisher,
    storage_client: &dyn ObjectStorageClient,
    job_run: &repository::JobRunRow,
    envelope: &JobEnvelope,
    output: &super::schema_types::JobExecutionOutput,
) -> Result<super::result_publisher::JobResultPublishStatus> {
    let publish_status = result_publisher.publish_status_for(&output.result)?;
    let stored_artifacts = upload_artifacts(
        storage_client,
        &worker_cfg.object_storage,
        cfg,
        job_run,
        &output.artifacts,
    )
    .await?;

    let mut tx = pool.begin().await?;
    let result_id = repository::upsert_job_result_tx(
        &mut tx,
        job_run.id,
        &output.result,
        publish_status.as_str(),
    )
    .await?;

    for (index, artifact) in stored_artifacts.iter().enumerate() {
        let artifact_id = repository::upsert_object_artifact_tx(&mut tx, artifact).await?;
        repository::link_job_result_artifact_tx(
            &mut tx,
            result_id,
            artifact_id,
            &artifact.artifact_role,
            index == 0,
        )
        .await?;
    }

    repository::mark_attempt_succeeded_tx(
        &mut tx,
        job_run.id,
        envelope.attempt,
        &worker_cfg.worker_id,
        result_id,
    )
    .await?;
    tx.commit().await?;
    Ok(publish_status)
}

async fn upload_artifacts(
    storage_client: &dyn ObjectStorageClient,
    storage_cfg: &crate::config::ObjectStorageConfig,
    cfg: &AppConfig,
    job_run: &repository::JobRunRow,
    artifacts: &[crate::jobs::schema_types::JobArtifactOutput],
) -> Result<Vec<StoredArtifact>> {
    let mut stored = Vec::with_capacity(artifacts.len());

    for artifact in artifacts {
        let started = std::time::Instant::now();
        let expected_artifact_key =
            derive_artifact_key(&crate::storage::types::ArtifactIdentity {
                producer_service: cfg.service.clone(),
                producer_role: cfg.app_role.as_str().to_string(),
                job_type: job_run.job_type.clone(),
                job_key: job_run.job_key.clone(),
                artifact_role: artifact.artifact_role.clone(),
                artifact_version: artifact.artifact_version,
            })?;
        if expected_artifact_key != artifact.artifact_key {
            metrics::record_object_storage_error(
                &job_run.job_type,
                &artifact.artifact_role,
                "artifact_key_mismatch",
            );
            return Err(anyhow!(
                "non-retryable artifact contract violation: handler artifact_key does not match canonical artifact identity"
            ));
        }
        let object_key = object_key_for_job_artifact(
            &storage_cfg.artifact_prefix,
            job_run.created_at,
            &job_run.job_type,
            &job_run.job_key,
            &artifact.artifact_role,
            artifact.artifact_version,
            &artifact.file_extension,
        );
        let spec = ArtifactUploadSpec {
            artifact_key: artifact.artifact_key.clone(),
            bucket_name: storage_cfg.bucket_artifacts.clone(),
            object_key: object_key.clone(),
            content_type: artifact.content_type.clone(),
            artifact_role: artifact.artifact_role.clone(),
            artifact_version: artifact.artifact_version,
            producer_service: cfg.service.clone(),
            producer_role: cfg.app_role.as_str().to_string(),
            job_key: Some(job_run.job_key.clone()),
            job_type: Some(job_run.job_type.clone()),
            local_path: artifact.local_path.clone(),
            retention_until: None,
            metadata: artifact.metadata.clone(),
        };

        let mut uploaded = match storage_client.put_file_and_verify(&spec).await {
            Ok(uploaded) => uploaded,
            Err(err) => {
                metrics::record_object_storage_error(
                    &job_run.job_type,
                    &artifact.artifact_role,
                    "upload_failed",
                );
                return Err(err);
            }
        };
        uploaded.retention_until = Some(
            uploaded.uploaded_at
                + TimeDuration::days(i64::from(storage_cfg.artifact_retention_days)),
        );
        let storage_result = if uploaded.reused_existing {
            "existing_match"
        } else {
            "uploaded"
        };

        metrics::record_object_storage_upload_total(
            &job_run.job_type,
            &artifact.artifact_role,
            storage_result,
        );
        metrics::record_object_storage_upload_duration(
            &job_run.job_type,
            &artifact.artifact_role,
            storage_result,
            started.elapsed().as_secs_f64(),
        );
        metrics::record_object_storage_upload_bytes(
            &job_run.job_type,
            &artifact.artifact_role,
            artifact.content_length,
        );
        metrics::record_object_storage_verify(
            &job_run.job_type,
            &artifact.artifact_role,
            "success",
        );
        stored.push(uploaded);
    }

    Ok(stored)
}

async fn handle_job_failure(
    pool: &sqlx::PgPool,
    cfg: &AppConfig,
    worker_cfg: &WorkerConfig,
    publisher: &impl ConfirmingPublisher,
    job_run: &repository::JobRunRow,
    envelope: &JobEnvelope,
    started: std::time::Instant,
    err: anyhow::Error,
) -> Result<WorkerDisposition> {
    let error_message = sanitize_error_message(&err.to_string());
    let classification = super::retry::classify_error(&error_message);
    let decision = super::retry::next_destination(
        cfg,
        &envelope.workload_class,
        envelope.attempt,
        classification.class,
    );
    let mut tx = pool.begin().await?;
    repository::mark_attempt_failed_tx(
        &mut tx,
        job_run.id,
        envelope.attempt,
        &worker_cfg.worker_id,
        classification.class,
        classification.reason,
        &error_message,
        decision.estimated_delay_ms.map(Duration::from_millis),
        !decision.dead_letter,
    )
    .await?;
    tx.commit().await?;
    let result = republish_with_confirm_before_ack(
        publisher,
        cfg,
        &cfg.rabbit_dlx_exchange,
        envelope.clone(),
        &error_message,
    )
    .await?;
    let outcome = if result.dead_lettered {
        "failed"
    } else {
        "retry"
    };
    metrics::record_job_run_total(
        envelope.workload_class.as_str(),
        &envelope.job_type,
        outcome,
    );
    metrics::record_job_last_error(&envelope.job_type, classification.reason.as_str());
    metrics::record_job_run_duration(
        envelope.workload_class.as_str(),
        &envelope.job_type,
        outcome,
        started.elapsed().as_secs_f64(),
    );
    Ok(WorkerDisposition::Ack)
}

async fn handle_invalid_envelope(
    pool: &sqlx::PgPool,
    worker_cfg: &WorkerConfig,
    publisher: &impl ConfirmingPublisher,
    cfg: &AppConfig,
    envelope: &JobEnvelope,
    err: &JobSchemaError,
) -> Result<()> {
    let mut tx = pool.begin().await?;
    repository::record_delivery_violation_tx(
        &mut tx,
        &worker_cfg.worker_id,
        envelope,
        ErrorReasonCode::SchemaInvalid.as_str(),
        &sanitize_error_message(&err.to_string()),
    )
    .await?;
    tx.commit().await?;
    let _ = republish_with_confirm_before_ack(
        publisher,
        cfg,
        &cfg.rabbit_dlx_exchange,
        envelope.clone(),
        &format!("validation schema invalid: {}", err),
    )
    .await?;
    Ok(())
}

async fn record_raw_invalid_delivery(
    pool: &sqlx::PgPool,
    worker_id: &str,
    body: &[u8],
    correlation_id: Option<&str>,
    job_type: Option<&str>,
    attempt: u8,
    error_reason: &str,
    error_message: &str,
) -> Result<()> {
    let job_key = format!("invalid:{}", {
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(body);
        format!("{:x}", hasher.finalize())
    });
    let raw_value = serde_json::json!({
        "raw_body_base64": base64::engine::general_purpose::STANDARD.encode(body)
    });
    let mut tx = pool.begin().await?;
    repository::record_raw_delivery_violation_tx(
        &mut tx,
        worker_id,
        &job_key,
        attempt,
        correlation_id,
        job_type,
        error_reason,
        error_message,
        &raw_value,
    )
    .await?;
    tx.commit().await?;
    Ok(())
}

fn queue_name(cfg: &AppConfig, workload_class: &WorkloadClass, replay: bool) -> String {
    let suffix = if replay { ".replay" } else { "" };
    format!(
        "{}.{}.{}-jobs{}",
        cfg.system,
        cfg.env,
        workload_class.as_str(),
        suffix
    )
}

fn sanitize_error_message(message: &str) -> String {
    let redacted = redact_message(message);
    if redacted.len() > 512 {
        redacted[..512].to_string()
    } else {
        redacted
    }
}

fn invalid_delivery_envelope(
    queue_name: &str,
    body: &[u8],
    raw_json: Option<&serde_json::Value>,
    job_key: Option<&str>,
    correlation_id: Option<&str>,
    job_type: Option<&str>,
    attempt: Option<u64>,
) -> JobEnvelope {
    let synthetic_key = invalid_delivery_key(body);
    let message_id = job_key
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(&synthetic_key)
        .to_string();
    let correlation_id = correlation_id
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(&message_id)
        .to_string();
    let payload = raw_json.cloned().unwrap_or_else(|| {
        serde_json::json!({
            "raw_body_base64": base64::engine::general_purpose::STANDARD.encode(body)
        })
    });

    JobEnvelope {
        message_id: message_id.clone(),
        correlation_id,
        attempt: attempt.unwrap_or(1).min(u64::from(u8::MAX)) as u8,
        job_type: job_type.unwrap_or("invalid-envelope").to_string(),
        payload_version: 1,
        producer_service: "invalid-envelope".to_string(),
        aggregate_type: "invalid-envelope".to_string(),
        aggregate_id: message_id.clone(),
        causation_id: message_id,
        workload_class: workload_class_from_queue_name(queue_name),
        payload,
    }
}

fn invalid_delivery_key(body: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(body);
    format!("invalid:{}", format!("{:x}", hasher.finalize()))
}

fn workload_class_from_queue_name(queue_name: &str) -> WorkloadClass {
    if queue_name.contains("heavy-jobs") {
        WorkloadClass::Heavy
    } else {
        WorkloadClass::Fast
    }
}

fn duplicate_requeue_delay(lease_wait: Duration, poll_interval: Duration) -> Duration {
    let floor = poll_interval.max(Duration::from_millis(250));
    let capped_wait = lease_wait.min(Duration::from_secs(5));
    capped_wait.max(floor)
}

#[cfg(test)]
mod tests {
    use super::{
        duplicate_requeue_delay, invalid_delivery_envelope, workload_class_from_queue_name,
    };
    use crate::jobs::types::WorkloadClass;
    use std::time::Duration;

    #[test]
    fn duplicate_requeue_delay_is_bounded() {
        assert_eq!(
            duplicate_requeue_delay(Duration::from_millis(50), Duration::from_millis(250)),
            Duration::from_millis(250)
        );
        assert_eq!(
            duplicate_requeue_delay(Duration::from_secs(30), Duration::from_millis(250)),
            Duration::from_secs(5)
        );
    }

    #[test]
    fn invalid_delivery_envelope_uses_queue_workload_class() {
        let envelope = invalid_delivery_envelope(
            "banji-core.dev.heavy-jobs",
            br#"not-json"#,
            None,
            None,
            None,
            None,
            None,
        );
        assert_eq!(envelope.workload_class, WorkloadClass::Heavy);
        assert_eq!(
            workload_class_from_queue_name("banji-core.dev.fast-jobs"),
            WorkloadClass::Fast
        );
    }
}
