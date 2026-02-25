use crate::AppState;
use axum::{
    body::Body,
    extract::State,
    http::{header::VARY, Method, Request, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};

const ALLOW_HEADERS: &str = "content-type,authorization,x-request-id,x-correlation-id,idempotency-key,x-caller-id,traceparent,tracestate,baggage";
const ALLOW_METHODS: &str = "GET,POST,PUT,PATCH,DELETE,OPTIONS";

pub async fn cors_middleware(
    State(state): State<AppState>,
    request: Request<Body>,
    next: Next,
) -> Response {
    let origin = request
        .headers()
        .get("origin")
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned);

    if request.method() == Method::OPTIONS {
        return handle_preflight(origin.as_deref(), &state.config.edge_cors_allowed_origins);
    }

    if let Some(origin_value) = origin.as_deref() {
        if !is_allowed_origin(origin_value, &state.config.edge_cors_allowed_origins) {
            return (StatusCode::FORBIDDEN, "origin not allowed").into_response();
        }
    }

    let mut response = next.run(request).await;

    if let Some(origin_value) = origin.as_deref() {
        response.headers_mut().insert(
            "access-control-allow-origin",
            match origin_value.parse() {
                Ok(v) => v,
                Err(_) => {
                    return (StatusCode::INTERNAL_SERVER_ERROR, "invalid cors origin")
                        .into_response()
                }
            },
        );
        response
            .headers_mut()
            .insert(VARY, "Origin".parse().expect("valid vary header"));
    }

    response
}

fn handle_preflight(origin: Option<&str>, allowed_origins: &[String]) -> Response {
    let Some(origin_value) = origin else {
        return (StatusCode::NO_CONTENT, "").into_response();
    };

    if !is_allowed_origin(origin_value, allowed_origins) {
        return (StatusCode::FORBIDDEN, "origin not allowed").into_response();
    }

    let mut response = (StatusCode::NO_CONTENT, "").into_response();
    response.headers_mut().insert(
        "access-control-allow-origin",
        origin_value
            .parse()
            .expect("validated origin should be a valid header value"),
    );
    response.headers_mut().insert(
        "access-control-allow-methods",
        ALLOW_METHODS
            .parse()
            .expect("allow methods should be valid"),
    );
    response.headers_mut().insert(
        "access-control-allow-headers",
        ALLOW_HEADERS
            .parse()
            .expect("allow headers should be valid"),
    );
    response.headers_mut().insert(
        "access-control-max-age",
        "600".parse().expect("max age should be valid"),
    );
    response
        .headers_mut()
        .insert(VARY, "Origin".parse().expect("vary should be valid"));
    response
}

fn is_allowed_origin(origin: &str, allowed_origins: &[String]) -> bool {
    allowed_origins.iter().any(|entry| entry == origin)
}

#[cfg(test)]
mod tests {
    use super::is_allowed_origin;

    #[test]
    fn allowlist_requires_exact_origin_match() {
        let allowed = vec!["https://app.example.com".to_string()];
        assert!(is_allowed_origin("https://app.example.com", &allowed));
        assert!(!is_allowed_origin("https://evil.example.com", &allowed));
    }
}
