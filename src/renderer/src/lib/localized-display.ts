import type { AppLanguage } from '@shared/inventory';
import type { SenaLeadTimeVariabilityClass } from '@shared/sena';
import type { ChartTimeframe } from '@/components/system/chart-timeframe';
import { getTranslation, translateUiLiteral } from './translations';

const leadTimeVariabilityLabels: Record<SenaLeadTimeVariabilityClass, string> = {
  very_tight: 'Very tight',
  tight: 'Tight',
  normal: 'Normal',
  wide: 'Wide',
  very_wide: 'Very wide',
};

const leadTimeVariabilityDescriptions: Record<SenaLeadTimeVariabilityClass, string> = {
  very_tight: 'Delivery timing is very steady.',
  tight: 'Delivery timing moves a little around the usual range.',
  normal: 'Delivery timing has routine variation.',
  wide: 'Delivery timing moves noticeably around the usual range.',
  very_wide: 'Delivery timing is unstable and often shifts.',
};

const chartTimeframeLabels: Record<ChartTimeframe, string> = {
  Recent: 'Recent',
  '1M': '1M',
  '3M': '3M',
  YTD: 'YTD',
  '1Y': '1Y',
  MAX: 'MAX',
};

function formatTitleCaseLabel(value: string) {
  return value
    .split(/[_\s-]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function translateChartTimeframeLabel(language: AppLanguage, value: ChartTimeframe) {
  return translateUiLiteral(language, chartTimeframeLabels[value]);
}

export function translateLeadTimeVariabilityLabel(
  language: AppLanguage,
  value: SenaLeadTimeVariabilityClass,
) {
  return translateUiLiteral(language, leadTimeVariabilityLabels[value]);
}

export function translateLeadTimeVariabilityDescription(
  language: AppLanguage,
  value: SenaLeadTimeVariabilityClass,
) {
  return translateUiLiteral(language, leadTimeVariabilityDescriptions[value]);
}

export function translateRiskLevelLabel(language: AppLanguage, value: string) {
  return translateUiLiteral(language, value);
}

export function translateRegimeLabel(language: AppLanguage, regime: string) {
  const normalized = regime.trim().toLowerCase().replace(/[\s-]+/g, '_');
  switch (normalized) {
    case 'normal':
      return getTranslation(language, 'stockUpdateRegimeNormal');
    case 'promo':
      return getTranslation(language, 'stockUpdateRegimePromo');
    case 'spike':
      return getTranslation(language, 'stockUpdateRegimeSpike');
    case 'lull':
      return getTranslation(language, 'stockUpdateRegimeLull');
    case 'stockout_constrained':
      return getTranslation(language, 'stockUpdateRegimeStockout');
    case 'correction':
      return getTranslation(language, 'stockUpdateRegimeCorrection');
    default:
      return translateUiLiteral(language, formatTitleCaseLabel(regime));
  }
}

export function translateObservationEvidenceLabel(language: AppLanguage, value: string) {
  return translateUiLiteral(language, value);
}
