use banji_api::config::{ProjectionConsumerConfig, ProjectionConsumerRunMode};
use std::net::SocketAddr;
use tracing_opentelemetry::OpenTelemetrySpanExt;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let telemetry = banji_api::observability::otel::init()?;

    if let Err(err) = run().await {
        let safe_error = banji_api::logging::redaction::redact_message(&format!("{:#}", err));
        tracing::error!(error = %safe_error, "banji-api startup failed");
        telemetry.shutdown();
        return Err(anyhow::anyhow!(safe_error));
    }

    telemetry.shutdown();
    Ok(())
}

async fn run() -> anyhow::Result<()> {
    let config = banji_api::config::AppConfig::from_env()?;
    match config.app_role {
        banji_api::config::AppRole::Api => run_api(config).await,
        banji_api::config::AppRole::EventRelay => run_event_relay(config).await,
        banji_api::config::AppRole::ProjectionConsumer => run_projection_consumer(config).await,
        banji_api::config::AppRole::Worker => run_worker(config).await,
    }
}

async fn run_api(config: banji_api::config::AppConfig) -> anyhow::Result<()> {
    let state = banji_api::build_state(config).await?;
    let pool_for_shutdown = state.db.clone();

    if let Some(pool) = state.db.as_ref() {
        banji_api::db::pool::warmup_runtime_pool(pool).await?;
    }

    let addr = std::env::var("API_BIND_ADDR")
        .ok()
        .and_then(|s| s.parse::<SocketAddr>().ok())
        .unwrap_or_else(|| SocketAddr::from(([0, 0, 0, 0], 8080)));

    tracing::info!(%addr, "starting banji-api");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    let app = banji_api::app_with_state(state);
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown_signal())
    .await?;

    if let Some(pool) = pool_for_shutdown {
        pool.close().await;
    }

    Ok(())
}

async fn run_event_relay(config: banji_api::config::AppConfig) -> anyhow::Result<()> {
    let pool = banji_api::db::pool::build_runtime_pool(&config)
        .await?
        .ok_or_else(|| {
            anyhow::anyhow!("DATABASE_RUNTIME_URL is required for APP_ROLE=event-relay")
        })?;

    banji_api::db::pool::warmup_runtime_pool(&pool).await?;

    tracing::info!(
        role = %config.app_role.as_str(),
        batch_size = config.event_relay_batch_size,
        poll_interval_ms = config.event_relay_poll_interval.as_millis(),
        "starting event relay loop"
    );

    banji_api::events::relay::run_relay_loop(pool.clone(), config, shutdown_signal()).await?;
    pool.close().await;
    Ok(())
}

async fn run_projection_consumer(config: banji_api::config::AppConfig) -> anyhow::Result<()> {
    let pool = banji_api::db::pool::build_runtime_pool(&config)
        .await?
        .ok_or_else(|| {
            anyhow::anyhow!("DATABASE_RUNTIME_URL is required for APP_ROLE=projection-consumer")
        })?;

    banji_api::db::pool::warmup_runtime_pool(&pool).await?;
    let projection_cfg = config.projection_consumer_config()?;
    let database_url = config.database_runtime_url.clone().ok_or_else(|| {
        anyhow::anyhow!("DATABASE_RUNTIME_URL is required for APP_ROLE=projection-consumer")
    })?;
    let lock = banji_api::events::consumer::acquire_consumer_lock(
        &database_url,
        &projection_cfg.service_name,
        &projection_cfg.consumer_name,
        &projection_cfg.stream_name,
    )
    .await?;
    tracing::info!(
        service_name = %projection_cfg.service_name,
        consumer_name = %projection_cfg.consumer_name,
        stream_name = %projection_cfg.stream_name,
        "projection consumer advisory lock acquired"
    );

    tracing::info!(
        role = %config.app_role.as_str(),
        service_name = %projection_cfg.service_name,
        consumer_name = %projection_cfg.consumer_name,
        stream_name = %projection_cfg.stream_name,
        batch_size = projection_cfg.batch_size,
        poll_interval_ms = projection_cfg.poll_interval.as_millis(),
        invalid_policy = ?projection_cfg.invalid_policy,
        run_mode = %projection_cfg.run_mode.as_str(),
        "starting projection consumer"
    );

    let result = match projection_cfg.run_mode {
        ProjectionConsumerRunMode::Continuous => {
            run_inventory_projection_loop(&pool, &projection_cfg, shutdown_signal()).await
        }
        ProjectionConsumerRunMode::ReplayPreview => {
            run_inventory_projection_preview(&pool, &projection_cfg).await
        }
        ProjectionConsumerRunMode::ReplayApply => {
            run_inventory_projection_replay(&pool, &projection_cfg).await
        }
    };

    lock.release().await?;
    pool.close().await;
    result
}

async fn run_worker(config: banji_api::config::AppConfig) -> anyhow::Result<()> {
    let pool = banji_api::db::pool::build_runtime_pool(&config)
        .await?
        .ok_or_else(|| anyhow::anyhow!("DATABASE_RUNTIME_URL is required for APP_ROLE=worker"))?;

    banji_api::db::pool::warmup_runtime_pool(&pool).await?;
    let worker_cfg = config.worker_config()?;
    tracing::info!(
        role = %config.app_role.as_str(),
        worker_id = %worker_cfg.worker_id,
        enabled_classes = ?worker_cfg.enabled_classes.iter().map(|class| class.as_str()).collect::<Vec<_>>(),
        poll_interval_ms = worker_cfg.poll_interval.as_millis(),
        consume_replay_queues = worker_cfg.consume_replay_queues,
        "starting worker runtime"
    );

    let result =
        banji_api::jobs::worker::run_worker_loop(pool.clone(), config, shutdown_signal()).await;
    pool.close().await;
    result
}

#[derive(Debug, Default, Clone, Copy)]
struct ProjectionIteration {
    advanced_to: Option<i64>,
    applied_count: usize,
    invalid_count: usize,
}

async fn run_inventory_projection_loop<F>(
    pool: &sqlx::PgPool,
    cfg: &ProjectionConsumerConfig,
    shutdown: F,
) -> anyhow::Result<()>
where
    F: std::future::Future<Output = ()>,
{
    let mut ticker = tokio::time::interval(cfg.poll_interval);
    tokio::pin!(shutdown);

    loop {
        tokio::select! {
            _ = &mut shutdown => break,
            _ = ticker.tick() => {
                banji_api::events::consumer::heartbeat(
                    pool,
                    &cfg.service_name,
                    &cfg.consumer_name,
                    &cfg.stream_name,
                ).await?;
                let checkpoint = banji_api::events::consumer::get_checkpoint(
                    pool,
                    &cfg.service_name,
                    &cfg.consumer_name,
                    &cfg.stream_name,
                ).await?;
                let iteration = apply_inventory_projection_iteration(
                    pool,
                    cfg,
                    checkpoint,
                    None,
                ).await?;
                let lag_checkpoint = iteration.advanced_to.unwrap_or(checkpoint);
                let _ = banji_api::events::consumer::compute_stream_lag(
                    pool,
                    &cfg.stream_name,
                    lag_checkpoint,
                ).await;
            }
        }
    }

    Ok(())
}

async fn run_inventory_projection_preview(
    pool: &sqlx::PgPool,
    cfg: &ProjectionConsumerConfig,
) -> anyhow::Result<()> {
    let checkpoint = banji_api::events::consumer::get_checkpoint(
        pool,
        &cfg.service_name,
        &cfg.consumer_name,
        &cfg.stream_name,
    )
    .await?;
    let after_id = replay_after_id(checkpoint, cfg);
    let summary = banji_api::events::consumer::summarize_stream_range(
        pool,
        &cfg.stream_name,
        after_id,
        cfg.replay_to_id,
    )
    .await?;

    tracing::info!(
        service_name = %cfg.service_name,
        consumer_name = %cfg.consumer_name,
        stream_name = %cfg.stream_name,
        current_checkpoint = checkpoint,
        preview_after_id = after_id,
        replay_from_id = cfg.replay_from_id,
        replay_to_id = cfg.replay_to_id,
        candidate_count = summary.candidate_count,
        max_event_id = summary.max_event_id,
        truncate_projection = cfg.replay_truncate_projection,
        reset_checkpoint = cfg.replay_reset_checkpoint,
        "projection replay preview"
    );

    Ok(())
}

async fn run_inventory_projection_replay(
    pool: &sqlx::PgPool,
    cfg: &ProjectionConsumerConfig,
) -> anyhow::Result<()> {
    let checkpoint = banji_api::events::consumer::get_checkpoint(
        pool,
        &cfg.service_name,
        &cfg.consumer_name,
        &cfg.stream_name,
    )
    .await?;
    let mut after_id = replay_after_id(checkpoint, cfg);

    if cfg.replay_truncate_projection || cfg.replay_reset_checkpoint {
        let mut tx = pool.begin().await?;
        if cfg.replay_truncate_projection {
            banji_api::projections::inventory::truncate_inventory_projection_tx(&mut tx).await?;
        }
        if cfg.replay_reset_checkpoint {
            banji_api::events::consumer::set_checkpoint_tx(
                &mut tx,
                &cfg.service_name,
                &cfg.consumer_name,
                &cfg.stream_name,
                reset_checkpoint_value(cfg.replay_from_id),
            )
            .await?;
        }
        tx.commit().await?;
        if cfg.replay_reset_checkpoint {
            after_id = inclusive_replay_after_id(cfg.replay_from_id);
        }
    }

    loop {
        let iteration =
            apply_inventory_projection_iteration(pool, cfg, after_id, cfg.replay_to_id).await?;
        let Some(next_after_id) = iteration.advanced_to else {
            break;
        };
        tracing::info!(
            stream_name = %cfg.stream_name,
            advanced_to = next_after_id,
            applied_count = iteration.applied_count,
            invalid_count = iteration.invalid_count,
            "projection replay batch applied"
        );
        after_id = next_after_id;
        if let Some(to_id) = cfg.replay_to_id {
            if after_id >= to_id {
                break;
            }
        }
    }

    Ok(())
}

async fn apply_inventory_projection_iteration(
    pool: &sqlx::PgPool,
    cfg: &ProjectionConsumerConfig,
    after_id: i64,
    to_id: Option<i64>,
) -> anyhow::Result<ProjectionIteration> {
    let batch = banji_api::events::consumer::poll_and_decode_stream_in_range(
        pool,
        &cfg.service_name,
        &cfg.consumer_name,
        &cfg.stream_name,
        after_id,
        to_id,
        cfg.batch_size,
        cfg.invalid_policy,
    )
    .await?;

    if batch.events.is_empty() && batch.invalid_event_ids.is_empty() {
        return Ok(ProjectionIteration::default());
    }

    let batch_span = tracing::info_span!(
        "projection.batch",
        consumer_name = %cfg.consumer_name,
        service_name = %cfg.service_name,
        stream_name = %cfg.stream_name,
        candidate_count = batch.events.len() + batch.invalid_event_ids.len(),
        after_id,
        to_id = ?to_id,
    );

    let mut tx = pool.begin().await?;
    let apply_stats = {
        let _batch_entered = batch_span.enter();
        let mut stats = banji_api::projections::inventory::ProjectionBatchStats::default();

        for decoded in &batch.events {
            let parent = banji_api::observability::propagation::extract_context_from_metadata(
                &decoded.row.metadata,
            );
            let correlation_id = decoded.row.correlation_id.as_deref().unwrap_or("unknown");
            let event_span = tracing::info_span!(
                "projection.apply",
                correlation_id = %correlation_id,
                event_id = decoded.row.id,
                event_type = %decoded.row.event_type,
                stream_name = %decoded.row.stream_name,
                producer_service = %decoded.row.producer_service,
            );
            event_span.set_parent(parent);

            let _event_entered = event_span.enter();
            match &decoded.event {
                banji_api::events::schema_types::KnownEvent::InventoryItemCreatedV1(payload) => {
                    banji_api::projections::inventory::apply_inventory_item_created_tx(
                        &mut tx,
                        decoded.row.id,
                        payload,
                    )
                    .await?;
                    stats.applied_count += 1;
                    stats.last_applied_event_id = Some(decoded.row.id);
                }
                other => {
                    let err = anyhow::anyhow!(
                        "inventory projector received unsupported event on configured stream: {:?}",
                        other
                    );
                    tx.rollback().await?;
                    banji_api::events::consumer::set_error(
                        pool,
                        &cfg.service_name,
                        &cfg.consumer_name,
                        &cfg.stream_name,
                        &err.to_string(),
                    )
                    .await?;
                    return Err(err);
                }
            }
        }

        stats
    };

    let checkpoint_target = apply_stats
        .last_applied_event_id
        .into_iter()
        .chain(batch.invalid_event_ids.iter().copied())
        .max();

    if let Some(last_event_id) = checkpoint_target {
        banji_api::events::consumer::set_checkpoint_tx(
            &mut tx,
            &cfg.service_name,
            &cfg.consumer_name,
            &cfg.stream_name,
            last_event_id,
        )
        .await?;
    }
    tx.commit().await?;

    Ok(ProjectionIteration {
        advanced_to: checkpoint_target,
        applied_count: apply_stats.applied_count,
        invalid_count: batch.invalid_event_ids.len(),
    })
}

fn inclusive_replay_after_id(from_id: i64) -> i64 {
    if from_id <= 0 {
        -1
    } else {
        from_id - 1
    }
}

fn replay_after_id(current_checkpoint: i64, cfg: &ProjectionConsumerConfig) -> i64 {
    if cfg.replay_reset_checkpoint {
        inclusive_replay_after_id(cfg.replay_from_id)
    } else {
        current_checkpoint.max(inclusive_replay_after_id(cfg.replay_from_id))
    }
}

fn reset_checkpoint_value(from_id: i64) -> i64 {
    if from_id <= 0 {
        0
    } else {
        from_id - 1
    }
}

async fn shutdown_signal() {
    #[cfg(unix)]
    {
        let mut terminate =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
                .expect("failed to install SIGTERM handler");
        tokio::select! {
            _ = tokio::signal::ctrl_c() => {},
            _ = terminate.recv() => {},
        }
    }

    #[cfg(not(unix))]
    {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    }
}
