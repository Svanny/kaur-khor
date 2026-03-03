use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct VersionInfo {
    pub build_commit_sha: &'static str,
    pub deploy_commit_sha: String,
}

pub const fn build_commit_sha() -> &'static str {
    match option_env!("BANJI_BUILD_COMMIT_SHA") {
        Some(value) if !value.is_empty() => value,
        _ => "unknown",
    }
}

pub fn resolve_deploy_commit_sha(runtime_value: Option<String>) -> String {
    runtime_value
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| build_commit_sha().to_string())
}

pub fn deploy_commit_sha() -> String {
    resolve_deploy_commit_sha(std::env::var("DEPLOY_COMMIT_SHA").ok())
}

pub fn version_info() -> VersionInfo {
    VersionInfo {
        build_commit_sha: build_commit_sha(),
        deploy_commit_sha: deploy_commit_sha(),
    }
}

#[cfg(test)]
mod tests {
    use super::{build_commit_sha, resolve_deploy_commit_sha};

    #[test]
    fn falls_back_to_build_sha_when_runtime_sha_missing() {
        assert_eq!(resolve_deploy_commit_sha(None), build_commit_sha());
        assert_eq!(
            resolve_deploy_commit_sha(Some("   ".to_string())),
            build_commit_sha()
        );
    }

    #[test]
    fn prefers_runtime_sha_when_present() {
        assert_eq!(
            resolve_deploy_commit_sha(Some("abc123".to_string())),
            "abc123"
        );
    }
}
