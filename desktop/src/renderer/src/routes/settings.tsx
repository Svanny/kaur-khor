import { useEffect, useState } from 'react';
import type { AppCurrency, AppLanguage } from '@shared/inventory';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import {
  WorkspaceHero,
  WorkspacePage,
  WorkspacePanel,
} from '@/components/system/workspace';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';

export function SettingsRoute() {
  const { snapshot, saveSistSettings, isSaving } = useInventory();
  const { currency, currencyLabel, language, setCurrency, setLanguage, t } = usePreferences();
  const [settingsForm, setSettingsForm] = useState({
    targetServiceLevel: snapshot?.sist.settings.targetServiceLevel?.toString() ?? '0.95',
    forecastHorizonDays: snapshot?.sist.settings.forecastHorizonDays?.toString() ?? '14',
    particleCount: snapshot?.sist.settings.particleCount?.toString() ?? '512',
    smoothingWindowReports: snapshot?.sist.settings.smoothingWindowReports?.toString() ?? '90',
  });

  useEffect(() => {
    if (!snapshot) {
      return;
    }
    setSettingsForm({
      targetServiceLevel: snapshot.sist.settings.targetServiceLevel.toString(),
      forecastHorizonDays: snapshot.sist.settings.forecastHorizonDays.toString(),
      particleCount: snapshot.sist.settings.particleCount.toString(),
      smoothingWindowReports: snapshot.sist.settings.smoothingWindowReports.toString(),
    });
  }, [snapshot]);

  async function handleSaveSettings() {
    await saveSistSettings({
      targetServiceLevel: Number(settingsForm.targetServiceLevel),
      forecastHorizonDays: Number(settingsForm.forecastHorizonDays),
      particleCount: Number(settingsForm.particleCount),
      smoothingWindowReports: Number(settingsForm.smoothingWindowReports),
    });
  }

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

        <WorkspacePanel description={t('preferencesSistDescription')} title={t('preferencesSistTitle')}>
          <FieldGroup>
            <Field orientation="responsive">
              <FieldLabel htmlFor="target-service-level">{t('settingsTargetServiceLevel')}</FieldLabel>
              <FieldContent>
                <Input
                  className="rounded-2xl bg-background/60"
                  id="target-service-level"
                  inputMode="decimal"
                  value={settingsForm.targetServiceLevel}
                  onChange={(event) =>
                    setSettingsForm((current) => ({
                      ...current,
                      targetServiceLevel: event.target.value,
                    }))
                  }
                />
              </FieldContent>
            </Field>

            <Field orientation="responsive">
              <FieldLabel htmlFor="forecast-horizon">{t('settingsForecastHorizon')}</FieldLabel>
              <FieldContent>
                <Input
                  className="rounded-2xl bg-background/60"
                  id="forecast-horizon"
                  inputMode="numeric"
                  value={settingsForm.forecastHorizonDays}
                  onChange={(event) =>
                    setSettingsForm((current) => ({
                      ...current,
                      forecastHorizonDays: event.target.value,
                    }))
                  }
                />
              </FieldContent>
            </Field>

            <Field orientation="responsive">
              <FieldLabel htmlFor="particle-count">{t('settingsParticleCount')}</FieldLabel>
              <FieldContent>
                <Input
                  className="rounded-2xl bg-background/60"
                  id="particle-count"
                  inputMode="numeric"
                  value={settingsForm.particleCount}
                  onChange={(event) =>
                    setSettingsForm((current) => ({
                      ...current,
                      particleCount: event.target.value,
                    }))
                  }
                />
              </FieldContent>
            </Field>

            <Field orientation="responsive">
              <FieldLabel htmlFor="smoothing-window">{t('settingsSmoothingWindow')}</FieldLabel>
              <FieldContent>
                <Input
                  className="rounded-2xl bg-background/60"
                  id="smoothing-window"
                  inputMode="numeric"
                  value={settingsForm.smoothingWindowReports}
                  onChange={(event) =>
                    setSettingsForm((current) => ({
                      ...current,
                      smoothingWindowReports: event.target.value,
                    }))
                  }
                />
              </FieldContent>
            </Field>
          </FieldGroup>

          <Button className="mt-4" disabled={isSaving} onClick={() => void handleSaveSettings()}>
            {t('saveDraft')}
          </Button>
        </WorkspacePanel>

        <WorkspacePanel description={t('settingsDisclaimer')} title={t('settingsStorageTitle')}>
          <div className="rounded-3xl border border-border/70 bg-background/60 p-5">
            <p className="text-sm leading-6 text-muted-foreground">{t('settingsStorage')}</p>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {snapshot?.sist.status.reason ?? t('preferencesSistDescription')}
            </p>
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
