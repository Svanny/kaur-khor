fn main() {
    let commit_sha = std::env::var("DEPLOY_COMMIT_SHA")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "unknown".to_string());

    println!("cargo:rerun-if-env-changed=DEPLOY_COMMIT_SHA");
    println!("cargo:rustc-env=BANJI_BUILD_COMMIT_SHA={commit_sha}");
}
