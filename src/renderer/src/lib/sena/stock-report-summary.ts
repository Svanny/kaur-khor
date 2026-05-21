import type { StockReport } from '@shared/inventory';

export function stockReportSourceKey(source: StockReport['reportSource']) {
  void source;
  return 'stockHistorySourceManual';
}

export function summarizeCount(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function rankingSignalCount(report: Pick<StockReport, 'topServiceRanking' | 'topRetailRanking'>) {
  return report.topServiceRanking.length + report.topRetailRanking.length;
}

export function summarizeNotes(notes: string | null, maxLength = 96) {
  if (!notes) {
    return null;
  }

  const normalized = notes.trim().replace(/\s+/g, ' ');
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}
