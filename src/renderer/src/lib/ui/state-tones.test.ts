import { describe, expect, test } from 'vitest';
import {
  normalizeRegimeToneKey,
  REGIME_LEGEND_ORDER,
  regimeChartFill,
  regimeTintedSurfaceClassName,
} from './state-tones';

describe('regime semantic tones', () => {
  test('keeps a stable legend order for regime surfaces', () => {
    expect(REGIME_LEGEND_ORDER).toEqual([
      'normal',
      'promo',
      'spike',
      'lull',
      'stockout_constrained',
      'correction',
    ]);
  });

  test('normalizes stockout and correction regime keys', () => {
    expect(normalizeRegimeToneKey('Stockout constrained')).toBe('stockout_constrained');
    expect(normalizeRegimeToneKey('Adjustment correction')).toBe('correction');
  });

  test('returns shared fill colors for strong and muted chart states', () => {
    expect(regimeChartFill('promo', 'strong')).toBe('rgba(248, 224, 184, 0.78)');
    expect(regimeChartFill('promo', 'muted')).toBe('rgba(248, 224, 184, 0.54)');
  });

  test('returns the shared tinted surface classes for legends and chips', () => {
    expect(regimeTintedSurfaceClassName('lull')).toBe('border-emerald-200/80 bg-emerald-50/85');
    expect(regimeTintedSurfaceClassName('unknown')).toBe('border-stone-200/80 bg-stone-50/90');
  });
});
