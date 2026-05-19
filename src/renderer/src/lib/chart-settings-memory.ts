import {
  readRememberedPageValue,
  writeRememberedPageValue,
} from '@/lib/page-state-memory';

export type ChartSettingsSubtype = 'analysis' | 'service' | 'sku';

const SUBTYPE_DEFAULT_CHART_SETTINGS_STORAGE_KEY = 'kaur-khor:chart-settings:defaults:v1';

function subjectStorageKey(subtype: ChartSettingsSubtype, subjectId: string) {
  return `${subtype}:${subjectId}`;
}

function getLocalStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function readStorageRecord<T>(storage: Storage | null, key: string): Record<string, T> {
  if (!storage) {
    return {};
  }
  try {
    const rawValue = storage.getItem(key);
    if (!rawValue) {
      return {};
    }
    const parsed = JSON.parse(rawValue);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, T>;
  } catch {
    return {};
  }
}

function writeStorageRecord<T>(storage: Storage | null, key: string, value: Record<string, T>) {
  if (!storage) {
    return;
  }
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {}
}

function normalizeStoredChartSettings<T>(value: unknown, normalize: (value: T) => T) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  try {
    return normalize(value as T);
  } catch {
    return null;
  }
}

export function readEntityChartSettings<T>(
  subtype: ChartSettingsSubtype,
  subjectId: string,
  normalize: (value: T) => T,
): T | null {
  return readRememberedPageValue<T | null>(
    'catalog',
    'chartSettings',
    null,
    (value) => normalizeStoredChartSettings(value, normalize),
    { scope: subjectStorageKey(subtype, subjectId) },
  );
}

export function writeEntityChartSettings<T>(
  subtype: ChartSettingsSubtype,
  subjectId: string,
  settings: T,
  normalize: (value: T) => T,
) {
  writeRememberedPageValue<T>(
    'catalog',
    'chartSettings',
    settings,
    (value) => normalize(value as T),
    { scope: subjectStorageKey(subtype, subjectId) },
  );
}

export function readSubtypeDefaultChartSettings<T>(
  subtype: ChartSettingsSubtype,
  normalize: (value: T) => T,
): T | null {
  const record = readStorageRecord<T>(getLocalStorage(), SUBTYPE_DEFAULT_CHART_SETTINGS_STORAGE_KEY);
  const persisted = record[subtype];
  return normalizeStoredChartSettings(persisted, normalize);
}

export function writeSubtypeDefaultChartSettings<T>(
  subtype: ChartSettingsSubtype,
  settings: T,
  normalize: (value: T) => T,
) {
  const storage = getLocalStorage();
  const record = readStorageRecord<T>(storage, SUBTYPE_DEFAULT_CHART_SETTINGS_STORAGE_KEY);
  const normalized = normalizeStoredChartSettings(settings, normalize);
  if (normalized == null) {
    return;
  }
  record[subtype] = normalized;
  writeStorageRecord(storage, SUBTYPE_DEFAULT_CHART_SETTINGS_STORAGE_KEY, record);
}
