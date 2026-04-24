use serde_json::{json, Value};
use std::env;
use std::fs::{create_dir_all, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

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

fn event_file_name() -> String {
    let role = env::var("BANJI_CORE_WORKER_ROLE").unwrap_or_else(|_| "core".to_string());
    let index = env::var("BANJI_CORE_WORKER_INDEX").unwrap_or_else(|_| "0".to_string());
    format!("core-events-{role}-{index}-{}.jsonl", std::process::id())
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
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

    let path = directory.join(event_file_name());
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

pub fn record_instant(name: &str, command: Option<&str>, detail: Value) {
    append_event(json!({
        "runId": run_id(),
        "ts": now_ms(),
        "layer": "core",
        "category": "core-command",
        "name": name,
        "phase": "instant",
        "command": command,
        "durationMs": null,
        "detail": detail,
    }));
}

pub fn record_duration(name: &str, command: Option<&str>, duration: Duration, detail: Value) {
    append_event(json!({
        "runId": run_id(),
        "ts": now_ms(),
        "layer": "core",
        "category": "core-command",
        "name": name,
        "phase": "end",
        "command": command,
        "durationMs": duration.as_secs_f64() * 1000.0,
        "detail": detail,
    }));
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::Mutex;

    static ENV_LOCK: Mutex<()> = Mutex::new(());

    fn temp_output_dir(name: &str) -> PathBuf {
        env::temp_dir().join(format!(
            "banji-sena-core-benchmark-{name}-{}",
            std::process::id()
        ))
    }

    fn reset_benchmark_env() {
        env::remove_var("BANJI_BENCHMARK");
        env::remove_var("BANJI_BENCHMARK_RUN_ID");
        env::remove_var("BANJI_BENCHMARK_OUTPUT_DIR");
        env::remove_var("BANJI_CORE_WORKER_ROLE");
        env::remove_var("BANJI_CORE_WORKER_INDEX");
    }

    #[test]
    fn record_duration_writes_core_event_when_benchmark_enabled() {
        let _guard = ENV_LOCK.lock().expect("env lock should acquire");
        reset_benchmark_env();
        let output = temp_output_dir("duration");
        let _ = fs::remove_dir_all(&output);
        env::set_var("BANJI_BENCHMARK", "1");
        env::set_var("BANJI_BENCHMARK_RUN_ID", "test-run");
        env::set_var("BANJI_BENCHMARK_OUTPUT_DIR", &output);
        env::set_var("BANJI_CORE_WORKER_ROLE", "read");
        env::set_var("BANJI_CORE_WORKER_INDEX", "3");

        record_duration(
            "core.test.duration",
            Some("sena.test"),
            Duration::from_millis(11),
            json!({ "ok": true }),
        );

        let entries = fs::read_dir(&output)
            .expect("event output directory should exist")
            .collect::<Result<Vec<_>, _>>()
            .expect("event files should be readable");
        assert_eq!(entries.len(), 1);
        let file_name = entries[0].file_name().to_string_lossy().to_string();
        assert!(file_name.starts_with("core-events-read-3-"));
        let raw = fs::read_to_string(entries[0].path()).expect("event stream should read");
        let event: Value = serde_json::from_str(raw.trim()).expect("event should be json");
        assert_eq!(event["runId"], "test-run");
        assert_eq!(event["name"], "core.test.duration");
        assert_eq!(event["command"], "sena.test");
        assert_eq!(event["durationMs"], 11.0);
        assert_eq!(event["detail"]["ok"], true);

        reset_benchmark_env();
        let _ = fs::remove_dir_all(&output);
    }

    #[test]
    fn record_instant_does_not_create_files_when_disabled() {
        let _guard = ENV_LOCK.lock().expect("env lock should acquire");
        reset_benchmark_env();
        let output = temp_output_dir("disabled");
        let _ = fs::remove_dir_all(&output);
        env::set_var("BANJI_BENCHMARK_OUTPUT_DIR", &output);

        record_instant("core.test.instant", None, json!({ "ok": true }));

        assert!(!output.exists());
        reset_benchmark_env();
    }
}
