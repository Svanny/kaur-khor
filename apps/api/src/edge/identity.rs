use crate::{auth::AuthPrincipal, AppState};
use axum::{
    body::Body,
    extract::State,
    http::{Method, Request, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Extension,
};

pub const DEVICE_ID_HEADER: &str = "x-banji-device-id";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TrafficClass {
    Read,
    Write,
}

impl TrafficClass {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Read => "read",
            Self::Write => "write",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RequestIdentity {
    pub user_id: String,
    pub device_id: String,
    pub traffic_class: TrafficClass,
}

pub async fn identity_middleware(
    State(state): State<AppState>,
    Extension(principal): Extension<AuthPrincipal>,
    mut request: Request<Body>,
    next: Next,
) -> Response {
    if request.method() == Method::OPTIONS {
        return next.run(request).await;
    }

    let raw_device_id = match request
        .headers()
        .get(DEVICE_ID_HEADER)
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
    {
        Some(value) => value.to_string(),
        None => return validation_error(format!("{DEVICE_ID_HEADER} header is required")),
    };

    if let Err(err) = validate_device_id(&raw_device_id) {
        return validation_error(err.to_string());
    }

    let traffic_class = traffic_class_for_method(request.method());

    let user_id = if state.config.auth_enabled || state.config.env == "dev" {
        principal.sub
    } else {
        "anonymous".to_string()
    };

    request.extensions_mut().insert(RequestIdentity {
        user_id,
        device_id: raw_device_id,
        traffic_class,
    });

    next.run(request).await
}

pub fn validate_device_id(value: &str) -> anyhow::Result<()> {
    if !(8..=128).contains(&value.len()) {
        anyhow::bail!("{DEVICE_ID_HEADER} must be 8..128 characters");
    }
    if !value
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | ':'))
    {
        anyhow::bail!(
            "{DEVICE_ID_HEADER} must contain only ASCII alphanumeric characters, '-', '_', '.', ':'"
        );
    }
    Ok(())
}

pub fn traffic_class_for_method(method: &Method) -> TrafficClass {
    match *method {
        Method::POST | Method::PUT | Method::PATCH | Method::DELETE => TrafficClass::Write,
        _ => TrafficClass::Read,
    }
}

fn validation_error(message: String) -> Response {
    (
        StatusCode::BAD_REQUEST,
        axum::Json(serde_json::json!({
            "error_code":"REQUEST_VALIDATION_FAILED",
            "error": message
        })),
    )
        .into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn device_id_validation_accepts_expected_values() {
        assert!(validate_device_id("device-1234").is_ok());
        assert!(validate_device_id("dev.uuid:abc_DEF-123").is_ok());
    }

    #[test]
    fn device_id_validation_rejects_bad_values() {
        assert!(validate_device_id("short").is_err());
        assert!(validate_device_id("contains space").is_err());
    }

    #[test]
    fn traffic_class_uses_read_write_buckets() {
        assert_eq!(traffic_class_for_method(&Method::GET), TrafficClass::Read);
        assert_eq!(traffic_class_for_method(&Method::POST), TrafficClass::Write);
    }
}
