import type { AppCurrency, AppLanguage } from '@shared/inventory';
import { usePreferences } from '../state/preferences';
import { PageHeader, ShellCard } from '../ui';

export function SettingsRoute() {
  const { currency, currencyLabel, language, setCurrency, setLanguage, t } = usePreferences();

  return (
    <section className="page-stack">
      <PageHeader backTo="/" title={t('settingsTitle')} />
      <ShellCard className="settings-card">
        <div className="settings-row">
          <span className="settings-label">{t('settingsLanguage')}</span>
          <select
            className="pill-select"
            value={language}
            onChange={(event) => setLanguage(event.target.value as AppLanguage)}
          >
            <option value="en">{t('languageEnglish')}</option>
            <option value="km">{t('languageKhmer')}</option>
          </select>
        </div>

        <div className="settings-row">
          <span className="settings-label">{t('settingsCurrency')}</span>
          <select
            className="pill-select"
            value={currency}
            onChange={(event) => setCurrency(event.target.value as AppCurrency)}
          >
            <option value="USD">{currencyLabel('USD')}</option>
            <option value="KHR">{currencyLabel('KHR')}</option>
          </select>
        </div>

        <div className="settings-row">
          <span className="settings-label">{t('settingsDisclaimer')}</span>
        </div>

      </ShellCard>
    </section>
  );
}
