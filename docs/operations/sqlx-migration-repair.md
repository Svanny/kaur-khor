# SQLx Migration Repair

## Scope
Use this runbook when `staging` or `prod` has already applied a migration version that was later renumbered in git, and `sqlx migrate run` fails with:

`migration <n> was previously applied but has been modified`

This runbook covers the traced staging repair for the `0016 -> 0018` metadata migration renumbering.

## Preconditions
- Environment: `staging` or `prod`.
- Take a database snapshot or backup before touching `public._sqlx_migrations`.
- Use the current repository `main` as the migration authority.
- Do not rename migrations again while repairing the environment.

## Relevant Current Migrations
- [`0016_backfill_run_and_replay_job_columns.sql`](/Users/svanny/banji/apps/api/migrations/0016_backfill_run_and_replay_job_columns.sql)
- [`0018_job_outbox_metadata.sql`](/Users/svanny/banji/apps/api/migrations/0018_job_outbox_metadata.sql)
- [`0019_job_outbox_delivery_mode_hardening.sql`](/Users/svanny/banji/apps/api/migrations/0019_job_outbox_delivery_mode_hardening.sql)

## Inspection
Run:

```bash
DATABASE_URL=... bash tool/db/sqlx_migration_history_repair.sh inspect
```

The inspection is safe and read-only. It prints:
- the live `public._sqlx_migrations` column layout
- applied rows for versions `16`, `18`, and `19`
- the expected sqlx SHA-384 checksums for the current migrations
- schema probes for `app.job_outbox.metadata`, `app.job_outbox.delivery_mode`, and `app.backfill_run`
- `safe_to_remap_16_to_18: true|false`

## Repair
Only proceed automatically when inspection reports `safe_to_remap_16_to_18: true`.

Generate the repair SQL:

```bash
DATABASE_URL=... bash tool/db/sqlx_migration_history_repair.sh generate-repair-sql > /tmp/db_sqlx_repair.sql
```

Review the generated SQL, then apply it with the staging migration role.
Review the generated SQL, then apply it with the environment-specific migration role.

The generated SQL:
- deletes the legacy version-16 metadata row from `public._sqlx_migrations`
- inserts the same SQL effect as version `18`, using the current repo checksum

It intentionally does not fabricate a version `19` row. After remapping the metadata row, let `sqlx migrate run` apply the missing current migrations.

## Finish
After the metadata remap:

```bash
RAILWAY_API_TOKEN=... \
RAILWAY_PROJECT_ID=... \
RAILWAY_ENVIRONMENT=staging \
RAILWAY_SERVICE_ID=... \
bash tool/ci/run_db_ops.sh migrate-with-lock
```

Expected result:
- version `16` now applies the current backfill/replay schema
- version `18` is already satisfied by the remapped metadata row
- version `19` applies delivery-mode hardening

## Validation
After repair:

```sql
SELECT version, description, success
FROM public._sqlx_migrations
WHERE version IN (16, 18, 19)
ORDER BY version;
```

Confirm:
- version `16` exists and matches the current backfill migration
- version `18` exists and matches the metadata migration
- version `19` exists after `sqlx migrate run`
- `app.backfill_run` exists
- `app.job_outbox.metadata` exists
- `app.job_outbox.delivery_mode` is `NOT NULL`

If inspection does not report `safe_to_remap_16_to_18: true`, stop and do a manual review. That means the database no longer matches the narrow renumbering case this runbook automates.
