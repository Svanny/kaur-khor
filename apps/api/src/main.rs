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

    let addr = std::env::var("API_BIND_ADDR")
        .ok()
        .and_then(|s| s.parse::<SocketAddr>().ok())
        .unwrap_or_else(|| SocketAddr::from(([0, 0, 0, 0], 8080)));

    tracing::info!(%addr, "starting banji-api");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, banji_api::app_with_state(state)).await?;
    Ok(())
}
