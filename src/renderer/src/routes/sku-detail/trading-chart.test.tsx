import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  deriveTradingChartMinRenderHeight,
  paneHeightAllocation,
  shouldAutoCenterSelectedInterval,
  stackOverlayFlagMarkers,
  SkuTradingChart,
} from './trading-chart';
import {
  compatiblePlotStyles,
  defaultTradingChartIndicators,
  normalizeTradingChartIndicatorSettings,
  type TradingChartIndicatorSettings,
  type TradingChartModel,
} from './trading-chart-model';

const chartMockState = vi.hoisted(() => ({
  addSeries: vi.fn(),
  getVisibleLogicalRange: vi.fn(),
  paneHeights: [] as number[],
  timeToIndex: vi.fn(() => 0),
  timeToCoordinate: vi.fn(() => 100),
  setVisibleLogicalRange: vi.fn(),
  visibleRangeHandler: null as ((range: { from: number; to: number } | null) => void) | null,
  visibleRangeHandlers: [] as Array<(range: { from: number; to: number } | null) => void>,
  paneCount: 1,
  priceScaleApplyOptions: new Map<string, ReturnType<typeof vi.fn>>(),
  seriesApplyOptions: [] as ReturnType<typeof vi.fn>[],
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
  chartMockState.timeToIndex.mockReset();
  chartMockState.timeToIndex.mockReturnValue(0);
  chartMockState.timeToCoordinate.mockReset();
  chartMockState.timeToCoordinate.mockReturnValue(100);
  chartMockState.setVisibleLogicalRange.mockReset();
  chartMockState.visibleRangeHandler = null;
  chartMockState.visibleRangeHandlers = [];
  chartMockState.paneHeights = [420];
  chartMockState.paneCount = 1;
  chartMockState.priceScaleApplyOptions = new Map();
  chartMockState.seriesApplyOptions = [];
  const createChartMock = () => {
    chartMockState.addSeries.mockReset();
    chartMockState.getVisibleLogicalRange.mockReset();
    chartMockState.getVisibleLogicalRange.mockReturnValue({ from: 0, to: 1 });
    chartMockState.timeToIndex.mockReset();
    chartMockState.timeToIndex.mockReturnValue(0);
    chartMockState.timeToCoordinate.mockReset();
    chartMockState.timeToCoordinate.mockReturnValue(100);
    chartMockState.setVisibleLogicalRange.mockReset();
    chartMockState.visibleRangeHandler = null;
    chartMockState.visibleRangeHandlers = [];
    chartMockState.paneHeights = [420];
    chartMockState.paneCount = 1;
    chartMockState.priceScaleApplyOptions = new Map();
    chartMockState.seriesApplyOptions = [];
    const buildPane = (index: number) => ({
      getHeight: vi.fn(() => chartMockState.paneHeights[index] ?? 0),
      getHTMLElement: vi.fn(() => ({
        offsetTop: chartMockState.paneHeights.slice(0, index).reduce((sum, height) => sum + height, 0) + index,
        clientHeight: chartMockState.paneHeights[index] ?? 0,
      })),
      getSeries: vi.fn(() => [1]),
      setHeight: vi.fn((nextHeight: number) => {
        chartMockState.paneHeights[index] = nextHeight;
      }),
    });
    const chart = {
      addSeries: chartMockState.addSeries.mockImplementation(() => ({
        applyOptions: (() => {
          const applyOptions = vi.fn();
          chartMockState.seriesApplyOptions.push(applyOptions);
          return applyOptions;
        })(),
        setData: vi.fn(),
        createPriceLine: vi.fn(),
        priceToCoordinate: vi.fn((price: number) => price),
      })),
      addPane: vi.fn(() => {
        chartMockState.paneCount++;
        chartMockState.paneHeights.push(150);
      }),
      applyOptions: vi.fn(),
      chartElement: vi.fn(() => document.createElement('div')),
      paneSize: vi.fn(() => ({ width: 320, height: 420 })),
      panes: vi.fn(() => Array.from({ length: chartMockState.paneCount }, (_, index) => buildPane(index))),
      priceScale: vi.fn((side: string, paneIndex?: number) => {
        const key = `${side}:${paneIndex ?? 0}`;
        const applyOptions = chartMockState.priceScaleApplyOptions.get(key) ?? vi.fn();
        chartMockState.priceScaleApplyOptions.set(key, applyOptions);
        return { applyOptions };
      }),
      remove: vi.fn(),
      removePane: vi.fn(() => {
        chartMockState.paneCount = Math.max(1, chartMockState.paneCount - 1);
        chartMockState.paneHeights = chartMockState.paneHeights.slice(0, chartMockState.paneCount);
      }),
      removeSeries: vi.fn(),
      resize: vi.fn(),
      subscribeClick: vi.fn(),
      unsubscribeClick: vi.fn(),
      subscribeCrosshairMove: vi.fn(),
      unsubscribeCrosshairMove: vi.fn(),
      timeScale: vi.fn(() => ({
        fitContent: vi.fn(),
        height: vi.fn(() => 32),
        width: vi.fn(() => 320),
        timeToCoordinate: chartMockState.timeToCoordinate,
        timeToIndex: chartMockState.timeToIndex,
        getVisibleLogicalRange: chartMockState.getVisibleLogicalRange,
        setVisibleLogicalRange: chartMockState.setVisibleLogicalRange,
        applyOptions: vi.fn(),
        subscribeVisibleLogicalRangeChange: vi.fn((handler: (range: { from: number; to: number } | null) => void) => {
          chartMockState.visibleRangeHandler = handler;
          chartMockState.visibleRangeHandlers.push(handler);
        }),
        unsubscribeVisibleLogicalRangeChange: vi.fn((handler: (range: { from: number; to: number } | null) => void) => {
          chartMockState.visibleRangeHandlers = chartMockState.visibleRangeHandlers.filter((candidate) => candidate !== handler);
          chartMockState.visibleRangeHandler = chartMockState.visibleRangeHandlers.at(-1) ?? null;
        }),
      })),
    };
    return chart;
  };
  return {
    AreaSeries: 'AreaSeries',
    BarSeries: 'BarSeries',
    CandlestickSeries: 'CandlestickSeries',
    ColorType: { Solid: 'solid' },
    createChart: vi.fn(() => createChartMock()),
    HistogramSeries: 'HistogramSeries',
    LineSeries: 'LineSeries',
    LineType: { Simple: 0, WithSteps: 1 },
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
      ordersInTransitMean: null,
      ordersLateMean: null,
      ordersReadyToReceiveMean: null,
      ordersReceivedMean: null,
      newOrderFlag: null,
      newReceiptFlag: null,
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
    ordersInTransit: false,
    ordersLate: false,
    ordersReadyToReceive: false,
    ordersReceived: false,
    newOrderFlags: false,
    newReceiptFlags: false,
    price: false,
    regime: false,
  },
};

chartModel.pointByIntervalIndex.set(0, chartModel.points[0]!);
chartModel.pointByTimeKey.set(String(chartModel.points[0]!.time), chartModel.points[0]!);

function multiPointChartModel(pointCount: number): TradingChartModel {
  const points = Array.from({ length: pointCount }, (_, index) => {
    const date = String(index + 1).padStart(2, '0');
    return {
      ...chartModel.points[0]!,
      intervalIndex: index,
      startAt: `2026-03-${date}T00:00:00.000Z`,
      endAt: `2026-03-${date}T23:59:59.999Z`,
      time: (1772323200 + index * 86_400) as never,
      label: `Interval ${index + 1}`,
    };
  });
  return {
    ...chartModel,
    points,
    pointByIntervalIndex: new Map(points.map((point) => [point.intervalIndex, point])),
    pointByTimeKey: new Map(points.map((point) => [String(point.time), point])),
  };
}

function renderChart({
  chartModelOverride,
  customTimeframeRange = null,
  expanded = false,
  hasOlderIntervals = false,
  initialSettings,
  isBusy = false,
  isVisuallyBusy,
  initialVisibleDateRange = null,
  isLoadingOlderIntervals = false,
  loadOlderIntervals = vi.fn(async () => null),
  onChartResolutionChange = vi.fn(),
  onCustomTimeframeChange = vi.fn(),
  onPaneHeightsChange = vi.fn(),
  onToggleExpand = vi.fn(),
  onVisibleDateRangeChange = vi.fn(),
  selectedIntervalIndex = 0,
  timeframe = 'Recent',
}: {
  chartModelOverride?: TradingChartModel;
  customTimeframeRange?: { startAt: string; endAt: string } | null;
  expanded?: boolean;
  hasOlderIntervals?: boolean;
  initialSettings?: TradingChartIndicatorSettings;
  isBusy?: boolean;
  isVisuallyBusy?: boolean;
  initialVisibleDateRange?: { startAt: string; endAt: string } | null;
  isLoadingOlderIntervals?: boolean;
  loadOlderIntervals?: () => Promise<unknown>;
  onChartResolutionChange?: (value: 'H' | '1D' | '1W' | '1M' | '3M' | '1Y' | 'Custom', custom: { amount: number; unit: 'm' | 'H' | 'D' | 'W' | 'M' | 'Y'; expression: string } | null) => void;
  onCustomTimeframeChange?: (range: { startAt: string; endAt: string } | null) => void;
  onPaneHeightsChange?: (paneHeights: Record<string, number>) => void;
  onToggleExpand?: () => void;
  onVisibleDateRangeChange?: (range: { startAt: string; endAt: string } | null) => void;
  selectedIntervalIndex?: number | null;
  timeframe?: 'Recent' | '1M' | '3M' | '1Y' | 'YTD' | 'MAX';
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
      customTimeframeRange={customTimeframeRange}
      defaultIndicatorSettings={defaultTradingChartIndicators()}
      expanded={expanded}
      hasOlderIntervals={hasOlderIntervals}
      indicatorSettings={settings}
      initialVisibleDateRange={initialVisibleDateRange}
      isBusy={isBusy}
      isVisuallyBusy={isVisuallyBusy}
      isLoadingOlderIntervals={isLoadingOlderIntervals}
      loadOlderIntervals={loadOlderIntervals}
      selectedIntervalIndex={selectedIntervalIndex}
      setIndicatorSettings={setIndicatorSettings}
      timeframe={timeframe}
      onOlderLoadProgressChange={vi.fn()}
      onChartResolutionChange={onChartResolutionChange}
      onCustomTimeframeChange={onCustomTimeframeChange}
      onReset={vi.fn()}
      onSaveDefaultIndicatorSettings={vi.fn()}
      onSelectInterval={vi.fn()}
      onToggleExpand={onToggleExpand}
      onTimeframeChange={vi.fn()}
      onPaneHeightsChange={onPaneHeightsChange}
      onVisibleDateRangeChange={onVisibleDateRangeChange}
    />,
  );
  return {
    ...renderResult,
    loadOlderIntervals,
    onChartResolutionChange,
    onCustomTimeframeChange,
    onPaneHeightsChange,
    onToggleExpand,
    onVisibleDateRangeChange,
    setIndicatorSettings,
  };
}

describe('SkuTradingChart settings', () => {
  it('stacks overlay flags by layer order inside same pane interval', () => {
    const markers = stackOverlayFlagMarkers([
      {
        key: 'regime',
        indicatorId: 'regime',
        paneId: 'main',
        intervalIndex: 3,
        layerOrder: 4,
        left: 10,
        width: 28,
        color: '#000',
        label: 'Sales Pattern',
        onClick: vi.fn(),
        icon: vi.fn() as never,
      },
      {
        key: 'new-order',
        indicatorId: 'newOrderFlags',
        paneId: 'main',
        intervalIndex: 3,
        layerOrder: 1,
        left: 10,
        width: 28,
        color: '#000',
        label: 'New order flag',
        onClick: vi.fn(),
        icon: vi.fn() as never,
      },
      {
        key: 'new-receipt',
        indicatorId: 'newReceiptFlags',
        paneId: 'main',
        intervalIndex: 3,
        layerOrder: 2,
        left: 10,
        width: 28,
        color: '#000',
        label: 'New receipt flag',
        onClick: vi.fn(),
        icon: vi.fn() as never,
      },
    ]);

    expect(markers.map((marker) => marker.indicatorId)).toEqual(['newOrderFlags', 'newReceiptFlags', 'regime']);
    expect(markers.map((marker) => marker.bottom)).toEqual([6, 40, 74]);
  });

  it('includes split order pipeline indicators in default settings', () => {
    const settings = defaultTradingChartIndicators();

    expect(settings.ordersInTransit).toBeDefined();
    expect(settings.ordersLate).toBeDefined();
    expect(settings.ordersReadyToReceive).toBeDefined();
    expect(settings.ordersReceived).toBeDefined();
    expect(settings.newOrderFlags).toBeDefined();
    expect(settings.newReceiptFlags).toBeDefined();
  });

  it('exposes input-backed plot styles and normalizes source compatibility', () => {
    const settings = defaultTradingChartIndicators();
    settings.inventory.plotStyle = 'candles';
    settings.inventory.inputSource = 'low';
    settings.price.plotStyle = 'line';
    settings.price.inputSource = 'ohlc';

    const normalized = normalizeTradingChartIndicatorSettings(settings);

    expect(compatiblePlotStyles('inventory')).toEqual(expect.arrayContaining(['step-line', 'histogram', 'bars', 'candles']));
    expect(normalized.inventory.inputSource).toBe('ohlc');
    expect(normalized.price.inputSource).toBe('close');
  });

  it('renders expand button next to interval time and toggles it', async () => {
    const user = userEvent.setup();
    const { onToggleExpand } = renderChart();

    await user.click(screen.getByRole('button', { name: 'Expand chart' }));

    expect(onToggleExpand).toHaveBeenCalledTimes(1);
  });

  it('applies a custom timeframe range from footer controls', async () => {
    const user = userEvent.setup();
    const onCustomTimeframeChange = vi.fn();

    renderChart({ onCustomTimeframeChange });

    await user.click(screen.getByRole('button', { name: 'Custom duration' }));
    fireEvent.change(screen.getByLabelText('Custom timeframe start date'), { target: { value: '2026-03-10' } });
    fireEvent.change(screen.getByLabelText('Custom timeframe end date'), { target: { value: '2026-03-23' } });
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    expect(onCustomTimeframeChange).toHaveBeenCalledWith({
      startAt: '2026-03-10T00:00:00.000Z',
      endAt: '2026-03-23T23:59:59.999Z',
    });
  });

  it('does not auto-center the selected interval on first mount', () => {
    expect(shouldAutoCenterSelectedInterval(null, 12)).toBe(false);
  });

  it('auto-centers the selected interval after the user changes selection', () => {
    expect(shouldAutoCenterSelectedInterval(4, 12)).toBe(true);
    expect(shouldAutoCenterSelectedInterval(4, 4)).toBe(false);
  });

  it('applies a custom chart timeframe from footer controls', async () => {
    const user = userEvent.setup();
    const onChartResolutionChange = vi.fn();

    renderChart({ onChartResolutionChange });

    await user.click(screen.getByRole('button', { name: 'Custom timeframe' }));
    fireEvent.change(screen.getByLabelText('Custom chart timeframe'), { target: { value: '15m' } });
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    expect(onChartResolutionChange).toHaveBeenCalledWith('Custom', {
      amount: 15,
      unit: 'm',
      expression: '15m',
    });
  });

  it('debounces visible-range and pane-height persistence updates', async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal('navigator', { userAgent: 'unit-test' });
      const onPaneHeightsChange = vi.fn();
      const onVisibleDateRangeChange = vi.fn();
      const multiPointModel: TradingChartModel = {
        ...chartModel,
        points: [
          {
            ...chartModel.points[0]!,
            intervalIndex: 0,
            startAt: '2026-03-01T00:00:00.000Z',
            endAt: '2026-03-02T00:00:00.000Z',
            time: 1772409600 as never,
            label: 'Interval 1',
          },
          {
            ...chartModel.points[0]!,
            intervalIndex: 1,
            startAt: '2026-03-03T00:00:00.000Z',
            endAt: '2026-03-04T00:00:00.000Z',
            time: 1772582400 as never,
            label: 'Interval 2',
          },
          {
            ...chartModel.points[0]!,
            intervalIndex: 2,
            startAt: '2026-03-05T00:00:00.000Z',
            endAt: '2026-03-06T00:00:00.000Z',
            time: 1772755200 as never,
            label: 'Interval 3',
          },
        ],
        pointByIntervalIndex: new Map(),
        pointByTimeKey: new Map(),
      };
      multiPointModel.points.forEach((point) => {
        multiPointModel.pointByIntervalIndex.set(point.intervalIndex, point);
        multiPointModel.pointByTimeKey.set(String(point.time), point);
      });

      renderChart({
        chartModelOverride: multiPointModel,
        onPaneHeightsChange,
        onVisibleDateRangeChange,
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(120);
      });
      onPaneHeightsChange.mockClear();
      onVisibleDateRangeChange.mockClear();

      chartMockState.paneHeights = [460];
      act(() => {
        chartMockState.visibleRangeHandlers.forEach((handler) => handler({ from: 0, to: 0 }));
        chartMockState.paneHeights = [480];
        chartMockState.visibleRangeHandlers.forEach((handler) => handler({ from: 1, to: 2 }));
      });

      expect(onVisibleDateRangeChange).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(119);
      });

      expect(onVisibleDateRangeChange).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });

      expect(onPaneHeightsChange).toHaveBeenLastCalledWith({ main: 480 });
      expect(onVisibleDateRangeChange).toHaveBeenCalledTimes(1);
      expect(onVisibleDateRangeChange).toHaveBeenCalledWith(
        {
          startAt: '2026-03-03T00:00:00.000Z',
          endAt: '2026-03-06T00:00:00.000Z',
        },
        expect.objectContaining({ syncCustomTimeframeRange: false }),
      );

      onVisibleDateRangeChange.mockClear();
      fireEvent.wheel(screen.getByTestId('sku-trading-chart'));
      act(() => {
        chartMockState.visibleRangeHandlers.forEach((handler) => handler({ from: 0, to: 1 }));
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(120);
      });

      expect(onVisibleDateRangeChange).toHaveBeenCalledWith(
        {
          startAt: '2026-03-01T00:00:00.000Z',
          endAt: '2026-03-04T00:00:00.000Z',
        },
        expect.objectContaining({
          previousVisibleDateRange: {
            startAt: '2026-03-03T00:00:00.000Z',
            endAt: '2026-03-06T00:00:00.000Z',
          },
          syncCustomTimeframeRange: true,
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('updates series options for cosmetic setting changes without rebuilding the chart', async () => {
    vi.stubGlobal('navigator', { userAgent: 'unit-test' });
    const initialSettings = defaultTradingChartIndicators();
    const nextSettings = defaultTradingChartIndicators();
    nextSettings.inventory.color = '#dc2626';
    nextSettings.inventory.lineWidth = 4;
    nextSettings.inventory.showPriceScaleLabel = false;

    const renderResult = render(
      <SkuTradingChart
        chartModel={chartModel}
        chartZoomResetToken={0}
        defaultIndicatorSettings={defaultTradingChartIndicators()}
        hasOlderIntervals={false}
        indicatorSettings={initialSettings}
        isBusy={false}
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
    chartMockState.addSeries.mockClear();
    chartMockState.seriesApplyOptions.forEach((applyOptions) => applyOptions.mockClear());

    renderResult.rerender(
      <SkuTradingChart
        chartModel={chartModel}
        chartZoomResetToken={0}
        defaultIndicatorSettings={defaultTradingChartIndicators()}
        hasOlderIntervals={false}
        indicatorSettings={nextSettings}
        isBusy={false}
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

    expect(chartMockState.addSeries).not.toHaveBeenCalled();
    expect(chartMockState.seriesApplyOptions.some((applyOptions) => applyOptions.mock.calls.length > 0)).toBe(true);
  });

  it('labels regime indicator as Sales Pattern', () => {
    const initialSettings = defaultTradingChartIndicators();
    initialSettings.regime.enabled = true;
    const regimeChartModel: TradingChartModel = {
      ...chartModel,
      points: [{
        ...chartModel.points[0]!,
        dominantRegime: 'normal',
      }],
      pointByIntervalIndex: new Map([[0, {
        ...chartModel.points[0]!,
        dominantRegime: 'normal',
      }]]),
      pointByTimeKey: new Map([[String(chartModel.points[0]!.time), {
        ...chartModel.points[0]!,
        dominantRegime: 'normal',
      }]]),
      availability: {
        ...chartModel.availability,
        regime: true,
      },
    };

    renderChart({ initialSettings, chartModelOverride: regimeChartModel });

    expect(screen.getByText('Sales Pattern')).toBeInTheDocument();
  });

  it('allocates a 75/25 split for a single indicator pane', () => {
    expect(paneHeightAllocation(400, 1)).toEqual({
      main: 300,
      indicators: [100],
    });
  });

  it('allocates 25% to each indicator until the main pane floor is reached', () => {
    expect(paneHeightAllocation(400, 2)).toEqual({
      main: 200,
      indicators: [100, 100],
    });
  });

  it('holds the main pane at 50% and splits the remainder across many indicators', () => {
    const allocation = paneHeightAllocation(400, 3);

    expect(allocation.main).toBe(200);
    expect(allocation.indicators).toHaveLength(3);
    expect(allocation.indicators.reduce((sum, height) => sum + height, 0)).toBe(200);
    expect(allocation.indicators.every((height) => height >= 66 && height <= 68)).toBe(true);
  });

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

  it('keeps main pane at 50% with three indicator panes', async () => {
    vi.stubGlobal('navigator', { userAgent: 'unit-test' });

    const initialSettings = defaultTradingChartIndicators();
    initialSettings.demand.enabled = true;
    initialSettings.receipts.enabled = true;
    initialSettings.ordersInTransit.enabled = true;

    const multiPaneModel: TradingChartModel = {
      ...chartModel,
      points: [{
        ...chartModel.points[0]!,
        serviceDemandMean: 3,
        receiptsMean: 2,
        ordersInTransitMean: 4,
      }],
      pointByIntervalIndex: new Map([[0, {
        ...chartModel.points[0]!,
        serviceDemandMean: 3,
        receiptsMean: 2,
        ordersInTransitMean: 4,
      }]]),
      pointByTimeKey: new Map([[String(chartModel.points[0]!.time), {
        ...chartModel.points[0]!,
        serviceDemandMean: 3,
        receiptsMean: 2,
        ordersInTransitMean: 4,
      }]]),
      availability: {
        ...chartModel.availability,
        demand: true,
        receipts: true,
        ordersInTransit: true,
      },
    };

    renderChart({
      chartModelOverride: multiPaneModel,
      initialSettings,
    });

    await waitFor(() => expect(chartMockState.paneHeights).toEqual([374, 124, 124, 126]));
  });

  it('dims the chart surface while data is loading', () => {
    renderChart({ isBusy: true });

    expect(screen.getByTestId('sku-trading-chart').parentElement).toHaveClass('opacity-45');
    expect(screen.getByTestId('sku-trading-chart').parentElement).toHaveAttribute('data-busy', 'true');
    expect(screen.getByTestId('sku-trading-chart').parentElement?.lastElementChild).toHaveClass('pointer-events-none');
    expect(screen.getByRole('button', { name: 'Reset chart' })).toBeEnabled();
  });

  it('keeps the legend label visible when status line values are disabled', () => {
    const initialSettings = defaultTradingChartIndicators();
    initialSettings.ordersInTransit.enabled = true;
    initialSettings.ordersInTransit.paneId = 'main';
    initialSettings.ordersInTransit.showStatusLineValue = false;

    const ordersChartModel: TradingChartModel = {
      ...chartModel,
      points: [{
        ...chartModel.points[0]!,
        ordersInTransitMean: 42,
      }],
      pointByIntervalIndex: new Map([[0, {
        ...chartModel.points[0]!,
        ordersInTransitMean: 42,
      }]]),
      pointByTimeKey: new Map([[String(chartModel.points[0]!.time), {
        ...chartModel.points[0]!,
        ordersInTransitMean: 42,
      }]]),
      availability: {
        ...chartModel.availability,
        ordersInTransit: true,
      },
    };

    renderChart({
      chartModelOverride: ordersChartModel,
      initialSettings,
    });

    expect(screen.getByText('Orders in transit')).toBeInTheDocument();
    expect(screen.queryByText('42.00u')).not.toBeInTheDocument();
  });


  it('creates chart series on first load after chart bootstrap', async () => {
    vi.stubGlobal('navigator', { userAgent: 'unit-test' });

    const initialSettings = defaultTradingChartIndicators();
    const firstLoadModel: TradingChartModel = {
      ...chartModel,
      points: [{
        ...chartModel.points[0]!,
        dominantRegime: 'normal',
        serviceDemandMean: 3,
      }],
      pointByIntervalIndex: new Map([[0, {
        ...chartModel.points[0]!,
        dominantRegime: 'normal',
        serviceDemandMean: 3,
      }]]),
      pointByTimeKey: new Map([[String(chartModel.points[0]!.time), {
        ...chartModel.points[0]!,
        dominantRegime: 'normal',
        serviceDemandMean: 3,
      }]]),
      availability: {
        ...chartModel.availability,
        demand: true,
        regime: true,
      },
    };

    renderChart({
      chartModelOverride: firstLoadModel,
      initialSettings,
    });

    await waitFor(() => expect(chartMockState.addSeries).toHaveBeenCalled());
  });

  it('uses an inverted wheel color for candle down moves', async () => {
    vi.stubGlobal('navigator', { userAgent: 'unit-test' });
    const initialSettings = defaultTradingChartIndicators();
    initialSettings.inventory.plotStyle = 'candles';
    initialSettings.inventory.color = '#ff0000';

    const firstLoadModel: TradingChartModel = {
      ...chartModel,
      points: [{
        ...chartModel.points[0]!,
        dominantRegime: 'normal',
      }],
      pointByIntervalIndex: new Map([[0, {
        ...chartModel.points[0]!,
        dominantRegime: 'normal',
      }]]),
      pointByTimeKey: new Map([[String(chartModel.points[0]!.time), {
        ...chartModel.points[0]!,
        dominantRegime: 'normal',
      }]]),
      availability: {
        ...chartModel.availability,
        regime: true,
      },
    };

    renderChart({ initialSettings, chartModelOverride: firstLoadModel });

    await waitFor(() => {
      expect(chartMockState.addSeries).toHaveBeenCalledWith(
        'CandlestickSeries',
        expect.objectContaining({
          upColor: 'rgba(255, 0, 0, 1)',
          downColor: 'rgba(0, 255, 255, 1)',
          borderUpColor: '#ff0000',
          borderDownColor: '#00ffff',
          wickUpColor: '#ff0000',
          wickDownColor: '#00ffff',
        }),
        0,
      );
    });
  });

  it('does not rebuild chart series on equivalent rerenders', async () => {
    vi.stubGlobal('navigator', { userAgent: 'unit-test' });

    const initialSettings = defaultTradingChartIndicators();
    const semanticChartModel: TradingChartModel = {
      ...chartModel,
      points: [{
        ...chartModel.points[0]!,
        serviceDemandMean: 3,
      }],
      pointByIntervalIndex: new Map([[0, {
        ...chartModel.points[0]!,
        serviceDemandMean: 3,
      }]]),
      pointByTimeKey: new Map([[String(chartModel.points[0]!.time), {
        ...chartModel.points[0]!,
        serviceDemandMean: 3,
      }]]),
      availability: {
        ...chartModel.availability,
        demand: true,
      },
    };

    const { rerender } = render(
      <SkuTradingChart
        chartModel={semanticChartModel}
        chartZoomResetToken={0}
        defaultIndicatorSettings={defaultTradingChartIndicators()}
        hasOlderIntervals={false}
        indicatorSettings={initialSettings}
        isBusy={false}
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
    chartMockState.addSeries.mockClear();

    const rerenderPoint = {
      ...chartModel.points[0]!,
      serviceDemandMean: 3,
    };
    const rerenderedModel: TradingChartModel = {
      ...semanticChartModel,
      points: [rerenderPoint],
      pointByIntervalIndex: new Map([[0, rerenderPoint]]),
      pointByTimeKey: new Map([[String(rerenderPoint.time), rerenderPoint]]),
      availability: {
        ...semanticChartModel.availability,
      },
    };

    rerender(
      <SkuTradingChart
        chartModel={rerenderedModel}
        chartZoomResetToken={0}
        defaultIndicatorSettings={defaultTradingChartIndicators()}
        hasOlderIntervals={false}
        indicatorSettings={structuredClone(initialSettings)}
        isBusy={false}
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

    expect(chartMockState.addSeries).not.toHaveBeenCalled();
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

  it('does not refit the chart when custom range is promoted from viewport movement', async () => {
    vi.stubGlobal('navigator', { userAgent: 'unit-test' });
    const model = multiPointChartModel(8);
    chartMockState.getVisibleLogicalRange.mockReturnValue({ from: 0, to: 7 });
    const { rerender } = renderChart({
      chartModelOverride: model,
      timeframe: '1M',
    });

    await waitFor(() => expect(chartMockState.setVisibleLogicalRange).toHaveBeenCalled());
    chartMockState.setVisibleLogicalRange.mockClear();

    rerender(
      <SkuTradingChart
        chartModel={model}
        chartZoomResetToken={0}
        customTimeframeRange={{
          startAt: '2026-03-01T00:00:00.000Z',
          endAt: '2026-03-04T23:59:59.999Z',
        }}
        defaultIndicatorSettings={defaultTradingChartIndicators()}
        hasOlderIntervals={false}
        indicatorSettings={defaultTradingChartIndicators()}
        isBusy={false}
        isLoadingOlderIntervals={false}
        loadOlderIntervals={vi.fn(async () => null)}
        selectedIntervalIndex={0}
        setIndicatorSettings={vi.fn()}
        timeframe="1M"
        onOlderLoadProgressChange={vi.fn()}
        onReset={vi.fn()}
        onSaveDefaultIndicatorSettings={vi.fn()}
        onSelectInterval={vi.fn()}
        onTimeframeChange={vi.fn()}
      />,
    );

    expect(chartMockState.setVisibleLogicalRange).not.toHaveBeenCalled();
  });

  it('marks wheel viewport interactions in capture phase before the chart library handles zoom', () => {
    const addEventListenerSpy = vi.spyOn(HTMLElement.prototype, 'addEventListener');

    renderChart();

    expect(addEventListenerSpy).toHaveBeenCalledWith(
      'wheel',
      expect.any(Function),
      expect.objectContaining({ capture: true, passive: true }),
    );

    addEventListenerSpy.mockRestore();
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
    loadOlderIntervals.mockClear();
    chartMockState.setVisibleLogicalRange.mockClear();
    act(() => {
      for (const handler of chartMockState.visibleRangeHandlers) {
        const callCount = loadOlderIntervals.mock.calls.length;
        handler({ from: 0, to: 10 });
        if (loadOlderIntervals.mock.calls.length > callCount) {
          break;
        }
      }
      for (const handler of chartMockState.visibleRangeHandlers) {
        const callCount = loadOlderIntervals.mock.calls.length;
        handler({ from: -3, to: 25 });
        if (loadOlderIntervals.mock.calls.length > callCount) {
          break;
        }
      }
    });
    expect(loadOlderIntervals).toHaveBeenCalled();

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
    chartMockState.getVisibleLogicalRange.mockReturnValue({ from: 6, to: 16 });
    chartMockState.timeToCoordinate.mockReturnValue(0);
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

    expect(loadOlderIntervals).toHaveBeenCalled();
  });

  it('allows automatic older loads during visual-only busy hold', async () => {
    vi.stubGlobal('navigator', { userAgent: 'unit-test' });
    const loadOlderIntervals = vi.fn(async () => null);
    renderChart({
      hasOlderIntervals: true,
      isBusy: false,
      isVisuallyBusy: true,
      loadOlderIntervals,
    });

    await waitFor(() => expect(chartMockState.visibleRangeHandlers.length).toBeGreaterThan(0));
    act(() => {
      for (const handler of chartMockState.visibleRangeHandlers) {
        const callCount = loadOlderIntervals.mock.calls.length;
        handler({ from: 5, to: 15 });
        if (loadOlderIntervals.mock.calls.length > callCount) {
          break;
        }
      }
    });

    expect(loadOlderIntervals).toHaveBeenCalled();
    expect(screen.getByTestId('sku-trading-chart').parentElement).toHaveAttribute('data-busy', 'true');
  });

  it('does not automatically load older intervals while the All timeframe is selected', async () => {
    vi.stubGlobal('navigator', { userAgent: 'unit-test' });
    const loadOlderIntervals = vi.fn(async () => null);
    renderChart({
      hasOlderIntervals: true,
      loadOlderIntervals,
      timeframe: 'MAX',
    });

    await waitFor(() => expect(chartMockState.visibleRangeHandlers.length).toBeGreaterThan(0));
    act(() => {
      chartMockState.visibleRangeHandlers.forEach((handler) => handler({ from: 5, to: 15 }));
    });

    expect(loadOlderIntervals).not.toHaveBeenCalled();
  });

  it('continues loading older intervals after a batch if the visible range still needs more history', async () => {
    vi.stubGlobal('navigator', { userAgent: 'unit-test' });
    const loadOlderIntervals = vi.fn(async () => null);
    const prependedPoint = {
      ...chartModel.points[0]!,
      intervalIndex: -1,
      startAt: '2026-02-27T00:00:00.000Z',
      endAt: '2026-02-28T00:00:00.000Z',
      time: 1772236800 as never,
    };
    const prependedModel: TradingChartModel = {
      ...chartModel,
      points: [prependedPoint, ...chartModel.points],
      pointByIntervalIndex: new Map([
        [prependedPoint.intervalIndex, prependedPoint],
        ...chartModel.pointByIntervalIndex.entries(),
      ]),
      pointByTimeKey: new Map([
        [String(prependedPoint.time), prependedPoint],
        ...chartModel.pointByTimeKey.entries(),
      ]),
    };
    chartMockState.getVisibleLogicalRange.mockReturnValue({ from: 5, to: 15 });
    const { rerender } = renderChart({
      hasOlderIntervals: true,
      loadOlderIntervals,
    });

    await waitFor(() => expect(chartMockState.visibleRangeHandler).not.toBeNull());
    loadOlderIntervals.mockClear();
    act(() => {
      for (const handler of chartMockState.visibleRangeHandlers) {
        const callCount = loadOlderIntervals.mock.calls.length;
        handler({ from: 5, to: 15 });
        if (loadOlderIntervals.mock.calls.length > callCount) {
          break;
        }
      }
    });
    await waitFor(() => expect(loadOlderIntervals).toHaveBeenCalledTimes(1));

    rerender(
      <SkuTradingChart
        chartModel={prependedModel}
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

    await waitFor(() => expect(loadOlderIntervals).toHaveBeenCalledTimes(2));
  });

  it('continues loading older intervals when the first loaded point still leaves visible left whitespace', async () => {
    vi.stubGlobal('navigator', { userAgent: 'unit-test' });
    const loadOlderIntervals = vi.fn(async () => null);
    const prependedPoint = {
      ...chartModel.points[0]!,
      intervalIndex: -1,
      startAt: '2026-02-27T00:00:00.000Z',
      endAt: '2026-02-28T00:00:00.000Z',
      time: 1772236800 as never,
    };
    const prependedModel: TradingChartModel = {
      ...chartModel,
      points: [prependedPoint, ...chartModel.points],
      pointByIntervalIndex: new Map([
        [prependedPoint.intervalIndex, prependedPoint],
        ...chartModel.pointByIntervalIndex.entries(),
      ]),
      pointByTimeKey: new Map([
        [String(prependedPoint.time), prependedPoint],
        ...chartModel.pointByTimeKey.entries(),
      ]),
    };
    chartMockState.getVisibleLogicalRange.mockReturnValue({ from: 20, to: 80 });
    chartMockState.timeToCoordinate.mockReturnValue(120);
    const { rerender } = renderChart({
      hasOlderIntervals: true,
      loadOlderIntervals,
    });

    await waitFor(() => expect(loadOlderIntervals).toHaveBeenCalledTimes(1));

    rerender(
      <SkuTradingChart
        chartModel={prependedModel}
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

    await waitFor(() => expect(loadOlderIntervals).toHaveBeenCalledTimes(2));
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

  it('orders settings rows according to the current layout order', async () => {
    const user = userEvent.setup();
    const initialSettings = defaultTradingChartIndicators();
    initialSettings.inventory.enabled = true;
    initialSettings.price.enabled = true;
    initialSettings.price.paneId = 'pane-1';
    initialSettings.price.layerOrder = 0;
    initialSettings.demand.enabled = true;
    initialSettings.demand.paneId = 'pane-2';
    initialSettings.demand.layerOrder = 0;
    const orderedChartModel: TradingChartModel = {
      ...chartModel,
      points: [{
        ...chartModel.points[0]!,
        price: 30,
        serviceDemandMean: 3,
        retailDemandMean: 2,
      }],
      availability: {
        ...chartModel.availability,
        demand: true,
        price: true,
      },
    };

    renderChart({
      chartModelOverride: orderedChartModel,
      initialSettings,
    });

    await user.click(screen.getByRole('button', { name: 'Settings' }));

    const inventoryColor = screen.getByLabelText('Inventory color');
    const priceColor = screen.getByLabelText('Price color');
    const demandColor = screen.getByLabelText('Demand color');

    expect(inventoryColor.compareDocumentPosition(priceColor) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(priceColor.compareDocumentPosition(demandColor) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('hides unavailable indicators from the indicators dialog', async () => {
    const user = userEvent.setup();
    const initialSettings = defaultTradingChartIndicators();
    initialSettings.demand.enabled = true;
    renderChart({
      initialSettings,
    });

    await user.click(screen.getByRole('button', { name: 'Indicators' }));

    expect(screen.queryByLabelText('Show Demand')).toBeNull();
    expect(screen.queryByText('Unavailable for the current chart data.')).toBeNull();
  });

  it('creates an invisible anchor series for a regime-only pane', () => {
    // Skip in jsdom since the chart is never created in test environment
    if (/jsdom/i.test(navigator.userAgent)) {
      return;
    }

    const initialSettings = defaultTradingChartIndicators();
    // Disable all indicators except regime
    for (const key of Object.keys(initialSettings) as Array<keyof TradingChartIndicatorSettings>) {
      initialSettings[key].enabled = false;
    }
    initialSettings.regime.enabled = true;
    // Move regime to its own pane
    initialSettings.regime.paneId = 'pane-1';
    
    // Create chart model with regime data
    const regimeChartModel: TradingChartModel = {
      ...chartModel,
      points: [{
        ...chartModel.points[0]!,
        dominantRegime: 'normal',
      }],
      availability: {
        inventory: false,
        uncertainty: false,
        reorderPoint: false,
        safetyStock: false,
        demand: false,
        receipts: false,
        ordersInTransit: false,
        ordersLate: false,
        ordersReadyToReceive: false,
        ordersReceived: false,
        newOrderFlags: false,
        newReceiptFlags: false,
        price: false,
        regime: true, // regime has data
      },
    };

    renderChart({
      chartModelOverride: regimeChartModel,
      initialSettings,
    });

    // Should create a series for regime in pane-1 (index 1)
    expect(chartMockState.addSeries).toHaveBeenCalledWith(
      'LineSeries',
      expect.objectContaining({
        color: 'rgba(0,0,0,0)',
        lastValueVisible: false,
        priceLineVisible: false,
      }),
      1, // paneIndex 1 (pane-1)
    );
  });

  it('renders regime icons when regime is in its own pane', () => {
    if (/jsdom/i.test(navigator.userAgent)) {
      return;
    }

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
        inventory: false,
        uncertainty: false,
        reorderPoint: false,
        safetyStock: false,
        demand: false,
        receipts: false,
        ordersInTransit: false,
        ordersLate: false,
        ordersReadyToReceive: false,
        ordersReceived: false,
        newOrderFlags: false,
        newReceiptFlags: false,
        price: false,
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
      }),
      1,
    );
  });

  it('keeps the right price scale visible for a regime-only pane anchor', () => {
    vi.stubGlobal('navigator', { userAgent: 'unit-test' });

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
        inventory: false,
        uncertainty: false,
        reorderPoint: false,
        safetyStock: false,
        demand: false,
        receipts: false,
        ordersInTransit: false,
        ordersLate: false,
        ordersReadyToReceive: false,
        ordersReceived: false,
        newOrderFlags: false,
        newReceiptFlags: false,
        price: false,
        regime: true,
      },
    };

    renderChart({
      chartModelOverride: regimeChartModel,
      initialSettings,
    });

    expect(chartMockState.priceScaleApplyOptions.get('right:1')).toHaveBeenCalledWith(
      expect.objectContaining({ visible: true, borderVisible: true }),
    );
  });
});
