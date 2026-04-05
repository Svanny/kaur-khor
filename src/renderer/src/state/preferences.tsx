import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AppCurrency, AppLanguage } from '@shared/inventory';
import { DescriptionTextVisibilityProvider } from '@/components/system/description-text';
import { currencyLabel, getTranslation, type TranslationKey } from '../lib/translations';

function isDescriptionTranslationKey(key: TranslationKey) {
  return key.endsWith('Body') || key.endsWith('Description');
}

interface PreferencesContextValue {
  language: AppLanguage;
  currency: AppCurrency;
  showExplanatoryTooltips: boolean;
  showFloatingTitleActions: boolean;
  showRightRailCards: boolean;
  displayViewMode: 'minimal' | 'maximal';
  persistedLanguage: AppLanguage;
  persistedCurrency: AppCurrency;
  persistedShowExplanatoryTooltips: boolean;
  persistedShowFloatingTitleActions: boolean;
  persistedShowRightRailCards: boolean;
  setLanguage: (value: AppLanguage) => void;
  setCurrency: (value: AppCurrency) => void;
  setShowExplanatoryTooltips: (value: boolean) => void;
  setShowFloatingTitleActions: (value: boolean) => void;
  setShowRightRailCards: (value: boolean) => void;
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
  const [persistedLanguage, setPersistedLanguage] = useState<AppLanguage>('en');
  const [persistedCurrency, setPersistedCurrency] = useState<AppCurrency>('USD');
  const [persistedShowExplanatoryTooltips, setPersistedShowExplanatoryTooltips] = useState(true);
  const [persistedShowFloatingTitleActions, setPersistedShowFloatingTitleActions] = useState(true);
  const [persistedShowRightRailCards, setPersistedShowRightRailCards] = useState(true);

  useEffect(() => {
    let mounted = true;

    window.banjiDesktop.preferences
      .get()
      .then((preferences) => {
        if (!mounted) {
          return;
        }

        setLanguageState(preferences.language);
        setCurrencyState(preferences.currency);
        setShowExplanatoryTooltipsState(preferences.showExplanatoryTooltips);
        setShowFloatingTitleActionsState(preferences.showFloatingTitleActions);
        setShowRightRailCardsState(preferences.showRightRailCards);
        setPersistedLanguage(preferences.language);
        setPersistedCurrency(preferences.currency);
        setPersistedShowExplanatoryTooltips(preferences.showExplanatoryTooltips);
        setPersistedShowFloatingTitleActions(preferences.showFloatingTitleActions);
        setPersistedShowRightRailCards(preferences.showRightRailCards);
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
  }>) {
    const nextPreferences = await window.banjiDesktop.preferences.save(next);
    setLanguageState(nextPreferences.language);
    setCurrencyState(nextPreferences.currency);
    setShowExplanatoryTooltipsState(nextPreferences.showExplanatoryTooltips);
    setShowFloatingTitleActionsState(nextPreferences.showFloatingTitleActions);
    setShowRightRailCardsState(nextPreferences.showRightRailCards);
    setPersistedLanguage(nextPreferences.language);
    setPersistedCurrency(nextPreferences.currency);
    setPersistedShowExplanatoryTooltips(nextPreferences.showExplanatoryTooltips);
    setPersistedShowFloatingTitleActions(nextPreferences.showFloatingTitleActions);
    setPersistedShowRightRailCards(nextPreferences.showRightRailCards);
    return nextPreferences;
  }

  const value = useMemo<PreferencesContextValue>(
    () => ({
      language,
      currency,
      showExplanatoryTooltips,
      showFloatingTitleActions,
      showRightRailCards,
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
      setLanguage: setLanguageState,
      setCurrency: setCurrencyState,
      setShowExplanatoryTooltips: setShowExplanatoryTooltipsState,
      setShowFloatingTitleActions: setShowFloatingTitleActionsState,
      setShowRightRailCards: setShowRightRailCardsState,
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
        });
      },
      resetPreferences: () => {
        setLanguageState(persistedLanguage);
        setCurrencyState(persistedCurrency);
        setShowExplanatoryTooltipsState(persistedShowExplanatoryTooltips);
        setShowFloatingTitleActionsState(persistedShowFloatingTitleActions);
        setShowRightRailCardsState(persistedShowRightRailCards);
      },
      hasPendingChanges:
        language !== persistedLanguage ||
        currency !== persistedCurrency ||
        showExplanatoryTooltips !== persistedShowExplanatoryTooltips ||
        showFloatingTitleActions !== persistedShowFloatingTitleActions ||
        showRightRailCards !== persistedShowRightRailCards,
      t: (key) => {
        if (!showExplanatoryTooltips && isDescriptionTranslationKey(key)) {
          return '';
        }

        return getTranslation(language, key);
      },
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
