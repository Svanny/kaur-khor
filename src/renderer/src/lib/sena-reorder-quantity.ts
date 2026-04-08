import type { AppLanguage } from '@shared/inventory';
import type { SenaReorderQuantityRecommendation } from '@shared/sena';
import { formatWholeNumber, localeFor } from '@/lib/format';

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
  return `${formatWholeNumber(value, language)} units`;
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
  const likelyRangeValueLabel = `${formatWholeNumber(rangeLow, language)}-${formatWholeNumber(Math.max(rangeLow, rangeHigh), language)} units`;
  const needProbability = formatPercent(recommendation?.needProbability, language);
  const recommendedUnitsLabel = formatUnits(recommendedUnits, language);
  const optionalOrderLabel = !recommendationIssued && recommendedUnits > 0
    ? `Optional order ${recommendedUnitsLabel}`
    : null;
  const recommendedOrderLabel = recommendationIssued
    ? `Recommended order ${recommendedUnitsLabel}`
    : optionalOrderLabel
      ? `No order quantity recommended · ${optionalOrderLabel.toLowerCase()}`
    : 'No order quantity recommended';
  const likelyRangeLabel = hasBackendRecommendation
    ? `Recommended range ${likelyRangeValueLabel}`
    : fallbackRecommendedUnits != null && recommendedUnits > 0
      ? `Estimated recommendation ${recommendedUnitsLabel}`
      : 'Recommended range pending';
  const needProbabilityLabel = hasBackendRecommendation
    ? `Order likelihood ${needProbability}`
    : 'Order likelihood pending';
  const quietLabel = hasBackendRecommendation
    ? optionalOrderLabel
      ? `Keep watching · ${optionalOrderLabel.toLowerCase()} · order likelihood ${needProbability}`
      : `Keep watching · order likelihood ${needProbability}`
    : recommendedUnits > 0
      ? `Estimated order ${recommendedUnitsLabel}`
      : 'Recommendation pending · enter quantity manually';

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
    protectionHorizonLabel: `Protection horizon: lead time + ${formatWholeNumber(ceilUnits(recommendation?.reviewDelayDays), language)}d review delay`,
    policyBasisLabel: 'Policy basis: on hand + in transit',
  };
}
