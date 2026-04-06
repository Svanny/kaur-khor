import { describe, expect, it } from 'vitest';
import { shouldPruneTimeframeTransition } from './analysis-timeframe';

describe('shouldPruneTimeframeTransition', () => {
  const latestObservedAt = '2026-04-03T08:00:00.000Z';

  it('prunes when switching from broader to narrower timeframe', () => {
    expect(
      shouldPruneTimeframeTransition({
        latestObservedAt,
        nextTimeframe: 'Recent',
        previousTimeframe: 'MAX',
      }),
    ).toBe(true);
    expect(
      shouldPruneTimeframeTransition({
        latestObservedAt,
        nextTimeframe: '1M',
        previousTimeframe: '3M',
      }),
    ).toBe(true);
    expect(
      shouldPruneTimeframeTransition({
        latestObservedAt,
        nextTimeframe: 'YTD',
        previousTimeframe: '1Y',
      }),
    ).toBe(true);
  });

  it('does not prune when switching from narrower to broader timeframe', () => {
    expect(
      shouldPruneTimeframeTransition({
        latestObservedAt,
        nextTimeframe: 'MAX',
        previousTimeframe: 'Recent',
      }),
    ).toBe(false);
    expect(
      shouldPruneTimeframeTransition({
        latestObservedAt,
        nextTimeframe: '3M',
        previousTimeframe: '1M',
      }),
    ).toBe(false);
    expect(
      shouldPruneTimeframeTransition({
        latestObservedAt,
        nextTimeframe: '1Y',
        previousTimeframe: 'YTD',
      }),
    ).toBe(false);
  });
});
