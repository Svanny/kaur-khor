export type AnalysisTimeframe = 'Recent' | '1M' | '3M' | '1Y' | 'YTD' | 'MAX';

export const ANALYSIS_TIMEFRAME_OPTIONS: AnalysisTimeframe[] = ['Recent', '1M', '3M', 'YTD', '1Y', 'MAX'];

export function shouldPruneTimeframeTransition({
  latestObservedAt,
  nextTimeframe,
  previousTimeframe,
}: {
  latestObservedAt: string | null | undefined;
  nextTimeframe: AnalysisTimeframe;
  previousTimeframe: AnalysisTimeframe | null;
}) {
  if (!previousTimeframe || previousTimeframe === nextTimeframe) {
    return false;
  }
  if (previousTimeframe === 'Recent') {
    return false;
  }
  if (nextTimeframe === 'Recent') {
    return true;
  }
  if (previousTimeframe === 'MAX') {
    return nextTimeframe !== 'MAX';
  }
  if (nextTimeframe === 'MAX') {
    return false;
  }

  const previousBoundary = deriveAnalysisTimeframeBoundary(latestObservedAt, previousTimeframe);
  const nextBoundary = deriveAnalysisTimeframeBoundary(latestObservedAt, nextTimeframe);
  if (!previousBoundary || !nextBoundary) {
    return false;
  }
  return nextBoundary.getTime() > previousBoundary.getTime();
}

export function deriveAnalysisTimeframeBoundary(
  latestObservedAt: string | null | undefined,
  timeframe: AnalysisTimeframe,
) {
  if (timeframe === 'Recent' || timeframe === 'MAX' || !latestObservedAt) {
    return null;
  }

  const latest = new Date(latestObservedAt);
  if (Number.isNaN(latest.getTime())) {
    return null;
  }

  if (timeframe === 'YTD') {
    return new Date(Date.UTC(latest.getUTCFullYear(), 0, 1, 0, 0, 0, 0));
  }

  const boundary = new Date(latest);
  if (timeframe === '1M') {
    boundary.setUTCMonth(boundary.getUTCMonth() - 1);
    return boundary;
  }
  if (timeframe === '3M') {
    boundary.setUTCMonth(boundary.getUTCMonth() - 3);
    return boundary;
  }

  boundary.setUTCFullYear(boundary.getUTCFullYear() - 1);
  return boundary;
}

export function isAnalysisTimeframeSatisfied({
  hasOlder,
  oldestIntervalAt,
  timeframe,
  boundary,
}: {
  hasOlder: boolean;
  oldestIntervalAt: string | null;
  timeframe: AnalysisTimeframe;
  boundary: Date | null;
}) {
  if (!hasOlder) {
    return true;
  }
  if (timeframe === 'Recent') {
    return true;
  }
  if (timeframe === 'MAX') {
    return false;
  }
  if (!boundary || !oldestIntervalAt) {
    return false;
  }
  const oldest = new Date(oldestIntervalAt);
  if (Number.isNaN(oldest.getTime())) {
    return false;
  }
  return oldest.getTime() <= boundary.getTime();
}

export function deriveEstimatedTimeframeBatchCount({
  batchSize,
  boundary,
  intervalCount,
  latestObservedAt,
  loadedIntervalCount,
  oldestLoadedAt,
  timeframe,
}: {
  batchSize: number;
  boundary: Date | null;
  intervalCount: number;
  latestObservedAt: string | null | undefined;
  loadedIntervalCount: number;
  oldestLoadedAt: string | null;
  timeframe: AnalysisTimeframe;
}) {
  if (loadedIntervalCount <= 0 || intervalCount <= loadedIntervalCount) {
    return 0;
  }

  if (timeframe === 'Recent') {
    return 0;
  }

  if (timeframe === 'MAX') {
    const remainingIntervals = Math.max(0, intervalCount - loadedIntervalCount);
    return Math.max(0, Math.ceil(remainingIntervals / Math.max(batchSize, 1)));
  }

  if (!boundary || !latestObservedAt) {
    return 0;
  }

  const latest = new Date(latestObservedAt);
  const oldestLoaded = oldestLoadedAt ? new Date(oldestLoadedAt) : null;
  if (Number.isNaN(latest.getTime()) || !oldestLoaded || Number.isNaN(oldestLoaded.getTime())) {
    return 0;
  }

  const loadedSpanMs = Math.max(1, latest.getTime() - oldestLoaded.getTime());
  const targetSpanMs = Math.max(0, latest.getTime() - boundary.getTime());
  const estimatedIntervalsNeeded = Math.min(
    intervalCount,
    Math.max(loadedIntervalCount, Math.ceil((targetSpanMs / loadedSpanMs) * loadedIntervalCount)),
  );
  const remainingIntervals = Math.max(0, estimatedIntervalsNeeded - loadedIntervalCount);
  return Math.max(0, Math.ceil(remainingIntervals / Math.max(batchSize, 1)));
}
