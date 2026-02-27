use super::types::ArtifactIdentity;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use time::OffsetDateTime;

pub fn derive_artifact_key(identity: &ArtifactIdentity) -> anyhow::Result<String> {
    let canonical = canonical_artifact_identity_json(identity)?;
    Ok(hex_sha256(&canonical))
}

pub fn object_key_for_job_artifact(
    artifact_prefix: &str,
    created_at: OffsetDateTime,
    job_type: &str,
    job_key: &str,
    artifact_role: &str,
    artifact_version: i32,
    extension: &str,
) -> String {
    let extension = extension.trim_start_matches('.');
    let month: u8 = created_at.month().into();
    format!(
        "{}/{:04}/{:02}/{:02}/jobs/{}/{}/{}-v{}.{}",
        artifact_prefix.trim_matches('/'),
        created_at.year(),
        month,
        created_at.day(),
        job_type,
        job_key,
        artifact_role,
        artifact_version,
        extension
    )
}

pub fn hex_sha256(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

fn canonical_artifact_identity_json(identity: &ArtifactIdentity) -> anyhow::Result<Vec<u8>> {
    let mut canonical = BTreeMap::new();
    canonical.insert(
        "artifact_role".to_string(),
        serde_json::Value::String(identity.artifact_role.clone()),
    );
    canonical.insert(
        "artifact_version".to_string(),
        serde_json::Value::from(identity.artifact_version),
    );
    canonical.insert(
        "job_key".to_string(),
        serde_json::Value::String(identity.job_key.clone()),
    );
    canonical.insert(
        "job_type".to_string(),
        serde_json::Value::String(identity.job_type.clone()),
    );
    canonical.insert(
        "producer_role".to_string(),
        serde_json::Value::String(identity.producer_role.clone()),
    );
    canonical.insert(
        "producer_service".to_string(),
        serde_json::Value::String(identity.producer_service.clone()),
    );
    Ok(serde_json::to_vec(&canonical)?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use time::macros::datetime;

    #[test]
    fn artifact_key_is_stable_for_same_identity() {
        let identity = ArtifactIdentity {
            producer_service: "api".to_string(),
            producer_role: "worker".to_string(),
            job_type: "write-demo".to_string(),
            job_key: "job-123".to_string(),
            artifact_role: "report".to_string(),
            artifact_version: 1,
        };

        let first = derive_artifact_key(&identity).unwrap();
        let second = derive_artifact_key(&identity).unwrap();
        assert_eq!(first, second);
    }

    #[test]
    fn artifact_key_uses_explicit_canonical_field_order() {
        let identity = ArtifactIdentity {
            producer_service: "api".to_string(),
            producer_role: "worker".to_string(),
            job_type: "write-demo".to_string(),
            job_key: "job-123".to_string(),
            artifact_role: "report".to_string(),
            artifact_version: 1,
        };

        let canonical = canonical_artifact_identity_json(&identity).unwrap();
        assert_eq!(
            String::from_utf8(canonical).unwrap(),
            r#"{"artifact_role":"report","artifact_version":1,"job_key":"job-123","job_type":"write-demo","producer_role":"worker","producer_service":"api"}"#
        );
    }

    #[test]
    fn object_key_uses_created_at_date_path() {
        let created_at = datetime!(2026-02-27 14:05:06 UTC);
        let key = object_key_for_job_artifact(
            "worker",
            created_at,
            "write-demo",
            "job-123",
            "report",
            1,
            "json",
        );

        assert_eq!(
            key,
            "worker/2026/02/27/jobs/write-demo/job-123/report-v1.json"
        );
    }
}
