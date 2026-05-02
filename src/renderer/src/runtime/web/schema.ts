import { BANJI_BROWSER_SCHEMA_VERSION } from './constants';

export type BrowserStorageMigration = {
  version: number;
  sql: string;
};

export const BROWSER_STORAGE_MIGRATIONS: BrowserStorageMigration[] = [
  {
    version: 1,
    sql: `
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS banji_metadata (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      CREATE TABLE IF NOT EXISTS banji_documents (
        collection TEXT NOT NULL,
        id TEXT NOT NULL,
        json TEXT NOT NULL CHECK (json_valid(json)),
        updated_at TEXT NOT NULL,
        PRIMARY KEY (collection, id)
      ) WITHOUT ROWID;

      CREATE INDEX IF NOT EXISTS idx_banji_documents_collection_updated
        ON banji_documents(collection, updated_at DESC);

      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS app_metadata (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL CHECK (json_valid(value_json)),
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS preferences (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL CHECK (json_valid(value_json)),
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS catalog (
        singleton_id TEXT PRIMARY KEY,
        catalog_json TEXT NOT NULL CHECK (json_valid(catalog_json)),
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS observations (
        observation_id TEXT PRIMARY KEY,
        observed_at TEXT NOT NULL,
        observation_json TEXT NOT NULL CHECK (json_valid(observation_json)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_observations_observed_at
        ON observations(observed_at DESC, observation_id DESC);

      CREATE TABLE IF NOT EXISTS order_batches (
        batch_order_id TEXT PRIMARY KEY,
        supplier_name TEXT,
        status TEXT,
        order_batch_json TEXT NOT NULL CHECK (json_valid(order_batch_json)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_order_batches_status_updated
        ON order_batches(status, updated_at DESC);

      CREATE TABLE IF NOT EXISTS analysis_runs (
        run_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        completed_at TEXT,
        run_json TEXT NOT NULL CHECK (json_valid(run_json))
      );

      CREATE TABLE IF NOT EXISTS workspace_summary_cache (
        singleton_id TEXT PRIMARY KEY,
        summary_json TEXT NOT NULL CHECK (json_valid(summary_json)),
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sku_detail_cache (
        sku_id TEXT PRIMARY KEY,
        detail_json TEXT NOT NULL CHECK (json_valid(detail_json)),
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS service_detail_cache (
        service_id TEXT PRIMARY KEY,
        detail_json TEXT NOT NULL CHECK (json_valid(detail_json)),
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS automation_workspace (
        singleton_id TEXT PRIMARY KEY,
        workspace_json TEXT NOT NULL CHECK (json_valid(workspace_json)),
        updated_at TEXT NOT NULL
      );

      INSERT INTO banji_metadata(key, value, updated_at)
      VALUES (
        'schema_version',
        '${BANJI_BROWSER_SCHEMA_VERSION}',
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      )
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at;

      INSERT INTO schema_migrations(version, applied_at)
      VALUES (${BANJI_BROWSER_SCHEMA_VERSION}, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      ON CONFLICT(version) DO NOTHING;
    `,
  },
];

export const BROWSER_STORAGE_SCHEMA_SQL = BROWSER_STORAGE_MIGRATIONS
  .map((migration) => migration.sql.trim())
  .join('\n\n');

export function migrationsAfter(currentVersion: number): BrowserStorageMigration[] {
  if (!Number.isInteger(currentVersion) || currentVersion < 0) {
    throw new Error('Current schema version must be a non-negative integer.');
  }
  return BROWSER_STORAGE_MIGRATIONS.filter((migration) => migration.version > currentVersion);
}

export function buildMigrationSql(currentVersion: number): string {
  return migrationsAfter(currentVersion).map((migration) => migration.sql.trim()).join('\n\n');
}
