use reqwest::StatusCode;

#[tokio::test]
async fn health_endpoint_returns_ok() {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move {
        axum::serve(listener, banji_api::app()).await.unwrap();
    });

    let response = reqwest::get(format!("http://{addr}/health")).await.unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body: serde_json::Value = response.json().await.unwrap();
    assert_eq!(body, serde_json::json!({"status": "ok"}));
}
