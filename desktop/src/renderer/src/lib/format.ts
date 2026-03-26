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
  return new Intl.NumberFormat(localeFor(language), {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'KHR' ? 0 : 2,
  }).format(value);
}

export function formatNumber(value: number, language: AppLanguage): string {
  return new Intl.NumberFormat(localeFor(language), {
    maximumFractionDigits: 2,
  }).format(value);
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
