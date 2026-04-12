import { useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import {
  ActionDatabaseDownloadIcon,
  ActionDatabaseUploadIcon,
  ActionExplosionIcon,
  ActionOpenFolderIcon,
  ActionSaveIcon,
  ActionUndoIcon,
} from '@icons/actions';
import { EntityBackupIcon, EntityComparisonIcon, EntityFavoriteIcon, EntitySignalIcon } from '@icons/entities';
import {
  NavigationAnalysisIcon,
  NavigationBoardViewIcon,
  NavigationListIcon,
  NavigationPerformanceIcon,
  NavigationRightPanelIcon,
  NavigationSplitViewIcon,
  NavigationTaskListIcon,
  NavigationWorkspacePanelsIcon,
} from '@icons/navigation';
import { StatusHelpBadgeIcon } from '@icons/status';
import {
  DEFAULT_SENA_ENGINE_PARAMETERS,
  DEFAULT_USD_TO_KHR_EXCHANGE_RATE,
  normalizeSenaEngineParameters,
  senaEngineParametersEqual,
  type DesktopClearCurrentDataResult,
  type DesktopLocalDataInfo,
  type SenaEngineParameters,
} from '@shared/ipc';
import { CheckboxRow } from '@/components/system/checkbox-row';
import { HelpTooltip } from '@/components/system/help-tooltip';
import { TypedConfirmDialog } from '@/components/system/typed-confirm-dialog';
import { WorkspaceActionRow, WorkspacePage, WorkspacePanel, WorkspaceTitleCard } from '@/components/system/workspace';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  createBackupSnapshotAction,
  exportLogsAction,
  exportPlanningDataAction,
  restoreBackupSnapshotAction,
  type SettingsExportFormat,
} from '@/lib/settings-workspace-actions';
import { resolveSettingsSection } from '@/lib/settings-navigation';
import type { TranslationKey } from '@/lib/translations';
import { useRouteLeaveConfirm } from '@/hooks/use-route-leave-confirm';
import { SectionLabel } from '@/routes/sku-detail/section-heading';
import { usePreferences } from '@/state/preferences';

const numberInputClassName =
  'h-11 w-full rounded-xl border border-border bg-background px-3 text-base shadow-none outline-none';
const parameterTileClassName = 'grid min-w-0 content-start gap-2 text-sm';
const parameterLabelClassName =
  'text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground';
const parameterHelperClassName = 'leading-6 text-muted-foreground';
const SHOW_SENA_ANALYSIS_PROFILE_PARAMETER = false;
const preferenceSelectTriggerClassName =
  'h-14 w-full rounded-xl border border-border bg-background px-3 text-base shadow-none data-[size=default]:h-14';
const exportSelectTriggerClassName =
  'h-11 w-11 rounded-l-none rounded-r-2xl border border-l-0 border-border/70 bg-background/80 px-0 text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground data-[size=default]:h-11 data-[state=open]:bg-accent data-[state=open]:text-accent-foreground [&_svg]:mx-auto [&_svg]:opacity-100';
const exportActionButtonClassName =
  'h-11 rounded-l-2xl rounded-r-none border-border/70 bg-background/80 text-foreground shadow-xs';
const CLEAR_CURRENT_DATA_CONFIRMATION_TOKEN = 'DELETE CURRENT DATA';

const EXPORT_FORMAT_OPTIONS: Array<{ value: SettingsExportFormat; label: string }> = [
  { value: 'excel', label: 'Excel' },
  { value: 'csv', label: 'CSV' },
  { value: 'json', label: 'JSON' },
];

const SENA_ENGINE_PARAMETER_FIELD_META = [
  {
    key: 'particleCount',
    labelKey: 'settingsParticleCount',
    helperKey: 'settingsParticleCountTooltip',
    tooltipKey: 'settingsParticleCountTooltip',
    min: 32,
    max: 2048,
    step: 1,
  },
  {
    key: 'targetServiceLevel',
    labelKey: 'settingsTargetServiceLevel',
    helperKey: 'settingsTargetServiceLevelTooltip',
    tooltipKey: 'settingsTargetServiceLevelTooltip',
    min: 0.5,
    max: 0.999,
    step: 0.001,
  },
  {
    key: 'recommendationQuantile',
    labelKey: 'settingsRecommendationQuantileLabel',
    helperKey: 'settingsRecommendationQuantileHelp',
    tooltipKey: 'settingsRecommendationQuantileTooltip',
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: 'intervalLowQuantile',
    labelKey: 'settingsRangeLowQuantileLabel',
    helperKey: 'settingsRangeLowQuantileHelp',
    tooltipKey: 'settingsRangeLowQuantileTooltip',
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: 'intervalHighQuantile',
    labelKey: 'settingsRangeHighQuantileLabel',
    helperKey: 'settingsRangeHighQuantileHelp',
    tooltipKey: 'settingsRangeHighQuantileTooltip',
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: 'needProbabilityGate',
    labelKey: 'settingsNeedProbabilityGateLabel',
    helperKey: 'settingsNeedProbabilityGateHelp',
    tooltipKey: 'settingsNeedProbabilityGateTooltip',
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: 'reviewDelayDays',
    labelKey: 'settingsReviewDelayDaysLabel',
    helperKey: 'settingsReviewDelayDaysHelp',
    tooltipKey: 'settingsReviewDelayDaysTooltip',
    min: 0,
    max: 365,
    step: 1,
  },
] as const;

type SenaEngineNumberField = (typeof SENA_ENGINE_PARAMETER_FIELD_META)[number]['key'];
type ExportFormat = SettingsExportFormat;
type SenaEngineNumberDrafts = Record<SenaEngineNumberField, string>;
type SenaEngineNumberErrors = Partial<Record<SenaEngineNumberField, string>>;
type TranslateFn = ReturnType<typeof usePreferences>['t'];

function buildSenaEngineParameterFields(t: TranslateFn) {
  return SENA_ENGINE_PARAMETER_FIELD_META.map((field) => ({
    ...field,
    label: t(field.labelKey as TranslationKey),
    helper: t(field.helperKey as TranslationKey),
    tooltip: t(field.tooltipKey as TranslationKey),
  }));
}

function exportFormatLabel(value: ExportFormat) {
  return EXPORT_FORMAT_OPTIONS.find((option) => option.value === value)?.label ?? 'CSV';
}

function ParameterLabel({
  inputId,
  label,
  tooltip,
}: {
  inputId: string;
  label: string;
  tooltip: string;
}) {
  return (
    <div className={parameterLabelClassName}>
      <span className="inline-flex items-center gap-2 align-middle">
        <label htmlFor={inputId}>{label}</label>
        <HelpTooltip content={tooltip} label="Parameter guidance" />
      </span>
    </div>
  );
}

function createSenaEngineNumberDrafts(parameters: SenaEngineParameters): SenaEngineNumberDrafts {
  return {
    particleCount: String(parameters.particleCount),
    targetServiceLevel: String(parameters.targetServiceLevel),
    recommendationQuantile: String(parameters.recommendationQuantile),
    intervalLowQuantile: String(parameters.intervalLowQuantile),
    intervalHighQuantile: String(parameters.intervalHighQuantile),
    needProbabilityGate: String(parameters.needProbabilityGate),
    reviewDelayDays: String(parameters.reviewDelayDays),
  };
}

function formatSenaParameterValue(value: number) {
  return Number.isInteger(value) ? String(value) : String(value);
}

function senaParameterRangeMessage(
  field: (typeof SENA_ENGINE_PARAMETER_FIELD_META)[number],
  t: TranslateFn,
) {
  return t('settingsParameterRangeMessage', {
    min: formatSenaParameterValue(field.min),
    max: formatSenaParameterValue(field.max),
  });
}

function validateSenaEngineNumberDraft(
  field: (typeof SENA_ENGINE_PARAMETER_FIELD_META)[number],
  rawValue: string,
  t: TranslateFn,
) {
  const trimmedValue = rawValue.trim();
  if (trimmedValue.length === 0) {
    return t('settingsParameterEnterValue', {
      range: senaParameterRangeMessage(field, t),
    });
  }

  const parsedValue = Number(trimmedValue);
  if (!Number.isFinite(parsedValue)) {
    return t('settingsParameterEnterNumber', {
      range: senaParameterRangeMessage(field, t),
    });
  }

  if (parsedValue < field.min || parsedValue > field.max) {
    return senaParameterRangeMessage(field, t);
  }

  return null;
}

function validateSenaEngineNumberDrafts(
  drafts: SenaEngineNumberDrafts,
  t: TranslateFn,
): SenaEngineNumberErrors {
  const errors = SENA_ENGINE_PARAMETER_FIELD_META.reduce<SenaEngineNumberErrors>((nextErrors, field) => {
    const message = validateSenaEngineNumberDraft(field, drafts[field.key], t);
    if (message) {
      nextErrors[field.key] = message;
    }
    return nextErrors;
  }, {});

  if (!errors.intervalLowQuantile && !errors.intervalHighQuantile) {
    const intervalLowQuantile = Number(drafts.intervalLowQuantile.trim());
    const intervalHighQuantile = Number(drafts.intervalHighQuantile.trim());
    if (intervalLowQuantile > intervalHighQuantile) {
      errors.intervalLowQuantile = t('settingsRangeLowAboveHigh');
      errors.intervalHighQuantile = t('settingsRangeHighBelowLow');
    }

    if (!errors.recommendationQuantile) {
      const recommendationQuantile = Number(drafts.recommendationQuantile.trim());
      if (
        Number.isFinite(recommendationQuantile) &&
        (recommendationQuantile < intervalLowQuantile || recommendationQuantile > intervalHighQuantile)
      ) {
        errors.recommendationQuantile = t('settingsRecommendationOutsideRange');
      }
    }
  }

  return errors;
}

function applySenaEngineNumberDrafts(
  parameters: SenaEngineParameters,
  drafts: SenaEngineNumberDrafts,
): SenaEngineParameters {
  return normalizeSenaEngineParameters(
    SENA_ENGINE_PARAMETER_FIELD_META.reduce<Partial<SenaEngineParameters>>(
      (nextParameters, parameter) => {
        const parsedValue = Number(drafts[parameter.key]);
        nextParameters[parameter.key] = Number.isFinite(parsedValue)
          ? parsedValue
          : parameters[parameter.key];
        return nextParameters;
      },
      { ...parameters },
    ),
  );
}

function ExportFormatSelect({
  ariaLabel,
  icon,
  label,
  onExport,
  value,
  onValueChange,
}: {
  ariaLabel: string;
  icon: ReactNode;
  label: string;
  onExport: () => void;
  value: ExportFormat;
  onValueChange: (value: ExportFormat) => void;
}) {
  return (
    <div className="inline-flex items-center">
      <Button
        className={exportActionButtonClassName}
        type="button"
        variant="outline"
        onClick={onExport}
      >
        <span className="inline-flex items-center gap-2">
          {icon}
          <span>{`${label}: ${exportFormatLabel(value)}`}</span>
        </span>
      </Button>
      <Select value={value} onValueChange={(nextValue) => onValueChange(nextValue as ExportFormat)}>
        <SelectTrigger aria-label={ariaLabel} className={exportSelectTriggerClassName} />
        <SelectContent align="start" position="popper">
          {EXPORT_FORMAT_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function LanguageOptionLabel({
  prefix,
  label,
}: {
  prefix: string;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-3">
      <span className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {prefix}
      </span>
      <span>{label}</span>
    </span>
  );
}

function LocalDataLocationLink({
  label,
  path,
}: {
  label: string;
  path: string;
}) {
  return (
    <div>
      <p className="text-sm font-medium text-foreground">{label}</p>
      <Button
        className="h-auto justify-start px-0 py-0 text-left text-sm font-normal text-muted-foreground whitespace-normal break-all hover:text-foreground"
        type="button"
        variant="link"
        onClick={() => void window.banjiDesktop.system.revealPath(path)}
      >
        <ActionOpenFolderIcon className="mt-0.5 size-4 shrink-0 self-start" />
        <span>{path}</span>
      </Button>
    </div>
  );
}

function WorkspacePreferencesPage({
  currency,
  exchangeRateDraft,
  exchangeRateError,
  language,
  setCurrency,
  setExchangeRateDraft,
  setLanguage,
  t,
}: {
  currency: 'USD' | 'KHR';
  exchangeRateDraft: string;
  exchangeRateError: string | null;
  language: 'en' | 'km';
  setCurrency: (value: 'USD' | 'KHR') => void;
  setExchangeRateDraft: (value: string) => void;
  setLanguage: (value: 'en' | 'km') => void;
  t: TranslateFn;
}) {
  return (
    <WorkspacePanel>
      <div className="grid gap-4">
        <label className="grid content-start gap-2 text-sm">
          <span>{t('settingsLanguage')}</span>
          <Select value={language} onValueChange={(value) => setLanguage(value as 'en' | 'km')}>
            <SelectTrigger aria-label={t('settingsLanguage')} className={preferenceSelectTriggerClassName}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start" position="popper">
              <SelectItem value="en">
                <LanguageOptionLabel prefix="abc" label="English" />
              </SelectItem>
              <SelectItem value="km">
                <LanguageOptionLabel prefix="កខគ" label="Khmer" />
              </SelectItem>
            </SelectContent>
          </Select>
        </label>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.8fr)]">
          <label className="grid content-start gap-2 text-sm">
            <span>{t('settingsCurrency')}</span>
            <Select value={currency} onValueChange={(value) => setCurrency(value as 'USD' | 'KHR')}>
              <SelectTrigger aria-label={t('settingsCurrency')} className={preferenceSelectTriggerClassName}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start" position="popper">
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="KHR">KHR</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="grid content-start gap-2 text-sm">
            <span>{t('settingsExchangeRateLabel')}</span>
            <div className="flex h-14 items-center overflow-hidden rounded-xl border border-border bg-background text-base shadow-none focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
              <span className="shrink-0 border-r border-border/70 px-3 text-muted-foreground">$1 =</span>
              <input
                aria-label={t('settingsExchangeRateInputLabel')}
                className="h-full min-w-0 flex-1 bg-transparent px-3 outline-none"
                min="1"
                step="1"
                type="number"
                value={exchangeRateDraft}
                onChange={(event) => setExchangeRateDraft(event.target.value)}
              />
              <span className="shrink-0 border-l border-border/70 px-3 text-muted-foreground">៛</span>
            </div>
            {exchangeRateError ? (
              <span className="text-xs leading-5 text-destructive">{exchangeRateError}</span>
            ) : (
              <span className="text-xs leading-5 text-muted-foreground">{t('settingsExchangeRateHelp')}</span>
            )}
          </label>
        </div>
      </div>
    </WorkspacePanel>
  );
}

function InterfaceVisibilityPage({
  interfaceVisibilityDisabled,
  setShowExplanatoryTooltips,
  setShowFloatingTitleActions,
  setShowHeartbeatRibbons,
  setShowOverviewTaskTabs,
  setShowAnalysisPage,
  setShowLogsViewToggle,
  setShowPerformanceCompareToggle,
  setShowPerformanceTimelineCard,
  setShowRightRailCards,
  showExplanatoryTooltips,
  showFloatingTitleActions,
  showHeartbeatRibbons,
  showOverviewTaskTabs,
  showAnalysisPage,
  showLogsViewToggle,
  showPerformanceCompareToggle,
  showPerformanceTimelineCard,
  showRightRailCards,
  t,
}: {
  interfaceVisibilityDisabled: boolean;
  setShowExplanatoryTooltips: (checked: boolean) => void;
  setShowFloatingTitleActions: (checked: boolean) => void;
  setShowHeartbeatRibbons: (checked: boolean) => void;
  setShowOverviewTaskTabs: (checked: boolean) => void;
  setShowAnalysisPage: (checked: boolean) => void;
  setShowLogsViewToggle: (checked: boolean) => void;
  setShowPerformanceCompareToggle: (checked: boolean) => void;
  setShowPerformanceTimelineCard: (checked: boolean) => void;
  setShowRightRailCards: (checked: boolean) => void;
  showExplanatoryTooltips: boolean;
  showFloatingTitleActions: boolean;
  showHeartbeatRibbons: boolean;
  showOverviewTaskTabs: boolean;
  showAnalysisPage: boolean;
  showLogsViewToggle: boolean;
  showPerformanceCompareToggle: boolean;
  showPerformanceTimelineCard: boolean;
  showRightRailCards: boolean;
  t: TranslateFn;
}) {
  return (
    <WorkspacePanel>
      <div className="divide-y divide-border/60">
        <CheckboxRow
          checked={showExplanatoryTooltips}
          className="pt-2"
          disabled={interfaceVisibilityDisabled}
          helper={t('settingsShowOptionalHelpHelp')}
          hint={interfaceVisibilityDisabled ? t('settingsViewModeCompactLocksHelp') : undefined}
          icon={<StatusHelpBadgeIcon className="size-4" />}
          label={t('settingsShowOptionalHelpLabel')}
          variant="flat"
          onCheckedChange={setShowExplanatoryTooltips}
        />
        <CheckboxRow
          checked={showFloatingTitleActions}
          disabled={interfaceVisibilityDisabled}
          helper={t('settingsShowFloatingActionsHelp')}
          hint={interfaceVisibilityDisabled ? t('settingsViewModeCompactLocksHelp') : undefined}
          icon={<NavigationWorkspacePanelsIcon className="size-4" />}
          label={t('settingsShowFloatingActionsLabel')}
          variant="flat"
          onCheckedChange={setShowFloatingTitleActions}
        />
        <CheckboxRow
          checked={showRightRailCards}
          disabled={interfaceVisibilityDisabled}
          helper={t('settingsShowRightRailCardsHelp')}
          hint={interfaceVisibilityDisabled ? t('settingsViewModeCompactLocksHelp') : undefined}
          icon={<NavigationRightPanelIcon className="size-4" />}
          label="Show right rail cards"
          variant="flat"
          onCheckedChange={setShowRightRailCards}
        />
        <CheckboxRow
          checked={showOverviewTaskTabs}
          disabled={interfaceVisibilityDisabled}
          helper={t('settingsShowOverviewTaskTabsHelp')}
          hint={interfaceVisibilityDisabled ? t('settingsViewModeCompactLocksHelp') : undefined}
          icon={<NavigationTaskListIcon className="size-4" />}
          label={t('settingsShowOverviewTaskTabsLabel')}
          variant="flat"
          onCheckedChange={setShowOverviewTaskTabs}
        />
        <CheckboxRow
          checked={showAnalysisPage}
          disabled={interfaceVisibilityDisabled}
          helper={t('settingsShowAnalysisPageHelp')}
          hint={interfaceVisibilityDisabled ? t('settingsViewModeCompactLocksHelp') : undefined}
          icon={<NavigationAnalysisIcon className="size-4" />}
          label={t('settingsShowAnalysisPageLabel')}
          variant="flat"
          onCheckedChange={setShowAnalysisPage}
        />
        <CheckboxRow
          checked={showPerformanceCompareToggle}
          disabled={interfaceVisibilityDisabled}
          helper={t('settingsShowPerformanceCompareToggleHelp')}
          hint={interfaceVisibilityDisabled ? t('settingsViewModeCompactLocksHelp') : undefined}
          icon={<EntityComparisonIcon className="size-4" />}
          label={t('settingsShowPerformanceCompareToggleLabel')}
          variant="flat"
          onCheckedChange={setShowPerformanceCompareToggle}
        />
        <CheckboxRow
          checked={showPerformanceTimelineCard}
          disabled={interfaceVisibilityDisabled}
          helper={t('settingsShowPerformanceTimelineCardHelp')}
          hint={interfaceVisibilityDisabled ? t('settingsViewModeCompactLocksHelp') : undefined}
          icon={<NavigationPerformanceIcon className="size-4" />}
          label={t('settingsShowPerformanceTimelineCardLabel')}
          variant="flat"
          onCheckedChange={setShowPerformanceTimelineCard}
        />
        <CheckboxRow
          checked={showLogsViewToggle}
          disabled={interfaceVisibilityDisabled}
          helper={t('settingsShowLogsViewToggleHelp')}
          hint={interfaceVisibilityDisabled ? t('settingsViewModeCompactLocksHelp') : undefined}
          icon={<NavigationListIcon className="size-4" />}
          label={t('settingsShowLogsViewToggleLabel')}
          variant="flat"
          onCheckedChange={setShowLogsViewToggle}
        />
        <CheckboxRow
          checked={showHeartbeatRibbons}
          disabled={interfaceVisibilityDisabled}
          helper={t('settingsShowHeartbeatRibbonsHelp')}
          hint={interfaceVisibilityDisabled ? t('settingsViewModeCompactLocksHelp') : undefined}
          icon={<EntitySignalIcon className="size-4" />}
          label={t('settingsShowHeartbeatRibbonsLabel')}
          variant="flat"
          onCheckedChange={setShowHeartbeatRibbons}
        />
      </div>
    </WorkspacePanel>
  );
}

function DisplayViewModeToggle({
  displayViewMode,
  setDisplayViewMode,
  t,
}: {
  displayViewMode: 'compact' | 'custom';
  setDisplayViewMode: (mode: 'compact' | 'custom') => void;
  t: TranslateFn;
}) {
  return (
    <ToggleGroup
      className="max-w-full justify-start overflow-x-auto rounded-full"
      orientation="horizontal"
      spacing={1}
      type="single"
      value={displayViewMode}
      onValueChange={(nextValue) => {
        if (nextValue === 'compact' || nextValue === 'custom') {
          setDisplayViewMode(nextValue);
        }
      }}
    >
      <ToggleGroupItem value="compact">
        <NavigationSplitViewIcon data-icon="inline-start" />
        {t('shellViewModeMinimal')}
      </ToggleGroupItem>
      <ToggleGroupItem value="custom">
        <NavigationBoardViewIcon data-icon="inline-start" />
        {t('shellViewModeMaximal')}
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

function PlanningSettingsPage({
  hasSenaParameterErrors,
  senaEngineNumberDrafts,
  senaEngineNumberErrors,
  senaEngineParameterFields,
  senaParametersChanged,
  senaRunStatus,
  senaEngineParameters,
  setSenaEngineNumberDrafts,
  setSenaEngineNumberErrors,
  setSenaEngineParameters,
  t,
}: {
  hasSenaParameterErrors: boolean;
  senaEngineNumberDrafts: SenaEngineNumberDrafts;
  senaEngineNumberErrors: SenaEngineNumberErrors;
  senaEngineParameterFields: ReturnType<typeof buildSenaEngineParameterFields>;
  senaParametersChanged: boolean;
  senaRunStatus: string | null;
  senaEngineParameters: SenaEngineParameters;
  setSenaEngineNumberDrafts: Dispatch<SetStateAction<SenaEngineNumberDrafts>>;
  setSenaEngineNumberErrors: Dispatch<SetStateAction<SenaEngineNumberErrors>>;
  setSenaEngineParameters: (value: SenaEngineParameters) => void;
  t: TranslateFn;
}) {
  return (
    <WorkspacePanel>
      <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2 xl:grid-cols-4">
        {SHOW_SENA_ANALYSIS_PROFILE_PARAMETER ? (
          <div className={parameterTileClassName}>
            <ParameterLabel
              inputId="sena-parameter-algorithm-version"
              label={t('settingsAnalysisProfileLabel')}
              tooltip={t('settingsAnalysisProfileTooltip')}
            />
            <input
              className={numberInputClassName}
              id="sena-parameter-algorithm-version"
              value={senaEngineParameters.algorithmVersion}
              onChange={(event) =>
                setSenaEngineParameters(
                  normalizeSenaEngineParameters({
                    ...senaEngineParameters,
                    algorithmVersion: event.target.value,
                  }),
                )
              }
            />
            <span className={parameterHelperClassName}>{t('settingsAnalysisProfileHelp')}</span>
          </div>
        ) : null}
        {senaEngineParameterFields.map((parameter) => (
          <div key={parameter.key} className={parameterTileClassName}>
            <ParameterLabel
              inputId={`sena-parameter-${parameter.key}`}
              label={parameter.label}
              tooltip={parameter.tooltip}
            />
            <input
              aria-describedby={`sena-parameter-${parameter.key}-hint${senaEngineNumberErrors[parameter.key] ? ` sena-parameter-${parameter.key}-error` : ''}`}
              aria-invalid={senaEngineNumberErrors[parameter.key] ? 'true' : undefined}
              className={`${numberInputClassName}${senaEngineNumberErrors[parameter.key] ? ' border-destructive ring-1 ring-destructive/30' : ''}`}
              id={`sena-parameter-${parameter.key}`}
              inputMode={parameter.step < 1 ? 'decimal' : 'numeric'}
              pattern={parameter.step < 1 ? '[0-9]*[.]?[0-9]*' : '[0-9]*'}
              type="text"
              value={senaEngineNumberDrafts[parameter.key]}
              onBlur={() => {
                const nextErrors = validateSenaEngineNumberDrafts(senaEngineNumberDrafts, t);
                setSenaEngineNumberErrors(nextErrors);
                if (Object.keys(nextErrors).length > 0) {
                  return;
                }
                setSenaEngineParameters(applySenaEngineNumberDrafts(senaEngineParameters, senaEngineNumberDrafts));
              }}
              onChange={(event) => {
                const nextValue = event.target.value;
                setSenaEngineNumberDrafts((current) => {
                  const nextDrafts = {
                    ...current,
                    [parameter.key]: nextValue,
                  };
                  setSenaEngineNumberErrors(validateSenaEngineNumberDrafts(nextDrafts, t));
                  return nextDrafts;
                });
              }}
            />
            <span className={parameterHelperClassName} id={`sena-parameter-${parameter.key}-hint`}>
              {parameter.helper}
            </span>
            {senaEngineNumberErrors[parameter.key] ? (
              <span
                className="text-sm text-destructive"
                id={`sena-parameter-${parameter.key}-error`}
                role="alert"
              >
                {senaEngineNumberErrors[parameter.key]}
              </span>
            ) : null}
          </div>
        ))}
        <CheckboxRow
          checked={senaEngineParameters.smoothingEnabled}
          helper={t('settingsEnableSmoothingHelp')}
          label={
            <SectionLabel tooltip={t('settingsEnableSmoothingTooltip')}>
              {t('settingsEnableSmoothingLabel')}
            </SectionLabel>
          }
          variant="flat"
          onCheckedChange={(checked) =>
            setSenaEngineParameters(
              normalizeSenaEngineParameters({
                ...senaEngineParameters,
                smoothingEnabled: checked,
              }),
            )
          }
        />
      </div>
      {senaRunStatus ? (
        <p className="text-sm text-muted-foreground">{senaRunStatus}</p>
      ) : hasSenaParameterErrors ? (
        <p className="text-sm text-destructive">{t('settingsSenaParametersFixErrors')}</p>
      ) : senaParametersChanged ? (
        <p className="text-sm text-muted-foreground">{t('settingsSenaParametersRerunHint')}</p>
      ) : null}
    </WorkspacePanel>
  );
}

function LocalWorkspaceDataPage({
  backupInFlight,
  backupStatus,
  exportStatus,
  handleCreateBackupSnapshot,
  handleExportLogs,
  handleExportSenaData,
  handleRestoreSnapshot,
  localDataError,
  localDataInfo,
  logExportFormat,
  restoreInFlight,
  senaExportFormat,
  setLogExportFormat,
  setSenaExportFormat,
  t,
}: {
  backupInFlight: boolean;
  backupStatus: string | null;
  exportStatus: string | null;
  handleCreateBackupSnapshot: () => Promise<void>;
  handleExportLogs: (format: ExportFormat) => Promise<void>;
  handleExportSenaData: (format: ExportFormat) => Promise<void>;
  handleRestoreSnapshot: () => Promise<void>;
  localDataError: string | null;
  localDataInfo: DesktopLocalDataInfo | null;
  logExportFormat: ExportFormat;
  restoreInFlight: boolean;
  senaExportFormat: ExportFormat;
  setLogExportFormat: (value: ExportFormat) => void;
  setSenaExportFormat: (value: ExportFormat) => void;
  t: TranslateFn;
}) {
  return (
    <WorkspacePanel>
      {localDataInfo ? (
        <div className="grid gap-4">
          <LocalDataLocationLink
            label={t('settingsDataDirectoryLabel')}
            path={localDataInfo.dataDirectoryPath}
          />
          <LocalDataLocationLink
            label={t('settingsWorkspaceStoreLabel')}
            path={localDataInfo.workspaceStorePath}
          />
          <LocalDataLocationLink
            label={t('settingsPreferencesFileLabel')}
            path={localDataInfo.preferencesPath}
          />
          <LocalDataLocationLink
            label={t('settingsBackupDirectoryLabel')}
            path={localDataInfo.backupDirectoryPath}
          />
          <WorkspaceActionRow>
            <Button
              disabled={backupInFlight}
              type="button"
              variant="outline"
              onClick={() => void handleCreateBackupSnapshot()}
            >
              <EntityBackupIcon data-icon="inline-start" />
              {backupInFlight ? t('settingsBackupSnapshotCreating') : t('settingsBackupSnapshotAction')}
            </Button>
            <Button
              disabled={restoreInFlight}
              type="button"
              variant="outline"
              onClick={() => void handleRestoreSnapshot()}
            >
              <ActionDatabaseUploadIcon data-icon="inline-start" />
              {restoreInFlight ? t('settingsRestoreSnapshotRestoring') : t('settingsRestoreSnapshotAction')}
            </Button>
            <ExportFormatSelect
              ariaLabel="Export logs format"
              icon={<ActionDatabaseDownloadIcon className="size-4" />}
              label={t('settingsExportLogsAction')}
              onExport={() => void handleExportLogs(logExportFormat)}
              value={logExportFormat}
              onValueChange={setLogExportFormat}
            />
            <ExportFormatSelect
              ariaLabel={t('settingsSenaDataExportFormatLabel')}
              icon={<ActionDatabaseDownloadIcon className="size-4" />}
              label={t('settingsExportSenaDataAction')}
              onExport={() => void handleExportSenaData(senaExportFormat)}
              value={senaExportFormat}
              onValueChange={setSenaExportFormat}
            />
          </WorkspaceActionRow>
          {backupStatus ? <p className="text-sm text-muted-foreground">{backupStatus}</p> : null}
          {exportStatus ? <p className="text-sm text-muted-foreground">{exportStatus}</p> : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {localDataError ?? t('settingsLoadLocalWorkspaceInfo')}
        </p>
      )}
    </WorkspacePanel>
  );
}

function CreditsPage({ t }: { t: TranslateFn }) {
  return (
    <WorkspacePanel>
      <p className="flex items-center gap-2 text-sm font-normal text-muted-foreground">
        <span>{t('settingsMadeWith')}</span>
        <EntityFavoriteIcon aria-hidden="true" className="size-4 fill-current text-rose-500" />
        <span>{t('settingsMadeBy')}</span>
      </p>
    </WorkspacePanel>
  );
}

function DangerZonePage({
  setClearConfirmOpen,
  t,
}: {
  setClearConfirmOpen: Dispatch<SetStateAction<boolean>>;
  t: TranslateFn;
}) {
  return (
    <WorkspacePanel className="border-destructive/30 !bg-gradient-to-br !from-rose-100 !via-red-50 !to-rose-100/70">
      <WorkspaceActionRow>
        <Button
          type="button"
          variant="destructive"
          onClick={() => setClearConfirmOpen(true)}
        >
          <ActionExplosionIcon data-icon="inline-start" />
          {t('settingsClearCurrentDataAction')}
        </Button>
      </WorkspaceActionRow>
    </WorkspacePanel>
  );
}

export function SettingsRoute() {
  const location = useLocation();
  const navigate = useNavigate();
  const currentSection = resolveSettingsSection(location.pathname);
  const {
    currency,
    hasPendingChanges,
    language,
    usdToKhrExchangeRate,
    applySenaEngineParameters,
    persistedSenaEngineParameters,
    resetPreferences,
    savePreferences,
    senaEngineParameters,
    setCurrency,
    setLanguage,
    setUsdToKhrExchangeRate,
    setSenaEngineParameters,
    setShowExplanatoryTooltips,
    setShowFloatingTitleActions,
    setShowHeartbeatRibbons,
    setShowRightRailCards,
    setShowOverviewTaskTabs,
    setShowAnalysisPage,
    setShowLogsViewToggle,
    setShowPerformanceCompareToggle,
    setShowPerformanceTimelineCard,
    setDisplayViewMode,
    displayViewMode,
    showFloatingTitleActions,
    showHeartbeatRibbons,
    showRightRailCards,
    showOverviewTaskTabs,
    showAnalysisPage,
    showLogsViewToggle,
    showPerformanceCompareToggle,
    showPerformanceTimelineCard,
    showExplanatoryTooltips,
    t,
  } = usePreferences();
  const [localDataInfo, setLocalDataInfo] = useState<DesktopLocalDataInfo | null>(null);
  const [localDataError, setLocalDataError] = useState<string | null>(null);
  const [senaRunStatus, setSenaRunStatus] = useState<string | null>(null);
  const [logExportFormat, setLogExportFormat] = useState<ExportFormat>('excel');
  const [senaExportFormat, setSenaExportFormat] = useState<ExportFormat>('excel');
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const [backupInFlight, setBackupInFlight] = useState(false);
  const [restoreInFlight, setRestoreInFlight] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [clearConfirmValue, setClearConfirmValue] = useState('');
  const [clearInFlight, setClearInFlight] = useState(false);
  const [exchangeRateDraft, setExchangeRateDraft] = useState(() => String(usdToKhrExchangeRate));
  const [senaEngineNumberDrafts, setSenaEngineNumberDrafts] = useState<SenaEngineNumberDrafts>(() =>
    createSenaEngineNumberDrafts(senaEngineParameters),
  );
  const [senaEngineNumberErrors, setSenaEngineNumberErrors] = useState<SenaEngineNumberErrors>({});
  const hasSenaParameterErrors = Object.keys(senaEngineNumberErrors).length > 0;
  const pendingSenaEngineParameters = hasSenaParameterErrors
    ? senaEngineParameters
    : applySenaEngineNumberDrafts(senaEngineParameters, senaEngineNumberDrafts);
  const senaParametersChanged = !senaEngineParametersEqual(
    pendingSenaEngineParameters,
    persistedSenaEngineParameters,
  );
  const exchangeRateValue = Number(exchangeRateDraft);
  const exchangeRateError =
    exchangeRateDraft.trim().length === 0
      ? t('settingsExchangeRateRequired')
      : !Number.isFinite(exchangeRateValue) || exchangeRateValue <= 0
        ? t('settingsExchangeRatePositive')
        : null;
  const exchangeRateChanged = exchangeRateDraft !== String(usdToKhrExchangeRate);
  const hasUnsavedSettingsChanges = hasPendingChanges || senaParametersChanged || exchangeRateChanged;
  const senaEngineParameterFields = buildSenaEngineParameterFields(t);
  const interfaceVisibilityDisabled = displayViewMode === 'compact';
  const isInterfaceSection = currentSection.id === 'interface';
  const showSaveAction =
    currentSection.id === 'workspace' ||
    currentSection.id === 'interface' ||
    currentSection.id === 'planning' ||
    hasUnsavedSettingsChanges;
  const showResetSenaDefaultsAction = currentSection.id === 'planning';
  const resetSenaDefaultsDisabled =
    !senaParametersChanged &&
    senaEngineParametersEqual(senaEngineParameters, DEFAULT_SENA_ENGINE_PARAMETERS);
  const saveButtonDisabled =
    Boolean(exchangeRateError) ||
    hasSenaParameterErrors ||
    (!hasPendingChanges && !senaParametersChanged && !exchangeRateChanged);

  function handleDiscardSettingsChanges() {
    resetPreferences();
    setExchangeRateDraft(String(usdToKhrExchangeRate));
    setSenaEngineNumberDrafts(createSenaEngineNumberDrafts(persistedSenaEngineParameters));
    setSenaEngineNumberErrors({});
    setSenaRunStatus(null);
  }

  const { discardConfirmDialog } = useRouteLeaveConfirm({
    enabled: hasUnsavedSettingsChanges,
    description: t('settingsUnsavedLeavePrompt'),
    onDiscard: handleDiscardSettingsChanges,
  });

  useEffect(() => {
    setSenaEngineNumberDrafts(createSenaEngineNumberDrafts(senaEngineParameters));
    setSenaEngineNumberErrors({});
  }, [senaEngineParameters]);

  useEffect(() => {
    setExchangeRateDraft(String(usdToKhrExchangeRate));
  }, [usdToKhrExchangeRate]);

  useEffect(() => {
    let cancelled = false;

    window.banjiDesktop.system
      .getLocalDataInfo()
      .then((info) => {
        if (!cancelled) {
          setLocalDataInfo(info);
          setLocalDataError(null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setLocalDataError(error instanceof Error ? error.message : t('settingsLocalWorkspaceInfoFailed'));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [t]);

  async function rerunSenaWithParameters(parameters: SenaEngineParameters) {
    await window.banjiDesktop.sena.triggerRun({
      algorithmVersion: parameters.algorithmVersion,
      parameters,
    });
  }

  async function handleSavePreferences() {
    const nextErrors = validateSenaEngineNumberDrafts(senaEngineNumberDrafts, t);
    if (Object.keys(nextErrors).length > 0) {
      setSenaEngineNumberErrors(nextErrors);
      setSenaRunStatus(t('settingsSenaParametersFixErrors'));
      return;
    }
    if (exchangeRateError) {
      setSenaRunStatus(t('settingsPreferencesFixErrors'));
      return;
    }
    const nextSenaEngineParameters = pendingSenaEngineParameters;
    const nextUsdToKhrExchangeRate = exchangeRateValue || DEFAULT_USD_TO_KHR_EXCHANGE_RATE;
    const shouldRerunSena = senaParametersChanged;
    setSenaRunStatus(null);
    setSenaEngineParameters(nextSenaEngineParameters);
    setUsdToKhrExchangeRate(nextUsdToKhrExchangeRate);
    await savePreferences({
      senaEngineParameters: nextSenaEngineParameters,
      usdToKhrExchangeRate: nextUsdToKhrExchangeRate,
    });
    if (shouldRerunSena) {
      try {
        await rerunSenaWithParameters(nextSenaEngineParameters);
        setSenaRunStatus(t('settingsSenaRerunSaved'));
      } catch (error) {
        setSenaRunStatus(error instanceof Error ? error.message : t('settingsSenaRerunFailed'));
      }
    }
  }

  async function handleResetSenaDefaults() {
    const defaultParameters = normalizeSenaEngineParameters(DEFAULT_SENA_ENGINE_PARAMETERS);
    setSenaRunStatus(null);
    setSenaEngineParameters(defaultParameters);
    await applySenaEngineParameters(defaultParameters);
    try {
      await rerunSenaWithParameters(defaultParameters);
      setSenaRunStatus(t('settingsSenaRerunDefaults'));
    } catch (error) {
      setSenaRunStatus(error instanceof Error ? error.message : t('settingsSenaRerunFailed'));
    }
  }

  async function handleExportLogs(format: ExportFormat) {
    setExportStatus(await exportLogsAction(format, t));
  }

  async function handleExportSenaData(format: ExportFormat) {
    setExportStatus(await exportPlanningDataAction(format, t));
  }

  async function handleCreateBackupSnapshot() {
    try {
      setBackupInFlight(true);
      setBackupStatus(await createBackupSnapshotAction(t));
    } catch (error) {
      setBackupStatus(error instanceof Error ? error.message : t('settingsBackupSnapshotFailed'));
    } finally {
      setBackupInFlight(false);
    }
  }

  async function handleRestoreSnapshot() {
    try {
      setRestoreInFlight(true);
      setBackupStatus(await restoreBackupSnapshotAction(t));
    } catch (error) {
      setBackupStatus(error instanceof Error ? error.message : t('settingsRestoreSnapshotFailed'));
    } finally {
      setRestoreInFlight(false);
    }
  }

  function formatClearCurrentDataStatus(result: DesktopClearCurrentDataResult) {
    return t('settingsClearCurrentDataCompleted', {
      path: result.safetySnapshot.snapshotPath,
    });
  }

  async function handleConfirmClearCurrentData() {
    try {
      setClearInFlight(true);
      const result = await window.banjiDesktop.system.clearCurrentData();
      setBackupStatus(formatClearCurrentDataStatus(result));
      setClearConfirmOpen(false);
      setClearConfirmValue('');
      navigate('/', { replace: true });
      window.location.reload();
    } catch (error) {
      setBackupStatus(error instanceof Error ? error.message : t('settingsClearCurrentDataFailed'));
    } finally {
      setClearInFlight(false);
    }
  }

  return (
    <WorkspacePage>
      {discardConfirmDialog}
      <TypedConfirmDialog
        cancelLabel={t('settingsClearCurrentDataCancel')}
        confirmLabel={t('settingsClearCurrentDataAction')}
        confirmationToken={CLEAR_CURRENT_DATA_CONFIRMATION_TOKEN}
        description={(
          <>
            <p>{t('settingsClearCurrentDataDescription')}</p>
            <p className="mt-2 font-mono text-xs text-foreground">{CLEAR_CURRENT_DATA_CONFIRMATION_TOKEN}</p>
          </>
        )}
        isConfirmDisabled={
          clearConfirmValue.trim() !== CLEAR_CURRENT_DATA_CONFIRMATION_TOKEN || clearInFlight
        }
        isSubmitting={clearInFlight}
        open={clearConfirmOpen}
        title={t('settingsClearCurrentDataTitle')}
        value={clearConfirmValue}
        onCancel={() => {
          if (clearInFlight) {
            return;
          }
          setClearConfirmOpen(false);
          setClearConfirmValue('');
        }}
        onConfirm={() => void handleConfirmClearCurrentData()}
        onValueChange={setClearConfirmValue}
      />

      <div className="grid min-w-0 gap-4">
        <WorkspaceTitleCard
          actions={
            showSaveAction ? (
              <WorkspaceActionRow className="justify-end">
                {isInterfaceSection ? (
                  <DisplayViewModeToggle
                    displayViewMode={displayViewMode}
                    setDisplayViewMode={setDisplayViewMode}
                    t={t}
                  />
                ) : null}
                {showResetSenaDefaultsAction ? (
                  <Button
                    disabled={resetSenaDefaultsDisabled}
                    type="button"
                    variant="outline"
                    onClick={() => void handleResetSenaDefaults()}
                  >
                    <ActionUndoIcon data-icon="inline-start" />
                    {t('settingsResetDefaultsAction')}
                  </Button>
                ) : null}
                <Button
                  disabled={saveButtonDisabled}
                  type="button"
                  onClick={() => void handleSavePreferences()}
                >
                  <ActionSaveIcon data-icon="inline-start" />
                  {t('settingsSavePreferencesAction')}
                </Button>
              </WorkspaceActionRow>
            ) : undefined
          }
          descriptor={isInterfaceSection ? undefined : t(currentSection.descriptionKey)}
          eyebrow={t('settingsTitle')}
          title={t(currentSection.titleKey)}
        />

        <Routes>
            <Route element={<Navigate replace to="workspace" />} index />
            <Route
              element={
                <WorkspacePreferencesPage
                  currency={currency}
                  exchangeRateDraft={exchangeRateDraft}
                  exchangeRateError={exchangeRateError}
                  language={language}
                  setCurrency={setCurrency}
                  setExchangeRateDraft={setExchangeRateDraft}
                  setLanguage={setLanguage}
                  t={t}
                />
              }
              path="workspace"
            />
            <Route
              element={
                <InterfaceVisibilityPage
                  interfaceVisibilityDisabled={interfaceVisibilityDisabled}
                  setShowExplanatoryTooltips={setShowExplanatoryTooltips}
                  setShowFloatingTitleActions={setShowFloatingTitleActions}
                  setShowHeartbeatRibbons={setShowHeartbeatRibbons}
                  setShowAnalysisPage={setShowAnalysisPage}
                  setShowLogsViewToggle={setShowLogsViewToggle}
                  setShowPerformanceCompareToggle={setShowPerformanceCompareToggle}
                  setShowPerformanceTimelineCard={setShowPerformanceTimelineCard}
                  setShowOverviewTaskTabs={setShowOverviewTaskTabs}
                  setShowRightRailCards={setShowRightRailCards}
                  showAnalysisPage={showAnalysisPage}
                  showLogsViewToggle={showLogsViewToggle}
                  showPerformanceCompareToggle={showPerformanceCompareToggle}
                  showPerformanceTimelineCard={showPerformanceTimelineCard}
                  showExplanatoryTooltips={showExplanatoryTooltips}
                  showFloatingTitleActions={showFloatingTitleActions}
                  showHeartbeatRibbons={showHeartbeatRibbons}
                  showOverviewTaskTabs={showOverviewTaskTabs}
                  showRightRailCards={showRightRailCards}
                  t={t}
                />
              }
              path="interface"
            />
            <Route
              element={
                <PlanningSettingsPage
                  hasSenaParameterErrors={hasSenaParameterErrors}
                  senaEngineNumberDrafts={senaEngineNumberDrafts}
                  senaEngineNumberErrors={senaEngineNumberErrors}
                  senaEngineParameterFields={senaEngineParameterFields}
                  senaParametersChanged={senaParametersChanged}
                  senaRunStatus={senaRunStatus}
                  senaEngineParameters={senaEngineParameters}
                  setSenaEngineNumberDrafts={setSenaEngineNumberDrafts}
                  setSenaEngineNumberErrors={setSenaEngineNumberErrors}
                  setSenaEngineParameters={setSenaEngineParameters}
                  t={t}
                />
              }
              path="planning"
            />
            <Route
              element={
                <LocalWorkspaceDataPage
                  backupInFlight={backupInFlight}
                  backupStatus={backupStatus}
                  exportStatus={exportStatus}
                  handleCreateBackupSnapshot={handleCreateBackupSnapshot}
                  handleExportLogs={handleExportLogs}
                  handleExportSenaData={handleExportSenaData}
                  handleRestoreSnapshot={handleRestoreSnapshot}
                  localDataError={localDataError}
                  localDataInfo={localDataInfo}
                  logExportFormat={logExportFormat}
                  restoreInFlight={restoreInFlight}
                  senaExportFormat={senaExportFormat}
                  setLogExportFormat={setLogExportFormat}
                  setSenaExportFormat={setSenaExportFormat}
                  t={t}
                />
              }
              path="local-data"
            />
            <Route
              element={<CreditsPage t={t} />}
              path="credits"
            />
            <Route
              element={<DangerZonePage setClearConfirmOpen={setClearConfirmOpen} t={t} />}
              path="danger-zone"
            />
            <Route element={<Navigate replace to="workspace" />} path="*" />
          </Routes>
      </div>
    </WorkspacePage>
  );
}
