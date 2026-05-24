import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultChartLayoutPreferences } from '@/lib/chart/chart-layout-preferences';
import { getTranslation } from '@/lib/localization/translations';
import { SkuDetailLedger } from './ledger';
import { defaultTradingChartIndicators } from './trading-chart-model';

const localStorageState = new Map<string, string>();
const localStorageMock = {
  getItem(key: string) {
    return localStorageState.get(key) ?? null;
  },
  setItem(key: string, value: string) {
    localStorageState.set(key, value);
  },
  removeItem(key: string) {
    localStorageState.delete(key);
  },
  clear() {
    localStorageState.clear();
  },
};

vi.stubGlobal('localStorage', localStorageMock);

function scopedPageValueKey(scope: string, key: string) {
  return `$scoped:${JSON.stringify([scope, key])}`;
}

vi.mock('@/state/preferences', () => ({
  usePreferences: () => ({
    t: (key: string) => getTranslation('en', key as never),
  }),
}));

vi.mock('./trading-chart-model', async () => {
  const actual = await vi.importActual<typeof import('./trading-chart-model')>('./trading-chart-model');
  const defaults = actual.defaultTradingChartIndicators();
  const availability = Object.fromEntries(Object.keys(defaults).map((key) => [key, true])) as Record<string, boolean>;
  return {
    ...actual,
    deriveTradingChartModel: vi.fn(() => ({
      points: [],
      pointByIntervalIndex: new Map(),
      pointByTimeKey: new Map(),
      availability,
    })),
  };
});

vi.mock('@/components/system/trading-chart/chart', () => ({
  SkuTradingChart: ({
    chartResolution,
    chartRenderHeight,
    customChartResolution,
    customTimeframeRange,
    defaultIndicatorSettings,
    fillAvailableHeight,
    indicatorSettings,
    onChartResolutionChange,
    onSaveDefaultIndicatorSettings,
    onVisibleDateRangeChange,
    onPaneHeightsChange,
    setIndicatorSettings,
    timeframe,
  }: {
    chartResolution: 'H' | '1D' | '1W' | '1M' | '3M' | '1Y' | 'Custom';
    chartRenderHeight: string | number | undefined;
    customChartResolution: { amount: number; unit: 'm' | 'H' | 'D' | 'W' | 'M' | 'Y'; expression: string } | null;
    customTimeframeRange: { startAt: string; endAt: string } | null;
    defaultIndicatorSettings: ReturnType<typeof defaultTradingChartIndicators>;
    fillAvailableHeight: boolean;
    indicatorSettings: ReturnType<typeof defaultTradingChartIndicators>;
    onChartResolutionChange: (value: 'H' | '1D' | '1W' | '1M' | '3M' | '1Y' | 'Custom', custom: { amount: number; unit: 'm' | 'H' | 'D' | 'W' | 'M' | 'Y'; expression: string } | null) => void;
    onSaveDefaultIndicatorSettings: (next: ReturnType<typeof defaultTradingChartIndicators>) => void;
    onVisibleDateRangeChange: (range: { startAt: string; endAt: string } | null) => void;
    onPaneHeightsChange: (paneHeights: Record<string, number>, source: 'manual') => void;
    setIndicatorSettings: (next: ReturnType<typeof defaultTradingChartIndicators>) => void;
    timeframe: string;
  }) => (
    <div>
      <div data-testid="current-demand">{String(indicatorSettings.demand.enabled)}</div>
      <div data-testid="current-receipts">{String(indicatorSettings.receipts.enabled)}</div>
      <div data-testid="default-receipts">{String(defaultIndicatorSettings.receipts.enabled)}</div>
      <div data-testid="fill-available-height">{String(fillAvailableHeight)}</div>
      <div data-testid="chart-render-height">{String(chartRenderHeight ?? 'none')}</div>
      <div data-testid="current-timeframe">{timeframe}</div>
      <div data-testid="current-resolution">{customChartResolution?.expression ?? chartResolution}</div>
      <div data-testid="current-range">{customTimeframeRange?.startAt ?? 'none'}</div>
      <button
        type="button"
        onClick={() => {
          const next = structuredClone(indicatorSettings);
          next.demand.enabled = true;
          setIndicatorSettings(next);
        }}
      >
        Enable demand
      </button>
      <button
        type="button"
        onClick={() => {
          const next = structuredClone(defaultIndicatorSettings);
          next.receipts.enabled = true;
          onSaveDefaultIndicatorSettings(next);
        }}
      >
        Save receipts default
      </button>
      <button
        type="button"
        onClick={() => {
          onChartResolutionChange('1W', null);
          onVisibleDateRangeChange({
            startAt: '2026-02-01T00:00:00.000Z',
            endAt: '2026-03-01T00:00:00.000Z',
          });
          onPaneHeightsChange({
            main: 320,
            'pane-1': 120,
          }, 'manual');
        }}
      >
        Update layout preferences
      </button>
    </div>
  ),
}));

function buildModel(skuId: string) {
  return {
    identity: {
      skuId,
      name: `SKU ${skuId}`,
    },
  } as never;
}

describe('SkuDetailLedger', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: localStorageMock,
    });
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it('labels the chart window eyebrow as chart view', () => {
    render(
      <SkuDetailLedger
        chartLayoutPreferences={defaultChartLayoutPreferences()}
        hasOlderIntervals={false}
        isHydratingDetails={false}
        isLoadingOlderIntervals={false}
        loadOlderIntervals={async () => null}
        model={buildModel('sku-1')}
        onResetCharts={vi.fn()}
        onTimeframeChange={vi.fn()}
        selectedIntervalIndex={null}
        setSelectedIntervalIndex={vi.fn()}
        timeframe="Recent"
      />,
    );

    expect(screen.getByText('Chart View')).toBeInTheDocument();
    expect(screen.queryByText('កខ')).not.toBeInTheDocument();
  });

  it('uses the shared fixed chart-window height in the non-expanded ledger', () => {
    render(
      <SkuDetailLedger
        chartLayoutPreferences={defaultChartLayoutPreferences()}
        hasOlderIntervals={false}
        isHydratingDetails={false}
        isLoadingOlderIntervals={false}
        loadOlderIntervals={async () => null}
        model={buildModel('sku-1')}
        onResetCharts={vi.fn()}
        onTimeframeChange={vi.fn()}
        selectedIntervalIndex={null}
        setSelectedIntervalIndex={vi.fn()}
        timeframe="Recent"
      />,
    );

    expect(screen.getByTestId('fill-available-height').textContent).toBe('true');
    expect(screen.getByTestId('chart-render-height').textContent).toBe('84svh');
    expect(screen.getByTestId('chart-render-height').closest('section')).toHaveStyle({
      height: 'calc(84svh + 16rem)',
      maxHeight: 'calc(84svh + 16rem)',
    });
    expect(screen.getByTestId('chart-render-height').closest('section')).toHaveClass('overflow-hidden');
  });

  it('remembers chart settings for same sku across remounts', async () => {
    const user = userEvent.setup();
    const props = {
      chartLayoutPreferences: defaultChartLayoutPreferences(),
      hasOlderIntervals: false,
      isHydratingDetails: false,
      isLoadingOlderIntervals: false,
      loadOlderIntervals: async () => null,
      onResetCharts: vi.fn(),
      onTimeframeChange: vi.fn(),
      selectedIntervalIndex: null,
      setSelectedIntervalIndex: vi.fn(),
      timeframe: 'Recent' as const,
    };

    const firstRender = render(<SkuDetailLedger {...props} model={buildModel('sku-1')} />);

    expect(screen.getByTestId('current-demand').textContent).toBe('false');
    expect(screen.getByTestId('default-receipts').textContent).toBe('false');

    await user.click(screen.getByRole('button', { name: 'Enable demand' }));
    await user.click(screen.getByRole('button', { name: 'Save receipts default' }));

    await waitFor(() => {
      expect(screen.getByTestId('current-demand').textContent).toBe('true');
      expect(screen.getByTestId('default-receipts').textContent).toBe('true');
    });

    firstRender.unmount();

    render(<SkuDetailLedger {...props} model={buildModel('sku-1')} />);

    expect(screen.getByTestId('current-demand').textContent).toBe('true');
    expect(screen.getByTestId('default-receipts').textContent).toBe('true');
  });

  it('scopes remembered chart settings by sku', async () => {
    const user = userEvent.setup();
    const props = {
      chartLayoutPreferences: defaultChartLayoutPreferences(),
      hasOlderIntervals: false,
      isHydratingDetails: false,
      isLoadingOlderIntervals: false,
      loadOlderIntervals: async () => null,
      onResetCharts: vi.fn(),
      onTimeframeChange: vi.fn(),
      selectedIntervalIndex: null,
      setSelectedIntervalIndex: vi.fn(),
      timeframe: 'Recent' as const,
    };

    const firstRender = render(<SkuDetailLedger {...props} model={buildModel('sku-1')} />);
    await user.click(screen.getByRole('button', { name: 'Enable demand' }));
    firstRender.unmount();

    render(<SkuDetailLedger {...props} model={buildModel('sku-2')} />);

    expect(screen.getByTestId('current-demand').textContent).toBe('false');
    expect(screen.getByTestId('default-receipts').textContent).toBe('false');
  });

  it('applies saved subtype defaults across skus without sharing per-sku current settings', async () => {
    const user = userEvent.setup();
    const props = {
      chartLayoutPreferences: defaultChartLayoutPreferences(),
      hasOlderIntervals: false,
      isHydratingDetails: false,
      isLoadingOlderIntervals: false,
      loadOlderIntervals: async () => null,
      onResetCharts: vi.fn(),
      onTimeframeChange: vi.fn(),
      selectedIntervalIndex: null,
      setSelectedIntervalIndex: vi.fn(),
      timeframe: 'Recent' as const,
    };

    const firstRender = render(<SkuDetailLedger {...props} model={buildModel('sku-1')} />);
    await user.click(screen.getByRole('button', { name: 'Save receipts default' }));
    firstRender.unmount();

    render(<SkuDetailLedger {...props} model={buildModel('sku-2')} />);

    expect(screen.getByTestId('current-demand').textContent).toBe('false');
    expect(screen.getByTestId('default-receipts').textContent).toBe('true');
    expect(screen.getByTestId('current-receipts').textContent).toBe('true');
  });

  it('forwards live layout preference changes from the chart', async () => {
    const user = userEvent.setup();
    const onChartLayoutPreferencesChange = vi.fn();
    render(
      <SkuDetailLedger
        chartLayoutPreferences={defaultChartLayoutPreferences()}
        hasOlderIntervals={false}
        isHydratingDetails={false}
        isLoadingOlderIntervals={false}
        loadOlderIntervals={async () => null}
        model={buildModel('sku-1')}
        onChartLayoutPreferencesChange={onChartLayoutPreferencesChange}
        onResetCharts={vi.fn()}
        onTimeframeChange={vi.fn()}
        selectedIntervalIndex={null}
        setSelectedIntervalIndex={vi.fn()}
        timeframe="Recent"
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Update layout preferences' }));

    expect(onChartLayoutPreferencesChange).toHaveBeenNthCalledWith(
      1,
      { visibleDateRange: { startAt: '2026-02-01T00:00:00.000Z', endAt: '2026-03-01T00:00:00.000Z' } },
      undefined,
    );
    expect(onChartLayoutPreferencesChange).toHaveBeenNthCalledWith(2, { paneHeights: { main: 320, 'pane-1': 120 }, paneHeightsSource: 'manual' });
  });

  it('debounces indicator setting persistence to page memory', async () => {
    vi.useFakeTimers();
    try {
      const props = {
        chartLayoutPreferences: defaultChartLayoutPreferences(),
        hasOlderIntervals: false,
        isHydratingDetails: false,
        isLoadingOlderIntervals: false,
        loadOlderIntervals: async () => null,
        onResetCharts: vi.fn(),
        onTimeframeChange: vi.fn(),
        selectedIntervalIndex: null,
        setSelectedIntervalIndex: vi.fn(),
        timeframe: 'Recent' as const,
      };

      render(<SkuDetailLedger {...props} model={buildModel('sku-1')} />);

      fireEvent.click(screen.getByRole('button', { name: 'Enable demand' }));

      const persistedBeforeDebounce = JSON.parse(window.localStorage.getItem('kaur-khor:page-state-memory:v1') ?? '{}');
      expect(persistedBeforeDebounce.catalog?.values?.[scopedPageValueKey('sku:sku-1', 'chartSettings')]?.demand?.enabled).toBe(false);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(119);
      });
      const persistedStillBuffered = JSON.parse(window.localStorage.getItem('kaur-khor:page-state-memory:v1') ?? '{}');
      expect(persistedStillBuffered.catalog?.values?.[scopedPageValueKey('sku:sku-1', 'chartSettings')]?.demand?.enabled).toBe(false);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });

      const persisted = JSON.parse(window.localStorage.getItem('kaur-khor:page-state-memory:v1') ?? '{}');
      expect(persisted.catalog?.values?.[scopedPageValueKey('sku:sku-1', 'chartSettings')]?.demand?.enabled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
