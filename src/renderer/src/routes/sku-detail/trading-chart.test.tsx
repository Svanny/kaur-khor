import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { localizedChartInputSourceLabel } from '@/components/system/chart-series-config';
import {
  buildOverlayIconClusters,
  deriveTradingChartMinRenderHeight,
  LAYOUT_SORTABLE_STRATEGY,
  LAYOUT_SORTABLE_TRANSITION,
  layoutPaneListsEqual,
  moveIndicatorInPaneLayout,
  paneHeightAllocation,
  resolveLayoutDragOverPaneLayout,
  resolveLayoutDropPlacement,
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
  type TradingChartPaneLayout,
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
  chartElement: null as HTMLElement | null,
  paneCount: 1,
  priceScaleApplyOptions: new Map<string, ReturnType<typeof vi.fn>>(),
  seriesApplyOptions: [] as ReturnType<typeof vi.fn>[],
}));

const preferenceState = vi.hoisted(() => ({
  dimChartsWhileLoading: true,
  language: 'en',
}));

vi.mock('@/state/preferences', () => ({
  usePreferences: () => preferenceState,
}));

beforeEach(() => {
  preferenceState.dimChartsWhileLoading = true;
  preferenceState.language = 'en';
});

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
  chartMockState.chartElement = null;
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
    chartMockState.chartElement = document.createElement('div');
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
      chartElement: vi.fn(() => chartMockState.chartElement ?? document.createElement('div')),
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

function buildAvailability(overrides: Partial<TradingChartModel['availability']> = {}): TradingChartModel['availability'] {
  return {
    inventory: false,
    uncertainty: false,
    reorderPoint: false,
    safetyStock: false,
    demand: false,
    serviceDemand: false,
    retailDemand: false,
    availableCapacity: false,
    demandMinusAvailableCapacity: false,
    receipts: false,
    ordersInTransit: false,
    ordersLate: false,
    ordersReadyToReceive: false,
    ordersReceived: false,
    newOrderFlags: false,
    newReceiptFlags: false,
    price: false,
    leadTime: false,
    leadTimeRange: false,
    regime: false,
    ...overrides,
  };
}

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
      availableCapacity: null,
      demandMinusAvailableCapacity: null,
      receiptsMean: null,
      adjustmentsMean: null,
      ordersInTransitMean: null,
      ordersLateMean: null,
      ordersReadyToReceiveMean: null,
      ordersReceivedMean: null,
      newOrderFlag: null,
      newReceiptFlag: null,
      price: null,
      leadTimeMean: null,
      leadTimeLow: null,
      leadTimeHigh: null,
      dominantRegime: null,
    },
  ],
  pointByIntervalIndex: new Map(),
  pointByTimeKey: new Map(),
  availability: buildAvailability({
    inventory: true,
    uncertainty: true,
    reorderPoint: true,
    safetyStock: true,
  }),
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
  initialPaneHeights = null,
  initialSettings,
  isBusy = false,
  isVisuallyBusy,
  initialVisibleDateRange = null,
  isLoadingOlderIntervals = false,
  loadOlderIntervals = vi.fn(async () => null),
  onChartResolutionChange = vi.fn(),
  onCustomTimeframeChange = vi.fn(),
  onPaneHeightsChange = vi.fn(),
  onSelectInterval = vi.fn(),
  onToggleExpand = vi.fn(),
  onVisibleDateRangeChange = vi.fn(),
  selectedIntervalIndex = 0,
  timeframe = 'Recent',
}: {
  chartModelOverride?: TradingChartModel;
  customTimeframeRange?: { startAt: string; endAt: string } | null;
  expanded?: boolean;
  hasOlderIntervals?: boolean;
  initialPaneHeights?: Record<string, number> | null;
  initialSettings?: TradingChartIndicatorSettings;
  isBusy?: boolean;
  isVisuallyBusy?: boolean;
  initialVisibleDateRange?: { startAt: string; endAt: string } | null;
  isLoadingOlderIntervals?: boolean;
  loadOlderIntervals?: () => Promise<unknown>;
  onChartResolutionChange?: (value: 'H' | '1D' | '1W' | '1M' | '3M' | '1Y' | 'Custom', custom: { amount: number; unit: 'm' | 'H' | 'D' | 'W' | 'M' | 'Y'; expression: string } | null) => void;
  onCustomTimeframeChange?: (range: { startAt: string; endAt: string } | null) => void;
  onPaneHeightsChange?: (paneHeights: Record<string, number>, source: 'manual') => void;
  onSelectInterval?: (index: number) => void;
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
      initialPaneHeights={initialPaneHeights}
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
      onSelectInterval={onSelectInterval}
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
    onSelectInterval,
    onToggleExpand,
    onVisibleDateRangeChange,
    setIndicatorSettings,
  };
}

describe('SkuTradingChart settings', () => {
  it('merges dense supplier order icons into clustered markers', () => {
    const clusters = buildOverlayIconClusters([
      { indicatorId: 'newOrderFlags', groupKey: 'newOrderFlags', intervalIndex: 1, x: 100 },
      { indicatorId: 'newOrderFlags', groupKey: 'newOrderFlags', intervalIndex: 2, x: 116 },
      { indicatorId: 'newOrderFlags', groupKey: 'newOrderFlags', intervalIndex: 3, x: 132 },
    ]);

    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toEqual(expect.objectContaining({
      indicatorId: 'newOrderFlags',
      count: 3,
      firstIntervalIndex: 1,
      lastIntervalIndex: 3,
    }));
    expect(clusters[0]?.right).toBeGreaterThan(clusters[0]?.left ?? 0);
  });

  it('drops non-finite overlay icon coordinates before clustering', () => {
    const clusters = buildOverlayIconClusters([
      { indicatorId: 'newOrderFlags', groupKey: 'newOrderFlags', intervalIndex: 1, x: Number.NaN },
      { indicatorId: 'newOrderFlags', groupKey: 'newOrderFlags', intervalIndex: 2, x: Number.POSITIVE_INFINITY },
      { indicatorId: 'newOrderFlags', groupKey: 'newOrderFlags', intervalIndex: 3, x: 132 },
    ]);

    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toEqual(expect.objectContaining({
      count: 1,
      firstIntervalIndex: 3,
      lastIntervalIndex: 3,
    }));
    expect(Number.isFinite(clusters[0]?.left)).toBe(true);
    expect(Number.isFinite(clusters[0]?.right)).toBe(true);
  });

  it('merges dense supplier receipt icons with the same collision rule', () => {
    const clusters = buildOverlayIconClusters([
      { indicatorId: 'newReceiptFlags', groupKey: 'newReceiptFlags', intervalIndex: 4, x: 200 },
      { indicatorId: 'newReceiptFlags', groupKey: 'newReceiptFlags', intervalIndex: 5, x: 218 },
    ]);

    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toEqual(expect.objectContaining({
      indicatorId: 'newReceiptFlags',
      count: 2,
      firstIntervalIndex: 4,
      lastIntervalIndex: 5,
    }));
  });

  it('keeps regime icon clusters split by dominant regime', () => {
    const clusters = buildOverlayIconClusters([
      { indicatorId: 'regime', groupKey: 'normal', intervalIndex: 1, x: 100 },
      { indicatorId: 'regime', groupKey: 'normal', intervalIndex: 2, x: 116 },
      { indicatorId: 'regime', groupKey: 'spike', intervalIndex: 3, x: 132 },
    ]);

    expect(clusters.map((cluster) => ({
      groupKey: cluster.groupKey,
      count: cluster.count,
      firstIntervalIndex: cluster.firstIntervalIndex,
      lastIntervalIndex: cluster.lastIntervalIndex,
    }))).toEqual([
      { groupKey: 'normal', count: 2, firstIntervalIndex: 1, lastIntervalIndex: 2 },
      { groupKey: 'spike', count: 1, firstIntervalIndex: 3, lastIntervalIndex: 3 },
    ]);
  });

  it('does not merge non-contiguous runs of the same regime', () => {
    const clusters = buildOverlayIconClusters([
      { indicatorId: 'regime', groupKey: 'normal', intervalIndex: 1, x: 100 },
      { indicatorId: 'regime', groupKey: 'spike', intervalIndex: 2, x: 116 },
      { indicatorId: 'regime', groupKey: 'normal', intervalIndex: 3, x: 132 },
    ]);

    expect(clusters.map((cluster) => ({
      groupKey: cluster.groupKey,
      count: cluster.count,
      firstIntervalIndex: cluster.firstIntervalIndex,
      lastIntervalIndex: cluster.lastIntervalIndex,
    }))).toEqual([
      { groupKey: 'normal', count: 1, firstIntervalIndex: 1, lastIntervalIndex: 1 },
      { groupKey: 'spike', count: 1, firstIntervalIndex: 2, lastIntervalIndex: 2 },
      { groupKey: 'normal', count: 1, firstIntervalIndex: 3, lastIntervalIndex: 3 },
    ]);
  });

  it('merges different overlapping overlay indicators into one segmented pill', () => {
    const clusters = buildOverlayIconClusters([
      { indicatorId: 'newOrderFlags', groupKey: 'newOrderFlags', intervalIndex: 1, x: 100 },
      { indicatorId: 'newReceiptFlags', groupKey: 'newReceiptFlags', intervalIndex: 1, x: 100 },
    ]);

    expect(clusters.map((cluster) => cluster.indicatorId)).toEqual(['newOrderFlags', 'newReceiptFlags']);

    const markers = stackOverlayFlagMarkers(clusters.map((cluster) => ({
      key: `${cluster.indicatorId}:${cluster.firstIntervalIndex}-${cluster.lastIntervalIndex}`,
      indicatorId: cluster.indicatorId,
      paneId: 'main',
      intervalIndex: cluster.lastIntervalIndex,
      layerOrder: cluster.indicatorId === 'newOrderFlags' ? 1 : 2,
      left: cluster.left,
      width: Math.max(28, cluster.right - cluster.left),
      color: '#000',
      label: cluster.indicatorId,
      onClick: vi.fn(),
      icon: vi.fn() as never,
      clustered: cluster.count > 1,
    })));

    expect(markers).toHaveLength(1);
    expect(markers[0]?.bottom).toBe(6);
    expect(markers[0]?.left).toBe(64.5);
    expect(markers[0]?.width).toBe(71);
    expect(markers[0]?.segments.map((segment) => segment.indicatorId)).toEqual(['newOrderFlags', 'newReceiptFlags']);
  });

  it('keeps overlapping overlay flags in one bottom-aligned pill ordered by layer', () => {
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
        label: 'Supplier order activity',
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
        label: 'Supplier receipt activity',
        onClick: vi.fn(),
        icon: vi.fn() as never,
      },
    ]);

    expect(markers).toHaveLength(1);
    expect(markers[0]?.bottom).toBe(6);
    expect(markers[0]?.left).toBe(-29);
    expect(markers[0]?.width).toBe(106);
    expect(markers[0]?.segments.map((segment) => segment.indicatorId)).toEqual(['newOrderFlags', 'newReceiptFlags', 'regime']);
  });

  it('uses icon footprint, not interval width, to decide overlay flag collisions', () => {
    const markers = stackOverlayFlagMarkers([
      {
        key: 'first',
        indicatorId: 'newOrderFlags',
        paneId: 'main',
        intervalIndex: 1,
        layerOrder: 1,
        left: 0,
        width: 100,
        collisionLeft: 36,
        collisionWidth: 28,
        color: '#000',
        label: 'Supplier order activity',
        onClick: vi.fn(),
        icon: vi.fn() as never,
      },
      {
        key: 'second',
        indicatorId: 'newOrderFlags',
        paneId: 'main',
        intervalIndex: 2,
        layerOrder: 1,
        left: 100,
        width: 100,
        collisionLeft: 136,
        collisionWidth: 28,
        color: '#000',
        label: 'Supplier order activity',
        onClick: vi.fn(),
        icon: vi.fn() as never,
      },
    ]);

    expect(markers).toHaveLength(2);
    expect(markers.map((marker) => marker.width)).toEqual([100, 100]);
  });

  it('keeps compact overlay flags aligned to their interval cells', () => {
    const markers = stackOverlayFlagMarkers([
      {
        key: 'order:first',
        indicatorId: 'newOrderFlags',
        paneId: 'main',
        intervalIndex: 1,
        layerOrder: 1,
        left: 90,
        width: 20,
        collisionLeft: 90,
        collisionWidth: 20,
        color: '#000',
        label: 'Supplier order activity',
        onClick: vi.fn(),
        icon: vi.fn() as never,
        compact: true,
      },
      {
        key: 'order:second',
        indicatorId: 'newOrderFlags',
        paneId: 'main',
        intervalIndex: 2,
        layerOrder: 1,
        left: 110,
        width: 20,
        collisionLeft: 110,
        collisionWidth: 20,
        color: '#000',
        label: 'Supplier order activity',
        onClick: vi.fn(),
        icon: vi.fn() as never,
        compact: true,
      },
      {
        key: 'receipt:second',
        indicatorId: 'newReceiptFlags',
        paneId: 'main',
        intervalIndex: 2,
        layerOrder: 2,
        left: 110,
        width: 20,
        collisionLeft: 110,
        collisionWidth: 20,
        color: '#000',
        label: 'Supplier receipt activity',
        onClick: vi.fn(),
        icon: vi.fn() as never,
        compact: true,
      },
    ]);

    expect(markers).toHaveLength(1);
    expect(markers[0]?.left).toBe(90);
    expect(markers[0]?.width).toBe(40);
    expect(markers[0]?.segmentLayout).toEqual([
      { key: 'order:first', left: 0, width: 20 },
      { key: 'order:second', left: 20, width: 10 },
      { key: 'receipt:second', left: 30, width: 10 },
    ]);
  });

  it('computes same-pane layout drag placements after hovered row midpoints', () => {
    const panes: TradingChartPaneLayout[] = [{
      id: 'main',
      indicatorIds: ['inventory', 'uncertainty', 'regime'],
    }];

    expect(resolveLayoutDropPlacement({
      activeCenterY: 150,
      activeIndicatorId: 'inventory',
      nextPaneId: 'pane-11',
      overRect: { top: 100, height: 40 },
      panes,
      target: { type: 'row', indicatorId: 'uncertainty' },
    })).toEqual({ paneId: 'main', index: 1 });

    expect(resolveLayoutDropPlacement({
      activeCenterY: 210,
      activeIndicatorId: 'inventory',
      nextPaneId: 'pane-11',
      overRect: { top: 160, height: 40 },
      panes,
      target: { type: 'row', indicatorId: 'regime' },
    })).toEqual({ paneId: 'main', index: 2 });
  });

  it('updates same-pane layout draft order while dragging over rows', () => {
    const panes: TradingChartPaneLayout[] = [{
      id: 'main',
      indicatorIds: ['inventory', 'uncertainty', 'regime'],
    }];

    expect(resolveLayoutDragOverPaneLayout({
      activeCenterY: 150,
      activeId: 'layout:row:inventory',
      indicatorId: 'inventory',
      nextPaneId: 'pane-11',
      overId: 'layout:row:uncertainty',
      overRect: { top: 100, height: 40 },
      panes,
    })[0]?.indicatorIds).toEqual(['uncertainty', 'inventory', 'regime']);

    expect(resolveLayoutDragOverPaneLayout({
      activeCenterY: 210,
      activeId: 'layout:row:inventory',
      indicatorId: 'inventory',
      nextPaneId: 'pane-11',
      overId: 'layout:row:regime',
      overRect: { top: 160, height: 40 },
      panes,
    })[0]?.indicatorIds).toEqual(['uncertainty', 'regime', 'inventory']);
  });

  it('ignores same-pane pane hits so row and pane collisions cannot oscillate', () => {
    const panes: TradingChartPaneLayout[] = [
      { id: 'main', indicatorIds: ['inventory'] },
      { id: 'pane-1', indicatorIds: ['demand', 'regime'] },
    ];

    expect(resolveLayoutDropPlacement({
      activeCenterY: null,
      activeIndicatorId: 'demand',
      nextPaneId: 'pane-11',
      overRect: null,
      panes,
      target: { type: 'pane', paneId: 'pane-1' },
    })).toBeNull();

    const nextPanes = resolveLayoutDragOverPaneLayout({
      activeCenterY: null,
      activeId: 'layout:row:demand',
      indicatorId: 'demand',
      nextPaneId: 'pane-11',
      overId: 'layout:pane:pane-1',
      overRect: null,
      panes,
    });

    expect(layoutPaneListsEqual(nextPanes, panes)).toBe(true);
  });

  it('updates cross-pane layout draft order to the hovered row position', () => {
    const panes: TradingChartPaneLayout[] = [
      { id: 'main', indicatorIds: ['inventory'] },
      { id: 'pane-1', indicatorIds: ['demand', 'regime'] },
      { id: 'pane-2', indicatorIds: ['ordersReceived'] },
    ];

    const nextPanes = resolveLayoutDragOverPaneLayout({
      activeCenterY: 110,
      activeId: 'layout:row:ordersReceived',
      indicatorId: 'ordersReceived',
      nextPaneId: 'pane-11',
      overId: 'layout:row:regime',
      overRect: { top: 100, height: 40 },
      panes,
    });

    expect(nextPanes).toEqual([
      { id: 'main', indicatorIds: ['inventory'] },
      { id: 'pane-1', indicatorIds: ['demand', 'ordersReceived', 'regime'] },
      { id: 'pane-2', indicatorIds: [] },
    ]);
  });

  it('updates layout draft order into empty and new panes', () => {
    const panes: TradingChartPaneLayout[] = [
      { id: 'main', indicatorIds: ['inventory'] },
      { id: 'pane-1', indicatorIds: ['demand'] },
      { id: 'pane-11', indicatorIds: [] },
    ];

    expect(resolveLayoutDragOverPaneLayout({
      activeCenterY: null,
      activeId: 'layout:row:inventory',
      indicatorId: 'inventory',
      nextPaneId: 'pane-12',
      overId: 'layout:pane:pane-11',
      overRect: null,
      panes,
    })).toEqual([
      { id: 'main', indicatorIds: [] },
      { id: 'pane-1', indicatorIds: ['demand'] },
      { id: 'pane-11', indicatorIds: ['inventory'] },
    ]);

    expect(resolveLayoutDragOverPaneLayout({
      activeCenterY: null,
      activeId: 'layout:row:inventory',
      indicatorId: 'inventory',
      nextPaneId: 'pane-12',
      overId: 'layout:new-pane',
      overRect: null,
      panes,
    })).toEqual([
      { id: 'main', indicatorIds: [] },
      { id: 'pane-1', indicatorIds: ['demand'] },
      { id: 'pane-11', indicatorIds: [] },
      { id: 'pane-12', indicatorIds: ['inventory'] },
    ]);
  });

  it('keeps source panes present when layout draft movement empties them', () => {
    const panes: TradingChartPaneLayout[] = [
      { id: 'main', indicatorIds: ['inventory'] },
      { id: 'pane-1', indicatorIds: ['demand'] },
    ];

    expect(moveIndicatorInPaneLayout(panes, 'demand', 'main', 1)).toEqual([
      { id: 'main', indicatorIds: ['inventory', 'demand'] },
      { id: 'pane-1', indicatorIds: [] },
    ]);
  });

  it('ignores layout drag over events without a placement change', () => {
    const panes: TradingChartPaneLayout[] = [{
      id: 'main',
      indicatorIds: ['inventory', 'uncertainty'],
    }];
    const nextPanes = resolveLayoutDragOverPaneLayout({
      activeCenterY: null,
      activeId: 'layout:row:inventory',
      indicatorId: 'inventory',
      nextPaneId: 'pane-11',
      overId: 'layout:row:inventory',
      overRect: null,
      panes,
    });

    expect(layoutPaneListsEqual(nextPanes, panes)).toBe(true);
  });

  it('does not resolve adjacent same-pane row drops to the original source slot', () => {
    const panes: TradingChartPaneLayout[] = [{
      id: 'pane-1',
      indicatorIds: ['demand', 'regime', 'ordersReceived'],
    }];

    expect(resolveLayoutDropPlacement({
      activeCenterY: 150,
      activeIndicatorId: 'ordersReceived',
      nextPaneId: 'pane-11',
      overRect: { top: 100, height: 40 },
      panes,
      target: { type: 'row', indicatorId: 'regime' },
    })).toEqual({ paneId: 'pane-1', index: 1 });

    expect(resolveLayoutDropPlacement({
      activeCenterY: 110,
      activeIndicatorId: 'regime',
      nextPaneId: 'pane-11',
      overRect: { top: 100, height: 40 },
      panes,
      target: { type: 'row', indicatorId: 'ordersReceived' },
    })).toEqual({ paneId: 'pane-1', index: 2 });
  });

  it('computes cross-pane and empty-pane layout drag placements', () => {
    const panes: TradingChartPaneLayout[] = [
      { id: 'main', indicatorIds: ['inventory'] },
      { id: 'pane-1', indicatorIds: ['demand', 'serviceDemand'] },
      { id: 'pane-11', indicatorIds: [] },
    ];

    expect(resolveLayoutDropPlacement({
      activeCenterY: 150,
      activeIndicatorId: 'inventory',
      nextPaneId: 'pane-12',
      overRect: { top: 100, height: 40 },
      panes,
      target: { type: 'row', indicatorId: 'demand' },
    })).toEqual({ paneId: 'pane-1', index: 1 });

    expect(resolveLayoutDropPlacement({
      activeCenterY: null,
      activeIndicatorId: 'inventory',
      nextPaneId: 'pane-12',
      overRect: null,
      panes,
      target: { type: 'pane', paneId: 'pane-11' },
    })).toEqual({ paneId: 'pane-11', index: 0 });
  });

  it('keeps layout drag motion aligned with the POS sortable profile', () => {
    expect(LAYOUT_SORTABLE_TRANSITION).toEqual({
      duration: 240,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    });
  });

  it('uses a vertical list strategy for chart layout rows', () => {
    expect(LAYOUT_SORTABLE_STRATEGY.name).toBe('verticalListSortingStrategy');
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

  it('rejects impossible custom timeframe dates instead of rolling them forward', async () => {
    const user = userEvent.setup();
    const onCustomTimeframeChange = vi.fn();

    renderChart({ onCustomTimeframeChange });

    await user.click(screen.getByRole('button', { name: 'Custom duration' }));
    fireEvent.change(screen.getByLabelText('Custom timeframe start date'), { target: { value: '2026-02-31' } });
    fireEvent.change(screen.getByLabelText('Custom timeframe end date'), { target: { value: '2026-03-23' } });
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    expect(onCustomTimeframeChange).not.toHaveBeenCalled();
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

  it('debounces visible-range updates without persisting passive pane measurements', async () => {
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

      expect(onPaneHeightsChange).not.toHaveBeenCalled();
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

    expect(screen.getByTestId('sku-trading-chart').parentElement).toHaveStyle({
      minHeight: `${deriveTradingChartMinRenderHeight(2)}px`,
    });
    expect(screen.getByTestId('sku-trading-chart')).toHaveStyle({
      minHeight: `${deriveTradingChartMinRenderHeight(2)}px`,
    });
  });

  it('uses default pane allocation on mount when no manual pane heights exist', async () => {
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

  it('restores manual pane heights when a confirmed manual layout exists', async () => {
    vi.stubGlobal('navigator', { userAgent: 'unit-test' });

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
      initialPaneHeights: { main: 320, 'pane-1': 120, 'pane-2': 180 },
      initialSettings,
    });

    await waitFor(() => expect(chartMockState.paneHeights).toEqual([324, 122, 182]));
  });

  it('persists pane heights only after a manual pane resize interaction', async () => {
    vi.stubGlobal('navigator', { userAgent: 'unit-test' });

    const onPaneHeightsChange = vi.fn();
    const initialSettings = defaultTradingChartIndicators();
    initialSettings.demand.enabled = true;
    const demandChartModel: TradingChartModel = {
      ...chartModel,
      points: [{
        ...chartModel.points[0]!,
        serviceDemandMean: 3,
      }],
      availability: {
        ...chartModel.availability,
        demand: true,
      },
    };

    renderChart({
      chartModelOverride: demandChartModel,
      initialSettings,
      onPaneHeightsChange,
    });

    await waitFor(() => expect(chartMockState.paneHeights).toEqual([381, 127]));
    expect(onPaneHeightsChange).not.toHaveBeenCalled();

    chartMockState.paneHeights = [320, 188];
    const resizeHandle = document.createElement('div');
    resizeHandle.setAttribute('role', 'separator');
    chartMockState.chartElement?.appendChild(resizeHandle);
    fireEvent.pointerDown(resizeHandle);

    await waitFor(() => expect(onPaneHeightsChange).toHaveBeenCalledWith({ main: 320, 'pane-1': 188 }, 'manual'));
  });

  it('preserves pane-count minimum height in expanded chart windows', () => {
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
      expanded: true,
      initialSettings,
    });

    expect(screen.getByTestId('sku-trading-chart').parentElement).toHaveStyle({
      minHeight: `${deriveTradingChartMinRenderHeight(2)}px`,
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

  it('keeps the chart fully visible while loading when the dim preference is off', () => {
    preferenceState.dimChartsWhileLoading = false;

    renderChart({ isBusy: true });

    expect(screen.getByTestId('sku-trading-chart').parentElement).not.toHaveClass('opacity-45');
    expect(screen.getByTestId('sku-trading-chart').parentElement).toHaveAttribute('data-busy', 'true');
    expect(screen.getByTestId('sku-trading-chart').parentElement?.lastElementChild).not.toHaveClass('pointer-events-none');
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

    expect(screen.getByText('Supplier orders in transit')).toBeInTheDocument();
    expect(screen.queryByText('42.00u')).not.toBeInTheDocument();
  });

  it('localizes Khmer chart status values and input source labels without changing source values', async () => {
    preferenceState.language = 'km';
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      value: 320,
    });
    const initialSettings = defaultTradingChartIndicators();
    initialSettings.ordersInTransit.enabled = true;
    initialSettings.ordersInTransit.paneId = 'main';
    initialSettings.newOrderFlags.enabled = true;
    initialSettings.regime.enabled = true;

    const ordersChartModel: TradingChartModel = {
      ...chartModel,
      points: [{
        ...chartModel.points[0]!,
        dominantRegime: 'normal',
        ordersInTransitMean: 42,
        newOrderFlag: 3,
      }],
      pointByIntervalIndex: new Map([[0, {
        ...chartModel.points[0]!,
        dominantRegime: 'normal',
        ordersInTransitMean: 42,
        newOrderFlag: 3,
      }]]),
      pointByTimeKey: new Map([[String(chartModel.points[0]!.time), {
        ...chartModel.points[0]!,
        dominantRegime: 'normal',
        ordersInTransitMean: 42,
        newOrderFlag: 3,
      }]]),
      availability: {
        ...chartModel.availability,
        newOrderFlags: true,
        ordersInTransit: true,
        regime: true,
      },
    };

    renderChart({
      chartModelOverride: ordersChartModel,
      initialSettings,
    });

    expect(screen.getByText('42 ឯកតា')).toBeInTheDocument();
    expect(screen.getByLabelText('រយៈពេលក្រាហ្វ')).toBeInTheDocument();
    expect(screen.getByLabelText('ចន្លោះពេលក្រាហ្វ')).toBeInTheDocument();
    expect(await screen.findByLabelText('សញ្ញាក្រាហ្វ')).toBeInTheDocument();
    expect(screen.queryByLabelText('Chart flags')).not.toBeInTheDocument();
    expect(screen.getByText('រយៈពេល')).not.toHaveClass('uppercase', 'tracking-[0.12em]');
    expect(localizedChartInputSourceLabel('km', 'open')).toBe('តម្លៃបើក');
    expect(localizedChartInputSourceLabel('km', 'ohlc4')).toBe('មធ្យមតម្លៃបើក ខ្ពស់ ទាប និងបិទ');
    expect(localizedChartInputSourceLabel('en', 'ohlc4')).toBe('(O + H + L + C)/4');
  });

  it('renders overlapping chart flags as one segmented pill with selectable segments', async () => {
    vi.stubGlobal('navigator', { userAgent: 'unit-test' });
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      value: 320,
    });
    const onSelectInterval = vi.fn();
    const initialSettings = defaultTradingChartIndicators();
    initialSettings.regime.enabled = true;
    initialSettings.regime.paneId = 'main';
    initialSettings.regime.layerOrder = 3;
    initialSettings.newOrderFlags.enabled = true;
    initialSettings.newOrderFlags.paneId = 'main';
    initialSettings.newOrderFlags.layerOrder = 1;
    initialSettings.newReceiptFlags.enabled = true;
    initialSettings.newReceiptFlags.paneId = 'main';
    initialSettings.newReceiptFlags.layerOrder = 2;

    const point = {
      ...chartModel.points[0]!,
      dominantRegime: 'normal',
      newOrderFlag: 1,
      newReceiptFlag: 1,
    };
    const flaggedChartModel: TradingChartModel = {
      ...chartModel,
      points: [point],
      pointByIntervalIndex: new Map([[0, point]]),
      pointByTimeKey: new Map([[String(point.time), point]]),
      availability: {
        ...chartModel.availability,
        regime: true,
        newOrderFlags: true,
        newReceiptFlags: true,
      },
    };

    renderChart({
      chartModelOverride: flaggedChartModel,
      initialSettings,
      onSelectInterval,
    });

    const flagGroup = await screen.findByRole('group', { name: /Supplier order activity, Supplier receipt activity/ });
    expect(flagGroup).toHaveStyle({ width: '106px' });
    expect(within(flagGroup).getAllByRole('button')).toHaveLength(3);
    const orderButton = within(flagGroup).getByRole('button', { name: 'Select Supplier order activity' });
    const receiptButton = within(flagGroup).getByRole('button', { name: 'Select Supplier receipt activity' });
    expect(orderButton).toHaveClass('rounded-l-full', 'rounded-r-none');
    expect(receiptButton).toHaveClass('border-l-border/70');
    expect(receiptButton).toHaveClass('rounded-l-none', 'rounded-r-none');

    await userEvent.click(receiptButton);

    expect(onSelectInterval).toHaveBeenCalledWith(0);
  });

  it('resizes attached chart flag pills after the chart time scale settles on zoom', async () => {
    vi.stubGlobal('navigator', { userAgent: 'unit-test' });
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      value: 320,
    });
    const initialSettings = defaultTradingChartIndicators();
    initialSettings.newOrderFlags.enabled = true;
    initialSettings.newOrderFlags.paneId = 'main';
    initialSettings.newOrderFlags.layerOrder = 1;
    initialSettings.newReceiptFlags.enabled = true;
    initialSettings.newReceiptFlags.paneId = 'main';
    initialSettings.newReceiptFlags.layerOrder = 2;

    const baseModel = multiPointChartModel(2);
    const firstPoint = { ...baseModel.points[0]!, newOrderFlag: 1 };
    const secondPoint = { ...baseModel.points[1]!, newOrderFlag: 1, newReceiptFlag: 1 };
    const flaggedChartModel: TradingChartModel = {
      ...baseModel,
      points: [firstPoint, secondPoint],
      pointByIntervalIndex: new Map([
        [firstPoint.intervalIndex, firstPoint],
        [secondPoint.intervalIndex, secondPoint],
      ]),
      pointByTimeKey: new Map([
        [String(firstPoint.time), firstPoint],
        [String(secondPoint.time), secondPoint],
      ]),
      availability: {
        ...baseModel.availability,
        newOrderFlags: true,
        newReceiptFlags: true,
      },
    };
    const coordinateForTime = new Map<unknown, number>([
      [firstPoint.time, 100],
      [secondPoint.time, 128],
    ]);
    renderChart({
      chartModelOverride: flaggedChartModel,
      initialSettings,
    });
    chartMockState.timeToCoordinate.mockImplementation(function () {
      return coordinateForTime.get(arguments[0]) ?? 100;
    });

    const overlayRangeHandler = chartMockState.visibleRangeHandlers.at(-1);
    expect(overlayRangeHandler).toBeDefined();
    act(() => {
      overlayRangeHandler?.({ from: 0, to: 1 });
    });

    await waitFor(() => {
      expect(screen.getByRole('group', { name: /Supplier order activity/ })).toHaveStyle({ width: '99px' });
    });

    act(() => {
      overlayRangeHandler?.({ from: 0, to: 1 });
      coordinateForTime.set(secondPoint.time, 136);
    });

    await waitFor(() => {
      expect(screen.getByRole('group', { name: /Supplier order activity/ })).toHaveStyle({ width: '107px' });
    });
  });

  it('renders narrow interval chart flags as color-only pills instead of icons', async () => {
    vi.stubGlobal('navigator', { userAgent: 'unit-test' });
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      value: 320,
    });
    const initialSettings = defaultTradingChartIndicators();
    initialSettings.newOrderFlags.enabled = true;
    initialSettings.newOrderFlags.paneId = 'main';
    initialSettings.newOrderFlags.layerOrder = 1;
    initialSettings.newReceiptFlags.enabled = true;
    initialSettings.newReceiptFlags.paneId = 'main';
    initialSettings.newReceiptFlags.layerOrder = 2;

    const baseModel = multiPointChartModel(2);
    const firstPoint = { ...baseModel.points[0]!, newOrderFlag: 1 };
    const secondPoint = { ...baseModel.points[1]!, newOrderFlag: 1, newReceiptFlag: 1 };
    const flaggedChartModel: TradingChartModel = {
      ...baseModel,
      points: [firstPoint, secondPoint],
      pointByIntervalIndex: new Map([
        [firstPoint.intervalIndex, firstPoint],
        [secondPoint.intervalIndex, secondPoint],
      ]),
      pointByTimeKey: new Map([
        [String(firstPoint.time), firstPoint],
        [String(secondPoint.time), secondPoint],
      ]),
      availability: {
        ...baseModel.availability,
        newOrderFlags: true,
        newReceiptFlags: true,
      },
    };
    const coordinateForTime = new Map<unknown, number>([
      [firstPoint.time, 100],
      [secondPoint.time, 120],
    ]);
    renderChart({
      chartModelOverride: flaggedChartModel,
      initialSettings,
    });
    chartMockState.timeToCoordinate.mockImplementation(function () {
      return coordinateForTime.get(arguments[0]) ?? 100;
    });

    const overlayRangeHandler = chartMockState.visibleRangeHandlers.at(-1);
    act(() => {
      overlayRangeHandler?.({ from: 0, to: 1 });
    });

    const flagGroup = await screen.findByRole('group', { name: /Supplier receipt activity/ });
    await waitFor(() => {
      expect(flagGroup).toHaveStyle({ width: '40px' });
    });
    const buttons = within(flagGroup).getAllByRole('button');
    expect(buttons).toHaveLength(3);
    expect(buttons[0]).toHaveStyle({ width: '20px' });
    expect(buttons[1]).toHaveStyle({ width: '10px' });
    expect(buttons[0]).toHaveClass('rounded-l-full', 'rounded-r-none');
    expect(buttons[2]).toHaveClass('rounded-l-none', 'rounded-r-full');
    expect(flagGroup.querySelector('svg')).toBeNull();
    expect(buttons[0]?.getAttribute('style')).toContain('color-mix');
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
  }, 10_000);

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
  }, 10_000);

  it('asks before switching from dirty settings to indicators', async () => {
    const user = userEvent.setup();
    const { setIndicatorSettings } = renderChart();

    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(screen.getByRole('button', { name: 'Inventory color' }));
    await user.click(screen.getByRole('button', { name: 'Use color #2962ff' }));
    await user.click(screen.getByRole('button', { name: 'Indicators' }));

    expect(screen.getByRole('dialog', { name: 'Apply chart changes' })).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Chart indicator settings' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Chart indicators' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Discard changes' }));

    expect(screen.queryByRole('dialog', { name: 'Chart indicator settings' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Chart indicators' })).toBeInTheDocument();
    expect(setIndicatorSettings).not.toHaveBeenCalled();
  }, 10_000);

  it('applies dirty settings before continuing to a dialog trigger clicked behind the overlay', async () => {
    const user = userEvent.setup();
    const { setIndicatorSettings } = renderChart();

    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(screen.getByRole('button', { name: 'Inventory color' }));
    await user.click(screen.getByRole('button', { name: 'Use color #2962ff' }));
    await user.click(screen.getByRole('button', { name: 'Indicators' }));
    await user.click(screen.getByRole('button', { name: 'Apply changes' }));

    expect(setIndicatorSettings).toHaveBeenCalledTimes(1);
    const nextSettings = setIndicatorSettings.mock.calls[0]?.[0] as TradingChartIndicatorSettings;
    expect(nextSettings.inventory.color).toBe('#2962ff');
    expect(screen.queryByRole('dialog', { name: 'Chart indicator settings' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Chart indicators' })).toBeInTheDocument();
  }, 10_000);

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
    await user.click(screen.getByRole('checkbox', { name: 'Show Customer demand' }));
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
    await user.click(screen.getByRole('button', { name: 'Delete Customer demand' }));
    await user.click(screen.getByRole('button', { name: 'Close layout' }));

    expect(screen.getByRole('dialog', { name: 'Apply chart changes' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Discard changes' }));

    expect(screen.queryByRole('dialog', { name: 'Chart layout' })).not.toBeInTheDocument();
    expect(setIndicatorSettings).not.toHaveBeenCalled();
  });

  it('dims the full UI when confirming dirty layout changes from another toolbar button', async () => {
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
    renderChart({
      chartModelOverride: demandChartModel,
      initialSettings,
    });

    await user.click(screen.getByRole('button', { name: 'Layout' }));
    await user.click(screen.getByRole('button', { name: 'Delete Customer demand' }));
    await user.click(screen.getByRole('button', { name: 'Settings' }));

    expect(screen.getAllByRole('dialog', { name: 'Apply chart changes' })).toHaveLength(1);
    expect(screen.getByTestId('chart-settings-leave-overlay')).toHaveClass('bg-black/40');
    expect(screen.getByRole('dialog', { name: 'Chart layout' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Chart indicator settings' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Keep editing' }));

    expect(screen.queryByRole('dialog', { name: 'Apply chart changes' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Chart layout' })).toBeInTheDocument();
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
    await act(async () => {
      chartMockState.visibleRangeHandler?.({ from: 5, to: 15 });
      await Promise.resolve();
    });

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
    await act(async () => {
      chartMockState.visibleRangeHandler?.({ from: 6, to: 16 });
      await Promise.resolve();
    });
    expect(loadOlderIntervals).not.toHaveBeenCalled();

    await act(async () => {
      chartMockState.visibleRangeHandler?.({ from: 5, to: 15 });
      await Promise.resolve();
    });

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
    await act(async () => {
      for (const handler of chartMockState.visibleRangeHandlers) {
        const callCount = loadOlderIntervals.mock.calls.length;
        handler({ from: 5, to: 15 });
        if (loadOlderIntervals.mock.calls.length > callCount) {
          break;
        }
      }
      await Promise.resolve();
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
    await user.click(screen.getByRole('button', { name: 'Delete Customer demand' }));
    await user.click(screen.getByRole('button', { name: 'Ok' }));

    expect(setIndicatorSettings).toHaveBeenCalledTimes(1);
    const nextSettings = setIndicatorSettings.mock.calls[0]?.[0] as TradingChartIndicatorSettings;
    expect(nextSettings.demand.enabled).toBe(false);
  });

  it('keeps layout drag activation on the row handle instead of row controls', async () => {
    const user = userEvent.setup();
    renderChart();

    await user.click(screen.getByRole('button', { name: 'Layout' }));

    expect(screen.getByRole('button', { name: 'Drag Inventory' })).toHaveAttribute('aria-roledescription');
    expect(screen.getByRole('combobox', { name: 'Inventory axis side' })).not.toHaveAttribute('aria-roledescription');
    expect(screen.getByRole('button', { name: 'Delete Inventory' })).not.toHaveAttribute('aria-roledescription');
  });

  it('adds a temporary empty layout pane without persisting it on ok', async () => {
    const user = userEvent.setup();
    const { setIndicatorSettings } = renderChart();

    await user.click(screen.getByRole('button', { name: 'Layout' }));
    expect(document.querySelectorAll('[data-testid^="chart-layout-pane-"]')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'New pane' }));

    expect(document.querySelectorAll('[data-testid^="chart-layout-pane-"]')).toHaveLength(2);
    expect(screen.getByTestId('chart-layout-pane-pane-11')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ok' }));

    expect(setIndicatorSettings).not.toHaveBeenCalled();
  });

  it('keeps a layout pane placeholder when the last row is deleted', async () => {
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
    expect(screen.getByTestId('chart-layout-pane-pane-1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete Customer demand' }));

    expect(screen.getByTestId('chart-layout-pane-pane-1')).toBeInTheDocument();

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
    const demandColor = screen.getByLabelText('Customer demand color');

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

    expect(screen.queryByLabelText('Show Customer demand')).toBeNull();
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
      availability: buildAvailability({ regime: true }),
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
      availability: buildAvailability({ regime: true }),
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
      availability: buildAvailability({ regime: true }),
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
