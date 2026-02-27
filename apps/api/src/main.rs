use banji_api::events::schema_types::InvalidEventPolicy;
use std::{env, net::SocketAddr, time::Duration};

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

    let service_name = env::var("EVENT_CONSUMER_SERVICE_NAME")
        .unwrap_or_else(|_| "projection-consumer".to_string());
    let consumer_name =
        env::var("EVENT_CONSUMER_NAME").unwrap_or_else(|_| "inventory-projector".to_string());
    let stream_name = env::var("EVENT_CONSUMER_STREAM_NAME")
        .unwrap_or_else(|_| format!("{}.{}.inventory-updated", config.system, config.env));
    let batch_size = parse_u32_env("EVENT_CONSUMER_BATCH_SIZE", 100)? as i64;
    let poll_interval =
        Duration::from_millis(parse_u64_env("EVENT_CONSUMER_POLL_INTERVAL_MS", 500)?);
    let invalid_policy = parse_invalid_event_policy(
        &env::var("EVENT_CONSUMER_INVALID_POLICY").unwrap_or_else(|_| "halt".to_string()),
    )?;

    tracing::info!(
        role = %config.app_role.as_str(),
        service_name = %service_name,
        consumer_name = %consumer_name,
        stream_name = %stream_name,
        batch_size = batch_size,
        poll_interval_ms = poll_interval.as_millis(),
        invalid_policy = ?invalid_policy,
        "starting projection consumer loop"
    );

    let mut ticker = tokio::time::interval(poll_interval);
    let shutdown = shutdown_signal();
    tokio::pin!(shutdown);

    loop {
        tokio::select! {
            _ = &mut shutdown => break,
            _ = ticker.tick() => {
                banji_api::events::consumer::heartbeat(&pool, &service_name, &consumer_name, &stream_name).await?;
                let checkpoint = banji_api::events::consumer::get_checkpoint(&pool, &service_name, &consumer_name, &stream_name).await?;
                let batch = match banji_api::events::consumer::poll_and_decode_stream(
                    &pool,
                    &service_name,
                    &consumer_name,
                    &stream_name,
                    checkpoint,
                    batch_size,
                    invalid_policy,
                ).await {
                    Ok(batch) => batch,
                    Err(err) => {
                        tracing::error!(error = %err, "projection consumer halted due to invalid event policy");
                        return Err(err);
                    }
                };

                for (_event_id, _event) in &batch.events {
                    // Consumer scaffold intentionally validates/decode-gates first.
                }

                let max_seen = batch
                    .events
                    .iter()
                    .map(|(id, _)| *id)
                    .chain(batch.invalid_event_ids.iter().copied())
                    .max();

                if let Some(last_event_id) = max_seen {
                    banji_api::events::consumer::advance_checkpoint(
                        &pool,
                        &service_name,
                        &consumer_name,
                        &stream_name,
                        last_event_id,
                    ).await?;
                }

                let current_checkpoint = max_seen.unwrap_or(checkpoint);
                let _ = banji_api::events::consumer::compute_stream_lag(
                    &pool,
                    &stream_name,
                    current_checkpoint,
                ).await;
            }
        }
    }

    pool.close().await;
    Ok(())
}

fn parse_u32_env(name: &str, default: u32) -> anyhow::Result<u32> {
    match env::var(name) {
        Ok(v) => v
            .parse::<u32>()
            .map_err(|_| anyhow::anyhow!("{name} must be an integer > 0"))
            .and_then(|n| {
                if n == 0 {
                    Err(anyhow::anyhow!("{name} must be greater than 0"))
                } else {
                    Ok(n)
                }
            }),
        Err(_) => Ok(default),
    }
}

fn parse_u64_env(name: &str, default: u64) -> anyhow::Result<u64> {
    match env::var(name) {
        Ok(v) => v
            .parse::<u64>()
            .map_err(|_| anyhow::anyhow!("{name} must be an integer > 0"))
            .and_then(|n| {
                if n == 0 {
                    Err(anyhow::anyhow!("{name} must be greater than 0"))
                } else {
                    Ok(n)
                }
            }),
        Err(_) => Ok(default),
    }
}

fn parse_invalid_event_policy(raw: &str) -> anyhow::Result<InvalidEventPolicy> {
    match raw.trim().to_ascii_lowercase().as_str() {
        "halt" => Ok(InvalidEventPolicy::Halt),
        "skip" => Ok(InvalidEventPolicy::Skip),
        "quarantine" => Ok(InvalidEventPolicy::Quarantine),
        _ => Err(anyhow::anyhow!(
            "EVENT_CONSUMER_INVALID_POLICY must be one of: halt, skip, quarantine"
        )),
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
