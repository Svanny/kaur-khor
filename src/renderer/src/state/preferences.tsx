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
  DEFAULT_USD_TO_KHR_EXCHANGE_RATE,
  normalizeDesktopPreferenceTimestamp,
  normalizeSenaEngineParameters,
  senaEngineParametersEqual,
  type SenaEngineParameters,
} from '@shared/ipc';
import { DescriptionTextVisibilityProvider } from '@/components/system/description-text';
import { currencyLabel, getTranslation, type TranslationKey, type TranslationVariables } from '../lib/translations';

interface PreferencesContextValue {
  language: AppLanguage;
  currency: AppCurrency;
  usdToKhrExchangeRate: number;
  showExplanatoryTooltips: boolean;
  showFloatingTitleActions: boolean;
  showRightRailCards: boolean;
  senaEngineParameters: SenaEngineParameters;
  overviewStaleUpdateReminderSnoozeUntil: string | null;
  displayViewMode: 'minimal' | 'maximal';
  persistedLanguage: AppLanguage;
  persistedCurrency: AppCurrency;
  persistedUsdToKhrExchangeRate: number;
  persistedShowExplanatoryTooltips: boolean;
  persistedShowFloatingTitleActions: boolean;
  persistedShowRightRailCards: boolean;
  persistedSenaEngineParameters: SenaEngineParameters;
  persistedOverviewStaleUpdateReminderSnoozeUntil: string | null;
  setLanguage: (value: AppLanguage) => void;
  setCurrency: (value: AppCurrency) => void;
  setUsdToKhrExchangeRate: (value: number) => void;
  setShowExplanatoryTooltips: (value: boolean) => void;
  setShowFloatingTitleActions: (value: boolean) => void;
  setShowRightRailCards: (value: boolean) => void;
  setSenaEngineParameters: (value: SenaEngineParameters) => void;
  setOverviewStaleUpdateReminderSnoozeUntil: (value: string | null) => void;
  applySenaEngineParameters: (value: SenaEngineParameters) => Promise<void>;
  applyOverviewStaleUpdateReminderSnoozeUntil: (value: string | null) => Promise<void>;
  applyDisplayViewMode: (mode: 'minimal' | 'maximal') => Promise<void>;
  savePreferences: (overrides?: Partial<{
    language: AppLanguage;
    currency: AppCurrency;
    usdToKhrExchangeRate: number;
    showExplanatoryTooltips: boolean;
    showFloatingTitleActions: boolean;
    showRightRailCards: boolean;
    senaEngineParameters: SenaEngineParameters;
    overviewStaleUpdateReminderSnoozeUntil: string | null;
  }>) => Promise<void>;
  resetPreferences: () => void;
  hasPendingChanges: boolean;
  t: (key: TranslationKey, variables?: TranslationVariables) => string;
  rawT: (key: TranslationKey, variables?: TranslationVariables) => string;
  currencyLabel: (value: AppCurrency) => string;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

function resolveDisplayViewMode({
  showExplanatoryTooltips,
  showFloatingTitleActions,
  showRightRailCards,
}: {
  showExplanatoryTooltips: boolean;
  showFloatingTitleActions: boolean;
  showRightRailCards: boolean;
}): 'minimal' | 'maximal' {
  return showExplanatoryTooltips && showFloatingTitleActions && showRightRailCards
    ? 'maximal'
    : 'minimal';
}

function normalizeUsdToKhrExchangeRate(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_USD_TO_KHR_EXCHANGE_RATE;
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>('en');
  const [currency, setCurrencyState] = useState<AppCurrency>('USD');
  const [usdToKhrExchangeRate, setUsdToKhrExchangeRateState] = useState(DEFAULT_USD_TO_KHR_EXCHANGE_RATE);
  const [showExplanatoryTooltips, setShowExplanatoryTooltipsState] = useState(true);
  const [showFloatingTitleActions, setShowFloatingTitleActionsState] = useState(true);
  const [showRightRailCards, setShowRightRailCardsState] = useState(true);
  const [senaEngineParameters, setSenaEngineParametersState] = useState(() =>
    normalizeSenaEngineParameters(null),
  );
  const [overviewStaleUpdateReminderSnoozeUntil, setOverviewStaleUpdateReminderSnoozeUntilState] =
    useState<string | null>(null);
  const [persistedLanguage, setPersistedLanguage] = useState<AppLanguage>('en');
  const [persistedCurrency, setPersistedCurrency] = useState<AppCurrency>('USD');
  const [persistedUsdToKhrExchangeRate, setPersistedUsdToKhrExchangeRate] = useState(DEFAULT_USD_TO_KHR_EXCHANGE_RATE);
  const [persistedShowExplanatoryTooltips, setPersistedShowExplanatoryTooltips] = useState(true);
  const [persistedShowFloatingTitleActions, setPersistedShowFloatingTitleActions] = useState(true);
  const [persistedShowRightRailCards, setPersistedShowRightRailCards] = useState(true);
  const [persistedSenaEngineParameters, setPersistedSenaEngineParameters] = useState(() =>
    normalizeSenaEngineParameters(null),
  );
  const [persistedOverviewStaleUpdateReminderSnoozeUntil, setPersistedOverviewStaleUpdateReminderSnoozeUntil] =
    useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    window.banjiDesktop.preferences
      .get()
      .then((preferences) => {
        if (!mounted) {
          return;
        }

        const nextSenaEngineParameters = normalizeSenaEngineParameters(preferences.senaEngineParameters);

        setLanguageState(preferences.language);
        setCurrencyState(preferences.currency);
        const nextUsdToKhrExchangeRate = normalizeUsdToKhrExchangeRate(preferences.usdToKhrExchangeRate);

        setUsdToKhrExchangeRateState(nextUsdToKhrExchangeRate);
        setShowExplanatoryTooltipsState(preferences.showExplanatoryTooltips);
        setShowFloatingTitleActionsState(preferences.showFloatingTitleActions);
        setShowRightRailCardsState(preferences.showRightRailCards);
        setSenaEngineParametersState(nextSenaEngineParameters);
        setOverviewStaleUpdateReminderSnoozeUntilState(
          normalizeDesktopPreferenceTimestamp(preferences.overviewStaleUpdateReminderSnoozeUntil),
        );
        setPersistedLanguage(preferences.language);
        setPersistedCurrency(preferences.currency);
        setPersistedUsdToKhrExchangeRate(nextUsdToKhrExchangeRate);
        setPersistedShowExplanatoryTooltips(preferences.showExplanatoryTooltips);
        setPersistedShowFloatingTitleActions(preferences.showFloatingTitleActions);
        setPersistedShowRightRailCards(preferences.showRightRailCards);
        setPersistedSenaEngineParameters(nextSenaEngineParameters);
        setPersistedOverviewStaleUpdateReminderSnoozeUntil(
          normalizeDesktopPreferenceTimestamp(preferences.overviewStaleUpdateReminderSnoozeUntil),
        );
      })
      .catch((error) => {
        console.error('failed to load desktop preferences', error);
      });

    return () => {
      mounted = false;
    };
  }, []);

  async function savePreferencesPatch(next: Partial<{
    language: AppLanguage;
    currency: AppCurrency;
    usdToKhrExchangeRate: number;
    showExplanatoryTooltips: boolean;
    showFloatingTitleActions: boolean;
    showRightRailCards: boolean;
    senaEngineParameters: SenaEngineParameters;
    overviewStaleUpdateReminderSnoozeUntil: string | null;
  }>) {
    const nextPreferences = await window.banjiDesktop.preferences.save(next);
    const nextSenaEngineParameters = normalizeSenaEngineParameters(nextPreferences.senaEngineParameters);
    const nextOverviewStaleUpdateReminderSnoozeUntil = normalizeDesktopPreferenceTimestamp(
      nextPreferences.overviewStaleUpdateReminderSnoozeUntil,
    );
    setLanguageState(nextPreferences.language);
    setCurrencyState(nextPreferences.currency);
    const nextUsdToKhrExchangeRate = normalizeUsdToKhrExchangeRate(nextPreferences.usdToKhrExchangeRate);
    setUsdToKhrExchangeRateState(nextUsdToKhrExchangeRate);
    setShowExplanatoryTooltipsState(nextPreferences.showExplanatoryTooltips);
    setShowFloatingTitleActionsState(nextPreferences.showFloatingTitleActions);
    setShowRightRailCardsState(nextPreferences.showRightRailCards);
    setSenaEngineParametersState(nextSenaEngineParameters);
    setOverviewStaleUpdateReminderSnoozeUntilState(nextOverviewStaleUpdateReminderSnoozeUntil);
    setPersistedLanguage(nextPreferences.language);
    setPersistedCurrency(nextPreferences.currency);
    setPersistedUsdToKhrExchangeRate(nextUsdToKhrExchangeRate);
    setPersistedShowExplanatoryTooltips(nextPreferences.showExplanatoryTooltips);
    setPersistedShowFloatingTitleActions(nextPreferences.showFloatingTitleActions);
    setPersistedShowRightRailCards(nextPreferences.showRightRailCards);
    setPersistedSenaEngineParameters(nextSenaEngineParameters);
    setPersistedOverviewStaleUpdateReminderSnoozeUntil(nextOverviewStaleUpdateReminderSnoozeUntil);
    return nextPreferences;
  }

  const value = useMemo<PreferencesContextValue>(
    () => ({
      language,
      currency,
      usdToKhrExchangeRate,
      showExplanatoryTooltips,
      showFloatingTitleActions,
      showRightRailCards,
      senaEngineParameters,
      overviewStaleUpdateReminderSnoozeUntil,
      displayViewMode: resolveDisplayViewMode({
        showExplanatoryTooltips,
        showFloatingTitleActions,
        showRightRailCards,
      }),
      persistedLanguage,
      persistedCurrency,
      persistedUsdToKhrExchangeRate,
      persistedShowExplanatoryTooltips,
      persistedShowFloatingTitleActions,
      persistedShowRightRailCards,
      persistedSenaEngineParameters,
      persistedOverviewStaleUpdateReminderSnoozeUntil,
      setLanguage: setLanguageState,
      setCurrency: setCurrencyState,
      setUsdToKhrExchangeRate: setUsdToKhrExchangeRateState,
      setShowExplanatoryTooltips: setShowExplanatoryTooltipsState,
      setShowFloatingTitleActions: setShowFloatingTitleActionsState,
      setShowRightRailCards: setShowRightRailCardsState,
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
        await savePreferencesPatch({
          showExplanatoryTooltips: mode === 'maximal',
          showFloatingTitleActions: mode === 'maximal',
          showRightRailCards: mode === 'maximal',
        });
      },
      savePreferences: async (overrides) => {
        await savePreferencesPatch({
          language: overrides?.language ?? language,
          currency: overrides?.currency ?? currency,
          usdToKhrExchangeRate: overrides?.usdToKhrExchangeRate ?? usdToKhrExchangeRate,
          showExplanatoryTooltips: overrides?.showExplanatoryTooltips ?? showExplanatoryTooltips,
          showFloatingTitleActions: overrides?.showFloatingTitleActions ?? showFloatingTitleActions,
          showRightRailCards: overrides?.showRightRailCards ?? showRightRailCards,
          senaEngineParameters: overrides?.senaEngineParameters ?? senaEngineParameters,
          overviewStaleUpdateReminderSnoozeUntil:
            overrides?.overviewStaleUpdateReminderSnoozeUntil ?? overviewStaleUpdateReminderSnoozeUntil,
        });
      },
      resetPreferences: () => {
        setLanguageState(persistedLanguage);
        setCurrencyState(persistedCurrency);
        setUsdToKhrExchangeRateState(persistedUsdToKhrExchangeRate);
        setShowExplanatoryTooltipsState(persistedShowExplanatoryTooltips);
        setShowFloatingTitleActionsState(persistedShowFloatingTitleActions);
        setShowRightRailCardsState(persistedShowRightRailCards);
        setSenaEngineParametersState(persistedSenaEngineParameters);
        setOverviewStaleUpdateReminderSnoozeUntilState(
          persistedOverviewStaleUpdateReminderSnoozeUntil,
        );
      },
      hasPendingChanges:
        language !== persistedLanguage ||
        currency !== persistedCurrency ||
        usdToKhrExchangeRate !== persistedUsdToKhrExchangeRate ||
        showExplanatoryTooltips !== persistedShowExplanatoryTooltips ||
        showFloatingTitleActions !== persistedShowFloatingTitleActions ||
        showRightRailCards !== persistedShowRightRailCards ||
        overviewStaleUpdateReminderSnoozeUntil !== persistedOverviewStaleUpdateReminderSnoozeUntil ||
        !senaEngineParametersEqual(senaEngineParameters, persistedSenaEngineParameters),
      t: (key, variables) => getTranslation(language, key, variables),
      rawT: (key, variables) => getTranslation(language, key, variables),
      currencyLabel: (next) => currencyLabel(language, next),
    }),
    [
      currency,
      language,
      persistedUsdToKhrExchangeRate,
      persistedCurrency,
      persistedLanguage,
      persistedShowExplanatoryTooltips,
      persistedShowFloatingTitleActions,
      persistedShowRightRailCards,
      persistedSenaEngineParameters,
      persistedOverviewStaleUpdateReminderSnoozeUntil,
      senaEngineParameters,
      overviewStaleUpdateReminderSnoozeUntil,
      usdToKhrExchangeRate,
      showExplanatoryTooltips,
      showFloatingTitleActions,
      showRightRailCards,
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
