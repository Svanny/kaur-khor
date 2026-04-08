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
  normalizeSenaEngineParameters,
  senaEngineParametersEqual,
  type SenaEngineParameters,
} from '@shared/ipc';
import { DescriptionTextVisibilityProvider } from '@/components/system/description-text';
import { currencyLabel, getTranslation, type TranslationKey } from '../lib/translations';

interface PreferencesContextValue {
  language: AppLanguage;
  currency: AppCurrency;
  showExplanatoryTooltips: boolean;
  showFloatingTitleActions: boolean;
  showRightRailCards: boolean;
  senaEngineParameters: SenaEngineParameters;
  displayViewMode: 'minimal' | 'maximal';
  persistedLanguage: AppLanguage;
  persistedCurrency: AppCurrency;
  persistedShowExplanatoryTooltips: boolean;
  persistedShowFloatingTitleActions: boolean;
  persistedShowRightRailCards: boolean;
  persistedSenaEngineParameters: SenaEngineParameters;
  setLanguage: (value: AppLanguage) => void;
  setCurrency: (value: AppCurrency) => void;
  setShowExplanatoryTooltips: (value: boolean) => void;
  setShowFloatingTitleActions: (value: boolean) => void;
  setShowRightRailCards: (value: boolean) => void;
  setSenaEngineParameters: (value: SenaEngineParameters) => void;
  applySenaEngineParameters: (value: SenaEngineParameters) => Promise<void>;
  applyDisplayViewMode: (mode: 'minimal' | 'maximal') => Promise<void>;
  savePreferences: () => Promise<void>;
  resetPreferences: () => void;
  hasPendingChanges: boolean;
  t: (key: TranslationKey) => string;
  rawT: (key: TranslationKey) => string;
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

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>('en');
  const [currency, setCurrencyState] = useState<AppCurrency>('USD');
  const [showExplanatoryTooltips, setShowExplanatoryTooltipsState] = useState(true);
  const [showFloatingTitleActions, setShowFloatingTitleActionsState] = useState(true);
  const [showRightRailCards, setShowRightRailCardsState] = useState(true);
  const [senaEngineParameters, setSenaEngineParametersState] = useState(() =>
    normalizeSenaEngineParameters(null),
  );
  const [persistedLanguage, setPersistedLanguage] = useState<AppLanguage>('en');
  const [persistedCurrency, setPersistedCurrency] = useState<AppCurrency>('USD');
  const [persistedShowExplanatoryTooltips, setPersistedShowExplanatoryTooltips] = useState(true);
  const [persistedShowFloatingTitleActions, setPersistedShowFloatingTitleActions] = useState(true);
  const [persistedShowRightRailCards, setPersistedShowRightRailCards] = useState(true);
  const [persistedSenaEngineParameters, setPersistedSenaEngineParameters] = useState(() =>
    normalizeSenaEngineParameters(null),
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

        setLanguageState(preferences.language);
        setCurrencyState(preferences.currency);
        setShowExplanatoryTooltipsState(preferences.showExplanatoryTooltips);
        setShowFloatingTitleActionsState(preferences.showFloatingTitleActions);
        setShowRightRailCardsState(preferences.showRightRailCards);
        setSenaEngineParametersState(nextSenaEngineParameters);
        setPersistedLanguage(preferences.language);
        setPersistedCurrency(preferences.currency);
        setPersistedShowExplanatoryTooltips(preferences.showExplanatoryTooltips);
        setPersistedShowFloatingTitleActions(preferences.showFloatingTitleActions);
        setPersistedShowRightRailCards(preferences.showRightRailCards);
        setPersistedSenaEngineParameters(nextSenaEngineParameters);
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
    showExplanatoryTooltips: boolean;
    showFloatingTitleActions: boolean;
    showRightRailCards: boolean;
    senaEngineParameters: SenaEngineParameters;
  }>) {
    const nextPreferences = await window.banjiDesktop.preferences.save(next);
    const nextSenaEngineParameters = normalizeSenaEngineParameters(nextPreferences.senaEngineParameters);
    setLanguageState(nextPreferences.language);
    setCurrencyState(nextPreferences.currency);
    setShowExplanatoryTooltipsState(nextPreferences.showExplanatoryTooltips);
    setShowFloatingTitleActionsState(nextPreferences.showFloatingTitleActions);
    setShowRightRailCardsState(nextPreferences.showRightRailCards);
    setSenaEngineParametersState(nextSenaEngineParameters);
    setPersistedLanguage(nextPreferences.language);
    setPersistedCurrency(nextPreferences.currency);
    setPersistedShowExplanatoryTooltips(nextPreferences.showExplanatoryTooltips);
    setPersistedShowFloatingTitleActions(nextPreferences.showFloatingTitleActions);
    setPersistedShowRightRailCards(nextPreferences.showRightRailCards);
    setPersistedSenaEngineParameters(nextSenaEngineParameters);
    return nextPreferences;
  }

  const value = useMemo<PreferencesContextValue>(
    () => ({
      language,
      currency,
      showExplanatoryTooltips,
      showFloatingTitleActions,
      showRightRailCards,
      senaEngineParameters,
      displayViewMode: resolveDisplayViewMode({
        showExplanatoryTooltips,
        showFloatingTitleActions,
        showRightRailCards,
      }),
      persistedLanguage,
      persistedCurrency,
      persistedShowExplanatoryTooltips,
      persistedShowFloatingTitleActions,
      persistedShowRightRailCards,
      persistedSenaEngineParameters,
      setLanguage: setLanguageState,
      setCurrency: setCurrencyState,
      setShowExplanatoryTooltips: setShowExplanatoryTooltipsState,
      setShowFloatingTitleActions: setShowFloatingTitleActionsState,
      setShowRightRailCards: setShowRightRailCardsState,
      setSenaEngineParameters: (next) =>
        setSenaEngineParametersState(normalizeSenaEngineParameters(next)),
      applySenaEngineParameters: async (next) => {
        await savePreferencesPatch({
          senaEngineParameters: normalizeSenaEngineParameters(next),
        });
      },
      applyDisplayViewMode: async (mode) => {
        await savePreferencesPatch({
          showExplanatoryTooltips: mode === 'maximal',
          showFloatingTitleActions: mode === 'maximal',
          showRightRailCards: mode === 'maximal',
        });
      },
      savePreferences: async () => {
        await savePreferencesPatch({
          language,
          currency,
          showExplanatoryTooltips,
          showFloatingTitleActions,
          showRightRailCards,
          senaEngineParameters,
        });
      },
      resetPreferences: () => {
        setLanguageState(persistedLanguage);
        setCurrencyState(persistedCurrency);
        setShowExplanatoryTooltipsState(persistedShowExplanatoryTooltips);
        setShowFloatingTitleActionsState(persistedShowFloatingTitleActions);
        setShowRightRailCardsState(persistedShowRightRailCards);
        setSenaEngineParametersState(persistedSenaEngineParameters);
      },
      hasPendingChanges:
        language !== persistedLanguage ||
        currency !== persistedCurrency ||
        showExplanatoryTooltips !== persistedShowExplanatoryTooltips ||
        showFloatingTitleActions !== persistedShowFloatingTitleActions ||
        showRightRailCards !== persistedShowRightRailCards ||
        !senaEngineParametersEqual(senaEngineParameters, persistedSenaEngineParameters),
      t: (key) => getTranslation(language, key),
      rawT: (key) => getTranslation(language, key),
      currencyLabel: (next) => currencyLabel(language, next),
    }),
    [
      currency,
      language,
      persistedCurrency,
      persistedLanguage,
      persistedShowExplanatoryTooltips,
      persistedShowFloatingTitleActions,
      persistedShowRightRailCards,
      persistedSenaEngineParameters,
      senaEngineParameters,
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
