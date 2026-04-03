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
  persistedLanguage: AppLanguage;
  persistedCurrency: AppCurrency;
  persistedShowExplanatoryTooltips: boolean;
  setLanguage: (value: AppLanguage) => void;
  setCurrency: (value: AppCurrency) => void;
  setShowExplanatoryTooltips: (value: boolean) => void;
  savePreferences: () => Promise<void>;
  resetPreferences: () => void;
  hasPendingChanges: boolean;
  t: (key: TranslationKey) => string;
  rawT: (key: TranslationKey) => string;
  currencyLabel: (value: AppCurrency) => string;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>('en');
  const [currency, setCurrencyState] = useState<AppCurrency>('USD');
  const [showExplanatoryTooltips, setShowExplanatoryTooltipsState] = useState(true);
  const [persistedLanguage, setPersistedLanguage] = useState<AppLanguage>('en');
  const [persistedCurrency, setPersistedCurrency] = useState<AppCurrency>('USD');
  const [persistedShowExplanatoryTooltips, setPersistedShowExplanatoryTooltips] = useState(true);

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
        setPersistedLanguage(preferences.language);
        setPersistedCurrency(preferences.currency);
        setPersistedShowExplanatoryTooltips(preferences.showExplanatoryTooltips);
      })
      .catch((error) => {
        console.error('failed to load desktop preferences', error);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const value = useMemo<PreferencesContextValue>(
    () => ({
      language,
      currency,
      showExplanatoryTooltips,
      persistedLanguage,
      persistedCurrency,
      persistedShowExplanatoryTooltips,
      setLanguage: setLanguageState,
      setCurrency: setCurrencyState,
      setShowExplanatoryTooltips: setShowExplanatoryTooltipsState,
      savePreferences: async () => {
        const nextPreferences = await window.banjiDesktop.preferences.save({
          language,
          currency,
          showExplanatoryTooltips,
        });
        setLanguageState(nextPreferences.language);
        setCurrencyState(nextPreferences.currency);
        setShowExplanatoryTooltipsState(nextPreferences.showExplanatoryTooltips);
        setPersistedLanguage(nextPreferences.language);
        setPersistedCurrency(nextPreferences.currency);
        setPersistedShowExplanatoryTooltips(nextPreferences.showExplanatoryTooltips);
      },
      resetPreferences: () => {
        setLanguageState(persistedLanguage);
        setCurrencyState(persistedCurrency);
        setShowExplanatoryTooltipsState(persistedShowExplanatoryTooltips);
      },
      hasPendingChanges:
        language !== persistedLanguage ||
        currency !== persistedCurrency ||
        showExplanatoryTooltips !== persistedShowExplanatoryTooltips,
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
      showExplanatoryTooltips,
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
