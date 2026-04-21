import type { SenaLeadTimeVariabilityClass } from './sena';

export const SENA_LEAD_TIME_FLOOR_DAYS = 0.5;
const CLASS_ORDER: SenaLeadTimeVariabilityClass[] = ['very_tight', 'tight', 'normal', 'wide', 'very_wide'];
const CLASS_CENTER_WIDTH: Record<SenaLeadTimeVariabilityClass, number> = {
  very_tight: 0.10,
  tight: 0.30,
  normal: 0.55,
  wide: 0.90,
  very_wide: 1.35,
};

export function impliedLeadTimeRangeFromMeanStd(meanDays: number, stdDays: number) {
  if (!Number.isFinite(meanDays) || !Number.isFinite(stdDays) || meanDays < 0 || stdDays < 0) {
    return null;
  }
  const lowDays = Math.max(meanDays - stdDays, SENA_LEAD_TIME_FLOOR_DAYS);
  const highDays = Math.max(meanDays + stdDays, lowDays);
  return { lowDays, highDays };
}

export function relativeLeadTimeWidth(lowDays: number | null, highDays: number | null) {
  if (lowDays == null || highDays == null) {
    return null;
  }
  if (!Number.isFinite(lowDays) || !Number.isFinite(highDays) || lowDays < 0 || highDays < lowDays) {
    return null;
  }
  const midpoint = Math.max((highDays + lowDays) / 2, SENA_LEAD_TIME_FLOOR_DAYS);
  return (highDays - lowDays) / midpoint;
}

export function classifyLeadTimeVariability(
  relativeWidth: number | null,
): SenaLeadTimeVariabilityClass | null {
  if (relativeWidth == null || !Number.isFinite(relativeWidth) || relativeWidth < 0) {
    return null;
  }
  if (relativeWidth < 0.2) {
    return 'very_tight';
  }
  if (relativeWidth < 0.4) {
    return 'tight';
  }
  if (relativeWidth < 0.7) {
    return 'normal';
  }
  if (relativeWidth < 1.1) {
    return 'wide';
  }
  return 'very_wide';
}

export function deriveLeadTimeVariabilityClass({
  lowDays,
  highDays,
  variabilityClass,
}: {
  lowDays: number | null;
  highDays: number | null;
  variabilityClass: SenaLeadTimeVariabilityClass | null;
}) {
  return variabilityClass ?? classifyLeadTimeVariability(relativeLeadTimeWidth(lowDays, highDays));
}

export function deriveLeadTimeFromStdDays(
  meanDays: number | null,
  stdDays: number | null,
): {
  highDays: number | null;
  lowDays: number | null;
  stdDays: number | null;
  variabilityClass: SenaLeadTimeVariabilityClass | null;
} {
  if (meanDays == null || stdDays == null || !Number.isFinite(meanDays) || !Number.isFinite(stdDays) || meanDays < 0 || stdDays < 0) {
    return {
      highDays: null,
      lowDays: null,
      stdDays: null,
      variabilityClass: null,
    };
  }

  const range = impliedLeadTimeRangeFromMeanStd(meanDays, stdDays);
  return {
    highDays: range?.highDays ?? null,
    lowDays: range?.lowDays ?? null,
    stdDays,
    variabilityClass: classifyLeadTimeVariability(relativeLeadTimeWidth(range?.lowDays ?? null, range?.highDays ?? null)),
  };
}

export function leadTimeVariabilityOptions() {
  return CLASS_ORDER;
}

export function leadTimeVariabilityLabel(value: SenaLeadTimeVariabilityClass) {
  switch (value) {
    case 'very_tight':
      return 'Very tight';
    case 'tight':
      return 'Tight';
    case 'normal':
      return 'Normal';
    case 'wide':
      return 'Wide';
    case 'very_wide':
      return 'Very wide';
  }
}

export function leadTimeVariabilityDescription(value: SenaLeadTimeVariabilityClass) {
  switch (value) {
    case 'very_tight':
      return 'Supplier timing is highly consistent.';
    case 'tight':
      return 'Supplier timing moves a little around the mean.';
    case 'normal':
      return 'Supplier timing has routine variation.';
    case 'wide':
      return 'Supplier timing moves noticeably around the mean.';
    case 'very_wide':
      return 'Supplier timing is unstable and often drifts.';
  }
}

export function compatibilityStdDaysForClass(
  meanDays: number | null,
  variabilityClass: SenaLeadTimeVariabilityClass | null,
) {
  if (meanDays == null || variabilityClass == null || !Number.isFinite(meanDays) || meanDays < 0) {
    return null;
  }
  return Math.max(0.3, (CLASS_CENTER_WIDTH[variabilityClass] * Math.max(meanDays, SENA_LEAD_TIME_FLOOR_DAYS)) / 2);
}

export function compatibilityRangeForClass(
  meanDays: number | null,
  variabilityClass: SenaLeadTimeVariabilityClass | null,
) {
  const stdDays = compatibilityStdDaysForClass(meanDays, variabilityClass);
  if (meanDays == null || stdDays == null) {
    return null;
  }
  return impliedLeadTimeRangeFromMeanStd(meanDays, stdDays);
}

export function deriveLeadTimeFromVariabilityClass(
  meanDays: number | null,
  variabilityClass: SenaLeadTimeVariabilityClass | null,
): {
  highDays: number | null;
  lowDays: number | null;
  stdDays: number | null;
  variabilityClass: SenaLeadTimeVariabilityClass | null;
} {
  const stdDays = compatibilityStdDaysForClass(meanDays, variabilityClass);
  const range = compatibilityRangeForClass(meanDays, variabilityClass);
  return {
    highDays: range?.highDays ?? null,
    lowDays: range?.lowDays ?? null,
    stdDays,
    variabilityClass,
  };
}
