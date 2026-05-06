import { describe, expect, test } from 'vitest';
import {
  deriveChartTimeframeBoundary,
  deriveEstimatedTimeframeBatchCount,
  isChartTimeframeSatisfied,
} from './chart-timeframe';

describe('chart timeframe helpers', () => {
  test('uses the last seven days as the Recent boundary', () => {
    expect(deriveChartTimeframeBoundary('2026-04-13T12:00:00.000Z', 'Recent')?.toISOString()).toBe('2026-04-06T12:00:00.000Z');
  });

  test('requires older hydration when Recent does not yet cover seven days', () => {
    const boundary = deriveChartTimeframeBoundary('2026-04-13T12:00:00.000Z', 'Recent');

    expect(isChartTimeframeSatisfied({
      boundary,
      hasOlder: true,
      loadedIntervalCount: 3,
      oldestIntervalAt: '2026-04-10T12:00:00.000Z',
      timeframe: 'Recent',
    })).toBe(false);
    expect(deriveEstimatedTimeframeBatchCount({
      batchSize: 10,
      boundary,
      intervalCount: 30,
      latestObservedAt: '2026-04-13T12:00:00.000Z',
      loadedIntervalCount: 3,
      oldestLoadedAt: '2026-04-10T12:00:00.000Z',
      timeframe: 'Recent',
    })).toBeGreaterThan(0);
  });

  test('requires at least five reports for Recent when older reports exist', () => {
    const boundary = deriveChartTimeframeBoundary('2026-04-13T12:00:00.000Z', 'Recent');

    expect(isChartTimeframeSatisfied({
      boundary,
      hasOlder: true,
      loadedIntervalCount: 4,
      oldestIntervalAt: '2026-04-05T12:00:00.000Z',
      timeframe: 'Recent',
    })).toBe(false);
    expect(isChartTimeframeSatisfied({
      boundary,
      hasOlder: true,
      loadedIntervalCount: 5,
      oldestIntervalAt: '2026-04-05T12:00:00.000Z',
      timeframe: 'Recent',
    })).toBe(true);
  });

  test('can require Recent to satisfy an explicit custom boundary', () => {
    expect(isChartTimeframeSatisfied({
      boundary: new Date('2026-02-01T00:00:00.000Z'),
      hasOlder: true,
      loadedIntervalCount: 20,
      oldestIntervalAt: '2026-03-01T00:00:00.000Z',
      respectRecentBoundary: true,
      timeframe: 'Recent',
    })).toBe(false);

    expect(isChartTimeframeSatisfied({
      boundary: new Date('2026-02-01T00:00:00.000Z'),
      hasOlder: true,
      loadedIntervalCount: 40,
      oldestIntervalAt: '2026-01-15T00:00:00.000Z',
      respectRecentBoundary: true,
      timeframe: 'Recent',
    })).toBe(true);
  });
});
