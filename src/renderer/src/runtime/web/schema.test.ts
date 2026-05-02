import { describe, expect, it } from 'vitest';
import {
  BROWSER_STORAGE_MIGRATIONS,
  BROWSER_STORAGE_SCHEMA_SQL,
  buildMigrationSql,
  migrationsAfter,
} from './schema';
import { BANJI_BROWSER_SCHEMA_VERSION } from './constants';

describe('browser storage schema', () => {
  it('defines a versioned JSON document schema for browser SQLite storage', () => {
    expect(BROWSER_STORAGE_MIGRATIONS).toHaveLength(1);
    expect(BROWSER_STORAGE_MIGRATIONS[0]?.version).toBe(BANJI_BROWSER_SCHEMA_VERSION);
    expect(BROWSER_STORAGE_SCHEMA_SQL).toContain('CREATE TABLE IF NOT EXISTS banji_metadata');
    expect(BROWSER_STORAGE_SCHEMA_SQL).toContain('CREATE TABLE IF NOT EXISTS banji_documents');
    expect(BROWSER_STORAGE_SCHEMA_SQL).toContain('CHECK (json_valid(json))');
    expect(BROWSER_STORAGE_SCHEMA_SQL).toContain('WITHOUT ROWID');
    expect(BROWSER_STORAGE_SCHEMA_SQL).toContain('idx_banji_documents_collection_updated');
  });

  it('returns only migrations newer than the current schema version', () => {
    expect(migrationsAfter(0).map((migration) => migration.version)).toEqual([1]);
    expect(migrationsAfter(1)).toEqual([]);
    expect(buildMigrationSql(1)).toBe('');
  });

  it('rejects invalid migration baselines', () => {
    expect(() => migrationsAfter(-1)).toThrow('Current schema version must be a non-negative integer.');
    expect(() => migrationsAfter(1.5)).toThrow('Current schema version must be a non-negative integer.');
  });
});

