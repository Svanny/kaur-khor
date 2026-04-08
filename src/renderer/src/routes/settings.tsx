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
import { SectionLabel } from '@/routes/sku-detail/section-heading';
import { usePreferences } from '@/state/preferences';

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

const SENA_ENGINE_PARAMETER_FIELDS = [
  {
    key: 'particleCount',
    label: 'Particle count',
    helper: 'More particles make posterior reads steadier, but runs take longer.',
    tooltip:
      'Particle count controls how much sampling SENA uses during inference. Keep it lower for fast local refreshes and higher when comparing steadier reads.',
    min: 32,
    max: 2048,
    step: 1,
  },
  {
    key: 'targetServiceLevel',
    label: 'Target service level',
    helper: 'Stock-availability goal used when Banji calculates safety stock.',
    tooltip:
      'Target service level is the planning goal behind the reorder point. Higher targets usually protect more demand with more stock.',
    min: 0.5,
    max: 0.999,
    step: 0.001,
  },
  {
    key: 'recommendationQuantile',
    label: 'Recommendation quantile',
    helper: 'Posterior order-gap percentile Banji uses for the recommended quantity.',
    tooltip:
      'This picks which percentile of the simulated replenishment gap becomes the order quantity recommendation.',
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: 'intervalLowQuantile',
    label: 'Range low quantile',
    helper: 'Lower percentile for the order quantity range.',
    tooltip:
      'Banji uses this percentile as the low side of the likely order quantity band.',
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: 'intervalHighQuantile',
    label: 'Range high quantile',
    helper: 'Upper percentile for the order quantity range.',
    tooltip:
      'Banji uses this percentile as the high side of the likely order quantity band.',
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: 'needProbabilityGate',
    label: 'Need probability gate',
    helper: 'Minimum order-need probability before Banji issues a reorder.',
    tooltip:
      'SENA can still estimate an optional quantity below this gate, but Banji will not treat it as an issued reorder recommendation.',
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: 'reviewDelayDays',
    label: 'Review delay days',
    helper: 'Extra days Banji protects before sizing the order.',
    tooltip:
      'Review delay is added to lead time so the recommendation covers time until the next practical replenishment decision.',
    min: 0,
    max: 365,
    step: 1,
  },
] as const;

type SenaEngineNumberField = (typeof SENA_ENGINE_PARAMETER_FIELDS)[number]['key'];
type ExportFormat = (typeof EXPORT_FORMAT_OPTIONS)[number]['value'];

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

function setSenaEngineNumberParameter(
  parameters: SenaEngineParameters,
  key: SenaEngineNumberField,
  rawValue: string,
) {
  const parsedValue = Number(rawValue);
  if (!Number.isFinite(parsedValue)) {
    return parameters;
  }
  return normalizeSenaEngineParameters({
    ...parameters,
    [key]: parsedValue,
  });
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
    applySenaEngineParameters,
    persistedSenaEngineParameters,
    savePreferences,
    senaEngineParameters,
    setCurrency,
    setLanguage,
    setSenaEngineParameters,
    setShowExplanatoryTooltips,
    setShowFloatingTitleActions,
    setShowRightRailCards,
    showFloatingTitleActions,
    showRightRailCards,
    showExplanatoryTooltips,
  } = usePreferences();
  const [localDataInfo, setLocalDataInfo] = useState<DesktopLocalDataInfo | null>(null);
  const [localDataError, setLocalDataError] = useState<string | null>(null);
  const [senaRunStatus, setSenaRunStatus] = useState<string | null>(null);
  const [logExportFormat, setLogExportFormat] = useState<ExportFormat>('csv');
  const [senaExportFormat, setSenaExportFormat] = useState<ExportFormat>('csv');
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const senaParametersChanged = !senaEngineParametersEqual(
    senaEngineParameters,
    persistedSenaEngineParameters,
  );

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
          setLocalDataError(error instanceof Error ? error.message : 'Failed to load local workspace info.');
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
    const shouldRerunSena = senaParametersChanged;
    setSenaRunStatus(null);
    await savePreferences();
    if (shouldRerunSena) {
      try {
        await rerunSenaWithParameters(senaEngineParameters);
        setSenaRunStatus('SENA reran with the saved engine parameters.');
      } catch (error) {
        setSenaRunStatus(error instanceof Error ? error.message : 'SENA rerun failed.');
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
      setSenaRunStatus('SENA reran with default engine parameters.');
    } catch (error) {
      setSenaRunStatus(error instanceof Error ? error.message : 'SENA rerun failed.');
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
      setExportStatus(`Exported logs as ${exportFormatLabel(format)}.`);
    } catch (error) {
      setExportStatus(error instanceof Error ? error.message : 'Failed to export logs.');
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
              'Banji SENA data',
              sections.map(([title, rows]) => toExcelTable(title, rows)),
            )
            : sections.map(([title, rows]) => toCsvSection(title, rows)).join('\n\n');
      downloadTextFile(filename, content, exportMimeType(format));
      setExportStatus(`Exported SENA data as ${exportFormatLabel(format)}.`);
    } catch (error) {
      setExportStatus(error instanceof Error ? error.message : 'Failed to export SENA data.');
    }
  }

  return (
    <WorkspacePage>
      <WorkspaceTitleCard
        eyebrow="Settings"
        title="Desktop preferences"
        descriptor="Choose how much optional guidance Banji shows and how the desktop shell behaves on this device."
        actions={
          <WorkspaceActionRow className="justify-end">
            <Button disabled={!hasPendingChanges} type="button" onClick={() => void handleSavePreferences()}>
              <Save data-icon="inline-start" />
              Save preferences
            </Button>
          </WorkspaceActionRow>
        }
      />
      <WorkspacePanel title="Preferences controls" descriptor="These settings change only this desktop workspace.">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm">
            <span>Language</span>
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
          <label className="grid gap-2 text-sm">
            <span>Currency</span>
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
        </div>
        <div className="mt-4 divide-y divide-border/60">
          <CheckboxRow
            checked={showExplanatoryTooltips}
            helper="Show tooltips, section descriptors, and optional hints. Required field guidance stays visible."
            icon={<BadgeHelp className="size-4" />}
            label="Show optional help"
            variant="flat"
            onCheckedChange={setShowExplanatoryTooltips}
          />
          <CheckboxRow
            checked={showFloatingTitleActions}
            helper="Keep page actions visible after the header scrolls off screen."
            icon={<PanelsTopLeft className="size-4" />}
            label="Show floating title actions"
            variant="flat"
            onCheckedChange={setShowFloatingTitleActions}
          />
          <CheckboxRow
            checked={showRightRailCards}
            helper="Show the right-side context panels on analysis, performance, and detail pages."
            icon={<PanelRight className="size-4" />}
            label="Show right rail cards"
            variant="flat"
            onCheckedChange={setShowRightRailCards}
          />
        </div>
      </WorkspacePanel>

      <WorkspacePanel
        title="SENA engine parameters"
        descriptor="Tune how local SENA runs sample uncertainty and turn the posterior into reorder guidance."
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
            Reset to defaults
          </Button>
        }
      >
        <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2 xl:grid-cols-4">
          {SHOW_SENA_ANALYSIS_PROFILE_PARAMETER ? (
            <div className={parameterTileClassName}>
              <ParameterLabel
                inputId="sena-parameter-algorithm-version"
                label="Analysis profile"
                tooltip="Analysis profile selects the local SENA runner version. Keep the current profile unless you are comparing analysis builds."
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
              <span className={parameterHelperClassName}>Local runner version used for the next SENA refresh.</span>
            </div>
          ) : null}
          {SENA_ENGINE_PARAMETER_FIELDS.map((parameter) => (
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
                className={numberInputClassName}
                id={`sena-parameter-${parameter.key}`}
                max={parameter.max}
                min={parameter.min}
                step={parameter.step}
                type="number"
                value={senaEngineParameters[parameter.key]}
                onChange={(event) =>
                  setSenaEngineParameters(
                    setSenaEngineNumberParameter(senaEngineParameters, parameter.key, event.target.value),
                  )
                }
              />
              <span className={parameterHelperClassName}>{parameter.helper}</span>
            </div>
          ))}
          <CheckboxRow
            checked={senaEngineParameters.smoothingEnabled}
            helper="Smooth posterior traces before Banji summarizes them."
            label={
              <SectionLabel tooltip="Smoothing can make sparse traces easier to scan, but it also softens abrupt observation changes.">
                Enable smoothing
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
        ) : senaParametersChanged ? (
          <p className="text-sm text-muted-foreground">
            Saving preferences will rerun SENA with these engine parameters.
          </p>
        ) : null}
      </WorkspacePanel>

      <WorkspacePanel title="Local workspace storage" descriptor="Banji stores workspace data locally in SQLite on this device.">
        {localDataInfo ? (
          <div className="grid gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">Data directory</p>
              <p className="text-sm text-muted-foreground">{localDataInfo.dataDirectoryPath}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Workspace store</p>
              <p className="text-sm text-muted-foreground">{localDataInfo.workspaceStorePath}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Preferences file</p>
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
                Open local data folder
              </Button>
              <ExportFormatSelect
                ariaLabel="Export logs format"
                icon={<FileDown className="size-4" />}
                label="Export Logs"
                onExport={() => void handleExportLogs(logExportFormat)}
                value={logExportFormat}
                onValueChange={setLogExportFormat}
              />
              <ExportFormatSelect
                ariaLabel="Export SENA data format"
                icon={<DatabaseBackup className="size-4" />}
                label="Export SENA data"
                onExport={() => void handleExportSenaData(senaExportFormat)}
                value={senaExportFormat}
                onValueChange={setSenaExportFormat}
              />
            </WorkspaceActionRow>
            {exportStatus ? <p className="text-sm text-muted-foreground">{exportStatus}</p> : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {localDataError ?? 'Loading local workspace information…'}
          </p>
        )}
      </WorkspacePanel>

      <WorkspacePanel
        title="Credits"
        descriptor="One last small note from the builder."
        action={
          <div className="flex h-full items-center">
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              className="size-12"
              aria-label={creditsOpen ? 'Collapse credits' : 'Expand credits'}
              onClick={() => setCreditsOpen((current) => !current)}
            >
              {creditsOpen ? <ChevronUp /> : <ChevronDown />}
            </Button>
          </div>
        }
      >
        {creditsOpen ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Made with</span>
            <Heart aria-hidden="true" className="size-4 fill-current text-rose-500" />
            <span>by Monysovann Ly.</span>
          </p>
        ) : null}
      </WorkspacePanel>
    </WorkspacePage>
  );
}
