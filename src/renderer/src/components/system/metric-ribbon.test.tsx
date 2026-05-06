import { describe, expect, test } from 'vitest';
import { ribbonGridClassName } from './metric-ribbon';

describe('MetricRibbon', () => {
  test('sizes the ribbon grid to the rendered metric count', () => {
    expect(ribbonGridClassName(1)).toBe('xl:grid-cols-1');
    expect(ribbonGridClassName(5)).toBe('xl:grid-cols-5');
    expect(ribbonGridClassName(6)).toBe('xl:grid-cols-6');
    expect(ribbonGridClassName(8)).toBe('xl:grid-cols-8');
    expect(ribbonGridClassName(0)).toBe('xl:grid-cols-1');
    expect(ribbonGridClassName(9)).toBe('xl:grid-cols-8');
  });
});
