use once_cell::sync::Lazy;
use opentelemetry::{
    global,
    metrics::{Counter, Histogram, Unit, UpDownCounter},
    KeyValue,
};
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicI64, Ordering},
        Mutex,
    },
};

static METER: Lazy<opentelemetry::metrics::Meter> = Lazy::new(|| global::meter("banji-api"));

static HTTP_REQUEST_DURATION: Lazy<Histogram<f64>> = Lazy::new(|| {
    METER
        .f64_histogram("http.server.request.duration")
        .with_unit(Unit::new("s"))
        .init()
});

static HTTP_ACTIVE_REQUESTS: Lazy<UpDownCounter<i64>> = Lazy::new(|| {
    METER
        .i64_up_down_counter("http.server.active_requests")
        .with_unit(Unit::new("requests"))
        .init()
});

static JOBS_PUBLISH_TOTAL: Lazy<Counter<u64>> = Lazy::new(|| {
    METER
        .u64_counter("banji.jobs.publish.total")
        .with_unit(Unit::new("events"))
        .init()
});

static JOBS_RETRY_TOTAL: Lazy<Counter<u64>> = Lazy::new(|| {
    METER
        .u64_counter("banji.jobs.retry.total")
        .with_unit(Unit::new("events"))
        .init()
});

static JOBS_DLQ_TOTAL: Lazy<Counter<u64>> = Lazy::new(|| {
    METER
        .u64_counter("banji.jobs.dlq.total")
        .with_unit(Unit::new("events"))
        .init()
});

static JOBS_RUN_DURATION: Lazy<Histogram<f64>> = Lazy::new(|| {
    METER
        .f64_histogram("banji.jobs.run.duration")
        .with_unit(Unit::new("s"))
        .init()
});

static EVENT_CONSUMER_ERRORS_TOTAL: Lazy<Counter<u64>> = Lazy::new(|| {
    METER
        .u64_counter("banji.events.consumer.errors.total")
        .with_unit(Unit::new("events"))
        .init()
});

static EVENT_CONSUMER_BATCH_SIZE: Lazy<Histogram<f64>> = Lazy::new(|| {
    METER
        .f64_histogram("banji.events.consumer.batch.size")
        .with_unit(Unit::new("events"))
        .init()
});

static OUTBOX_PENDING: Lazy<UpDownCounter<i64>> = Lazy::new(|| {
    METER
        .i64_up_down_counter("banji.jobs.outbox.pending")
        .with_unit(Unit::new("events"))
        .init()
});

static EVENT_CONSUMER_LAG: Lazy<UpDownCounter<i64>> = Lazy::new(|| {
    METER
        .i64_up_down_counter("banji.events.consumer.lag")
        .with_unit(Unit::new("events"))
        .init()
});

static OUTBOX_PENDING_LAST: AtomicI64 = AtomicI64::new(0);
static LAG_BY_STREAM: Lazy<Mutex<HashMap<String, i64>>> = Lazy::new(|| Mutex::new(HashMap::new()));

pub fn record_http_active(delta: i64, method: &str, route: &str) {
    HTTP_ACTIVE_REQUESTS.add(
        delta,
        &[
            KeyValue::new("http.method", method.to_string()),
            KeyValue::new("http.route", route.to_string()),
        ],
    );
}

pub fn record_http_duration(duration_secs: f64, method: &str, route: &str, status_code: i64) {
    HTTP_REQUEST_DURATION.record(
        duration_secs,
        &[
            KeyValue::new("http.method", method.to_string()),
            KeyValue::new("http.route", route.to_string()),
            KeyValue::new("http.response.status_code", status_code),
        ],
    );
}

pub fn record_job_publish(workload_class: &str, result: &str) {
    JOBS_PUBLISH_TOTAL.add(
        1,
        &[
            KeyValue::new("workload_class", workload_class.to_string()),
            KeyValue::new("result", result.to_string()),
        ],
    );
}

pub fn record_job_retry(workload_class: &str, tier: u8) {
    JOBS_RETRY_TOTAL.add(
        1,
        &[
            KeyValue::new("workload_class", workload_class.to_string()),
            KeyValue::new("tier", tier as i64),
        ],
    );
}

pub fn record_job_dlq(workload_class: &str) {
    JOBS_DLQ_TOTAL.add(
        1,
        &[KeyValue::new("workload_class", workload_class.to_string())],
    );
}

pub fn record_job_run_duration(workload_class: &str, job_type: &str, result: &str, seconds: f64) {
    JOBS_RUN_DURATION.record(
        seconds,
        &[
            KeyValue::new("workload_class", workload_class.to_string()),
            KeyValue::new("job_type", job_type.to_string()),
            KeyValue::new("result", result.to_string()),
        ],
    );
}

pub fn set_outbox_pending(current_pending: i64) {
    let previous = OUTBOX_PENDING_LAST.swap(current_pending, Ordering::SeqCst);
    let delta = current_pending - previous;
    if delta != 0 {
        OUTBOX_PENDING.add(delta, &[]);
    }
}

pub fn record_event_consumer_error(consumer_name: &str, stream_name: &str) {
    EVENT_CONSUMER_ERRORS_TOTAL.add(
        1,
        &[
            KeyValue::new("consumer_name", consumer_name.to_string()),
            KeyValue::new("stream_name", stream_name.to_string()),
        ],
    );
}

pub fn record_event_consumer_batch_size(stream_name: &str, batch_size: usize) {
    EVENT_CONSUMER_BATCH_SIZE.record(
        batch_size as f64,
        &[KeyValue::new("stream_name", stream_name.to_string())],
    );
}

pub fn set_event_consumer_lag(stream_name: &str, current_lag: i64) {
    let mut lag_map = match LAG_BY_STREAM.lock() {
        Ok(map) => map,
        Err(_) => return,
    };
    let previous = lag_map
        .insert(stream_name.to_string(), current_lag)
        .unwrap_or(0);
    let delta = current_lag - previous;
    if delta != 0 {
        EVENT_CONSUMER_LAG.add(
            delta,
            &[KeyValue::new("stream_name", stream_name.to_string())],
        );
    }
}
