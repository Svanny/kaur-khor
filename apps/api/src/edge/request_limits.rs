use crate::AppState;
use axum::{
    body::{to_bytes, Body},
    extract::State,
    http::{Method, Request, StatusCode},
    middleware::Next,
    response::Response,
};

pub async fn request_size_limit_middleware(
    State(state): State<AppState>,
    request: Request<Body>,
    next: Next,
) -> Response {
    if request.method() == Method::OPTIONS {
        return next.run(request).await;
    }

    let max_bytes = if is_write_method(request.method()) {
        state.config.edge_write_request_max_bytes
    } else {
        state.config.edge_request_max_bytes
    };

    if content_length_exceeds_limit(&request, max_bytes) {
        return (
            StatusCode::PAYLOAD_TOO_LARGE,
            "request body exceeds configured limit",
        )
            .into_response();
    }

    let (parts, body) = request.into_parts();
    let buffered = match to_bytes(body, max_bytes).await {
        Ok(bytes) => bytes,
        Err(_) => {
            return (
                StatusCode::PAYLOAD_TOO_LARGE,
                "request body exceeds configured limit",
            )
                .into_response();
        }
    };

    let rebuilt = Request::from_parts(parts, Body::from(buffered));
    next.run(rebuilt).await
}

fn content_length_exceeds_limit(request: &Request<Body>, max_bytes: usize) -> bool {
    request
        .headers()
        .get("content-length")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<usize>().ok())
        .is_some_and(|value| value > max_bytes)
}

fn is_write_method(method: &Method) -> bool {
    matches!(
        *method,
        Method::POST | Method::PUT | Method::PATCH | Method::DELETE
    )
}

use axum::response::IntoResponse;

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::Request;

    #[test]
    fn write_method_detection_matches_contract() {
        assert!(is_write_method(&Method::POST));
        assert!(is_write_method(&Method::PUT));
        assert!(is_write_method(&Method::PATCH));
        assert!(is_write_method(&Method::DELETE));
        assert!(!is_write_method(&Method::GET));
        assert!(!is_write_method(&Method::OPTIONS));
    }

    #[test]
    fn content_length_short_circuit_works() {
        let req = Request::builder()
            .header("content-length", "65")
            .body(Body::empty())
            .expect("request should build");
        assert!(content_length_exceeds_limit(&req, 64));
    }
}
