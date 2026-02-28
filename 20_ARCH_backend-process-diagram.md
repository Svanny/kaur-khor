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
│ shell smoke test for start.sh                                  │
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
│ Railway connected repo remains deployment source of truth      │
│                                                               │
│ Railpack reads railway.toml from repo root                     │
│ Build command compiles apps/api release binary                 │
│ Start command uses ./start.sh                                  │
│ start.sh maps PORT to API_BIND_ADDR for APP_ROLE=api           │
│ Compute migration checksum from apps/api/migrations            │
│ Build metadata is optional until CI release flow is re-enabled │
└───────────────────────────────────────────────────────────────┘
                              ↓
┌───────────────────────────────────────────────────────────────┐
│ deploy.yml job deploy-staging in environment staging           │
│                                                               │
│ Gate 1 config correctness                                      │
│ Railway repo-root config uses railpack + ./start.sh            │
│                                                               │
│ Gate 2 schema readiness                                        │
│ Run tool/ci/migrate_with_lock.sh against staging DB            │
│ Uses Postgres advisory lock plus sqlx migrate run               │
│                                                               │
│ Rollout                                                       │
│ Railway builds connected repo and starts via start.sh          │
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
│ Assert same repo revision as staging                           │
│ Run tool/ci/migrate_with_lock.sh against prod DB               │
│ Railway builds connected repo and starts via start.sh          │
│ Write GitHub step summary                                      │
└───────────────────────────────────────────────────────────────┘
                              ↓
┌───────────────────────────────────────────────────────────────┐
│ Production is running the same repo revision as staging        │
│ Database migrations were applied before rollout                │
└───────────────────────────────────────────────────────────────┘
