use banji_api::config::AppConfig;
use std::sync::{Mutex, OnceLock};

fn env_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

#[test]
fn missing_cache_schema_version_fails_validation() {
    let _guard = env_lock().lock().unwrap();

    let old = std::env::var("CACHE_SCHEMA_VERSION").ok();
    std::env::remove_var("CACHE_SCHEMA_VERSION");

    let result = AppConfig::from_env();

    if let Some(v) = old {
        std::env::set_var("CACHE_SCHEMA_VERSION", v);
    }

    assert!(result.is_err());
}
