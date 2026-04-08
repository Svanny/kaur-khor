import { describe, expect, test } from 'vitest';
import {
  formatSenaReorderQuantity,
  isSenaReorderQuantityIssued,
} from './sena-reorder-quantity';

const baseRecommendation = {
  recommendedUnits: 14.2,
  ungatedRecommendedUnits: 14.2,
  likelyRangeLow: 10,
  likelyRangeHigh: 18,
  needProbability: 0.78,
  recommendationIssued: true,
  recommendationQuantile: 0.7,
  intervalLowQuantile: 0.1,
  intervalHighQuantile: 0.9,
  needProbabilityGate: 0.5,
  reviewDelayDays: 0,
};

describe('sena reorder quantity display', () => {
  test('issues only when need probability clears the gate and Q70 is positive', () => {
    expect(isSenaReorderQuantityIssued(baseRecommendation)).toBe(true);
    expect(isSenaReorderQuantityIssued({
      ...baseRecommendation,
      needProbability: 0.5,
    })).toBe(false);
    expect(isSenaReorderQuantityIssued({
      ...baseRecommendation,
      recommendedUnits: 0,
      ungatedRecommendedUnits: 0,
      needProbability: 1,
    })).toBe(false);
  });

  test('does not render a strong recommendation when Q70 is zero even if need probability is high', () => {
    const display = formatSenaReorderQuantity({
      ...baseRecommendation,
      recommendedUnits: 0,
      ungatedRecommendedUnits: 0,
      likelyRangeLow: 0,
      likelyRangeHigh: 0,
      needProbability: 1,
    }, 'en');

    expect(display.recommendationIssued).toBe(false);
    expect(display.recommendedOrderLabel).toBe('No order quantity recommended');
    expect(display.quietLabel).toBe('Keep watching · order likelihood 100%');
  });
});
