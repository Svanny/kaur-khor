import {
  KAUR_KHOR_BROWSER_APP_DATABASE,
  KAUR_KHOR_BROWSER_DEMO_DATABASE,
  KAUR_KHOR_BROWSER_SCHEMA_VERSION,
  type KaurKhorBrowserDatabaseName,
} from './constants';
import { isKaurKhorBrowserDatabaseName } from './capability';

export const BROWSER_STORAGE_BACKUP_VERSION = 1;
export const MAX_BROWSER_STORAGE_BACKUP_RECORDS = 5_000;
export const MAX_BROWSER_STORAGE_DOCUMENT_KEY_LENGTH = 128;

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

export type BrowserStorageDocumentRecordsValidation =
  | { ok: true; records: BrowserStorageDocumentRecord[] }
  | { ok: false; errors: string[] };

type UnknownRecord = Record<string, unknown>;

const DOCUMENT_KEY_CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIsoString(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return false;
  }
  const timestamp = Date.parse(value);
  return !Number.isNaN(timestamp) && new Date(timestamp).toISOString() === value;
}

function isJsonValue(value: unknown, seen = new WeakSet<object>()): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return true;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return false;
    }
    seen.add(value);
    const isJsonArray = value.every((entry) => isJsonValue(entry, seen));
    seen.delete(value);
    return isJsonArray;
  }
  if (!isRecord(value)) {
    return false;
  }
  if (seen.has(value)) {
    return false;
  }
  seen.add(value);
  const isJsonObject = Object.values(value).every((entry) => isJsonValue(entry, seen));
  seen.delete(value);
  return isJsonObject;
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
  const normalizedCollection = typeof collection === 'string' ? collection.trim() : '';
  const normalizedId = typeof id === 'string' ? id.trim() : '';
  if (normalizedCollection.length === 0) {
    errors.push(`records[${index}].collection must be a non-empty string.`);
  } else if (normalizedCollection.length > MAX_BROWSER_STORAGE_DOCUMENT_KEY_LENGTH) {
    errors.push(`records[${index}].collection must be ${MAX_BROWSER_STORAGE_DOCUMENT_KEY_LENGTH} characters or fewer.`);
  } else if (DOCUMENT_KEY_CONTROL_CHARACTER.test(normalizedCollection)) {
    errors.push(`records[${index}].collection must not contain control characters.`);
  }
  if (normalizedId.length === 0) {
    errors.push(`records[${index}].id must be a non-empty string.`);
  } else if (normalizedId.length > MAX_BROWSER_STORAGE_DOCUMENT_KEY_LENGTH) {
    errors.push(`records[${index}].id must be ${MAX_BROWSER_STORAGE_DOCUMENT_KEY_LENGTH} characters or fewer.`);
  } else if (DOCUMENT_KEY_CONTROL_CHARACTER.test(normalizedId)) {
    errors.push(`records[${index}].id must not contain control characters.`);
  }
  if (!Object.hasOwn(value, 'json')) {
    errors.push(`records[${index}].json is required.`);
  } else if (!isJsonValue(value.json)) {
    errors.push(`records[${index}].json must be JSON-compatible.`);
  }
  if (!isIsoString(updatedAt)) {
    errors.push(`records[${index}].updatedAt must be an ISO timestamp.`);
  }
  if (errors.length > initialErrorCount) {
    return null;
  }
  return {
    collection: normalizedCollection,
    id: normalizedId,
    json: value.json,
    updatedAt: updatedAt as string,
  };
}

export function validateBrowserStorageDocumentRecords(value: unknown): BrowserStorageDocumentRecordsValidation {
  const errors: string[] = [];
  if (!Array.isArray(value)) {
    return { ok: false, errors: ['Records must be an array.'] };
  }
  if (value.length > MAX_BROWSER_STORAGE_BACKUP_RECORDS) {
    return { ok: false, errors: [`Records must contain ${MAX_BROWSER_STORAGE_BACKUP_RECORDS} entries or fewer.`] };
  }

  const records = value
    .map((record, index) => validateDocumentRecord(record, index, errors))
    .filter((record) => record !== null);
  const seenRecordKeys = new Set<string>();
  for (const record of records) {
    const recordKey = `${record.collection}\u0000${record.id}`;
    if (seenRecordKeys.has(recordKey)) {
      errors.push(`records contains duplicate document ${record.collection}/${record.id}.`);
    } else {
      seenRecordKeys.add(recordKey);
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, records };
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

  let records: BrowserStorageDocumentRecord[] = [];
  if (Array.isArray(value.records)) {
    const recordsValidation = validateBrowserStorageDocumentRecords(value.records);
    if (recordsValidation.ok) {
      records = recordsValidation.records;
    } else {
      errors.push(...recordsValidation.errors);
    }
  }

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
