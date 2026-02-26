use anyhow::{anyhow, Context, Result};
use base64::Engine;
use rsa::signature::Verifier;
use rsa::{pkcs1v15, BigUint, RsaPublicKey};
use serde::Deserialize;
use std::{collections::HashMap, time::Duration};
use tokio::sync::RwLock;

#[derive(Clone, Debug)]
pub struct AuthPrincipal {
    pub sub: String,
}

#[derive(Clone)]
pub struct JwtVerifier {
    jwks_url: String,
    issuer: String,
    audience: String,
    cache_ttl: Duration,
    clock_skew: Duration,
    client: reqwest::Client,
    cache: std::sync::Arc<RwLock<Option<CachedJwks>>>,
}

#[derive(Clone)]
struct CachedJwks {
    fetched_at: tokio::time::Instant,
    keys: HashMap<String, RsaKeyParts>,
}

#[derive(Clone)]
struct RsaKeyParts {
    n: String,
    e: String,
}

#[derive(Debug, Deserialize)]
struct JwtHeader {
    alg: String,
    kid: Option<String>,
}

#[derive(Debug, Deserialize)]
struct JwtClaims {
    sub: String,
    iss: String,
    aud: serde_json::Value,
    exp: i64,
}

#[derive(Debug, Deserialize)]
struct JwksDocument {
    keys: Vec<Jwk>,
}

#[derive(Debug, Deserialize)]
struct Jwk {
    kid: Option<String>,
    kty: String,
    #[serde(rename = "use")]
    use_field: Option<String>,
    alg: Option<String>,
    n: Option<String>,
    e: Option<String>,
}

impl JwtVerifier {
    pub fn new(
        jwks_url: String,
        issuer: String,
        audience: String,
        cache_ttl: Duration,
        timeout: Duration,
        clock_skew: Duration,
    ) -> Result<Self> {
        let client = reqwest::Client::builder()
            .timeout(timeout)
            .build()
            .context("failed to build JWKS HTTP client")?;

        Ok(Self {
            jwks_url,
            issuer,
            audience,
            cache_ttl,
            clock_skew,
            client,
            cache: std::sync::Arc::new(RwLock::new(None)),
        })
    }

    pub async fn verify_bearer(&self, bearer_token: &str) -> Result<AuthPrincipal> {
        let (header_b64, payload_b64, signature_b64, signed_data) = split_jwt_parts(bearer_token)?;

        let header_json = decode_base64url(header_b64).context("invalid JWT header encoding")?;
        let header: JwtHeader =
            serde_json::from_slice(&header_json).context("invalid JWT header JSON")?;

        if header.alg != "RS256" {
            return Err(anyhow!("unsupported JWT algorithm; RS256 required"));
        }

        let kid = header
            .kid
            .as_deref()
            .filter(|v| !v.trim().is_empty())
            .ok_or_else(|| anyhow!("JWT kid is required"))?;

        let rsa_key = self.resolve_key(kid).await?;
        let signature_bytes =
            decode_base64url(signature_b64).context("invalid JWT signature encoding")?;
        let signature = pkcs1v15::Signature::try_from(signature_bytes.as_slice())
            .context("invalid JWT signature bytes")?;
        let verifying_key = pkcs1v15::VerifyingKey::<sha2::Sha256>::new(rsa_key);
        verifying_key
            .verify(signed_data.as_bytes(), &signature)
            .context("JWT signature verification failed")?;

        let payload_json = decode_base64url(payload_b64).context("invalid JWT payload encoding")?;
        let claims: JwtClaims =
            serde_json::from_slice(&payload_json).context("invalid JWT payload JSON")?;

        validate_claims(&claims, &self.issuer, &self.audience, self.clock_skew)?;
        Ok(AuthPrincipal { sub: claims.sub })
    }

    async fn resolve_key(&self, kid: &str) -> Result<RsaPublicKey> {
        let now = tokio::time::Instant::now();

        if let Some(parts) = self.cached_key_if_valid(kid, now).await {
            return parts.to_public_key();
        }

        match self.refresh_jwks().await {
            Ok(cached) => {
                let key = cached
                    .keys
                    .get(kid)
                    .ok_or_else(|| anyhow!("JWT kid not found in JWKS after refresh"))?;
                key.to_public_key()
            }
            Err(refresh_err) => {
                if let Some(parts) = self.cached_key_if_valid(kid, now).await {
                    tracing::warn!(
                        error = %refresh_err,
                        "JWKS refresh failed; using cached keyset within TTL"
                    );
                    return parts.to_public_key();
                }
                Err(refresh_err)
            }
        }
    }

    async fn cached_key_if_valid(
        &self,
        kid: &str,
        now: tokio::time::Instant,
    ) -> Option<RsaKeyParts> {
        let guard = self.cache.read().await;
        let cached = guard.as_ref()?;
        if now.duration_since(cached.fetched_at) > self.cache_ttl {
            return None;
        }
        cached.keys.get(kid).cloned()
    }

    async fn refresh_jwks(&self) -> Result<CachedJwks> {
        let response = self
            .client
            .get(&self.jwks_url)
            .send()
            .await
            .with_context(|| format!("failed to fetch JWKS from {}", self.jwks_url))?;

        if !response.status().is_success() {
            return Err(anyhow!(
                "JWKS fetch failed with status {}",
                response.status()
            ));
        }

        let parsed: JwksDocument = response
            .json()
            .await
            .context("failed to decode JWKS response JSON")?;

        let mut keys = HashMap::new();
        for jwk in parsed.keys {
            if jwk.kty != "RSA" {
                continue;
            }
            if let Some(use_field) = jwk.use_field.as_deref() {
                if use_field != "sig" {
                    continue;
                }
            }
            if let Some(alg) = jwk.alg.as_deref() {
                if alg != "RS256" {
                    continue;
                }
            }

            let Some(kid) = jwk.kid else {
                continue;
            };
            let Some(n) = jwk.n else {
                continue;
            };
            let Some(e) = jwk.e else {
                continue;
            };
            keys.insert(kid, RsaKeyParts { n, e });
        }

        if keys.is_empty() {
            return Err(anyhow!("JWKS contains no usable RS256 keys"));
        }

        let fresh = CachedJwks {
            fetched_at: tokio::time::Instant::now(),
            keys,
        };

        let mut guard = self.cache.write().await;
        *guard = Some(fresh.clone());
        Ok(fresh)
    }
}

impl RsaKeyParts {
    fn to_public_key(&self) -> Result<RsaPublicKey> {
        let n_bytes = decode_base64url(&self.n).context("invalid JWKS modulus n")?;
        let e_bytes = decode_base64url(&self.e).context("invalid JWKS exponent e")?;
        let n = BigUint::from_bytes_be(&n_bytes);
        let e = BigUint::from_bytes_be(&e_bytes);
        RsaPublicKey::new(n, e).context("invalid RSA public key components")
    }
}

fn split_jwt_parts(token: &str) -> Result<(&str, &str, &str, String)> {
    let mut parts = token.split('.');
    let Some(header) = parts.next() else {
        return Err(anyhow!("invalid JWT format"));
    };
    let Some(payload) = parts.next() else {
        return Err(anyhow!("invalid JWT format"));
    };
    let Some(signature) = parts.next() else {
        return Err(anyhow!("invalid JWT format"));
    };
    if parts.next().is_some() {
        return Err(anyhow!("invalid JWT format"));
    }
    Ok((header, payload, signature, format!("{header}.{payload}")))
}

fn decode_base64url(input: &str) -> Result<Vec<u8>> {
    base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(input.as_bytes())
        .context("base64url decode failed")
}

fn validate_claims(
    claims: &JwtClaims,
    issuer: &str,
    audience: &str,
    clock_skew: Duration,
) -> Result<()> {
    if claims.sub.trim().is_empty() {
        return Err(anyhow!("JWT sub must not be empty"));
    }
    if claims.iss != issuer {
        return Err(anyhow!("JWT issuer mismatch"));
    }
    if !audience_matches(&claims.aud, audience) {
        return Err(anyhow!("JWT audience mismatch"));
    }

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .context("system clock before unix epoch")?
        .as_secs() as i64;
    let skew = clock_skew.as_secs() as i64;
    if claims.exp <= (now - skew) {
        return Err(anyhow!("JWT expired"));
    }
    Ok(())
}

fn audience_matches(aud: &serde_json::Value, expected: &str) -> bool {
    match aud {
        serde_json::Value::String(v) => v == expected,
        serde_json::Value::Array(values) => values
            .iter()
            .any(|v| v.as_str().map(|s| s == expected).unwrap_or(false)),
        _ => false,
    }
}
