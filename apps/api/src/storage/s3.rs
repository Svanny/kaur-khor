use super::{
    repository::{metadata_value, normalize_metadata_map},
    types::{ArtifactUploadSpec, HeadedObject, StoredArtifact},
};
use crate::config::ObjectStorageConfig;
use anyhow::{anyhow, Context, Result};
use async_trait::async_trait;
use aws_config::{timeout::TimeoutConfig, BehaviorVersion};
use aws_credential_types::{provider::SharedCredentialsProvider, Credentials};
use aws_sdk_s3::{config::Region, primitives::ByteStream, Client};
use sha2::Digest;
use std::{collections::HashMap, fs::File, io::Read, path::Path, sync::Arc};
use time::OffsetDateTime;

const META_SHA256: &str = "sha256";
const META_ARTIFACT_ROLE: &str = "artifact-role";
const META_ARTIFACT_VERSION: &str = "artifact-version";
const META_PRODUCER_SERVICE: &str = "producer-service";
const META_JOB_KEY: &str = "job-key";
const META_UPLOADED_AT: &str = "uploaded-at";

#[async_trait]
pub trait ObjectStorageClient: Send + Sync {
    async fn head_object(&self, bucket: &str, object_key: &str) -> Result<Option<HeadedObject>>;
    async fn put_file(
        &self,
        spec: &ArtifactUploadSpec,
        local_sha256: &str,
        content_length: i64,
        uploaded_at: OffsetDateTime,
    ) -> Result<()>;
    async fn put_file_and_verify(&self, spec: &ArtifactUploadSpec) -> Result<StoredArtifact>;
    fn artifact_uri(&self, bucket: &str, object_key: &str) -> String;
}

#[derive(Clone)]
pub struct S3ObjectStorageClient {
    client: Client,
    cfg: Arc<ObjectStorageConfig>,
}

impl S3ObjectStorageClient {
    pub async fn new(cfg: ObjectStorageConfig) -> Result<Self> {
        let creds = Credentials::new(
            cfg.access_key.clone(),
            cfg.secret_key.clone(),
            None,
            None,
            "banji-object-storage",
        );
        let timeout_config = TimeoutConfig::builder()
            .connect_timeout(cfg.connect_timeout)
            .operation_timeout(cfg.request_timeout)
            .build();
        let shared = aws_config::defaults(BehaviorVersion::latest())
            .region(Region::new(cfg.region.clone()))
            .credentials_provider(SharedCredentialsProvider::new(creds))
            .endpoint_url(cfg.endpoint.clone())
            .timeout_config(timeout_config)
            .load()
            .await;
        let client = Client::from_conf(
            aws_sdk_s3::config::Builder::from(&shared)
                .force_path_style(cfg.force_path_style)
                .build(),
        );
        Ok(Self {
            client,
            cfg: Arc::new(cfg),
        })
    }

    fn verify_head_matches(
        &self,
        head: &HeadedObject,
        expected_sha256: &str,
        expected_length: i64,
    ) -> Result<OffsetDateTime> {
        if head.content_length != expected_length {
            return Err(anyhow!(
                "non-retryable artifact contract violation: remote content length {} does not match expected {}",
                head.content_length,
                expected_length
            ));
        }
        let remote_sha256 = head.sha256.as_deref().ok_or_else(|| {
            anyhow!("non-retryable artifact contract violation: remote metadata sha256 missing")
        })?;
        if remote_sha256 != expected_sha256 {
            return Err(anyhow!(
                "non-retryable artifact contract violation: remote metadata sha256 does not match expected artifact checksum"
            ));
        }
        Ok(head.uploaded_at.unwrap_or_else(OffsetDateTime::now_utc))
    }

    fn fixed_metadata(
        &self,
        spec: &ArtifactUploadSpec,
        local_sha256: &str,
        uploaded_at: OffsetDateTime,
    ) -> HashMap<String, String> {
        let mut metadata = HashMap::from([
            (META_SHA256.to_string(), local_sha256.to_string()),
            (META_ARTIFACT_ROLE.to_string(), spec.artifact_role.clone()),
            (
                META_ARTIFACT_VERSION.to_string(),
                spec.artifact_version.to_string(),
            ),
            (
                META_PRODUCER_SERVICE.to_string(),
                spec.producer_service.clone(),
            ),
            (
                META_UPLOADED_AT.to_string(),
                uploaded_at.unix_timestamp().to_string(),
            ),
        ]);
        if let Some(job_key) = &spec.job_key {
            metadata.insert(META_JOB_KEY.to_string(), job_key.clone());
        }
        metadata
    }
}

#[async_trait]
impl ObjectStorageClient for S3ObjectStorageClient {
    async fn head_object(&self, bucket: &str, object_key: &str) -> Result<Option<HeadedObject>> {
        match self
            .client
            .head_object()
            .bucket(bucket)
            .key(object_key)
            .send()
            .await
        {
            Ok(output) => {
                let normalized = output
                    .metadata()
                    .map(normalize_metadata_map)
                    .unwrap_or_default();
                let uploaded_at = metadata_value(&normalized, META_UPLOADED_AT)
                    .and_then(|raw| raw.parse::<i64>().ok())
                    .and_then(|ts| OffsetDateTime::from_unix_timestamp(ts).ok());
                Ok(Some(HeadedObject {
                    bucket_name: bucket.to_string(),
                    object_key: object_key.to_string(),
                    content_length: output.content_length().unwrap_or_default(),
                    sha256: metadata_value(&normalized, META_SHA256).map(ToString::to_string),
                    etag: output.e_tag().map(ToString::to_string),
                    uploaded_at,
                    metadata: normalized,
                }))
            }
            Err(err) => {
                let message = err.to_string();
                if message.contains("NotFound")
                    || message.contains("NoSuchKey")
                    || message.contains("404")
                {
                    return Ok(None);
                }
                Err(anyhow!(err).context("head_object failed"))
            }
        }
    }

    async fn put_file(
        &self,
        spec: &ArtifactUploadSpec,
        local_sha256: &str,
        content_length: i64,
        uploaded_at: OffsetDateTime,
    ) -> Result<()> {
        let body = ByteStream::from_path(&spec.local_path)
            .await
            .with_context(|| {
                format!("failed to read artifact file {}", spec.local_path.display())
            })?;
        let metadata = self.fixed_metadata(spec, local_sha256, uploaded_at);

        let mut req = self
            .client
            .put_object()
            .bucket(&spec.bucket_name)
            .key(&spec.object_key)
            .content_type(&spec.content_type)
            .content_length(content_length)
            .body(body);

        for (key, value) in metadata {
            req = req.metadata(key, value);
        }

        req.send().await.context("put_object failed")?;
        Ok(())
    }

    async fn put_file_and_verify(&self, spec: &ArtifactUploadSpec) -> Result<StoredArtifact> {
        let (content_length, local_sha256) =
            compute_file_sha256_and_size(&spec.local_path, self.cfg.max_artifact_bytes)?;

        let (uploaded_at, reused_existing) = match self
            .head_object(&spec.bucket_name, &spec.object_key)
            .await?
        {
            Some(head) => (
                self.verify_head_matches(&head, &local_sha256, content_length)?,
                true,
            ),
            None => {
                let uploaded_at = OffsetDateTime::now_utc();
                self.put_file(spec, &local_sha256, content_length, uploaded_at)
                    .await?;
                let head = self
                    .head_object(&spec.bucket_name, &spec.object_key)
                    .await?
                    .ok_or_else(|| {
                        anyhow!("artifact upload verification failed: object missing after upload")
                    })?;
                (
                    self.verify_head_matches(&head, &local_sha256, content_length)?,
                    false,
                )
            }
        };

        let head = self
            .head_object(&spec.bucket_name, &spec.object_key)
            .await?
            .ok_or_else(|| {
                anyhow!("artifact verification failed: object missing after head lookup")
            })?;

        Ok(StoredArtifact {
            artifact_key: spec.artifact_key.clone(),
            storage_provider: "s3".to_string(),
            producer_service: spec.producer_service.clone(),
            producer_role: spec.producer_role.clone(),
            job_key: spec.job_key.clone(),
            job_type: spec.job_type.clone(),
            artifact_role: spec.artifact_role.clone(),
            artifact_version: spec.artifact_version,
            bucket_name: spec.bucket_name.clone(),
            object_key: spec.object_key.clone(),
            object_uri: self.artifact_uri(&spec.bucket_name, &spec.object_key),
            content_type: spec.content_type.clone(),
            content_length,
            sha256: local_sha256,
            etag: head.etag,
            metadata: spec.metadata.clone(),
            retention_until: spec.retention_until,
            uploaded_at,
            reused_existing,
        })
    }

    fn artifact_uri(&self, bucket: &str, object_key: &str) -> String {
        format!("s3://{bucket}/{object_key}")
    }
}

fn compute_file_sha256_and_size(path: &Path, max_bytes: u64) -> Result<(i64, String)> {
    let metadata = std::fs::metadata(path)
        .with_context(|| format!("failed to stat artifact file {}", path.display()))?;
    let len = metadata.len();
    if len > max_bytes {
        return Err(anyhow!(
            "non-retryable artifact contract violation: artifact exceeds OBJECT_STORAGE_MAX_ARTIFACT_BYTES"
        ));
    }

    let mut file = File::open(path)
        .with_context(|| format!("failed to open artifact file {}", path.display()))?;
    let mut hasher = sha2::Sha256::new();
    let mut buffer = [0u8; 8 * 1024];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }

    Ok((len as i64, format!("{:x}", hasher.finalize())))
}
