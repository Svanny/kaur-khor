import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AppCurrency, AppLanguage } from '@shared/inventory';
import { currencyLabel, getTranslation, type TranslationKey } from '../lib/translations';

interface PreferencesContextValue {
  language: AppLanguage;
  currency: AppCurrency;
  setLanguage: (value: AppLanguage) => void;
  setCurrency: (value: AppCurrency) => void;
  t: (key: TranslationKey) => string;
  currencyLabel: (value: AppCurrency) => string;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>('en');
  const [currency, setCurrencyState] = useState<AppCurrency>('USD');

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
      setLanguage: (next) => {
        setLanguageState(next);
        void window.banjiDesktop.preferences.save({ language: next }).catch((error) => {
          console.error('failed to save language preference', error);
        });
      },
      setCurrency: (next) => {
        setCurrencyState(next);
        void window.banjiDesktop.preferences.save({ currency: next }).catch((error) => {
          console.error('failed to save currency preference', error);
        });
      },
      t: (key) => getTranslation(language, key),
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
