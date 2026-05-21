import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  DEFAULT_DESKTOP_SEEN_UNLOCKED_NAV_ITEMS,
  DEFAULT_DESKTOP_ITEM_IMAGE_MODE,
  DEFAULT_DESKTOP_WORKBENCH_TILE_ORDER_BY_LANE,
  DEFAULT_SENA_ENGINE_PARAMETERS,
  DEFAULT_TASK_BATCH_UPDATE_PREFERENCES,
  DEFAULT_USD_TO_KHR_EXCHANGE_RATE,
  normalizeDesktopPreferenceTimestamp,
  normalizeDesktopSeenUnlockedNavItems,
  normalizeDesktopTaskBatchUpdatePreferences,
  normalizeDesktopWorkbenchTileOrderByLane,
  normalizeSenaEngineParameters,
  type DesktopPreferences,
  type DesktopTaskBatchUpdatePreference,
} from '@shared/ipc';
import {
  normalizeInterfaceViewMode,
  resolveInterfaceViewMode,
} from '@shared/interface-view';

const DEFAULT_PREFERENCES: DesktopPreferences = {
  language: 'en',
  currency: 'USD',
  usdToKhrExchangeRate: DEFAULT_USD_TO_KHR_EXCHANGE_RATE,
  displayViewMode: 'default',
  itemImageMode: DEFAULT_DESKTOP_ITEM_IMAGE_MODE,
  dimChartsWhileLoading: false,
  showExplanatoryTooltips: true,
  showFloatingTitleActions: true,
  showRightRailCards: false,
  showOverviewTaskTabs: true,
  showAutomationsPage: false,
  showAnalysisPage: true,
  showPerformanceCompareToggle: false,
  showPerformanceTimelineCard: false,
  showLogsViewToggle: false,
  showHeartbeatRibbons: true,
  taskBatchUpdatePreferences: DEFAULT_TASK_BATCH_UPDATE_PREFERENCES,
  customShowExplanatoryTooltips: true,
  customShowFloatingTitleActions: true,
  customShowRightRailCards: false,
  customShowOverviewTaskTabs: true,
  customShowAutomationsPage: false,
  customShowAnalysisPage: true,
  customShowPerformanceCompareToggle: false,
  customShowPerformanceTimelineCard: false,
  customShowLogsViewToggle: false,
  customShowHeartbeatRibbons: true,
  senaEngineParameters: DEFAULT_SENA_ENGINE_PARAMETERS,
  overviewStaleUpdateReminderSnoozeUntil: null,
  onboardingCompletedAt: null,
  seenUnlockedNavItems: DEFAULT_DESKTOP_SEEN_UNLOCKED_NAV_ITEMS,
  workbenchTileOrderByLane: DEFAULT_DESKTOP_WORKBENCH_TILE_ORDER_BY_LANE,
};
let preferencesWriteQueue: Promise<void> = Promise.resolve();

function preferencesPath(userDataPath: string) {
  return join(userDataPath, 'desktop-preferences.json');
}

function isMissingPreferencesFile(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 'ENOENT';
}

function normalizeUsdToKhrExchangeRate(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_USD_TO_KHR_EXCHANGE_RATE;
}

function normalizeBooleanPreference(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizePreferences(
  value: Partial<DesktopPreferences> | null | undefined,
  options?: { hasExistingPreferencesFile?: boolean },
): DesktopPreferences {
  const legacyTaskBatchUpdateMode = (value as Partial<DesktopPreferences> & {
    taskBatchUpdateMode?: DesktopTaskBatchUpdatePreference;
  } | null | undefined)?.taskBatchUpdateMode;
  const hasExistingPreferencesFile = options?.hasExistingPreferencesFile ?? false;
  const showExplanatoryTooltips = normalizeBooleanPreference(value?.showExplanatoryTooltips, true);
  const showFloatingTitleActions = normalizeBooleanPreference(value?.showFloatingTitleActions, true);
  const showRightRailCards = normalizeBooleanPreference(value?.showRightRailCards, true);
  const showOverviewTaskTabs = normalizeBooleanPreference(value?.showOverviewTaskTabs, true);
  const showAutomationsPage = normalizeBooleanPreference(value?.showAutomationsPage, true);
  const showAnalysisPage = true;
  const showPerformanceCompareToggle = normalizeBooleanPreference(value?.showPerformanceCompareToggle, true);
  const showPerformanceTimelineCard = normalizeBooleanPreference(value?.showPerformanceTimelineCard, true);
  const showLogsViewToggle = normalizeBooleanPreference(value?.showLogsViewToggle, true);
  const showHeartbeatRibbons = normalizeBooleanPreference(value?.showHeartbeatRibbons, true);
  const customShowExplanatoryTooltips = normalizeBooleanPreference(
    value?.customShowExplanatoryTooltips,
    showExplanatoryTooltips,
  );
  const customShowFloatingTitleActions = normalizeBooleanPreference(
    value?.customShowFloatingTitleActions,
    showFloatingTitleActions,
  );
  const customShowRightRailCards = normalizeBooleanPreference(
    value?.customShowRightRailCards,
    showRightRailCards,
  );
  const customShowOverviewTaskTabs = normalizeBooleanPreference(
    value?.customShowOverviewTaskTabs,
    showOverviewTaskTabs,
  );
  const customShowAutomationsPage = normalizeBooleanPreference(
    value?.customShowAutomationsPage,
    showAutomationsPage,
  );
  const customShowAnalysisPage = true;
  const customShowPerformanceCompareToggle =
    normalizeBooleanPreference(value?.customShowPerformanceCompareToggle, showPerformanceCompareToggle);
  const customShowPerformanceTimelineCard =
    normalizeBooleanPreference(value?.customShowPerformanceTimelineCard, showPerformanceTimelineCard);
  const customShowLogsViewToggle = normalizeBooleanPreference(value?.customShowLogsViewToggle, showLogsViewToggle);
  const customShowHeartbeatRibbons = normalizeBooleanPreference(value?.customShowHeartbeatRibbons, showHeartbeatRibbons);
  const visibilityPreferences = {
    showExplanatoryTooltips,
    showFloatingTitleActions,
    showRightRailCards,
    showOverviewTaskTabs,
    showAutomationsPage,
    showAnalysisPage,
    showPerformanceCompareToggle,
    showPerformanceTimelineCard,
    showLogsViewToggle,
    showHeartbeatRibbons,
  };
  const normalizedDisplayViewMode = normalizeInterfaceViewMode(value?.displayViewMode);
  const displayViewMode = resolveInterfaceViewMode({
    requestedMode: normalizedDisplayViewMode,
    visibility: visibilityPreferences,
  });
  const itemImageMode =
    value?.itemImageMode === 'off' ||
    value?.itemImageMode === 'thumbnail' ||
    value?.itemImageMode === 'small' ||
    value?.itemImageMode === 'medium'
      ? value.itemImageMode
      : DEFAULT_DESKTOP_ITEM_IMAGE_MODE;
  const onboardingCompletedAt =
    value?.onboardingCompletedAt === undefined && hasExistingPreferencesFile
      ? new Date().toISOString()
      : normalizeDesktopPreferenceTimestamp(value?.onboardingCompletedAt);
  const seenUnlockedNavItems = normalizeDesktopSeenUnlockedNavItems(
    value?.seenUnlockedNavItems,
    hasExistingPreferencesFile && value?.seenUnlockedNavItems === undefined,
  );

  return {
    language: value?.language === 'km' ? 'km' : 'en',
    currency: value?.currency === 'KHR' ? 'KHR' : 'USD',
    usdToKhrExchangeRate: normalizeUsdToKhrExchangeRate(value?.usdToKhrExchangeRate),
    displayViewMode,
    itemImageMode,
    dimChartsWhileLoading: normalizeBooleanPreference(value?.dimChartsWhileLoading, false),
    showExplanatoryTooltips,
    showFloatingTitleActions,
    showRightRailCards,
    showOverviewTaskTabs,
    showAutomationsPage,
    showAnalysisPage,
    showPerformanceCompareToggle,
    showPerformanceTimelineCard,
    showLogsViewToggle,
    showHeartbeatRibbons,
    taskBatchUpdatePreferences: normalizeDesktopTaskBatchUpdatePreferences(
      value?.taskBatchUpdatePreferences,
      legacyTaskBatchUpdateMode,
    ),
    customShowExplanatoryTooltips,
    customShowFloatingTitleActions,
    customShowRightRailCards,
    customShowOverviewTaskTabs,
    customShowAutomationsPage,
    customShowAnalysisPage,
    customShowPerformanceCompareToggle,
    customShowPerformanceTimelineCard,
    customShowLogsViewToggle,
    customShowHeartbeatRibbons,
    senaEngineParameters: normalizeSenaEngineParameters(value?.senaEngineParameters),
    overviewStaleUpdateReminderSnoozeUntil: normalizeDesktopPreferenceTimestamp(
      value?.overviewStaleUpdateReminderSnoozeUntil,
    ),
    onboardingCompletedAt,
    seenUnlockedNavItems,
    workbenchTileOrderByLane: normalizeDesktopWorkbenchTileOrderByLane(value?.workbenchTileOrderByLane),
  };
}

function isPreferencePatchRecord(value: unknown): value is Partial<DesktopPreferences> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function omitUndefinedPreferenceValues(next: unknown) {
  if (!isPreferencePatchRecord(next)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(next).filter(([, value]) => value !== undefined),
  ) as Partial<DesktopPreferences>;
}

export async function loadDesktopPreferences(userDataPath: string): Promise<DesktopPreferences> {
  let raw: string;
  try {
    raw = await readFile(preferencesPath(userDataPath), 'utf8');
  } catch (error) {
    if (isMissingPreferencesFile(error)) {
      return DEFAULT_PREFERENCES;
    }
    throw error;
  }

  if (!raw.trim()) {
    return DEFAULT_PREFERENCES;
  }

  const parsed = JSON.parse(raw) as Partial<DesktopPreferences>;
  return normalizePreferences(parsed, { hasExistingPreferencesFile: true });
}

export async function saveDesktopPreferences(
  userDataPath: string,
  next: Partial<DesktopPreferences>,
): Promise<DesktopPreferences> {
  const writeOperation = preferencesWriteQueue.then(async () => {
    const current = await loadDesktopPreferences(userDataPath);
    const definedNext = omitUndefinedPreferenceValues(next);
    const merged = normalizePreferences({
      ...current,
      ...definedNext,
    }, { hasExistingPreferencesFile: true });
    const path = preferencesPath(userDataPath);
    await mkdir(userDataPath, { recursive: true });
    const tempPath = `${path}.tmp`;
    await writeFile(tempPath, JSON.stringify(merged, null, 2), 'utf8');
    await rename(tempPath, path);
    return merged;
  });

  preferencesWriteQueue = writeOperation.then(
    () => undefined,
    () => undefined,
  );

  return writeOperation;
}
