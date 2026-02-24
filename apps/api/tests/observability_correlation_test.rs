use reqwest::StatusCode;

#[tokio::test]
async fn response_always_contains_correlation_header() {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move {
        axum::serve(listener, banji_api::app()).await.unwrap();
    });

    let response = reqwest::get(format!("http://{addr}/health")).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert!(response.headers().get("x-correlation-id").is_some());
}

#[tokio::test]
async fn middleware_prefers_x_correlation_id() {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move {
        axum::serve(listener, banji_api::app()).await.unwrap();
    });

    let response = reqwest::Client::new()
        .get(format!("http://{addr}/health"))
        .header("x-correlation-id", "corr-from-header")
        .header("x-request-id", "request-fallback")
        .send()
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response
            .headers()
            .get("x-correlation-id")
            .and_then(|h| h.to_str().ok()),
        Some("corr-from-header")
    );
}

#[tokio::test]
async fn middleware_uses_x_request_id_when_correlation_missing() {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move {
        axum::serve(listener, banji_api::app()).await.unwrap();
    });

    let response = reqwest::Client::new()
        .get(format!("http://{addr}/health"))
        .header("x-request-id", "request-id-value")
        .send()
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response
            .headers()
            .get("x-correlation-id")
            .and_then(|h| h.to_str().ok()),
        Some("request-id-value")
    );
}

#[tokio::test]
async fn middleware_falls_back_to_trace_id() {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move {
        axum::serve(listener, banji_api::app()).await.unwrap();
    });

    let trace_id = "4bf92f3577b34da6a3ce929d0e0e4736";
    let traceparent = format!("00-{trace_id}-00f067aa0ba902b7-01");
    let response = reqwest::Client::new()
        .get(format!("http://{addr}/health"))
        .header("traceparent", traceparent)
        .send()
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response
            .headers()
            .get("x-correlation-id")
            .and_then(|h| h.to_str().ok()),
        Some(trace_id)
    );
}
