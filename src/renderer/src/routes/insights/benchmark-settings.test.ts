import { describe, expect, test } from 'vitest';
import { formatBenchmarkComparisonValue, formatMetricValue } from '../insights/benchmark-settings';

describe('benchmark settings formatting', () => {
  test('hides non-finite benchmark metric values as missing data', () => {
    expect(formatMetricValue(Number.NaN, 'ms')).toBe('No data');
    expect(formatMetricValue(Number.POSITIVE_INFINITY, 'percent')).toBe('No data');
    expect(formatBenchmarkComparisonValue(Number.NaN)).toBe('No data');
    expect(formatBenchmarkComparisonValue(Number.NEGATIVE_INFINITY)).toBe('No data');
  });

  test('formats finite benchmark metric values', () => {
    expect(formatMetricValue(123.6, 'ms')).toBe('124 ms');
    expect(formatMetricValue(12.34, 'percent')).toBe('12.3%');
    expect(formatMetricValue(1, 'boolean')).toBe('Yes');
    expect(formatBenchmarkComparisonValue(42.24)).toBe('42.2');
  });
});
