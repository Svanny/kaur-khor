import type { AppCurrency, AppLanguage } from '@shared/inventory';
import { usePreferences } from '../state/preferences';

export function SettingsRoute() {
  const { currency, currencyLabel, language, setCurrency, setLanguage, t } = usePreferences();

  return (
    <section className="page-stack">
      <div className="panel settings-panel">
        <div className="panel-header">
          <div>
            <h1>{t('settingsTitle')}</h1>
            <p>{t('settingsStorage')}</p>
          </div>
        </div>

        <label className="field">
          <span>{t('settingsLanguage')}</span>
          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value as AppLanguage)}
          >
            <option value="en">{t('languageEnglish')}</option>
            <option value="km">{t('languageKhmer')}</option>
          </select>
        </label>

        <label className="field">
          <span>{t('settingsCurrency')}</span>
          <select
            value={currency}
            onChange={(event) => setCurrency(event.target.value as AppCurrency)}
          >
            <option value="USD">{currencyLabel('USD')}</option>
            <option value="KHR">{currencyLabel('KHR')}</option>
          </select>
        </label>
      </div>
    </section>
  );
}
