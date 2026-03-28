import type {
  AppCurrency,
  AppLanguage,
  RankingEntry,
  ServiceRecord,
  SkuRecord,
} from '@shared/inventory';

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
