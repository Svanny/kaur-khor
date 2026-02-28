use super::repository;
use anyhow::{anyhow, Result};
use sha2::{Digest, Sha256};
use sqlx::{PgPool, Postgres, Transaction};
use time::OffsetDateTime;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct JobAlgorithmRolloutPolicy {
    pub job_type: String,
    pub stable_version: String,
    pub candidate_version: Option<String>,
    pub candidate_percent: i32,
    pub updated_by: String,
    pub notes: Option<String>,
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum JobAlgorithmDecisionSource {
    Stable,
    Candidate,
}

impl JobAlgorithmDecisionSource {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Stable => "stable",
            Self::Candidate => "candidate",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct JobAlgorithmDecision {
    pub algorithm_version: String,
    pub decision_source: JobAlgorithmDecisionSource,
    pub rollout_bucket: i32,
    pub policy_updated_at: OffsetDateTime,
    pub hash_salt_version: String,
    pub decided_at: OffsetDateTime,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RolloutResolver<'a> {
    hash_salt: &'a str,
    hash_salt_version: &'a str,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct JobAlgorithmRegistryEntry {
    job_type: &'static str,
    supported_versions: &'static [&'static str],
}

const ITEM_CREATED_ENTRY: JobAlgorithmRegistryEntry = JobAlgorithmRegistryEntry {
    job_type: "item-created",
    supported_versions: &["item-created-v1"],
};

const WRITE_DEMO_ENTRY: JobAlgorithmRegistryEntry = JobAlgorithmRegistryEntry {
    job_type: "write-demo",
    supported_versions: &["write-demo-v2", "write-demo-v3"],
};

const REGISTRY: &[JobAlgorithmRegistryEntry] = &[ITEM_CREATED_ENTRY, WRITE_DEMO_ENTRY];

impl<'a> RolloutResolver<'a> {
    pub fn new(hash_salt: &'a str, hash_salt_version: &'a str) -> Self {
        Self {
            hash_salt,
            hash_salt_version,
        }
    }

    pub fn decide(
        &self,
        job_type: &str,
        job_key: &str,
        policy: &JobAlgorithmRolloutPolicy,
    ) -> Result<JobAlgorithmDecision> {
        validate_policy(policy)?;

        let rollout_bucket = rollout_bucket(job_type, job_key, self.hash_salt);
        let use_candidate = policy
            .candidate_version
            .as_ref()
            .map(|candidate| !candidate.trim().is_empty())
            .unwrap_or(false)
            && policy.candidate_percent > 0
            && rollout_bucket < policy.candidate_percent;
        let decision_source = if use_candidate {
            JobAlgorithmDecisionSource::Candidate
        } else {
            JobAlgorithmDecisionSource::Stable
        };
        let algorithm_version = match decision_source {
            JobAlgorithmDecisionSource::Stable => policy.stable_version.clone(),
            JobAlgorithmDecisionSource::Candidate => policy
                .candidate_version
                .clone()
                .ok_or_else(|| {
                    anyhow!(
                        "unsupported_rollout_version: job_type={job_type} candidate version is missing"
                    )
                })?,
        };

        Ok(JobAlgorithmDecision {
            algorithm_version,
            decision_source,
            rollout_bucket,
            policy_updated_at: policy.updated_at,
            hash_salt_version: self.hash_salt_version.to_string(),
            decided_at: OffsetDateTime::now_utc(),
        })
    }
}

pub async fn worker_startup_preflight(pool: &PgPool) -> Result<()> {
    let policies = repository::load_job_algorithm_rollout_policies(pool).await?;
    validate_policy_inventory(&policies)
}

pub fn validate_policy_inventory(policies: &[JobAlgorithmRolloutPolicy]) -> Result<()> {
    for entry in REGISTRY {
        let Some(policy) = policies
            .iter()
            .find(|policy| policy.job_type == entry.job_type)
        else {
            return Err(anyhow!(
                "missing_rollout_policy: missing rollout policy for job_type={}",
                entry.job_type
            ));
        };
        validate_policy(policy)?;
    }

    Ok(())
}

pub async fn resolve_algorithm_decision_tx(
    tx: &mut Transaction<'_, Postgres>,
    worker_cfg: &crate::config::WorkerConfig,
    job_run: &repository::JobRunRow,
) -> Result<JobAlgorithmDecision> {
    if let Some(decision) = decision_from_job_run(job_run) {
        return Ok(decision);
    }

    let Some(policy) =
        repository::get_job_algorithm_rollout_policy_tx(tx, &job_run.job_type).await?
    else {
        return Err(anyhow!(
            "missing_rollout_policy: missing rollout policy for job_type={}",
            job_run.job_type
        ));
    };

    RolloutResolver::new(
        &worker_cfg.algorithm_rollout_hash_salt,
        &worker_cfg.algorithm_rollout_hash_salt_version,
    )
    .decide(&job_run.job_type, &job_run.job_key, &policy)
}

pub fn supported_versions(job_type: &str) -> Option<&'static [&'static str]> {
    registry_entry(job_type).map(|entry| entry.supported_versions)
}

pub fn validate_policy(policy: &JobAlgorithmRolloutPolicy) -> Result<()> {
    let Some(entry) = registry_entry(&policy.job_type) else {
        return Err(anyhow!(
            "unsupported_rollout_version: unknown rollout-enabled job_type={}",
            policy.job_type
        ));
    };

    validate_version(entry, &policy.stable_version, "stable")?;

    if policy.candidate_percent < 0 || policy.candidate_percent > 100 {
        return Err(anyhow!(
            "unsupported_rollout_version: job_type={} candidate_percent={} is outside 0..100",
            policy.job_type,
            policy.candidate_percent
        ));
    }

    match policy
        .candidate_version
        .as_ref()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
    {
        Some(candidate_version) => validate_version(entry, candidate_version, "candidate")?,
        None if policy.candidate_percent > 0 => {
            return Err(anyhow!(
                "unsupported_rollout_version: job_type={} candidate_percent={} requires candidate_version",
                policy.job_type,
                policy.candidate_percent
            ));
        }
        None => {}
    }

    Ok(())
}

fn validate_version(entry: JobAlgorithmRegistryEntry, version: &str, kind: &str) -> Result<()> {
    if entry
        .supported_versions
        .iter()
        .any(|candidate| candidate == &version)
    {
        return Ok(());
    }

    Err(anyhow!(
        "unsupported_rollout_version: job_type={} {}_version={} is not implemented",
        entry.job_type,
        kind,
        version
    ))
}

fn registry_entry(job_type: &str) -> Option<JobAlgorithmRegistryEntry> {
    REGISTRY
        .iter()
        .copied()
        .find(|entry| entry.job_type == job_type)
}

fn decision_from_job_run(job_run: &repository::JobRunRow) -> Option<JobAlgorithmDecision> {
    Some(JobAlgorithmDecision {
        algorithm_version: job_run.algorithm_version.clone()?,
        decision_source: match job_run.algorithm_decision_source.as_deref()? {
            "stable" => JobAlgorithmDecisionSource::Stable,
            "candidate" => JobAlgorithmDecisionSource::Candidate,
            _ => return None,
        },
        rollout_bucket: job_run.algorithm_rollout_bucket?,
        policy_updated_at: job_run.algorithm_policy_updated_at?,
        hash_salt_version: job_run.algorithm_hash_salt_version.clone()?,
        decided_at: job_run.algorithm_decided_at?,
    })
}

fn rollout_bucket(job_type: &str, job_key: &str, hash_salt: &str) -> i32 {
    let mut hasher = Sha256::new();
    hasher.update(job_type.as_bytes());
    hasher.update(b"|");
    hasher.update(job_key.as_bytes());
    hasher.update(b"|");
    hasher.update(hash_salt.as_bytes());
    let digest = hasher.finalize();

    let mut prefix = [0_u8; 8];
    prefix.copy_from_slice(&digest[..8]);
    (u64::from_be_bytes(prefix) % 100) as i32
}

#[cfg(test)]
mod tests {
    use super::*;

    fn policy(job_type: &str, stable_version: &str) -> JobAlgorithmRolloutPolicy {
        JobAlgorithmRolloutPolicy {
            job_type: job_type.to_string(),
            stable_version: stable_version.to_string(),
            candidate_version: None,
            candidate_percent: 0,
            updated_by: "test".to_string(),
            notes: None,
            updated_at: OffsetDateTime::UNIX_EPOCH,
        }
    }

    #[test]
    fn rollout_bucket_is_deterministic() {
        let first = rollout_bucket("write-demo", "job-123", "salt-a");
        let second = rollout_bucket("write-demo", "job-123", "salt-a");

        assert_eq!(first, second);
    }

    #[test]
    fn zero_percent_always_selects_stable() {
        let resolver = RolloutResolver::new("salt-a", "v1");
        let mut policy = policy("write-demo", "write-demo-v2");
        policy.candidate_version = Some("write-demo-v3".to_string());

        let decision = resolver.decide("write-demo", "job-123", &policy).unwrap();

        assert_eq!(decision.algorithm_version, "write-demo-v2");
        assert_eq!(decision.decision_source, JobAlgorithmDecisionSource::Stable);
    }

    #[test]
    fn hundred_percent_selects_candidate() {
        let resolver = RolloutResolver::new("salt-a", "v1");
        let mut policy = policy("write-demo", "write-demo-v2");
        policy.candidate_version = Some("write-demo-v3".to_string());
        policy.candidate_percent = 100;

        let decision = resolver.decide("write-demo", "job-123", &policy).unwrap();

        assert_eq!(decision.algorithm_version, "write-demo-v3");
        assert_eq!(
            decision.decision_source,
            JobAlgorithmDecisionSource::Candidate
        );
    }

    #[test]
    fn missing_candidate_falls_back_to_stable_when_percent_is_zero() {
        let resolver = RolloutResolver::new("salt-a", "v1");
        let policy = policy("item-created", "item-created-v1");

        let decision = resolver.decide("item-created", "job-123", &policy).unwrap();

        assert_eq!(decision.algorithm_version, "item-created-v1");
        assert_eq!(decision.decision_source, JobAlgorithmDecisionSource::Stable);
    }

    #[test]
    fn unsupported_version_is_rejected() {
        let mut policy = policy("write-demo", "write-demo-v9");
        policy.candidate_version = Some("write-demo-v3".to_string());

        let err = validate_policy(&policy).unwrap_err().to_string();

        assert!(err.contains("unsupported_rollout_version"));
        assert!(err.contains("stable_version=write-demo-v9"));
    }

    #[test]
    fn missing_policy_inventory_is_rejected() {
        let policies = vec![policy("write-demo", "write-demo-v2")];

        let err = validate_policy_inventory(&policies)
            .unwrap_err()
            .to_string();

        assert!(err.contains("missing_rollout_policy"));
        assert!(err.contains("item-created"));
    }
}
