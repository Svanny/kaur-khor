export type ChartSettingsSubtype = 'analysis' | 'service' | 'sku';

const ENTITY_CHART_SETTINGS_STORAGE_KEY = 'banji:chart-settings:entity:v1';
const SUBTYPE_DEFAULT_CHART_SETTINGS_STORAGE_KEY = 'banji:chart-settings:defaults:v1';

function subjectStorageKey(subtype: ChartSettingsSubtype, subjectId: string) {
  return `${subtype}:${subjectId}`;
}

function readStorageRecord<T>(storage: Storage, key: string): Record<string, T> {
  const rawValue = storage.getItem(key);
  if (!rawValue) {
    return {};
  }
  try {
    return JSON.parse(rawValue) as Record<string, T>;
  } catch {
    return {};
  }
}

function writeStorageRecord<T>(storage: Storage, key: string, value: Record<string, T>) {
  storage.setItem(key, JSON.stringify(value));
}

export function readEntityChartSettings<T>(
  subtype: ChartSettingsSubtype,
  subjectId: string,
  normalize: (value: T) => T,
): T | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const record = readStorageRecord<T>(window.sessionStorage, ENTITY_CHART_SETTINGS_STORAGE_KEY);
  const persisted = record[subjectStorageKey(subtype, subjectId)];
  return persisted ? normalize(persisted) : null;
}

export function writeEntityChartSettings<T>(
  subtype: ChartSettingsSubtype,
  subjectId: string,
  settings: T,
  normalize: (value: T) => T,
) {
  if (typeof window === 'undefined') {
    return;
  }
  const record = readStorageRecord<T>(window.sessionStorage, ENTITY_CHART_SETTINGS_STORAGE_KEY);
  record[subjectStorageKey(subtype, subjectId)] = normalize(settings);
  writeStorageRecord(window.sessionStorage, ENTITY_CHART_SETTINGS_STORAGE_KEY, record);
}

export function readSubtypeDefaultChartSettings<T>(
  subtype: ChartSettingsSubtype,
  normalize: (value: T) => T,
): T | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const record = readStorageRecord<T>(window.localStorage, SUBTYPE_DEFAULT_CHART_SETTINGS_STORAGE_KEY);
  const persisted = record[subtype];
  return persisted ? normalize(persisted) : null;
}

export function writeSubtypeDefaultChartSettings<T>(
  subtype: ChartSettingsSubtype,
  settings: T,
  normalize: (value: T) => T,
) {
  if (typeof window === 'undefined') {
    return;
  }
  const record = readStorageRecord<T>(window.localStorage, SUBTYPE_DEFAULT_CHART_SETTINGS_STORAGE_KEY);
  record[subtype] = normalize(settings);
  writeStorageRecord(window.localStorage, SUBTYPE_DEFAULT_CHART_SETTINGS_STORAGE_KEY, record);
}
