import { describe, expect, it } from 'vitest';
import {
  BROWSER_STORAGE_BACKUP_VERSION,
  createBrowserStorageBackup,
  parseBrowserStorageBackupJson,
  validateBrowserStorageBackup,
} from './backup';
import { KAUR_KHOR_BROWSER_APP_DATABASE, KAUR_KHOR_BROWSER_SCHEMA_VERSION } from './constants';

describe('browser storage backup helpers', () => {
  it('creates and validates a JSON backup envelope', () => {
    const backup = createBrowserStorageBackup(
      KAUR_KHOR_BROWSER_APP_DATABASE,
      [{
        collection: 'preferences',
        id: 'current',
        json: { language: 'en' },
        updatedAt: '2026-05-01T00:00:00.000Z',
      }],
      '2026-05-01T00:01:00.000Z',
    );

    expect(backup.version).toBe(BROWSER_STORAGE_BACKUP_VERSION);
    expect(backup.schemaVersion).toBe(KAUR_KHOR_BROWSER_SCHEMA_VERSION);
    expect(validateBrowserStorageBackup(backup)).toEqual({ ok: true, backup });
    expect(parseBrowserStorageBackupJson(JSON.stringify(backup))).toEqual({ ok: true, backup });
  });

  it('returns actionable validation errors for malformed backups', () => {
    const validation = validateBrowserStorageBackup({
      format: 'unknown',
      version: 999,
      databaseName: 'scratch.sqlite3',
      schemaVersion: 999,
      exportedAt: 'not a date',
      records: [{ collection: '', id: '', updatedAt: 'bad' }],
    });

    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.errors).toEqual([
        'Backup format is not supported.',
        'Backup version is not supported.',
        'Database name must be kaur_khor_browser_app_v1.sqlite3 or kaur_khor_browser_demo_v1.sqlite3.',
        'Backup schema version is not supported.',
        'Backup exportedAt must be an ISO timestamp.',
        'records[0].collection must be a non-empty string.',
        'records[0].id must be a non-empty string.',
        'records[0].json is required.',
        'records[0].updatedAt must be an ISO timestamp.',
      ]);
    }
  });

  it('rejects invalid JSON input', () => {
    expect(parseBrowserStorageBackupJson('{nope')).toEqual({
      ok: false,
      errors: ['Backup JSON could not be parsed.'],
    });
  });
});

