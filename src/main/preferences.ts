import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  DEFAULT_DESKTOP_ITEM_IMAGE_MODE,
  DEFAULT_SENA_ENGINE_PARAMETERS,
  DEFAULT_TASK_BATCH_UPDATE_PREFERENCES,
  DEFAULT_USD_TO_KHR_EXCHANGE_RATE,
  normalizeDesktopPreferenceTimestamp,
  normalizeDesktopTaskBatchUpdatePreferences,
  normalizeSenaEngineParameters,
  type DesktopPreferences,
  type DesktopTaskBatchUpdatePreference,
} from '@shared/ipc';

const DEFAULT_PREFERENCES: DesktopPreferences = {
  language: 'en',
  currency: 'USD',
  usdToKhrExchangeRate: DEFAULT_USD_TO_KHR_EXCHANGE_RATE,
  displayViewMode: 'custom',
  itemImageMode: DEFAULT_DESKTOP_ITEM_IMAGE_MODE,
  dimChartsWhileLoading: false,
  showExplanatoryTooltips: true,
  showFloatingTitleActions: true,
  showRightRailCards: true,
  showOverviewTaskTabs: true,
  showAnalysisPage: true,
  showPerformanceCompareToggle: true,
  showPerformanceTimelineCard: true,
  showLogsViewToggle: true,
  showHeartbeatRibbons: true,
  taskBatchUpdatePreferences: DEFAULT_TASK_BATCH_UPDATE_PREFERENCES,
  customShowExplanatoryTooltips: true,
  customShowFloatingTitleActions: true,
  customShowRightRailCards: true,
  customShowOverviewTaskTabs: true,
  customShowAnalysisPage: true,
  customShowPerformanceCompareToggle: true,
  customShowPerformanceTimelineCard: true,
  customShowLogsViewToggle: true,
  customShowHeartbeatRibbons: true,
  senaEngineParameters: DEFAULT_SENA_ENGINE_PARAMETERS,
  overviewStaleUpdateReminderSnoozeUntil: null,
};
let preferencesWriteQueue: Promise<void> = Promise.resolve();

function preferencesPath(userDataPath: string) {
  return join(userDataPath, 'desktop-preferences.json');
}

function normalizeUsdToKhrExchangeRate(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_USD_TO_KHR_EXCHANGE_RATE;
}

function normalizePreferences(value: Partial<DesktopPreferences> | null | undefined): DesktopPreferences {
  const legacyTaskBatchUpdateMode = (value as Partial<DesktopPreferences> & {
    taskBatchUpdateMode?: DesktopTaskBatchUpdatePreference;
  } | null | undefined)?.taskBatchUpdateMode;
  const showExplanatoryTooltips = value?.showExplanatoryTooltips ?? true;
  const showFloatingTitleActions = value?.showFloatingTitleActions ?? true;
  const showRightRailCards = value?.showRightRailCards ?? true;
  const showOverviewTaskTabs = value?.showOverviewTaskTabs ?? true;
  const showAnalysisPage = value?.showAnalysisPage ?? true;
  const showPerformanceCompareToggle = value?.showPerformanceCompareToggle ?? true;
  const showPerformanceTimelineCard = value?.showPerformanceTimelineCard ?? true;
  const showLogsViewToggle = value?.showLogsViewToggle ?? true;
  const showHeartbeatRibbons = value?.showHeartbeatRibbons ?? true;
  const customShowExplanatoryTooltips = value?.customShowExplanatoryTooltips ?? showExplanatoryTooltips;
  const customShowFloatingTitleActions = value?.customShowFloatingTitleActions ?? showFloatingTitleActions;
  const customShowRightRailCards = value?.customShowRightRailCards ?? showRightRailCards;
  const customShowOverviewTaskTabs = value?.customShowOverviewTaskTabs ?? showOverviewTaskTabs;
  const customShowAnalysisPage = value?.customShowAnalysisPage ?? showAnalysisPage;
  const customShowPerformanceCompareToggle =
    value?.customShowPerformanceCompareToggle ?? showPerformanceCompareToggle;
  const customShowPerformanceTimelineCard =
    value?.customShowPerformanceTimelineCard ?? showPerformanceTimelineCard;
  const customShowLogsViewToggle = value?.customShowLogsViewToggle ?? showLogsViewToggle;
  const customShowHeartbeatRibbons = value?.customShowHeartbeatRibbons ?? showHeartbeatRibbons;
  const displayViewMode =
    value?.displayViewMode === 'compact' || value?.displayViewMode === 'custom'
      ? value.displayViewMode
      : !showExplanatoryTooltips &&
          !showFloatingTitleActions &&
          !showRightRailCards &&
          !showOverviewTaskTabs &&
          !showAnalysisPage &&
          !showPerformanceCompareToggle &&
          !showPerformanceTimelineCard &&
          !showLogsViewToggle &&
          !showHeartbeatRibbons
        ? 'compact'
        : 'custom';
  const itemImageMode =
    value?.itemImageMode === 'off' ||
    value?.itemImageMode === 'thumbnail' ||
    value?.itemImageMode === 'small' ||
    value?.itemImageMode === 'medium'
      ? value.itemImageMode
      : DEFAULT_DESKTOP_ITEM_IMAGE_MODE;

  return {
    language: value?.language === 'km' ? 'km' : 'en',
    currency: value?.currency === 'KHR' ? 'KHR' : 'USD',
    usdToKhrExchangeRate: normalizeUsdToKhrExchangeRate(value?.usdToKhrExchangeRate),
    displayViewMode,
    itemImageMode,
    dimChartsWhileLoading: value?.dimChartsWhileLoading ?? false,
    showExplanatoryTooltips,
    showFloatingTitleActions,
    showRightRailCards,
    showOverviewTaskTabs,
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
    customShowAnalysisPage,
    customShowPerformanceCompareToggle,
    customShowPerformanceTimelineCard,
    customShowLogsViewToggle,
    customShowHeartbeatRibbons,
    senaEngineParameters: normalizeSenaEngineParameters(value?.senaEngineParameters),
    overviewStaleUpdateReminderSnoozeUntil: normalizeDesktopPreferenceTimestamp(
      value?.overviewStaleUpdateReminderSnoozeUntil,
    ),
  };
}

export async function loadDesktopPreferences(userDataPath: string): Promise<DesktopPreferences> {
  try {
    const raw = await readFile(preferencesPath(userDataPath), 'utf8');
    if (!raw.trim()) {
      return DEFAULT_PREFERENCES;
    }
    const parsed = JSON.parse(raw) as Partial<DesktopPreferences>;
    return normalizePreferences(parsed);
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export async function saveDesktopPreferences(
  userDataPath: string,
  next: Partial<DesktopPreferences>,
): Promise<DesktopPreferences> {
  const writeOperation = preferencesWriteQueue.then(async () => {
    const current = await loadDesktopPreferences(userDataPath);
    const merged = normalizePreferences({
      ...current,
      ...next,
    });
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
