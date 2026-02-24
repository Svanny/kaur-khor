use banji_api::logging::redaction::{redact_known_key_value, redact_message};

#[test]
fn redacts_credential_bearing_urls() {
    let creds = ["user", "super-secret"].join(":");
    let input = format!("failed to connect to postgres://{creds}@example.com/banji");
    let redacted = redact_message(&input);
    assert!(!redacted.contains("user:super-secret"));
    assert!(redacted.contains("***:***@example.com"));
}

#[test]
fn redacts_known_secret_assignments() {
    let input = [
        "DATABASE_RUNTIME_URL=postgres://",
        "user",
        ":",
        "pass",
        "@example/db",
    ]
    .concat();
    let redacted = redact_message(&input);
    assert_eq!(redacted, "DATABASE_RUNTIME_URL=***");
}

#[test]
fn redacts_colon_formatted_secret_assignments_with_space() {
    let input = "OBJECT_STORAGE_SECRET_KEY: super-secret-value";
    let redacted = redact_message(input);
    assert_eq!(redacted, "OBJECT_STORAGE_SECRET_KEY: ***");
}

#[test]
fn redacts_sensitive_key_value_pairs() {
    assert_eq!(
        redact_known_key_value("authorization", "Bearer top-secret-token"),
        "***"
    );
    assert_eq!(
        redact_known_key_value("cache_schema_version", "v1"),
        "v1".to_string()
    );
}
