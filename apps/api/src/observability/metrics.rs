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

static JOBS_RUN_TOTAL: Lazy<Counter<u64>> = Lazy::new(|| {
    METER
        .u64_counter("banji.jobs.run.total")
        .with_unit(Unit::new("events"))
        .init()
});

static JOBS_RESULT_WRITE_TOTAL: Lazy<Counter<u64>> = Lazy::new(|| {
    METER
        .u64_counter("banji.jobs.result.write.total")
        .with_unit(Unit::new("events"))
        .init()
});

static JOBS_RESULT_PUBLISH_TOTAL: Lazy<Counter<u64>> = Lazy::new(|| {
    METER
        .u64_counter("banji.jobs.result.publish.total")
        .with_unit(Unit::new("events"))
        .init()
});

static JOBS_DUPLICATE_DETECTED_TOTAL: Lazy<Counter<u64>> = Lazy::new(|| {
    METER
        .u64_counter("banji.jobs.duplicate_detected.total")
        .with_unit(Unit::new("events"))
        .init()
});

static JOBS_LEASE_STEAL_TOTAL: Lazy<Counter<u64>> = Lazy::new(|| {
    METER
        .u64_counter("banji.jobs.lease_steal.total")
        .with_unit(Unit::new("events"))
        .init()
});

static JOBS_LAST_ERROR_TOTAL: Lazy<Counter<u64>> = Lazy::new(|| {
    METER
        .u64_counter("banji.jobs.run.last_error.total")
        .with_unit(Unit::new("events"))
        .init()
});

static OBJECT_STORAGE_UPLOAD_TOTAL: Lazy<Counter<u64>> = Lazy::new(|| {
    METER
        .u64_counter("banji.object_storage.upload.total")
        .with_unit(Unit::new("events"))
        .init()
});

static OBJECT_STORAGE_UPLOAD_DURATION: Lazy<Histogram<f64>> = Lazy::new(|| {
    METER
        .f64_histogram("banji.object_storage.upload.duration")
        .with_unit(Unit::new("s"))
        .init()
});

static OBJECT_STORAGE_UPLOAD_BYTES: Lazy<Counter<u64>> = Lazy::new(|| {
    METER
        .u64_counter("banji.object_storage.upload.bytes")
        .with_unit(Unit::new("By"))
        .init()
});

static OBJECT_STORAGE_VERIFY_TOTAL: Lazy<Counter<u64>> = Lazy::new(|| {
    METER
        .u64_counter("banji.object_storage.verify.total")
        .with_unit(Unit::new("events"))
        .init()
});

static OBJECT_STORAGE_ERROR_TOTAL: Lazy<Counter<u64>> = Lazy::new(|| {
    METER
        .u64_counter("banji.object_storage.error.total")
        .with_unit(Unit::new("events"))
        .init()
});

static OBJECT_STORAGE_TEMP_CLEANUP_TOTAL: Lazy<Counter<u64>> = Lazy::new(|| {
    METER
        .u64_counter("banji.object_storage.temp_cleanup.total")
        .with_unit(Unit::new("events"))
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

static EVENT_OUTBOX_PUBLISH_TOTAL: Lazy<Counter<u64>> = Lazy::new(|| {
    METER
        .u64_counter("banji.events.outbox.publish.total")
        .with_unit(Unit::new("events"))
        .init()
});

static EVENT_OUTBOX_PENDING: Lazy<UpDownCounter<i64>> = Lazy::new(|| {
    METER
        .i64_up_down_counter("banji.events.outbox.pending")
        .with_unit(Unit::new("events"))
        .init()
});

static EVENT_OUTBOX_OLDEST_AGE: Lazy<UpDownCounter<i64>> = Lazy::new(|| {
    METER
        .i64_up_down_counter("banji.events.outbox.oldest_age")
        .with_unit(Unit::new("s"))
        .init()
});

static EVENT_CONSUMER_LAG: Lazy<UpDownCounter<i64>> = Lazy::new(|| {
    METER
        .i64_up_down_counter("banji.events.consumer.lag")
        .with_unit(Unit::new("events"))
        .init()
});

static DB_POOL_ACQUIRE_FAILURES: Lazy<Counter<u64>> = Lazy::new(|| {
    METER
        .u64_counter("banji.db.pool.acquire.failures.total")
        .with_unit(Unit::new("events"))
        .init()
});

static DB_POOL_ACQUIRE_WAIT: Lazy<Histogram<f64>> = Lazy::new(|| {
    METER
        .f64_histogram("banji.db.pool.acquire.wait.duration")
        .with_unit(Unit::new("s"))
        .init()
});

static DB_POOL_SIZE: Lazy<UpDownCounter<i64>> = Lazy::new(|| {
    METER
        .i64_up_down_counter("banji.db.pool.size")
        .with_unit(Unit::new("connections"))
        .init()
});

static DB_POOL_IDLE: Lazy<UpDownCounter<i64>> = Lazy::new(|| {
    METER
        .i64_up_down_counter("banji.db.pool.idle")
        .with_unit(Unit::new("connections"))
        .init()
});

static RATE_LIMIT_REJECT_TOTAL: Lazy<Counter<u64>> = Lazy::new(|| {
    METER
        .u64_counter("banji.edge.rate_limit.reject.total")
        .with_unit(Unit::new("events"))
        .init()
});

static RATE_LIMIT_FALLBACK_TOTAL: Lazy<Counter<u64>> = Lazy::new(|| {
    METER
        .u64_counter("banji.edge.rate_limit.fallback.total")
        .with_unit(Unit::new("events"))
        .init()
});

static BACKPRESSURE_REJECT_TOTAL: Lazy<Counter<u64>> = Lazy::new(|| {
    METER
        .u64_counter("banji.edge.backpressure.reject.total")
        .with_unit(Unit::new("events"))
        .init()
});

static BACKPRESSURE_STALE_SNAPSHOT_TOTAL: Lazy<Counter<u64>> = Lazy::new(|| {
    METER
        .u64_counter("banji.edge.backpressure.stale_snapshot.total")
        .with_unit(Unit::new("events"))
        .init()
});

static BACKPRESSURE_PENDING: Lazy<UpDownCounter<i64>> = Lazy::new(|| {
    METER
        .i64_up_down_counter("banji.edge.backpressure.pending")
        .with_unit(Unit::new("events"))
        .init()
});

static BACKPRESSURE_OLDEST_AGE: Lazy<UpDownCounter<i64>> = Lazy::new(|| {
    METER
        .i64_up_down_counter("banji.edge.backpressure.oldest_age")
        .with_unit(Unit::new("s"))
        .init()
});

static OUTBOX_PENDING_LAST: AtomicI64 = AtomicI64::new(0);
static EVENT_OUTBOX_PENDING_LAST: AtomicI64 = AtomicI64::new(0);
static EVENT_OUTBOX_OLDEST_AGE_LAST: AtomicI64 = AtomicI64::new(0);
static LAG_BY_STREAM: Lazy<Mutex<HashMap<String, i64>>> = Lazy::new(|| Mutex::new(HashMap::new()));
static DB_POOL_SIZE_LAST: AtomicI64 = AtomicI64::new(0);
static DB_POOL_IDLE_LAST: AtomicI64 = AtomicI64::new(0);
static BACKPRESSURE_PENDING_BY_SIGNAL: Lazy<Mutex<HashMap<String, i64>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));
static BACKPRESSURE_AGE_BY_SIGNAL: Lazy<Mutex<HashMap<String, i64>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

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

pub fn record_job_run_total(workload_class: &str, job_type: &str, result: &str) {
    JOBS_RUN_TOTAL.add(
        1,
        &[
            KeyValue::new("workload_class", workload_class.to_string()),
            KeyValue::new("job_type", job_type.to_string()),
            KeyValue::new("result", result.to_string()),
        ],
    );
}

pub fn record_job_result_write(job_type: &str, publish_status: &str) {
    JOBS_RESULT_WRITE_TOTAL.add(
        1,
        &[
            KeyValue::new("job_type", job_type.to_string()),
            KeyValue::new("publish_status", publish_status.to_string()),
        ],
    );
}

pub fn record_job_result_publish(job_type: &str, publish_status: &str) {
    JOBS_RESULT_PUBLISH_TOTAL.add(
        1,
        &[
            KeyValue::new("job_type", job_type.to_string()),
            KeyValue::new("publish_status", publish_status.to_string()),
        ],
    );
}

pub fn record_job_duplicate_detected(job_type: &str, reason: &str) {
    JOBS_DUPLICATE_DETECTED_TOTAL.add(
        1,
        &[
            KeyValue::new("job_type", job_type.to_string()),
            KeyValue::new("reason", reason.to_string()),
        ],
    );
}

pub fn record_job_lease_steal(job_type: &str) {
    JOBS_LEASE_STEAL_TOTAL.add(1, &[KeyValue::new("job_type", job_type.to_string())]);
}

pub fn record_job_last_error(job_type: &str, error_reason: &str) {
    JOBS_LAST_ERROR_TOTAL.add(
        1,
        &[
            KeyValue::new("job_type", job_type.to_string()),
            KeyValue::new("error_reason", error_reason.to_string()),
        ],
    );
}

pub fn record_object_storage_upload_total(job_type: &str, artifact_role: &str, result: &str) {
    OBJECT_STORAGE_UPLOAD_TOTAL.add(
        1,
        &[
            KeyValue::new("job_type", job_type.to_string()),
            KeyValue::new("artifact_role", artifact_role.to_string()),
            KeyValue::new("result", result.to_string()),
        ],
    );
}

pub fn record_object_storage_upload_duration(
    job_type: &str,
    artifact_role: &str,
    result: &str,
    seconds: f64,
) {
    OBJECT_STORAGE_UPLOAD_DURATION.record(
        seconds,
        &[
            KeyValue::new("job_type", job_type.to_string()),
            KeyValue::new("artifact_role", artifact_role.to_string()),
            KeyValue::new("result", result.to_string()),
        ],
    );
}

pub fn record_object_storage_upload_bytes(job_type: &str, artifact_role: &str, bytes: i64) {
    if bytes < 0 {
        return;
    }
    OBJECT_STORAGE_UPLOAD_BYTES.add(
        bytes as u64,
        &[
            KeyValue::new("job_type", job_type.to_string()),
            KeyValue::new("artifact_role", artifact_role.to_string()),
        ],
    );
}

pub fn record_object_storage_verify(job_type: &str, artifact_role: &str, result: &str) {
    OBJECT_STORAGE_VERIFY_TOTAL.add(
        1,
        &[
            KeyValue::new("job_type", job_type.to_string()),
            KeyValue::new("artifact_role", artifact_role.to_string()),
            KeyValue::new("result", result.to_string()),
        ],
    );
}

pub fn record_object_storage_error(job_type: &str, artifact_role: &str, error_reason: &str) {
    OBJECT_STORAGE_ERROR_TOTAL.add(
        1,
        &[
            KeyValue::new("job_type", job_type.to_string()),
            KeyValue::new("artifact_role", artifact_role.to_string()),
            KeyValue::new("error_reason", error_reason.to_string()),
        ],
    );
}

pub fn record_object_storage_temp_cleanup(job_type: &str, result: &str) {
    OBJECT_STORAGE_TEMP_CLEANUP_TOTAL.add(
        1,
        &[
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

pub fn record_event_outbox_publish(result: &str, count: u64) {
    if count == 0 {
        return;
    }
    EVENT_OUTBOX_PUBLISH_TOTAL.add(count, &[KeyValue::new("result", result.to_string())]);
}

pub fn set_event_outbox_pending(current_pending: i64) {
    let previous = EVENT_OUTBOX_PENDING_LAST.swap(current_pending, Ordering::SeqCst);
    let delta = current_pending - previous;
    if delta != 0 {
        EVENT_OUTBOX_PENDING.add(delta, &[]);
    }
}

pub fn set_event_outbox_oldest_age(current_age_seconds: i64) {
    let previous = EVENT_OUTBOX_OLDEST_AGE_LAST.swap(current_age_seconds, Ordering::SeqCst);
    let delta = current_age_seconds - previous;
    if delta != 0 {
        EVENT_OUTBOX_OLDEST_AGE.add(delta, &[]);
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

pub fn record_db_pool_acquire_wait(seconds: f64) {
    DB_POOL_ACQUIRE_WAIT.record(seconds, &[]);
}

pub fn record_db_pool_acquire_failure(reason: &str) {
    DB_POOL_ACQUIRE_FAILURES.add(1, &[KeyValue::new("reason", reason.to_string())]);
}

pub fn set_db_pool_size(current_size: i64) {
    let previous = DB_POOL_SIZE_LAST.swap(current_size, Ordering::SeqCst);
    let delta = current_size - previous;
    if delta != 0 {
        DB_POOL_SIZE.add(delta, &[]);
    }
}

pub fn set_db_pool_idle(current_idle: i64) {
    let previous = DB_POOL_IDLE_LAST.swap(current_idle, Ordering::SeqCst);
    let delta = current_idle - previous;
    if delta != 0 {
        DB_POOL_IDLE.add(delta, &[]);
    }
}

pub fn record_rate_limit_reject(scope: &str, mode: &str) {
    RATE_LIMIT_REJECT_TOTAL.add(
        1,
        &[
            KeyValue::new("scope", scope.to_string()),
            KeyValue::new("mode", mode.to_string()),
        ],
    );
}

pub fn record_rate_limit_fallback_activation(reason: &str) {
    RATE_LIMIT_FALLBACK_TOTAL.add(1, &[KeyValue::new("reason", reason.to_string())]);
}

pub fn record_backpressure_reject(signal: &str) {
    BACKPRESSURE_REJECT_TOTAL.add(1, &[KeyValue::new("signal", signal.to_string())]);
}

pub fn record_backpressure_stale_snapshot() {
    BACKPRESSURE_STALE_SNAPSHOT_TOTAL.add(1, &[]);
}

pub fn set_backpressure_signal(signal: &str, current_pending: i64, current_oldest_age: i64) {
    if let Ok(mut pending_map) = BACKPRESSURE_PENDING_BY_SIGNAL.lock() {
        let previous = pending_map.insert(signal.to_string(), current_pending).unwrap_or(0);
        let delta = current_pending - previous;
        if delta != 0 {
            BACKPRESSURE_PENDING.add(delta, &[KeyValue::new("signal", signal.to_string())]);
        }
    }

    if let Ok(mut age_map) = BACKPRESSURE_AGE_BY_SIGNAL.lock() {
        let previous = age_map
            .insert(signal.to_string(), current_oldest_age)
            .unwrap_or(0);
        let delta = current_oldest_age - previous;
        if delta != 0 {
            BACKPRESSURE_OLDEST_AGE.add(delta, &[KeyValue::new("signal", signal.to_string())]);
        }
    }
}
