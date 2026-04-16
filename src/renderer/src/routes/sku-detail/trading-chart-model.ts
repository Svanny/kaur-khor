import type { Time, UTCTimestamp } from 'lightweight-charts';
import {
  bucketTimestampForResolution,
  type ChartResolutionSpec,
} from '@/components/system/chart-resolution';
import type { ChartInputValueSource } from '@/components/system/chart-series-config';
import type { SenaSkuDetailPipelineChartInterval, SenaSkuDetailViewModel } from './view-model';

export type TradingChartIndicatorId =
  | 'inventory'
  | 'uncertainty'
  | 'reorderPoint'
  | 'safetyStock'
  | 'demand'
  | 'serviceDemand'
  | 'retailDemand'
  | 'availableCapacity'
  | 'demandMinusAvailableCapacity'
  | 'receipts'
  | 'ordersInTransit'
  | 'ordersLate'
  | 'ordersReadyToReceive'
  | 'ordersReceived'
  | 'newOrderFlags'
  | 'newReceiptFlags'
  | 'price'
  | 'leadTime'
  | 'leadTimeRange'
  | 'regime';

export type TradingChartIndicatorLineStyle = 'solid' | 'dashed' | 'dotted';
export type TradingChartIndicatorScale = 'primary' | 'overlay' | 'price';
export type TradingChartIndicatorAxisSide = 'left' | 'right';
export type TradingChartIndicatorPlotStyle =
  | 'area'
  | 'line'
  | 'step-line'
  | 'band'
  | 'lines'
  | 'price-line'
  | 'histogram'
  | 'bars'
  | 'candles'
  | 'columns'
  | 'icons'
  | 'background-highlight'
  | 'background-highlight-icons';
export type TradingChartIndicatorPrecision = 'default' | '0' | '1' | '2';

export interface TradingChartIndicatorSetting {
  enabled: boolean;
  color: string;
  paneId: string;
  layerOrder: number;
  axisSide: TradingChartIndicatorAxisSide;
  lineStyle?: TradingChartIndicatorLineStyle;
  lineWidth?: number;
  opacity?: number;
  plotStyle: TradingChartIndicatorPlotStyle;
  inputSource?: ChartInputValueSource;
  precision?: TradingChartIndicatorPrecision;
  showPriceScaleLabel?: boolean;
  showStatusLineValue?: boolean;
  showInputValuesInStatusLine?: boolean;
  scale?: TradingChartIndicatorScale;
}

export type TradingChartIndicatorSettings = Record<TradingChartIndicatorId, TradingChartIndicatorSetting>;
export interface TradingChartPaneLayout {
  id: string;
  indicatorIds: TradingChartIndicatorId[];
}

export interface TradingChartPoint {
  intervalIndex: number;
  startAt: string | null;
  endAt: string | null;
  time: Time;
  label: string;
  inventoryMean: number | null;
  inventoryLow: number | null;
  inventoryHigh: number | null;
  reorderPoint: number | null;
  safetyStock: number | null;
  serviceDemandMean: number | null;
  retailDemandMean: number | null;
  availableCapacity: number | null;
  demandMinusAvailableCapacity: number | null;
  receiptsMean: number | null;
  adjustmentsMean: number | null;
  ordersInTransitMean: number | null;
  ordersLateMean: number | null;
  ordersReadyToReceiveMean: number | null;
  ordersReceivedMean: number | null;
  newOrderFlag: number | null;
  newReceiptFlag: number | null;
  price: number | null;
  leadTimeMean: number | null;
  leadTimeLow: number | null;
  leadTimeHigh: number | null;
  dominantRegime: string | null;
  sourceMembers?: TradingChartPoint[];
}

export interface TradingChartModel {
  points: TradingChartPoint[];
  pointByIntervalIndex: Map<number, TradingChartPoint>;
  pointByTimeKey: Map<string, TradingChartPoint>;
  availability: Record<TradingChartIndicatorId, boolean>;
}

export const TRADING_CHART_MAIN_PANE_ID = 'main';
const DISPLAY_MODEL_CACHE = new WeakMap<TradingChartPoint[], Map<string, TradingChartModel>>();
const DEFAULT_PANE_IDS: Record<TradingChartIndicatorId, string> = {
  inventory: TRADING_CHART_MAIN_PANE_ID,
  uncertainty: TRADING_CHART_MAIN_PANE_ID,
  reorderPoint: TRADING_CHART_MAIN_PANE_ID,
  safetyStock: TRADING_CHART_MAIN_PANE_ID,
  demand: 'pane-1',
  serviceDemand: 'pane-1',
  retailDemand: 'pane-1',
  availableCapacity: 'pane-1',
  demandMinusAvailableCapacity: 'pane-1',
  receipts: 'pane-2',
  ordersInTransit: 'pane-3',
  ordersLate: 'pane-4',
  ordersReadyToReceive: 'pane-5',
  ordersReceived: 'pane-6',
  newOrderFlags: 'pane-7',
  newReceiptFlags: 'pane-8',
  price: 'pane-9',
  leadTime: 'pane-10',
  leadTimeRange: 'pane-10',
  regime: TRADING_CHART_MAIN_PANE_ID,
};
const DEFAULT_LAYER_ORDER: Record<TradingChartIndicatorId, number> = {
  inventory: 0,
  uncertainty: 1,
  reorderPoint: 2,
  safetyStock: 3,
  demand: 0,
  serviceDemand: 0,
  retailDemand: 1,
  availableCapacity: 2,
  demandMinusAvailableCapacity: 3,
  receipts: 0,
  ordersInTransit: 0,
  ordersLate: 0,
  ordersReadyToReceive: 0,
  ordersReceived: 0,
  newOrderFlags: 0,
  newReceiptFlags: 0,
  price: 0,
  leadTime: 0,
  leadTimeRange: 1,
  regime: 4,
};
export const ALL_TRADING_CHART_INDICATOR_IDS: TradingChartIndicatorId[] = [
  'inventory',
  'uncertainty',
  'reorderPoint',
  'safetyStock',
  'demand',
  'serviceDemand',
  'retailDemand',
  'availableCapacity',
  'demandMinusAvailableCapacity',
  'receipts',
  'ordersInTransit',
  'ordersLate',
  'ordersReadyToReceive',
  'ordersReceived',
  'newOrderFlags',
  'newReceiptFlags',
  'price',
  'leadTime',
  'leadTimeRange',
  'regime',
];
const INDICATOR_ORDER = ALL_TRADING_CHART_INDICATOR_IDS;

export const DEFAULT_TRADING_CHART_INDICATORS: TradingChartIndicatorSettings = {
  inventory: {
    enabled: true,
    color: '#2f6f6d',
    paneId: TRADING_CHART_MAIN_PANE_ID,
    layerOrder: 0,
    axisSide: 'right',
    lineStyle: 'solid',
    lineWidth: 2,
    opacity: 1,
    plotStyle: 'line',
    inputSource: 'close',
    precision: 'default',
    showPriceScaleLabel: true,
    showStatusLineValue: true,
    showInputValuesInStatusLine: true,
    scale: 'primary',
  },
  uncertainty: {
    enabled: true,
    color: '#7aa6a4',
    paneId: TRADING_CHART_MAIN_PANE_ID,
    layerOrder: 1,
    axisSide: 'right',
    lineStyle: 'dashed',
    lineWidth: 2,
    opacity: 0.22,
    plotStyle: 'lines',
    inputSource: 'close',
    precision: 'default',
    showPriceScaleLabel: false,
    showStatusLineValue: true,
    showInputValuesInStatusLine: true,
    scale: 'primary',
  },
  reorderPoint: {
    enabled: true,
    color: '#b45309',
    paneId: TRADING_CHART_MAIN_PANE_ID,
    layerOrder: 2,
    axisSide: 'right',
    lineStyle: 'dotted',
    lineWidth: 3,
    opacity: 0.95,
    plotStyle: 'price-line',
    inputSource: 'close',
    precision: 'default',
    showPriceScaleLabel: true,
    showStatusLineValue: true,
    showInputValuesInStatusLine: true,
    scale: 'primary',
  },
  safetyStock: {
    enabled: true,
    color: '#64748b',
    paneId: TRADING_CHART_MAIN_PANE_ID,
    layerOrder: 3,
    axisSide: 'right',
    lineStyle: 'dashed',
    lineWidth: 3,
    opacity: 0.9,
    plotStyle: 'price-line',
    inputSource: 'close',
    precision: 'default',
    showPriceScaleLabel: true,
    showStatusLineValue: true,
    showInputValuesInStatusLine: true,
    scale: 'primary',
  },
  demand: {
    enabled: false,
    color: '#dc2626',
    paneId: 'pane-1',
    layerOrder: 0,
    axisSide: 'right',
    lineStyle: 'solid',
    lineWidth: 1,
    opacity: 0.5,
    plotStyle: 'histogram',
    inputSource: 'close',
    precision: 'default',
    showPriceScaleLabel: false,
    showStatusLineValue: true,
    showInputValuesInStatusLine: true,
    scale: 'overlay',
  },
  serviceDemand: {
    enabled: false,
    color: '#64748b',
    paneId: 'pane-1',
    layerOrder: 1,
    axisSide: 'right',
    lineStyle: 'solid',
    lineWidth: 1,
    opacity: 0.5,
    plotStyle: 'histogram',
    inputSource: 'close',
    precision: 'default',
    showPriceScaleLabel: false,
    showStatusLineValue: true,
    showInputValuesInStatusLine: true,
    scale: 'overlay',
  },
  retailDemand: {
    enabled: false,
    color: '#0f172a',
    paneId: 'pane-1',
    layerOrder: 2,
    axisSide: 'right',
    lineStyle: 'solid',
    lineWidth: 1,
    opacity: 0.5,
    plotStyle: 'histogram',
    inputSource: 'close',
    precision: 'default',
    showPriceScaleLabel: false,
    showStatusLineValue: true,
    showInputValuesInStatusLine: true,
    scale: 'overlay',
  },
  availableCapacity: {
    enabled: false,
    color: '#059669',
    paneId: 'pane-1',
    layerOrder: 3,
    axisSide: 'right',
    lineStyle: 'solid',
    lineWidth: 2,
    opacity: 1,
    plotStyle: 'line',
    inputSource: 'close',
    precision: 'default',
    showPriceScaleLabel: true,
    showStatusLineValue: true,
    showInputValuesInStatusLine: true,
    scale: 'primary',
  },
  demandMinusAvailableCapacity: {
    enabled: false,
    color: '#b91c1c',
    paneId: 'pane-1',
    layerOrder: 4,
    axisSide: 'right',
    lineStyle: 'dashed',
    lineWidth: 2,
    opacity: 1,
    plotStyle: 'line',
    inputSource: 'close',
    precision: 'default',
    showPriceScaleLabel: true,
    showStatusLineValue: true,
    showInputValuesInStatusLine: true,
    scale: 'primary',
  },
  receipts: {
    enabled: false,
    color: '#16a34a',
    paneId: 'pane-2',
    layerOrder: 0,
    axisSide: 'right',
    lineStyle: 'solid',
    lineWidth: 1,
    opacity: 0.5,
    plotStyle: 'histogram',
    inputSource: 'close',
    precision: 'default',
    showPriceScaleLabel: false,
    showStatusLineValue: true,
    showInputValuesInStatusLine: true,
    scale: 'overlay',
  },
  ordersInTransit: {
    enabled: false,
    color: '#2563eb',
    paneId: 'pane-3',
    layerOrder: 0,
    axisSide: 'right',
    lineStyle: 'solid',
    lineWidth: 1,
    opacity: 0.45,
    plotStyle: 'histogram',
    inputSource: 'close',
    precision: 'default',
    showPriceScaleLabel: false,
    showStatusLineValue: true,
    showInputValuesInStatusLine: true,
    scale: 'overlay',
  },
  ordersLate: {
    enabled: false,
    color: '#dc2626',
    paneId: 'pane-4',
    layerOrder: 0,
    axisSide: 'right',
    lineStyle: 'solid',
    lineWidth: 1,
    opacity: 0.5,
    plotStyle: 'histogram',
    inputSource: 'close',
    precision: 'default',
    showPriceScaleLabel: false,
    showStatusLineValue: true,
    showInputValuesInStatusLine: true,
    scale: 'overlay',
  },
  ordersReadyToReceive: {
    enabled: false,
    color: '#d97706',
    paneId: 'pane-5',
    layerOrder: 0,
    axisSide: 'right',
    lineStyle: 'solid',
    lineWidth: 1,
    opacity: 0.5,
    plotStyle: 'histogram',
    inputSource: 'close',
    precision: 'default',
    showPriceScaleLabel: false,
    showStatusLineValue: true,
    showInputValuesInStatusLine: true,
    scale: 'overlay',
  },
  ordersReceived: {
    enabled: false,
    color: '#16a34a',
    paneId: 'pane-6',
    layerOrder: 0,
    axisSide: 'right',
    lineStyle: 'solid',
    lineWidth: 1,
    opacity: 0.5,
    plotStyle: 'histogram',
    inputSource: 'close',
    precision: 'default',
    showPriceScaleLabel: false,
    showStatusLineValue: true,
    showInputValuesInStatusLine: true,
    scale: 'overlay',
  },
  newOrderFlags: {
    enabled: false,
    color: '#7c3aed',
    paneId: 'pane-7',
    layerOrder: 0,
    axisSide: 'right',
    lineStyle: 'solid',
    lineWidth: 1,
    opacity: 0.9,
    plotStyle: 'icons',
    inputSource: 'close',
    precision: '0',
    showPriceScaleLabel: false,
    showStatusLineValue: true,
    showInputValuesInStatusLine: true,
    scale: 'overlay',
  },
  newReceiptFlags: {
    enabled: false,
    color: '#0891b2',
    paneId: 'pane-8',
    layerOrder: 0,
    axisSide: 'right',
    lineStyle: 'solid',
    lineWidth: 1,
    opacity: 0.9,
    plotStyle: 'icons',
    inputSource: 'close',
    precision: '0',
    showPriceScaleLabel: false,
    showStatusLineValue: true,
    showInputValuesInStatusLine: true,
    scale: 'overlay',
  },
  price: {
    enabled: false,
    color: '#7c3aed',
    paneId: 'pane-4',
    layerOrder: 0,
    axisSide: 'right',
    lineStyle: 'solid',
    lineWidth: 2,
    opacity: 1,
    plotStyle: 'line',
    inputSource: 'close',
    precision: 'default',
    showPriceScaleLabel: true,
    showStatusLineValue: true,
    showInputValuesInStatusLine: true,
    scale: 'price',
  },
  leadTime: {
    enabled: false,
    color: '#0369a1',
    paneId: 'pane-10',
    layerOrder: 0,
    axisSide: 'right',
    lineStyle: 'solid',
    lineWidth: 2,
    opacity: 1,
    plotStyle: 'line',
    inputSource: 'close',
    precision: 'default',
    showPriceScaleLabel: true,
    showStatusLineValue: true,
    showInputValuesInStatusLine: true,
    scale: 'primary',
  },
  leadTimeRange: {
    enabled: false,
    color: '#0ea5e9',
    paneId: 'pane-10',
    layerOrder: 1,
    axisSide: 'right',
    lineStyle: 'dashed',
    lineWidth: 2,
    opacity: 0.22,
    plotStyle: 'lines',
    inputSource: 'close',
    precision: 'default',
    showPriceScaleLabel: false,
    showStatusLineValue: true,
    showInputValuesInStatusLine: true,
    scale: 'primary',
  },
  regime: {
    enabled: true,
    color: '#0f766e',
    paneId: TRADING_CHART_MAIN_PANE_ID,
    layerOrder: 4,
    axisSide: 'right',
    lineStyle: 'solid',
    lineWidth: 1,
    opacity: 0.9,
    plotStyle: 'icons',
    inputSource: 'close',
    precision: 'default',
    showPriceScaleLabel: false,
    showStatusLineValue: true,
    showInputValuesInStatusLine: true,
    scale: 'primary',
  },
};

const INDICATOR_PLOT_STYLE_OPTIONS: Record<TradingChartIndicatorId, TradingChartIndicatorPlotStyle[]> = {
  inventory: ['line', 'area', 'step-line', 'histogram', 'bars', 'candles'],
  uncertainty: ['lines', 'band'],
  reorderPoint: ['price-line'],
  safetyStock: ['price-line'],
  demand: ['histogram', 'line', 'area', 'step-line', 'bars', 'candles'],
  serviceDemand: ['histogram', 'line', 'area', 'step-line', 'bars', 'candles'],
  retailDemand: ['histogram', 'line', 'area', 'step-line', 'bars', 'candles'],
  availableCapacity: ['line', 'area', 'step-line', 'histogram'],
  demandMinusAvailableCapacity: ['line', 'area', 'step-line', 'histogram'],
  receipts: ['histogram', 'line', 'area', 'step-line', 'bars', 'candles'],
  ordersInTransit: ['histogram', 'line', 'area', 'step-line', 'bars', 'candles'],
  ordersLate: ['histogram', 'line', 'area', 'step-line', 'bars', 'candles'],
  ordersReadyToReceive: ['histogram', 'line', 'area', 'step-line', 'bars', 'candles'],
  ordersReceived: ['histogram', 'line', 'area', 'step-line', 'bars', 'candles'],
  newOrderFlags: ['icons'],
  newReceiptFlags: ['icons'],
  price: ['line', 'area', 'step-line', 'histogram', 'bars', 'candles'],
  leadTime: ['line', 'area', 'step-line', 'histogram'],
  leadTimeRange: ['lines', 'band'],
  regime: ['icons', 'background-highlight', 'background-highlight-icons'],
};

export function compatiblePlotStyles(id: TradingChartIndicatorId) {
  return INDICATOR_PLOT_STYLE_OPTIONS[id];
}

export function supportsLineType(plotStyle: TradingChartIndicatorPlotStyle) {
  return plotStyle === 'area' || plotStyle === 'line' || plotStyle === 'step-line' || plotStyle === 'band' || plotStyle === 'lines' || plotStyle === 'price-line';
}

export function supportsLineWidth(plotStyle: TradingChartIndicatorPlotStyle) {
  return plotStyle === 'area' || plotStyle === 'line' || plotStyle === 'step-line' || plotStyle === 'band' || plotStyle === 'lines' || plotStyle === 'price-line';
}

export function isOhlcTradingChartPlotStyle(plotStyle: TradingChartIndicatorPlotStyle) {
  return plotStyle === 'bars' || plotStyle === 'candles';
}

export function supportsTradingChartInputSource(plotStyle: TradingChartIndicatorPlotStyle) {
  return plotStyle === 'area' ||
    plotStyle === 'line' ||
    plotStyle === 'step-line' ||
    plotStyle === 'histogram' ||
    plotStyle === 'bars' ||
    plotStyle === 'candles';
}

export function plotStyleLabel(plotStyle: TradingChartIndicatorPlotStyle) {
  switch (plotStyle) {
    case 'area':
      return 'Area';
    case 'line':
      return 'Line';
    case 'step-line':
      return 'Step-line';
    case 'band':
      return 'Band';
    case 'lines':
      return 'Lines';
    case 'price-line':
      return 'Price line';
    case 'histogram':
      return 'Histogram';
    case 'bars':
      return 'Bars';
    case 'candles':
      return 'Candles';
    case 'columns':
      return 'Columns';
    case 'icons':
      return 'Icons';
    case 'background-highlight':
      return 'Background highlight';
    case 'background-highlight-icons':
      return 'Background highlight + icons';
  }
}

export function precisionLabel(precision: TradingChartIndicatorPrecision) {
  switch (precision) {
    case '0':
      return '0';
    case '1':
      return '0.0';
    case '2':
      return '0.00';
    default:
      return 'Default';
  }
}

function timeKey(time: Time) {
  return String(time);
}

export function tradingChartTimeKey(time: Time) {
  return timeKey(time);
}

function resolutionCacheKey(resolution: ChartResolutionSpec | null) {
  if (!resolution) {
    return 'none';
  }
  return `${resolution.amount}${resolution.unit}`;
}

function parseTimestampSeconds(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return null;
  }
  return Math.floor(timestamp / 1000);
}

function syntheticTimestamp(order: number) {
  return 1_577_836_800 + order * 86_400;
}

function deriveOrderedChartTimes(entries: Array<{ startAt: string | null; endAt: string | null }>) {
  let previous = 0;
  return entries.map((entry, index) => {
    const parsed = parseTimestampSeconds(entry.endAt) ?? parseTimestampSeconds(entry.startAt) ?? syntheticTimestamp(index);
    const next = Math.max(parsed, previous + 1);
    previous = next;
    return next as UTCTimestamp;
  });
}

function addEntry(
  entries: Map<number, TradingChartPoint>,
  intervalIndex: number,
  values: Partial<Omit<TradingChartPoint, 'intervalIndex' | 'time' | 'label'>>,
) {
  const existing = entries.get(intervalIndex);
  if (existing) {
    entries.set(intervalIndex, {
      ...existing,
      ...values,
      startAt: existing.startAt ?? values.startAt ?? null,
      endAt: existing.endAt ?? values.endAt ?? null,
    });
    return;
  }

  entries.set(intervalIndex, {
    intervalIndex,
    startAt: values.startAt ?? null,
    endAt: values.endAt ?? null,
    time: syntheticTimestamp(entries.size) as UTCTimestamp,
    label: `Interval ${intervalIndex + 1}`,
    inventoryMean: values.inventoryMean ?? null,
    inventoryLow: values.inventoryLow ?? null,
    inventoryHigh: values.inventoryHigh ?? null,
    reorderPoint: values.reorderPoint ?? null,
    safetyStock: values.safetyStock ?? null,
    serviceDemandMean: values.serviceDemandMean ?? null,
    retailDemandMean: values.retailDemandMean ?? null,
    availableCapacity: values.availableCapacity ?? null,
    demandMinusAvailableCapacity: values.demandMinusAvailableCapacity ?? null,
    receiptsMean: values.receiptsMean ?? null,
    adjustmentsMean: values.adjustmentsMean ?? null,
    ordersInTransitMean: values.ordersInTransitMean ?? null,
    ordersLateMean: values.ordersLateMean ?? null,
    ordersReadyToReceiveMean: values.ordersReadyToReceiveMean ?? null,
    ordersReceivedMean: values.ordersReceivedMean ?? null,
    newOrderFlag: values.newOrderFlag ?? null,
    newReceiptFlag: values.newReceiptFlag ?? null,
    price: values.price ?? null,
    leadTimeMean: values.leadTimeMean ?? null,
    leadTimeLow: values.leadTimeLow ?? null,
    leadTimeHigh: values.leadTimeHigh ?? null,
    dominantRegime: values.dominantRegime ?? null,
  });
}

function timestampInInterval(timestamp: number, interval: { startAt: string | null; endAt: string | null }) {
  const start = parseTimestampSeconds(interval.startAt);
  const end = parseTimestampSeconds(interval.endAt);
  if (start != null && end != null) {
    return timestamp >= start && timestamp <= end;
  }
  return timestamp === (end ?? start);
}

function intervalForInventoryPoint(
  pointAt: string | null | undefined,
  intervals: Array<{ intervalIndex: number; startAt: string | null; endAt: string | null }>,
) {
  const timestamp = parseTimestampSeconds(pointAt);
  if (timestamp == null) {
    return null;
  }
  return intervals.find((interval) => timestampInInterval(timestamp, interval)) ?? null;
}

function sanitizeUncertaintyBounds(mean: number | null, low: number | null, high: number | null) {
  if (mean == null || low == null || high == null) {
    return { low, high };
  }
  return {
    low: Math.min(low, high, mean),
    high: Math.max(low, high, mean),
  };
}

function addPipelineInterval(entries: Map<number, TradingChartPoint>, interval: SenaSkuDetailPipelineChartInterval) {
  addEntry(entries, interval.intervalIndex, {
    ordersInTransitMean: interval.inTransitMean,
    ordersLateMean: interval.ordersLateMean,
    ordersReadyToReceiveMean: interval.ordersReadyToReceiveMean,
    ordersReceivedMean: interval.ordersReceivedMean,
    newOrderFlag: interval.newOrderFlag,
    newReceiptFlag: interval.newReceiptFlag,
  });
}

export function deriveTradingChartModel(model: SenaSkuDetailViewModel): TradingChartModel {
  const entries = new Map<number, TradingChartPoint>();
  const priceByInterval = new Map(model.lanes.regimePriceLane.priceMarkers.map((marker) => [marker.intervalIndex, marker.price]));
  const reorderPoint =
    typeof model.lanes.inventoryLane.reorderPoint === 'number' && Number.isFinite(model.lanes.inventoryLane.reorderPoint)
      ? model.lanes.inventoryLane.reorderPoint
      : null;
  const safetyStock =
    typeof model.lanes.inventoryLane.safetyStock === 'number' && Number.isFinite(model.lanes.inventoryLane.safetyStock)
      ? model.lanes.inventoryLane.safetyStock
      : null;

  for (const interval of model.lanes.regimePriceLane.intervals) {
    addEntry(entries, interval.intervalIndex, {
      startAt: interval.startAt,
      endAt: interval.endAt,
      price: model.identity.soldAsProduct ? priceByInterval.get(interval.intervalIndex) ?? null : null,
      dominantRegime: interval.dominantRegime,
    });
  }

  for (const [index, point] of model.lanes.inventoryLane.points.entries()) {
    const matchingInterval =
      intervalForInventoryPoint(point.at, model.lanes.flowLane.intervals) ??
      intervalForInventoryPoint(point.at, model.lanes.regimePriceLane.intervals);
    const fallbackInterval = model.lanes.flowLane.intervals[index] ?? model.lanes.regimePriceLane.intervals[index] ?? null;
    const intervalIndex = matchingInterval?.intervalIndex ?? fallbackInterval?.intervalIndex ?? index;
    const uncertaintyBounds = sanitizeUncertaintyBounds(point.mean, point.low, point.high);
    addEntry(entries, intervalIndex, {
      startAt: matchingInterval?.startAt ?? fallbackInterval?.startAt ?? point.at,
      endAt: matchingInterval?.endAt ?? fallbackInterval?.endAt ?? point.at,
      inventoryMean: point.mean,
      inventoryLow: uncertaintyBounds.low,
      inventoryHigh: uncertaintyBounds.high,
      reorderPoint,
      safetyStock,
    });
  }

  for (const interval of model.lanes.flowLane.intervals) {
    addEntry(entries, interval.intervalIndex, {
      startAt: interval.startAt,
      endAt: interval.endAt,
      serviceDemandMean: interval.serviceDemandMean,
      retailDemandMean: interval.retailDemandMean,
      receiptsMean: interval.receiptsMean,
      adjustmentsMean: interval.adjustmentsMean,
    });
  }

  for (const interval of model.lanes.pipelineLane.intervals) {
    addPipelineInterval(entries, interval);
  }

  const points = [...entries.values()].sort((left, right) => left.intervalIndex - right.intervalIndex);
  const times = deriveOrderedChartTimes(points);
  const resolvedPoints = points.map((point, index) => ({
    ...point,
    time: times[index],
    label: point.endAt ?? point.startAt ?? `Interval ${point.intervalIndex + 1}`,
  }));

  return {
    points: resolvedPoints,
    pointByIntervalIndex: new Map(resolvedPoints.map((point) => [point.intervalIndex, point])),
    pointByTimeKey: new Map(resolvedPoints.map((point) => [timeKey(point.time), point])),
    availability: {
      ...deriveAvailability(resolvedPoints),
      price: model.identity.soldAsProduct && resolvedPoints.some((point) => point.price != null),
    },
  };
}

function pointTimestampMs(point: TradingChartPoint) {
  const timestamp =
    Date.parse(point.endAt ?? '') ||
    Date.parse(point.startAt ?? '') ||
    (typeof point.time === 'number' ? point.time * 1000 : Number(point.time) * 1000);
  return Number.isFinite(timestamp) ? timestamp : point.intervalIndex;
}

function lastDefined<T>(values: T[]) {
  return [...values].reverse().find((value) => value != null) ?? null;
}

function maxDefined(values: Array<number | null | undefined>) {
  const finite = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return finite.length > 0 ? Math.max(...finite) : null;
}

function minDefined(values: Array<number | null | undefined>) {
  const finite = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return finite.length > 0 ? Math.min(...finite) : null;
}

export function deriveTradingChartDisplayModel(
  model: TradingChartModel,
  resolution: ChartResolutionSpec | null,
): TradingChartModel {
  if (!resolution || model.points.length <= 1) {
    return model;
  }

  const cacheKey = resolutionCacheKey(resolution);
  const cachedByResolution = DISPLAY_MODEL_CACHE.get(model.points);
  const cachedModel = cachedByResolution?.get(cacheKey);
  if (cachedModel) {
    return cachedModel;
  }

  const buckets = new Map<number, TradingChartPoint[]>();
  for (const point of model.points) {
    const timestamp = pointTimestampMs(point);
    const bucketTime = bucketTimestampForResolution(timestamp, resolution);
    const bucket = buckets.get(bucketTime) ?? [];
    bucket.push(point);
    buckets.set(bucketTime, bucket);
  }

  const resolvedPoints = [...buckets.entries()]
    .sort(([left], [right]) => left - right)
    .map(([bucketTime, members]) => {
      const sortedMembers = [...members].sort((left, right) => pointTimestampMs(left) - pointTimestampMs(right));
      const first = sortedMembers[0]!;
      const last = sortedMembers.at(-1)!;
      const sourceMembers = sortedMembers.flatMap((point) => point.sourceMembers ?? [point]);
      return {
        intervalIndex: last.intervalIndex,
        startAt: first.startAt,
        endAt: last.endAt,
        time: Math.floor(bucketTime / 1000) as UTCTimestamp,
        label: last.endAt ?? first.startAt ?? `Interval ${last.intervalIndex + 1}`,
        inventoryMean: lastDefined(sortedMembers.map((point) => point.inventoryMean)),
        inventoryLow: minDefined(sortedMembers.map((point) => point.inventoryLow)),
        inventoryHigh: maxDefined(sortedMembers.map((point) => point.inventoryHigh)),
        reorderPoint: lastDefined(sortedMembers.map((point) => point.reorderPoint)),
        safetyStock: lastDefined(sortedMembers.map((point) => point.safetyStock)),
        serviceDemandMean: lastDefined(sortedMembers.map((point) => point.serviceDemandMean)),
        retailDemandMean: lastDefined(sortedMembers.map((point) => point.retailDemandMean)),
        availableCapacity: lastDefined(sortedMembers.map((point) => point.availableCapacity)),
        demandMinusAvailableCapacity: lastDefined(sortedMembers.map((point) => point.demandMinusAvailableCapacity)),
        receiptsMean: lastDefined(sortedMembers.map((point) => point.receiptsMean)),
        adjustmentsMean: lastDefined(sortedMembers.map((point) => point.adjustmentsMean)),
        ordersInTransitMean: lastDefined(sortedMembers.map((point) => point.ordersInTransitMean)),
        ordersLateMean: lastDefined(sortedMembers.map((point) => point.ordersLateMean)),
        ordersReadyToReceiveMean: lastDefined(sortedMembers.map((point) => point.ordersReadyToReceiveMean)),
        ordersReceivedMean: lastDefined(sortedMembers.map((point) => point.ordersReceivedMean)),
        newOrderFlag: maxDefined(sortedMembers.map((point) => point.newOrderFlag)),
        newReceiptFlag: maxDefined(sortedMembers.map((point) => point.newReceiptFlag)),
        price: lastDefined(sortedMembers.map((point) => point.price)),
        leadTimeMean: lastDefined(sortedMembers.map((point) => point.leadTimeMean)),
        leadTimeLow: minDefined(sortedMembers.map((point) => point.leadTimeLow)),
        leadTimeHigh: maxDefined(sortedMembers.map((point) => point.leadTimeHigh)),
        dominantRegime: lastDefined(sortedMembers.map((point) => point.dominantRegime)),
        sourceMembers,
      } satisfies TradingChartPoint;
    });

  const pointByIntervalIndex = new Map<number, TradingChartPoint>();
  for (const point of resolvedPoints) {
    for (const member of point.sourceMembers ?? [point]) {
      pointByIntervalIndex.set(member.intervalIndex, point);
    }
    pointByIntervalIndex.set(point.intervalIndex, point);
  }

  const displayModel = {
    points: resolvedPoints,
    pointByIntervalIndex,
    pointByTimeKey: new Map(resolvedPoints.map((point) => [timeKey(point.time), point])),
    availability: model.availability,
  };
  const nextCachedByResolution = cachedByResolution ?? new Map<string, TradingChartModel>();
  nextCachedByResolution.set(cacheKey, displayModel);
  if (!cachedByResolution) {
    DISPLAY_MODEL_CACHE.set(model.points, nextCachedByResolution);
  }
  return displayModel;
}

function deriveAvailability(points: TradingChartPoint[]) {
  return {
    inventory: points.some((point) => point.inventoryMean != null),
    uncertainty: points.some((point) => point.inventoryLow != null && point.inventoryHigh != null),
    reorderPoint: points.some((point) => point.reorderPoint != null),
    safetyStock: points.some((point) => point.safetyStock != null),
    demand: points.some((point) => point.serviceDemandMean != null || point.retailDemandMean != null),
    serviceDemand: points.some((point) => point.serviceDemandMean != null),
    retailDemand: points.some((point) => point.retailDemandMean != null),
    availableCapacity: points.some((point) => point.availableCapacity != null),
    demandMinusAvailableCapacity: points.some((point) => point.demandMinusAvailableCapacity != null),
    receipts: points.some((point) => point.receiptsMean != null || point.adjustmentsMean != null),
    ordersInTransit: points.some((point) => point.ordersInTransitMean != null),
    ordersLate: points.some((point) => point.ordersLateMean != null && point.ordersLateMean > 0),
    ordersReadyToReceive: points.some((point) => point.ordersReadyToReceiveMean != null && point.ordersReadyToReceiveMean > 0),
    ordersReceived: points.some((point) => point.ordersReceivedMean != null && point.ordersReceivedMean > 0),
    newOrderFlags: points.some((point) => point.newOrderFlag != null && point.newOrderFlag > 0),
    newReceiptFlags: points.some((point) => point.newReceiptFlag != null && point.newReceiptFlag > 0),
    price: points.some((point) => point.price != null),
    leadTime: points.some((point) => point.leadTimeMean != null),
    leadTimeRange: points.some((point) => point.leadTimeLow != null && point.leadTimeHigh != null),
    regime: points.some((point) => point.dominantRegime != null),
  } satisfies TradingChartModel['availability'];
}

export function defaultTradingChartIndicators() {
  return structuredClone(DEFAULT_TRADING_CHART_INDICATORS);
}

export const SKU_TRADING_CHART_INDICATOR_ORDER: TradingChartIndicatorId[] = [
  'inventory',
  'uncertainty',
  'reorderPoint',
  'safetyStock',
  'demand',
  'receipts',
  'ordersInTransit',
  'ordersLate',
  'ordersReadyToReceive',
  'ordersReceived',
  'newOrderFlags',
  'newReceiptFlags',
  'price',
  'regime',
];

export const SERVICE_TRADING_CHART_INDICATOR_ORDER: TradingChartIndicatorId[] = [
  'price',
  'regime',
  'demand',
  'availableCapacity',
  'demandMinusAvailableCapacity',
];

export const ANALYSIS_TRADING_CHART_INDICATOR_ORDER: TradingChartIndicatorId[] = [
  'price',
  'regime',
  'inventory',
  'uncertainty',
  'serviceDemand',
  'retailDemand',
  'receipts',
  'ordersInTransit',
  'ordersLate',
  'ordersReadyToReceive',
  'ordersReceived',
  'newOrderFlags',
  'newReceiptFlags',
  'leadTime',
  'leadTimeRange',
];

export function defaultServiceTradingChartIndicators() {
  const defaults = defaultTradingChartIndicators();
  for (const id of ALL_TRADING_CHART_INDICATOR_IDS) {
    defaults[id].enabled = false;
  }
  defaults.price.enabled = true;
  defaults.price.paneId = 'pane-1';
  defaults.price.layerOrder = 0;
  defaults.price.scale = 'price';

  defaults.regime.enabled = true;
  defaults.regime.paneId = TRADING_CHART_MAIN_PANE_ID;
  defaults.regime.layerOrder = 1;

  defaults.demand.enabled = true;
  defaults.demand.paneId = 'pane-2';
  defaults.demand.layerOrder = 0;
  defaults.demand.color = '#475569';

  defaults.availableCapacity.enabled = true;
  defaults.availableCapacity.paneId = 'pane-2';
  defaults.availableCapacity.layerOrder = 1;

  defaults.demandMinusAvailableCapacity.enabled = true;
  defaults.demandMinusAvailableCapacity.paneId = TRADING_CHART_MAIN_PANE_ID;
  defaults.demandMinusAvailableCapacity.layerOrder = 0;
  defaults.demandMinusAvailableCapacity.plotStyle = 'histogram';
  return normalizeTradingChartIndicatorSettings(defaults);
}

export function defaultAnalysisTradingChartIndicators() {
  const defaults = defaultTradingChartIndicators();
  for (const id of ALL_TRADING_CHART_INDICATOR_IDS) {
    defaults[id].enabled = false;
  }
  defaults.price.enabled = true;
  defaults.price.paneId = 'pane-1';
  defaults.price.layerOrder = 0;
  defaults.regime.enabled = true;
  defaults.regime.paneId = TRADING_CHART_MAIN_PANE_ID;
  defaults.regime.layerOrder = 2;

  defaults.inventory.enabled = true;
  defaults.inventory.paneId = TRADING_CHART_MAIN_PANE_ID;
  defaults.inventory.layerOrder = 0;
  defaults.uncertainty.enabled = true;
  defaults.uncertainty.paneId = TRADING_CHART_MAIN_PANE_ID;
  defaults.uncertainty.layerOrder = 1;
  defaults.serviceDemand.enabled = true;
  defaults.serviceDemand.paneId = 'pane-2';
  defaults.serviceDemand.layerOrder = 0;
  defaults.retailDemand.enabled = true;
  defaults.retailDemand.paneId = 'pane-2';
  defaults.retailDemand.layerOrder = 1;
  defaults.receipts.enabled = true;
  defaults.receipts.paneId = 'pane-2';
  defaults.receipts.layerOrder = 2;

  defaults.ordersInTransit.enabled = true;
  defaults.ordersInTransit.paneId = 'pane-3';
  defaults.ordersInTransit.layerOrder = 0;
  defaults.ordersReceived.enabled = true;
  defaults.ordersReceived.paneId = 'pane-3';
  defaults.ordersReceived.layerOrder = 1;
  defaults.newOrderFlags.enabled = true;
  defaults.newOrderFlags.paneId = 'pane-3';
  defaults.newOrderFlags.layerOrder = 2;
  defaults.newReceiptFlags.enabled = true;
  defaults.newReceiptFlags.paneId = 'pane-3';
  defaults.newReceiptFlags.layerOrder = 3;
  defaults.ordersLate.enabled = true;
  defaults.ordersLate.paneId = 'pane-3';
  defaults.ordersLate.layerOrder = 4;
  defaults.ordersReadyToReceive.enabled = true;
  defaults.ordersReadyToReceive.paneId = 'pane-3';
  defaults.ordersReadyToReceive.layerOrder = 5;

  defaults.leadTime.enabled = true;
  defaults.leadTime.paneId = 'pane-4';
  defaults.leadTime.layerOrder = 0;
  defaults.leadTimeRange.enabled = true;
  defaults.leadTimeRange.paneId = 'pane-4';
  defaults.leadTimeRange.layerOrder = 1;
  defaults.leadTimeRange.plotStyle = 'lines';
  return normalizeTradingChartIndicatorSettings(defaults);
}

function paneSortValue(paneId: string) {
  if (paneId === TRADING_CHART_MAIN_PANE_ID) {
    return -1;
  }
  const match = /^pane-(\d+)$/.exec(paneId);
  return match ? Number.parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER;
}

function sortIndicatorIdsByPaneOrder(
  ids: TradingChartIndicatorId[],
  settings: TradingChartIndicatorSettings,
) {
  return [...ids].sort((left, right) => {
    const leftSetting = settings[left];
    const rightSetting = settings[right];
    if (leftSetting.layerOrder !== rightSetting.layerOrder) {
      return leftSetting.layerOrder - rightSetting.layerOrder;
    }
    return INDICATOR_ORDER.indexOf(left) - INDICATOR_ORDER.indexOf(right);
  });
}

export function nextTradingChartPaneId(settings: TradingChartIndicatorSettings) {
  const nextIndex = Math.max(
    0,
    ...Object.values(settings).map((setting) => paneSortValue(setting.paneId)).filter((value) => Number.isFinite(value) && value >= 0),
  ) + 1;
  return `pane-${nextIndex}`;
}

export function normalizeTradingChartIndicatorSettings(settings: TradingChartIndicatorSettings) {
  const next = structuredClone(settings);

  for (const id of INDICATOR_ORDER) {
    const current = next[id];
    const defaultSetting = DEFAULT_TRADING_CHART_INDICATORS[id];
    current.paneId = current.paneId || DEFAULT_PANE_IDS[id];
    current.layerOrder = Number.isFinite(current.layerOrder) ? current.layerOrder : DEFAULT_LAYER_ORDER[id];
    current.axisSide = current.axisSide === 'left' ? 'left' : 'right';
    if (current.plotStyle === 'columns') {
      current.plotStyle = 'histogram';
    }
    if (!compatiblePlotStyles(id).includes(current.plotStyle)) {
      current.plotStyle = defaultSetting.plotStyle;
    }
    current.inputSource = isOhlcTradingChartPlotStyle(current.plotStyle)
      ? 'ohlc'
      : current.inputSource && current.inputSource !== 'ohlc'
        ? current.inputSource
        : defaultSetting.inputSource ?? 'close';
  }

  const paneIds = Array.from(new Set(INDICATOR_ORDER.map((id) => next[id].paneId))).sort((left, right) => {
    const delta = paneSortValue(left) - paneSortValue(right);
    return delta !== 0 ? delta : left.localeCompare(right);
  });

  for (const paneId of paneIds) {
    const paneIndicatorIds = sortIndicatorIdsByPaneOrder(
      INDICATOR_ORDER.filter((id) => next[id].paneId === paneId),
      next,
    );
    paneIndicatorIds.forEach((id, index) => {
      next[id].layerOrder = index;
    });
  }

  return next;
}

export function deriveTradingChartPaneLayout(
  settings: TradingChartIndicatorSettings,
  availability: TradingChartModel['availability'],
) {
  const normalized = normalizeTradingChartIndicatorSettings(settings);
  const paneMap = new Map<string, TradingChartIndicatorId[]>();
  paneMap.set(TRADING_CHART_MAIN_PANE_ID, []);

  for (const id of INDICATOR_ORDER) {
    if (!normalized[id].enabled || !availability[id]) {
      continue;
    }
    const paneId = normalized[id].paneId;
    const rows = paneMap.get(paneId) ?? [];
    rows.push(id);
    paneMap.set(paneId, rows);
  }

  return [...paneMap.entries()]
    .sort(([left], [right]) => {
      const delta = paneSortValue(left) - paneSortValue(right);
      return delta !== 0 ? delta : left.localeCompare(right);
    })
    .map(([id, indicatorIds]) => ({
      id,
      indicatorIds: sortIndicatorIdsByPaneOrder(indicatorIds, normalized),
    }));
}

export function moveTradingChartIndicator(
  settings: TradingChartIndicatorSettings,
  indicatorId: TradingChartIndicatorId,
  targetPaneId: string,
  targetIndex: number,
) {
  const next = normalizeTradingChartIndicatorSettings(settings);

  const effectivePaneId = targetPaneId;
  const moving = next[indicatorId];
  moving.paneId = effectivePaneId;

  const idsInTargetPane = sortIndicatorIdsByPaneOrder(
    INDICATOR_ORDER.filter((id) => id !== indicatorId && next[id].paneId === effectivePaneId),
    next,
  );
  const insertAt = Math.max(0, Math.min(targetIndex, idsInTargetPane.length));
  idsInTargetPane.splice(insertAt, 0, indicatorId);

  for (const id of idsInTargetPane) {
    next[id].paneId = effectivePaneId;
    next[id].layerOrder = idsInTargetPane.indexOf(id);
  }

  return normalizeTradingChartIndicatorSettings(next);
}
