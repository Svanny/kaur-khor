import type { ChartCustomTimeframeRange, ChartTimeframe } from '@/components/system/chart-timeframe';
import {
  DEFAULT_CHART_RESOLUTION,
  parseChartCustomResolution,
  type ChartCustomResolution,
  type ChartResolutionOption,
} from '@/components/system/chart-resolution';
import type { ChartSettingsSubtype } from '@/lib/chart-settings-memory';
import {
  readRememberedPageValue,
  writeRememberedPageValue,
} from '@/lib/page-state-memory';

export interface ChartVisibleDateRange {
  startAt: string;
  endAt: string;
}

export interface ChartLayoutPreferenceMergeOptions {
  previousVisibleDateRange?: ChartVisibleDateRange | null;
  syncCustomTimeframeRange?: boolean;
}

export interface PersistedChartLayoutPreferences {
  timeframe: ChartTimeframe;
  customTimeframeRange: ChartCustomTimeframeRange | null;
  chartResolution: ChartResolutionOption;
  customChartResolution: ChartCustomResolution | null;
  visibleDateRange: ChartVisibleDateRange | null;
  paneHeights: Record<string, number>;
  paneHeightsSource?: 'manual';
}

const SUBTYPE_DEFAULT_CHART_LAYOUT_STORAGE_KEY = 'kaur-khor:chart-layout:defaults:v1';
const MAX_PERSISTED_PANE_HEIGHTS = 16;
const MAX_PERSISTED_PANE_ID_LENGTH = 64;
const MAX_PERSISTED_PANE_HEIGHT = 5000;

function subjectStorageKey(subtype: ChartSettingsSubtype, subjectId: string) {
  return `${subtype}:${subjectId}`;
}

function getWindowStorage(kind: 'localStorage' | 'sessionStorage'): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window[kind];
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

function normalizeDateRange(value: unknown): ChartVisibleDateRange | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const candidate = value as Partial<ChartVisibleDateRange>;
  if (typeof candidate.startAt !== 'string' || typeof candidate.endAt !== 'string') {
    return null;
  }
  const start = strictIsoTimestampMs(candidate.startAt);
  const end = strictIsoTimestampMs(candidate.endAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
    return null;
  }
  return {
    startAt: new Date(start).toISOString(),
    endAt: new Date(end).toISOString(),
  };
}

function normalizePaneHeights(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const paneHeights: Record<string, number> = {};
  let acceptedCount = 0;
  for (const [paneId, height] of Object.entries(value)) {
    if (acceptedCount >= MAX_PERSISTED_PANE_HEIGHTS) {
      break;
    }
    if (
      paneId.length === 0 ||
      paneId.length > MAX_PERSISTED_PANE_ID_LENGTH ||
      typeof height !== 'number' ||
      !Number.isFinite(height) ||
      height <= 0
    ) {
      continue;
    }
    paneHeights[paneId] = Math.min(height, MAX_PERSISTED_PANE_HEIGHT);
    acceptedCount += 1;
  }
  return paneHeights;
}

function strictIsoTimestampMs(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return Number.NaN;
  }
  const normalizedValue = value.includes('.') ? value : value.replace('Z', '.000Z');
  return new Date(timestamp).toISOString() === normalizedValue ? timestamp : Number.NaN;
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
  const customTimeframeRange = normalizeDateRange(value.customTimeframeRange);
  const customChartResolution =
    chartResolution === 'Custom'
      ? parseChartCustomResolution(value.customChartResolution?.expression ?? '') ?? null
      : null;
  const visibleDateRange = normalizeDateRange(value.visibleDateRange);
  const paneHeightsSource = value.paneHeightsSource === 'manual' ? value.paneHeightsSource : undefined;
  const paneHeights = paneHeightsSource === 'manual' ? normalizePaneHeights(value.paneHeights) : {};
  return {
    timeframe,
    customTimeframeRange,
    chartResolution,
    customChartResolution,
    visibleDateRange,
    paneHeights,
    ...(paneHeightsSource ? { paneHeightsSource } : {}),
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
  if (left.paneHeightsSource !== right.paneHeightsSource) {
    return false;
  }
  if (leftPaneHeightEntries.length !== rightPaneHeightEntries.length) {
    return false;
  }
  return leftPaneHeightEntries.every(([paneId, height]) => right.paneHeights[paneId] === height);
}

export function mergeChartLayoutPreferencesWithViewportSync(
  current: PersistedChartLayoutPreferences,
  next: Partial<PersistedChartLayoutPreferences>,
  timeframe: ChartTimeframe,
  options: ChartLayoutPreferenceMergeOptions = {},
): {
  preferences: PersistedChartLayoutPreferences;
  promotedCustomTimeframeRange: ChartCustomTimeframeRange | null;
} {
  const hasCustomTimeframeRangeUpdate = Object.prototype.hasOwnProperty.call(next, 'customTimeframeRange');
  const nextVisibleDateRange = next.visibleDateRange;
  const previousVisibleDateRange = current.visibleDateRange ?? options.previousVisibleDateRange ?? null;
  const shouldSyncCustomTimeframeRange = timeframe !== 'MAX' && (options.syncCustomTimeframeRange ?? true);
  let promotedCustomTimeframeRange: ChartCustomTimeframeRange | null = null;

  if (
    shouldSyncCustomTimeframeRange &&
    !hasCustomTimeframeRangeUpdate &&
    nextVisibleDateRange != null &&
    current.customTimeframeRange != null
  ) {
    promotedCustomTimeframeRange = nextVisibleDateRange;
  } else if (
    shouldSyncCustomTimeframeRange &&
    !hasCustomTimeframeRangeUpdate &&
    nextVisibleDateRange != null &&
    current.customTimeframeRange == null &&
    previousVisibleDateRange == null
  ) {
    promotedCustomTimeframeRange = null;
  } else if (
    shouldSyncCustomTimeframeRange &&
    !hasCustomTimeframeRangeUpdate &&
    nextVisibleDateRange != null &&
    current.customTimeframeRange == null &&
    previousVisibleDateRange != null
  ) {
    const nextStart = Date.parse(nextVisibleDateRange.startAt);
    const nextEnd = Date.parse(nextVisibleDateRange.endAt);
    const currentStart = Date.parse(previousVisibleDateRange.startAt);
    const currentEnd = Date.parse(previousVisibleDateRange.endAt);
    const extendsViewport =
      (Number.isFinite(nextStart) && Number.isFinite(currentStart) && nextStart < currentStart) ||
      (Number.isFinite(nextEnd) && Number.isFinite(currentEnd) && nextEnd > currentEnd);
    if (extendsViewport) {
      promotedCustomTimeframeRange = nextVisibleDateRange;
    }
  }

  return {
    preferences: normalizeChartLayoutPreferences({
      ...current,
      ...next,
      customTimeframeRange: hasCustomTimeframeRangeUpdate
        ? next.customTimeframeRange ?? null
        : promotedCustomTimeframeRange ?? current.customTimeframeRange,
    }),
    promotedCustomTimeframeRange,
  };
}

export function readEntityChartLayoutPreferences(
  subtype: ChartSettingsSubtype,
  subjectId: string,
) {
  return readRememberedPageValue<PersistedChartLayoutPreferences | null>(
    'catalog',
    'chartLayout',
    null,
    (value) =>
      value == null || typeof value !== 'object' || Array.isArray(value)
        ? null
        : normalizeChartLayoutPreferences(value as PersistedChartLayoutPreferences),
    { scope: subjectStorageKey(subtype, subjectId) },
  );
}

export function writeEntityChartLayoutPreferences(
  subtype: ChartSettingsSubtype,
  subjectId: string,
  preferences: PersistedChartLayoutPreferences,
) {
  writeRememberedPageValue<PersistedChartLayoutPreferences>(
    'catalog',
    'chartLayout',
    preferences,
    (value) => normalizeChartLayoutPreferences(value as PersistedChartLayoutPreferences),
    { scope: subjectStorageKey(subtype, subjectId) },
  );
}

export function readSubtypeDefaultChartLayoutPreferences(subtype: ChartSettingsSubtype) {
  const record = readStorageRecord<PersistedChartLayoutPreferences>(
    getWindowStorage('localStorage'),
    SUBTYPE_DEFAULT_CHART_LAYOUT_STORAGE_KEY,
  );
  const persisted = record[subtype];
  return persisted && typeof persisted === 'object' && !Array.isArray(persisted)
    ? normalizeChartLayoutPreferences(persisted)
    : null;
}

export function resolveEntityChartLayoutPreferences(
  subtype: ChartSettingsSubtype,
  subjectId: string,
) {
  return normalizeChartLayoutPreferences(
    readEntityChartLayoutPreferences(subtype, subjectId) ??
    readSubtypeDefaultChartLayoutPreferences(subtype) ??
    defaultChartLayoutPreferences(),
  );
}

export function writeSubtypeDefaultChartLayoutPreferences(
  subtype: ChartSettingsSubtype,
  preferences: PersistedChartLayoutPreferences,
) {
  const storage = getWindowStorage('localStorage');
  const record = readStorageRecord<PersistedChartLayoutPreferences>(
    storage,
    SUBTYPE_DEFAULT_CHART_LAYOUT_STORAGE_KEY,
  );
  record[subtype] = normalizeChartLayoutPreferences(preferences);
  writeStorageRecord(storage, SUBTYPE_DEFAULT_CHART_LAYOUT_STORAGE_KEY, record);
}
