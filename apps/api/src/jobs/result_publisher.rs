use super::schema_types::JobResultRecord;
use crate::observability::propagation;
use anyhow::Result;
use serde_json::Value;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum JobResultPublishStatus {
    Disabled,
    Pending,
    Published,
    Failed,
}

impl JobResultPublishStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Disabled => "disabled",
            Self::Pending => "pending",
            Self::Published => "published",
            Self::Failed => "failed",
        }
    }
}

pub trait JobResultPublisher: Send + Sync {
    fn publish_status_for(&self, _result: &JobResultRecord) -> Result<JobResultPublishStatus>;
}

pub fn kafka_headers_for_metadata(metadata: &Value) -> Vec<(String, Vec<u8>)> {
    propagation::kafka_headers_from_metadata(metadata)
}

#[derive(Debug, Default)]
pub struct DisabledJobResultPublisher;

impl JobResultPublisher for DisabledJobResultPublisher {
    fn publish_status_for(&self, _result: &JobResultRecord) -> Result<JobResultPublishStatus> {
        Ok(JobResultPublishStatus::Disabled)
    }
}

#[cfg(test)]
mod tests {
    use super::kafka_headers_for_metadata;
    use serde_json::json;

    #[test]
    fn kafka_helper_omits_absent_optional_headers() {
        let headers = kafka_headers_for_metadata(&json!({
            "observability": {
                "x-correlation-id": "corr-1"
            }
        }));

        assert_eq!(headers.len(), 1);
        assert_eq!(headers[0].0, "x-correlation-id");
        assert_eq!(headers[0].1, b"corr-1");
    }
}
