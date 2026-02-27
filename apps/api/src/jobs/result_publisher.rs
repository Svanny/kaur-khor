use super::schema_types::JobResultRecord;
use anyhow::Result;

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

#[derive(Debug, Default)]
pub struct DisabledJobResultPublisher;

impl JobResultPublisher for DisabledJobResultPublisher {
    fn publish_status_for(&self, _result: &JobResultRecord) -> Result<JobResultPublishStatus> {
        Ok(JobResultPublishStatus::Disabled)
    }
}
