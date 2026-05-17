import { describe, expect, it, vi } from 'vitest';
import {
  chartLayoutPreferencesEqual,
  defaultChartLayoutPreferences,
  mergeChartLayoutPreferencesWithViewportSync,
  readEntityChartLayoutPreferences,
  readSubtypeDefaultChartLayoutPreferences,
  resolveEntityChartLayoutPreferences,
  writeEntityChartLayoutPreferences,
  writeSubtypeDefaultChartLayoutPreferences,
} from './chart-layout-preferences';

describe('mergeChartLayoutPreferencesWithViewportSync', () => {
  it('promotes an extended recent viewport into a custom timeframe range', () => {
    const current = {
      ...defaultChartLayoutPreferences(),
      visibleDateRange: {
        startAt: '2026-03-10T00:00:00.000Z',
        endAt: '2026-03-20T00:00:00.000Z',
      },
    };

    const result = mergeChartLayoutPreferencesWithViewportSync(
      current,
      {
        visibleDateRange: {
          startAt: '2026-03-01T00:00:00.000Z',
          endAt: '2026-03-20T00:00:00.000Z',
        },
      },
      'Recent',
    );

    expect(result.promotedCustomTimeframeRange).toEqual({
      startAt: '2026-03-01T00:00:00.000Z',
      endAt: '2026-03-20T00:00:00.000Z',
    });
    expect(result.preferences.customTimeframeRange).toEqual(result.promotedCustomTimeframeRange);
  });

  it('promotes an extended fixed-timeframe viewport into a custom timeframe range', () => {
    const current = {
      ...defaultChartLayoutPreferences(),
      timeframe: '1M' as const,
      visibleDateRange: {
        startAt: '2026-03-10T00:00:00.000Z',
        endAt: '2026-03-20T00:00:00.000Z',
      },
    };

    const result = mergeChartLayoutPreferencesWithViewportSync(
      current,
      {
        visibleDateRange: {
          startAt: '2026-03-01T00:00:00.000Z',
          endAt: '2026-03-20T00:00:00.000Z',
        },
      },
      '1M',
    );

    expect(result.promotedCustomTimeframeRange).toEqual({
      startAt: '2026-03-01T00:00:00.000Z',
      endAt: '2026-03-20T00:00:00.000Z',
    });
    expect(result.preferences.customTimeframeRange).toEqual(result.promotedCustomTimeframeRange);
  });

  it('does not promote the first user-driven fixed-timeframe viewport without a prior baseline', () => {
    const current = {
      ...defaultChartLayoutPreferences(),
      timeframe: 'YTD' as const,
      visibleDateRange: null,
    };

    const result = mergeChartLayoutPreferencesWithViewportSync(
      current,
      {
        visibleDateRange: {
          startAt: '2026-01-01T00:00:00.000Z',
          endAt: '2026-03-20T00:00:00.000Z',
        },
      },
      'YTD',
      { syncCustomTimeframeRange: true },
    );

    expect(result.promotedCustomTimeframeRange).toBeNull();
    expect(result.preferences.customTimeframeRange).toBeNull();
    expect(result.preferences.visibleDateRange).toEqual({
      startAt: '2026-01-01T00:00:00.000Z',
      endAt: '2026-03-20T00:00:00.000Z',
    });
  });

  it('promotes a first persisted viewport update when the chart provides a prior emitted baseline', () => {
    const current = {
      ...defaultChartLayoutPreferences(),
      timeframe: 'YTD' as const,
      visibleDateRange: null,
    };

    const result = mergeChartLayoutPreferencesWithViewportSync(
      current,
      {
        visibleDateRange: {
          startAt: '2025-12-15T00:00:00.000Z',
          endAt: '2026-03-20T00:00:00.000Z',
        },
      },
      'YTD',
      {
        previousVisibleDateRange: {
          startAt: '2026-01-01T00:00:00.000Z',
          endAt: '2026-03-20T00:00:00.000Z',
        },
        syncCustomTimeframeRange: true,
      },
    );

    expect(result.promotedCustomTimeframeRange).toEqual({
      startAt: '2025-12-15T00:00:00.000Z',
      endAt: '2026-03-20T00:00:00.000Z',
    });
    expect(result.preferences.customTimeframeRange).toEqual(result.promotedCustomTimeframeRange);
  });

  it('does not promote the first passive fixed-timeframe viewport into a custom timeframe range', () => {
    const current = {
      ...defaultChartLayoutPreferences(),
      timeframe: '1Y' as const,
      visibleDateRange: null,
    };

    const result = mergeChartLayoutPreferencesWithViewportSync(
      current,
      {
        visibleDateRange: {
          startAt: '2025-03-20T00:00:00.000Z',
          endAt: '2026-03-20T00:00:00.000Z',
        },
      },
      '1Y',
      { syncCustomTimeframeRange: false },
    );

    expect(result.promotedCustomTimeframeRange).toBeNull();
    expect(result.preferences.customTimeframeRange).toBeNull();
    expect(result.preferences.visibleDateRange).toEqual({
      startAt: '2025-03-20T00:00:00.000Z',
      endAt: '2026-03-20T00:00:00.000Z',
    });
  });

  it('does not promote all-time viewport movement into a custom timeframe range', () => {
    const current = {
      ...defaultChartLayoutPreferences(),
      timeframe: 'MAX' as const,
      visibleDateRange: {
        startAt: '2026-03-10T00:00:00.000Z',
        endAt: '2026-03-20T00:00:00.000Z',
      },
    };

    const result = mergeChartLayoutPreferencesWithViewportSync(
      current,
      {
        visibleDateRange: {
          startAt: '2026-03-01T00:00:00.000Z',
          endAt: '2026-03-20T00:00:00.000Z',
        },
      },
      'MAX',
    );

    expect(result.promotedCustomTimeframeRange).toBeNull();
    expect(result.preferences.customTimeframeRange).toBeNull();
    expect(result.preferences.visibleDateRange).toEqual({
      startAt: '2026-03-01T00:00:00.000Z',
      endAt: '2026-03-20T00:00:00.000Z',
    });
  });

  it('keeps an existing custom timeframe range synced to later viewport updates', () => {
    const current = {
      ...defaultChartLayoutPreferences(),
      customTimeframeRange: {
        startAt: '2026-03-01T00:00:00.000Z',
        endAt: '2026-03-20T00:00:00.000Z',
      },
      visibleDateRange: {
        startAt: '2026-03-01T00:00:00.000Z',
        endAt: '2026-03-20T00:00:00.000Z',
      },
    };

    const result = mergeChartLayoutPreferencesWithViewportSync(
      current,
      {
        visibleDateRange: {
          startAt: '2026-03-03T00:00:00.000Z',
          endAt: '2026-03-18T00:00:00.000Z',
        },
      },
      'Recent',
    );

    expect(result.promotedCustomTimeframeRange).toEqual({
      startAt: '2026-03-03T00:00:00.000Z',
      endAt: '2026-03-18T00:00:00.000Z',
    });
    expect(result.preferences.customTimeframeRange).toEqual(result.promotedCustomTimeframeRange);
  });

  it('keeps an existing custom timeframe range stable for passive viewport observations', () => {
    const current = {
      ...defaultChartLayoutPreferences(),
      customTimeframeRange: {
        startAt: '2026-03-01T00:00:00.000Z',
        endAt: '2026-03-20T00:00:00.000Z',
      },
      visibleDateRange: {
        startAt: '2026-03-01T00:00:00.000Z',
        endAt: '2026-03-20T00:00:00.000Z',
      },
    };

    const result = mergeChartLayoutPreferencesWithViewportSync(
      current,
      {
        visibleDateRange: {
          startAt: '2026-02-28T00:00:00.000Z',
          endAt: '2026-03-21T00:00:00.000Z',
        },
      },
      'Recent',
      { syncCustomTimeframeRange: false },
    );

    expect(result.promotedCustomTimeframeRange).toBeNull();
    expect(result.preferences.visibleDateRange).toEqual({
      startAt: '2026-02-28T00:00:00.000Z',
      endAt: '2026-03-21T00:00:00.000Z',
    });
    expect(result.preferences.customTimeframeRange).toEqual(current.customTimeframeRange);
  });

  it('does not promote ordinary viewport movement that stays within the previous range', () => {
    const current = {
      ...defaultChartLayoutPreferences(),
      timeframe: '1Y' as const,
      visibleDateRange: {
        startAt: '2026-03-10T00:00:00.000Z',
        endAt: '2026-03-20T00:00:00.000Z',
      },
    };

    const result = mergeChartLayoutPreferencesWithViewportSync(
      current,
      {
        visibleDateRange: {
          startAt: '2026-03-11T00:00:00.000Z',
          endAt: '2026-03-19T00:00:00.000Z',
        },
      },
      '1Y',
    );

    expect(result.promotedCustomTimeframeRange).toBeNull();
    expect(result.preferences.customTimeframeRange).toBeNull();
  });

  it('clears custom state when an explicit custom range clear is merged', () => {
    const current = {
      ...defaultChartLayoutPreferences(),
      customTimeframeRange: {
        startAt: '2026-03-01T00:00:00.000Z',
        endAt: '2026-03-20T00:00:00.000Z',
      },
      visibleDateRange: {
        startAt: '2026-03-01T00:00:00.000Z',
        endAt: '2026-03-20T00:00:00.000Z',
      },
    };

    const result = mergeChartLayoutPreferencesWithViewportSync(
      current,
      {
        customTimeframeRange: null,
        visibleDateRange: null,
      },
      'Recent',
    );

    expect(result.promotedCustomTimeframeRange).toBeNull();
    expect(result.preferences.customTimeframeRange).toBeNull();
    expect(result.preferences.visibleDateRange).toBeNull();
  });
});

describe('chart layout preference storage', () => {
  it('round-trips entity and subtype preferences through storage', () => {
    const subtypeDefaults = {
      ...defaultChartLayoutPreferences(),
      timeframe: '1Y' as const,
    };
    const entityOverride = {
      ...defaultChartLayoutPreferences(),
      timeframe: '3M' as const,
      paneHeights: { inventory: 320 },
      paneHeightsSource: 'manual' as const,
    };

    writeSubtypeDefaultChartLayoutPreferences('service', subtypeDefaults);
    writeEntityChartLayoutPreferences('service', 'service-1', entityOverride);

    expect(readSubtypeDefaultChartLayoutPreferences('service')).toEqual(subtypeDefaults);
    expect(readEntityChartLayoutPreferences('service', 'service-1')).toEqual(entityOverride);
    expect(resolveEntityChartLayoutPreferences('service', 'service-1')).toEqual(entityOverride);
    expect(resolveEntityChartLayoutPreferences('service', 'service-2')).toEqual(subtypeDefaults);
  });

  it('falls back to defaults when storage access throws', () => {
    const localStorageGetter = vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(readSubtypeDefaultChartLayoutPreferences('sku')).toBeNull();
    expect(readEntityChartLayoutPreferences('sku', 'sku-1')).toBeNull();
    expect(resolveEntityChartLayoutPreferences('sku', 'sku-1')).toEqual(defaultChartLayoutPreferences());
    expect(() =>
      writeSubtypeDefaultChartLayoutPreferences('sku', {
        ...defaultChartLayoutPreferences(),
        timeframe: 'MAX',
      }),
    ).not.toThrow();
    expect(() =>
      writeEntityChartLayoutPreferences('sku', 'sku-1', {
        ...defaultChartLayoutPreferences(),
        timeframe: '1M',
      }),
    ).not.toThrow();

    localStorageGetter.mockRestore();
  });

  it('ignores legacy pane heights that were saved without a manual source marker', () => {
    window.localStorage.setItem(
      'kaur-khor:page-state-memory:v1',
      JSON.stringify({
        catalog: {
          values: {
            'sku:sku-1:chartLayout': {
              timeframe: 'Bogus',
              chartResolution: 'Fake',
              customChartResolution: { expression: 'not-a-resolution' },
              customTimeframeRange: { startAt: '2026-03-01T00:00:00.000Z' },
              visibleDateRange: { endAt: '2026-03-05T00:00:00.000Z' },
              paneHeights: { valid: 220, zero: 0, invalid: 'wide' },
            },
          },
        },
      }),
    );

    expect(readEntityChartLayoutPreferences('sku', 'sku-1')).toEqual(defaultChartLayoutPreferences());
    expect(
      chartLayoutPreferencesEqual(
        resolveEntityChartLayoutPreferences('sku', 'sku-1'),
        defaultChartLayoutPreferences(),
      ),
    ).toBe(true);
  });

  it('normalizes manual pane heights before comparison and resolution', () => {
    window.localStorage.setItem(
      'kaur-khor:page-state-memory:v1',
      JSON.stringify({
        catalog: {
          values: {
            'sku:sku-1:chartLayout': {
              ...defaultChartLayoutPreferences(),
              paneHeights: { valid: 220, zero: 0, invalid: 'wide' },
              paneHeightsSource: 'manual',
            },
          },
        },
      }),
    );

    expect(readEntityChartLayoutPreferences('sku', 'sku-1')).toEqual({
      ...defaultChartLayoutPreferences(),
      paneHeights: { valid: 220 },
      paneHeightsSource: 'manual',
    });
    expect(
      chartLayoutPreferencesEqual(
        resolveEntityChartLayoutPreferences('sku', 'sku-1'),
        {
          ...defaultChartLayoutPreferences(),
          paneHeights: { valid: 220 },
          paneHeightsSource: 'manual',
        },
      ),
    ).toBe(true);
  });

  it('drops invalid persisted chart date ranges', () => {
    window.localStorage.setItem(
      'kaur-khor:page-state-memory:v1',
      JSON.stringify({
        catalog: {
          values: {
            'sku:sku-1:chartLayout': {
              ...defaultChartLayoutPreferences(),
              customTimeframeRange: {
                startAt: 'not-a-date',
                endAt: '2026-03-05T00:00:00.000Z',
              },
              visibleDateRange: {
                startAt: '2026-04-05T00:00:00.000Z',
                endAt: '2026-03-05T00:00:00.000Z',
              },
            },
          },
        },
      }),
    );

    expect(readEntityChartLayoutPreferences('sku', 'sku-1')).toEqual(defaultChartLayoutPreferences());
  });
});
