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
        .header(
            "traceparent",
            "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
        )
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
async fn middleware_falls_back_to_generated_id_when_headers_missing() {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(async move {
        axum::serve(listener, banji_api::app()).await.unwrap();
    });

    let response = reqwest::Client::new()
        .get(format!("http://{addr}/health"))
        .send()
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let correlation_id = response
        .headers()
        .get("x-correlation-id")
        .and_then(|h| h.to_str().ok())
        .unwrap();
    assert_eq!(correlation_id.len(), 32);
    assert!(correlation_id.chars().all(|c| c.is_ascii_hexdigit()));
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
