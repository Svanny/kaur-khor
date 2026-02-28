pub mod dependency_samplers;
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
const API_LATENCY_SLO_SECONDS: f64 = 0.75;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum ResponseClassification {
    RateLimited,
    DependencyBackpressure,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum AvailabilitySliClassification {
    Success,
    FailureServer,
    FailureBackpressure,
    RateLimited,
}

impl AvailabilitySliClassification {
    fn as_str(self) -> &'static str {
        match self {
            Self::Success => "success",
            Self::FailureServer => "failure_server",
            Self::FailureBackpressure => "failure_backpressure",
            Self::RateLimited => "rate_limited",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum LatencySliClassification {
    WithinSlo,
    OverSlo,
}

impl LatencySliClassification {
    fn as_str(self) -> &'static str {
        match self {
            Self::WithinSlo => "within_slo",
            Self::OverSlo => "over_slo",
        }
    }
}

fn is_user_api_route(route: &str) -> bool {
    route.starts_with("/v1/")
}

fn classify_availability_sli(
    status: i64,
    response_classification: Option<ResponseClassification>,
) -> AvailabilitySliClassification {
    match response_classification {
        Some(ResponseClassification::RateLimited) => AvailabilitySliClassification::RateLimited,
        Some(ResponseClassification::DependencyBackpressure) => {
            AvailabilitySliClassification::FailureBackpressure
        }
        None if status >= 500 => AvailabilitySliClassification::FailureServer,
        _ => AvailabilitySliClassification::Success,
    }
}

fn classify_latency_sli(
    duration_secs: f64,
    response_classification: Option<ResponseClassification>,
) -> Option<LatencySliClassification> {
    match response_classification {
        Some(
            ResponseClassification::RateLimited | ResponseClassification::DependencyBackpressure,
        ) => None,
        None if duration_secs >= API_LATENCY_SLO_SECONDS => Some(LatencySliClassification::OverSlo),
        None => Some(LatencySliClassification::WithinSlo),
    }
}

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
    let duration_secs = started.elapsed().as_secs_f64();
    let response_classification = response
        .extensions()
        .get::<ResponseClassification>()
        .copied();
    span.record("http_status_code", field::display(status));

    metrics::record_http_duration(duration_secs, &method, &route, status);
    metrics::record_http_active(-1, &method, &route);
    if is_user_api_route(&route) {
        metrics::record_api_availability_sli(
            &method,
            &route,
            classify_availability_sli(status, response_classification).as_str(),
        );
        if let Some(latency_classification) =
            classify_latency_sli(duration_secs, response_classification)
        {
            metrics::record_api_latency_sli(&method, &route, latency_classification.as_str());
        }
    }

    if let Ok(value) = HeaderValue::from_str(&correlation_id) {
        response
            .headers_mut()
            .insert(HeaderName::from_static(CORRELATION_HEADER), value);
    }

    response
}

#[cfg(test)]
mod tests {
    use super::{
        classify_availability_sli, classify_latency_sli, AvailabilitySliClassification,
        LatencySliClassification, ResponseClassification,
    };

    #[test]
    fn rate_limited_requests_are_not_availability_failures() {
        assert_eq!(
            classify_availability_sli(429, Some(ResponseClassification::RateLimited)),
            AvailabilitySliClassification::RateLimited
        );
        assert_eq!(
            classify_latency_sli(0.01, Some(ResponseClassification::RateLimited)),
            None
        );
    }

    #[test]
    fn generic_server_errors_count_against_availability() {
        assert_eq!(
            classify_availability_sli(500, None),
            AvailabilitySliClassification::FailureServer
        );
        assert_eq!(
            classify_latency_sli(1.2, None),
            Some(LatencySliClassification::OverSlo)
        );
    }

    #[test]
    fn backpressure_responses_have_dedicated_classification() {
        assert_eq!(
            classify_availability_sli(503, Some(ResponseClassification::DependencyBackpressure)),
            AvailabilitySliClassification::FailureBackpressure
        );
        assert_eq!(
            classify_latency_sli(0.02, Some(ResponseClassification::DependencyBackpressure)),
            None
        );
    }
}
