import { formatQuantityForDisplay } from '@/lib/format';
import type { AppLanguage } from '@shared/inventory';

export type IntervalDemandPointLike = {
  durationDays: number;
  totalDemandMean: number;
};

export function intervalDemandPerDay(points: IntervalDemandPointLike[] | undefined): number[] {
  return (points ?? [])
    .map((point) =>
      point.durationDays > 0 ? point.totalDemandMean / point.durationDays : point.totalDemandMean,
    )
    .filter((value) => Number.isFinite(value) && value >= 0);
}

export function formatDemandRate(value: number, language: AppLanguage): string {
  return formatQuantityForDisplay(value, language);
}

export function buildDemandChartDomain(values: number[], fallbackLow: number, fallbackHigh: number) {
  const baselineValues = [fallbackLow, fallbackHigh, ...values].filter(
    (value) => Number.isFinite(value) && value >= 0,
  );
  const observedMax = Math.max(...baselineValues, 0.05);
  const observedMin = Math.min(...baselineValues, fallbackLow, fallbackHigh);
  const compactScale = observedMax < 1;
  const minSpan = compactScale ? Math.max(observedMax * 1.35, 0.05) : 1;
  const intervalSpan = Math.max(fallbackHigh - fallbackLow, minSpan);
  const focusPad = Math.max(intervalSpan * 0.18, compactScale ? 0.01 : 1);
  const min = Math.max(0, observedMin - focusPad);
  const max = Math.max(min + minSpan, observedMax + focusPad);

  return {
    min,
    max,
    sigmaFloor: compactScale ? 0.005 : 0.15,
    bandwidthFloor: compactScale ? 0.005 : 0.2,
  };
}
