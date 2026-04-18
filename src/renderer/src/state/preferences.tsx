import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AppCurrency, AppLanguage } from '@shared/inventory';
import {
  DEFAULT_DESKTOP_SEEN_UNLOCKED_NAV_ITEMS,
  DEFAULT_DESKTOP_ITEM_IMAGE_MODE,
  DEFAULT_TASK_BATCH_UPDATE_PREFERENCES,
  DEFAULT_USD_TO_KHR_EXCHANGE_RATE,
  normalizeDesktopPreferenceTimestamp,
  normalizeDesktopSeenUnlockedNavItems,
  normalizeDesktopTaskBatchUpdatePreferences,
  normalizeSenaEngineParameters,
  senaEngineParametersEqual,
  type DesktopItemImageMode,
  type DesktopSeenUnlockedNavItems,
  type DesktopTaskBatchUpdatePreference,
  type DesktopTaskBatchUpdatePreferences,
  type SenaEngineParameters,
} from '@shared/ipc';
import { DescriptionTextVisibilityProvider } from '@/components/system/description-text';
import { currencyLabel, getTranslation, type TranslationKey, type TranslationVariables } from '../lib/translations';

interface PreferencesContextValue {
  isHydrated: boolean;
  language: AppLanguage;
  currency: AppCurrency;
  usdToKhrExchangeRate: number;
  displayViewMode: 'compact' | 'custom';
  itemImageMode: DesktopItemImageMode;
  dimChartsWhileLoading: boolean;
  taskBatchUpdatePreferences: DesktopTaskBatchUpdatePreferences;
  showExplanatoryTooltips: boolean;
  showFloatingTitleActions: boolean;
  showRightRailCards: boolean;
  showOverviewTaskTabs: boolean;
  showAnalysisPage: boolean;
  showPerformanceCompareToggle: boolean;
  showPerformanceTimelineCard: boolean;
  showLogsViewToggle: boolean;
  showHeartbeatRibbons: boolean;
  customShowExplanatoryTooltips: boolean;
  customShowFloatingTitleActions: boolean;
  customShowRightRailCards: boolean;
  customShowOverviewTaskTabs: boolean;
  customShowAnalysisPage: boolean;
  customShowPerformanceCompareToggle: boolean;
  customShowPerformanceTimelineCard: boolean;
  customShowLogsViewToggle: boolean;
  customShowHeartbeatRibbons: boolean;
  senaEngineParameters: SenaEngineParameters;
  overviewStaleUpdateReminderSnoozeUntil: string | null;
  onboardingCompletedAt: string | null;
  seenUnlockedNavItems: DesktopSeenUnlockedNavItems;
  persistedLanguage: AppLanguage;
  persistedCurrency: AppCurrency;
  persistedUsdToKhrExchangeRate: number;
  persistedDisplayViewMode: 'compact' | 'custom';
  persistedItemImageMode: DesktopItemImageMode;
  persistedDimChartsWhileLoading: boolean;
  persistedShowExplanatoryTooltips: boolean;
  persistedShowFloatingTitleActions: boolean;
  persistedShowRightRailCards: boolean;
  persistedShowOverviewTaskTabs: boolean;
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
  persistedCustomShowAnalysisPage: boolean;
  persistedCustomShowPerformanceCompareToggle: boolean;
  persistedCustomShowPerformanceTimelineCard: boolean;
  persistedCustomShowLogsViewToggle: boolean;
  persistedCustomShowHeartbeatRibbons: boolean;
  persistedSenaEngineParameters: SenaEngineParameters;
  persistedOverviewStaleUpdateReminderSnoozeUntil: string | null;
  persistedOnboardingCompletedAt: string | null;
  persistedSeenUnlockedNavItems: DesktopSeenUnlockedNavItems;
  setLanguage: (value: AppLanguage) => void;
  setCurrency: (value: AppCurrency) => void;
  setUsdToKhrExchangeRate: (value: number) => void;
  setDisplayViewMode: (value: 'compact' | 'custom') => void;
  setItemImageMode: (value: DesktopItemImageMode) => void;
  setDimChartsWhileLoading: (value: boolean) => void;
  setShowExplanatoryTooltips: (value: boolean) => void;
  setShowFloatingTitleActions: (value: boolean) => void;
  setShowRightRailCards: (value: boolean) => void;
  setShowOverviewTaskTabs: (value: boolean) => void;
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
  applyDisplayViewMode: (mode: 'compact' | 'custom') => Promise<void>;
  savePreferences: (overrides?: Partial<{
    language: AppLanguage;
    currency: AppCurrency;
    usdToKhrExchangeRate: number;
    displayViewMode: 'compact' | 'custom';
    itemImageMode: DesktopItemImageMode;
    dimChartsWhileLoading: boolean;
    showExplanatoryTooltips: boolean;
    showFloatingTitleActions: boolean;
    showRightRailCards: boolean;
    showOverviewTaskTabs: boolean;
    showAnalysisPage: boolean;
    showPerformanceCompareToggle: boolean;
    showPerformanceTimelineCard: boolean;
    showLogsViewToggle: boolean;
    showHeartbeatRibbons: boolean;
    customShowExplanatoryTooltips: boolean;
    customShowFloatingTitleActions: boolean;
    customShowRightRailCards: boolean;
    customShowOverviewTaskTabs: boolean;
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

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [isHydrated, setIsHydrated] = useState(false);
  const [language, setLanguageState] = useState<AppLanguage>('en');
  const [currency, setCurrencyState] = useState<AppCurrency>('USD');
  const [usdToKhrExchangeRate, setUsdToKhrExchangeRateState] = useState(DEFAULT_USD_TO_KHR_EXCHANGE_RATE);
  const [displayViewMode, setDisplayViewModeState] = useState<'compact' | 'custom'>('custom');
  const [itemImageMode, setItemImageModeState] = useState<DesktopItemImageMode>(DEFAULT_DESKTOP_ITEM_IMAGE_MODE);
  const [dimChartsWhileLoading, setDimChartsWhileLoadingState] = useState(false);
  const [showExplanatoryTooltips, setShowExplanatoryTooltipsState] = useState(true);
  const [showFloatingTitleActions, setShowFloatingTitleActionsState] = useState(true);
  const [showRightRailCards, setShowRightRailCardsState] = useState(true);
  const [showOverviewTaskTabs, setShowOverviewTaskTabsState] = useState(true);
  const [showAnalysisPage, setShowAnalysisPageState] = useState(true);
  const [showPerformanceCompareToggle, setShowPerformanceCompareToggleState] = useState(true);
  const [showPerformanceTimelineCard, setShowPerformanceTimelineCardState] = useState(true);
  const [showLogsViewToggle, setShowLogsViewToggleState] = useState(true);
  const [showHeartbeatRibbons, setShowHeartbeatRibbonsState] = useState(true);
  const [taskBatchUpdatePreferences, setTaskBatchUpdatePreferencesState] =
    useState<DesktopTaskBatchUpdatePreferences>(DEFAULT_TASK_BATCH_UPDATE_PREFERENCES);
  const [customShowExplanatoryTooltips, setCustomShowExplanatoryTooltipsState] = useState(true);
  const [customShowFloatingTitleActions, setCustomShowFloatingTitleActionsState] = useState(true);
  const [customShowRightRailCards, setCustomShowRightRailCardsState] = useState(true);
  const [customShowOverviewTaskTabs, setCustomShowOverviewTaskTabsState] = useState(true);
  const [customShowAnalysisPage, setCustomShowAnalysisPageState] = useState(true);
  const [customShowPerformanceCompareToggle, setCustomShowPerformanceCompareToggleState] = useState(true);
  const [customShowPerformanceTimelineCard, setCustomShowPerformanceTimelineCardState] = useState(true);
  const [customShowLogsViewToggle, setCustomShowLogsViewToggleState] = useState(true);
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
  const [persistedLanguage, setPersistedLanguage] = useState<AppLanguage>('en');
  const [persistedCurrency, setPersistedCurrency] = useState<AppCurrency>('USD');
  const [persistedUsdToKhrExchangeRate, setPersistedUsdToKhrExchangeRate] = useState(DEFAULT_USD_TO_KHR_EXCHANGE_RATE);
  const [persistedDisplayViewMode, setPersistedDisplayViewMode] = useState<'compact' | 'custom'>('custom');
  const [persistedItemImageMode, setPersistedItemImageMode] =
    useState<DesktopItemImageMode>(DEFAULT_DESKTOP_ITEM_IMAGE_MODE);
  const [persistedDimChartsWhileLoading, setPersistedDimChartsWhileLoading] = useState(false);
  const [persistedShowExplanatoryTooltips, setPersistedShowExplanatoryTooltips] = useState(true);
  const [persistedShowFloatingTitleActions, setPersistedShowFloatingTitleActions] = useState(true);
  const [persistedShowRightRailCards, setPersistedShowRightRailCards] = useState(true);
  const [persistedShowOverviewTaskTabs, setPersistedShowOverviewTaskTabs] = useState(true);
  const [persistedShowAnalysisPage, setPersistedShowAnalysisPage] = useState(true);
  const [persistedShowPerformanceCompareToggle, setPersistedShowPerformanceCompareToggle] = useState(true);
  const [persistedShowPerformanceTimelineCard, setPersistedShowPerformanceTimelineCard] = useState(true);
  const [persistedShowLogsViewToggle, setPersistedShowLogsViewToggle] = useState(true);
  const [persistedShowHeartbeatRibbons, setPersistedShowHeartbeatRibbons] = useState(true);
  const [persistedTaskBatchUpdatePreferences, setPersistedTaskBatchUpdatePreferences] =
    useState<DesktopTaskBatchUpdatePreferences>(DEFAULT_TASK_BATCH_UPDATE_PREFERENCES);
  const [persistedCustomShowExplanatoryTooltips, setPersistedCustomShowExplanatoryTooltips] = useState(true);
  const [persistedCustomShowFloatingTitleActions, setPersistedCustomShowFloatingTitleActions] = useState(true);
  const [persistedCustomShowRightRailCards, setPersistedCustomShowRightRailCards] = useState(true);
  const [persistedCustomShowOverviewTaskTabs, setPersistedCustomShowOverviewTaskTabs] = useState(true);
  const [persistedCustomShowAnalysisPage, setPersistedCustomShowAnalysisPage] = useState(true);
  const [persistedCustomShowPerformanceCompareToggle, setPersistedCustomShowPerformanceCompareToggle] = useState(true);
  const [persistedCustomShowPerformanceTimelineCard, setPersistedCustomShowPerformanceTimelineCard] = useState(true);
  const [persistedCustomShowLogsViewToggle, setPersistedCustomShowLogsViewToggle] = useState(true);
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

  useEffect(() => {
    let mounted = true;

    window.banjiDesktop.preferences
      .get()
      .then((preferences) => {
        if (!mounted) {
          return;
        }

        const nextSenaEngineParameters = normalizeSenaEngineParameters(preferences.senaEngineParameters);
        const nextSeenUnlockedNavItems = normalizeDesktopSeenUnlockedNavItems(preferences.seenUnlockedNavItems);

        setLanguageState(preferences.language);
        setCurrencyState(preferences.currency);
        const nextUsdToKhrExchangeRate = normalizeUsdToKhrExchangeRate(preferences.usdToKhrExchangeRate);

        setUsdToKhrExchangeRateState(nextUsdToKhrExchangeRate);
        setDisplayViewModeState(preferences.displayViewMode);
        setItemImageModeState(preferences.itemImageMode);
        setDimChartsWhileLoadingState(preferences.dimChartsWhileLoading);
        setShowExplanatoryTooltipsState(preferences.showExplanatoryTooltips);
        setShowFloatingTitleActionsState(preferences.showFloatingTitleActions);
        setShowRightRailCardsState(preferences.showRightRailCards);
        setShowOverviewTaskTabsState(preferences.showOverviewTaskTabs);
        setShowAnalysisPageState(preferences.showAnalysisPage);
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
        setCustomShowAnalysisPageState(preferences.customShowAnalysisPage);
        setCustomShowPerformanceCompareToggleState(preferences.customShowPerformanceCompareToggle);
        setCustomShowPerformanceTimelineCardState(preferences.customShowPerformanceTimelineCard);
        setCustomShowLogsViewToggleState(preferences.customShowLogsViewToggle);
        setCustomShowHeartbeatRibbonsState(preferences.customShowHeartbeatRibbons);
        setSenaEngineParametersState(nextSenaEngineParameters);
        setOverviewStaleUpdateReminderSnoozeUntilState(
          normalizeDesktopPreferenceTimestamp(preferences.overviewStaleUpdateReminderSnoozeUntil),
        );
        setOnboardingCompletedAtState(normalizeDesktopPreferenceTimestamp(preferences.onboardingCompletedAt));
        setSeenUnlockedNavItemsState(nextSeenUnlockedNavItems);
        setPersistedLanguage(preferences.language);
        setPersistedCurrency(preferences.currency);
        setPersistedUsdToKhrExchangeRate(nextUsdToKhrExchangeRate);
        setPersistedDisplayViewMode(preferences.displayViewMode);
        setPersistedItemImageMode(preferences.itemImageMode);
        setPersistedDimChartsWhileLoading(preferences.dimChartsWhileLoading);
        setPersistedShowExplanatoryTooltips(preferences.showExplanatoryTooltips);
        setPersistedShowFloatingTitleActions(preferences.showFloatingTitleActions);
        setPersistedShowRightRailCards(preferences.showRightRailCards);
        setPersistedShowOverviewTaskTabs(preferences.showOverviewTaskTabs);
        setPersistedShowAnalysisPage(preferences.showAnalysisPage);
        setPersistedShowPerformanceCompareToggle(preferences.showPerformanceCompareToggle);
        setPersistedShowPerformanceTimelineCard(preferences.showPerformanceTimelineCard);
        setPersistedShowLogsViewToggle(preferences.showLogsViewToggle);
        setPersistedShowHeartbeatRibbons(preferences.showHeartbeatRibbons);
        setPersistedTaskBatchUpdatePreferences(nextTaskBatchUpdatePreferences);
        setPersistedCustomShowExplanatoryTooltips(preferences.customShowExplanatoryTooltips);
        setPersistedCustomShowFloatingTitleActions(preferences.customShowFloatingTitleActions);
        setPersistedCustomShowRightRailCards(preferences.customShowRightRailCards);
        setPersistedCustomShowOverviewTaskTabs(preferences.customShowOverviewTaskTabs);
        setPersistedCustomShowAnalysisPage(preferences.customShowAnalysisPage);
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
        setIsHydrated(true);
      })
      .catch((error) => {
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
    displayViewMode: 'compact' | 'custom';
    itemImageMode: DesktopItemImageMode;
    dimChartsWhileLoading: boolean;
    showExplanatoryTooltips: boolean;
    showFloatingTitleActions: boolean;
    showRightRailCards: boolean;
    showOverviewTaskTabs: boolean;
    showAnalysisPage: boolean;
    showPerformanceCompareToggle: boolean;
    showPerformanceTimelineCard: boolean;
    showLogsViewToggle: boolean;
    showHeartbeatRibbons: boolean;
    customShowExplanatoryTooltips: boolean;
    customShowFloatingTitleActions: boolean;
    customShowRightRailCards: boolean;
    customShowOverviewTaskTabs: boolean;
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
  }>) {
    const nextPreferences = await window.banjiDesktop.preferences.save(next);
    const nextSenaEngineParameters = normalizeSenaEngineParameters(nextPreferences.senaEngineParameters);
    const nextOverviewStaleUpdateReminderSnoozeUntil = normalizeDesktopPreferenceTimestamp(
      nextPreferences.overviewStaleUpdateReminderSnoozeUntil,
    );
    const nextSeenUnlockedNavItems = normalizeDesktopSeenUnlockedNavItems(nextPreferences.seenUnlockedNavItems);
    setLanguageState(nextPreferences.language);
    setCurrencyState(nextPreferences.currency);
    const nextUsdToKhrExchangeRate = normalizeUsdToKhrExchangeRate(nextPreferences.usdToKhrExchangeRate);
    setUsdToKhrExchangeRateState(nextUsdToKhrExchangeRate);
    setDisplayViewModeState(nextPreferences.displayViewMode);
    setItemImageModeState(nextPreferences.itemImageMode);
    setDimChartsWhileLoadingState(nextPreferences.dimChartsWhileLoading);
    setShowExplanatoryTooltipsState(nextPreferences.showExplanatoryTooltips);
    setShowFloatingTitleActionsState(nextPreferences.showFloatingTitleActions);
    setShowRightRailCardsState(nextPreferences.showRightRailCards);
    setShowOverviewTaskTabsState(nextPreferences.showOverviewTaskTabs);
    setShowAnalysisPageState(nextPreferences.showAnalysisPage);
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
    setCustomShowAnalysisPageState(nextPreferences.customShowAnalysisPage);
    setCustomShowPerformanceCompareToggleState(nextPreferences.customShowPerformanceCompareToggle);
    setCustomShowPerformanceTimelineCardState(nextPreferences.customShowPerformanceTimelineCard);
    setCustomShowLogsViewToggleState(nextPreferences.customShowLogsViewToggle);
    setCustomShowHeartbeatRibbonsState(nextPreferences.customShowHeartbeatRibbons);
    setSenaEngineParametersState(nextSenaEngineParameters);
    setOverviewStaleUpdateReminderSnoozeUntilState(nextOverviewStaleUpdateReminderSnoozeUntil);
    setOnboardingCompletedAtState(normalizeDesktopPreferenceTimestamp(nextPreferences.onboardingCompletedAt));
    setSeenUnlockedNavItemsState(nextSeenUnlockedNavItems);
    setPersistedLanguage(nextPreferences.language);
    setPersistedCurrency(nextPreferences.currency);
    setPersistedUsdToKhrExchangeRate(nextUsdToKhrExchangeRate);
    setPersistedDisplayViewMode(nextPreferences.displayViewMode);
    setPersistedItemImageMode(nextPreferences.itemImageMode);
    setPersistedDimChartsWhileLoading(nextPreferences.dimChartsWhileLoading);
    setPersistedShowExplanatoryTooltips(nextPreferences.showExplanatoryTooltips);
    setPersistedShowFloatingTitleActions(nextPreferences.showFloatingTitleActions);
    setPersistedShowRightRailCards(nextPreferences.showRightRailCards);
    setPersistedShowOverviewTaskTabs(nextPreferences.showOverviewTaskTabs);
    setPersistedShowAnalysisPage(nextPreferences.showAnalysisPage);
    setPersistedShowPerformanceCompareToggle(nextPreferences.showPerformanceCompareToggle);
    setPersistedShowPerformanceTimelineCard(nextPreferences.showPerformanceTimelineCard);
    setPersistedShowLogsViewToggle(nextPreferences.showLogsViewToggle);
    setPersistedShowHeartbeatRibbons(nextPreferences.showHeartbeatRibbons);
    setPersistedTaskBatchUpdatePreferences(nextTaskBatchUpdatePreferences);
    setPersistedCustomShowExplanatoryTooltips(nextPreferences.customShowExplanatoryTooltips);
    setPersistedCustomShowFloatingTitleActions(nextPreferences.customShowFloatingTitleActions);
    setPersistedCustomShowRightRailCards(nextPreferences.customShowRightRailCards);
    setPersistedCustomShowOverviewTaskTabs(nextPreferences.customShowOverviewTaskTabs);
    setPersistedCustomShowAnalysisPage(nextPreferences.customShowAnalysisPage);
    setPersistedCustomShowPerformanceCompareToggle(nextPreferences.customShowPerformanceCompareToggle);
    setPersistedCustomShowPerformanceTimelineCard(nextPreferences.customShowPerformanceTimelineCard);
    setPersistedCustomShowLogsViewToggle(nextPreferences.customShowLogsViewToggle);
    setPersistedCustomShowHeartbeatRibbons(nextPreferences.customShowHeartbeatRibbons);
    setPersistedSenaEngineParameters(nextSenaEngineParameters);
    setPersistedOverviewStaleUpdateReminderSnoozeUntil(nextOverviewStaleUpdateReminderSnoozeUntil);
    setPersistedOnboardingCompletedAt(normalizeDesktopPreferenceTimestamp(nextPreferences.onboardingCompletedAt));
    setPersistedSeenUnlockedNavItems(nextSeenUnlockedNavItems);
    return nextPreferences;
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
      customShowAnalysisPage,
      customShowPerformanceCompareToggle,
      customShowPerformanceTimelineCard,
      customShowLogsViewToggle,
      customShowHeartbeatRibbons,
      senaEngineParameters,
      overviewStaleUpdateReminderSnoozeUntil,
      onboardingCompletedAt,
      seenUnlockedNavItems,
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
      persistedCustomShowAnalysisPage,
      persistedCustomShowPerformanceCompareToggle,
      persistedCustomShowPerformanceTimelineCard,
      persistedCustomShowLogsViewToggle,
      persistedCustomShowHeartbeatRibbons,
      persistedSenaEngineParameters,
      persistedOverviewStaleUpdateReminderSnoozeUntil,
      persistedOnboardingCompletedAt,
      persistedSeenUnlockedNavItems,
      setLanguage: setLanguageState,
      setCurrency: setCurrencyState,
      setUsdToKhrExchangeRate: setUsdToKhrExchangeRateState,
      setItemImageMode: setItemImageModeState,
      setDimChartsWhileLoading: setDimChartsWhileLoadingState,
      setDisplayViewMode: (next) => {
        setDisplayViewModeState(next);
        if (next === 'compact') {
          setShowExplanatoryTooltipsState(false);
          setShowFloatingTitleActionsState(false);
          setShowRightRailCardsState(false);
          setShowOverviewTaskTabsState(false);
          setShowAnalysisPageState(false);
          setShowPerformanceCompareToggleState(false);
          setShowPerformanceTimelineCardState(false);
          setShowLogsViewToggleState(false);
          setShowHeartbeatRibbonsState(false);
          return;
        }

        setShowExplanatoryTooltipsState(customShowExplanatoryTooltips);
        setShowFloatingTitleActionsState(customShowFloatingTitleActions);
        setShowRightRailCardsState(customShowRightRailCards);
        setShowOverviewTaskTabsState(customShowOverviewTaskTabs);
        setShowAnalysisPageState(customShowAnalysisPage);
        setShowPerformanceCompareToggleState(customShowPerformanceCompareToggle);
        setShowPerformanceTimelineCardState(customShowPerformanceTimelineCard);
        setShowLogsViewToggleState(customShowLogsViewToggle);
        setShowHeartbeatRibbonsState(customShowHeartbeatRibbons);
      },
      setShowExplanatoryTooltips: (next) => {
        setDisplayViewModeState('custom');
        setShowExplanatoryTooltipsState(next);
        setCustomShowExplanatoryTooltipsState(next);
      },
      setShowFloatingTitleActions: (next) => {
        setDisplayViewModeState('custom');
        setShowFloatingTitleActionsState(next);
        setCustomShowFloatingTitleActionsState(next);
      },
      setShowRightRailCards: (next) => {
        setDisplayViewModeState('custom');
        setShowRightRailCardsState(next);
        setCustomShowRightRailCardsState(next);
      },
      setShowOverviewTaskTabs: (next) => {
        setDisplayViewModeState('custom');
        setShowOverviewTaskTabsState(next);
        setCustomShowOverviewTaskTabsState(next);
      },
      setShowAnalysisPage: (next) => {
        setDisplayViewModeState('custom');
        setShowAnalysisPageState(next);
        setCustomShowAnalysisPageState(next);
      },
      setShowPerformanceCompareToggle: (next) => {
        setDisplayViewModeState('custom');
        setShowPerformanceCompareToggleState(next);
        setCustomShowPerformanceCompareToggleState(next);
      },
      setShowPerformanceTimelineCard: (next) => {
        setDisplayViewModeState('custom');
        setShowPerformanceTimelineCardState(next);
        setCustomShowPerformanceTimelineCardState(next);
      },
      setShowLogsViewToggle: (next) => {
        setDisplayViewModeState('custom');
        setShowLogsViewToggleState(next);
        setCustomShowLogsViewToggleState(next);
      },
      setShowHeartbeatRibbons: (next) => {
        setDisplayViewModeState('custom');
        setShowHeartbeatRibbonsState(next);
        setCustomShowHeartbeatRibbonsState(next);
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
        if (mode === 'compact') {
          await savePreferencesPatch({
            displayViewMode: 'compact',
            showExplanatoryTooltips: false,
            showFloatingTitleActions: false,
            showRightRailCards: false,
            showOverviewTaskTabs: false,
            showAnalysisPage: false,
            showPerformanceCompareToggle: false,
            showPerformanceTimelineCard: false,
            showLogsViewToggle: false,
            showHeartbeatRibbons: false,
            customShowExplanatoryTooltips,
            customShowFloatingTitleActions,
            customShowRightRailCards,
            customShowOverviewTaskTabs,
            customShowAnalysisPage,
            customShowPerformanceCompareToggle,
            customShowPerformanceTimelineCard,
            customShowLogsViewToggle,
            customShowHeartbeatRibbons,
          });
          return;
        }

        await savePreferencesPatch({
          displayViewMode: 'custom',
          showExplanatoryTooltips: customShowExplanatoryTooltips,
          showFloatingTitleActions: customShowFloatingTitleActions,
          showRightRailCards: customShowRightRailCards,
          showOverviewTaskTabs: customShowOverviewTaskTabs,
          showAnalysisPage: customShowAnalysisPage,
          showPerformanceCompareToggle: customShowPerformanceCompareToggle,
          showPerformanceTimelineCard: customShowPerformanceTimelineCard,
          showLogsViewToggle: customShowLogsViewToggle,
          showHeartbeatRibbons: customShowHeartbeatRibbons,
          customShowExplanatoryTooltips,
          customShowFloatingTitleActions,
          customShowRightRailCards,
          customShowOverviewTaskTabs,
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
        const resolvedShowAnalysisPage =
          overrides?.showAnalysisPage ?? showAnalysisPage;
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
        const resolvedCustomShowAnalysisPage =
          overrides?.customShowAnalysisPage ?? (
            overrides?.showAnalysisPage ?? customShowAnalysisPage
          );
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
          overrides?.showAnalysisPage != null ||
          overrides?.showPerformanceCompareToggle != null ||
          overrides?.showPerformanceTimelineCard != null ||
          overrides?.showLogsViewToggle != null ||
          overrides?.showHeartbeatRibbons != null ||
          overrides?.customShowExplanatoryTooltips != null ||
          overrides?.customShowFloatingTitleActions != null ||
          overrides?.customShowRightRailCards != null ||
          overrides?.customShowOverviewTaskTabs != null ||
          overrides?.customShowAnalysisPage != null ||
          overrides?.customShowPerformanceCompareToggle != null ||
          overrides?.customShowPerformanceTimelineCard != null ||
          overrides?.customShowLogsViewToggle != null ||
          overrides?.customShowHeartbeatRibbons != null;
        const resolvedDisplayViewMode =
          overrides?.displayViewMode ??
          (updatesVisibilityPreferences ? 'custom' : displayViewMode);

        await savePreferencesPatch({
          language: overrides?.language ?? language,
          currency: overrides?.currency ?? currency,
          usdToKhrExchangeRate: overrides?.usdToKhrExchangeRate ?? usdToKhrExchangeRate,
          displayViewMode: resolvedDisplayViewMode,
          itemImageMode: overrides?.itemImageMode ?? itemImageMode,
          dimChartsWhileLoading: overrides?.dimChartsWhileLoading ?? dimChartsWhileLoading,
          showExplanatoryTooltips:
            resolvedDisplayViewMode === 'compact' ? false : resolvedShowExplanatoryTooltips,
          showFloatingTitleActions:
            resolvedDisplayViewMode === 'compact' ? false : resolvedShowFloatingTitleActions,
          showRightRailCards:
            resolvedDisplayViewMode === 'compact' ? false : resolvedShowRightRailCards,
          showOverviewTaskTabs:
            resolvedDisplayViewMode === 'compact' ? false : resolvedShowOverviewTaskTabs,
          showAnalysisPage:
            resolvedDisplayViewMode === 'compact' ? false : resolvedShowAnalysisPage,
          showPerformanceCompareToggle:
            resolvedDisplayViewMode === 'compact' ? false : resolvedShowPerformanceCompareToggle,
          showPerformanceTimelineCard:
            resolvedDisplayViewMode === 'compact' ? false : resolvedShowPerformanceTimelineCard,
          showLogsViewToggle:
            resolvedDisplayViewMode === 'compact' ? false : resolvedShowLogsViewToggle,
          showHeartbeatRibbons:
            resolvedDisplayViewMode === 'compact' ? false : resolvedShowHeartbeatRibbons,
          customShowExplanatoryTooltips: resolvedCustomShowExplanatoryTooltips,
          customShowFloatingTitleActions: resolvedCustomShowFloatingTitleActions,
          customShowRightRailCards: resolvedCustomShowRightRailCards,
          customShowOverviewTaskTabs: resolvedCustomShowOverviewTaskTabs,
          customShowAnalysisPage: resolvedCustomShowAnalysisPage,
          customShowPerformanceCompareToggle: resolvedCustomShowPerformanceCompareToggle,
          customShowPerformanceTimelineCard: resolvedCustomShowPerformanceTimelineCard,
          customShowLogsViewToggle: resolvedCustomShowLogsViewToggle,
          customShowHeartbeatRibbons: resolvedCustomShowHeartbeatRibbons,
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
        });
      },
      markUnlockedNavItemSeen: async (itemId) => {
        if (seenUnlockedNavItems[itemId]) {
          return;
        }

        await savePreferencesPatch({
          seenUnlockedNavItems: {
            ...seenUnlockedNavItems,
            [itemId]: true,
          },
        });
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
        setShowAnalysisPageState(persistedShowAnalysisPage);
        setShowPerformanceCompareToggleState(persistedShowPerformanceCompareToggle);
        setShowPerformanceTimelineCardState(persistedShowPerformanceTimelineCard);
        setShowLogsViewToggleState(persistedShowLogsViewToggle);
        setShowHeartbeatRibbonsState(persistedShowHeartbeatRibbons);
        setCustomShowExplanatoryTooltipsState(persistedCustomShowExplanatoryTooltips);
        setCustomShowFloatingTitleActionsState(persistedCustomShowFloatingTitleActions);
        setCustomShowRightRailCardsState(persistedCustomShowRightRailCards);
        setCustomShowOverviewTaskTabsState(persistedCustomShowOverviewTaskTabs);
        setCustomShowAnalysisPageState(persistedCustomShowAnalysisPage);
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
        setSeenUnlockedNavItemsState(persistedSeenUnlockedNavItems);
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
        showAnalysisPage !== persistedShowAnalysisPage ||
        showPerformanceCompareToggle !== persistedShowPerformanceCompareToggle ||
        showPerformanceTimelineCard !== persistedShowPerformanceTimelineCard ||
        showLogsViewToggle !== persistedShowLogsViewToggle ||
        showHeartbeatRibbons !== persistedShowHeartbeatRibbons ||
        customShowExplanatoryTooltips !== persistedCustomShowExplanatoryTooltips ||
        customShowFloatingTitleActions !== persistedCustomShowFloatingTitleActions ||
        customShowRightRailCards !== persistedCustomShowRightRailCards ||
        customShowOverviewTaskTabs !== persistedCustomShowOverviewTaskTabs ||
        customShowAnalysisPage !== persistedCustomShowAnalysisPage ||
        customShowPerformanceCompareToggle !== persistedCustomShowPerformanceCompareToggle ||
        customShowPerformanceTimelineCard !== persistedCustomShowPerformanceTimelineCard ||
        customShowLogsViewToggle !== persistedCustomShowLogsViewToggle ||
        customShowHeartbeatRibbons !== persistedCustomShowHeartbeatRibbons ||
        JSON.stringify(taskBatchUpdatePreferences) !== JSON.stringify(persistedTaskBatchUpdatePreferences) ||
        overviewStaleUpdateReminderSnoozeUntil !== persistedOverviewStaleUpdateReminderSnoozeUntil ||
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
      persistedShowAnalysisPage,
      persistedShowPerformanceCompareToggle,
      persistedShowPerformanceTimelineCard,
      persistedShowLogsViewToggle,
      persistedShowHeartbeatRibbons,
      persistedSenaEngineParameters,
      persistedOverviewStaleUpdateReminderSnoozeUntil,
      senaEngineParameters,
      taskBatchUpdatePreferences,
      overviewStaleUpdateReminderSnoozeUntil,
      onboardingCompletedAt,
      usdToKhrExchangeRate,
      seenUnlockedNavItems,
      showExplanatoryTooltips,
      showFloatingTitleActions,
      showRightRailCards,
      showOverviewTaskTabs,
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
