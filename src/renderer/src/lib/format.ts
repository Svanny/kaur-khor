import type {
  AppCurrency,
  AppLanguage,
  RankingEntry,
  ServiceRecord,
  SkuRecord,
} from '@shared/inventory';
import { DEFAULT_USD_TO_KHR_EXCHANGE_RATE } from '@shared/ipc';

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

const shortDurationUnitLabel: Record<DurationUnit, string> = {
  minute: 'm',
  hour: 'h',
  day: 'D',
  week: 'W',
  month: 'M',
  year: 'Y',
};

const shortDurationUnitLabelKm: Record<DurationUnit, string> = {
  minute: ' នាទី',
  hour: ' ម៉ោង',
  day: ' ថ្ងៃ',
  week: ' សប្ដាហ៍',
  month: ' ខែ',
  year: ' ឆ្នាំ',
};

export function localeFor(language: AppLanguage): string {
  return language === 'km' ? 'km-KH' : 'en-US';
}

export function formatCurrency(
  value: number,
  currency: AppCurrency,
  language: AppLanguage,
  usdToKhrExchangeRate = DEFAULT_USD_TO_KHR_EXCHANGE_RATE,
): string {
  const fractionDigits = currencyFractionDigits(currency);
  return new Intl.NumberFormat(localeFor(language), {
    style: 'currency',
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(displayMoneyFromUsd(value, currency, usdToKhrExchangeRate));
}

export function currencyFractionDigits(currency: AppCurrency): number {
  return currency === 'KHR' ? 0 : 2;
}

export function currencyInputSymbol(currency: AppCurrency): string {
  return currency === 'KHR' ? '៛' : '$';
}

export function displayMoneyFromUsd(
  value: number,
  currency: AppCurrency,
  usdToKhrExchangeRate = DEFAULT_USD_TO_KHR_EXCHANGE_RATE,
): number {
  return currency === 'KHR' ? value * usdToKhrExchangeRate : value;
}

export function usdMoneyFromDisplay(
  value: number,
  currency: AppCurrency,
  usdToKhrExchangeRate = DEFAULT_USD_TO_KHR_EXCHANGE_RATE,
): number {
  return currency === 'KHR' ? value / usdToKhrExchangeRate : value;
}

export function parseUsdMoneyFromDisplay(
  value: string,
  currency: AppCurrency,
  usdToKhrExchangeRate = DEFAULT_USD_TO_KHR_EXCHANGE_RATE,
): number {
  return usdMoneyFromDisplay(Number(value), currency, usdToKhrExchangeRate);
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
    Math.abs(nextValue) > 0 &&
    Math.abs(nextValue) < 1 &&
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

export function formatCompactQuantityPill(value: number): string {
  const safeValue = Math.max(0, value);
  const units = [
    { threshold: 1_000_000_000_000, suffix: 'T' },
    { threshold: 1_000_000_000, suffix: 'B' },
    { threshold: 1_000_000, suffix: 'M' },
    { threshold: 1_000, suffix: 'k' },
  ] as const;

  for (const [index, unit] of units.entries()) {
    if (safeValue >= unit.threshold) {
      const compactValue = Math.round((safeValue / unit.threshold) * 10) / 10;
      if (compactValue >= 1000 && unit.suffix !== 'T') {
        const largerUnit = units[index - 1];
        if (largerUnit) {
          return `${formatEditableDecimal(Math.round((safeValue / largerUnit.threshold) * 10) / 10, 1)}${largerUnit.suffix}`;
        }
      }
      return `${formatEditableDecimal(compactValue, 1)}${unit.suffix}`;
    }
  }

  return formatEditableWholeNumber(safeValue);
}

export function formatDurationAuto(
  value: number,
  unit: DurationUnit,
  language: AppLanguage,
  display: DurationDisplay = 'long',
): string {
  const coerced = coerceDurationUnit(value, unit);
  const roundedValue =
    coerced.unit === 'minute' && coerced.value > 0 && coerced.value < 1
      ? 1
      : sanitizeWholeNumberForDisplay(coerced.value);

  if (display === 'short') {
    const unitLabel = language === 'km' ? shortDurationUnitLabelKm[coerced.unit] : shortDurationUnitLabel[coerced.unit];
    return `${formatWholeNumber(roundedValue, language)}${unitLabel}`;
  }

  return new Intl.NumberFormat(localeFor(language), {
    style: 'unit',
    unit: coerced.unit,
    unitDisplay: 'long',
    maximumFractionDigits: 0,
  }).format(roundedValue);
}

export function formatEditableDecimal(value: number, maximumFractionDigits: number): string {
  const rounded = value.toFixed(maximumFractionDigits);
  return rounded.replace(/(?:\.0+|(\.\d*?[1-9])0+)$/, '$1');
}

export function formatEditableMoney(value: number): string {
  return formatEditableDecimal(value, 2);
}

export type EditableNumberDraftMode = 'decimal' | 'integer';

export function sanitizeEditableNumberDraft(
  value: string,
  mode: EditableNumberDraftMode = 'decimal',
): string {
  const withoutCommas = value.replace(/,/g, '');
  let nextValue = '';
  let hasDecimalPoint = false;

  for (const character of withoutCommas) {
    if (character >= '0' && character <= '9') {
      nextValue += character;
      continue;
    }

    if (mode === 'decimal' && character === '.' && !hasDecimalPoint) {
      nextValue += character;
      hasDecimalPoint = true;
    }
  }

  return nextValue;
}

export function formatEditableNumberWithCommas(value: string): string {
  if (!value.trim()) {
    return '';
  }

  const sanitized = sanitizeEditableNumberDraft(value);
  if (!sanitized) {
    return '';
  }

  const [integerPart = '', decimalPart] = sanitized.split('.');
  const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  return decimalPart == null ? groupedInteger : `${groupedInteger}.${decimalPart}`;
}

export function parseEditableNumberWithCommas(value: string): number {
  return Number(value.replace(/,/g, ''));
}

export function formatEditableMoneyFromUsd(
  value: number,
  currency: AppCurrency,
  usdToKhrExchangeRate = DEFAULT_USD_TO_KHR_EXCHANGE_RATE,
): string {
  return formatEditableDecimal(
    displayMoneyFromUsd(value, currency, usdToKhrExchangeRate),
    currencyFractionDigits(currency),
  );
}

export function moneyInputStep(currency: AppCurrency): string {
  return currency === 'KHR' ? '100' : '0.1';
}

export function reformatMoneyDraftValue({
  value,
  previousCurrency,
  previousUsdToKhrExchangeRate = DEFAULT_USD_TO_KHR_EXCHANGE_RATE,
  nextCurrency,
  nextUsdToKhrExchangeRate = DEFAULT_USD_TO_KHR_EXCHANGE_RATE,
}: {
  value: string;
  previousCurrency: AppCurrency;
  previousUsdToKhrExchangeRate?: number;
  nextCurrency: AppCurrency;
  nextUsdToKhrExchangeRate?: number;
}): string {
  if (value.trim().length === 0) {
    return '';
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return value;
  }

  return formatEditableMoneyFromUsd(
    usdMoneyFromDisplay(parsed, previousCurrency, previousUsdToKhrExchangeRate),
    nextCurrency,
    nextUsdToKhrExchangeRate,
  );
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
