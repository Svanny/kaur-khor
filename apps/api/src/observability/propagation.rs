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
use serde_json::{Map as JsonMap, Value};
use std::collections::BTreeMap;
use std::sync::Once;
use uuid::Uuid;

const CORRELATION_HEADER: &str = "x-correlation-id";
const TRACEPARENT_HEADER: &str = "traceparent";
const TRACESTATE_HEADER: &str = "tracestate";
const BAGGAGE_HEADER: &str = "baggage";
const OBSERVABILITY_KEY: &str = "observability";
const MAX_CORRELATION_ID_LEN: usize = 64;
const MAX_TRACEPARENT_LEN: usize = 128;
const MAX_TRACESTATE_LEN: usize = 512;
const MAX_BAGGAGE_LEN: usize = 512;
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

struct StringMapExtractor<'a>(&'a BTreeMap<String, String>);

impl Extractor for StringMapExtractor<'_> {
    fn get(&self, key: &str) -> Option<&str> {
        self.0.get(key).map(String::as_str)
    }

    fn keys(&self) -> Vec<&str> {
        self.0.keys().map(String::as_str).collect()
    }
}

pub fn extract_context_from_headers(headers: &HeaderMap) -> Context {
    ensure_default_propagators();
    global::get_text_map_propagator(|propagator| propagator.extract(&HeaderMapExtractor(headers)))
}

pub fn extract_context_from_map(headers: &BTreeMap<String, String>) -> Context {
    ensure_default_propagators();
    global::get_text_map_propagator(|propagator| propagator.extract(&StringMapExtractor(headers)))
}

pub fn extract_context_from_metadata(metadata: &Value) -> Context {
    extract_context_from_map(&transport_headers_from_metadata(metadata))
}

pub fn inject_current_context_to_headers(headers: &mut HeaderMap) {
    ensure_default_propagators();
    let context = Context::current();
    global::get_text_map_propagator(|propagator| {
        propagator.inject_context(&context, &mut HeaderMapInjector(headers))
    });
}

pub fn inject_current_context_to_map(headers: &mut BTreeMap<String, String>) {
    inject_context_to_map(&Context::current(), headers);
}

pub fn inject_context_to_map(context: &Context, headers: &mut BTreeMap<String, String>) {
    ensure_default_propagators();
    global::get_text_map_propagator(|propagator| {
        propagator.inject_context(context, &mut StringMapInjector(headers))
    });
}

pub fn correlation_id_from_headers_or_context(headers: &HeaderMap, context: &Context) -> String {
    if let Some(v) = header_value(headers, CORRELATION_HEADER) {
        return v;
    }
    if let Some(trace_id) = trace_id_from_context(context) {
        return trace_id;
    }
    Uuid::new_v4().as_simple().to_string()
}

pub fn observability_metadata(correlation_id: &str, context: &Context) -> Value {
    let mut observability = JsonMap::new();
    observability.insert(
        CORRELATION_HEADER.to_string(),
        Value::String(correlation_id.to_string()),
    );

    let mut injected = BTreeMap::new();
    inject_context_to_map(context, &mut injected);
    for (key, value) in injected {
        if let Some(sanitized) = sanitize_transport_value(&key, &value) {
            observability.insert(key, Value::String(sanitized));
        }
    }

    let mut metadata = JsonMap::new();
    metadata.insert(OBSERVABILITY_KEY.to_string(), Value::Object(observability));
    Value::Object(metadata)
}

pub fn merge_observability_metadata(base: &Value, observability: Value) -> Value {
    let mut metadata = match base {
        Value::Object(map) => map.clone(),
        _ => JsonMap::new(),
    };

    if let Value::Object(observability_map) = observability {
        if !observability_map.is_empty() {
            metadata.insert(
                OBSERVABILITY_KEY.to_string(),
                Value::Object(observability_map),
            );
        }
    }

    Value::Object(metadata)
}

pub fn observability_payload(correlation_id: &str, context: &Context) -> Value {
    observability_metadata(correlation_id, context)
        .get(OBSERVABILITY_KEY)
        .cloned()
        .unwrap_or_else(|| Value::Object(JsonMap::new()))
}

pub fn transport_headers_from_metadata(metadata: &Value) -> BTreeMap<String, String> {
    let mut headers = BTreeMap::new();
    let Some(observability) = observability_object(metadata) else {
        return headers;
    };

    for key in [
        CORRELATION_HEADER,
        TRACEPARENT_HEADER,
        TRACESTATE_HEADER,
        BAGGAGE_HEADER,
    ] {
        if let Some(value) = observability.get(key).and_then(Value::as_str) {
            if let Some(sanitized) = sanitize_transport_value(key, value) {
                headers.insert(key.to_string(), sanitized);
            }
        }
    }
    headers
}

pub fn metadata_has_trace_context(metadata: &Value) -> bool {
    observability_object(metadata)
        .and_then(|observability| observability.get(TRACEPARENT_HEADER))
        .and_then(Value::as_str)
        .and_then(|value| sanitize_transport_value(TRACEPARENT_HEADER, value))
        .is_some()
}

pub fn kafka_headers_from_metadata(metadata: &Value) -> Vec<(String, Vec<u8>)> {
    transport_headers_from_metadata(metadata)
        .into_iter()
        .map(|(key, value)| (key, value.into_bytes()))
        .collect()
}

pub fn correlation_id_from_transport(headers: &BTreeMap<String, String>) -> Option<String> {
    headers
        .get(CORRELATION_HEADER)
        .and_then(|value| sanitize_transport_value(CORRELATION_HEADER, value))
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
    sanitize_transport_value(key, value)
}

pub fn sanitize_transport_value(key: &str, value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }

    match key {
        CORRELATION_HEADER => is_valid_correlation_id(trimmed).then(|| trimmed.to_string()),
        TRACEPARENT_HEADER => (trimmed.len() <= MAX_TRACEPARENT_LEN).then(|| trimmed.to_string()),
        TRACESTATE_HEADER => (trimmed.len() <= MAX_TRACESTATE_LEN).then(|| trimmed.to_string()),
        BAGGAGE_HEADER => (trimmed.len() <= MAX_BAGGAGE_LEN).then(|| trimmed.to_string()),
        _ => None,
    }
}

fn observability_object(metadata: &Value) -> Option<&JsonMap<String, Value>> {
    let object = metadata.as_object()?;
    if let Some(observability) = object.get(OBSERVABILITY_KEY).and_then(Value::as_object) {
        return Some(observability);
    }

    if object.contains_key(CORRELATION_HEADER)
        || object.contains_key(TRACEPARENT_HEADER)
        || object.contains_key(TRACESTATE_HEADER)
        || object.contains_key(BAGGAGE_HEADER)
    {
        return Some(object);
    }

    None
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

    #[test]
    fn observability_metadata_omits_missing_optional_keys() {
        let metadata = observability_metadata("corr-1", &Context::new());
        assert_eq!(
            metadata
                .get("observability")
                .and_then(Value::as_object)
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            metadata["observability"]["x-correlation-id"],
            Value::String("corr-1".to_string())
        );
    }

    #[test]
    fn oversized_baggage_is_dropped() {
        let mut metadata = JsonMap::new();
        metadata.insert(
            "observability".to_string(),
            Value::Object(JsonMap::from_iter([
                (
                    "x-correlation-id".to_string(),
                    Value::String("corr-1".to_string()),
                ),
                (
                    "baggage".to_string(),
                    Value::String("a".repeat(MAX_BAGGAGE_LEN + 1)),
                ),
            ])),
        );

        let headers = transport_headers_from_metadata(&Value::Object(metadata));
        assert_eq!(
            headers.get("x-correlation-id").map(String::as_str),
            Some("corr-1")
        );
        assert!(!headers.contains_key("baggage"));
    }

    #[test]
    fn oversized_trace_headers_are_dropped() {
        let headers = transport_headers_from_metadata(&serde_json::json!({
            "observability": {
                "x-correlation-id": "corr-1",
                "traceparent": "a".repeat(MAX_TRACEPARENT_LEN + 1),
                "tracestate": "b".repeat(MAX_TRACESTATE_LEN + 1)
            }
        }));

        assert_eq!(
            headers.get("x-correlation-id").map(String::as_str),
            Some("corr-1")
        );
        assert!(!headers.contains_key("traceparent"));
        assert!(!headers.contains_key("tracestate"));
    }

    #[test]
    fn transport_headers_accept_legacy_bare_observability_shape() {
        let headers = transport_headers_from_metadata(&serde_json::json!({
            "x-correlation-id": "corr-1",
            "traceparent": "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"
        }));

        assert_eq!(
            headers.get("x-correlation-id").map(String::as_str),
            Some("corr-1")
        );
        assert_eq!(
            headers.get("traceparent").map(String::as_str),
            Some("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01")
        );
    }
}
