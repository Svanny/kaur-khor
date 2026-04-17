export type ChartTimeframe = 'Recent' | '1M' | '3M' | '1Y' | 'YTD' | 'MAX';
export interface ChartCustomTimeframeRange {
  startAt: string;
  endAt: string;
}

export const CHART_TIMEFRAME_OPTIONS: ChartTimeframe[] = ['Recent', '1M', '3M', 'YTD', '1Y', 'MAX'];
export const RECENT_TIMEFRAME_DAYS = 7;
export const RECENT_TIMEFRAME_MIN_REPORTS = 5;

export function shouldPruneTimeframeTransition({
  latestObservedAt,
  nextTimeframe,
  previousTimeframe,
}: {
  latestObservedAt: string | null | undefined;
  nextTimeframe: ChartTimeframe;
  previousTimeframe: ChartTimeframe | null;
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

  const previousBoundary = deriveChartTimeframeBoundary(latestObservedAt, previousTimeframe);
  const nextBoundary = deriveChartTimeframeBoundary(latestObservedAt, nextTimeframe);
  if (!previousBoundary || !nextBoundary) {
    return false;
  }
  return nextBoundary.getTime() > previousBoundary.getTime();
}

export function deriveChartTimeframeBoundary(
  latestObservedAt: string | null | undefined,
  timeframe: ChartTimeframe,
) {
  if (timeframe === 'MAX' || !latestObservedAt) {
    return null;
  }

  const latest = new Date(latestObservedAt);
  if (Number.isNaN(latest.getTime())) {
    return null;
  }

  if (timeframe === 'Recent') {
    const boundary = new Date(latest);
    boundary.setUTCDate(boundary.getUTCDate() - RECENT_TIMEFRAME_DAYS);
    return boundary;
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

export function isChartTimeframeSatisfied({
  hasOlder,
  loadedIntervalCount,
  oldestIntervalAt,
  respectRecentBoundary = false,
  timeframe,
  boundary,
}: {
  hasOlder: boolean;
  loadedIntervalCount?: number;
  oldestIntervalAt: string | null;
  respectRecentBoundary?: boolean;
  timeframe: ChartTimeframe;
  boundary: Date | null;
}) {
  if (!hasOlder) {
    return true;
  }
  if (timeframe === 'Recent' && (loadedIntervalCount ?? 0) < RECENT_TIMEFRAME_MIN_REPORTS) {
    return false;
  }
  if (timeframe === 'Recent' && !respectRecentBoundary) {
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
  timeframe: ChartTimeframe;
}) {
  if (loadedIntervalCount <= 0 || intervalCount <= loadedIntervalCount) {
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
    Math.max(
      loadedIntervalCount,
      timeframe === 'Recent' ? RECENT_TIMEFRAME_MIN_REPORTS : 0,
      Math.ceil((targetSpanMs / loadedSpanMs) * loadedIntervalCount),
    ),
  );
  const remainingIntervals = Math.max(0, estimatedIntervalsNeeded - loadedIntervalCount);
  return Math.max(0, Math.ceil(remainingIntervals / Math.max(batchSize, 1)));
}
