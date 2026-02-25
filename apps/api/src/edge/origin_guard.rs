use crate::{edge::OriginGuardOutcome, AppState};
use axum::{
    body::Body,
    extract::State,
    http::{HeaderName, Request, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};

pub async fn origin_guard_middleware(
    State(state): State<AppState>,
    mut request: Request<Body>,
    next: Next,
) -> Response {
    let mut passed = false;

    if state.config.edge_enforcement_enabled {
        let header_name =
            match HeaderName::from_bytes(state.config.edge_origin_auth_header_name.as_bytes()) {
                Ok(name) => name,
                Err(_) => {
                    tracing::error!(
                        header = %state.config.edge_origin_auth_header_name,
                        "invalid edge origin auth header configuration"
                    );
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "edge configuration error",
                    )
                        .into_response();
                }
            };

        let provided = request
            .headers()
            .get(header_name)
            .and_then(|value| value.to_str().ok())
            .unwrap_or_default();

        if !matches_secret(
            provided,
            state.config.edge_origin_auth_secret.as_deref(),
            state.config.edge_origin_auth_secret_next.as_deref(),
        ) {
            return (StatusCode::FORBIDDEN, "edge origin authorization failed").into_response();
        }

        if let Some(proto) = request
            .headers()
            .get("x-forwarded-proto")
            .and_then(|value| value.to_str().ok())
        {
            if proto.eq_ignore_ascii_case("http") {
                tracing::error!("received guarded traffic with x-forwarded-proto=http");
                return (StatusCode::BAD_REQUEST, "origin TLS misconfiguration").into_response();
            }
        }

        passed = true;
    }

    request
        .extensions_mut()
        .insert(OriginGuardOutcome { passed });

    next.run(request).await
}

fn matches_secret(provided: &str, current: Option<&str>, next: Option<&str>) -> bool {
    if let Some(current_secret) = current {
        if provided == current_secret {
            return true;
        }
    }

    if let Some(next_secret) = next {
        if provided == next_secret {
            return true;
        }
    }

    false
}

#[cfg(test)]
mod tests {
    use super::matches_secret;

    #[test]
    fn secret_rotation_accepts_current_and_next() {
        assert!(matches_secret("curr", Some("curr"), Some("next")));
        assert!(matches_secret("next", Some("curr"), Some("next")));
        assert!(!matches_secret("wrong", Some("curr"), Some("next")));
    }
}
