import { describe, expect, it } from 'vitest';
import {
  BROWSER_STORAGE_BACKUP_VERSION,
  MAX_BROWSER_STORAGE_BACKUP_RECORDS,
  MAX_BROWSER_STORAGE_DOCUMENT_KEY_LENGTH,
  createBrowserStorageBackup,
  parseBrowserStorageBackupJson,
  validateBrowserStorageBackup,
  validateBrowserStorageDocumentRecords,
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

  it('normalizes backup document keys before import', () => {
    const validation = validateBrowserStorageBackup({
      format: 'kaur-khor.browser.storage.backup',
      version: BROWSER_STORAGE_BACKUP_VERSION,
      databaseName: KAUR_KHOR_BROWSER_APP_DATABASE,
      schemaVersion: KAUR_KHOR_BROWSER_SCHEMA_VERSION,
      exportedAt: '2026-05-01T00:01:00.000Z',
      records: [{
        collection: ' preferences ',
        id: ' current ',
        json: { language: 'en' },
        updatedAt: '2026-05-01T00:00:00.000Z',
      }],
    });

    expect(validation).toMatchObject({
      ok: true,
      backup: {
        records: [{
          collection: 'preferences',
          id: 'current',
        }],
      },
    });
  });

  it('normalizes direct document writes before storage', () => {
    const validation = validateBrowserStorageDocumentRecords([{
      collection: ' preferences ',
      id: ' current ',
      json: { language: 'en' },
      updatedAt: '2026-05-01T00:00:00.000Z',
    }]);

    expect(validation).toEqual({
      ok: true,
      records: [{
        collection: 'preferences',
        id: 'current',
        json: { language: 'en' },
        updatedAt: '2026-05-01T00:00:00.000Z',
      }],
    });
  });

  it('rejects malformed direct document writes before storage', () => {
    expect(validateBrowserStorageDocumentRecords({
      collection: 'preferences',
      id: 'current',
    })).toEqual({
      ok: false,
      errors: ['Records must be an array.'],
    });

    expect(validateBrowserStorageDocumentRecords([
      {
        collection: '',
        id: 'current',
        json: { language: undefined },
        updatedAt: '2026-05-01',
      },
    ])).toEqual({
      ok: false,
      errors: [
        'records[0].collection must be a non-empty string.',
        'records[0].json must be JSON-compatible.',
        'records[0].updatedAt must be an ISO timestamp.',
      ],
    });
  });

  it('rejects hidden control characters in document keys before import', () => {
    expect(validateBrowserStorageDocumentRecords([
      {
        collection: 'browser\nstate',
        id: 'current',
        json: { language: 'en' },
        updatedAt: '2026-05-01T00:00:00.000Z',
      },
      {
        collection: 'preferences',
        id: 'current\u0000copy',
        json: { language: 'km' },
        updatedAt: '2026-05-01T00:00:00.000Z',
      },
    ])).toEqual({
      ok: false,
      errors: [
        'records[0].collection must not contain control characters.',
        'records[1].id must not contain control characters.',
      ],
    });
  });

  it('rejects backup records with non-JSON document payloads before import', () => {
    const validation = validateBrowserStorageBackup({
      format: 'kaur-khor.browser.storage.backup',
      version: BROWSER_STORAGE_BACKUP_VERSION,
      databaseName: KAUR_KHOR_BROWSER_APP_DATABASE,
      schemaVersion: KAUR_KHOR_BROWSER_SCHEMA_VERSION,
      exportedAt: '2026-05-01T00:01:00.000Z',
      records: [
        {
          collection: 'preferences',
          id: 'current',
          json: { language: undefined },
          updatedAt: '2026-05-01T00:00:00.000Z',
        },
        {
          collection: 'catalog',
          id: 'current',
          json: { skuCount: Number.NaN },
          updatedAt: '2026-05-01T00:00:00.000Z',
        },
      ],
    });

    expect(validation).toEqual({
      ok: false,
      errors: [
        'records[0].json must be JSON-compatible.',
        'records[1].json must be JSON-compatible.',
      ],
    });
  });

  it('rejects cyclic document payloads instead of overflowing the validator', () => {
    const cyclicPayload: Record<string, unknown> = { language: 'en' };
    cyclicPayload.self = cyclicPayload;
    const cyclicArray: unknown[] = ['en'];
    cyclicArray.push(cyclicArray);

    const sharedPayload = { language: 'km' };

    expect(validateBrowserStorageDocumentRecords([
      {
        collection: 'preferences',
        id: 'current',
        json: cyclicPayload,
        updatedAt: '2026-05-01T00:00:00.000Z',
      },
      {
        collection: 'preferences',
        id: 'array-cycle',
        json: cyclicArray,
        updatedAt: '2026-05-01T00:00:00.000Z',
      },
      {
        collection: 'preferences',
        id: 'shared-reference',
        json: { first: sharedPayload, second: sharedPayload },
        updatedAt: '2026-05-01T00:00:00.000Z',
      },
    ])).toEqual({
      ok: false,
      errors: [
        'records[0].json must be JSON-compatible.',
        'records[1].json must be JSON-compatible.',
      ],
    });
  });

  it('rejects duplicate document records before import', () => {
    const validation = validateBrowserStorageBackup({
      format: 'kaur-khor.browser.storage.backup',
      version: BROWSER_STORAGE_BACKUP_VERSION,
      databaseName: KAUR_KHOR_BROWSER_APP_DATABASE,
      schemaVersion: KAUR_KHOR_BROWSER_SCHEMA_VERSION,
      exportedAt: '2026-05-01T00:01:00.000Z',
      records: [
        {
          collection: ' preferences ',
          id: ' current ',
          json: { language: 'en' },
          updatedAt: '2026-05-01T00:00:00.000Z',
        },
        {
          collection: 'preferences',
          id: 'current',
          json: { language: 'km' },
          updatedAt: '2026-05-01T00:00:01.000Z',
        },
      ],
    });

    expect(validation).toEqual({
      ok: false,
      errors: ['records contains duplicate document preferences/current.'],
    });
  });

  it('rejects oversized backup document keys and record sets before import', () => {
    expect(validateBrowserStorageDocumentRecords([
      {
        collection: 'c'.repeat(MAX_BROWSER_STORAGE_DOCUMENT_KEY_LENGTH + 1),
        id: 'current',
        json: { language: 'en' },
        updatedAt: '2026-05-01T00:00:00.000Z',
      },
      {
        collection: 'preferences',
        id: 'i'.repeat(MAX_BROWSER_STORAGE_DOCUMENT_KEY_LENGTH + 1),
        json: { language: 'km' },
        updatedAt: '2026-05-01T00:00:00.000Z',
      },
    ])).toEqual({
      ok: false,
      errors: [
        `records[0].collection must be ${MAX_BROWSER_STORAGE_DOCUMENT_KEY_LENGTH} characters or fewer.`,
        `records[1].id must be ${MAX_BROWSER_STORAGE_DOCUMENT_KEY_LENGTH} characters or fewer.`,
      ],
    });

    expect(validateBrowserStorageDocumentRecords(
      Array.from({ length: MAX_BROWSER_STORAGE_BACKUP_RECORDS + 1 }, (_, index) => ({
        collection: 'preferences',
        id: `current-${index}`,
        json: { language: 'en' },
        updatedAt: '2026-05-01T00:00:00.000Z',
      })),
    )).toEqual({
      ok: false,
      errors: [`Records must contain ${MAX_BROWSER_STORAGE_BACKUP_RECORDS} entries or fewer.`],
    });
  });

  it('rejects loose date strings where import requires exported UTC timestamps', () => {
    const validation = validateBrowserStorageBackup({
      format: 'kaur-khor.browser.storage.backup',
      version: BROWSER_STORAGE_BACKUP_VERSION,
      databaseName: KAUR_KHOR_BROWSER_APP_DATABASE,
      schemaVersion: KAUR_KHOR_BROWSER_SCHEMA_VERSION,
      exportedAt: '2026-05-01',
      records: [{
        collection: 'preferences',
        id: 'current',
        json: { language: 'en' },
        updatedAt: '2026-05-01',
      }],
    });

    expect(validation).toEqual({
      ok: false,
      errors: [
        'Backup exportedAt must be an ISO timestamp.',
        'records[0].updatedAt must be an ISO timestamp.',
      ],
    });
  });

  it('rejects impossible UTC timestamps instead of accepting rolled dates', () => {
    const validation = validateBrowserStorageBackup({
      format: 'kaur-khor.browser.storage.backup',
      version: BROWSER_STORAGE_BACKUP_VERSION,
      databaseName: KAUR_KHOR_BROWSER_APP_DATABASE,
      schemaVersion: KAUR_KHOR_BROWSER_SCHEMA_VERSION,
      exportedAt: '2026-02-31T00:00:00.000Z',
      records: [{
        collection: 'preferences',
        id: 'current',
        json: { language: 'en' },
        updatedAt: '2026-04-31T00:00:00.000Z',
      }],
    });

    expect(validation).toEqual({
      ok: false,
      errors: [
        'Backup exportedAt must be an ISO timestamp.',
        'records[0].updatedAt must be an ISO timestamp.',
      ],
    });
  });

  it('rejects invalid JSON input', () => {
    expect(parseBrowserStorageBackupJson('{nope')).toEqual({
      ok: false,
      errors: ['Backup JSON could not be parsed.'],
    });
  });
});
