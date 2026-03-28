import { useEffect, useMemo, useRef, useState } from 'react';
import { CircleHelp, ChevronDown, ChevronUp } from 'lucide-react';
import type { AppCurrency, AppLanguage } from '@shared/inventory';
import { HoverTooltip } from '@/components/system/hover-tooltip';
import { WorkspacePage, WorkspacePanel } from '@/components/system/workspace';
import { Button } from '@/components/ui/button';
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
import { cn } from '@/lib/utils';
import { useRouteLeaveConfirm } from '@/hooks/use-route-leave-confirm';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';

type SettingsForm = {
  targetServiceLevel: string;
  forecastHorizonDays: string;
  particleCount: string;
  smoothingWindowReports: string;
};

type SettingsErrors = Partial<Record<keyof SettingsForm, string>>;

function TooltipFieldLabel({
  htmlFor,
  label,
  tooltip,
}: {
  htmlFor: string;
  label: string;
  tooltip?: string;
}) {
  return (
    <div className="flex items-center gap-2 md:basis-56 md:shrink-0">
      <FieldLabel className="w-auto" htmlFor={htmlFor}>
        {label}
      </FieldLabel>
      {tooltip ? (
        <HoverTooltip
          ariaLabel={`${label} help`}
          className="group rounded-full p-1 text-muted-foreground"
          content={tooltip}
        >
          {({ open }) => (
            <CircleHelp
              aria-hidden="true"
              className={cn(
                'size-4 transition-colors group-hover:text-foreground group-focus-visible:text-foreground',
                open ? 'text-foreground' : 'text-muted-foreground',
              )}
            />
          )}
        </HoverTooltip>
      ) : null}
    </div>
  );
}

function createSettingsForm(snapshot: ReturnType<typeof useInventory>['snapshot']): SettingsForm {
  return {
    targetServiceLevel: snapshot?.sist.settings.targetServiceLevel?.toString() ?? '0.95',
    forecastHorizonDays: snapshot?.sist.settings.forecastHorizonDays?.toString() ?? '14',
    particleCount: snapshot?.sist.settings.particleCount?.toString() ?? '512',
    smoothingWindowReports: snapshot?.sist.settings.smoothingWindowReports?.toString() ?? '90',
  };
}

export function SettingsRoute() {
  const { snapshot, saveSistSettings, isSaving } = useInventory();
  const {
    currency,
    currencyLabel,
    hasPendingChanges,
    language,
    resetPreferences,
    savePreferences,
    setCurrency,
    setLanguage,
    t,
  } = usePreferences();

  const [settingsForm, setSettingsForm] = useState<SettingsForm>(() => createSettingsForm(snapshot));
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedErrors, setAdvancedErrors] = useState<SettingsErrors>({});
  const [preferencesError, setPreferencesError] = useState<string | null>(null);
  const [advancedError, setAdvancedError] = useState<string | null>(null);
  const [preferencesSaved, setPreferencesSaved] = useState(false);
  const [advancedSaved, setAdvancedSaved] = useState(false);
  const fieldRefs = useRef<Record<keyof SettingsForm, HTMLInputElement | null>>({
    targetServiceLevel: null,
    forecastHorizonDays: null,
    particleCount: null,
    smoothingWindowReports: null,
  });

  useEffect(() => {
    if (!snapshot) {
      return;
    }
    setSettingsForm(createSettingsForm(snapshot));
    setAdvancedErrors({});
    setAdvancedError(null);
  }, [snapshot]);

  const advancedDirty = useMemo(() => {
    if (!snapshot) {
      return false;
    }
    const baseline = createSettingsForm(snapshot);
    return (
      settingsForm.targetServiceLevel !== baseline.targetServiceLevel ||
      settingsForm.forecastHorizonDays !== baseline.forecastHorizonDays ||
      settingsForm.particleCount !== baseline.particleCount ||
      settingsForm.smoothingWindowReports !== baseline.smoothingWindowReports
    );
  }, [settingsForm, snapshot]);

  useEffect(() => {
    if (advancedDirty || Object.keys(advancedErrors).length > 0) {
      setAdvancedOpen(true);
    }
  }, [advancedDirty, advancedErrors]);

  useEffect(() => {
    if (advancedSaved && !advancedDirty && Object.keys(advancedErrors).length === 0 && !advancedError) {
      setAdvancedOpen(false);
    }
  }, [advancedDirty, advancedError, advancedErrors, advancedSaved]);

  const hasPendingSettingsChanges = hasPendingChanges || advancedDirty;
  useRouteLeaveConfirm({
    enabled: hasPendingSettingsChanges,
    message: t('settingsUnsavedLeavePrompt'),
    onDiscard: () => {
      resetPreferences();
      if (snapshot) {
        setSettingsForm(createSettingsForm(snapshot));
      }
      setAdvancedErrors({});
      setPreferencesError(null);
      setAdvancedError(null);
      setPreferencesSaved(false);
      setAdvancedSaved(false);
    },
  });

  const sistFieldTooltips = {
    targetServiceLevel: t('settingsTargetServiceLevelTooltip'),
    forecastHorizonDays: t('settingsForecastHorizonTooltip'),
    particleCount: t('settingsParticleCountTooltip'),
    smoothingWindowReports: t('settingsSmoothingWindowTooltip'),
  };

  function validateAdvancedSettings() {
    const nextErrors: SettingsErrors = {};
    const orderedFields: Array<keyof SettingsForm> = [
      'targetServiceLevel',
      'forecastHorizonDays',
      'particleCount',
      'smoothingWindowReports',
    ];

    for (const field of orderedFields) {
      const value = settingsForm[field].trim();
      const parsed = Number(value);
      if (!value || Number.isNaN(parsed) || !Number.isFinite(parsed) || parsed < 0) {
        nextErrors[field] = t('validationNonNegative');
      }
    }

    setAdvancedErrors(nextErrors);
    const firstInvalidField = orderedFields.find((field) => nextErrors[field]);
    if (firstInvalidField) {
      fieldRefs.current[firstInvalidField]?.focus();
    }
    return nextErrors;
  }

  async function handleSave() {
    setPreferencesSaved(false);
    setAdvancedSaved(false);
    setPreferencesError(null);
    setAdvancedError(null);

    if (advancedDirty) {
      const validationErrors = validateAdvancedSettings();
      if (Object.keys(validationErrors).length > 0) {
        setAdvancedOpen(true);
        return;
      }
    }

    if (advancedDirty) {
      try {
        await saveSistSettings({
          targetServiceLevel: Number(settingsForm.targetServiceLevel),
          forecastHorizonDays: Number(settingsForm.forecastHorizonDays),
          particleCount: Number(settingsForm.particleCount),
          smoothingWindowReports: Number(settingsForm.smoothingWindowReports),
        });
        setAdvancedSaved(true);
      } catch (error) {
        setAdvancedError(error instanceof Error ? error.message : t('apiUnavailable'));
        setAdvancedOpen(true);
        return;
      }
    }

    if (hasPendingChanges) {
      try {
        await savePreferences();
        setPreferencesSaved(true);
      } catch (error) {
        setPreferencesError(error instanceof Error ? error.message : t('apiUnavailable'));
      }
    }

    if (!advancedError && Object.keys(advancedErrors).length === 0 && !advancedDirty) {
      setAdvancedOpen(false);
    }
  }

  function handleReset() {
    resetPreferences();
    if (snapshot) {
      setSettingsForm(createSettingsForm(snapshot));
    }
    setAdvancedErrors({});
    setPreferencesError(null);
    setAdvancedError(null);
    setPreferencesSaved(false);
    setAdvancedSaved(false);
    setAdvancedOpen(false);
  }

  return (
    <WorkspacePage>
      <WorkspacePanel
        description={t('settingsBody')}
        title={t('settingsTitle')}
      >
        <div className="flex flex-wrap items-center justify-end gap-3">
          <Button disabled={!hasPendingSettingsChanges || isSaving} type="button" variant="outline" onClick={handleReset}>
            {t('settingsResetAction')}
          </Button>
          <Button disabled={!hasPendingSettingsChanges || isSaving} type="button" onClick={() => void handleSave()}>
            {t('saveDraft')}
          </Button>
        </div>

        <section className="space-y-6">
          <div className="space-y-2">
            <h3 className="text-xl font-medium tracking-[-0.03em]">{t('settingsWorkspacePreferencesTitle')}</h3>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              {t('settingsWorkspacePreferencesDescription')}
            </p>
          </div>

          {preferencesError ? <p className="text-sm text-destructive">{preferencesError}</p> : null}
          {!preferencesError && preferencesSaved ? (
            <p className="text-sm text-muted-foreground">{t('settingsPreferencesSaved')}</p>
          ) : null}

          <FieldGroup>
            <Field orientation="responsive">
              <TooltipFieldLabel htmlFor="language-select" label={t('settingsLanguage')} />
              <FieldContent className="md:max-w-md">
                <Select
                  value={language}
                  onValueChange={(value) => {
                    setPreferencesSaved(false);
                    setPreferencesError(null);
                    setLanguage(value as AppLanguage);
                  }}
                >
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
              <TooltipFieldLabel htmlFor="currency-select" label={t('settingsCurrency')} />
              <FieldContent className="md:max-w-md">
                <Select
                  value={currency}
                  onValueChange={(value) => {
                    setPreferencesSaved(false);
                    setPreferencesError(null);
                    setCurrency(value as AppCurrency);
                  }}
                >
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

        <section className="space-y-4">
          <div className="rounded-3xl border border-border/70 bg-card/55 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <h3 className="text-xl font-medium tracking-[-0.03em]">{t('settingsAdvancedTitle')}</h3>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                  {t('settingsAdvancedDescription')}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  setAdvancedOpen((current) =>
                    current && (advancedDirty || Object.keys(advancedErrors).length > 0)
                      ? true
                      : !current,
                  )
                }
              >
                {advancedOpen ? t('settingsAdvancedHide') : t('settingsAdvancedShow')}
                {advancedOpen ? <ChevronUp /> : <ChevronDown />}
              </Button>
            </div>

            {advancedOpen ? (
              <div className="mt-6 space-y-6">
                {advancedError ? <p className="text-sm text-destructive">{advancedError}</p> : null}
                {!advancedError && advancedSaved ? (
                  <p className="text-sm text-muted-foreground">{t('settingsAdvancedSaved')}</p>
                ) : null}

                <FieldGroup>
                  <Field orientation="responsive">
                    <TooltipFieldLabel
                      htmlFor="target-service-level"
                      label={t('settingsTargetServiceLevel')}
                      tooltip={sistFieldTooltips.targetServiceLevel}
                    />
                    <FieldContent className="md:max-w-md">
                      <Input
                        className="w-full rounded-2xl bg-background/60"
                        id="target-service-level"
                        inputMode="decimal"
                        ref={(node) => {
                          fieldRefs.current.targetServiceLevel = node;
                        }}
                        value={settingsForm.targetServiceLevel}
                        onChange={(event) => {
                          setAdvancedSaved(false);
                          setAdvancedErrors((current) => ({ ...current, targetServiceLevel: undefined }));
                          setSettingsForm((current) => ({
                            ...current,
                            targetServiceLevel: event.target.value,
                          }));
                        }}
                      />
                      {advancedErrors.targetServiceLevel ? (
                        <p className="mt-2 text-sm text-destructive">{advancedErrors.targetServiceLevel}</p>
                      ) : null}
                    </FieldContent>
                  </Field>

                  <Field orientation="responsive">
                    <TooltipFieldLabel
                      htmlFor="forecast-horizon"
                      label={t('settingsForecastHorizon')}
                      tooltip={sistFieldTooltips.forecastHorizonDays}
                    />
                    <FieldContent className="md:max-w-md">
                      <Input
                        className="w-full rounded-2xl bg-background/60"
                        id="forecast-horizon"
                        inputMode="numeric"
                        ref={(node) => {
                          fieldRefs.current.forecastHorizonDays = node;
                        }}
                        value={settingsForm.forecastHorizonDays}
                        onChange={(event) => {
                          setAdvancedSaved(false);
                          setAdvancedErrors((current) => ({ ...current, forecastHorizonDays: undefined }));
                          setSettingsForm((current) => ({
                            ...current,
                            forecastHorizonDays: event.target.value,
                          }));
                        }}
                      />
                      {advancedErrors.forecastHorizonDays ? (
                        <p className="mt-2 text-sm text-destructive">{advancedErrors.forecastHorizonDays}</p>
                      ) : null}
                    </FieldContent>
                  </Field>

                  <Field orientation="responsive">
                    <TooltipFieldLabel
                      htmlFor="particle-count"
                      label={t('settingsParticleCount')}
                      tooltip={sistFieldTooltips.particleCount}
                    />
                    <FieldContent className="md:max-w-md">
                      <Input
                        className="w-full rounded-2xl bg-background/60"
                        id="particle-count"
                        inputMode="numeric"
                        ref={(node) => {
                          fieldRefs.current.particleCount = node;
                        }}
                        value={settingsForm.particleCount}
                        onChange={(event) => {
                          setAdvancedSaved(false);
                          setAdvancedErrors((current) => ({ ...current, particleCount: undefined }));
                          setSettingsForm((current) => ({
                            ...current,
                            particleCount: event.target.value,
                          }));
                        }}
                      />
                      {advancedErrors.particleCount ? (
                        <p className="mt-2 text-sm text-destructive">{advancedErrors.particleCount}</p>
                      ) : null}
                    </FieldContent>
                  </Field>

                  <Field orientation="responsive">
                    <TooltipFieldLabel
                      htmlFor="smoothing-window"
                      label={t('settingsSmoothingWindow')}
                      tooltip={sistFieldTooltips.smoothingWindowReports}
                    />
                    <FieldContent className="md:max-w-md">
                      <Input
                        className="w-full rounded-2xl bg-background/60"
                        id="smoothing-window"
                        inputMode="numeric"
                        ref={(node) => {
                          fieldRefs.current.smoothingWindowReports = node;
                        }}
                        value={settingsForm.smoothingWindowReports}
                        onChange={(event) => {
                          setAdvancedSaved(false);
                          setAdvancedErrors((current) => ({ ...current, smoothingWindowReports: undefined }));
                          setSettingsForm((current) => ({
                            ...current,
                            smoothingWindowReports: event.target.value,
                          }));
                        }}
                      />
                      {advancedErrors.smoothingWindowReports ? (
                        <p className="mt-2 text-sm text-destructive">{advancedErrors.smoothingWindowReports}</p>
                      ) : null}
                    </FieldContent>
                  </Field>
                </FieldGroup>
              </div>
            ) : null}
          </div>
        </section>

        <div className="rounded-3xl border border-border/70 bg-background/50 p-4">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            {t('settingsStorageTitle')}
          </p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{t('settingsStorage')}</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{t('settingsDisclaimer')}</p>
        </div>
      </WorkspacePanel>
    </WorkspacePage>
  );
}
