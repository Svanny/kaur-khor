import { describe, expect, test } from 'vitest';
import {
  buildDemandChartDomain,
  formatDemandRate,
  intervalDemandPerDay,
} from './sku-detail-demand';

describe('sku-detail demand helpers', () => {
  test('normalizes interval demand totals into per-day samples', () => {
    expect(
      intervalDemandPerDay([
        { durationDays: 14, totalDemandMean: 0.28 },
        { durationDays: 7, totalDemandMean: 0.14 },
      ]),
    ).toEqual([0.02, 0.02]);
  });

  test('keeps sub-unit demand domains tight instead of defaulting to a 0-1 span', () => {
    const domain = buildDemandChartDomain([0.012, 0.018, 0.024], 0.01, 0.021);

    expect(domain.min).toBeLessThan(0.01);
    expect(domain.max).toBeLessThan(0.08);
    expect(domain.sigmaFloor).toBe(0.005);
    expect(domain.bandwidthFloor).toBe(0.005);
  });

  test('formats tiny daily demand with decimals instead of rounding to zero', () => {
    expect(formatDemandRate(0.0137, 'en')).toBe('0.01');
    expect(formatDemandRate(0.0001, 'en')).toBe('0.0001');
    expect(formatDemandRate(2.4, 'en')).toBe('2');
  });
});
