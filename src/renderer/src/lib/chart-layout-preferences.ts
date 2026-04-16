import type { ChartCustomTimeframeRange, ChartTimeframe } from '@/components/system/chart-timeframe';
import {
  DEFAULT_CHART_RESOLUTION,
  parseChartCustomResolution,
  type ChartCustomResolution,
  type ChartResolutionOption,
} from '@/components/system/chart-resolution';
import type { ChartSettingsSubtype } from '@/lib/chart-settings-memory';

export interface ChartVisibleDateRange {
  startAt: string;
  endAt: string;
}

export interface PersistedChartLayoutPreferences {
  timeframe: ChartTimeframe;
  customTimeframeRange: ChartCustomTimeframeRange | null;
  chartResolution: ChartResolutionOption;
  customChartResolution: ChartCustomResolution | null;
  visibleDateRange: ChartVisibleDateRange | null;
  paneHeights: Record<string, number>;
}

const ENTITY_CHART_LAYOUT_STORAGE_KEY = 'banji:chart-layout:entity:v1';
const SUBTYPE_DEFAULT_CHART_LAYOUT_STORAGE_KEY = 'banji:chart-layout:defaults:v1';

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

export function defaultChartLayoutPreferences(): PersistedChartLayoutPreferences {
  return {
    timeframe: 'Recent',
    customTimeframeRange: null,
    chartResolution: DEFAULT_CHART_RESOLUTION,
    customChartResolution: null,
    visibleDateRange: null,
    paneHeights: {},
  };
}

export function normalizeChartLayoutPreferences(value: PersistedChartLayoutPreferences | null | undefined): PersistedChartLayoutPreferences {
  const defaults = defaultChartLayoutPreferences();
  if (!value || typeof value !== 'object') {
    return defaults;
  }
  const timeframe = value.timeframe === '1M' || value.timeframe === '3M' || value.timeframe === '1Y' || value.timeframe === 'YTD' || value.timeframe === 'MAX' || value.timeframe === 'Recent'
    ? value.timeframe
    : defaults.timeframe;
  const chartResolution = value.chartResolution === 'H' || value.chartResolution === '1D' || value.chartResolution === '1W' || value.chartResolution === '1M' || value.chartResolution === '3M' || value.chartResolution === '1Y' || value.chartResolution === 'Custom'
    ? value.chartResolution
    : defaults.chartResolution;
  const customTimeframeRange =
    value.customTimeframeRange?.startAt && value.customTimeframeRange?.endAt
      ? {
          startAt: value.customTimeframeRange.startAt,
          endAt: value.customTimeframeRange.endAt,
        }
      : null;
  const customChartResolution =
    chartResolution === 'Custom'
      ? parseChartCustomResolution(value.customChartResolution?.expression ?? '') ?? null
      : null;
  const visibleDateRange =
    value.visibleDateRange?.startAt && value.visibleDateRange?.endAt
      ? {
          startAt: value.visibleDateRange.startAt,
          endAt: value.visibleDateRange.endAt,
        }
      : null;
  const paneHeights = Object.fromEntries(
    Object.entries(value.paneHeights ?? {}).filter((entry): entry is [string, number] =>
      typeof entry[0] === 'string' && Number.isFinite(entry[1]) && entry[1] > 0,
    ),
  );
  return {
    timeframe,
    customTimeframeRange,
    chartResolution,
    customChartResolution,
    visibleDateRange,
    paneHeights,
  };
}

export function chartLayoutPreferencesEqual(
  left: PersistedChartLayoutPreferences,
  right: PersistedChartLayoutPreferences,
) {
  if (left.timeframe !== right.timeframe || left.chartResolution !== right.chartResolution) {
    return false;
  }
  if (left.customChartResolution?.expression !== right.customChartResolution?.expression) {
    return false;
  }
  if (
    left.customTimeframeRange?.startAt !== right.customTimeframeRange?.startAt ||
    left.customTimeframeRange?.endAt !== right.customTimeframeRange?.endAt
  ) {
    return false;
  }
  if (
    left.visibleDateRange?.startAt !== right.visibleDateRange?.startAt ||
    left.visibleDateRange?.endAt !== right.visibleDateRange?.endAt
  ) {
    return false;
  }
  const leftPaneHeightEntries = Object.entries(left.paneHeights);
  const rightPaneHeightEntries = Object.entries(right.paneHeights);
  if (leftPaneHeightEntries.length !== rightPaneHeightEntries.length) {
    return false;
  }
  return leftPaneHeightEntries.every(([paneId, height]) => right.paneHeights[paneId] === height);
}

export function readEntityChartLayoutPreferences(
  subtype: ChartSettingsSubtype,
  subjectId: string,
) {
  if (typeof window === 'undefined') {
    return null;
  }
  const record = readStorageRecord<PersistedChartLayoutPreferences>(window.sessionStorage, ENTITY_CHART_LAYOUT_STORAGE_KEY);
  const persisted = record[subjectStorageKey(subtype, subjectId)];
  return persisted ? normalizeChartLayoutPreferences(persisted) : null;
}

export function writeEntityChartLayoutPreferences(
  subtype: ChartSettingsSubtype,
  subjectId: string,
  preferences: PersistedChartLayoutPreferences,
) {
  if (typeof window === 'undefined') {
    return;
  }
  const record = readStorageRecord<PersistedChartLayoutPreferences>(window.sessionStorage, ENTITY_CHART_LAYOUT_STORAGE_KEY);
  record[subjectStorageKey(subtype, subjectId)] = normalizeChartLayoutPreferences(preferences);
  writeStorageRecord(window.sessionStorage, ENTITY_CHART_LAYOUT_STORAGE_KEY, record);
}

export function readSubtypeDefaultChartLayoutPreferences(subtype: ChartSettingsSubtype) {
  if (typeof window === 'undefined') {
    return null;
  }
  const record = readStorageRecord<PersistedChartLayoutPreferences>(window.localStorage, SUBTYPE_DEFAULT_CHART_LAYOUT_STORAGE_KEY);
  const persisted = record[subtype];
  return persisted ? normalizeChartLayoutPreferences(persisted) : null;
}

export function writeSubtypeDefaultChartLayoutPreferences(
  subtype: ChartSettingsSubtype,
  preferences: PersistedChartLayoutPreferences,
) {
  if (typeof window === 'undefined') {
    return;
  }
  const record = readStorageRecord<PersistedChartLayoutPreferences>(window.localStorage, SUBTYPE_DEFAULT_CHART_LAYOUT_STORAGE_KEY);
  record[subtype] = normalizeChartLayoutPreferences(preferences);
  writeStorageRecord(window.localStorage, SUBTYPE_DEFAULT_CHART_LAYOUT_STORAGE_KEY, record);
}
