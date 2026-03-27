import { useEffect, useState } from 'react';
import type { AppCurrency, AppLanguage } from '@shared/inventory';
import { Field, FieldContent, FieldGroup, FieldLabel } from '@/components/ui/field';
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
import { WorkspacePage, WorkspacePanel } from '@/components/system/workspace';
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
      <WorkspacePanel contentClassName="pt-0">
        <div className="grid gap-10">
          <section className="space-y-6">
            <div className="space-y-2">
              <h3 className="text-xl font-medium tracking-[-0.03em]">{t('preferencesRegionalTitle')}</h3>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                {t('preferencesRegionalDescription')}
              </p>
            </div>

            <FieldGroup>
              <Field orientation="responsive">
                <FieldLabel className="md:basis-56 md:shrink-0" htmlFor="language-select">
                  {t('settingsLanguage')}
                </FieldLabel>
                <FieldContent className="md:max-w-md">
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
                <FieldLabel className="md:basis-56 md:shrink-0" htmlFor="currency-select">
                  {t('settingsCurrency')}
                </FieldLabel>
                <FieldContent className="md:max-w-md">
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
          </section>

          <section className="space-y-6">
            <div className="space-y-2">
              <h3 className="text-xl font-medium tracking-[-0.03em]">{t('preferencesSistTitle')}</h3>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                {t('preferencesSistDescription')}
              </p>
            </div>

            <FieldGroup>
              <Field orientation="responsive">
                <FieldLabel className="md:basis-56 md:shrink-0" htmlFor="target-service-level">
                  {t('settingsTargetServiceLevel')}
                </FieldLabel>
                <FieldContent className="md:max-w-md">
                  <Input
                    className="w-full rounded-2xl bg-background/60"
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
                <FieldLabel className="md:basis-56 md:shrink-0" htmlFor="forecast-horizon">
                  {t('settingsForecastHorizon')}
                </FieldLabel>
                <FieldContent className="md:max-w-md">
                  <Input
                    className="w-full rounded-2xl bg-background/60"
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
                <FieldLabel className="md:basis-56 md:shrink-0" htmlFor="particle-count">
                  {t('settingsParticleCount')}
                </FieldLabel>
                <FieldContent className="md:max-w-md">
                  <Input
                    className="w-full rounded-2xl bg-background/60"
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
                <FieldLabel className="md:basis-56 md:shrink-0" htmlFor="smoothing-window">
                  {t('settingsSmoothingWindow')}
                </FieldLabel>
                <FieldContent className="md:max-w-md">
                  <Input
                    className="w-full rounded-2xl bg-background/60"
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

            <Button disabled={isSaving} onClick={() => void handleSaveSettings()}>
              {t('saveDraft')}
            </Button>
          </section>
        </div>
      </WorkspacePanel>
    </WorkspacePage>
  );
}
