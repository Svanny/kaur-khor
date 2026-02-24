pub mod metrics;
pub mod otel;
pub mod propagation;

use axum::{
    body::Body,
    extract::MatchedPath,
    http::{header::HeaderName, HeaderValue, Request},
    middleware::Next,
    response::Response,
};
use opentelemetry::trace::TraceContextExt;
use std::time::Instant;
use tracing::field;
use tracing_opentelemetry::OpenTelemetrySpanExt;

const CORRELATION_HEADER: &str = "x-correlation-id";

pub async fn http_observability_middleware(mut request: Request<Body>, next: Next) -> Response {
    let parent_context = propagation::extract_context_from_headers(request.headers());
    let correlation_id =
        propagation::correlation_id_from_headers_or_context(request.headers(), &parent_context);

    if let Ok(value) = HeaderValue::from_str(&correlation_id) {
        request
            .headers_mut()
            .insert(HeaderName::from_static(CORRELATION_HEADER), value);
    }

    let method = request.method().as_str().to_string();
    let route = request
        .extensions()
        .get::<MatchedPath>()
        .map(MatchedPath::as_str)
        .unwrap_or("unknown")
        .to_string();

    metrics::record_http_active(1, &method, &route);
    let started = Instant::now();

    let deployment_id =
        std::env::var("BANJI_DEPLOYMENT_ID").unwrap_or_else(|_| "unknown".to_string());
    let service = std::env::var("BANJI_SERVICE").unwrap_or_else(|_| "api".to_string());
    let env_name = std::env::var("BANJI_ENV").unwrap_or_else(|_| "dev".to_string());

    let span = tracing::info_span!(
        "http.request",
        correlation_id = %correlation_id,
        trace_id = field::Empty,
        span_id = field::Empty,
        deployment_id = %deployment_id,
        service = %service,
        env = %env_name,
        http_method = %method,
        http_route = %route,
        http_status_code = field::Empty
    );
    span.set_parent(parent_context);

    let mut response = {
        let _entered = span.enter();
        let span_context = span.context().span().span_context().clone();
        if span_context.is_valid() {
            span.record("trace_id", field::display(span_context.trace_id()));
            span.record("span_id", field::display(span_context.span_id()));
        }
        next.run(request).await
    };

    let status = response.status().as_u16() as i64;
    span.record("http_status_code", field::display(status));

    metrics::record_http_duration(started.elapsed().as_secs_f64(), &method, &route, status);
    metrics::record_http_active(-1, &method, &route);

    if let Ok(value) = HeaderValue::from_str(&correlation_id) {
        response
            .headers_mut()
            .insert(HeaderName::from_static(CORRELATION_HEADER), value);
    }

    response
}
