use std::net::SocketAddr;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "info,banji_api=debug".to_string()),
        )
        .with_target(false)
        .compact()
        .init();

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
