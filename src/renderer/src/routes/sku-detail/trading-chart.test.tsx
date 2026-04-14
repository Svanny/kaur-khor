import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { deriveTradingChartMinRenderHeight, SkuTradingChart } from './trading-chart';
import { defaultTradingChartIndicators, type TradingChartIndicatorSettings, type TradingChartModel } from './trading-chart-model';

const chartMockState = vi.hoisted(() => ({
  addSeries: vi.fn(),
  getVisibleLogicalRange: vi.fn(),
  setVisibleLogicalRange: vi.fn(),
  visibleRangeHandler: null as ((range: { from: number; to: number } | null) => void) | null,
}));

vi.mock('@/state/preferences', () => ({
  usePreferences: () => ({
    language: 'en',
  }),
}));

vi.mock('lightweight-charts', async () => {
  chartMockState.addSeries.mockReset();
  chartMockState.getVisibleLogicalRange.mockReset();
  chartMockState.getVisibleLogicalRange.mockReturnValue({ from: 0, to: 1 });
  chartMockState.setVisibleLogicalRange.mockReset();
  chartMockState.visibleRangeHandler = null;
  const pane = {
    getHeight: vi.fn(() => 420),
    getSeries: vi.fn(() => [1]),
    setHeight: vi.fn(),
  };
  const chart = {
    addSeries: chartMockState.addSeries.mockImplementation(() => ({
      setData: vi.fn(),
      createPriceLine: vi.fn(),
      priceToCoordinate: vi.fn((price: number) => price),
    })),
    applyOptions: vi.fn(),
    panes: vi.fn(() => [pane]),
    priceScale: vi.fn(() => ({ applyOptions: vi.fn() })),
    remove: vi.fn(),
    removePane: vi.fn(),
    removeSeries: vi.fn(),
    resize: vi.fn(),
    subscribeClick: vi.fn(),
    unsubscribeClick: vi.fn(),
    subscribeCrosshairMove: vi.fn(),
    unsubscribeCrosshairMove: vi.fn(),
    timeScale: vi.fn(() => ({
      fitContent: vi.fn(),
      timeToCoordinate: vi.fn(() => 100),
      timeToIndex: vi.fn(() => 0),
      getVisibleLogicalRange: chartMockState.getVisibleLogicalRange,
      setVisibleLogicalRange: chartMockState.setVisibleLogicalRange,
      subscribeVisibleLogicalRangeChange: vi.fn((handler: (range: { from: number; to: number } | null) => void) => {
        chartMockState.visibleRangeHandler = handler;
      }),
      unsubscribeVisibleLogicalRangeChange: vi.fn(),
    })),
  };
  return {
    AreaSeries: 'AreaSeries',
    ColorType: { Solid: 'solid' },
    createChart: vi.fn(() => chart),
    HistogramSeries: 'HistogramSeries',
    LineSeries: 'LineSeries',
    LineStyle: { Solid: 0, Dotted: 1, Dashed: 2 },
  };
});

class ResizeObserverMock {
  observe() {}
  disconnect() {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverMock);

const chartModel: TradingChartModel = {
  points: [
    {
      intervalIndex: 0,
      startAt: '2026-03-01T00:00:00.000Z',
      endAt: '2026-03-02T00:00:00.000Z',
      time: 1772409600 as never,
      label: 'Interval 1',
      inventoryMean: 10,
      inventoryLow: 8,
      inventoryHigh: 12,
      reorderPoint: 7,
      safetyStock: 4,
      serviceDemandMean: null,
      retailDemandMean: null,
      receiptsMean: null,
      adjustmentsMean: null,
      inTransitMean: null,
      orderQuantityMean: null,
      price: null,
      dominantRegime: null,
    },
  ],
  pointByIntervalIndex: new Map(),
  pointByTimeKey: new Map(),
  availability: {
    inventory: true,
    uncertainty: true,
    reorderPoint: true,
    safetyStock: true,
    demand: false,
    receipts: false,
    pipeline: false,
    price: false,
    regime: false,
  },
};

chartModel.pointByIntervalIndex.set(0, chartModel.points[0]!);
chartModel.pointByTimeKey.set(String(chartModel.points[0]!.time), chartModel.points[0]!);

function renderChart({
  chartModelOverride,
  hasOlderIntervals = false,
  initialSettings,
  isBusy = false,
  isLoadingOlderIntervals = false,
  loadOlderIntervals = vi.fn(async () => null),
}: {
  chartModelOverride?: TradingChartModel;
  hasOlderIntervals?: boolean;
  initialSettings?: TradingChartIndicatorSettings;
  isBusy?: boolean;
  isLoadingOlderIntervals?: boolean;
  loadOlderIntervals?: () => Promise<unknown>;
} = {}) {
  chartMockState.addSeries.mockClear();
  chartMockState.getVisibleLogicalRange.mockReset();
  chartMockState.getVisibleLogicalRange.mockReturnValue({ from: 0, to: 1 });
  chartMockState.setVisibleLogicalRange.mockReset();
  chartMockState.visibleRangeHandler = null;
  let settings: TradingChartIndicatorSettings = initialSettings ?? defaultTradingChartIndicators();
  const setIndicatorSettings = vi.fn((next: TradingChartIndicatorSettings | ((current: TradingChartIndicatorSettings) => TradingChartIndicatorSettings)) => {
    settings = typeof next === 'function' ? next(settings) : next;
  });
  const renderResult = render(
    <SkuTradingChart
      chartModel={chartModelOverride ?? chartModel}
      chartZoomResetToken={0}
      defaultIndicatorSettings={defaultTradingChartIndicators()}
      hasOlderIntervals={hasOlderIntervals}
      indicatorSettings={settings}
      isBusy={isBusy}
      isLoadingOlderIntervals={isLoadingOlderIntervals}
      loadOlderIntervals={loadOlderIntervals}
      selectedIntervalIndex={0}
      setIndicatorSettings={setIndicatorSettings}
      timeframe="Recent"
      onOlderLoadProgressChange={vi.fn()}
      onReset={vi.fn()}
      onSaveDefaultIndicatorSettings={vi.fn()}
      onSelectInterval={vi.fn()}
      onTimeframeChange={vi.fn()}
    />,
  );
  return { ...renderResult, loadOlderIntervals, setIndicatorSettings };
}

describe('SkuTradingChart settings', () => {
  it('reserves additional vertical room as panes are added', () => {
    const initialSettings = defaultTradingChartIndicators();
    initialSettings.demand.enabled = true;
    initialSettings.receipts.enabled = true;
    const multiPaneModel: TradingChartModel = {
      ...chartModel,
      points: [{
        ...chartModel.points[0]!,
        serviceDemandMean: 3,
        receiptsMean: 2,
      }],
      availability: {
        ...chartModel.availability,
        demand: true,
        receipts: true,
      },
    };

    renderChart({
      chartModelOverride: multiPaneModel,
      initialSettings,
    });

    expect(screen.getByTestId('sku-trading-chart')).toHaveStyle({
      minHeight: `${deriveTradingChartMinRenderHeight(2)}px`,
    });
  });

  it('dims the chart surface while data is loading', () => {
    renderChart({ isBusy: true });

    expect(screen.getByTestId('sku-trading-chart').parentElement).toHaveClass('opacity-45');
    expect(screen.getByTestId('sku-trading-chart').parentElement).toHaveAttribute('data-busy', 'true');
  });

  it('does not auto-scroll the x-axis while busy data prepends older intervals', async () => {
    vi.stubGlobal('navigator', { userAgent: 'unit-test' });
    const prependedPoint = {
      ...chartModel.points[0]!,
      intervalIndex: -1,
      startAt: '2026-02-27T00:00:00.000Z',
      endAt: '2026-02-28T00:00:00.000Z',
      time: 1772236800 as never,
    };
    const nextPoint = {
      ...chartModel.points[0]!,
      intervalIndex: 0,
    };
    const prependedModel: TradingChartModel = {
      ...chartModel,
      points: [prependedPoint, nextPoint],
      pointByIntervalIndex: new Map([
        [prependedPoint.intervalIndex, prependedPoint],
        [nextPoint.intervalIndex, nextPoint],
      ]),
      pointByTimeKey: new Map([
        [String(prependedPoint.time), prependedPoint],
        [String(nextPoint.time), nextPoint],
      ]),
    };
    const { rerender } = renderChart({ isBusy: true });
    chartMockState.setVisibleLogicalRange.mockClear();

    rerender(
      <SkuTradingChart
        chartModel={prependedModel}
        chartZoomResetToken={0}
        defaultIndicatorSettings={defaultTradingChartIndicators()}
        hasOlderIntervals={false}
        indicatorSettings={defaultTradingChartIndicators()}
        isBusy
        isLoadingOlderIntervals={false}
        loadOlderIntervals={vi.fn(async () => null)}
        selectedIntervalIndex={0}
        setIndicatorSettings={vi.fn()}
        timeframe="Recent"
        onOlderLoadProgressChange={vi.fn()}
        onReset={vi.fn()}
        onSaveDefaultIndicatorSettings={vi.fn()}
        onSelectInterval={vi.fn()}
        onTimeframeChange={vi.fn()}
      />,
    );

    await waitFor(() => expect(chartMockState.addSeries).toHaveBeenCalled());
    expect(chartMockState.setVisibleLogicalRange).not.toHaveBeenCalled();
  });

  it('does not auto-scroll the x-axis when older data arrives after zooming during the load', async () => {
    vi.stubGlobal('navigator', { userAgent: 'unit-test' });
    const loadOlderIntervals = vi.fn(async () => null);
    const prependedPoint = {
      ...chartModel.points[0]!,
      intervalIndex: -1,
      startAt: '2026-02-27T00:00:00.000Z',
      endAt: '2026-02-28T00:00:00.000Z',
      time: 1772236800 as never,
    };
    const nextPoint = {
      ...chartModel.points[0]!,
      intervalIndex: 0,
    };
    const prependedModel: TradingChartModel = {
      ...chartModel,
      points: [prependedPoint, nextPoint],
      pointByIntervalIndex: new Map([
        [prependedPoint.intervalIndex, prependedPoint],
        [nextPoint.intervalIndex, nextPoint],
      ]),
      pointByTimeKey: new Map([
        [String(prependedPoint.time), prependedPoint],
        [String(nextPoint.time), nextPoint],
      ]),
    };
    const { rerender } = renderChart({
      hasOlderIntervals: true,
      loadOlderIntervals,
    });

    await waitFor(() => expect(chartMockState.visibleRangeHandler).not.toBeNull());
    chartMockState.setVisibleLogicalRange.mockClear();
    chartMockState.visibleRangeHandler?.({ from: 0, to: 10 });
    chartMockState.visibleRangeHandler?.({ from: -3, to: 25 });
    expect(loadOlderIntervals).toHaveBeenCalledTimes(1);

    rerender(
      <SkuTradingChart
        chartModel={prependedModel}
        chartZoomResetToken={0}
        defaultIndicatorSettings={defaultTradingChartIndicators()}
        hasOlderIntervals={false}
        indicatorSettings={defaultTradingChartIndicators()}
        isBusy
        isLoadingOlderIntervals
        loadOlderIntervals={loadOlderIntervals}
        selectedIntervalIndex={0}
        setIndicatorSettings={vi.fn()}
        timeframe="Recent"
        onOlderLoadProgressChange={vi.fn()}
        onReset={vi.fn()}
        onSaveDefaultIndicatorSettings={vi.fn()}
        onSelectInterval={vi.fn()}
        onTimeframeChange={vi.fn()}
      />,
    );

    await waitFor(() => expect(chartMockState.addSeries).toHaveBeenCalled());
    expect(chartMockState.setVisibleLogicalRange).not.toHaveBeenCalled();
  });

  it('keeps style popover open long enough to apply color, thickness, and line type edits', async () => {
    const user = userEvent.setup();
    const { setIndicatorSettings } = renderChart();

    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(screen.getByRole('button', { name: 'Inventory color' }));
    expect(screen.getByTestId('chart-settings-body')).toHaveClass('overflow-hidden');
    await user.click(screen.getByRole('button', { name: 'Use color #2962ff' }));
    await user.click(screen.getByRole('button', { name: 'Use line width 4' }));
    await user.click(screen.getByRole('button', { name: 'Use line type dotted' }));
    await user.click(screen.getByRole('button', { name: 'Ok' }));

    expect(setIndicatorSettings).toHaveBeenCalledTimes(1);
    const nextSettings = setIndicatorSettings.mock.calls[0]?.[0] as TradingChartIndicatorSettings;
    expect(nextSettings.inventory.color).toBe('#2962ff');
    expect(nextSettings.inventory.lineWidth).toBe(4);
    expect(nextSettings.inventory.lineStyle).toBe('dotted');
  });

  it('asks before leaving dirty settings and can keep editing or discard changes', async () => {
    const user = userEvent.setup();
    const { setIndicatorSettings } = renderChart();

    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(screen.getByRole('button', { name: 'Inventory color' }));
    await user.click(screen.getByRole('button', { name: 'Use color #2962ff' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('dialog', { name: 'Apply chart changes' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByRole('dialog', { name: 'Chart indicator settings' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Discard changes' }));

    expect(screen.queryByRole('dialog', { name: 'Chart indicator settings' })).not.toBeInTheDocument();
    expect(setIndicatorSettings).not.toHaveBeenCalled();
  });

  it('asks before leaving dirty indicators and can apply staged changes', async () => {
    const user = userEvent.setup();
    const demandChartModel: TradingChartModel = {
      ...chartModel,
      points: [{
        ...chartModel.points[0]!,
        serviceDemandMean: 3,
        retailDemandMean: 2,
      }],
      availability: {
        ...chartModel.availability,
        demand: true,
      },
    };
    const { setIndicatorSettings } = renderChart({ chartModelOverride: demandChartModel });

    await user.click(screen.getByRole('button', { name: 'Indicators' }));
    await user.click(screen.getByRole('checkbox', { name: 'Show Demand' }));
    await user.click(screen.getByRole('button', { name: 'Close indicators' }));

    expect(screen.getByRole('dialog', { name: 'Apply chart changes' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Apply changes' }));

    expect(screen.queryByRole('dialog', { name: 'Chart indicators' })).not.toBeInTheDocument();
    expect(setIndicatorSettings).toHaveBeenCalledTimes(1);
    const nextSettings = setIndicatorSettings.mock.calls[0]?.[0] as TradingChartIndicatorSettings;
    expect(nextSettings.demand.enabled).toBe(true);
  });

  it('asks before leaving dirty layout and can discard staged changes', async () => {
    const user = userEvent.setup();
    const initialSettings = defaultTradingChartIndicators();
    initialSettings.demand.enabled = true;
    const demandChartModel: TradingChartModel = {
      ...chartModel,
      points: [{
        ...chartModel.points[0]!,
        serviceDemandMean: 3,
        retailDemandMean: 2,
      }],
      availability: {
        ...chartModel.availability,
        demand: true,
      },
    };
    const { setIndicatorSettings } = renderChart({
      chartModelOverride: demandChartModel,
      initialSettings,
    });

    await user.click(screen.getByRole('button', { name: 'Layout' }));
    await user.click(screen.getByRole('button', { name: 'Delete Demand' }));
    await user.click(screen.getByRole('button', { name: 'Close layout' }));

    expect(screen.getByRole('dialog', { name: 'Apply chart changes' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Discard changes' }));

    expect(screen.queryByRole('dialog', { name: 'Chart layout' })).not.toBeInTheDocument();
    expect(setIndicatorSettings).not.toHaveBeenCalled();
  });

  it('suppresses automatic older loads while busy and allows them after busy clears', async () => {
    vi.stubGlobal('navigator', { userAgent: 'unit-test' });
    const loadOlderIntervals = vi.fn(async () => null);
    const { rerender } = renderChart({
      hasOlderIntervals: true,
      isBusy: true,
      loadOlderIntervals,
    });

    await waitFor(() => expect(chartMockState.visibleRangeHandler).not.toBeNull());
    chartMockState.visibleRangeHandler?.({ from: 5, to: 15 });

    expect(loadOlderIntervals).not.toHaveBeenCalled();

    chartMockState.visibleRangeHandler = null;
    rerender(
      <SkuTradingChart
        chartModel={chartModel}
        chartZoomResetToken={0}
        defaultIndicatorSettings={defaultTradingChartIndicators()}
        hasOlderIntervals
        indicatorSettings={defaultTradingChartIndicators()}
        isBusy={false}
        isLoadingOlderIntervals={false}
        loadOlderIntervals={loadOlderIntervals}
        selectedIntervalIndex={0}
        setIndicatorSettings={vi.fn()}
        timeframe="Recent"
        onOlderLoadProgressChange={vi.fn()}
        onReset={vi.fn()}
        onSaveDefaultIndicatorSettings={vi.fn()}
        onSelectInterval={vi.fn()}
        onTimeframeChange={vi.fn()}
      />,
    );

    await waitFor(() => expect(chartMockState.visibleRangeHandler).not.toBeNull());
    chartMockState.visibleRangeHandler?.({ from: 6, to: 16 });
    expect(loadOlderIntervals).not.toHaveBeenCalled();

    chartMockState.visibleRangeHandler?.({ from: 5, to: 15 });

    expect(loadOlderIntervals).toHaveBeenCalledTimes(1);
  });

  it('opens layout dialog and deletes indicator from chart settings', async () => {
    const user = userEvent.setup();
    const initialSettings = defaultTradingChartIndicators();
    initialSettings.demand.enabled = true;
    const demandChartModel: TradingChartModel = {
      ...chartModel,
      points: [{
        ...chartModel.points[0]!,
        serviceDemandMean: 3,
        retailDemandMean: 2,
      }],
      availability: {
        ...chartModel.availability,
        demand: true,
      },
    };
    const { setIndicatorSettings } = renderChart({
      chartModelOverride: demandChartModel,
      initialSettings,
    });

    await user.click(screen.getByRole('button', { name: 'Layout' }));
    expect(screen.getByRole('heading', { name: 'Chart layout' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete Demand' }));
    await user.click(screen.getByRole('button', { name: 'Ok' }));

    expect(setIndicatorSettings).toHaveBeenCalledTimes(1);
    const nextSettings = setIndicatorSettings.mock.calls[0]?.[0] as TradingChartIndicatorSettings;
    expect(nextSettings.demand.enabled).toBe(false);
  });

  it('allows inventory to be hidden from the indicators dialog', async () => {
    const user = userEvent.setup();
    renderChart();

    await user.click(screen.getByRole('button', { name: 'Indicators' }));
    const inventoryToggle = screen.getByLabelText('Show Inventory');

    expect(inventoryToggle).not.toBeDisabled();
  });

  it('creates an invisible anchor series for a regime-only pane', () => {
    const initialSettings = defaultTradingChartIndicators();
    for (const key of Object.keys(initialSettings) as Array<keyof TradingChartIndicatorSettings>) {
      initialSettings[key].enabled = false;
    }
    initialSettings.regime.enabled = true;
    initialSettings.regime.paneId = 'pane-1';
    const regimeChartModel: TradingChartModel = {
      ...chartModel,
      points: [{
        ...chartModel.points[0]!,
        dominantRegime: 'normal',
      }],
      availability: {
        ...chartModel.availability,
        regime: true,
      },
    };

    renderChart({
      chartModelOverride: regimeChartModel,
      initialSettings,
    });

    expect(chartMockState.addSeries).toHaveBeenCalledWith(
      'LineSeries',
      expect.objectContaining({
        color: 'rgba(0,0,0,0)',
        lastValueVisible: false,
        priceLineVisible: false,
      }),
      1,
    );
  });
});
