import {
  KAUR_KHOR_BROWSER_APP_DATABASE,
  KAUR_KHOR_BROWSER_DEMO_DATABASE,
  KAUR_KHOR_BROWSER_SCHEMA_VERSION,
  type KaurKhorBrowserDatabaseName,
} from './constants';
import { isKaurKhorBrowserDatabaseName } from './capability';

export const BROWSER_STORAGE_BACKUP_VERSION = 1;

export type BrowserStorageDocumentRecord = {
  collection: string;
  id: string;
  json: unknown;
  updatedAt: string;
};

export type BrowserStorageJsonBackup = {
  format: 'kaur-khor.browser.storage.backup';
  version: typeof BROWSER_STORAGE_BACKUP_VERSION;
  databaseName: KaurKhorBrowserDatabaseName;
  schemaVersion: typeof KAUR_KHOR_BROWSER_SCHEMA_VERSION;
  exportedAt: string;
  records: BrowserStorageDocumentRecord[];
};

export type BrowserStorageBackupValidation =
  | { ok: true; backup: BrowserStorageJsonBackup }
  | { ok: false; errors: string[] };

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIsoString(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function validateDocumentRecord(value: unknown, index: number, errors: string[]): BrowserStorageDocumentRecord | null {
  const initialErrorCount = errors.length;
  if (!isRecord(value)) {
    errors.push(`records[${index}] must be an object.`);
    return null;
  }
  const collection = value.collection;
  const id = value.id;
  const updatedAt = value.updatedAt;
  if (typeof collection !== 'string' || collection.trim().length === 0) {
    errors.push(`records[${index}].collection must be a non-empty string.`);
  }
  if (typeof id !== 'string' || id.trim().length === 0) {
    errors.push(`records[${index}].id must be a non-empty string.`);
  }
  if (!Object.hasOwn(value, 'json')) {
    errors.push(`records[${index}].json is required.`);
  }
  if (!isIsoString(updatedAt)) {
    errors.push(`records[${index}].updatedAt must be an ISO timestamp.`);
  }
  if (errors.length > initialErrorCount) {
    return null;
  }
  return {
    collection: collection as string,
    id: id as string,
    json: value.json,
    updatedAt: updatedAt as string,
  };
}

export function validateBrowserStorageBackup(value: unknown): BrowserStorageBackupValidation {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { ok: false, errors: ['Backup must be a JSON object.'] };
  }
  if (value.format !== 'kaur-khor.browser.storage.backup') {
    errors.push('Backup format is not supported.');
  }
  if (value.version !== BROWSER_STORAGE_BACKUP_VERSION) {
    errors.push('Backup version is not supported.');
  }
  if (typeof value.databaseName !== 'string' || !isKaurKhorBrowserDatabaseName(value.databaseName)) {
    errors.push(`Database name must be ${KAUR_KHOR_BROWSER_APP_DATABASE} or ${KAUR_KHOR_BROWSER_DEMO_DATABASE}.`);
  }
  if (value.schemaVersion !== KAUR_KHOR_BROWSER_SCHEMA_VERSION) {
    errors.push('Backup schema version is not supported.');
  }
  if (!isIsoString(value.exportedAt)) {
    errors.push('Backup exportedAt must be an ISO timestamp.');
  }
  if (!Array.isArray(value.records)) {
    errors.push('Backup records must be an array.');
  }

  const records = Array.isArray(value.records)
    ? value.records.map((record, index) => validateDocumentRecord(record, index, errors)).filter((record) => record !== null)
    : [];

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    backup: {
      format: 'kaur-khor.browser.storage.backup',
      version: BROWSER_STORAGE_BACKUP_VERSION,
      databaseName: value.databaseName as KaurKhorBrowserDatabaseName,
      schemaVersion: KAUR_KHOR_BROWSER_SCHEMA_VERSION,
      exportedAt: value.exportedAt as string,
      records,
    },
  };
}

export function parseBrowserStorageBackupJson(json: string): BrowserStorageBackupValidation {
  try {
    return validateBrowserStorageBackup(JSON.parse(json));
  } catch {
    return { ok: false, errors: ['Backup JSON could not be parsed.'] };
  }
}

export function createBrowserStorageBackup(
  databaseName: KaurKhorBrowserDatabaseName,
  records: BrowserStorageDocumentRecord[],
  exportedAt = new Date().toISOString(),
): BrowserStorageJsonBackup {
  return {
    format: 'kaur-khor.browser.storage.backup',
    version: BROWSER_STORAGE_BACKUP_VERSION,
    databaseName,
    schemaVersion: KAUR_KHOR_BROWSER_SCHEMA_VERSION,
    exportedAt,
    records,
  };
}
