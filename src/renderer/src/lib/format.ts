import type {
  AppCurrency,
  AppLanguage,
  RankingEntry,
  ServiceRecord,
  SkuRecord,
} from '@shared/inventory';

type DurationUnit = 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';
type DurationDisplay = 'short' | 'long';

const durationStepDown: Record<
  DurationUnit,
  { nextUnit: Exclude<DurationUnit, 'year'> | null; factorToNext: number | null }
> = {
  year: { nextUnit: 'month', factorToNext: 12 },
  month: { nextUnit: 'week', factorToNext: 30 / 7 },
  week: { nextUnit: 'day', factorToNext: 7 },
  day: { nextUnit: 'hour', factorToNext: 24 },
  hour: { nextUnit: 'minute', factorToNext: 60 },
  minute: { nextUnit: null, factorToNext: null },
};

export function localeFor(language: AppLanguage): string {
  return language === 'km' ? 'km-KH' : 'en-US';
}

export function formatCurrency(
  value: number,
  currency: AppCurrency,
  language: AppLanguage,
): string {
  const fractionDigits = currencyFractionDigits(currency);
  return new Intl.NumberFormat(localeFor(language), {
    style: 'currency',
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function currencyFractionDigits(currency: AppCurrency): number {
  return currency === 'KHR' ? 0 : 2;
}

export function formatDecimal(
  value: number,
  language: AppLanguage,
  fractionDigits: number,
): string {
  return new Intl.NumberFormat(localeFor(language), {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function formatNumber(value: number, language: AppLanguage): string {
  return new Intl.NumberFormat(localeFor(language), {
    maximumFractionDigits: 2,
  }).format(value);
}

export function sanitizeWholeNumberForDisplay(value: number): number {
  return Math.round(value);
}

export function formatWholeNumber(value: number, language: AppLanguage): string {
  return new Intl.NumberFormat(localeFor(language), {
    maximumFractionDigits: 0,
  }).format(sanitizeWholeNumberForDisplay(value));
}

export function formatEditableWholeNumber(value: number): string {
  return String(sanitizeWholeNumberForDisplay(value));
}

export function sanitizeEditableWholeNumber(value: string): string {
  if (!value.trim()) {
    return '';
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return value;
  }

  return formatEditableWholeNumber(parsed);
}

function coerceDurationUnit(
  value: number,
  unit: DurationUnit,
): { value: number; unit: DurationUnit } {
  let nextValue = value;
  let nextUnit = unit;

  while (
    nextValue !== 0 &&
    sanitizeWholeNumberForDisplay(nextValue) === 0 &&
    durationStepDown[nextUnit].nextUnit &&
    durationStepDown[nextUnit].factorToNext
  ) {
    nextValue *= durationStepDown[nextUnit].factorToNext;
    nextUnit = durationStepDown[nextUnit].nextUnit;
  }

  return { value: nextValue, unit: nextUnit };
}

function escalatingFractionDigits(value: number): number {
  const absoluteValue = Math.abs(value);
  if (absoluteValue === 0 || absoluteValue >= 1) {
    return 0;
  }

  let fractionDigits = 2;
  while (fractionDigits < 12 && sanitizeWholeNumberForDisplay(absoluteValue * 10 ** fractionDigits) === 0) {
    fractionDigits += 2;
  }

  return fractionDigits;
}

export function formatQuantityForDisplay(value: number, language: AppLanguage): string {
  const maximumFractionDigits = escalatingFractionDigits(value);
  return new Intl.NumberFormat(localeFor(language), {
    maximumFractionDigits,
  }).format(maximumFractionDigits === 0 ? sanitizeWholeNumberForDisplay(value) : value);
}

export function formatDurationAuto(
  value: number,
  unit: DurationUnit,
  language: AppLanguage,
  display: DurationDisplay = 'long',
): string {
  const coerced = coerceDurationUnit(value, unit);
  const maximumFractionDigits = escalatingFractionDigits(coerced.value);
  return new Intl.NumberFormat(localeFor(language), {
    style: 'unit',
    unit: coerced.unit,
    unitDisplay: display === 'short' ? 'narrow' : 'long',
    maximumFractionDigits,
  }).format(maximumFractionDigits === 0 ? sanitizeWholeNumberForDisplay(coerced.value) : coerced.value);
}

export function formatEditableDecimal(value: number, maximumFractionDigits: number): string {
  const rounded = value.toFixed(maximumFractionDigits);
  return rounded.replace(/(?:\.0+|(\.\d*?[1-9])0+)$/, '$1');
}

export function formatEditableMoney(value: number): string {
  return formatEditableDecimal(value, 2);
}

export function rankLabel(
  entry: RankingEntry,
  skus: SkuRecord[],
  services: ServiceRecord[],
): string {
  if (entry.entryType === 'service') {
    return services.find((service) => service.serviceId === entry.entryId)?.name ?? entry.entryId;
  }
  return skus.find((sku) => sku.skuId === entry.entryId)?.name ?? entry.entryId;
}
