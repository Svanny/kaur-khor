export type ChartResolutionPreset = 'H' | '1D' | '1W' | '1M' | '3M' | '1Y';
export type ChartResolutionOption = ChartResolutionPreset | 'Custom';
export type ChartResolutionUnit = 'm' | 'H' | 'D' | 'W' | 'M' | 'Y';

export interface ChartResolutionSpec {
  amount: number;
  unit: ChartResolutionUnit;
}

export interface ChartCustomResolution extends ChartResolutionSpec {
  expression: string;
}

export const CHART_RESOLUTION_OPTIONS: ChartResolutionOption[] = ['H', '1D', '1W', '1M', '3M', '1Y', 'Custom'];
export const DEFAULT_CHART_RESOLUTION: ChartResolutionPreset = '1D';

const PRESET_TO_SPEC: Record<ChartResolutionPreset, ChartResolutionSpec> = {
  H: { amount: 1, unit: 'H' },
  '1D': { amount: 1, unit: 'D' },
  '1W': { amount: 1, unit: 'W' },
  '1M': { amount: 1, unit: 'M' },
  '3M': { amount: 3, unit: 'M' },
  '1Y': { amount: 1, unit: 'Y' },
};

export function resolutionSpecForOption(
  option: ChartResolutionOption,
  custom: ChartCustomResolution | null,
): ChartResolutionSpec | null {
  if (option === 'Custom') {
    return custom;
  }
  return PRESET_TO_SPEC[option];
}

export function formatChartResolution(option: ChartResolutionOption, custom: ChartCustomResolution | null) {
  if (option !== 'Custom') {
    return option;
  }
  return custom?.expression ?? 'Custom';
}

export function parseChartCustomResolution(value: string): ChartCustomResolution | null {
  const normalized = value.trim();
  const match = /^([1-9]\d*)(m|H|D|W|M|Y)$/.exec(normalized);
  if (!match) {
    return null;
  }
  const amount = Number.parseInt(match[1] ?? '', 10);
  const unit = match[2] as ChartResolutionUnit;
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  return {
    amount,
    unit,
    expression: `${amount}${unit}`,
  };
}

function floorTimestamp(timestampMs: number, stepMs: number) {
  return Math.floor(timestampMs / stepMs) * stepMs;
}

function startOfUtcWeek(timestampMs: number) {
  const date = new Date(timestampMs);
  const normalized = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    0,
    0,
    0,
    0,
  ));
  const day = normalized.getUTCDay();
  const mondayOffset = (day + 6) % 7;
  normalized.setUTCDate(normalized.getUTCDate() - mondayOffset);
  return normalized.getTime();
}

function startOfUtcMonthGroup(timestampMs: number, amount: number) {
  const date = new Date(timestampMs);
  const monthIndex = date.getUTCFullYear() * 12 + date.getUTCMonth();
  const groupedIndex = Math.floor(monthIndex / amount) * amount;
  const year = Math.floor(groupedIndex / 12);
  const month = groupedIndex % 12;
  return Date.UTC(year, month, 1, 0, 0, 0, 0);
}

function startOfUtcYearGroup(timestampMs: number, amount: number) {
  const date = new Date(timestampMs);
  const year = Math.floor(date.getUTCFullYear() / amount) * amount;
  return Date.UTC(year, 0, 1, 0, 0, 0, 0);
}

export function bucketTimestampForResolution(timestampMs: number, resolution: ChartResolutionSpec) {
  switch (resolution.unit) {
    case 'm':
      return floorTimestamp(timestampMs, resolution.amount * 60_000);
    case 'H':
      return floorTimestamp(timestampMs, resolution.amount * 3_600_000);
    case 'D':
      return floorTimestamp(timestampMs, resolution.amount * 86_400_000);
    case 'W': {
      const weekStart = startOfUtcWeek(timestampMs);
      const weeksSinceEpoch = Math.floor((weekStart - Date.UTC(1970, 0, 5, 0, 0, 0, 0)) / (7 * 86_400_000));
      const groupedWeeks = Math.floor(weeksSinceEpoch / resolution.amount) * resolution.amount;
      return Date.UTC(1970, 0, 5 + groupedWeeks * 7, 0, 0, 0, 0);
    }
    case 'M':
      return startOfUtcMonthGroup(timestampMs, resolution.amount);
    case 'Y':
      return startOfUtcYearGroup(timestampMs, resolution.amount);
  }
}
