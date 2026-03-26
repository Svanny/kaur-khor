import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { AppCurrency, AppLanguage } from '@shared/inventory';
import { currencyLabel, translations, type TranslationKey } from '../lib/translations';

const LANGUAGE_KEY = 'banji-language';
const CURRENCY_KEY = 'banji-currency';

interface PreferencesContextValue {
  language: AppLanguage;
  currency: AppCurrency;
  setLanguage: (value: AppLanguage) => void;
  setCurrency: (value: AppCurrency) => void;
  t: (key: TranslationKey) => string;
  currencyLabel: (value: AppCurrency) => string;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

function getInitialLanguage(): AppLanguage {
  const value = window.localStorage.getItem(LANGUAGE_KEY);
  return value === 'km' ? 'km' : 'en';
}

function getInitialCurrency(): AppCurrency {
  return window.localStorage.getItem(CURRENCY_KEY) === 'KHR' ? 'KHR' : 'USD';
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>(getInitialLanguage);
  const [currency, setCurrencyState] = useState<AppCurrency>(getInitialCurrency);

  const value = useMemo<PreferencesContextValue>(
    () => ({
      language,
      currency,
      setLanguage: (next) => {
        window.localStorage.setItem(LANGUAGE_KEY, next);
        setLanguageState(next);
      },
      setCurrency: (next) => {
        window.localStorage.setItem(CURRENCY_KEY, next);
        setCurrencyState(next);
      },
      t: (key) => translations[language][key] ?? translations.en[key],
      currencyLabel: (next) => currencyLabel(language, next),
    }),
    [currency, language],
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
