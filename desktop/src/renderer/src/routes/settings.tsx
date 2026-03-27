import type { AppCurrency, AppLanguage } from '@shared/inventory';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  WorkspaceHero,
  WorkspacePage,
  WorkspacePanel,
} from '@/components/system/workspace';
import { usePreferences } from '@/state/preferences';

export function SettingsRoute() {
  const { currency, currencyLabel, language, setCurrency, setLanguage, t } = usePreferences();

  return (
    <WorkspacePage>
      <WorkspaceHero
        description={t('settingsStorage')}
        eyebrow={t('navSettings')}
        title={t('settingsTitle')}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
        <WorkspacePanel
          description={t('preferencesRegionalDescription')}
          title={t('preferencesRegionalTitle')}
        >
          <FieldGroup>
            <Field orientation="responsive">
              <FieldLabel htmlFor="language-select">{t('settingsLanguage')}</FieldLabel>
              <FieldContent>
                <Select value={language} onValueChange={(value) => setLanguage(value as AppLanguage)}>
                  <SelectTrigger className="w-full rounded-2xl bg-background/60" id="language-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="en">{t('languageEnglish')}</SelectItem>
                      <SelectItem value="km">{t('languageKhmer')}</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>

            <Field orientation="responsive">
              <FieldLabel htmlFor="currency-select">{t('settingsCurrency')}</FieldLabel>
              <FieldContent>
                <Select value={currency} onValueChange={(value) => setCurrency(value as AppCurrency)}>
                  <SelectTrigger className="w-full rounded-2xl bg-background/60" id="currency-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="USD">{currencyLabel('USD')}</SelectItem>
                      <SelectItem value="KHR">{currencyLabel('KHR')}</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>
          </FieldGroup>
        </WorkspacePanel>

        <WorkspacePanel description={t('settingsDisclaimer')} title={t('settingsStorageTitle')}>
          <div className="rounded-3xl border border-border/70 bg-background/60 p-5">
            <p className="text-sm leading-6 text-muted-foreground">{t('settingsStorage')}</p>
          </div>
          <FieldGroup className="mt-4">
            <Field>
              <FieldLabel>{t('navDashboard')}</FieldLabel>
              <FieldDescription>{t('dashboardBody')}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel>{t('navInventory')}</FieldLabel>
              <FieldDescription>{t('inventoryBody')}</FieldDescription>
            </Field>
          </FieldGroup>
        </WorkspacePanel>
      </div>
    </WorkspacePage>
  );
}
