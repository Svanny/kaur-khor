import type { AppCurrency, AppLanguage } from '@shared/inventory';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PageIntro, PageSection, Surface } from '@/components/banji-primitives';
import { usePreferences } from '@/state/preferences';

export function SettingsRoute() {
  const { currency, currencyLabel, language, setCurrency, setLanguage, t } = usePreferences();

  return (
    <PageSection className="space-y-6">
      <PageIntro
        description={t('settingsStorage')}
        eyebrow={t('navSettings')}
        title={t('settingsTitle')}
      />

      <Surface className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium text-foreground">
            <span>{t('settingsLanguage')}</span>
            <Select value={language} onValueChange={(value) => setLanguage(value as AppLanguage)}>
              <SelectTrigger className="h-12 w-full rounded-2xl bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">{t('languageEnglish')}</SelectItem>
                <SelectItem value="km">{t('languageKhmer')}</SelectItem>
              </SelectContent>
            </Select>
          </label>

          <label className="grid gap-2 text-sm font-medium text-foreground">
            <span>{t('settingsCurrency')}</span>
            <Select value={currency} onValueChange={(value) => setCurrency(value as AppCurrency)}>
              <SelectTrigger className="h-12 w-full rounded-2xl bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USD">{currencyLabel('USD')}</SelectItem>
                <SelectItem value="KHR">{currencyLabel('KHR')}</SelectItem>
              </SelectContent>
            </Select>
          </label>
        </div>

        <div className="rounded-[24px] border border-border/70 bg-background/70 px-5 py-4">
          <p className="text-sm font-medium text-foreground">{t('settingsStorageTitle')}</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{t('settingsDisclaimer')}</p>
        </div>
      </Surface>
    </PageSection>
  );
}
