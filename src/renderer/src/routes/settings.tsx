import { useEffect, useState, type ReactNode } from 'react';
import {
  BadgeHelp,
  ChevronDown,
  ChevronUp,
  DatabaseBackup,
  FileDown,
  FolderOpen,
  Heart,
  PanelsTopLeft,
  PanelRight,
  RotateCcw,
  Save,
} from 'lucide-react';
import {
  DEFAULT_SENA_ENGINE_PARAMETERS,
  DEFAULT_USD_TO_KHR_EXCHANGE_RATE,
  normalizeSenaEngineParameters,
  senaEngineParametersEqual,
  type DesktopLocalDataInfo,
  type SenaEngineParameters,
} from '@shared/ipc';
import { CheckboxRow } from '@/components/system/checkbox-row';
import { HelpTooltip } from '@/components/system/help-tooltip';
import { WorkspaceActionRow, WorkspacePage, WorkspacePanel, WorkspaceTitleCard } from '@/components/system/workspace';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { useRouteLeaveConfirm } from '@/hooks/use-route-leave-confirm';
import { SectionLabel } from '@/routes/sku-detail/section-heading';
import { usePreferences } from '@/state/preferences';
import type { TranslationKey } from '@/lib/translations';

const selectClassName =
  'h-14 w-full appearance-none rounded-xl border border-border bg-background px-3 pr-12 text-base shadow-none outline-none';

const numberInputClassName =
  'h-11 w-full rounded-xl border border-border bg-background px-3 text-base shadow-none outline-none';
const parameterTileClassName = 'grid min-w-0 content-start gap-2 text-sm';
const parameterLabelClassName =
  'text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground';
const parameterHelperClassName = 'leading-6 text-muted-foreground';
const SHOW_SENA_ANALYSIS_PROFILE_PARAMETER = false;
const exportSelectTriggerClassName =
  'h-11 w-11 rounded-l-none rounded-r-2xl border border-l-0 border-border/70 bg-background/80 px-0 text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground data-[size=default]:h-11 data-[state=open]:bg-accent data-[state=open]:text-accent-foreground [&_svg]:mx-auto [&_svg]:opacity-100';
const exportActionButtonClassName =
  'h-11 rounded-l-2xl rounded-r-none border-border/70 bg-background/80 text-foreground shadow-xs';

const EXPORT_FORMAT_OPTIONS = [
  { value: 'csv', label: 'CSV' },
  { value: 'excel', label: 'Excel' },
  { value: 'json', label: 'JSON' },
] as const;

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
type ExportFormat = (typeof EXPORT_FORMAT_OPTIONS)[number]['value'];
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

function exportFileExtension(format: ExportFormat) {
  return format === 'excel' ? 'xls' : format;
}

function exportMimeType(format: ExportFormat) {
  if (format === 'json') {
    return 'application/json;charset=utf-8';
  }
  if (format === 'excel') {
    return 'application/vnd.ms-excel;charset=utf-8';
  }
  return 'text/csv;charset=utf-8';
}

function formatExportTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function serializeCell(value: unknown) {
  if (value == null) {
    return '';
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}

function toCsv(rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) {
    return '';
  }
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const escapeCsvCell = (value: unknown) => {
    const text = serializeCell(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => escapeCsvCell(row[header])).join(',')),
  ].join('\n');
}

function toCsvSection(title: string, rows: Array<Record<string, unknown>>) {
  return [`"${title.replace(/"/g, '""')}"`, toCsv(rows)].filter(Boolean).join('\n');
}

function htmlEscape(value: unknown) {
  return serializeCell(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toExcelTable(title: string, rows: Array<Record<string, unknown>>) {
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  return [
    `<h2>${htmlEscape(title)}</h2>`,
    '<table>',
    `<thead><tr>${headers.map((header) => `<th>${htmlEscape(header)}</th>`).join('')}</tr></thead>`,
    `<tbody>${rows.map((row) => `<tr>${headers.map((header) => `<td>${htmlEscape(row[header])}</td>`).join('')}</tr>`).join('')}</tbody>`,
    '</table>',
  ].join('');
}

function wrapExcelDocument(title: string, tables: string[]) {
  return [
    '<!doctype html>',
    '<html>',
    '<head><meta charset="utf-8" /></head>',
    '<body>',
    `<h1>${htmlEscape(title)}</h1>`,
    ...tables,
    '</body>',
    '</html>',
  ].join('');
}

function observationLogRows(observations: Awaited<ReturnType<typeof window.banjiDesktop.sena.listObservations>>) {
  return observations.map((observation) => ({
    observationId: observation.observationId,
    ownerSub: observation.ownerSub,
    observedAt: observation.input.observedAt,
    stockSnapshotCount: observation.input.stockSnapshot.length,
    serviceRankingCount: observation.input.serviceRankings.length,
    retailRankingCount: observation.input.retailRankings.length,
    serviceStockoutCount: observation.input.serviceStockouts.length,
    retailStockoutCount: observation.input.retailStockouts.length,
    orderSignalCount: observation.input.orderSignals.length,
    servicePriceCount: observation.input.servicePrices.length,
    retailPriceCount: observation.input.retailPrices.length,
    leadTimeHintCount: observation.input.leadTimeHints.length,
    adjustmentSignalCount: observation.input.adjustmentSignals?.length ?? 0,
    recipeUsageHintCount: observation.input.recipeUsageHints?.length ?? 0,
    regimeHint: observation.input.regimeHint ?? '',
    notes: observation.input.notes ?? '',
    payload: observation.input,
  }));
}

function summaryRows(summary: Awaited<ReturnType<typeof window.banjiDesktop.sena.getWorkspaceSummary>>) {
  return summary ? [summary] : [];
}

function skuSummaryRows(summary: Awaited<ReturnType<typeof window.banjiDesktop.sena.getWorkspaceSummary>>) {
  return summary?.skuSummaries ?? [];
}

function diagnosticsRows(diagnostics: Awaited<ReturnType<typeof window.banjiDesktop.sena.getDiagnostics>>) {
  return diagnostics ? [diagnostics] : [];
}

function runRows(run: Awaited<ReturnType<typeof window.banjiDesktop.sena.getRunStatus>>) {
  return run ? [run] : [];
}

function toRecordRows<T extends object>(rows: T[]) {
  return rows as Array<Record<string, unknown>>;
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

export function SettingsRoute() {
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
    setShowRightRailCards,
    showFloatingTitleActions,
    showRightRailCards,
    showExplanatoryTooltips,
    t,
  } = usePreferences();
  const [localDataInfo, setLocalDataInfo] = useState<DesktopLocalDataInfo | null>(null);
  const [localDataError, setLocalDataError] = useState<string | null>(null);
  const [senaRunStatus, setSenaRunStatus] = useState<string | null>(null);
  const [logExportFormat, setLogExportFormat] = useState<ExportFormat>('csv');
  const [senaExportFormat, setSenaExportFormat] = useState<ExportFormat>('csv');
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [creditsOpen, setCreditsOpen] = useState(false);
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
  }, []);

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
    try {
      const observations = await window.banjiDesktop.sena.listObservations();
      const rows = observationLogRows(observations);
      const filename = `banji-logs-${formatExportTimestamp()}.${exportFileExtension(format)}`;
      const content =
        format === 'json'
          ? JSON.stringify({ exportedAt: new Date().toISOString(), observations }, null, 2)
          : format === 'excel'
            ? wrapExcelDocument('Banji logs', [toExcelTable('Logs', rows)])
            : toCsv(rows);
      downloadTextFile(filename, content, exportMimeType(format));
      setExportStatus(t('settingsLogsExported', { format: exportFormatLabel(format) }));
    } catch (error) {
      setExportStatus(error instanceof Error ? error.message : t('settingsLogsExportFailed'));
    }
  }

  async function handleExportSenaData(format: ExportFormat) {
    try {
      const [catalog, observations, workspaceSummary, diagnostics] = await Promise.all([
        window.banjiDesktop.sena.getCatalog(),
        window.banjiDesktop.sena.listObservations(),
        window.banjiDesktop.sena.getWorkspaceSummary(),
        window.banjiDesktop.sena.getDiagnostics(),
      ]);
      const latestRun = workspaceSummary?.runId
        ? await window.banjiDesktop.sena.getRunStatus({ runId: workspaceSummary.runId })
        : null;
      const filename = `banji-sena-data-${formatExportTimestamp()}.${exportFileExtension(format)}`;
      const sections = [
        ['Catalog SKUs', toRecordRows(catalog?.skus ?? [])],
        ['Catalog services', toRecordRows(catalog?.services ?? [])],
        ['Catalog bundles', toRecordRows(catalog?.bundles ?? [])],
        ['Catalog sharing mask', toRecordRows(catalog?.sharingMask ?? [])],
        ['Observation logs', observationLogRows(observations)],
        ['Workspace summary', toRecordRows(summaryRows(workspaceSummary))],
        ['SKU summaries', toRecordRows(skuSummaryRows(workspaceSummary))],
        ['Diagnostics', toRecordRows(diagnosticsRows(diagnostics))],
        ['Latest run', toRecordRows(runRows(latestRun))],
      ] as const;
      const content =
        format === 'json'
          ? JSON.stringify(
            {
              exportedAt: new Date().toISOString(),
              catalog,
              observations,
              workspaceSummary,
              diagnostics,
              latestRun,
            },
            null,
            2,
          )
          : format === 'excel'
            ? wrapExcelDocument(
              t('settingsSenaDataWorkbookTitle'),
              sections.map(([title, rows]) => toExcelTable(title, rows)),
            )
            : sections.map(([title, rows]) => toCsvSection(title, rows)).join('\n\n');
      downloadTextFile(filename, content, exportMimeType(format));
      setExportStatus(t('settingsParameterRunStatusExported', { format: exportFormatLabel(format) }));
    } catch (error) {
      setExportStatus(error instanceof Error ? error.message : t('settingsParameterRunStatusFailed'));
    }
  }

  return (
    <WorkspacePage>
      {discardConfirmDialog}
      <WorkspaceTitleCard
        eyebrow={t('settingsTitle')}
        title={t('settingsDesktopPreferencesTitle')}
        descriptor={t('settingsDesktopPreferencesDescription')}
        actions={
          <WorkspaceActionRow className="justify-end">
            <Button
              disabled={Boolean(exchangeRateError) || hasSenaParameterErrors || (!hasPendingChanges && !senaParametersChanged && !exchangeRateChanged)}
              type="button"
              onClick={() => void handleSavePreferences()}
            >
              <Save data-icon="inline-start" />
              {t('settingsSavePreferencesAction')}
            </Button>
          </WorkspaceActionRow>
        }
      />
      <WorkspacePanel
        title={t('settingsPreferencesControlsTitle')}
        descriptor={t('settingsPreferencesControlsDescription')}
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(16rem,0.8fr)]">
          <label className="grid content-start gap-2 text-sm">
            <span>{t('settingsLanguage')}</span>
            <div className="relative">
              <select
                className={selectClassName}
                value={language}
                onChange={(event) => setLanguage(event.target.value as 'en' | 'km')}
              >
                <option value="en">English</option>
                <option value="km">Khmer</option>
              </select>
              <ChevronDown
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-muted-foreground"
              />
            </div>
          </label>
          <label className="grid content-start gap-2 text-sm">
            <span>{t('settingsCurrency')}</span>
            <div className="relative">
              <select
                className={selectClassName}
                value={currency}
                onChange={(event) => setCurrency(event.target.value as 'USD' | 'KHR')}
              >
                <option value="USD">USD</option>
                <option value="KHR">KHR</option>
              </select>
              <ChevronDown
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-muted-foreground"
              />
            </div>
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
        <div className="mt-4 grid gap-1">
          <p className="font-heading text-base font-medium tracking-[-0.02em] text-foreground">{t('settingsInterfaceVisibilityTitle')}</p>
          <p className="text-sm leading-6 text-muted-foreground">
            {t('settingsInterfaceVisibilityDescription')}
          </p>
        </div>
        <div className="divide-y divide-border/60">
          <CheckboxRow
            checked={showExplanatoryTooltips}
            className="pt-2"
            helper={t('settingsShowOptionalHelpHelp')}
            icon={<BadgeHelp className="size-4" />}
            label={t('settingsShowOptionalHelpLabel')}
            variant="flat"
            onCheckedChange={setShowExplanatoryTooltips}
          />
          <CheckboxRow
            checked={showFloatingTitleActions}
            helper={t('settingsShowFloatingActionsHelp')}
            icon={<PanelsTopLeft className="size-4" />}
            label={t('settingsShowFloatingActionsLabel')}
            variant="flat"
            onCheckedChange={setShowFloatingTitleActions}
          />
          <CheckboxRow
            checked={showRightRailCards}
            helper={t('settingsShowRightRailCardsHelp')}
            icon={<PanelRight className="size-4" />}
            label="Show right rail cards"
            variant="flat"
            onCheckedChange={setShowRightRailCards}
          />
        </div>
      </WorkspacePanel>

      <WorkspacePanel
        title={t('settingsSenaParametersPanelTitle')}
        descriptor={t('settingsSenaParametersPanelDescription')}
        action={
          <Button
            disabled={
              !senaParametersChanged &&
              senaEngineParametersEqual(senaEngineParameters, DEFAULT_SENA_ENGINE_PARAMETERS)
            }
            type="button"
            variant="outline"
            onClick={() => void handleResetSenaDefaults()}
          >
            <RotateCcw data-icon="inline-start" />
            {t('settingsResetDefaultsAction')}
          </Button>
        }
      >
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
            <div
              key={parameter.key}
              className={parameterTileClassName}
            >
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
                onChange={(event) =>
                  {
                    const nextValue = event.target.value;
                    setSenaEngineNumberDrafts((current) => {
                      const nextDrafts = {
                        ...current,
                        [parameter.key]: nextValue,
                      };
                      setSenaEngineNumberErrors(validateSenaEngineNumberDrafts(nextDrafts, t));
                      return nextDrafts;
                    });
                  }
                }
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
          <p className="text-sm text-muted-foreground">
            {t('settingsSenaParametersRerunHint')}
          </p>
        ) : null}
      </WorkspacePanel>

      <WorkspacePanel
        title={t('settingsLocalWorkspaceStorageTitle')}
        descriptor={t('settingsLocalWorkspaceStorageDescription')}
      >
        {localDataInfo ? (
          <div className="grid gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">{t('settingsDataDirectoryLabel')}</p>
              <p className="text-sm text-muted-foreground">{localDataInfo.dataDirectoryPath}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">{t('settingsWorkspaceStoreLabel')}</p>
              <p className="text-sm text-muted-foreground">{localDataInfo.workspaceStorePath}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">{t('settingsPreferencesFileLabel')}</p>
              <p className="text-sm text-muted-foreground">{localDataInfo.preferencesPath}</p>
            </div>
            <WorkspaceActionRow>
              <Button
                className="h-11 rounded-2xl border-border/70 bg-background/80 text-foreground shadow-xs"
                type="button"
                variant="outline"
                onClick={() => void window.banjiDesktop.system.openLocalDataFolder()}
              >
                <FolderOpen data-icon="inline-start" />
                {t('settingsOpenLocalDataFolderAction')}
              </Button>
              <ExportFormatSelect
                ariaLabel="Export logs format"
                icon={<FileDown className="size-4" />}
                label={t('settingsExportLogsAction')}
                onExport={() => void handleExportLogs(logExportFormat)}
                value={logExportFormat}
                onValueChange={setLogExportFormat}
              />
              <ExportFormatSelect
                ariaLabel={t('settingsSenaDataExportFormatLabel')}
                icon={<DatabaseBackup className="size-4" />}
                label={t('settingsExportSenaDataAction')}
                onExport={() => void handleExportSenaData(senaExportFormat)}
                value={senaExportFormat}
                onValueChange={setSenaExportFormat}
              />
            </WorkspaceActionRow>
            {exportStatus ? <p className="text-sm text-muted-foreground">{exportStatus}</p> : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {localDataError ?? t('settingsLoadLocalWorkspaceInfo')}
          </p>
        )}
      </WorkspacePanel>

      <WorkspacePanel
        title="Credits"
        descriptor={t('settingsCreditsDescription')}
        action={
          <div className="flex h-full items-center">
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              className="size-12"
              aria-label={creditsOpen ? t('settingsCollapseCredits') : t('settingsExpandCredits')}
              onClick={() => setCreditsOpen((current) => !current)}
            >
              {creditsOpen ? <ChevronUp /> : <ChevronDown />}
            </Button>
          </div>
        }
      >
        {creditsOpen ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{t('settingsMadeWith')}</span>
            <Heart aria-hidden="true" className="size-4 fill-current text-rose-500" />
            <span>{t('settingsMadeBy')}</span>
          </p>
        ) : null}
      </WorkspacePanel>
    </WorkspacePage>
  );
}
