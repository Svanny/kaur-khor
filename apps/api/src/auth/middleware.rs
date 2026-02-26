use super::JwtVerifier;
use crate::AppState;
use axum::{
    body::Body,
    extract::State,
    http::{header::AUTHORIZATION, Request, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};
use std::sync::Arc;

pub async fn auth_middleware(
    State(state): State<AppState>,
    mut request: Request<Body>,
    next: Next,
) -> Response {
    if !state.config.auth_enabled {
        let fallback = request
            .headers()
            .get("x-caller-id")
            .and_then(|v| v.to_str().ok())
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .unwrap_or("dev-anon")
            .to_string();
        request
            .extensions_mut()
            .insert(crate::auth::AuthPrincipal { sub: fallback });
        return next.run(request).await;
    }

    let Some(verifier) = state.jwt_verifier.as_ref() else {
        tracing::error!("auth enabled but JWT verifier missing from state");
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            axum::Json(serde_json::json!({
                "error_code":"AUTH_CONFIG_ERROR",
                "error":"authentication is not configured"
            })),
        )
            .into_response();
    };

    let token = match extract_bearer_token(request.headers()) {
        Ok(token) => token,
        Err((status, body)) => {
            return (status, axum::Json(body)).into_response();
        }
    };

    match verify(verifier, token).await {
        Ok(principal) => {
            request.extensions_mut().insert(principal);
            next.run(request).await
        }
        Err(err) => {
            tracing::warn!(error = %err, "JWT verification failed");
            (
                StatusCode::UNAUTHORIZED,
                axum::Json(serde_json::json!({
                    "error_code":"AUTH_UNAUTHORIZED",
                    "error":"invalid bearer token"
                })),
            )
                .into_response()
        }
    }
}

async fn verify(
    verifier: &Arc<JwtVerifier>,
    token: &str,
) -> anyhow::Result<crate::auth::AuthPrincipal> {
    verifier.verify_bearer(token).await
}

fn extract_bearer_token(
    headers: &axum::http::HeaderMap,
) -> Result<&str, (StatusCode, serde_json::Value)> {
    let Some(raw_auth) = headers
        .get(AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
    else {
        return Err((
            StatusCode::UNAUTHORIZED,
            serde_json::json!({
                "error_code":"AUTH_MISSING_BEARER",
                "error":"missing Authorization bearer token"
            }),
        ));
    };

    let Some(token) = raw_auth.strip_prefix("Bearer ") else {
        return Err((
            StatusCode::UNAUTHORIZED,
            serde_json::json!({
                "error_code":"AUTH_INVALID_BEARER",
                "error":"invalid Authorization header format"
            }),
        ));
    };

    let token = token.trim();
    if token.is_empty() {
        return Err((
            StatusCode::UNAUTHORIZED,
            serde_json::json!({
                "error_code":"AUTH_INVALID_BEARER",
                "error":"invalid Authorization header format"
            }),
        ));
    }

    Ok(token)
}
