use std::net::SocketAddr;

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
