import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AppCurrency, AppLanguage } from '@shared/inventory';
import { SHOW_DESCRIPTION_TEXT } from '@/components/system/description-text';
import { currencyLabel, getTranslation, type TranslationKey } from '../lib/translations';

function isDescriptionTranslationKey(key: TranslationKey) {
  return key.endsWith('Body') || key.endsWith('Description');
}

interface PreferencesContextValue {
  language: AppLanguage;
  currency: AppCurrency;
  persistedLanguage: AppLanguage;
  persistedCurrency: AppCurrency;
  setLanguage: (value: AppLanguage) => void;
  setCurrency: (value: AppCurrency) => void;
  savePreferences: () => Promise<void>;
  resetPreferences: () => void;
  hasPendingChanges: boolean;
  t: (key: TranslationKey) => string;
  currencyLabel: (value: AppCurrency) => string;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>('en');
  const [currency, setCurrencyState] = useState<AppCurrency>('USD');
  const [persistedLanguage, setPersistedLanguage] = useState<AppLanguage>('en');
  const [persistedCurrency, setPersistedCurrency] = useState<AppCurrency>('USD');

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
        setPersistedLanguage(preferences.language);
        setPersistedCurrency(preferences.currency);
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
      persistedLanguage,
      persistedCurrency,
      setLanguage: setLanguageState,
      setCurrency: setCurrencyState,
      savePreferences: async () => {
        const nextPreferences = await window.banjiDesktop.preferences.save({
          language,
          currency,
        });
        setLanguageState(nextPreferences.language);
        setCurrencyState(nextPreferences.currency);
        setPersistedLanguage(nextPreferences.language);
        setPersistedCurrency(nextPreferences.currency);
      },
      resetPreferences: () => {
        setLanguageState(persistedLanguage);
        setCurrencyState(persistedCurrency);
      },
      hasPendingChanges:
        language !== persistedLanguage || currency !== persistedCurrency,
      t: (key) => {
        if (!SHOW_DESCRIPTION_TEXT && isDescriptionTranslationKey(key)) {
          return '';
        }

        return getTranslation(language, key);
      },
      currencyLabel: (next) => currencyLabel(language, next),
    }),
    [currency, language, persistedCurrency, persistedLanguage],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const value = useContext(PreferencesContext);
  if (!value) {
    throw new Error('PreferencesProvider is missing');
  }
  return value;
}
