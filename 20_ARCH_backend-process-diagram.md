# Backend Local Workflow Diagram

```text
┌────────────────────────────────────────────────────────────────┐
│ Edit backend code under apps/api, docs, config, and tool/     │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│ Run local shell checks                                         │
│ - bash tool/local/test_check_migration_versions.sh             │
│ - bash tool/local/test_migrate_with_lock.sh                    │
│ - bash tool/local/test_bootstrap_rabbit_topology.sh            │
│ - bash tool/local/test_start_sh.sh                             │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│ Validate database contracts                                    │
│ - bash tool/local/check_migration_versions.sh                  │
│ - DATABASE_URL=... bash tool/local/sqlx_offline_verify.sh      │
│ - DATABASE_MIGRATION_URL=... DATABASE_RUNTIME_URL=...          │
│   bash tool/local/migrate_with_lock.sh                         │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│ Start backend roles locally                                    │
│ - APP_ROLE=api cargo run --bin banji-api                       │
│ - APP_ROLE=event-relay cargo run --bin banji-api               │
│ - APP_ROLE=projection-consumer cargo run --bin banji-api       │
│ - APP_ROLE=worker cargo run --bin banji-api                    │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│ Run local operator tasks                                       │
│ - Rabbit topology bootstrap via tool/local/bootstrap_...       │
│ - restore drills via tool/db/restore_validate.sh               │
│ - replay and maintenance via tool/db/*                         │
└────────────────────────────────────────────────────────────────┘
```
