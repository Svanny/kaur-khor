┌───────────────────────────────────────────────────────────────┐
│ Developer edits backend                                       │
│ apps/api/src/*  apps/api/migrations/*  apps/api/sqlx-data.json │
└───────────────────────────────────────────────────────────────┘
                              ↓
┌───────────────────────────────────────────────────────────────┐
│ Pull request opened toward main                               │
└───────────────────────────────────────────────────────────────┘
                              ↓
┌───────────────────────────────────────────────────────────────┐
│ GitHub Actions runs .github/workflows/rust-ci.yml              │
│                                                               │
│ Quality gates                                                  │
│ cargo fmt check                                                │
│ cargo clippy as errors                                         │
│ cargo test                                                     │
│ cargo build release                                            │
│ docker build check for apps/api/Dockerfile                     │
│ sqlx migrate run on fresh CI Postgres                          │
│ sqlx offline verify via tool/ci/sqlx_offline_verify.sh         │
│ actionlint for workflow validity                               │
│ cargo audit non blocking                                       │
└───────────────────────────────────────────────────────────────┘
                              ↓
                     pass checks and review
                              ↓
┌───────────────────────────────────────────────────────────────┐
│ Merge pull request into main                                  │
└───────────────────────────────────────────────────────────────┘
                              ↓
┌───────────────────────────────────────────────────────────────┐
│ Push event lands on main                                      │
│ Triggers .github/workflows/release-build.yml                   │
└───────────────────────────────────────────────────────────────┘
                              ↓
┌───────────────────────────────────────────────────────────────┐
│ release-build.yml produces immutable artifact                  │
│                                                               │
│ Build image using apps/api/Dockerfile                          │
│ Push to GHCR with tags                                         │
│ Resolve digest and create pinned image reference               │
│ image_ref equals ghcr.io owner banji-api at sha256 digest      │
│ Compute migration checksum from apps/api/migrations            │
│ Write build-metadata.json and upload it as workflow artifact   │
│ Optional scan non blocking                                     │
└───────────────────────────────────────────────────────────────┘
                              ↓
┌───────────────────────────────────────────────────────────────┐
│ release-build.yml calls .github/workflows/deploy.yml           │
│ Inputs passed                                                  │
│ image_ref  image_digest  commit_sha  migration_checksum        │
└───────────────────────────────────────────────────────────────┘
                              ↓
┌───────────────────────────────────────────────────────────────┐
│ deploy.yml job deploy-staging in environment staging           │
│                                                               │
│ Gate 1 immutability                                            │
│ Assert image_ref is digest pinned                              │
│                                                               │
│ Gate 2 schema readiness                                        │
│ Run tool/ci/migrate_with_lock.sh against staging DB            │
│ Uses Postgres advisory lock plus sqlx migrate run               │
│                                                               │
│ Rollout                                                       │
│ Run tool/ci/railway_deploy.sh to Railway staging service       │
│ Write GitHub step summary                                      │
└───────────────────────────────────────────────────────────────┘
                              ↓
                     staging success required
                              ↓
┌───────────────────────────────────────────────────────────────┐
│ GitHub environment prod approval gate                          │
│ deploy-prod waits until an approver clicks approve             │
└───────────────────────────────────────────────────────────────┘
                              ↓
┌───────────────────────────────────────────────────────────────┐
│ deploy.yml job deploy-prod in environment prod                 │
│                                                               │
│ Assert same pinned image_ref as staging                        │
│ Run tool/ci/migrate_with_lock.sh against prod DB               │
│ Run tool/ci/railway_deploy.sh to Railway prod service          │
│ Write GitHub step summary                                      │
└───────────────────────────────────────────────────────────────┘
                              ↓
┌───────────────────────────────────────────────────────────────┐
│ Production is running the exact same image digest as staging   │
│ Database migrations were applied before rollout                │
└───────────────────────────────────────────────────────────────┘
