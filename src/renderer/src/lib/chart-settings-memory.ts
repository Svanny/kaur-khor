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
    return JSON.parse(rawValue) as Record<string, T>;
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

export function readEntityChartSettings<T>(
  subtype: ChartSettingsSubtype,
  subjectId: string,
  normalize: (value: T) => T,
): T | null {
  return readRememberedPageValue<T | null>(
    'catalog',
    'chartSettings',
    null,
    (value) => value == null ? null : normalize(value as T),
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
  return persisted ? normalize(persisted) : null;
}

export function writeSubtypeDefaultChartSettings<T>(
  subtype: ChartSettingsSubtype,
  settings: T,
  normalize: (value: T) => T,
) {
  const storage = getLocalStorage();
  const record = readStorageRecord<T>(storage, SUBTYPE_DEFAULT_CHART_SETTINGS_STORAGE_KEY);
  record[subtype] = normalize(settings);
  writeStorageRecord(storage, SUBTYPE_DEFAULT_CHART_SETTINGS_STORAGE_KEY, record);
}
