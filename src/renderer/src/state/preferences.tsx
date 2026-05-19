import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { AppCurrency, AppLanguage } from '@shared/inventory';
import {
  getInterfaceVisibilityForPreset,
  isPresetViewMode,
  resolveInterfaceViewMode,
  type InterfaceVisibilityPreferences,
  type InterfaceViewMode,
} from '@shared/interface-view';
import {
  DEFAULT_DESKTOP_SEEN_UNLOCKED_NAV_ITEMS,
  DEFAULT_DESKTOP_ITEM_IMAGE_MODE,
  DEFAULT_DESKTOP_WORKBENCH_TILE_ORDER_BY_LANE,
  DEFAULT_TASK_BATCH_UPDATE_PREFERENCES,
  DEFAULT_USD_TO_KHR_EXCHANGE_RATE,
  normalizeDesktopPreferenceTimestamp,
  normalizeDesktopSeenUnlockedNavItems,
  normalizeDesktopTaskBatchUpdatePreferences,
  normalizeDesktopWorkbenchTileOrderByLane,
  normalizeSenaEngineParameters,
  senaEngineParametersEqual,
  type DesktopItemImageMode,
  type DesktopSeenUnlockedNavItems,
  type DesktopTaskBatchUpdatePreference,
  type DesktopTaskBatchUpdatePreferences,
  type DesktopWorkbenchTileOrderByLane,
  type SenaEngineParameters,
} from '@shared/ipc';
import { DescriptionTextVisibilityProvider } from '@/components/system/description-text';
import { currencyLabel, getTranslation, type TranslationKey, type TranslationVariables } from '../lib/translations';

interface PreferencesContextValue {
  isHydrated: boolean;
  language: AppLanguage;
  currency: AppCurrency;
  usdToKhrExchangeRate: number;
  displayViewMode: InterfaceViewMode;
  itemImageMode: DesktopItemImageMode;
  dimChartsWhileLoading: boolean;
  taskBatchUpdatePreferences: DesktopTaskBatchUpdatePreferences;
  showExplanatoryTooltips: boolean;
  showFloatingTitleActions: boolean;
  showRightRailCards: boolean;
  showOverviewTaskTabs: boolean;
  showAutomationsPage: boolean;
  showAnalysisPage: boolean;
  showPerformanceCompareToggle: boolean;
  showPerformanceTimelineCard: boolean;
  showLogsViewToggle: boolean;
  showHeartbeatRibbons: boolean;
  customShowExplanatoryTooltips: boolean;
  customShowFloatingTitleActions: boolean;
  customShowRightRailCards: boolean;
  customShowOverviewTaskTabs: boolean;
  customShowAutomationsPage: boolean;
  customShowAnalysisPage: boolean;
  customShowPerformanceCompareToggle: boolean;
  customShowPerformanceTimelineCard: boolean;
  customShowLogsViewToggle: boolean;
  customShowHeartbeatRibbons: boolean;
  senaEngineParameters: SenaEngineParameters;
  overviewStaleUpdateReminderSnoozeUntil: string | null;
  onboardingCompletedAt: string | null;
  seenUnlockedNavItems: DesktopSeenUnlockedNavItems;
  workbenchTileOrderByLane: DesktopWorkbenchTileOrderByLane;
  persistedLanguage: AppLanguage;
  persistedCurrency: AppCurrency;
  persistedUsdToKhrExchangeRate: number;
  persistedDisplayViewMode: InterfaceViewMode;
  persistedItemImageMode: DesktopItemImageMode;
  persistedDimChartsWhileLoading: boolean;
  persistedShowExplanatoryTooltips: boolean;
  persistedShowFloatingTitleActions: boolean;
  persistedShowRightRailCards: boolean;
  persistedShowOverviewTaskTabs: boolean;
  persistedShowAutomationsPage: boolean;
  persistedShowAnalysisPage: boolean;
  persistedShowPerformanceCompareToggle: boolean;
  persistedShowPerformanceTimelineCard: boolean;
  persistedShowLogsViewToggle: boolean;
  persistedShowHeartbeatRibbons: boolean;
  persistedTaskBatchUpdatePreferences: DesktopTaskBatchUpdatePreferences;
  persistedCustomShowExplanatoryTooltips: boolean;
  persistedCustomShowFloatingTitleActions: boolean;
  persistedCustomShowRightRailCards: boolean;
  persistedCustomShowOverviewTaskTabs: boolean;
  persistedCustomShowAutomationsPage: boolean;
  persistedCustomShowAnalysisPage: boolean;
  persistedCustomShowPerformanceCompareToggle: boolean;
  persistedCustomShowPerformanceTimelineCard: boolean;
  persistedCustomShowLogsViewToggle: boolean;
  persistedCustomShowHeartbeatRibbons: boolean;
  persistedSenaEngineParameters: SenaEngineParameters;
  persistedOverviewStaleUpdateReminderSnoozeUntil: string | null;
  persistedOnboardingCompletedAt: string | null;
  persistedSeenUnlockedNavItems: DesktopSeenUnlockedNavItems;
  persistedWorkbenchTileOrderByLane: DesktopWorkbenchTileOrderByLane;
  setLanguage: (value: AppLanguage) => void;
  setCurrency: (value: AppCurrency) => void;
  setUsdToKhrExchangeRate: (value: number) => void;
  setDisplayViewMode: (value: InterfaceViewMode) => void;
  setItemImageMode: (value: DesktopItemImageMode) => void;
  setDimChartsWhileLoading: (value: boolean) => void;
  setShowExplanatoryTooltips: (value: boolean) => void;
  setShowFloatingTitleActions: (value: boolean) => void;
  setShowRightRailCards: (value: boolean) => void;
  setShowOverviewTaskTabs: (value: boolean) => void;
  setShowAutomationsPage: (value: boolean) => void;
  setShowAnalysisPage: (value: boolean) => void;
  setShowPerformanceCompareToggle: (value: boolean) => void;
  setShowPerformanceTimelineCard: (value: boolean) => void;
  setShowLogsViewToggle: (value: boolean) => void;
  setShowHeartbeatRibbons: (value: boolean) => void;
  setTaskBatchUpdatePreference: (
    key: keyof DesktopTaskBatchUpdatePreferences,
    value: DesktopTaskBatchUpdatePreference,
  ) => void;
  setSenaEngineParameters: (value: SenaEngineParameters) => void;
  setOverviewStaleUpdateReminderSnoozeUntil: (value: string | null) => void;
  applySenaEngineParameters: (value: SenaEngineParameters) => Promise<void>;
  applyOverviewStaleUpdateReminderSnoozeUntil: (value: string | null) => Promise<void>;
  applyDisplayViewMode: (mode: InterfaceViewMode) => Promise<void>;
  savePreferences: (overrides?: Partial<{
    language: AppLanguage;
    currency: AppCurrency;
    usdToKhrExchangeRate: number;
    displayViewMode: InterfaceViewMode;
    itemImageMode: DesktopItemImageMode;
    dimChartsWhileLoading: boolean;
    showExplanatoryTooltips: boolean;
    showFloatingTitleActions: boolean;
    showRightRailCards: boolean;
    showOverviewTaskTabs: boolean;
    showAutomationsPage: boolean;
    showAnalysisPage: boolean;
    showPerformanceCompareToggle: boolean;
    showPerformanceTimelineCard: boolean;
    showLogsViewToggle: boolean;
    showHeartbeatRibbons: boolean;
    customShowExplanatoryTooltips: boolean;
    customShowFloatingTitleActions: boolean;
    customShowRightRailCards: boolean;
    customShowOverviewTaskTabs: boolean;
    customShowAutomationsPage: boolean;
    customShowAnalysisPage: boolean;
    customShowPerformanceCompareToggle: boolean;
    customShowPerformanceTimelineCard: boolean;
    customShowLogsViewToggle: boolean;
    customShowHeartbeatRibbons: boolean;
    taskBatchUpdatePreferences: DesktopTaskBatchUpdatePreferences;
    senaEngineParameters: SenaEngineParameters;
    overviewStaleUpdateReminderSnoozeUntil: string | null;
    onboardingCompletedAt: string | null;
    seenUnlockedNavItems: DesktopSeenUnlockedNavItems;
    workbenchTileOrderByLane: DesktopWorkbenchTileOrderByLane;
  }>) => Promise<void>;
  markUnlockedNavItemSeen: (itemId: keyof DesktopSeenUnlockedNavItems) => Promise<void>;
  resetPreferences: () => void;
  hasPendingChanges: boolean;
  t: (key: TranslationKey, variables?: TranslationVariables) => string;
  rawT: (key: TranslationKey, variables?: TranslationVariables) => string;
  currencyLabel: (value: AppCurrency) => string;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

function normalizeUsdToKhrExchangeRate(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_USD_TO_KHR_EXCHANGE_RATE;
}

function deriveInterfaceViewMode(preferences: InterfaceVisibilityPreferences & { displayViewMode?: InterfaceViewMode | null }) {
  return resolveInterfaceViewMode({
    requestedMode: preferences.displayViewMode ?? null,
    visibility: {
    ...preferences,
    showAnalysisPage: true,
    },
  });
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [isHydrated, setIsHydrated] = useState(false);
  const [language, setLanguageState] = useState<AppLanguage>('en');
  const [currency, setCurrencyState] = useState<AppCurrency>('USD');
  const [usdToKhrExchangeRate, setUsdToKhrExchangeRateState] = useState(DEFAULT_USD_TO_KHR_EXCHANGE_RATE);
  const [displayViewMode, setDisplayViewModeState] = useState<InterfaceViewMode>('default');
  const [itemImageMode, setItemImageModeState] = useState<DesktopItemImageMode>(DEFAULT_DESKTOP_ITEM_IMAGE_MODE);
  const [dimChartsWhileLoading, setDimChartsWhileLoadingState] = useState(false);
  const [showExplanatoryTooltips, setShowExplanatoryTooltipsState] = useState(true);
  const [showFloatingTitleActions, setShowFloatingTitleActionsState] = useState(true);
  const [showRightRailCards, setShowRightRailCardsState] = useState(false);
  const [showOverviewTaskTabs, setShowOverviewTaskTabsState] = useState(true);
  const [showAutomationsPage, setShowAutomationsPageState] = useState(false);
  const [showAnalysisPage, setShowAnalysisPageState] = useState(true);
  const [showPerformanceCompareToggle, setShowPerformanceCompareToggleState] = useState(false);
  const [showPerformanceTimelineCard, setShowPerformanceTimelineCardState] = useState(false);
  const [showLogsViewToggle, setShowLogsViewToggleState] = useState(false);
  const [showHeartbeatRibbons, setShowHeartbeatRibbonsState] = useState(true);
  const [taskBatchUpdatePreferences, setTaskBatchUpdatePreferencesState] =
    useState<DesktopTaskBatchUpdatePreferences>(DEFAULT_TASK_BATCH_UPDATE_PREFERENCES);
  const [customShowExplanatoryTooltips, setCustomShowExplanatoryTooltipsState] = useState(true);
  const [customShowFloatingTitleActions, setCustomShowFloatingTitleActionsState] = useState(true);
  const [customShowRightRailCards, setCustomShowRightRailCardsState] = useState(false);
  const [customShowOverviewTaskTabs, setCustomShowOverviewTaskTabsState] = useState(true);
  const [customShowAutomationsPage, setCustomShowAutomationsPageState] = useState(false);
  const [customShowAnalysisPage, setCustomShowAnalysisPageState] = useState(true);
  const [customShowPerformanceCompareToggle, setCustomShowPerformanceCompareToggleState] = useState(false);
  const [customShowPerformanceTimelineCard, setCustomShowPerformanceTimelineCardState] = useState(false);
  const [customShowLogsViewToggle, setCustomShowLogsViewToggleState] = useState(false);
  const [customShowHeartbeatRibbons, setCustomShowHeartbeatRibbonsState] = useState(true);
  const [senaEngineParameters, setSenaEngineParametersState] = useState(() =>
    normalizeSenaEngineParameters(null),
  );
  const [overviewStaleUpdateReminderSnoozeUntil, setOverviewStaleUpdateReminderSnoozeUntilState] =
    useState<string | null>(null);
  const [onboardingCompletedAt, setOnboardingCompletedAtState] = useState<string | null>(null);
  const [seenUnlockedNavItems, setSeenUnlockedNavItemsState] = useState<DesktopSeenUnlockedNavItems>(
    DEFAULT_DESKTOP_SEEN_UNLOCKED_NAV_ITEMS,
  );
  const seenUnlockedNavItemsRef = useRef<DesktopSeenUnlockedNavItems>(
    DEFAULT_DESKTOP_SEEN_UNLOCKED_NAV_ITEMS,
  );
  const saveRequestSeqRef = useRef(0);
  const [workbenchTileOrderByLane, setWorkbenchTileOrderByLaneState] = useState<DesktopWorkbenchTileOrderByLane>(
    DEFAULT_DESKTOP_WORKBENCH_TILE_ORDER_BY_LANE,
  );
  const [persistedLanguage, setPersistedLanguage] = useState<AppLanguage>('en');
  const [persistedCurrency, setPersistedCurrency] = useState<AppCurrency>('USD');
  const [persistedUsdToKhrExchangeRate, setPersistedUsdToKhrExchangeRate] = useState(DEFAULT_USD_TO_KHR_EXCHANGE_RATE);
  const [persistedDisplayViewMode, setPersistedDisplayViewMode] = useState<InterfaceViewMode>('default');
  const [persistedItemImageMode, setPersistedItemImageMode] =
    useState<DesktopItemImageMode>(DEFAULT_DESKTOP_ITEM_IMAGE_MODE);
  const [persistedDimChartsWhileLoading, setPersistedDimChartsWhileLoading] = useState(false);
  const [persistedShowExplanatoryTooltips, setPersistedShowExplanatoryTooltips] = useState(true);
  const [persistedShowFloatingTitleActions, setPersistedShowFloatingTitleActions] = useState(true);
  const [persistedShowRightRailCards, setPersistedShowRightRailCards] = useState(false);
  const [persistedShowOverviewTaskTabs, setPersistedShowOverviewTaskTabs] = useState(true);
  const [persistedShowAutomationsPage, setPersistedShowAutomationsPage] = useState(false);
  const [persistedShowAnalysisPage, setPersistedShowAnalysisPage] = useState(true);
  const [persistedShowPerformanceCompareToggle, setPersistedShowPerformanceCompareToggle] = useState(false);
  const [persistedShowPerformanceTimelineCard, setPersistedShowPerformanceTimelineCard] = useState(false);
  const [persistedShowLogsViewToggle, setPersistedShowLogsViewToggle] = useState(false);
  const [persistedShowHeartbeatRibbons, setPersistedShowHeartbeatRibbons] = useState(true);
  const [persistedTaskBatchUpdatePreferences, setPersistedTaskBatchUpdatePreferences] =
    useState<DesktopTaskBatchUpdatePreferences>(DEFAULT_TASK_BATCH_UPDATE_PREFERENCES);
  const [persistedCustomShowExplanatoryTooltips, setPersistedCustomShowExplanatoryTooltips] = useState(true);
  const [persistedCustomShowFloatingTitleActions, setPersistedCustomShowFloatingTitleActions] = useState(true);
  const [persistedCustomShowRightRailCards, setPersistedCustomShowRightRailCards] = useState(false);
  const [persistedCustomShowOverviewTaskTabs, setPersistedCustomShowOverviewTaskTabs] = useState(true);
  const [persistedCustomShowAutomationsPage, setPersistedCustomShowAutomationsPage] = useState(false);
  const [persistedCustomShowAnalysisPage, setPersistedCustomShowAnalysisPage] = useState(true);
  const [persistedCustomShowPerformanceCompareToggle, setPersistedCustomShowPerformanceCompareToggle] = useState(false);
  const [persistedCustomShowPerformanceTimelineCard, setPersistedCustomShowPerformanceTimelineCard] = useState(false);
  const [persistedCustomShowLogsViewToggle, setPersistedCustomShowLogsViewToggle] = useState(false);
  const [persistedCustomShowHeartbeatRibbons, setPersistedCustomShowHeartbeatRibbons] = useState(true);
  const [persistedSenaEngineParameters, setPersistedSenaEngineParameters] = useState(() =>
    normalizeSenaEngineParameters(null),
  );
  const [persistedOverviewStaleUpdateReminderSnoozeUntil, setPersistedOverviewStaleUpdateReminderSnoozeUntil] =
    useState<string | null>(null);
  const [persistedOnboardingCompletedAt, setPersistedOnboardingCompletedAt] = useState<string | null>(null);
  const [persistedSeenUnlockedNavItems, setPersistedSeenUnlockedNavItems] = useState<DesktopSeenUnlockedNavItems>(
    DEFAULT_DESKTOP_SEEN_UNLOCKED_NAV_ITEMS,
  );
  const [persistedWorkbenchTileOrderByLane, setPersistedWorkbenchTileOrderByLane] = useState<DesktopWorkbenchTileOrderByLane>(
    DEFAULT_DESKTOP_WORKBENCH_TILE_ORDER_BY_LANE,
  );

  useEffect(() => {
    let mounted = true;

    window.kaurKhorDesktop.preferences
      .get()
      .then((preferences) => {
        if (!mounted) {
          return;
        }

        const nextSenaEngineParameters = normalizeSenaEngineParameters(preferences.senaEngineParameters);
        const nextSeenUnlockedNavItems = normalizeDesktopSeenUnlockedNavItems(preferences.seenUnlockedNavItems);
        const nextWorkbenchTileOrderByLane = normalizeDesktopWorkbenchTileOrderByLane(
          preferences.workbenchTileOrderByLane,
        );
        const nextDisplayViewMode = deriveInterfaceViewMode(preferences);

        setLanguageState(preferences.language);
        setCurrencyState(preferences.currency);
        const nextUsdToKhrExchangeRate = normalizeUsdToKhrExchangeRate(preferences.usdToKhrExchangeRate);

        setUsdToKhrExchangeRateState(nextUsdToKhrExchangeRate);
        setDisplayViewModeState(nextDisplayViewMode);
        setItemImageModeState(preferences.itemImageMode);
        setDimChartsWhileLoadingState(preferences.dimChartsWhileLoading);
        setShowExplanatoryTooltipsState(preferences.showExplanatoryTooltips);
        setShowFloatingTitleActionsState(preferences.showFloatingTitleActions);
        setShowRightRailCardsState(preferences.showRightRailCards);
        setShowOverviewTaskTabsState(preferences.showOverviewTaskTabs);
        setShowAutomationsPageState(preferences.showAutomationsPage);
        setShowAnalysisPageState(true);
        setShowPerformanceCompareToggleState(preferences.showPerformanceCompareToggle);
        setShowPerformanceTimelineCardState(preferences.showPerformanceTimelineCard);
        setShowLogsViewToggleState(preferences.showLogsViewToggle);
        setShowHeartbeatRibbonsState(preferences.showHeartbeatRibbons);
        const nextTaskBatchUpdatePreferences = normalizeDesktopTaskBatchUpdatePreferences(
          preferences.taskBatchUpdatePreferences,
        );
        setTaskBatchUpdatePreferencesState(nextTaskBatchUpdatePreferences);
        setCustomShowExplanatoryTooltipsState(preferences.customShowExplanatoryTooltips);
        setCustomShowFloatingTitleActionsState(preferences.customShowFloatingTitleActions);
        setCustomShowRightRailCardsState(preferences.customShowRightRailCards);
        setCustomShowOverviewTaskTabsState(preferences.customShowOverviewTaskTabs);
        setCustomShowAutomationsPageState(preferences.customShowAutomationsPage);
        setCustomShowAnalysisPageState(true);
        setCustomShowPerformanceCompareToggleState(preferences.customShowPerformanceCompareToggle);
        setCustomShowPerformanceTimelineCardState(preferences.customShowPerformanceTimelineCard);
        setCustomShowLogsViewToggleState(preferences.customShowLogsViewToggle);
        setCustomShowHeartbeatRibbonsState(preferences.customShowHeartbeatRibbons);
        setSenaEngineParametersState(nextSenaEngineParameters);
        setOverviewStaleUpdateReminderSnoozeUntilState(
          normalizeDesktopPreferenceTimestamp(preferences.overviewStaleUpdateReminderSnoozeUntil),
        );
        setOnboardingCompletedAtState(normalizeDesktopPreferenceTimestamp(preferences.onboardingCompletedAt));
        seenUnlockedNavItemsRef.current = nextSeenUnlockedNavItems;
        setSeenUnlockedNavItemsState(nextSeenUnlockedNavItems);
        setWorkbenchTileOrderByLaneState(nextWorkbenchTileOrderByLane);
        setPersistedLanguage(preferences.language);
        setPersistedCurrency(preferences.currency);
        setPersistedUsdToKhrExchangeRate(nextUsdToKhrExchangeRate);
        setPersistedDisplayViewMode(nextDisplayViewMode);
        setPersistedItemImageMode(preferences.itemImageMode);
        setPersistedDimChartsWhileLoading(preferences.dimChartsWhileLoading);
        setPersistedShowExplanatoryTooltips(preferences.showExplanatoryTooltips);
        setPersistedShowFloatingTitleActions(preferences.showFloatingTitleActions);
        setPersistedShowRightRailCards(preferences.showRightRailCards);
        setPersistedShowOverviewTaskTabs(preferences.showOverviewTaskTabs);
        setPersistedShowAutomationsPage(preferences.showAutomationsPage);
        setPersistedShowAnalysisPage(true);
        setPersistedShowPerformanceCompareToggle(preferences.showPerformanceCompareToggle);
        setPersistedShowPerformanceTimelineCard(preferences.showPerformanceTimelineCard);
        setPersistedShowLogsViewToggle(preferences.showLogsViewToggle);
        setPersistedShowHeartbeatRibbons(preferences.showHeartbeatRibbons);
        setPersistedTaskBatchUpdatePreferences(nextTaskBatchUpdatePreferences);
        setPersistedCustomShowExplanatoryTooltips(preferences.customShowExplanatoryTooltips);
        setPersistedCustomShowFloatingTitleActions(preferences.customShowFloatingTitleActions);
        setPersistedCustomShowRightRailCards(preferences.customShowRightRailCards);
        setPersistedCustomShowOverviewTaskTabs(preferences.customShowOverviewTaskTabs);
        setPersistedCustomShowAutomationsPage(preferences.customShowAutomationsPage);
        setPersistedCustomShowAnalysisPage(true);
        setPersistedCustomShowPerformanceCompareToggle(preferences.customShowPerformanceCompareToggle);
        setPersistedCustomShowPerformanceTimelineCard(preferences.customShowPerformanceTimelineCard);
        setPersistedCustomShowLogsViewToggle(preferences.customShowLogsViewToggle);
        setPersistedCustomShowHeartbeatRibbons(preferences.customShowHeartbeatRibbons);
        setPersistedSenaEngineParameters(nextSenaEngineParameters);
        setPersistedOverviewStaleUpdateReminderSnoozeUntil(
          normalizeDesktopPreferenceTimestamp(preferences.overviewStaleUpdateReminderSnoozeUntil),
        );
        setPersistedOnboardingCompletedAt(normalizeDesktopPreferenceTimestamp(preferences.onboardingCompletedAt));
        setPersistedSeenUnlockedNavItems(nextSeenUnlockedNavItems);
        setPersistedWorkbenchTileOrderByLane(nextWorkbenchTileOrderByLane);
        setIsHydrated(true);
      })
      .catch((error) => {
        if (!mounted) {
          return;
        }
        console.error('failed to load desktop preferences', error);
        setIsHydrated(true);
      });

    return () => {
      mounted = false;
    };
  }, []);

  async function savePreferencesPatch(next: Partial<{
    language: AppLanguage;
    currency: AppCurrency;
    usdToKhrExchangeRate: number;
    displayViewMode: InterfaceViewMode;
    itemImageMode: DesktopItemImageMode;
    dimChartsWhileLoading: boolean;
    showExplanatoryTooltips: boolean;
    showFloatingTitleActions: boolean;
    showRightRailCards: boolean;
    showOverviewTaskTabs: boolean;
    showAutomationsPage: boolean;
    showAnalysisPage: boolean;
    showPerformanceCompareToggle: boolean;
    showPerformanceTimelineCard: boolean;
    showLogsViewToggle: boolean;
    showHeartbeatRibbons: boolean;
    customShowExplanatoryTooltips: boolean;
    customShowFloatingTitleActions: boolean;
    customShowRightRailCards: boolean;
    customShowOverviewTaskTabs: boolean;
    customShowAutomationsPage: boolean;
    customShowAnalysisPage: boolean;
    customShowPerformanceCompareToggle: boolean;
    customShowPerformanceTimelineCard: boolean;
    customShowLogsViewToggle: boolean;
    customShowHeartbeatRibbons: boolean;
    taskBatchUpdatePreferences: DesktopTaskBatchUpdatePreferences;
    senaEngineParameters: SenaEngineParameters;
    overviewStaleUpdateReminderSnoozeUntil: string | null;
    onboardingCompletedAt: string | null;
    seenUnlockedNavItems: DesktopSeenUnlockedNavItems;
    workbenchTileOrderByLane: DesktopWorkbenchTileOrderByLane;
  }>, options: { applyResponse?: boolean } = {}) {
    const requestId = saveRequestSeqRef.current + 1;
    saveRequestSeqRef.current = requestId;
    const nextPreferences = await window.kaurKhorDesktop.preferences.save(next);
    const isLatestResponse = requestId === saveRequestSeqRef.current;
    if (options.applyResponse === false || !isLatestResponse) {
      return { isLatestResponse, preferences: nextPreferences };
    }
    const nextSenaEngineParameters = normalizeSenaEngineParameters(nextPreferences.senaEngineParameters);
    const nextOverviewStaleUpdateReminderSnoozeUntil = normalizeDesktopPreferenceTimestamp(
      nextPreferences.overviewStaleUpdateReminderSnoozeUntil,
    );
    const nextSeenUnlockedNavItems = normalizeDesktopSeenUnlockedNavItems(nextPreferences.seenUnlockedNavItems);
    const nextWorkbenchTileOrderByLane = normalizeDesktopWorkbenchTileOrderByLane(
      nextPreferences.workbenchTileOrderByLane,
    );
    const nextDisplayViewMode = deriveInterfaceViewMode(nextPreferences);
    setLanguageState(nextPreferences.language);
    setCurrencyState(nextPreferences.currency);
    const nextUsdToKhrExchangeRate = normalizeUsdToKhrExchangeRate(nextPreferences.usdToKhrExchangeRate);
    setUsdToKhrExchangeRateState(nextUsdToKhrExchangeRate);
    setDisplayViewModeState(nextDisplayViewMode);
    setItemImageModeState(nextPreferences.itemImageMode);
    setDimChartsWhileLoadingState(nextPreferences.dimChartsWhileLoading);
    setShowExplanatoryTooltipsState(nextPreferences.showExplanatoryTooltips);
    setShowFloatingTitleActionsState(nextPreferences.showFloatingTitleActions);
    setShowRightRailCardsState(nextPreferences.showRightRailCards);
    setShowOverviewTaskTabsState(nextPreferences.showOverviewTaskTabs);
    setShowAutomationsPageState(nextPreferences.showAutomationsPage);
    setShowAnalysisPageState(true);
    setShowPerformanceCompareToggleState(nextPreferences.showPerformanceCompareToggle);
    setShowPerformanceTimelineCardState(nextPreferences.showPerformanceTimelineCard);
    setShowLogsViewToggleState(nextPreferences.showLogsViewToggle);
    setShowHeartbeatRibbonsState(nextPreferences.showHeartbeatRibbons);
    const nextTaskBatchUpdatePreferences = normalizeDesktopTaskBatchUpdatePreferences(
      nextPreferences.taskBatchUpdatePreferences,
    );
    setTaskBatchUpdatePreferencesState(nextTaskBatchUpdatePreferences);
    setCustomShowExplanatoryTooltipsState(nextPreferences.customShowExplanatoryTooltips);
    setCustomShowFloatingTitleActionsState(nextPreferences.customShowFloatingTitleActions);
    setCustomShowRightRailCardsState(nextPreferences.customShowRightRailCards);
    setCustomShowOverviewTaskTabsState(nextPreferences.customShowOverviewTaskTabs);
    setCustomShowAutomationsPageState(nextPreferences.customShowAutomationsPage);
    setCustomShowAnalysisPageState(true);
    setCustomShowPerformanceCompareToggleState(nextPreferences.customShowPerformanceCompareToggle);
    setCustomShowPerformanceTimelineCardState(nextPreferences.customShowPerformanceTimelineCard);
    setCustomShowLogsViewToggleState(nextPreferences.customShowLogsViewToggle);
    setCustomShowHeartbeatRibbonsState(nextPreferences.customShowHeartbeatRibbons);
    setSenaEngineParametersState(nextSenaEngineParameters);
    setOverviewStaleUpdateReminderSnoozeUntilState(nextOverviewStaleUpdateReminderSnoozeUntil);
    setOnboardingCompletedAtState(normalizeDesktopPreferenceTimestamp(nextPreferences.onboardingCompletedAt));
    seenUnlockedNavItemsRef.current = nextSeenUnlockedNavItems;
    setSeenUnlockedNavItemsState(nextSeenUnlockedNavItems);
    setWorkbenchTileOrderByLaneState(nextWorkbenchTileOrderByLane);
    setPersistedLanguage(nextPreferences.language);
    setPersistedCurrency(nextPreferences.currency);
    setPersistedUsdToKhrExchangeRate(nextUsdToKhrExchangeRate);
    setPersistedDisplayViewMode(nextDisplayViewMode);
    setPersistedItemImageMode(nextPreferences.itemImageMode);
    setPersistedDimChartsWhileLoading(nextPreferences.dimChartsWhileLoading);
    setPersistedShowExplanatoryTooltips(nextPreferences.showExplanatoryTooltips);
    setPersistedShowFloatingTitleActions(nextPreferences.showFloatingTitleActions);
    setPersistedShowRightRailCards(nextPreferences.showRightRailCards);
    setPersistedShowOverviewTaskTabs(nextPreferences.showOverviewTaskTabs);
    setPersistedShowAutomationsPage(nextPreferences.showAutomationsPage);
    setPersistedShowAnalysisPage(true);
    setPersistedShowPerformanceCompareToggle(nextPreferences.showPerformanceCompareToggle);
    setPersistedShowPerformanceTimelineCard(nextPreferences.showPerformanceTimelineCard);
    setPersistedShowLogsViewToggle(nextPreferences.showLogsViewToggle);
    setPersistedShowHeartbeatRibbons(nextPreferences.showHeartbeatRibbons);
    setPersistedTaskBatchUpdatePreferences(nextTaskBatchUpdatePreferences);
    setPersistedCustomShowExplanatoryTooltips(nextPreferences.customShowExplanatoryTooltips);
    setPersistedCustomShowFloatingTitleActions(nextPreferences.customShowFloatingTitleActions);
    setPersistedCustomShowRightRailCards(nextPreferences.customShowRightRailCards);
    setPersistedCustomShowOverviewTaskTabs(nextPreferences.customShowOverviewTaskTabs);
    setPersistedCustomShowAutomationsPage(nextPreferences.customShowAutomationsPage);
    setPersistedCustomShowAnalysisPage(true);
    setPersistedCustomShowPerformanceCompareToggle(nextPreferences.customShowPerformanceCompareToggle);
    setPersistedCustomShowPerformanceTimelineCard(nextPreferences.customShowPerformanceTimelineCard);
    setPersistedCustomShowLogsViewToggle(nextPreferences.customShowLogsViewToggle);
    setPersistedCustomShowHeartbeatRibbons(nextPreferences.customShowHeartbeatRibbons);
    setPersistedSenaEngineParameters(nextSenaEngineParameters);
    setPersistedOverviewStaleUpdateReminderSnoozeUntil(nextOverviewStaleUpdateReminderSnoozeUntil);
    setPersistedOnboardingCompletedAt(normalizeDesktopPreferenceTimestamp(nextPreferences.onboardingCompletedAt));
    setPersistedSeenUnlockedNavItems(nextSeenUnlockedNavItems);
    setPersistedWorkbenchTileOrderByLane(nextWorkbenchTileOrderByLane);
    return { isLatestResponse: true, preferences: nextPreferences };
  }

  function currentInterfaceVisibility(overrides: Partial<InterfaceVisibilityPreferences> = {}) {
    return {
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
      ...overrides,
    } satisfies InterfaceVisibilityPreferences;
  }

  function setInterfaceVisibilityStates(next: InterfaceVisibilityPreferences, updateCustom = true) {
    setShowExplanatoryTooltipsState(next.showExplanatoryTooltips);
    setShowFloatingTitleActionsState(next.showFloatingTitleActions);
    setShowRightRailCardsState(next.showRightRailCards);
    setShowOverviewTaskTabsState(next.showOverviewTaskTabs);
    setShowAutomationsPageState(next.showAutomationsPage);
    setShowAnalysisPageState(true);
    setShowPerformanceCompareToggleState(next.showPerformanceCompareToggle);
    setShowPerformanceTimelineCardState(next.showPerformanceTimelineCard);
    setShowLogsViewToggleState(next.showLogsViewToggle);
    setShowHeartbeatRibbonsState(next.showHeartbeatRibbons);

    if (!updateCustom) {
      return;
    }
    setCustomShowExplanatoryTooltipsState(next.showExplanatoryTooltips);
    setCustomShowFloatingTitleActionsState(next.showFloatingTitleActions);
    setCustomShowRightRailCardsState(next.showRightRailCards);
    setCustomShowOverviewTaskTabsState(next.showOverviewTaskTabs);
    setCustomShowAutomationsPageState(next.showAutomationsPage);
    setCustomShowAnalysisPageState(true);
    setCustomShowPerformanceCompareToggleState(next.showPerformanceCompareToggle);
    setCustomShowPerformanceTimelineCardState(next.showPerformanceTimelineCard);
    setCustomShowLogsViewToggleState(next.showLogsViewToggle);
    setCustomShowHeartbeatRibbonsState(next.showHeartbeatRibbons);
  }

  function setCustomInterfaceVisibilityStates(next: InterfaceVisibilityPreferences) {
    setCustomShowExplanatoryTooltipsState(next.showExplanatoryTooltips);
    setCustomShowFloatingTitleActionsState(next.showFloatingTitleActions);
    setCustomShowRightRailCardsState(next.showRightRailCards);
    setCustomShowOverviewTaskTabsState(next.showOverviewTaskTabs);
    setCustomShowAutomationsPageState(next.showAutomationsPage);
    setCustomShowAnalysisPageState(true);
    setCustomShowPerformanceCompareToggleState(next.showPerformanceCompareToggle);
    setCustomShowPerformanceTimelineCardState(next.showPerformanceTimelineCard);
    setCustomShowLogsViewToggleState(next.showLogsViewToggle);
    setCustomShowHeartbeatRibbonsState(next.showHeartbeatRibbons);
  }

  const value = useMemo<PreferencesContextValue>(
    () => ({
      isHydrated,
      language,
      currency,
      usdToKhrExchangeRate,
      displayViewMode,
      itemImageMode,
      dimChartsWhileLoading,
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
      taskBatchUpdatePreferences,
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
      senaEngineParameters,
      overviewStaleUpdateReminderSnoozeUntil,
      onboardingCompletedAt,
      seenUnlockedNavItems,
      workbenchTileOrderByLane,
      persistedLanguage,
      persistedCurrency,
      persistedUsdToKhrExchangeRate,
      persistedDisplayViewMode,
      persistedItemImageMode,
      persistedDimChartsWhileLoading,
      persistedShowExplanatoryTooltips,
      persistedShowFloatingTitleActions,
      persistedShowRightRailCards,
      persistedShowOverviewTaskTabs,
      persistedShowAutomationsPage,
      persistedShowAnalysisPage,
      persistedShowPerformanceCompareToggle,
      persistedShowPerformanceTimelineCard,
      persistedShowLogsViewToggle,
      persistedShowHeartbeatRibbons,
      persistedTaskBatchUpdatePreferences,
      persistedCustomShowExplanatoryTooltips,
      persistedCustomShowFloatingTitleActions,
      persistedCustomShowRightRailCards,
      persistedCustomShowOverviewTaskTabs,
      persistedCustomShowAutomationsPage,
      persistedCustomShowAnalysisPage,
      persistedCustomShowPerformanceCompareToggle,
      persistedCustomShowPerformanceTimelineCard,
      persistedCustomShowLogsViewToggle,
      persistedCustomShowHeartbeatRibbons,
      persistedSenaEngineParameters,
      persistedOverviewStaleUpdateReminderSnoozeUntil,
      persistedOnboardingCompletedAt,
      persistedSeenUnlockedNavItems,
      persistedWorkbenchTileOrderByLane,
      setLanguage: setLanguageState,
      setCurrency: setCurrencyState,
      setUsdToKhrExchangeRate: setUsdToKhrExchangeRateState,
      setItemImageMode: setItemImageModeState,
      setDimChartsWhileLoading: setDimChartsWhileLoadingState,
      setDisplayViewMode: (next) => {
        setDisplayViewModeState(next);
        if (isPresetViewMode(next)) {
          setInterfaceVisibilityStates(getInterfaceVisibilityForPreset(next), false);
          return;
        }

        setInterfaceVisibilityStates({
          showExplanatoryTooltips: customShowExplanatoryTooltips,
          showFloatingTitleActions: customShowFloatingTitleActions,
          showRightRailCards: customShowRightRailCards,
          showOverviewTaskTabs: customShowOverviewTaskTabs,
          showAutomationsPage: customShowAutomationsPage,
          showAnalysisPage: customShowAnalysisPage,
          showPerformanceCompareToggle: customShowPerformanceCompareToggle,
          showPerformanceTimelineCard: customShowPerformanceTimelineCard,
          showLogsViewToggle: customShowLogsViewToggle,
          showHeartbeatRibbons: customShowHeartbeatRibbons,
        }, false);
      },
      setShowExplanatoryTooltips: (next) => {
        const nextVisibility = currentInterfaceVisibility({ showExplanatoryTooltips: next });
        const nextMode = displayViewMode === 'custom'
          ? 'custom'
          : resolveInterfaceViewMode({ requestedMode: displayViewMode, visibility: nextVisibility });
        setDisplayViewModeState(nextMode);
        setShowExplanatoryTooltipsState(next);
        if (nextMode === 'custom') {
          setCustomInterfaceVisibilityStates(nextVisibility);
        }
      },
      setShowFloatingTitleActions: (next) => {
        const nextVisibility = currentInterfaceVisibility({ showFloatingTitleActions: next });
        const nextMode = displayViewMode === 'custom'
          ? 'custom'
          : resolveInterfaceViewMode({ requestedMode: displayViewMode, visibility: nextVisibility });
        setDisplayViewModeState(nextMode);
        setShowFloatingTitleActionsState(next);
        if (nextMode === 'custom') {
          setCustomInterfaceVisibilityStates(nextVisibility);
        }
      },
      setShowRightRailCards: (next) => {
        const nextVisibility = currentInterfaceVisibility({ showRightRailCards: next });
        const nextMode = displayViewMode === 'custom'
          ? 'custom'
          : resolveInterfaceViewMode({ requestedMode: displayViewMode, visibility: nextVisibility });
        setDisplayViewModeState(nextMode);
        setShowRightRailCardsState(next);
        if (nextMode === 'custom') {
          setCustomInterfaceVisibilityStates(nextVisibility);
        }
      },
      setShowOverviewTaskTabs: (next) => {
        const nextVisibility = currentInterfaceVisibility({ showOverviewTaskTabs: next });
        const nextMode = displayViewMode === 'custom'
          ? 'custom'
          : resolveInterfaceViewMode({ requestedMode: displayViewMode, visibility: nextVisibility });
        setDisplayViewModeState(nextMode);
        setShowOverviewTaskTabsState(next);
        if (nextMode === 'custom') {
          setCustomInterfaceVisibilityStates(nextVisibility);
        }
      },
      setShowAutomationsPage: (next) => {
        const nextVisibility = currentInterfaceVisibility({ showAutomationsPage: next });
        const nextMode = displayViewMode === 'custom'
          ? 'custom'
          : resolveInterfaceViewMode({ requestedMode: displayViewMode, visibility: nextVisibility });
        setDisplayViewModeState(nextMode);
        setShowAutomationsPageState(next);
        if (nextMode === 'custom') {
          setCustomInterfaceVisibilityStates(nextVisibility);
        }
      },
      setShowAnalysisPage: () => {
        setShowAnalysisPageState(true);
        setCustomShowAnalysisPageState(true);
      },
      setShowPerformanceCompareToggle: (next) => {
        const nextVisibility = currentInterfaceVisibility({ showPerformanceCompareToggle: next });
        const nextMode = displayViewMode === 'custom'
          ? 'custom'
          : resolveInterfaceViewMode({ requestedMode: displayViewMode, visibility: nextVisibility });
        setDisplayViewModeState(nextMode);
        setShowPerformanceCompareToggleState(next);
        if (nextMode === 'custom') {
          setCustomInterfaceVisibilityStates(nextVisibility);
        }
      },
      setShowPerformanceTimelineCard: (next) => {
        const nextVisibility = currentInterfaceVisibility({ showPerformanceTimelineCard: next });
        const nextMode = displayViewMode === 'custom'
          ? 'custom'
          : resolveInterfaceViewMode({ requestedMode: displayViewMode, visibility: nextVisibility });
        setDisplayViewModeState(nextMode);
        setShowPerformanceTimelineCardState(next);
        if (nextMode === 'custom') {
          setCustomInterfaceVisibilityStates(nextVisibility);
        }
      },
      setShowLogsViewToggle: (next) => {
        const nextVisibility = currentInterfaceVisibility({ showLogsViewToggle: next });
        const nextMode = displayViewMode === 'custom'
          ? 'custom'
          : resolveInterfaceViewMode({ requestedMode: displayViewMode, visibility: nextVisibility });
        setDisplayViewModeState(nextMode);
        setShowLogsViewToggleState(next);
        if (nextMode === 'custom') {
          setCustomInterfaceVisibilityStates(nextVisibility);
        }
      },
      setShowHeartbeatRibbons: (next) => {
        const nextVisibility = currentInterfaceVisibility({ showHeartbeatRibbons: next });
        const nextMode = displayViewMode === 'custom'
          ? 'custom'
          : resolveInterfaceViewMode({ requestedMode: displayViewMode, visibility: nextVisibility });
        setDisplayViewModeState(nextMode);
        setShowHeartbeatRibbonsState(next);
        if (nextMode === 'custom') {
          setCustomInterfaceVisibilityStates(nextVisibility);
        }
      },
      setTaskBatchUpdatePreference: (key, next) =>
        setTaskBatchUpdatePreferencesState((current) => ({
          ...current,
          [key]: next,
        })),
      setSenaEngineParameters: (next) =>
        setSenaEngineParametersState(normalizeSenaEngineParameters(next)),
      setOverviewStaleUpdateReminderSnoozeUntil: (next) =>
        setOverviewStaleUpdateReminderSnoozeUntilState(normalizeDesktopPreferenceTimestamp(next)),
      applySenaEngineParameters: async (next) => {
        await savePreferencesPatch({
          senaEngineParameters: normalizeSenaEngineParameters(next),
        });
      },
      applyOverviewStaleUpdateReminderSnoozeUntil: async (next) => {
        await savePreferencesPatch({
          overviewStaleUpdateReminderSnoozeUntil: normalizeDesktopPreferenceTimestamp(next),
        });
      },
      applyDisplayViewMode: async (mode) => {
        if (isPresetViewMode(mode)) {
          const preset = getInterfaceVisibilityForPreset(mode);
          await savePreferencesPatch({
            displayViewMode: mode,
            ...preset,
          });
          return;
        }

        await savePreferencesPatch({
          displayViewMode: 'custom',
          showExplanatoryTooltips: customShowExplanatoryTooltips,
          showFloatingTitleActions: customShowFloatingTitleActions,
          showRightRailCards: customShowRightRailCards,
          showOverviewTaskTabs: customShowOverviewTaskTabs,
          showAutomationsPage: customShowAutomationsPage,
          showAnalysisPage: customShowAnalysisPage,
          showPerformanceCompareToggle: customShowPerformanceCompareToggle,
          showPerformanceTimelineCard: customShowPerformanceTimelineCard,
          showLogsViewToggle: customShowLogsViewToggle,
          showHeartbeatRibbons: customShowHeartbeatRibbons,
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
        });
      },
      savePreferences: async (overrides) => {
        const resolvedShowExplanatoryTooltips =
          overrides?.showExplanatoryTooltips ?? showExplanatoryTooltips;
        const resolvedShowFloatingTitleActions =
          overrides?.showFloatingTitleActions ?? showFloatingTitleActions;
        const resolvedShowRightRailCards =
          overrides?.showRightRailCards ?? showRightRailCards;
        const resolvedShowOverviewTaskTabs =
          overrides?.showOverviewTaskTabs ?? showOverviewTaskTabs;
        const resolvedShowAutomationsPage =
          overrides?.showAutomationsPage ?? showAutomationsPage;
        const resolvedShowAnalysisPage = true;
        const resolvedShowPerformanceCompareToggle =
          overrides?.showPerformanceCompareToggle ?? showPerformanceCompareToggle;
        const resolvedShowPerformanceTimelineCard =
          overrides?.showPerformanceTimelineCard ?? showPerformanceTimelineCard;
        const resolvedShowLogsViewToggle =
          overrides?.showLogsViewToggle ?? showLogsViewToggle;
        const resolvedShowHeartbeatRibbons =
          overrides?.showHeartbeatRibbons ?? showHeartbeatRibbons;
        const resolvedCustomShowExplanatoryTooltips =
          overrides?.customShowExplanatoryTooltips ?? (
            overrides?.showExplanatoryTooltips ?? customShowExplanatoryTooltips
          );
        const resolvedCustomShowFloatingTitleActions =
          overrides?.customShowFloatingTitleActions ?? (
            overrides?.showFloatingTitleActions ?? customShowFloatingTitleActions
          );
        const resolvedCustomShowRightRailCards =
          overrides?.customShowRightRailCards ?? (
            overrides?.showRightRailCards ?? customShowRightRailCards
          );
        const resolvedCustomShowOverviewTaskTabs =
          overrides?.customShowOverviewTaskTabs ?? (
            overrides?.showOverviewTaskTabs ?? customShowOverviewTaskTabs
          );
        const resolvedCustomShowAutomationsPage =
          overrides?.customShowAutomationsPage ?? (
            overrides?.showAutomationsPage ?? customShowAutomationsPage
          );
        const resolvedCustomShowAnalysisPage = true;
        const resolvedCustomShowPerformanceCompareToggle =
          overrides?.customShowPerformanceCompareToggle ?? (
            overrides?.showPerformanceCompareToggle ?? customShowPerformanceCompareToggle
          );
        const resolvedCustomShowPerformanceTimelineCard =
          overrides?.customShowPerformanceTimelineCard ?? (
            overrides?.showPerformanceTimelineCard ?? customShowPerformanceTimelineCard
          );
        const resolvedCustomShowLogsViewToggle =
          overrides?.customShowLogsViewToggle ?? (
            overrides?.showLogsViewToggle ?? customShowLogsViewToggle
          );
        const resolvedCustomShowHeartbeatRibbons =
          overrides?.customShowHeartbeatRibbons ?? (
            overrides?.showHeartbeatRibbons ?? customShowHeartbeatRibbons
          );
        const updatesVisibilityPreferences =
          overrides?.showExplanatoryTooltips != null ||
          overrides?.showFloatingTitleActions != null ||
          overrides?.showRightRailCards != null ||
          overrides?.showOverviewTaskTabs != null ||
          overrides?.showAutomationsPage != null ||
          overrides?.showAnalysisPage != null ||
          overrides?.showPerformanceCompareToggle != null ||
          overrides?.showPerformanceTimelineCard != null ||
          overrides?.showLogsViewToggle != null ||
          overrides?.showHeartbeatRibbons != null ||
          overrides?.customShowExplanatoryTooltips != null ||
          overrides?.customShowFloatingTitleActions != null ||
          overrides?.customShowRightRailCards != null ||
          overrides?.customShowOverviewTaskTabs != null ||
          overrides?.customShowAutomationsPage != null ||
          overrides?.customShowAnalysisPage != null ||
          overrides?.customShowPerformanceCompareToggle != null ||
          overrides?.customShowPerformanceTimelineCard != null ||
          overrides?.customShowLogsViewToggle != null ||
          overrides?.customShowHeartbeatRibbons != null;
        const explicitPresetVisibility = isPresetViewMode(overrides?.displayViewMode)
          ? getInterfaceVisibilityForPreset(overrides.displayViewMode)
          : null;
        const resolvedVisibility = explicitPresetVisibility
          ? {
              ...explicitPresetVisibility,
              ...(overrides?.showAutomationsPage != null && {
                showAutomationsPage: overrides.showAutomationsPage,
              }),
            }
          : {
              showExplanatoryTooltips: resolvedShowExplanatoryTooltips,
              showFloatingTitleActions: resolvedShowFloatingTitleActions,
              showRightRailCards: resolvedShowRightRailCards,
              showOverviewTaskTabs: resolvedShowOverviewTaskTabs,
              showAutomationsPage: resolvedShowAutomationsPage,
              showAnalysisPage: resolvedShowAnalysisPage,
              showPerformanceCompareToggle: resolvedShowPerformanceCompareToggle,
              showPerformanceTimelineCard: resolvedShowPerformanceTimelineCard,
              showLogsViewToggle: resolvedShowLogsViewToggle,
              showHeartbeatRibbons: resolvedShowHeartbeatRibbons,
            };
        const resolvedDisplayViewMode =
          overrides?.displayViewMode ??
          (updatesVisibilityPreferences
            ? displayViewMode === 'custom'
              ? 'custom'
              : resolveInterfaceViewMode({ requestedMode: displayViewMode, visibility: resolvedVisibility })
            : displayViewMode);
        const storesResolvedVisibilityAsCustom =
          resolvedDisplayViewMode === 'custom' && (updatesVisibilityPreferences || overrides?.displayViewMode === 'custom');

        await savePreferencesPatch({
          language: overrides?.language ?? language,
          currency: overrides?.currency ?? currency,
          usdToKhrExchangeRate: overrides?.usdToKhrExchangeRate ?? usdToKhrExchangeRate,
          displayViewMode: resolvedDisplayViewMode,
          itemImageMode: overrides?.itemImageMode ?? itemImageMode,
          dimChartsWhileLoading: overrides?.dimChartsWhileLoading ?? dimChartsWhileLoading,
          ...resolvedVisibility,
          customShowExplanatoryTooltips: storesResolvedVisibilityAsCustom ? resolvedVisibility.showExplanatoryTooltips : resolvedCustomShowExplanatoryTooltips,
          customShowFloatingTitleActions: storesResolvedVisibilityAsCustom ? resolvedVisibility.showFloatingTitleActions : resolvedCustomShowFloatingTitleActions,
          customShowRightRailCards: storesResolvedVisibilityAsCustom ? resolvedVisibility.showRightRailCards : resolvedCustomShowRightRailCards,
          customShowOverviewTaskTabs: storesResolvedVisibilityAsCustom ? resolvedVisibility.showOverviewTaskTabs : resolvedCustomShowOverviewTaskTabs,
          customShowAutomationsPage: storesResolvedVisibilityAsCustom ? resolvedVisibility.showAutomationsPage : resolvedCustomShowAutomationsPage,
          customShowAnalysisPage: true,
          customShowPerformanceCompareToggle: storesResolvedVisibilityAsCustom ? resolvedVisibility.showPerformanceCompareToggle : resolvedCustomShowPerformanceCompareToggle,
          customShowPerformanceTimelineCard: storesResolvedVisibilityAsCustom ? resolvedVisibility.showPerformanceTimelineCard : resolvedCustomShowPerformanceTimelineCard,
          customShowLogsViewToggle: storesResolvedVisibilityAsCustom ? resolvedVisibility.showLogsViewToggle : resolvedCustomShowLogsViewToggle,
          customShowHeartbeatRibbons: storesResolvedVisibilityAsCustom ? resolvedVisibility.showHeartbeatRibbons : resolvedCustomShowHeartbeatRibbons,
          taskBatchUpdatePreferences:
            overrides?.taskBatchUpdatePreferences ?? taskBatchUpdatePreferences,
          senaEngineParameters: overrides?.senaEngineParameters ?? senaEngineParameters,
          overviewStaleUpdateReminderSnoozeUntil:
            overrides?.overviewStaleUpdateReminderSnoozeUntil ?? overviewStaleUpdateReminderSnoozeUntil,
          onboardingCompletedAt:
            overrides && 'onboardingCompletedAt' in overrides
              ? overrides.onboardingCompletedAt ?? null
              : onboardingCompletedAt,
          seenUnlockedNavItems:
            overrides?.seenUnlockedNavItems ?? seenUnlockedNavItems,
          workbenchTileOrderByLane:
            overrides?.workbenchTileOrderByLane ?? workbenchTileOrderByLane,
        });
      },
      markUnlockedNavItemSeen: async (itemId) => {
        const previousSeenUnlockedNavItems = seenUnlockedNavItemsRef.current;
        if (previousSeenUnlockedNavItems[itemId]) {
          return;
        }

        const nextSeenUnlockedNavItems = {
          ...previousSeenUnlockedNavItems,
          [itemId]: true,
        };
        seenUnlockedNavItemsRef.current = nextSeenUnlockedNavItems;
        setSeenUnlockedNavItemsState(nextSeenUnlockedNavItems);

        try {
          const savedResult = await savePreferencesPatch({
            seenUnlockedNavItems: nextSeenUnlockedNavItems,
          }, { applyResponse: false });
          const savedPreferences = savedResult.preferences;
          const savedSeenUnlockedNavItems = normalizeDesktopSeenUnlockedNavItems(
            savedPreferences.seenUnlockedNavItems,
          );
          if (seenUnlockedNavItemsRef.current === nextSeenUnlockedNavItems) {
            seenUnlockedNavItemsRef.current = savedSeenUnlockedNavItems;
            setSeenUnlockedNavItemsState(savedSeenUnlockedNavItems);
          }
          if (savedResult.isLatestResponse) {
            setPersistedSeenUnlockedNavItems(savedSeenUnlockedNavItems);
          }
        } catch (error) {
          if (seenUnlockedNavItemsRef.current === nextSeenUnlockedNavItems) {
            seenUnlockedNavItemsRef.current = previousSeenUnlockedNavItems;
            setSeenUnlockedNavItemsState(previousSeenUnlockedNavItems);
          }
          throw error;
        }
      },
      resetPreferences: () => {
        setLanguageState(persistedLanguage);
        setCurrencyState(persistedCurrency);
        setUsdToKhrExchangeRateState(persistedUsdToKhrExchangeRate);
        setDisplayViewModeState(persistedDisplayViewMode);
        setItemImageModeState(persistedItemImageMode);
        setDimChartsWhileLoadingState(persistedDimChartsWhileLoading);
        setShowExplanatoryTooltipsState(persistedShowExplanatoryTooltips);
        setShowFloatingTitleActionsState(persistedShowFloatingTitleActions);
        setShowRightRailCardsState(persistedShowRightRailCards);
        setShowOverviewTaskTabsState(persistedShowOverviewTaskTabs);
        setShowAutomationsPageState(persistedShowAutomationsPage);
        setShowAnalysisPageState(true);
        setShowPerformanceCompareToggleState(persistedShowPerformanceCompareToggle);
        setShowPerformanceTimelineCardState(persistedShowPerformanceTimelineCard);
        setShowLogsViewToggleState(persistedShowLogsViewToggle);
        setShowHeartbeatRibbonsState(persistedShowHeartbeatRibbons);
        setCustomShowExplanatoryTooltipsState(persistedCustomShowExplanatoryTooltips);
        setCustomShowFloatingTitleActionsState(persistedCustomShowFloatingTitleActions);
        setCustomShowRightRailCardsState(persistedCustomShowRightRailCards);
        setCustomShowOverviewTaskTabsState(persistedCustomShowOverviewTaskTabs);
        setCustomShowAutomationsPageState(persistedCustomShowAutomationsPage);
        setCustomShowAnalysisPageState(true);
        setCustomShowPerformanceCompareToggleState(persistedCustomShowPerformanceCompareToggle);
        setCustomShowPerformanceTimelineCardState(persistedCustomShowPerformanceTimelineCard);
        setCustomShowLogsViewToggleState(persistedCustomShowLogsViewToggle);
        setCustomShowHeartbeatRibbonsState(persistedCustomShowHeartbeatRibbons);
        setTaskBatchUpdatePreferencesState(persistedTaskBatchUpdatePreferences);
        setSenaEngineParametersState(persistedSenaEngineParameters);
        setOverviewStaleUpdateReminderSnoozeUntilState(
          persistedOverviewStaleUpdateReminderSnoozeUntil,
        );
        setOnboardingCompletedAtState(persistedOnboardingCompletedAt);
        seenUnlockedNavItemsRef.current = persistedSeenUnlockedNavItems;
        setSeenUnlockedNavItemsState(persistedSeenUnlockedNavItems);
        setWorkbenchTileOrderByLaneState(persistedWorkbenchTileOrderByLane);
      },
      hasPendingChanges:
        language !== persistedLanguage ||
        currency !== persistedCurrency ||
        usdToKhrExchangeRate !== persistedUsdToKhrExchangeRate ||
        displayViewMode !== persistedDisplayViewMode ||
        itemImageMode !== persistedItemImageMode ||
        dimChartsWhileLoading !== persistedDimChartsWhileLoading ||
        showExplanatoryTooltips !== persistedShowExplanatoryTooltips ||
        showFloatingTitleActions !== persistedShowFloatingTitleActions ||
        showRightRailCards !== persistedShowRightRailCards ||
        showOverviewTaskTabs !== persistedShowOverviewTaskTabs ||
        showAutomationsPage !== persistedShowAutomationsPage ||
        showAnalysisPage !== persistedShowAnalysisPage ||
        showPerformanceCompareToggle !== persistedShowPerformanceCompareToggle ||
        showPerformanceTimelineCard !== persistedShowPerformanceTimelineCard ||
        showLogsViewToggle !== persistedShowLogsViewToggle ||
        showHeartbeatRibbons !== persistedShowHeartbeatRibbons ||
        customShowExplanatoryTooltips !== persistedCustomShowExplanatoryTooltips ||
        customShowFloatingTitleActions !== persistedCustomShowFloatingTitleActions ||
        customShowRightRailCards !== persistedCustomShowRightRailCards ||
        customShowOverviewTaskTabs !== persistedCustomShowOverviewTaskTabs ||
        customShowAutomationsPage !== persistedCustomShowAutomationsPage ||
        customShowAnalysisPage !== persistedCustomShowAnalysisPage ||
        customShowPerformanceCompareToggle !== persistedCustomShowPerformanceCompareToggle ||
        customShowPerformanceTimelineCard !== persistedCustomShowPerformanceTimelineCard ||
        customShowLogsViewToggle !== persistedCustomShowLogsViewToggle ||
        customShowHeartbeatRibbons !== persistedCustomShowHeartbeatRibbons ||
        JSON.stringify(taskBatchUpdatePreferences) !== JSON.stringify(persistedTaskBatchUpdatePreferences) ||
        overviewStaleUpdateReminderSnoozeUntil !== persistedOverviewStaleUpdateReminderSnoozeUntil ||
        onboardingCompletedAt !== persistedOnboardingCompletedAt ||
        JSON.stringify(seenUnlockedNavItems) !== JSON.stringify(persistedSeenUnlockedNavItems) ||
        JSON.stringify(workbenchTileOrderByLane) !== JSON.stringify(persistedWorkbenchTileOrderByLane) ||
        !senaEngineParametersEqual(senaEngineParameters, persistedSenaEngineParameters),
      t: (key, variables) => getTranslation(language, key, variables),
      rawT: (key, variables) => getTranslation(language, key, variables),
      currencyLabel: (next) => currencyLabel(language, next),
    }),
    [
      isHydrated,
      currency,
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
      dimChartsWhileLoading,
      displayViewMode,
      itemImageMode,
      language,
      persistedCustomShowExplanatoryTooltips,
      persistedCustomShowFloatingTitleActions,
      persistedCustomShowRightRailCards,
      persistedCustomShowOverviewTaskTabs,
      persistedCustomShowAutomationsPage,
      persistedCustomShowAnalysisPage,
      persistedCustomShowPerformanceCompareToggle,
      persistedCustomShowPerformanceTimelineCard,
      persistedCustomShowLogsViewToggle,
      persistedCustomShowHeartbeatRibbons,
      persistedDimChartsWhileLoading,
      persistedDisplayViewMode,
      persistedItemImageMode,
      persistedTaskBatchUpdatePreferences,
      persistedUsdToKhrExchangeRate,
      persistedCurrency,
      persistedLanguage,
      persistedShowExplanatoryTooltips,
      persistedShowFloatingTitleActions,
      persistedShowRightRailCards,
      persistedShowOverviewTaskTabs,
      persistedShowAutomationsPage,
      persistedShowAnalysisPage,
      persistedShowPerformanceCompareToggle,
      persistedShowPerformanceTimelineCard,
      persistedShowLogsViewToggle,
      persistedShowHeartbeatRibbons,
      persistedSenaEngineParameters,
      persistedOverviewStaleUpdateReminderSnoozeUntil,
      persistedWorkbenchTileOrderByLane,
      senaEngineParameters,
      taskBatchUpdatePreferences,
      overviewStaleUpdateReminderSnoozeUntil,
      onboardingCompletedAt,
      usdToKhrExchangeRate,
      seenUnlockedNavItems,
      workbenchTileOrderByLane,
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
      persistedOnboardingCompletedAt,
      persistedSeenUnlockedNavItems,
    ],
  );

  return (
    <PreferencesContext.Provider value={value}>
      <DescriptionTextVisibilityProvider visible={showExplanatoryTooltips}>
        {children}
      </DescriptionTextVisibilityProvider>
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const value = useContext(PreferencesContext);
  if (!value) {
    throw new Error('PreferencesProvider is missing');
  }
  return value;
}
