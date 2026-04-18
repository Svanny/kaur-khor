use anyhow::Result;
use serde_json::{json, Value};
use std::env;
use std::fs::{create_dir_all, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

fn truthy_env(name: &str) -> bool {
    env::var(name)
        .map(|value| matches!(value.to_lowercase().as_str(), "1" | "true" | "yes" | "on"))
        .unwrap_or(false)
}

pub fn enabled() -> bool {
    truthy_env("BANJI_BENCHMARK")
}

fn run_id() -> String {
    env::var("BANJI_BENCHMARK_RUN_ID").unwrap_or_else(|_| "core-local".to_string())
}

fn output_dir() -> PathBuf {
    env::var("BANJI_BENCHMARK_OUTPUT_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("bench-results").join(run_id()))
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

pub fn summarize_value(value: &Value) -> String {
    match value {
        Value::Null => "null".to_string(),
        Value::Bool(value) => format!("boolean({value})"),
        Value::Number(value) => format!("number({value})"),
        Value::String(value) => format!("string(len={})", value.len()),
        Value::Array(values) => format!("array(len={})", values.len()),
        Value::Object(values) => {
            let mut keys = values.keys().take(8).cloned().collect::<Vec<_>>();
            if values.len() > 8 {
                keys.push("...".to_string());
            }
            format!("object(keys={})", keys.join(","))
        }
    }
}

fn append_event(event: Value) {
    if !enabled() {
        return;
    }

    let directory = output_dir();
    if let Err(error) = create_dir_all(&directory) {
        eprintln!("[benchmark] failed to create output directory: {error}");
        return;
    }

    let path = directory.join("core-events.jsonl");
    let mut file = match OpenOptions::new().create(true).append(true).open(path) {
        Ok(file) => file,
        Err(error) => {
            eprintln!("[benchmark] failed to open event stream: {error}");
            return;
        }
    };

    if let Err(error) = writeln!(file, "{event}") {
        eprintln!("[benchmark] failed to write event: {error}");
    }
}

pub fn time_command<F>(command: &str, payload_summary: String, operation: F) -> Result<Option<Value>>
where
    F: FnOnce() -> Result<Option<Value>>,
{
    if !enabled() {
        return operation();
    }

    append_event(json!({
        "runId": run_id(),
        "ts": now_ms(),
        "layer": "core",
        "category": "core-command",
        "name": "core.command",
        "phase": "start",
        "command": command,
        "durationMs": null,
        "detail": {
            "payload": payload_summary,
        },
    }));

    let started_at = Instant::now();
    let result = operation();
    let duration_ms = started_at.elapsed().as_secs_f64() * 1000.0;

    match &result {
        Ok(payload) => append_event(json!({
            "runId": run_id(),
            "ts": now_ms(),
            "layer": "core",
            "category": "core-command",
            "name": "core.command",
            "phase": "end",
            "command": command,
            "durationMs": duration_ms,
            "detail": {
                "ok": true,
                "result": payload
                    .as_ref()
                    .map(summarize_value)
                    .unwrap_or_else(|| "undefined".to_string()),
            },
        })),
        Err(error) => append_event(json!({
            "runId": run_id(),
            "ts": now_ms(),
            "layer": "core",
            "category": "core-command",
            "name": "core.command",
            "phase": "end",
            "command": command,
            "durationMs": duration_ms,
            "detail": {
                "ok": false,
                "error": error.to_string(),
            },
        })),
    }

    result
}
