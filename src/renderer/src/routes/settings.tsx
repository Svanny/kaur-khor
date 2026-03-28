import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BriefcaseBusiness,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  Copy,
  FileSpreadsheet,
  FolderOpen,
  Package,
} from 'lucide-react';
import type { DesktopLocalDataInfo } from '@shared/ipc';
import type { AppCurrency, AppLanguage } from '@shared/inventory';
import { HoverTooltip } from '@/components/system/hover-tooltip';
import { DescriptionText } from '@/components/system/description-text';
import { WorkspacePage, WorkspacePanel } from '@/components/system/workspace';
import { Badge } from '@/components/ui/badge';
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
  const [localDataInfo, setLocalDataInfo] = useState<DesktopLocalDataInfo | null>(null);
  const [localDataError, setLocalDataError] = useState<string | null>(null);
  const [localDataStatus, setLocalDataStatus] = useState<string | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportMenuPosition, setExportMenuPosition] = useState<{
    left: number;
    top: number;
    width: number;
  } | null>(null);
  const fieldRefs = useRef<Record<keyof SettingsForm, HTMLInputElement | null>>({
    targetServiceLevel: null,
    forecastHorizonDays: null,
    particleCount: null,
    smoothingWindowReports: null,
  });
  const exportMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);

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
  const advancedHasErrors = useMemo(
    () => Object.values(advancedErrors).some((value) => Boolean(value)),
    [advancedErrors],
  );

  useEffect(() => {
    if (advancedSaved && !advancedDirty && !advancedHasErrors && !advancedError) {
      setAdvancedOpen(false);
    }
  }, [advancedDirty, advancedError, advancedHasErrors, advancedSaved]);

  useEffect(() => {
    let cancelled = false;

    void window.banjiDesktop.system
      .getLocalDataInfo()
      .then((info) => {
        if (cancelled) {
          return;
        }
        setLocalDataInfo(info);
        setLocalDataError(null);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setLocalDataError(error instanceof Error ? error.message : t('apiUnavailable'));
      });

    return () => {
      cancelled = true;
    };
  }, [t]);

  useEffect(() => {
    if (!exportMenuOpen) {
      return;
    }

    const MENU_WIDTH = 320;
    const VIEWPORT_MARGIN = 12;
    const MENU_GAP = 8;

    function positionExportMenu() {
      const button = exportMenuButtonRef.current;
      if (!button) {
        return;
      }

      const buttonRect = button.getBoundingClientRect();
      const measuredHeight = exportMenuRef.current?.offsetHeight ?? 168;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const fitsBelow =
        buttonRect.bottom + MENU_GAP + measuredHeight <= viewportHeight - VIEWPORT_MARGIN;
      const fitsAbove =
        buttonRect.top - MENU_GAP - measuredHeight >= VIEWPORT_MARGIN;

      const width = Math.min(
        MENU_WIDTH,
        Math.max(240, viewportWidth - VIEWPORT_MARGIN * 2),
      );
      const left = Math.min(
        Math.max(VIEWPORT_MARGIN, buttonRect.right - width),
        viewportWidth - width - VIEWPORT_MARGIN,
      );
      const top = fitsBelow || !fitsAbove
        ? Math.min(
            buttonRect.bottom + MENU_GAP,
            viewportHeight - measuredHeight - VIEWPORT_MARGIN,
          )
        : Math.max(VIEWPORT_MARGIN, buttonRect.top - measuredHeight - MENU_GAP);

      setExportMenuPosition({ left, top, width });
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (
        target &&
        (exportMenuRef.current?.contains(target) ||
          exportMenuButtonRef.current?.contains(target))
      ) {
        return;
      }
      setExportMenuOpen(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setExportMenuOpen(false);
      }
    }

    positionExportMenu();
    window.addEventListener('resize', positionExportMenu);
    window.addEventListener('scroll', positionExportMenu, true);
    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('resize', positionExportMenu);
      window.removeEventListener('scroll', positionExportMenu, true);
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [exportMenuOpen]);

  const advancedHeaderBadge = useMemo(() => {
    if (advancedError || advancedHasErrors) {
      return { label: t('settingsAdvancedNeedsAttention'), variant: 'secondary' as const };
    }
    if (advancedDirty) {
      return { label: t('settingsAdvancedUnsaved'), variant: 'outline' as const };
    }
    return null;
  }, [advancedDirty, advancedError, advancedHasErrors, t]);

  const hasPendingSettingsChanges = hasPendingChanges || advancedDirty;
  const pageStatus = useMemo(() => {
    if (advancedError) {
      return { tone: 'destructive' as const, message: advancedError };
    }
    if (preferencesError) {
      return { tone: 'destructive' as const, message: preferencesError };
    }
    if (preferencesSaved || advancedSaved) {
      return { tone: 'muted' as const, message: t('settingsSaveSuccess') };
    }
    return null;
  }, [
    advancedError,
    advancedSaved,
    preferencesError,
    preferencesSaved,
    t,
  ]);
  const dirtySummary = useMemo(() => {
    if (hasPendingChanges && advancedDirty) {
      return t('settingsDirtySummaryBoth');
    }
    if (hasPendingChanges) {
      return t('settingsDirtySummaryPreferences');
    }
    if (advancedDirty) {
      return t('settingsDirtySummaryAdvanced');
    }
    return null;
  }, [advancedDirty, hasPendingChanges, t]);

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

    if (!advancedError && !advancedHasErrors && !advancedDirty) {
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

  async function handleOpenLocalDataFolder() {
    setLocalDataError(null);
    setLocalDataStatus(null);
    try {
      await window.banjiDesktop.system.openLocalDataFolder();
    } catch (error) {
      setLocalDataError(error instanceof Error ? error.message : t('apiUnavailable'));
    }
  }

  async function handleCopyDataPath() {
    if (!localDataInfo) {
      return;
    }

    setLocalDataError(null);
    setLocalDataStatus(null);
    try {
      await navigator.clipboard.writeText(localDataInfo.dataDirectoryPath);
      setLocalDataStatus(t('settingsLocalDataCopied'));
    } catch (error) {
      setLocalDataError(error instanceof Error ? error.message : t('apiUnavailable'));
    }
  }

  async function handleExportCsv(
    exportAction: () => Promise<{ path: string } | null>,
    label: string,
  ) {
    setLocalDataError(null);
    setLocalDataStatus(null);
    try {
      const result = await exportAction();
      if (!result) {
        return;
      }
      setExportMenuOpen(false);
      setLocalDataStatus(`${t('settingsLocalDataExportSuccessPrefix')} ${label}: ${result.path}`);
    } catch (error) {
      setLocalDataError(error instanceof Error ? error.message : t('apiUnavailable'));
    }
  }

  return (
    <WorkspacePage>
      <WorkspacePanel>
        {pageStatus ? (
          <p
            className={cn(
              'text-sm',
              pageStatus.tone === 'destructive' ? 'text-destructive' : 'text-muted-foreground',
            )}
            data-testid="settings-save-status"
          >
            {pageStatus.message}
          </p>
        ) : null}

        <section className="space-y-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-heading text-base font-medium tracking-[-0.02em]">
                  {t('settingsWorkspacePreferencesTitle')}
                </h3>
                {dirtySummary ? (
                  <span
                    className="text-sm text-muted-foreground"
                    data-testid="settings-dirty-summary"
                  >
                    (changed)
                  </span>
                ) : null}
              </div>
              <DescriptionText className="max-w-2xl text-sm leading-6 text-muted-foreground">
                {t('settingsWorkspacePreferencesDescription')}
              </DescriptionText>
            </div>
            <div className="flex flex-wrap items-center gap-3 lg:shrink-0">
              <Button
                disabled={!hasPendingSettingsChanges || isSaving}
                type="button"
                variant="outline"
                onClick={handleReset}
              >
                {t('settingsResetAction')}
              </Button>
              <Button
                disabled={!hasPendingSettingsChanges || isSaving}
                type="button"
                onClick={() => void handleSave()}
              >
                {t('saveDraft')}
              </Button>
            </div>
          </div>
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
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-heading text-base font-medium tracking-[-0.02em]">{t('settingsAdvancedTitle')}</h3>
                  {advancedHeaderBadge ? (
                    <Badge data-testid="settings-advanced-status-badge" variant={advancedHeaderBadge.variant}>
                      {advancedHeaderBadge.label}
                    </Badge>
                  ) : null}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setAdvancedOpen((current) => !current);
                  setExportMenuOpen(false);
                }}
              >
                {advancedOpen ? t('settingsAdvancedHide') : t('settingsAdvancedShow')}
                {advancedOpen ? <ChevronUp /> : <ChevronDown />}
              </Button>
            </div>

            {advancedOpen ? (
              <div className="mt-5 space-y-4 border-t border-border/50 pt-4">
                <div className="space-y-2">
                  <h4 className="font-heading text-sm font-medium tracking-[-0.02em]">
                    {t('preferencesSistTitle')}
                  </h4>
                  <DescriptionText
                    className="max-w-2xl text-sm leading-6 text-muted-foreground"
                    data-testid="settings-advanced-summary"
                  >
                    {t('preferencesSistDescription')}
                  </DescriptionText>
                </div>

                <FieldGroup className="gap-5">
                  <Field orientation="responsive">
                    <TooltipFieldLabel
                      htmlFor="target-service-level"
                      label={t('settingsTargetServiceLevel')}
                      tooltip={sistFieldTooltips.targetServiceLevel}
                    />
                    <FieldContent className="md:max-w-md">
                      <Input
                        className="w-full rounded-2xl bg-background/50"
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
                        className="w-full rounded-2xl bg-background/50"
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
                        className="w-full rounded-2xl bg-background/50"
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
                        className="w-full rounded-2xl bg-background/50"
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

                <section className="space-y-4 border-t border-border/50 pt-5">
                  <div className="space-y-2">
                    <h4 className="font-heading text-sm font-medium tracking-[-0.02em]">
                      {t('settingsLocalDataTitle')}
                    </h4>
                    <DescriptionText className="max-w-2xl text-sm leading-6 text-muted-foreground">
                      {t('settingsLocalDataDescription')}
                    </DescriptionText>
                  </div>

                  {localDataStatus ? (
                    <p className="text-sm text-muted-foreground" data-testid="settings-local-data-status">
                      {localDataStatus}
                    </p>
                  ) : null}
                  {localDataError ? (
                    <p className="text-sm text-destructive" data-testid="settings-local-data-error">
                      {localDataError}
                    </p>
                  ) : null}

                  {localDataInfo ? (
                    <div className="space-y-3 text-sm">
                      <div className="space-y-1">
                        <p className="font-medium text-foreground">{t('settingsLocalDataFolderLabel')}</p>
                        <p className="break-all text-muted-foreground">{localDataInfo.dataDirectoryPath}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="font-medium text-foreground">{t('settingsLocalDataRawFiles')}</p>
                        <ul className="space-y-1 text-muted-foreground">
                          <li>{localDataInfo.inventoryStorePath}</li>
                          <li>{localDataInfo.preferencesPath}</li>
                        </ul>
                      </div>
                      <p className="text-muted-foreground">{t('settingsLocalDataRawFormatNote')}</p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t('overviewLoading')}</p>
                  )}

                  <div className="flex flex-wrap gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void handleOpenLocalDataFolder()}
                    >
                      <FolderOpen />
                      {t('settingsOpenDataFolder')}
                    </Button>
                    <Button
                      disabled={!localDataInfo}
                      type="button"
                      variant="outline"
                      onClick={() => void handleCopyDataPath()}
                    >
                      <Copy />
                      {t('settingsCopyDataPath')}
                    </Button>
                    <div className="relative">
                      <Button
                        aria-expanded={exportMenuOpen}
                        aria-haspopup="menu"
                        ref={exportMenuButtonRef}
                        type="button"
                        variant="outline"
                        onClick={() => setExportMenuOpen((current) => !current)}
                      >
                        <FileSpreadsheet />
                      {t('settingsExportData')}
                      <ChevronDown />
                    </Button>
                    </div>
                  </div>
                </section>
              </div>
            ) : null}
          </div>
        </section>

      </WorkspacePanel>
      {exportMenuOpen && exportMenuPosition
        ? createPortal(
            <div
              aria-label={t('settingsExportData')}
              className="fixed z-50 rounded-2xl border border-border/70 bg-background p-2 shadow-lg"
              ref={exportMenuRef}
              role="menu"
              style={{
                left: exportMenuPosition.left,
                top: exportMenuPosition.top,
                width: exportMenuPosition.width,
              }}
            >
              <button
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-accent/60"
                role="menuitem"
                type="button"
                onClick={() =>
                  void handleExportCsv(
                    () => window.banjiDesktop.system.exportSkusCsv(),
                    t('catalogResultSkuPlural'),
                  )
                }
              >
                <Package className="size-4" />
                <span>{t('settingsExportSkusCsv')}</span>
              </button>
              <button
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-accent/60"
                role="menuitem"
                type="button"
                onClick={() =>
                  void handleExportCsv(
                    () => window.banjiDesktop.system.exportServicesCsv(),
                    t('catalogResultServicePlural'),
                  )
                }
              >
                <BriefcaseBusiness className="size-4" />
                <span>{t('settingsExportServicesCsv')}</span>
              </button>
              <button
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-accent/60"
                role="menuitem"
                type="button"
                onClick={() =>
                  void handleExportCsv(
                    () => window.banjiDesktop.system.exportStockReportsCsv(),
                    t('operationsHistoryTitle'),
                  )
                }
              >
                <FileSpreadsheet className="size-4" />
                <span>{t('settingsExportStockReportsCsv')}</span>
              </button>
            </div>,
            document.body,
          )
        : null}
    </WorkspacePage>
  );
}
