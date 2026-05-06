import type { AppLanguage } from '@shared/inventory';
import type { SenaReorderQuantityRecommendation } from '@shared/sena';
import { formatWholeNumber, localeFor } from '@/lib/format';
import { translateUiLiteral } from '@/lib/translations';

export interface SenaReorderQuantityDisplay {
  hasBackendRecommendation: boolean;
  recommendationIssued: boolean;
  recommendedUnits: number;
  recommendedUnitsLabel: string;
  recommendedOrderLabel: string;
  optionalOrderLabel: string | null;
  compactLabel: string | null;
  likelyRangeLabel: string;
  likelyRangeValueLabel: string;
  needProbabilityLabel: string;
  needProbabilityValueLabel: string;
  quietLabel: string;
  protectionHorizonLabel: string;
  policyBasisLabel: string;
}

function ceilUnits(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return 0;
  }
  return Math.ceil(Math.max(0, value));
}

function formatPercent(value: number | null | undefined, language: AppLanguage) {
  if (value == null || !Number.isFinite(value)) {
    return '—';
  }
  return new Intl.NumberFormat(localeFor(language), {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatUnits(value: number, language: AppLanguage) {
  return translateUiLiteral(language, '{count} units', {
    count: formatWholeNumber(value, language),
  });
}

function formatCompactUnits(value: number, language: AppLanguage) {
  return `${formatWholeNumber(value, language)}u`;
}

export function isSenaReorderQuantityIssued(recommendation: SenaReorderQuantityRecommendation | null | undefined) {
  if (!recommendation) {
    return false;
  }
  return (
    recommendation.needProbability > recommendation.needProbabilityGate &&
    recommendation.ungatedRecommendedUnits > 0
  );
}

export function formatSenaReorderQuantity(
  recommendation: SenaReorderQuantityRecommendation | null | undefined,
  language: AppLanguage,
  fallbackRecommendedUnits?: number | null,
): SenaReorderQuantityDisplay {
  const hasBackendRecommendation = recommendation != null;
  const recommendationIssuedFromPolicy = isSenaReorderQuantityIssued(recommendation);
  const recommendedUnits = hasBackendRecommendation
    ? ceilUnits(recommendationIssuedFromPolicy ? recommendation.recommendedUnits : recommendation.ungatedRecommendedUnits)
    : ceilUnits(fallbackRecommendedUnits);
  const recommendationIssued = hasBackendRecommendation
    ? recommendationIssuedFromPolicy
    : recommendedUnits > 0;
  const rangeLow = ceilUnits(recommendation?.likelyRangeLow);
  const rangeHigh = ceilUnits(recommendation?.likelyRangeHigh);
  const likelyRangeValueLabel = translateUiLiteral(language, '{low}-{high} units', {
    low: formatWholeNumber(rangeLow, language),
    high: formatWholeNumber(Math.max(rangeLow, rangeHigh), language),
  });
  const needProbability = formatPercent(recommendation?.needProbability, language);
  const recommendedUnitsLabel = formatUnits(recommendedUnits, language);
  const optionalOrderLabel = !recommendationIssued && recommendedUnits > 0
    ? translateUiLiteral(language, 'Optional order {count} units', {
        count: formatWholeNumber(recommendedUnits, language),
      })
    : null;
  const recommendedOrderLabel = recommendationIssued
    ? translateUiLiteral(language, 'Recommended order {count} units', {
        count: formatWholeNumber(recommendedUnits, language),
      })
    : optionalOrderLabel
      ? translateUiLiteral(language, 'No order quantity recommended · optional order {count} units', {
          count: formatWholeNumber(recommendedUnits, language),
        })
      : translateUiLiteral(language, 'No order quantity recommended');
  const likelyRangeLabel = hasBackendRecommendation
    ? translateUiLiteral(language, 'Recommended range {low}-{high} units', {
        low: formatWholeNumber(rangeLow, language),
        high: formatWholeNumber(Math.max(rangeLow, rangeHigh), language),
      })
    : fallbackRecommendedUnits != null && recommendedUnits > 0
      ? translateUiLiteral(language, 'Estimated recommendation {count} units', {
          count: formatWholeNumber(recommendedUnits, language),
        })
      : translateUiLiteral(language, 'Recommended range pending');
  const needProbabilityLabel = hasBackendRecommendation
    ? translateUiLiteral(language, 'Order likelihood {value}', { value: needProbability })
    : translateUiLiteral(language, 'Order likelihood pending');
  const quietLabel = hasBackendRecommendation
    ? optionalOrderLabel
      ? translateUiLiteral(language, 'Keep watching · optional order {count} units · order likelihood {value}', {
          count: formatWholeNumber(recommendedUnits, language),
          value: needProbability,
        })
      : translateUiLiteral(language, 'Keep watching · order likelihood {value}', { value: needProbability })
    : recommendedUnits > 0
      ? translateUiLiteral(language, 'Estimated recommendation {count} units', {
          count: formatWholeNumber(recommendedUnits, language),
        })
      : translateUiLiteral(language, 'Recommendation pending · enter quantity manually');

  return {
    hasBackendRecommendation,
    recommendationIssued,
    recommendedUnits,
    recommendedUnitsLabel,
    recommendedOrderLabel,
    optionalOrderLabel,
    compactLabel: recommendationIssued
      ? `Rec. ${formatCompactUnits(recommendedUnits, language)}${hasBackendRecommendation ? ` · likely ${needProbability}` : ''}`
      : hasBackendRecommendation
        ? quietLabel
        : quietLabel,
    likelyRangeLabel,
    likelyRangeValueLabel,
    needProbabilityLabel,
    needProbabilityValueLabel: needProbability,
    quietLabel,
    protectionHorizonLabel: translateUiLiteral(
      language,
      'Protection horizon: lead time + {days}d review delay',
      { days: formatWholeNumber(ceilUnits(recommendation?.reviewDelayDays), language) },
    ),
    policyBasisLabel: translateUiLiteral(language, 'Policy basis: on hand + in transit'),
  };
}
