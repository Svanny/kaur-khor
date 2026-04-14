import type { Time, UTCTimestamp } from 'lightweight-charts';
import type { SenaSkuDetailViewModel } from './view-model';

export type TradingChartIndicatorId =
  | 'inventory'
  | 'uncertainty'
  | 'reorderPoint'
  | 'safetyStock'
  | 'demand'
  | 'receipts'
  | 'pipeline'
  | 'price'
  | 'regime';

export type TradingChartIndicatorLineStyle = 'solid' | 'dashed' | 'dotted';
export type TradingChartIndicatorScale = 'primary' | 'overlay' | 'price';
export type TradingChartIndicatorAxisSide = 'left' | 'right';
export type TradingChartIndicatorPlotStyle =
  | 'area'
  | 'line'
  | 'band'
  | 'lines'
  | 'price-line'
  | 'histogram'
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
  receiptsMean: number | null;
  adjustmentsMean: number | null;
  inTransitMean: number | null;
  orderQuantityMean: number | null;
  price: number | null;
  dominantRegime: string | null;
}

export interface TradingChartModel {
  points: TradingChartPoint[];
  pointByIntervalIndex: Map<number, TradingChartPoint>;
  pointByTimeKey: Map<string, TradingChartPoint>;
  availability: Record<TradingChartIndicatorId, boolean>;
}

export const TRADING_CHART_MAIN_PANE_ID = 'main';
const DEFAULT_PANE_IDS: Record<TradingChartIndicatorId, string> = {
  inventory: TRADING_CHART_MAIN_PANE_ID,
  uncertainty: TRADING_CHART_MAIN_PANE_ID,
  reorderPoint: TRADING_CHART_MAIN_PANE_ID,
  safetyStock: TRADING_CHART_MAIN_PANE_ID,
  demand: 'pane-1',
  receipts: 'pane-2',
  pipeline: 'pane-3',
  price: 'pane-4',
  regime: TRADING_CHART_MAIN_PANE_ID,
};
const DEFAULT_LAYER_ORDER: Record<TradingChartIndicatorId, number> = {
  inventory: 0,
  uncertainty: 1,
  reorderPoint: 2,
  safetyStock: 3,
  demand: 0,
  receipts: 0,
  pipeline: 0,
  price: 0,
  regime: 4,
};
const INDICATOR_ORDER: TradingChartIndicatorId[] = [
  'inventory',
  'uncertainty',
  'reorderPoint',
  'safetyStock',
  'demand',
  'receipts',
  'pipeline',
  'price',
  'regime',
];

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
    lineStyle: 'solid',
    lineWidth: 1,
    opacity: 0.22,
    plotStyle: 'band',
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
    lineWidth: 1,
    opacity: 0.95,
    plotStyle: 'price-line',
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
    lineWidth: 1,
    opacity: 0.9,
    plotStyle: 'price-line',
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
    precision: 'default',
    showPriceScaleLabel: false,
    showStatusLineValue: true,
    showInputValuesInStatusLine: true,
    scale: 'overlay',
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
    precision: 'default',
    showPriceScaleLabel: false,
    showStatusLineValue: true,
    showInputValuesInStatusLine: true,
    scale: 'overlay',
  },
  pipeline: {
    enabled: false,
    color: '#2563eb',
    paneId: 'pane-3',
    layerOrder: 0,
    axisSide: 'right',
    lineStyle: 'solid',
    lineWidth: 1,
    opacity: 0.45,
    plotStyle: 'histogram',
    precision: 'default',
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
    precision: 'default',
    showPriceScaleLabel: true,
    showStatusLineValue: true,
    showInputValuesInStatusLine: true,
    scale: 'price',
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
    precision: 'default',
    showPriceScaleLabel: false,
    showStatusLineValue: true,
    showInputValuesInStatusLine: true,
    scale: 'primary',
  },
};

const INDICATOR_PLOT_STYLE_OPTIONS: Record<TradingChartIndicatorId, TradingChartIndicatorPlotStyle[]> = {
  inventory: ['line', 'area'],
  uncertainty: ['band', 'lines'],
  reorderPoint: ['price-line'],
  safetyStock: ['price-line'],
  demand: ['histogram', 'columns'],
  receipts: ['histogram', 'columns'],
  pipeline: ['histogram', 'columns'],
  price: ['line', 'area'],
  regime: ['icons', 'background-highlight', 'background-highlight-icons'],
};

export function compatiblePlotStyles(id: TradingChartIndicatorId) {
  return INDICATOR_PLOT_STYLE_OPTIONS[id];
}

export function supportsLineType(plotStyle: TradingChartIndicatorPlotStyle) {
  return plotStyle === 'area' || plotStyle === 'line' || plotStyle === 'band' || plotStyle === 'lines' || plotStyle === 'price-line';
}

export function supportsLineWidth(plotStyle: TradingChartIndicatorPlotStyle) {
  return plotStyle === 'area' || plotStyle === 'line' || plotStyle === 'band' || plotStyle === 'lines' || plotStyle === 'price-line';
}

export function plotStyleLabel(plotStyle: TradingChartIndicatorPlotStyle) {
  switch (plotStyle) {
    case 'area':
      return 'Area';
    case 'line':
      return 'Line';
    case 'band':
      return 'Band';
    case 'lines':
      return 'Lines';
    case 'price-line':
      return 'Price line';
    case 'histogram':
      return 'Histogram';
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
    receiptsMean: values.receiptsMean ?? null,
    adjustmentsMean: values.adjustmentsMean ?? null,
    inTransitMean: values.inTransitMean ?? null,
    orderQuantityMean: values.orderQuantityMean ?? null,
    price: values.price ?? null,
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
    addEntry(entries, interval.intervalIndex, {
      inTransitMean: interval.inTransitMean,
      orderQuantityMean: interval.orderQuantityMean,
    });
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

function deriveAvailability(points: TradingChartPoint[]) {
  return {
    inventory: points.some((point) => point.inventoryMean != null),
    uncertainty: points.some((point) => point.inventoryLow != null && point.inventoryHigh != null),
    reorderPoint: points.some((point) => point.reorderPoint != null),
    safetyStock: points.some((point) => point.safetyStock != null),
    demand: points.some((point) => point.serviceDemandMean != null || point.retailDemandMean != null),
    receipts: points.some((point) => point.receiptsMean != null || point.adjustmentsMean != null),
    pipeline: points.some((point) => point.inTransitMean != null),
    price: points.some((point) => point.price != null),
    regime: points.some((point) => point.dominantRegime != null),
  } satisfies TradingChartModel['availability'];
}

export function defaultTradingChartIndicators() {
  return structuredClone(DEFAULT_TRADING_CHART_INDICATORS);
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
    current.paneId = current.paneId || DEFAULT_PANE_IDS[id];
    current.layerOrder = Number.isFinite(current.layerOrder) ? current.layerOrder : DEFAULT_LAYER_ORDER[id];
    current.axisSide = current.axisSide === 'left' ? 'left' : 'right';
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
