use axum::http::HeaderMap;
use opentelemetry::{
    global,
    propagation::{Extractor, Injector, TextMapPropagator},
    trace::TraceContextExt,
    Context,
};
use opentelemetry_sdk::propagation::{
    BaggagePropagator, TextMapCompositePropagator, TraceContextPropagator,
};
use std::collections::BTreeMap;
use std::sync::Once;
use uuid::Uuid;

const CORRELATION_HEADER: &str = "x-correlation-id";
const REQUEST_ID_HEADER: &str = "x-request-id";
const MAX_CORRELATION_ID_LEN: usize = 64;
static PROPAGATOR_INIT: Once = Once::new();

struct HeaderMapExtractor<'a>(&'a HeaderMap);

impl Extractor for HeaderMapExtractor<'_> {
    fn get(&self, key: &str) -> Option<&str> {
        self.0.get(key).and_then(|v| v.to_str().ok())
    }

    fn keys(&self) -> Vec<&str> {
        self.0.keys().map(|name| name.as_str()).collect()
    }
}

struct HeaderMapInjector<'a>(&'a mut HeaderMap);

impl Injector for HeaderMapInjector<'_> {
    fn set(&mut self, key: &str, value: String) {
        if let (Ok(name), Ok(header)) = (
            axum::http::header::HeaderName::try_from(key),
            axum::http::HeaderValue::from_str(&value),
        ) {
            self.0.insert(name, header);
        }
    }
}

struct StringMapInjector<'a>(&'a mut BTreeMap<String, String>);

impl Injector for StringMapInjector<'_> {
    fn set(&mut self, key: &str, value: String) {
        self.0.insert(key.to_string(), value);
    }
}

pub fn extract_context_from_headers(headers: &HeaderMap) -> Context {
    ensure_default_propagators();
    global::get_text_map_propagator(|propagator| propagator.extract(&HeaderMapExtractor(headers)))
}

pub fn inject_current_context_to_headers(headers: &mut HeaderMap) {
    ensure_default_propagators();
    let context = Context::current();
    global::get_text_map_propagator(|propagator| {
        propagator.inject_context(&context, &mut HeaderMapInjector(headers))
    });
}

pub fn inject_current_context_to_map(headers: &mut BTreeMap<String, String>) {
    ensure_default_propagators();
    let context = Context::current();
    global::get_text_map_propagator(|propagator| {
        propagator.inject_context(&context, &mut StringMapInjector(headers))
    });
}

pub fn correlation_id_from_headers_or_context(headers: &HeaderMap, context: &Context) -> String {
    if let Some(v) = header_value(headers, CORRELATION_HEADER) {
        return v;
    }
    if let Some(v) = header_value(headers, REQUEST_ID_HEADER) {
        return v;
    }
    if let Some(trace_id) = trace_id_from_context(context) {
        return trace_id;
    }
    Uuid::new_v4().as_simple().to_string()
}

pub fn trace_id_from_context(context: &Context) -> Option<String> {
    let span_context = context.span().span_context().clone();
    if span_context.is_valid() {
        Some(span_context.trace_id().to_string())
    } else {
        None
    }
}

pub fn is_valid_correlation_id(value: &str) -> bool {
    if value.is_empty() || value.len() > MAX_CORRELATION_ID_LEN {
        return false;
    }
    value
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | ':'))
}

fn header_value(headers: &HeaderMap, key: &str) -> Option<String> {
    let value = headers.get(key)?.to_str().ok()?.trim();
    if is_valid_correlation_id(value) {
        Some(value.to_string())
    } else {
        None
    }
}

fn ensure_default_propagators() {
    PROPAGATOR_INIT.call_once(|| {
        let propagators: Vec<Box<dyn TextMapPropagator + Send + Sync>> = vec![
            Box::new(TraceContextPropagator::new()),
            Box::new(BaggagePropagator::new()),
        ];
        global::set_text_map_propagator(TextMapCompositePropagator::new(propagators));
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderValue;
    #[test]
    fn invalid_correlation_values_are_rejected() {
        assert!(is_valid_correlation_id("abc-123:foo_bar"));
        assert!(!is_valid_correlation_id(""));
        assert!(!is_valid_correlation_id("contains space"));
        assert!(!is_valid_correlation_id(
            "too-long-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        ));
    }

    #[test]
    fn current_context_injection_carries_traceparent() {
        ensure_default_propagators();

        let mut incoming = HeaderMap::new();
        incoming.insert(
            "traceparent",
            HeaderValue::from_static("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"),
        );
        let parent = extract_context_from_headers(&incoming);
        let _attached = parent.attach();

        let mut outgoing = BTreeMap::new();
        inject_current_context_to_map(&mut outgoing);
        assert!(outgoing.contains_key("traceparent"));
    }
}
