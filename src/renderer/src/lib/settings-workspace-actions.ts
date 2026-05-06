import type {
  DesktopBackupRestoreResult,
  DesktopBackupSnapshotResult,
} from '@shared/ipc';
import type { TranslationKey } from '@/lib/translations';
import { createWorkbook } from '@/lib/xlsx';

export const SETTINGS_EXPORT_FORMATS = ['excel', 'csv', 'json'] as const;
export type SettingsExportFormat = (typeof SETTINGS_EXPORT_FORMATS)[number];

type TranslateFn = (key: TranslationKey, variables?: Record<string, string | number | null | undefined>) => string;

function exportFormatLabel(value: SettingsExportFormat) {
  return SETTINGS_EXPORT_FORMATS.find((option) => option === value)?.toUpperCase().replace('EXCEL', 'Excel').replace('CSV', 'CSV').replace('JSON', 'JSON') ?? 'CSV';
}

function exportFileExtension(format: SettingsExportFormat) {
  return format === 'excel' ? 'xlsx' : format;
}

function exportMimeType(format: SettingsExportFormat) {
  if (format === 'json') {
    return 'application/json;charset=utf-8';
  }
  if (format === 'excel') {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  return 'text/csv;charset=utf-8';
}

function formatExportTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function downloadFile(filename: string, content: BlobPart, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  if (typeof navigator !== 'undefined' && /\bjsdom\b/i.test(navigator.userAgent)) {
    URL.revokeObjectURL(url);
    return;
  }
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

function sanitizeCsvCellText(value: string) {
  return /^[\s\x00-\x1f\x7f]*[=+\-@]/.test(value) ? `'${value}` : value;
}

function toCsv(rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) {
    return '';
  }
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const escapeCsvCell = (value: unknown) => {
    const serialized = serializeCell(value);
    const text = sanitizeCsvCellText(serialized);
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

function observationLogRows(observations: Awaited<ReturnType<typeof window.kaurKhorDesktop.sena.listObservations>>) {
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

function summaryRows(summary: Awaited<ReturnType<typeof window.kaurKhorDesktop.sena.getWorkspaceSummary>>) {
  return summary ? [summary] : [];
}

function skuSummaryRows(summary: Awaited<ReturnType<typeof window.kaurKhorDesktop.sena.getWorkspaceSummary>>) {
  return summary?.skuSummaries ?? [];
}

function diagnosticsRows(diagnostics: Awaited<ReturnType<typeof window.kaurKhorDesktop.sena.getDiagnostics>>) {
  return diagnostics ? [diagnostics] : [];
}

function runRows(run: Awaited<ReturnType<typeof window.kaurKhorDesktop.sena.getRunStatus>>) {
  return run ? [run] : [];
}

function toRecordRows<T extends object>(rows: T[]) {
  return rows as Array<Record<string, unknown>>;
}

export function formatBackupStatus(snapshot: DesktopBackupSnapshotResult, t: TranslateFn) {
  return t('settingsBackupSnapshotCreated', {
    path: snapshot.snapshotPath,
  });
}

export function formatRestoreStatus(result: DesktopBackupRestoreResult, t: TranslateFn) {
  return t('settingsRestoreSnapshotCompleted', {
    path: result.restoredSnapshotPath,
  });
}

export async function createBackupSnapshotAction(t: TranslateFn) {
  try {
    const snapshot = await window.kaurKhorDesktop.system.createBackupSnapshot();
    return formatBackupStatus(snapshot, t);
  } catch (error) {
    return error instanceof Error ? error.message : t('settingsBackupSnapshotFailed');
  }
}

export async function restoreBackupSnapshotAction(t: TranslateFn) {
  try {
    const restoreResult = await window.kaurKhorDesktop.system.restoreBackupSnapshot();
    if (!restoreResult) {
      return t('settingsRestoreSnapshotCancelled');
    }
    const message = formatRestoreStatus(restoreResult, t);
    window.location.reload();
    return message;
  } catch (error) {
    return error instanceof Error ? error.message : t('settingsRestoreSnapshotFailed');
  }
}

export async function exportLogsAction(format: SettingsExportFormat, t: TranslateFn) {
  try {
    const observations = await window.kaurKhorDesktop.sena.listObservations();
    const rows = observationLogRows(observations);
    const filename = `Kaur Khor-logs-${formatExportTimestamp()}.${exportFileExtension(format)}`;
    const content =
      format === 'json'
        ? JSON.stringify({ exportedAt: new Date().toISOString(), observations }, null, 2)
        : format === 'excel'
          ? createWorkbook([{ name: 'Logs', rows }])
          : toCsv(rows);
    downloadFile(filename, content, exportMimeType(format));
    return t('settingsLogsExported', { format: exportFormatLabel(format) });
  } catch (error) {
    return error instanceof Error ? error.message : t('settingsLogsExportFailed');
  }
}

export async function exportPlanningDataAction(format: SettingsExportFormat, t: TranslateFn) {
  try {
    const [catalog, observations, workspaceSummary, diagnostics] = await Promise.all([
      window.kaurKhorDesktop.sena.getCatalog(),
      window.kaurKhorDesktop.sena.listObservations(),
      window.kaurKhorDesktop.sena.getWorkspaceSummary(),
      window.kaurKhorDesktop.sena.getDiagnostics(),
    ]);
    const latestRun = workspaceSummary?.runId
      ? await window.kaurKhorDesktop.sena.getRunStatus({ runId: workspaceSummary.runId })
      : null;
    const filename = `kaur-khor-sena-data-${formatExportTimestamp()}.${exportFileExtension(format)}`;
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
          ? createWorkbook(sections.map(([title, rows]) => ({ name: title, rows })))
          : sections.map(([title, rows]) => toCsvSection(title, rows)).join('\n\n');
    downloadFile(filename, content, exportMimeType(format));
    return t('settingsParameterRunStatusExported', { format: exportFormatLabel(format) });
  } catch (error) {
    return error instanceof Error ? error.message : t('settingsParameterRunStatusFailed');
  }
}
