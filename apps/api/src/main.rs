use banji_api::config::{ProjectionConsumerConfig, ProjectionConsumerRunMode};
use std::{future::Future, net::SocketAddr, time::Duration};
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
        banji_api::config::AppRole::BackfillController => run_backfill_controller(config).await,
    }
}

async fn run_api(config: banji_api::config::AppConfig) -> anyhow::Result<()> {
    let build_commit_sha = banji_api::build_metadata::build_commit_sha();
    let deploy_commit_sha = banji_api::build_metadata::deploy_commit_sha();
    let state = banji_api::build_state(config).await?;
    let pool_for_shutdown = state.db.clone();

    if let Some(pool) = state.db.as_ref() {
        banji_api::db::pool::warmup_runtime_pool(pool).await?;
    }

    let addr = banji_api::config::resolve_api_bind_addr();

    tracing::info!(
        %addr,
        build_commit_sha,
        deploy_commit_sha = %deploy_commit_sha,
        app_role = %state.config.app_role.as_str(),
        banji_service = %state.config.service,
        "starting banji-api"
    );
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
    let build_commit_sha = banji_api::build_metadata::build_commit_sha();
    let deploy_commit_sha = banji_api::build_metadata::deploy_commit_sha();
    let pool = banji_api::db::pool::build_runtime_pool(&config)
        .await?
        .ok_or_else(|| {
            anyhow::anyhow!("DATABASE_RUNTIME_URL is required for APP_ROLE=event-relay")
        })?;

    banji_api::db::pool::warmup_runtime_pool(&pool).await?;

    tracing::info!(
        role = %config.app_role.as_str(),
        build_commit_sha,
        deploy_commit_sha = %deploy_commit_sha,
        banji_service = %config.service,
        batch_size = config.event_relay_batch_size,
        poll_interval_ms = config.event_relay_poll_interval.as_millis(),
        "starting event relay loop"
    );

    banji_api::events::relay::run_relay_loop(pool.clone(), config, shutdown_signal()).await?;
    pool.close().await;
    Ok(())
}

async fn run_projection_consumer(config: banji_api::config::AppConfig) -> anyhow::Result<()> {
    let build_commit_sha = banji_api::build_metadata::build_commit_sha();
    let deploy_commit_sha = banji_api::build_metadata::deploy_commit_sha();
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

    let shutdown = shutdown_signal();
    tokio::pin!(shutdown);

    let startup = acquire_projection_consumer_lock(
        &projection_cfg,
        &mut shutdown,
        || {
            banji_api::events::consumer::acquire_consumer_lock(
                &database_url,
                &projection_cfg.service_name,
                &projection_cfg.consumer_name,
                &projection_cfg.stream_name,
            )
        },
        tokio::time::sleep,
    )
    .await?;

    let result = match startup {
        ProjectionConsumerStartup::Shutdown => Ok(()),
        ProjectionConsumerStartup::Acquired(lock) => {
            log_projection_consumer_startup(
                &config,
                &projection_cfg,
                build_commit_sha,
                &deploy_commit_sha,
            );

            let result = match projection_cfg.run_mode {
                ProjectionConsumerRunMode::Continuous => {
                    run_inventory_projection_loop(&pool, &projection_cfg, &mut shutdown).await
                }
                ProjectionConsumerRunMode::ReplayPreview => {
                    run_inventory_projection_preview(&pool, &projection_cfg).await
                }
                ProjectionConsumerRunMode::ReplayApply => {
                    run_inventory_projection_replay(&pool, &projection_cfg).await
                }
            };

            lock.release().await?;
            result
        }
    };

    pool.close().await;
    result
}

async fn run_worker(config: banji_api::config::AppConfig) -> anyhow::Result<()> {
    let build_commit_sha = banji_api::build_metadata::build_commit_sha();
    let deploy_commit_sha = banji_api::build_metadata::deploy_commit_sha();
    let pool = banji_api::db::pool::build_runtime_pool(&config)
        .await?
        .ok_or_else(|| anyhow::anyhow!("DATABASE_RUNTIME_URL is required for APP_ROLE=worker"))?;

    banji_api::db::pool::warmup_runtime_pool(&pool).await?;
    let worker_cfg = config.worker_config()?;
    banji_api::jobs::rollout::worker_startup_preflight(&pool).await?;
    tracing::info!(
        role = %config.app_role.as_str(),
        build_commit_sha,
        deploy_commit_sha = %deploy_commit_sha,
        banji_service = %config.service,
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

async fn run_backfill_controller(config: banji_api::config::AppConfig) -> anyhow::Result<()> {
    let build_commit_sha = banji_api::build_metadata::build_commit_sha();
    let deploy_commit_sha = banji_api::build_metadata::deploy_commit_sha();
    let backfill_cfg = config.backfill_config()?;
    let mut pool_cfg = config.clone();
    pool_cfg.database_runtime_url = Some(backfill_cfg.database_url.clone());

    let pool = banji_api::db::pool::build_runtime_pool(&pool_cfg)
        .await?
        .ok_or_else(|| {
            anyhow::anyhow!(
                "selected backfill database URL is required for APP_ROLE=backfill-controller"
            )
        })?;

    banji_api::db::pool::warmup_runtime_pool(&pool).await?;
    tracing::info!(
        role = %config.app_role.as_str(),
        build_commit_sha,
        deploy_commit_sha = %deploy_commit_sha,
        banji_service = %config.service,
        kind = %backfill_cfg.kind.as_str(),
        mode = %backfill_cfg.mode.as_str(),
        database_kind = %backfill_cfg.database_kind.as_str(),
        stream_name = %backfill_cfg.stream_name,
        "starting backfill controller"
    );

    let result = banji_api::backfill::controller::run(&pool, &pool_cfg, &backfill_cfg).await;
    pool.close().await;
    result
}

#[derive(Debug, Default, Clone, Copy)]
struct ProjectionIteration {
    advanced_to: Option<i64>,
    applied_count: usize,
    invalid_count: usize,
}

#[derive(Debug)]
enum ProjectionConsumerStartup<T> {
    Acquired(T),
    Shutdown,
}

fn log_projection_consumer_startup(
    config: &banji_api::config::AppConfig,
    projection_cfg: &ProjectionConsumerConfig,
    build_commit_sha: &str,
    deploy_commit_sha: &str,
) {
    tracing::info!(
        role = %config.app_role.as_str(),
        build_commit_sha,
        deploy_commit_sha = %deploy_commit_sha,
        banji_service = %config.service,
        service_name = %projection_cfg.service_name,
        consumer_name = %projection_cfg.consumer_name,
        stream_name = %projection_cfg.stream_name,
        batch_size = projection_cfg.batch_size,
        poll_interval_ms = projection_cfg.poll_interval.as_millis(),
        invalid_policy = ?projection_cfg.invalid_policy,
        run_mode = %projection_cfg.run_mode.as_str(),
        "starting projection consumer"
    );
}

async fn acquire_projection_consumer_lock<T, A, AFut, Sl, SlFut, S>(
    cfg: &ProjectionConsumerConfig,
    shutdown: &mut S,
    mut acquire_lock: A,
    mut sleep: Sl,
) -> anyhow::Result<ProjectionConsumerStartup<T>>
where
    A: FnMut() -> AFut,
    AFut: Future<Output = anyhow::Result<T>>,
    Sl: FnMut(Duration) -> SlFut,
    SlFut: Future<Output = ()>,
    S: Future<Output = ()> + Unpin,
{
    match cfg.run_mode {
        ProjectionConsumerRunMode::Continuous => loop {
            match acquire_lock().await {
                Ok(lock) => {
                    tracing::info!(
                        service_name = %cfg.service_name,
                        consumer_name = %cfg.consumer_name,
                        stream_name = %cfg.stream_name,
                        "projection consumer advisory lock acquired"
                    );
                    return Ok(ProjectionConsumerStartup::Acquired(lock));
                }
                Err(error) => {
                    let Some(lock_held) =
                        banji_api::events::consumer::consumer_lock_already_held(&error)
                    else {
                        return Err(error);
                    };

                    tracing::warn!(
                        service_name = %lock_held.service_name,
                        consumer_name = %lock_held.consumer_name,
                        stream_name = %lock_held.stream_name,
                        retry_delay_ms = cfg.poll_interval.as_millis(),
                        "projection consumer advisory lock already held; retrying"
                    );

                    let delay = sleep(cfg.poll_interval);
                    tokio::pin!(delay);
                    tokio::select! {
                        _ = &mut *shutdown => {
                            tracing::info!(
                                service_name = %cfg.service_name,
                                consumer_name = %cfg.consumer_name,
                                stream_name = %cfg.stream_name,
                                "projection consumer shutdown requested while waiting for advisory lock"
                            );
                            return Ok(ProjectionConsumerStartup::Shutdown);
                        }
                        _ = &mut delay => {}
                    }
                }
            }
        },
        ProjectionConsumerRunMode::ReplayPreview | ProjectionConsumerRunMode::ReplayApply => {
            let lock = acquire_lock().await?;
            tracing::info!(
                service_name = %cfg.service_name,
                consumer_name = %cfg.consumer_name,
                stream_name = %cfg.stream_name,
                "projection consumer advisory lock acquired"
            );
            Ok(ProjectionConsumerStartup::Acquired(lock))
        }
    }
}

async fn run_inventory_projection_loop<F>(
    pool: &sqlx::PgPool,
    cfg: &ProjectionConsumerConfig,
    shutdown: &mut F,
) -> anyhow::Result<()>
where
    F: Future<Output = ()> + Unpin,
{
    let mut ticker = tokio::time::interval(cfg.poll_interval);

    loop {
        tokio::select! {
            _ = &mut *shutdown => break,
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

#[cfg(test)]
mod tests {
    use super::*;
    use banji_api::events::consumer::{consumer_lock_already_held, ConsumerLockAlreadyHeld};
    use banji_api::events::schema_types::InvalidEventPolicy;
    use std::{
        future::{pending, ready},
        sync::{
            atomic::{AtomicUsize, Ordering},
            Arc,
        },
    };

    fn projection_consumer_config(run_mode: ProjectionConsumerRunMode) -> ProjectionConsumerConfig {
        ProjectionConsumerConfig {
            service_name: "projection-consumer".to_string(),
            consumer_name: "inventory-projector".to_string(),
            stream_name: "banji-core.test.inventory-updated".to_string(),
            batch_size: 100,
            poll_interval: Duration::from_millis(500),
            invalid_policy: InvalidEventPolicy::Halt,
            run_mode,
            replay_from_id: 0,
            replay_to_id: None,
            replay_reset_checkpoint: false,
            replay_truncate_projection: false,
        }
    }

    fn lock_held_error(cfg: &ProjectionConsumerConfig) -> anyhow::Error {
        ConsumerLockAlreadyHeld {
            service_name: cfg.service_name.clone(),
            consumer_name: cfg.consumer_name.clone(),
            stream_name: cfg.stream_name.clone(),
        }
        .into()
    }

    #[tokio::test]
    async fn continuous_mode_retries_lock_contention_until_acquired() {
        let cfg = projection_consumer_config(ProjectionConsumerRunMode::Continuous);
        let attempts = Arc::new(AtomicUsize::new(0));
        let sleeps = Arc::new(AtomicUsize::new(0));
        let mut shutdown = pending::<()>();

        let startup: ProjectionConsumerStartup<&'static str> = acquire_projection_consumer_lock(
            &cfg,
            &mut shutdown,
            {
                let attempts = Arc::clone(&attempts);
                let cfg = cfg.clone();
                move || {
                    let attempts = Arc::clone(&attempts);
                    let cfg = cfg.clone();
                    async move {
                        let attempt = attempts.fetch_add(1, Ordering::SeqCst);
                        if attempt == 0 {
                            Err(lock_held_error(&cfg))
                        } else {
                            Ok("lock")
                        }
                    }
                }
            },
            {
                let sleeps = Arc::clone(&sleeps);
                move |_| {
                    sleeps.fetch_add(1, Ordering::SeqCst);
                    ready(())
                }
            },
        )
        .await
        .unwrap();

        match startup {
            ProjectionConsumerStartup::Acquired(lock) => assert_eq!(lock, "lock"),
            ProjectionConsumerStartup::Shutdown => panic!("expected lock acquisition"),
        }
        assert_eq!(attempts.load(Ordering::SeqCst), 2);
        assert_eq!(sleeps.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn replay_mode_fails_fast_on_lock_contention() {
        let cfg = projection_consumer_config(ProjectionConsumerRunMode::ReplayPreview);
        let attempts = Arc::new(AtomicUsize::new(0));
        let sleeps = Arc::new(AtomicUsize::new(0));
        let mut shutdown = pending::<()>();

        let error = acquire_projection_consumer_lock::<(), _, _, _, _, _>(
            &cfg,
            &mut shutdown,
            {
                let attempts = Arc::clone(&attempts);
                let cfg = cfg.clone();
                move || {
                    let attempts = Arc::clone(&attempts);
                    let cfg = cfg.clone();
                    async move {
                        attempts.fetch_add(1, Ordering::SeqCst);
                        Err(lock_held_error(&cfg))
                    }
                }
            },
            {
                let sleeps = Arc::clone(&sleeps);
                move |_| {
                    sleeps.fetch_add(1, Ordering::SeqCst);
                    ready(())
                }
            },
        )
        .await
        .unwrap_err();

        assert!(consumer_lock_already_held(&error).is_some());
        assert_eq!(attempts.load(Ordering::SeqCst), 1);
        assert_eq!(sleeps.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn continuous_mode_fails_fast_on_non_lock_error() {
        let cfg = projection_consumer_config(ProjectionConsumerRunMode::Continuous);
        let attempts = Arc::new(AtomicUsize::new(0));
        let sleeps = Arc::new(AtomicUsize::new(0));
        let mut shutdown = pending::<()>();

        let error = acquire_projection_consumer_lock::<(), _, _, _, _, _>(
            &cfg,
            &mut shutdown,
            {
                let attempts = Arc::clone(&attempts);
                move || {
                    let attempts = Arc::clone(&attempts);
                    async move {
                        attempts.fetch_add(1, Ordering::SeqCst);
                        Err(anyhow::anyhow!("database unavailable"))
                    }
                }
            },
            {
                let sleeps = Arc::clone(&sleeps);
                move |_| {
                    sleeps.fetch_add(1, Ordering::SeqCst);
                    ready(())
                }
            },
        )
        .await
        .unwrap_err();

        assert_eq!(error.to_string(), "database unavailable");
        assert_eq!(attempts.load(Ordering::SeqCst), 1);
        assert_eq!(sleeps.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn continuous_mode_shutdown_stops_lock_retry_loop() {
        let cfg = projection_consumer_config(ProjectionConsumerRunMode::Continuous);
        let attempts = Arc::new(AtomicUsize::new(0));
        let mut shutdown = ready(());

        let startup: ProjectionConsumerStartup<()> = acquire_projection_consumer_lock(
            &cfg,
            &mut shutdown,
            {
                let attempts = Arc::clone(&attempts);
                let cfg = cfg.clone();
                move || {
                    let attempts = Arc::clone(&attempts);
                    let cfg = cfg.clone();
                    async move {
                        attempts.fetch_add(1, Ordering::SeqCst);
                        Err(lock_held_error(&cfg))
                    }
                }
            },
            |_| pending::<()>(),
        )
        .await
        .unwrap();

        assert!(matches!(startup, ProjectionConsumerStartup::Shutdown));
        assert_eq!(attempts.load(Ordering::SeqCst), 1);
    }
}
