use serde::Serialize;
use serde_json::Value;
use std::{collections::BTreeMap, path::PathBuf};
use time::OffsetDateTime;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ArtifactIdentity {
    pub producer_service: String,
    pub producer_role: String,
    pub job_type: String,
    pub job_key: String,
    pub artifact_role: String,
    pub artifact_version: i32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ArtifactUploadSpec {
    pub artifact_key: String,
    pub bucket_name: String,
    pub object_key: String,
    pub content_type: String,
    pub artifact_role: String,
    pub artifact_version: i32,
    pub producer_service: String,
    pub producer_role: String,
    pub job_key: Option<String>,
    pub job_type: Option<String>,
    pub local_path: PathBuf,
    pub retention_until: Option<OffsetDateTime>,
    pub metadata: Value,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HeadedObject {
    pub bucket_name: String,
    pub object_key: String,
    pub content_length: i64,
    pub sha256: Option<String>,
    pub etag: Option<String>,
    pub uploaded_at: Option<OffsetDateTime>,
    pub metadata: BTreeMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StoredArtifact {
    pub artifact_key: String,
    pub storage_provider: String,
    pub producer_service: String,
    pub producer_role: String,
    pub job_key: Option<String>,
    pub job_type: Option<String>,
    pub artifact_role: String,
    pub artifact_version: i32,
    pub bucket_name: String,
    pub object_key: String,
    pub object_uri: String,
    pub content_type: String,
    pub content_length: i64,
    pub sha256: String,
    pub etag: Option<String>,
    pub metadata: Value,
    pub retention_until: Option<OffsetDateTime>,
    pub uploaded_at: OffsetDateTime,
    pub reused_existing: bool,
}
