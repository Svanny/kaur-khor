import { forwardRef, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type HTMLAttributes, type SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import { Dialog as DialogPrimitive } from 'radix-ui';
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  pointerWithin,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  defaultAnimateLayoutChanges,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { AppLanguage } from '@shared/inventory';
import {
  AreaSeries,
  BarSeries,
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  LineSeries,
  LineType,
  LineStyle,
  type BarData,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type MouseEventParams,
  type SeriesType,
  type Time,
} from 'lightweight-charts';
import {
  ActionAddBadgeIcon,
  ActionChartAreaTypeIcon,
  ActionChartBarsTypeIcon,
  ActionChartCandlesTypeIcon,
  ActionChartHistogramTypeIcon,
  ActionChartLineTypeIcon,
  ActionChartStepLineTypeIcon,
  ActionCloseIcon,
  ActionConfirmIcon,
  ActionCreatePackageIcon,
  ActionDeleteIcon,
  ActionDragHandleIcon,
  ActionReceiveInventoryIcon,
  ActionResetIcon,
  ActionUndoIcon,
} from '@icons/actions';
import { getRegimeIcon } from '@icons/domain';
import {
  EntityCustomerIcon,
  EntityLayersIcon,
  EntityReceiptDocumentIcon,
  EntityRevenueIcon,
  EntitySafetyStockIcon,
  EntityServiceIcon,
  EntitySkuIcon,
  EntityTransitIcon,
} from '@icons/entities';
import {
  StatusLoadingIcon,
  StatusGaugeIcon,
  StatusMaximizeIcon,
  StatusMinimizeIcon,
  StatusRadarIcon,
  StatusReadyIcon,
  StatusReorderPointIcon,
  StatusSettingsControlIcon,
  StatusWarningIcon,
  StatusTrendChartIcon,
} from '@icons/status';
import type { IconComponent } from '@icons/types';
import {
  CHART_TIMEFRAME_OPTIONS,
  deriveChartTimeframeBoundary,
  RECENT_TIMEFRAME_MIN_REPORTS,
  type ChartCustomTimeframeRange,
  type ChartTimeframe,
} from '@/components/system/chart-timeframe';
import {
  CHART_RESOLUTION_OPTIONS,
  DEFAULT_CHART_RESOLUTION,
  formatChartResolution,
  parseChartCustomResolution,
  resolutionSpecForOption,
  type ChartCustomResolution,
  type ChartResolutionOption,
} from '@/components/system/chart-resolution';
import {
  CHART_INPUT_VALUE_SOURCE_OPTIONS,
  type ChartInputValueSource,
} from '@/components/system/chart-series-config';
import { intervalTooltipLabel } from '@/components/system/interval-strip';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ChartLayoutPreferenceMergeOptions, ChartVisibleDateRange } from '@/lib/chart-layout-preferences';
import { translateChartTimeframeLabel, translateRegimeLabel } from '@/lib/localized-display';
import { regimeChartFill } from '@/lib/state-tones';
import { translateUiLiteral } from '@/lib/translations';
import { cn } from '@/lib/utils';
import { usePreferences } from '@/state/preferences';
import type {
  TradingChartIndicatorAxisSide,
  TradingChartIndicatorId,
  TradingChartIndicatorLineStyle,
  TradingChartPaneLayout,
  TradingChartIndicatorPrecision,
  TradingChartIndicatorPlotStyle,
  TradingChartIndicatorSettings,
  TradingChartModel,
  TradingChartPoint,
} from './model';
import {
  ALL_TRADING_CHART_INDICATOR_IDS,
  compatiblePlotStyles,
  deriveTradingChartDisplayModel,
  deriveTradingChartPaneLayout,
  isOhlcTradingChartPlotStyle,
  moveTradingChartIndicator,
  nextTradingChartPaneId,
  normalizeTradingChartIndicatorSettings,
  precisionLabel,
  plotStyleLabel,
  supportsLineType,
  supportsLineWidth,
  supportsTradingChartInputSource,
  TRADING_CHART_MAIN_PANE_ID,
  tradingChartTimeKey,
} from './model';

type AnySeries = ISeriesApi<SeriesType, Time>;
type ChartSeriesRefs = Partial<Record<
  | 'inventory'
  | 'uncertaintyLow'
  | 'uncertaintyHigh'
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
  | 'leadTimeRangeLow'
  | 'leadTimeRangeHigh',
  AnySeries
>>;
type InputSeriesData = LineData<Time>[] | HistogramData<Time>[] | Array<BarData<Time> | CandlestickData<Time>>;
type LegendRow = ReturnType<typeof buildLegendRows>[number];
type ChartSettingsDialogId = 'settings' | 'indicators' | 'layout';
type HistogramIndicatorId =
  | 'demand'
  | 'serviceDemand'
  | 'retailDemand'
  | 'receipts'
  | 'ordersInTransit'
  | 'ordersLate'
  | 'ordersReadyToReceive'
  | 'ordersReceived';
type OverlayIndicatorId = 'regime' | 'newOrderFlags' | 'newReceiptFlags';
interface OverlayFlagMarker {
  key: string;
  indicatorId: OverlayIndicatorId;
  paneId: string;
  intervalIndex: number;
  layerOrder: number;
  left: number;
  width: number;
  color: string;
  label: string;
  onClick: () => void;
  icon: IconComponent;
  clustered?: boolean;
}
interface StackedOverlayFlagMarker extends OverlayFlagMarker {
  bottom: number;
}
interface OverlayIconCluster {
  indicatorId: OverlayIndicatorId;
  groupKey: string;
  count: number;
  firstIntervalIndex: number;
  lastIntervalIndex: number;
  left: number;
  right: number;
  center: number;
}
type LayoutDropTarget =
  | { type: 'row'; indicatorId: TradingChartIndicatorId }
  | { type: 'pane'; paneId: string }
  | { type: 'new-pane' };

const INDICATOR_ORDER: TradingChartIndicatorId[] = ALL_TRADING_CHART_INDICATOR_IDS;
const HISTOGRAM_INDICATOR_IDS: HistogramIndicatorId[] = [
  'demand',
  'serviceDemand',
  'retailDemand',
  'receipts',
  'ordersInTransit',
  'ordersLate',
  'ordersReadyToReceive',
  'ordersReceived',
];
const OVERLAY_INDICATOR_IDS: OverlayIndicatorId[] = ['regime', 'newOrderFlags', 'newReceiptFlags'];
const INDICATOR_ICONS: Record<TradingChartIndicatorId, IconComponent> = {
  inventory: EntitySkuIcon,
  uncertainty: StatusRadarIcon,
  reorderPoint: StatusReorderPointIcon,
  safetyStock: EntitySafetyStockIcon,
  demand: EntityCustomerIcon,
  serviceDemand: EntityServiceIcon,
  retailDemand: EntitySkuIcon,
  availableCapacity: EntityLayersIcon,
  demandMinusAvailableCapacity: StatusWarningIcon,
  receipts: ActionReceiveInventoryIcon,
  ordersInTransit: EntityTransitIcon,
  ordersLate: StatusWarningIcon,
  ordersReadyToReceive: StatusReadyIcon,
  ordersReceived: EntityReceiptDocumentIcon,
  newOrderFlags: ActionCreatePackageIcon,
  newReceiptFlags: ActionReceiveInventoryIcon,
  price: EntityRevenueIcon,
  leadTime: EntityTransitIcon,
  leadTimeRange: StatusRadarIcon,
  regime: StatusGaugeIcon,
};
const INDICATOR_SECTIONS: Array<{ title: string; ids: TradingChartIndicatorId[] }> = [
  { title: 'Stock', ids: ['inventory', 'uncertainty', 'reorderPoint', 'safetyStock', 'availableCapacity'] },
  { title: 'Customer flow', ids: ['demand', 'serviceDemand', 'retailDemand', 'demandMinusAvailableCapacity'] },
  { title: 'Supplier flow', ids: ['receipts', 'ordersInTransit', 'ordersLate', 'ordersReadyToReceive', 'ordersReceived', 'newOrderFlags', 'newReceiptFlags'] },
  { title: 'Commercial', ids: ['price'] },
  { title: 'Timing', ids: ['leadTime', 'leadTimeRange'] },
  { title: 'Pattern', ids: ['regime'] },
];

const LINE_STYLE_OPTIONS: TradingChartIndicatorLineStyle[] = ['solid', 'dashed', 'dotted'];
const LINE_WIDTH_OPTIONS = [1, 2, 3, 4] as const;
const PRECISION_OPTIONS: TradingChartIndicatorPrecision[] = ['default', '0', '1', '2'];
const STYLE_COLOR_GRID = [
  ['#f8f8f8', '#d4d4d8', '#b7b7bb', '#9a9a9f', '#808086', '#69696f', '#525259', '#3d3d43', '#1f1f22', '#000000'],
  ['#f23645', '#ff9800', '#ffeb3b', '#4caf50', '#089981', '#26c6da', '#2962ff', '#673ab7', '#9c27b0', '#e91e63'],
  ['#f8c0c5', '#ffe0b2', '#fff5bf', '#c8e6c9', '#b2dfdb', '#b2ebf2', '#bbdefb', '#d1c4e9', '#e1bee7', '#f8bbd0'],
  ['#f59aa3', '#ffd180', '#fff59d', '#a5d6a7', '#80cbc4', '#80deea', '#90caf9', '#b39ddb', '#ce93d8', '#f48fb1'],
  ['#f77c80', '#ffb74d', '#fff176', '#81c784', '#4db6ac', '#4dd0e1', '#5c95ff', '#9575cd', '#ba68c8', '#f06292'],
  ['#ff5252', '#ffa726', '#ffee58', '#66bb6a', '#26a69a', '#26c6da', '#3b82f6', '#7e57c2', '#ab47bc', '#ec407a'],
  ['#b71c2b', '#f57c00', '#fbc02d', '#2e7d32', '#00695c', '#00838f', '#1e40af', '#512da8', '#7b1fa2', '#ad1457'],
  ['#8f1720', '#e65100', '#f57f17', '#1b5e20', '#003c35', '#005662', '#1e3a8a', '#37248f', '#541388', '#880e4f'],
] as const;

const REGIME_COLORS: Record<string, string> = {
  normal: '#2f6f6d',
  spike: '#dc2626',
  lull: '#64748b',
  promo: '#7c3aed',
  correction: '#b45309',
  unknown: '#475569',
};
const CHART_TEXT_COLOR = '#2f2a26';
const CHART_BORDER_COLOR = '#ded6cc';
const CHART_MUTED_COLOR = '#71685f';
const CHART_MIN_RENDER_HEIGHT = 420;
const CHART_ADDITIONAL_PANE_MIN_RENDER_HEIGHT = 120;
const CHART_TIME_AXIS_FALLBACK_HEIGHT = 32;
const CHART_MAX_TIME_AXIS_HEIGHT_RATIO = 0.35;
const CHART_INDICATOR_PANE_RATIO = 0.25;
const CHART_MIN_MAIN_PANE_RATIO = 0.5;
const SERIES_DATA_CACHE = new WeakMap<TradingChartPoint[], Map<string, unknown>>();
const LAYOUT_DROP_ANIMATION = {
  duration: 160,
  easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
};
const REGIME_ICON_SIZE = 28;
const REGIME_CLUSTER_GAP = 8;
const OVERLAY_FLAG_STACK_GAP = 6;
const CHART_ICON_BOTTOM_INSET = OVERLAY_FLAG_STACK_GAP;
const OLDER_LOAD_MIN_LOGICAL_RANGE_THRESHOLD = 5;
const OLDER_LOAD_RANGE_FRACTION = 0.25;
const OLDER_LOAD_MAX_LOGICAL_RANGE_THRESHOLD = 40;
const ENABLE_CHART_INTERACTION_LOCK = false;

const SETTINGS_PANEL_ACCENT = '#2d1a10';
const SETTINGS_INPUT_CLASS = 'h-10 rounded-[1rem] border border-border/70 bg-[#fffaf3] shadow-[0_1px_0_rgba(255,255,255,0.75)]';
const SETTINGS_ICON_CONTROL_CLASS = 'flex h-10 min-w-10 items-center justify-center rounded-[1rem] border border-border/70 bg-[#fffaf3] text-foreground shadow-[0_1px_0_rgba(255,255,255,0.75)]';
const SETTINGS_SEGMENTED_CLASS = 'overflow-hidden rounded-[1rem] border border-border/70 bg-[#fffaf3]';
const SETTINGS_SEGMENTED_OPTION_CLASS = 'flex items-center justify-center border-r border-border/60 last:border-r-0';
const SETTINGS_DIALOG_CLASS =
  'fixed z-50 grid aspect-square h-auto max-h-[84svh] w-[min(42rem,calc(100vw-2rem),calc(100vh-6rem))] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-[1.75rem] border border-border/70 bg-white shadow-[0_28px_90px_rgba(48,31,20,0.22)] outline-none';
const SETTINGS_DIALOG_HEADER_CLASS = 'flex cursor-grab items-start justify-between gap-3 border-b border-border/60 px-8 py-7 active:cursor-grabbing';
const SETTINGS_DIALOG_BODY_BASE_CLASS = 'px-8 py-6';
const SETTINGS_DIALOG_FOOTER_CLASS = 'sticky bottom-0 flex items-center justify-between gap-3 border-t border-border/60 bg-white px-8 py-5';
const SETTINGS_DIALOG_FOOTER_BUTTON_CLASS = 'h-9 rounded-[0.9rem] px-4';
const LAYOUT_NEW_PANE_DROP_ID = 'layout:new-pane';
const LAYOUT_PANE_EDGE_DROP_ZONE_PX = 32;

function pointTimestampMs(point: TradingChartPoint) {
  const source = point.endAt ?? point.startAt;
  if (!source) {
    return null;
  }
  const timestamp = Date.parse(source);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function dateInputValueFromIsoString(value: string | null | undefined) {
  if (!value) {
    return '';
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return '';
  }
  return new Date(timestamp).toISOString().slice(0, 10);
}

function isoStringFromDateInput(value: string, boundary: 'start' | 'end') {
  if (!value) {
    return null;
  }
  const suffix = boundary === 'start' ? 'T00:00:00.000Z' : 'T23:59:59.999Z';
  const timestamp = Date.parse(`${value}${suffix}`);
  if (!Number.isFinite(timestamp)) {
    return null;
  }
  return new Date(timestamp).toISOString();
}

function visibleRangeForTimeframe(
  chartModel: TradingChartModel,
  timeframe: ChartTimeframe,
  customTimeframeRange?: ChartCustomTimeframeRange | null,
) {
  if (chartModel.points.length === 0) {
    return null;
  }
  if (customTimeframeRange) {
    const startBoundary = Date.parse(customTimeframeRange.startAt);
    const endBoundary = Date.parse(customTimeframeRange.endAt);
    if (Number.isFinite(startBoundary) && Number.isFinite(endBoundary)) {
      const firstIndexInRange = chartModel.points.findIndex((point) => {
        const timestamp = pointTimestampMs(point);
        return timestamp != null && timestamp >= startBoundary;
      });
      const lastIndexInRange = [...chartModel.points].reverse().findIndex((point) => {
        const timestamp = pointTimestampMs(point);
        return timestamp != null && timestamp <= endBoundary;
      });
      if (firstIndexInRange >= 0 && lastIndexInRange >= 0) {
        const lastIndex = chartModel.points.length - 1 - lastIndexInRange;
        return {
          from: Math.max(0, Math.min(firstIndexInRange, lastIndex) - 0.5),
          to: Math.max(0, Math.max(firstIndexInRange, lastIndex) + 0.5),
        };
      }
    }
  }
  const latestTimestamp = chartModel.points.reduce<number | null>((latest, point) => {
    const timestamp = pointTimestampMs(point);
    if (timestamp == null) {
      return latest;
    }
    return latest == null ? timestamp : Math.max(latest, timestamp);
  }, null);
  const boundary = latestTimestamp == null
    ? null
    : deriveChartTimeframeBoundary(new Date(latestTimestamp).toISOString(), timeframe);
  if (timeframe === 'MAX' || !boundary) {
    return {
      from: 0,
      to: Math.max(0, chartModel.points.length - 0.5),
    };
  }

  const minimumIndex = timeframe === 'Recent'
    ? Math.max(0, chartModel.points.length - RECENT_TIMEFRAME_MIN_REPORTS)
    : chartModel.points.length - 1;
  const boundaryIndex = chartModel.points.findIndex((point) => {
    const timestamp = pointTimestampMs(point);
    return timestamp == null || timestamp >= boundary.getTime();
  });
  const firstIndex = boundaryIndex < 0
    ? minimumIndex
    : Math.min(boundaryIndex, minimumIndex);

  return {
    from: Math.max(0, firstIndex - 0.5),
    to: Math.max(0, chartModel.points.length - 0.5),
  };
}

function logicalRangesAreClose(
  left: { from: number; to: number } | null,
  right: { from: number; to: number } | null,
) {
  if (!left || !right) {
    return left === right;
  }
  return Math.abs(left.from - right.from) <= 0.01 && Math.abs(left.to - right.to) <= 0.01;
}

function visibleRangeForDateRange(
  chartModel: TradingChartModel,
  visibleDateRange: ChartVisibleDateRange | null | undefined,
) {
  if (!visibleDateRange || chartModel.points.length === 0) {
    return null;
  }
  const startBoundary = Date.parse(visibleDateRange.startAt);
  const endBoundary = Date.parse(visibleDateRange.endAt);
  if (!Number.isFinite(startBoundary) || !Number.isFinite(endBoundary)) {
    return null;
  }
  const firstIndexInRange = chartModel.points.findIndex((point) => {
    const timestamp = pointTimestampMs(point);
    return timestamp != null && timestamp >= startBoundary;
  });
  const lastIndexInRange = [...chartModel.points].reverse().findIndex((point) => {
    const pointStart = point.startAt ? Date.parse(point.startAt) : pointTimestampMs(point);
    return pointStart != null && Number.isFinite(pointStart) && pointStart <= endBoundary;
  });
  if (firstIndexInRange < 0 || lastIndexInRange < 0) {
    return null;
  }
  const lastIndex = chartModel.points.length - 1 - lastIndexInRange;
  return {
    from: Math.max(0, Math.min(firstIndexInRange, lastIndex) - 0.5),
    to: Math.max(0, Math.max(firstIndexInRange, lastIndex) + 0.5),
  };
}

function visibleDateRangeForLogicalRange(
  chartModel: TradingChartModel,
  range: { from: number; to: number } | null,
): ChartVisibleDateRange | null {
  if (!range || chartModel.points.length === 0) {
    return null;
  }
  const startIndex = Math.max(0, Math.min(chartModel.points.length - 1, Math.floor(range.from)));
  const endIndex = Math.max(0, Math.min(chartModel.points.length - 1, Math.ceil(range.to)));
  const firstPoint = chartModel.points[Math.min(startIndex, endIndex)];
  const lastPoint = chartModel.points[Math.max(startIndex, endIndex)];
  const startAt = firstPoint?.startAt ?? firstPoint?.endAt ?? null;
  const endAt = lastPoint?.endAt ?? lastPoint?.startAt ?? null;
  if (!startAt || !endAt) {
    return null;
  }
  return { startAt, endAt };
}

export function shouldAutoCenterSelectedInterval(
  previousSelectedIntervalIndex: number | null,
  selectedIntervalIndex: number | null,
) {
  if (selectedIntervalIndex == null) {
    return false;
  }
  if (previousSelectedIntervalIndex == null) {
    return false;
  }
  return previousSelectedIntervalIndex !== selectedIntervalIndex;
}

function olderLoadThreshold(range: { from: number; to: number }) {
  const visibleWidth = Math.max(1, range.to - range.from);
  return Math.max(
    OLDER_LOAD_MIN_LOGICAL_RANGE_THRESHOLD,
    Math.min(OLDER_LOAD_MAX_LOGICAL_RANGE_THRESHOLD, visibleWidth * OLDER_LOAD_RANGE_FRACTION),
  );
}

function olderLoadGapThresholdPx(chart: IChartApi) {
  const paneWidth = typeof chart.paneSize === 'function' ? chart.paneSize().width : 0;
  return Math.max(24, Math.min(160, Math.max(0, paneWidth) * 0.12));
}

function shouldLoadOlderIntervalsForViewport(
  chart: IChartApi,
  points: TradingChartPoint[],
  range: { from: number; to: number } | null,
) {
  if (!range) {
    return false;
  }
  if (range.from <= olderLoadThreshold(range)) {
    return true;
  }
  const earliestPoint = points[0];
  if (!earliestPoint) {
    return false;
  }
  const earliestPointX = chart.timeScale().timeToCoordinate(earliestPoint.time);
  if (earliestPointX == null) {
    return false;
  }
  return earliestPointX > olderLoadGapThresholdPx(chart);
}

export function paneHeightAllocation(totalHeight: number, indicatorPaneCount: number) {
  if (indicatorPaneCount <= 0) {
    return { main: totalHeight, indicators: [] as number[] };
  }

  const mainRatio = indicatorPaneCount === 1
    ? 1 - CHART_INDICATOR_PANE_RATIO
    : Math.max(CHART_MIN_MAIN_PANE_RATIO, 1 - indicatorPaneCount * CHART_INDICATOR_PANE_RATIO);

  const main = Math.round(totalHeight * mainRatio);
  const remaining = Math.max(0, totalHeight - main);
  const baseIndicator = Math.floor(remaining / indicatorPaneCount);
  const indicators = Array.from({ length: indicatorPaneCount }, (_, index) =>
    index === indicatorPaneCount - 1 ? remaining - baseIndicator * (indicatorPaneCount - 1) : baseIndicator,
  );

  return { main, indicators };
}

export function deriveTradingChartMinRenderHeight(indicatorPaneCount: number) {
  return CHART_MIN_RENDER_HEIGHT + Math.max(0, indicatorPaneCount) * CHART_ADDITIONAL_PANE_MIN_RENDER_HEIGHT;
}

function stableTimeScaleHeight(chart: IChartApi, totalHeight: number) {
  const measuredHeight = Math.max(0, chart.timeScale().height?.() ?? 0);
  const maximumTimeScaleHeight = Math.max(CHART_TIME_AXIS_FALLBACK_HEIGHT, totalHeight * CHART_MAX_TIME_AXIS_HEIGHT_RATIO);
  if (measuredHeight <= 0 || measuredHeight > maximumTimeScaleHeight) {
    return CHART_TIME_AXIS_FALLBACK_HEIGHT;
  }
  return measuredHeight;
}

function paneHeightTargets(
  chart: IChartApi,
  totalHeight: number,
  paneIds: string[],
  preferredPaneHeights?: Record<string, number> | null,
) {
  const timeScaleHeight = stableTimeScaleHeight(chart, totalHeight);
  const plottableHeight = Math.max(0, totalHeight - timeScaleHeight);
  if (plottableHeight <= 0) {
    return [] as number[];
  }
  const normalizedPreferredPaneHeights = paneIds.map((paneId) => preferredPaneHeights?.[paneId] ?? 0);
  const canUsePreferredPaneHeights =
    normalizedPreferredPaneHeights.length === paneIds.length &&
    normalizedPreferredPaneHeights.every((height) => Number.isFinite(height) && height > 0);
  if (canUsePreferredPaneHeights) {
    const totalPreferredHeight = normalizedPreferredPaneHeights.reduce((sum, height) => sum + height, 0);
    if (totalPreferredHeight > 0) {
      const scaled = normalizedPreferredPaneHeights.map((height, index) =>
        index === normalizedPreferredPaneHeights.length - 1
          ? 0
          : Math.max(1, Math.round((height / totalPreferredHeight) * plottableHeight)),
      );
      const consumed = scaled.slice(0, -1).reduce((sum, height) => sum + height, 0);
      scaled[scaled.length - 1] = Math.max(1, plottableHeight - consumed);
      return scaled;
    }
  }
  const allocation = paneHeightAllocation(plottableHeight, Math.max(0, paneIds.length - 1));
  return [allocation.main, ...allocation.indicators];
}

function applyPaneHeights(
  chart: IChartApi | null,
  totalHeight: number,
  paneIds: string[],
  preferredPaneHeights?: Record<string, number> | null,
) {
  if (!chart || typeof chart.panes !== 'function') {
    return [] as number[];
  }
  const panes = chart.panes();
  if (panes.length === 0) {
    return [] as number[];
  }
  const targetPaneCount = Math.min(panes.length, paneIds.length);
  if (targetPaneCount <= 0) {
    return [] as number[];
  }
  const targets = paneHeightTargets(chart, totalHeight, paneIds.slice(0, targetPaneCount), preferredPaneHeights);
  for (let pass = 0; pass < 4; pass += 1) {
    for (let index = 1; index < targetPaneCount; index += 1) {
      panes[index]?.setHeight(targets[index]!);
    }
    panes[0]?.setHeight(targets[0]!);
  }
  return targets;
}

function paneHeightsMatchTargets(
  chart: IChartApi | null,
  totalHeight: number,
  paneIds: string[],
  preferredPaneHeights?: Record<string, number> | null,
  tolerancePx = 2,
) {
  if (!chart || typeof chart.panes !== 'function') {
    return false;
  }
  const panes = chart.panes();
  if (panes.length === 0) {
    return false;
  }
  const targetPaneCount = Math.min(panes.length, paneIds.length);
  if (targetPaneCount <= 0) {
    return false;
  }
  const targets = paneHeightTargets(chart, totalHeight, paneIds.slice(0, targetPaneCount), preferredPaneHeights);
  const anchors = paneLegendAnchors(chart);
  if (anchors.length < targetPaneCount) {
    return false;
  }
  return targets.every((target, index) => Math.abs((anchors[index]?.height ?? -1) - target) <= tolerancePx);
}

function paneHeightsRecordFromAnchors(
  paneLayout: TradingChartPaneLayout[],
  anchors: Array<{ top: number; height: number }>,
) {
  return Object.fromEntries(
    paneLayout
      .map((pane, index) => [pane.id, anchors[index]?.height ?? 0] as const)
      .filter((entry): entry is [string, number] => Number.isFinite(entry[1]) && entry[1] > 0),
  );
}

function paneAnchorListsEqual(
  left: Array<{ top: number; height: number }>,
  right: Array<{ top: number; height: number }>,
) {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((anchor, index) => {
    const other = right[index];
    return other != null && anchor.top === other.top && anchor.height === other.height;
  });
}

function numberRecordEqual(left: Record<string, number> | null | undefined, right: Record<string, number> | null | undefined) {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  const leftEntries = Object.entries(left);
  if (leftEntries.length !== Object.keys(right).length) {
    return false;
  }
  return leftEntries.every(([key, value]) => right[key] === value);
}

function numberMapEqual(left: Map<number, number>, right: Map<number, number>) {
  if (left.size !== right.size) {
    return false;
  }
  for (const [key, value] of left) {
    if (right.get(key) !== value) {
      return false;
    }
  }
  return true;
}

function cleanupEmptyTrailingPanes(chart: IChartApi | null) {
  if (!chart || typeof chart.panes !== 'function' || typeof chart.removePane !== 'function') {
    return;
  }
  while (chart.panes().length > 1) {
    const panes = chart.panes();
    const lastPane = panes.at(-1);
    if (!lastPane || lastPane.getSeries().length > 0) {
      break;
    }
    chart.removePane(panes.length - 1);
  }
}

function observeChartLayout(
  container: HTMLElement,
  onLayoutChange: () => void,
  getObservedElements?: () => HTMLElement[],
  options?: {
    mutationThrottleMs?: number;
    shouldTrackPointerDrag?: (target: EventTarget | null) => boolean;
  },
) {
  let frame: number | null = null;
  let mutationTimer: number | null = null;
  let dragging = false;
  const schedule = () => {
    if (frame != null) {
      return;
    }
    frame = window.requestAnimationFrame(() => {
      frame = null;
      onLayoutChange();
    });
  };

  const resizeObserver = new ResizeObserver(schedule);
  const observed = new Set<HTMLElement>();
  const syncObservedElements = () => {
    const next = new Set<HTMLElement>([container, ...(getObservedElements?.() ?? [])]);
    for (const element of observed) {
      if (!next.has(element)) {
        resizeObserver.unobserve(element);
        observed.delete(element);
      }
    }
    for (const element of next) {
      if (!observed.has(element)) {
        resizeObserver.observe(element);
        observed.add(element);
      }
    }
    schedule();
  };
  const scheduleObservedElementsSync = () => {
    if ((options?.mutationThrottleMs ?? 0) <= 0) {
      syncObservedElements();
      return;
    }
    if (mutationTimer != null) {
      return;
    }
    mutationTimer = window.setTimeout(() => {
      mutationTimer = null;
      syncObservedElements();
    }, options?.mutationThrottleMs ?? 0);
  };
  const mutationObserver = new MutationObserver(scheduleObservedElementsSync);
  mutationObserver.observe(container, { childList: true, subtree: true });

  const stopPointerTracking = () => {
    if (!dragging) {
      return;
    }
    dragging = false;
  };
  const handlePointerMove = (event: PointerEvent) => {
    if (!dragging || !container.contains(event.target as Node | null)) {
      return;
    }
    schedule();
  };
  const handlePointerDown = (event: PointerEvent) => {
    if (!(event.target instanceof Node) || !container.contains(event.target)) {
      return;
    }
    if (!options?.shouldTrackPointerDrag?.(event.target)) {
      return;
    }
    dragging = true;
    schedule();
  };

  syncObservedElements();
  container.addEventListener('pointerdown', handlePointerDown, true);
  window.addEventListener('pointermove', handlePointerMove, true);
  window.addEventListener('pointerup', stopPointerTracking, true);
  window.addEventListener('pointercancel', stopPointerTracking, true);

  return () => {
    if (frame != null) {
      window.cancelAnimationFrame(frame);
    }
    if (mutationTimer != null) {
      window.clearTimeout(mutationTimer);
    }
    stopPointerTracking();
    container.removeEventListener('pointerdown', handlePointerDown, true);
    window.removeEventListener('pointermove', handlePointerMove, true);
    window.removeEventListener('pointerup', stopPointerTracking, true);
    window.removeEventListener('pointercancel', stopPointerTracking, true);
    mutationObserver.disconnect();
    resizeObserver.disconnect();
  };
}

function shouldTrackChartPaneResize(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const resizeHandle = target.closest('[data-slot="separator"], [role="separator"]');
  if (resizeHandle) {
    return true;
  }
  const cursor = window.getComputedStyle(target).cursor;
  return cursor === 'row-resize' || cursor === 'ns-resize' || cursor === 'col-resize' || cursor === 'ew-resize';
}

function lineStylePreviewClass(option: TradingChartIndicatorLineStyle, active: boolean) {
  if (option === 'dotted') {
    return cn(
      'bg-[radial-gradient(circle,currentColor_1.6px,transparent_1.7px)] bg-[length:12px_4px] bg-repeat-x bg-center',
      active ? 'text-background' : 'text-foreground',
    );
  }
  if (option === 'dashed') {
    return cn(
      'bg-[linear-gradient(to_right,currentColor_0_18px,transparent_18px_30px)] bg-[length:30px_4px] bg-repeat-x bg-center',
      active ? 'text-background' : 'text-foreground',
    );
  }
  return active ? 'bg-background' : 'bg-foreground';
}

function settingsDialogBodyClassName(scrollLocked = false) {
  return cn(SETTINGS_DIALOG_BODY_BASE_CLASS, scrollLocked ? 'overflow-hidden' : 'overflow-y-auto');
}

const LayoutIndicatorRowCard = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & {
  dragging?: boolean;
  indicatorId: TradingChartIndicatorId;
  language: AppLanguage;
  onAxisSideChange?: (indicatorId: TradingChartIndicatorId, axisSide: TradingChartIndicatorAxisSide) => void;
  onDelete?: (indicatorId: TradingChartIndicatorId) => void;
  settings: TradingChartIndicatorSettings;
  style?: CSSProperties;
}>(function LayoutIndicatorRowCard({
  className,
  dragging = false,
  indicatorId,
  language,
  onAxisSideChange,
  onDelete,
  settings,
  style,
  ...props
}, ref) {
  const IndicatorIcon = INDICATOR_ICONS[indicatorId];
  const label = indicatorLabel(language, indicatorId);

  return (
    <div
      ref={ref}
      aria-label={translateUiLiteral(language, 'Drag {name}', { name: label })}
      className={cn(
        'flex cursor-grab items-center gap-3 rounded-[1rem] border border-border/60 bg-[#fffaf3] px-3 py-3 shadow-[0_1px_0_rgba(255,255,255,0.75)] transition-[box-shadow,opacity,transform] duration-150 ease-out focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 active:cursor-grabbing data-[dragging=true]:cursor-grabbing data-[dragging=true]:shadow-[0_16px_42px_rgba(48,31,20,0.16)] motion-reduce:transition-none',
        dragging && 'opacity-70',
        className,
      )}
      data-dragging={dragging || undefined}
      style={style}
      tabIndex={0}
      {...props}
    >
      <span
        aria-hidden="true"
        className="flex h-8 w-8 items-center justify-center rounded-[0.75rem] text-muted-foreground"
      >
        <ActionDragHandleIcon className="size-4" />
      </span>
      <IndicatorIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{label}</span>
      <Select
        value={settings[indicatorId].axisSide}
        onValueChange={(value) => onAxisSideChange?.(indicatorId, value as TradingChartIndicatorAxisSide)}
      >
        <SelectTrigger aria-label={translateUiLiteral(language, '{name} axis side', { name: label })} className="h-9 min-w-36 rounded-[0.9rem] bg-white px-3 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end" className="rounded-[1rem] border-border/70 bg-[#fdfaf6]">
          <SelectItem value="left">{translateUiLiteral(language, 'Left y-axis')}</SelectItem>
          <SelectItem value="right">{translateUiLiteral(language, 'Right y-axis')}</SelectItem>
        </SelectContent>
      </Select>
      <Button
        aria-label={translateUiLiteral(language, 'Delete {name}', { name: label })}
        className="h-9 rounded-[0.9rem] px-3"
        type="button"
        variant="destructive-outline"
        onClick={() => onDelete?.(indicatorId)}
      >
        <ActionDeleteIcon className="size-4" />
      </Button>
    </div>
  );
});

function LayoutIndicatorRow({
  indicatorId,
  language,
  settings,
  onAxisSideChange,
  onDelete,
}: {
  indicatorId: TradingChartIndicatorId;
  language: AppLanguage;
  settings: TradingChartIndicatorSettings;
  onAxisSideChange: (indicatorId: TradingChartIndicatorId, axisSide: TradingChartIndicatorAxisSide) => void;
  onDelete: (indicatorId: TradingChartIndicatorId) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: layoutRowId(indicatorId),
    animateLayoutChanges: (args) => defaultAnimateLayoutChanges({ ...args, wasDragging: true }),
  });

  return (
    <LayoutIndicatorRowCard
      {...attributes}
      {...listeners}
      dragging={isDragging}
      indicatorId={indicatorId}
      language={language}
      ref={setNodeRef}
      settings={settings}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      onAxisSideChange={onAxisSideChange}
      onDelete={onDelete}
    />
  );
}

function LayoutPaneSection({
  language,
  pane,
  settings,
  onAxisSideChange,
  onDelete,
}: {
  language: AppLanguage;
  pane: TradingChartPaneLayout;
  settings: TradingChartIndicatorSettings;
  onAxisSideChange: (indicatorId: TradingChartIndicatorId, axisSide: TradingChartIndicatorAxisSide) => void;
  onDelete: (indicatorId: TradingChartIndicatorId) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: layoutPaneId(pane.id) });

  return (
    <section
      ref={setNodeRef}
      className={cn(
        'grid gap-3 rounded-[1.25rem] border border-border/60 bg-white/70 p-4',
        isOver && 'border-foreground/50 bg-[#fff7ee]',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {layoutPaneLabel(language, pane.id)}
        </p>
      </div>
      <SortableContext items={pane.indicatorIds.map(layoutRowId)} strategy={verticalListSortingStrategy}>
        <div className="grid gap-3">
          {pane.indicatorIds.map((indicatorId) => (
            <LayoutIndicatorRow
              key={indicatorId}
              indicatorId={indicatorId}
              language={language}
              settings={settings}
              onAxisSideChange={onAxisSideChange}
              onDelete={onDelete}
            />
          ))}
        </div>
      </SortableContext>
    </section>
  );
}

function LayoutNewPaneDropZone({ language }: { language: AppLanguage }) {
  const { isOver, setNodeRef } = useDroppable({ id: LAYOUT_NEW_PANE_DROP_ID });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex min-h-24 items-center justify-center gap-2 rounded-[1.25rem] border border-dashed border-border/70 bg-[#fffaf3] px-4 text-sm text-muted-foreground transition-colors hover:border-accent hover:bg-accent hover:text-accent-foreground',
        isOver && 'border-accent bg-accent text-accent-foreground',
      )}
    >
      <ActionAddBadgeIcon aria-hidden="true" className="size-4" />
      <span>{translateUiLiteral(language, 'New pane')}</span>
    </div>
  );
}

function indicatorLabel(language: AppLanguage, id: TradingChartIndicatorId) {
  const englishLabel = (() => {
  switch (id) {
    case 'inventory':
      return 'Inventory';
    case 'uncertainty':
      return 'Uncertainty';
    case 'reorderPoint':
      return 'Reorder point';
    case 'safetyStock':
      return 'Safety stock';
    case 'demand':
      return 'Customer demand';
    case 'serviceDemand':
      return 'Customer service demand';
    case 'retailDemand':
      return 'Customer retail demand';
    case 'availableCapacity':
      return 'Available capacity';
    case 'demandMinusAvailableCapacity':
      return 'Demand vs capacity gap';
    case 'receipts':
      return 'Supplier receipts + adjustments';
    case 'ordersInTransit':
      return 'Supplier orders in transit';
    case 'ordersLate':
      return 'Supplier orders late';
    case 'ordersReadyToReceive':
      return 'Supplier orders ready to receive';
    case 'ordersReceived':
      return 'Supplier receipts';
    case 'newOrderFlags':
      return 'Supplier order activity';
    case 'newReceiptFlags':
      return 'Supplier receipt activity';
    case 'price':
      return 'Price';
    case 'leadTime':
      return 'Lead time';
    case 'leadTimeRange':
      return 'Lead time range';
    case 'regime':
      return 'Sales Pattern';
  }
  })();
  return translateUiLiteral(language, englishLabel);
}

function indicatorDescription(language: AppLanguage, id: TradingChartIndicatorId) {
  const englishDescription = (() => {
  switch (id) {
    case 'demand':
      return 'Expected customer demand across services and retail for each interval.';
    case 'serviceDemand':
      return 'Expected customer service demand for each interval.';
    case 'retailDemand':
      return 'Expected customer retail demand for each interval.';
    case 'availableCapacity':
      return 'Projected available capacity for the interval.';
    case 'demandMinusAvailableCapacity':
      return 'Gap between customer demand and available capacity in the interval.';
    case 'inventory':
      return 'Projected on-hand inventory across the loaded intervals.';
    case 'price':
      return 'Observed selling price when product price data is available.';
    case 'receipts':
      return 'Supplier receipts and stock adjustments that increase or correct stock.';
    case 'ordersInTransit':
      return 'Posterior supplier units in transit for each interval.';
    case 'ordersLate':
      return 'Open supplier order quantity now late against expected arrival.';
    case 'ordersReadyToReceive':
      return 'Open supplier order quantity marked awaiting receipt.';
    case 'ordersReceived':
      return 'Posterior supplier receipt quantity landing in each interval.';
    case 'newOrderFlags':
      return 'Intervals where new supplier order placement signals were recorded.';
    case 'newReceiptFlags':
      return 'Intervals where new supplier receipt signals were recorded.';
    case 'regime':
      return 'Sales-pattern state markers such as stock-limited or spike intervals.';
    case 'reorderPoint':
      return 'Threshold where replenishment should be considered.';
    case 'safetyStock':
      return 'Buffer inventory intended to absorb variability.';
    case 'uncertainty':
      return 'Upper and lower inventory uncertainty around the main forecast.';
    case 'leadTime':
      return 'Average lead time for the interval.';
    case 'leadTimeRange':
      return 'Lead time variability range around the interval mean.';
  }
  })();
  return translateUiLiteral(language, englishDescription);
}

function isHistogramIndicatorId(id: TradingChartIndicatorId): id is HistogramIndicatorId {
  return HISTOGRAM_INDICATOR_IDS.includes(id as HistogramIndicatorId);
}

function isOverlayIndicatorId(id: TradingChartIndicatorId): id is OverlayIndicatorId {
  return OVERLAY_INDICATOR_IDS.includes(id as OverlayIndicatorId);
}

function histogramIndicatorValue(point: TradingChartPoint, id: HistogramIndicatorId) {
  switch (id) {
    case 'demand':
      if (point.serviceDemandMean == null && point.retailDemandMean == null) {
        return null;
      }
      return -((point.serviceDemandMean ?? 0) + (point.retailDemandMean ?? 0));
    case 'serviceDemand':
      return point.serviceDemandMean == null ? null : -(point.serviceDemandMean ?? 0);
    case 'retailDemand':
      return point.retailDemandMean == null ? null : -(point.retailDemandMean ?? 0);
    case 'receipts':
      if (point.receiptsMean == null && point.adjustmentsMean == null) {
        return null;
      }
      return (point.receiptsMean ?? 0) + (point.adjustmentsMean ?? 0);
    case 'ordersInTransit':
      return point.ordersInTransitMean;
    case 'ordersLate':
      return point.ordersLateMean;
    case 'ordersReadyToReceive':
      return point.ordersReadyToReceiveMean;
    case 'ordersReceived':
      return point.ordersReceivedMean;
    default:
      return null;
  }
}

function scalarIndicatorValue(point: TradingChartPoint, id: TradingChartIndicatorId) {
  switch (id) {
    case 'inventory':
      return point.inventoryMean;
    case 'demand':
    case 'serviceDemand':
    case 'retailDemand':
    case 'receipts':
    case 'ordersInTransit':
    case 'ordersLate':
    case 'ordersReadyToReceive':
    case 'ordersReceived':
      return histogramIndicatorValue(point, id);
    case 'availableCapacity':
      return point.availableCapacity;
    case 'demandMinusAvailableCapacity':
      return point.demandMinusAvailableCapacity;
    case 'price':
      return point.price;
    case 'leadTime':
      return point.leadTimeMean;
    default:
      return null;
  }
}

function sourceMembersForPoint(point: TradingChartPoint) {
  return point.sourceMembers?.length ? point.sourceMembers : [point];
}

function indicatorOhlc(point: TradingChartPoint, id: TradingChartIndicatorId) {
  const values = sourceMembersForPoint(point)
    .map((member) => scalarIndicatorValue(member, id))
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (values.length === 0) {
    return null;
  }
  return {
    open: values[0]!,
    high: Math.max(...values),
    low: Math.min(...values),
    close: values.at(-1)!,
  };
}

function valueForInputSource(
  point: TradingChartPoint,
  id: TradingChartIndicatorId,
  source: ChartInputValueSource | undefined,
) {
  const ohlc = indicatorOhlc(point, id);
  if (!ohlc) {
    return null;
  }
  switch (source ?? 'close') {
    case 'open':
      return ohlc.open;
    case 'high':
      return ohlc.high;
    case 'low':
      return ohlc.low;
    case 'hl2':
      return (ohlc.high + ohlc.low) / 2;
    case 'ohlc4':
      return (ohlc.open + ohlc.high + ohlc.low + ohlc.close) / 4;
    case 'close':
    case 'ohlc':
      return ohlc.close;
  }
}

function sourceLineData(
  points: TradingChartPoint[],
  id: TradingChartIndicatorId,
  setting: { inputSource?: ChartInputValueSource },
): LineData<Time>[] {
  return lineData(points, (point) => valueForInputSource(point, id, setting.inputSource));
}

function sourceHistogramData(
  points: TradingChartPoint[],
  id: TradingChartIndicatorId,
  setting: { color: string; inputSource?: ChartInputValueSource },
  color: string,
): HistogramData<Time>[] {
  return histogramData(points, (point) => valueForInputSource(point, id, setting.inputSource), color);
}

function sourceOhlcData(points: TradingChartPoint[], id: TradingChartIndicatorId): Array<BarData<Time> | CandlestickData<Time>> {
  return points
    .map((point) => {
      const ohlc = indicatorOhlc(point, id);
      return ohlc ? { time: point.time, ...ohlc } : null;
    })
    .filter((point): point is BarData<Time> | CandlestickData<Time> => point != null);
}

function cachedSeriesData<T>(points: TradingChartPoint[], key: string, factory: () => T) {
  const cachedEntries = SERIES_DATA_CACHE.get(points);
  if (cachedEntries?.has(key)) {
    return cachedEntries.get(key) as T;
  }
  const value = factory();
  const nextCachedEntries = cachedEntries ?? new Map<string, unknown>();
  nextCachedEntries.set(key, value);
  if (!cachedEntries) {
    SERIES_DATA_CACHE.set(points, nextCachedEntries);
  }
  return value;
}

function inputSeriesDataCacheKey(
  id: TradingChartIndicatorId,
  setting: TradingChartIndicatorSettings[TradingChartIndicatorId],
) {
  if (isOhlcTradingChartPlotStyle(setting.plotStyle)) {
    return `${id}:ohlc:${setting.plotStyle}`;
  }
  if (setting.plotStyle === 'histogram') {
    return `${id}:histogram:${setting.inputSource ?? 'close'}:${histogramSeriesColor(setting.color, setting.opacity ?? 0.5, setting.plotStyle)}`;
  }
  return `${id}:line:${setting.plotStyle}:${setting.inputSource ?? 'close'}`;
}

function cachedInputSeriesData(
  points: TradingChartPoint[],
  id: TradingChartIndicatorId,
  setting: TradingChartIndicatorSettings[TradingChartIndicatorId],
): InputSeriesData {
  return cachedSeriesData(points, inputSeriesDataCacheKey(id, setting), () => {
    if (isOhlcTradingChartPlotStyle(setting.plotStyle)) {
      return sourceOhlcData(points, id);
    }
    if (setting.plotStyle === 'histogram') {
      return sourceHistogramData(
        points,
        id,
        setting,
        histogramSeriesColor(setting.color, setting.opacity ?? 0.5, setting.plotStyle),
      );
    }
    return sourceLineData(points, id, setting);
  });
}

function cachedLineSeriesData(
  points: TradingChartPoint[],
  key: string,
  selector: (point: TradingChartPoint) => number | null,
) {
  return cachedSeriesData(points, key, () => lineData(points, selector));
}

function setInputSeriesData(
  series: AnySeries | undefined,
  points: TradingChartPoint[],
  id: TradingChartIndicatorId,
  setting: TradingChartIndicatorSettings[TradingChartIndicatorId],
) {
  if (!series) {
    return;
  }
  series.setData(cachedInputSeriesData(points, id, setting) as never);
}

function histogramIndicatorLegendValue(
  point: TradingChartPoint,
  id: HistogramIndicatorId,
  precision: TradingChartIndicatorPrecision,
  source: ChartInputValueSource | undefined,
) {
  if (source && source !== 'close') {
    const value = valueForInputSource(point, id, source);
    return id === 'demand' || id === 'serviceDemand' || id === 'retailDemand'
      ? formatValue(value == null ? value : Math.abs(value), 'u', precision)
      : formatValue(value, 'u', precision);
  }
  switch (id) {
    case 'demand': {
      const totalDemand = (point.serviceDemandMean ?? 0) + (point.retailDemandMean ?? 0);
      return point.serviceDemandMean == null && point.retailDemandMean == null ? 'No data' : formatValue(totalDemand, 'u', precision);
    }
    case 'serviceDemand':
      return formatValue(point.serviceDemandMean, 'u', precision);
    case 'retailDemand':
      return formatValue(point.retailDemandMean, 'u', precision);
    case 'receipts':
      return point.receiptsMean == null && point.adjustmentsMean == null
        ? 'No data'
        : `${formatValue(point.receiptsMean ?? 0, 'u', precision)} / ${formatValue(point.adjustmentsMean ?? 0, 'u', precision)} adj`;
    case 'ordersInTransit':
      return formatValue(point.ordersInTransitMean, 'u', precision);
    case 'ordersLate':
      return formatValue(point.ordersLateMean, 'u', precision);
    case 'ordersReadyToReceive':
      return formatValue(point.ordersReadyToReceiveMean, 'u', precision);
    case 'ordersReceived':
      return formatValue(point.ordersReceivedMean, 'u', precision);
    default:
      return 'No data';
  }
}

export function stackOverlayFlagMarkers(markers: OverlayFlagMarker[]): StackedOverlayFlagMarker[] {
  const grouped = new Map<string, OverlayFlagMarker[]>();
  for (const marker of markers) {
    const key = marker.paneId;
    const current = grouped.get(key) ?? [];
    current.push(marker);
    grouped.set(key, current);
  }
  return [...grouped.values()].flatMap((group) => {
    const rows: OverlayFlagMarker[][] = [];
    return [...group]
      .sort((left, right) => left.layerOrder - right.layerOrder || INDICATOR_ORDER.indexOf(left.indicatorId) - INDICATOR_ORDER.indexOf(right.indicatorId))
      .map((marker) => {
        const markerRight = marker.left + marker.width;
        let rowIndex = rows.findIndex((row) => !row.some((placed) => marker.left < placed.left + placed.width + OVERLAY_FLAG_STACK_GAP && markerRight + OVERLAY_FLAG_STACK_GAP > placed.left));
        if (rowIndex === -1) {
          rowIndex = rows.length;
          rows.push([]);
        }
        rows[rowIndex]!.push(marker);
        return {
          ...marker,
          bottom: CHART_ICON_BOTTOM_INSET + rowIndex * (REGIME_ICON_SIZE + OVERLAY_FLAG_STACK_GAP),
        };
      });
  });
}

function lineStyleValue(style: TradingChartIndicatorLineStyle | undefined) {
  if (style === 'dashed') {
    return LineStyle.Dashed;
  }
  if (style === 'dotted') {
    return LineStyle.Dotted;
  }
  return LineStyle.Solid;
}

function applySeriesApiOptions(series: AnySeries | undefined, options: unknown) {
  if (!series) {
    return;
  }
  (series as AnySeries & { applyOptions: (next: unknown) => void }).applyOptions(options);
}

function addInputSeries({
  chart,
  paneIndex,
  priceScaleId,
  setting,
}: {
  chart: IChartApi;
  paneIndex: number;
  priceScaleId: TradingChartIndicatorAxisSide;
  setting: TradingChartIndicatorSettings[TradingChartIndicatorId];
}) {
  const lineWidth = Math.max(1, Math.min(4, setting.lineWidth ?? 2)) as 1 | 2 | 3 | 4;
  if (setting.plotStyle === 'area') {
    return chart.addSeries(AreaSeries, {
      priceScaleId,
      lineColor: setting.color,
      lineStyle: lineStyleValue(setting.lineStyle),
      lineWidth,
      topColor: rgba(setting.color, 0.22),
      bottomColor: rgba(setting.color, 0.03),
      priceLineVisible: false,
      lastValueVisible: setting.showPriceScaleLabel ?? true,
    }, paneIndex);
  }
  if (setting.plotStyle === 'histogram') {
    return chart.addSeries(HistogramSeries, {
      color: histogramSeriesColor(setting.color, setting.opacity ?? 0.5, setting.plotStyle),
      priceScaleId,
      priceLineVisible: false,
      lastValueVisible: setting.showPriceScaleLabel ?? false,
      base: 0,
      priceFormat: { type: 'volume' },
    }, paneIndex);
  }
  if (setting.plotStyle === 'bars') {
    return chart.addSeries(BarSeries, {
      priceScaleId,
      upColor: setting.color,
      downColor: rgba(setting.color, Math.max(0.45, setting.opacity ?? 0.55)),
      thinBars: false,
      priceLineVisible: false,
      lastValueVisible: setting.showPriceScaleLabel ?? true,
    }, paneIndex);
  }
  if (setting.plotStyle === 'candles') {
    const downColor = colorWheelInverse(setting.color);
    return chart.addSeries(CandlestickSeries, {
      priceScaleId,
      upColor: rgba(setting.color, Math.max(0.82, setting.opacity ?? 0.82)),
      downColor: rgba(downColor, Math.max(0.82, setting.opacity ?? 0.82)),
      borderUpColor: setting.color,
      borderDownColor: downColor,
      wickUpColor: setting.color,
      wickDownColor: downColor,
      priceLineVisible: false,
      lastValueVisible: setting.showPriceScaleLabel ?? true,
    }, paneIndex);
  }
  return chart.addSeries(LineSeries, {
    priceScaleId,
    color: setting.color,
    lineStyle: lineStyleValue(setting.lineStyle),
    lineType: setting.plotStyle === 'step-line' ? LineType.WithSteps : LineType.Simple,
    lineWidth,
    priceLineVisible: false,
    lastValueVisible: setting.showPriceScaleLabel ?? true,
  }, paneIndex);
}

function applyInputSeriesOptions(
  series: AnySeries | undefined,
  setting: TradingChartIndicatorSettings[TradingChartIndicatorId],
) {
  const lineWidth = Math.max(1, Math.min(4, setting.lineWidth ?? 2)) as 1 | 2 | 3 | 4;
  if (setting.plotStyle === 'area') {
    applySeriesApiOptions(series, {
      lineColor: setting.color,
      lineStyle: lineStyleValue(setting.lineStyle),
      lineWidth,
      topColor: rgba(setting.color, 0.22),
      bottomColor: rgba(setting.color, 0.03),
      lastValueVisible: setting.showPriceScaleLabel ?? true,
    });
    return;
  }
  if (setting.plotStyle === 'histogram') {
    applySeriesApiOptions(series, {
      color: histogramSeriesColor(setting.color, setting.opacity ?? 0.5, setting.plotStyle),
      lastValueVisible: setting.showPriceScaleLabel ?? false,
      base: 0,
    });
    return;
  }
  if (setting.plotStyle === 'bars') {
    applySeriesApiOptions(series, {
      upColor: setting.color,
      downColor: rgba(setting.color, Math.max(0.45, setting.opacity ?? 0.55)),
      thinBars: false,
      lastValueVisible: setting.showPriceScaleLabel ?? true,
    });
    return;
  }
  if (setting.plotStyle === 'candles') {
    const downColor = colorWheelInverse(setting.color);
    applySeriesApiOptions(series, {
      upColor: rgba(setting.color, Math.max(0.82, setting.opacity ?? 0.82)),
      downColor: rgba(downColor, Math.max(0.82, setting.opacity ?? 0.82)),
      borderUpColor: setting.color,
      borderDownColor: downColor,
      wickUpColor: setting.color,
      wickDownColor: downColor,
      lastValueVisible: setting.showPriceScaleLabel ?? true,
    });
    return;
  }
  applySeriesApiOptions(series, {
    color: setting.color,
    lineStyle: lineStyleValue(setting.lineStyle),
    lineType: setting.plotStyle === 'step-line' ? LineType.WithSteps : LineType.Simple,
    lineWidth,
    lastValueVisible: setting.showPriceScaleLabel ?? true,
  });
}

function inputSourceOptionDisabled(plotStyle: TradingChartIndicatorPlotStyle, source: ChartInputValueSource) {
  if (!supportsTradingChartInputSource(plotStyle)) {
    return true;
  }
  if (isOhlcTradingChartPlotStyle(plotStyle)) {
    return source !== 'ohlc';
  }
  return source === 'ohlc';
}

function histogramSeriesColor(color: string, opacity: number, plotStyle: TradingChartIndicatorPlotStyle) {
  return rgba(color, plotStyle === 'columns' ? Math.max(opacity, 0.88) : opacity);
}

function regimeClusterLabel(language: 'en' | 'km', regime: string, count: number) {
  const translated = translateRegimeLabel(language, regime);
  return count > 1 ? `${translated}, ${count} intervals` : translated;
}

function rgba(hex: string, opacity: number) {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
    return hex;
  }
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${Math.max(0, Math.min(1, opacity))})`;
}

function hexToRgb(hex: string) {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
    return null;
  }
  return {
    red: Number.parseInt(hex.slice(1, 3), 16),
    green: Number.parseInt(hex.slice(3, 5), 16),
    blue: Number.parseInt(hex.slice(5, 7), 16),
  };
}

function rgbToHex({ red, green, blue }: { red: number; green: number; blue: number }) {
  return `#${[red, green, blue].map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0')).join('')}`;
}

function rgbToHsl({ red, green, blue }: { red: number; green: number; blue: number }) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) {
    return { hue: 0, saturation: 0, lightness };
  }
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue = 0;
  switch (max) {
    case r:
      hue = (g - b) / delta + (g < b ? 6 : 0);
      break;
    case g:
      hue = (b - r) / delta + 2;
      break;
    default:
      hue = (r - g) / delta + 4;
      break;
  }
  return { hue: hue / 6, saturation, lightness };
}

function hslToRgb({ hue, saturation, lightness }: { hue: number; saturation: number; lightness: number }) {
  if (saturation === 0) {
    const value = lightness * 255;
    return { red: value, green: value, blue: value };
  }
  const hueToRgb = (p: number, q: number, t: number) => {
    let next = t;
    if (next < 0) next += 1;
    if (next > 1) next -= 1;
    if (next < 1 / 6) return p + (q - p) * 6 * next;
    if (next < 1 / 2) return q;
    if (next < 2 / 3) return p + (q - p) * (2 / 3 - next) * 6;
    return p;
  };
  const q = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  return {
    red: hueToRgb(p, q, hue + 1 / 3) * 255,
    green: hueToRgb(p, q, hue) * 255,
    blue: hueToRgb(p, q, hue - 1 / 3) * 255,
  };
}

function colorWheelInverse(hex: string) {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return hex;
  }
  const hsl = rgbToHsl(rgb);
  return rgbToHex(hslToRgb({
    hue: (hsl.hue + 0.5) % 1,
    saturation: hsl.saturation,
    lightness: hsl.lightness,
  }));
}

function plotStyleIcon(plotStyle: TradingChartIndicatorPlotStyle) {
  switch (plotStyle) {
    case 'area':
      return ActionChartAreaTypeIcon;
    case 'step-line':
      return ActionChartStepLineTypeIcon;
    case 'histogram':
      return ActionChartHistogramTypeIcon;
    case 'bars':
      return ActionChartBarsTypeIcon;
    case 'candles':
      return ActionChartCandlesTypeIcon;
    case 'line':
    default:
      return ActionChartLineTypeIcon;
  }
}

function regimeUsesIcons(plotStyle: TradingChartIndicatorPlotStyle) {
  return plotStyle === 'icons' || plotStyle === 'background-highlight-icons';
}

function regimeUsesBackground(plotStyle: TradingChartIndicatorPlotStyle) {
  return plotStyle === 'background-highlight' || plotStyle === 'background-highlight-icons';
}

function formatValue(value: number | null | undefined, suffix = '', precision: TradingChartIndicatorPrecision = 'default') {
  if (value == null || !Number.isFinite(value)) {
    return 'No data';
  }
  const digits = precision === 'default'
    ? (Number.isInteger(value) ? 0 : 2)
    : Number.parseInt(precision, 10);
  return `${value.toFixed(digits)}${suffix}`;
}

function shortRegimeLabel(regime: string | null) {
  if (!regime) {
    return '';
  }
  return regime
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 3);
}

function isEnabled(settings: TradingChartIndicatorSettings, availability: TradingChartModel['availability'], id: TradingChartIndicatorId) {
  return settings[id].enabled && availability[id];
}

function canUseCanvasChart() {
  return typeof navigator === 'undefined' || !/jsdom/i.test(navigator.userAgent);
}

function pointForLegend({
  chartModel,
  hoveredTime,
  selectedIntervalIndex,
}: {
  chartModel: TradingChartModel;
  hoveredTime: Time | null;
  selectedIntervalIndex: number | null;
}) {
  if (hoveredTime != null) {
    return chartModel.pointByTimeKey.get(tradingChartTimeKey(hoveredTime)) ?? null;
  }
  if (selectedIntervalIndex != null) {
    return chartModel.pointByIntervalIndex.get(selectedIntervalIndex) ?? null;
  }
  return chartModel.points.at(-1) ?? null;
}

function lineData(points: TradingChartPoint[], selector: (point: TradingChartPoint) => number | null): LineData<Time>[] {
  return points
    .map((point) => {
      const value = selector(point);
      return value == null ? null : { time: point.time, value };
    })
    .filter((point): point is LineData<Time> => point != null);
}

function histogramData(points: TradingChartPoint[], selector: (point: TradingChartPoint) => number | null, color: string): HistogramData<Time>[] {
  return points
    .map((point) => {
      const value = selector(point);
      return value == null ? null : { time: point.time, value, color };
    })
    .filter((point): point is HistogramData<Time> => point != null);
}

function setSeriesData(
  series: ChartSeriesRefs,
  chartModel: TradingChartModel,
  settings: TradingChartIndicatorSettings,
) {
  setInputSeriesData(series.inventory, chartModel.points, 'inventory', settings.inventory);
  series.uncertaintyLow?.setData(cachedLineSeriesData(chartModel.points, 'uncertainty:low', (point) => point.inventoryLow));
  series.uncertaintyHigh?.setData(cachedLineSeriesData(chartModel.points, 'uncertainty:high', (point) => point.inventoryHigh));
  series.reorderPoint?.setData(cachedLineSeriesData(chartModel.points, 'reorder-point', (point) => point.reorderPoint));
  series.safetyStock?.setData(cachedLineSeriesData(chartModel.points, 'safety-stock', (point) => point.safetyStock));
  for (const indicatorId of HISTOGRAM_INDICATOR_IDS) {
    const targetSeries = series[indicatorId];
    setInputSeriesData(targetSeries, chartModel.points, indicatorId, settings[indicatorId]);
  }
  setInputSeriesData(series.price, chartModel.points, 'price', settings.price);
  setInputSeriesData(series.availableCapacity, chartModel.points, 'availableCapacity', settings.availableCapacity);
  setInputSeriesData(series.demandMinusAvailableCapacity, chartModel.points, 'demandMinusAvailableCapacity', settings.demandMinusAvailableCapacity);
  setInputSeriesData(series.leadTime, chartModel.points, 'leadTime', settings.leadTime);
  series.leadTimeRangeLow?.setData(cachedLineSeriesData(chartModel.points, 'lead-time-range:low', (point) => point.leadTimeLow));
  series.leadTimeRangeHigh?.setData(cachedLineSeriesData(chartModel.points, 'lead-time-range:high', (point) => point.leadTimeHigh));
}

function cachedOverlayAnchorData(points: TradingChartPoint[]) {
  return cachedSeriesData(points, 'overlay-anchor', () => points.map((point) => ({
    time: point.time,
    value: 0,
  })));
}

export function buildOverlayIconClusters(
  entries: Array<{
    indicatorId: OverlayIndicatorId;
    groupKey: string;
    intervalIndex: number;
    x: number;
  }>,
) {
  const positionedEntries = [...entries].sort((left, right) =>
    left.indicatorId.localeCompare(right.indicatorId) ||
    left.intervalIndex - right.intervalIndex
  );

  const clusters: OverlayIconCluster[] = [];

  for (const entry of positionedEntries) {
    const iconLeft = entry.x - REGIME_ICON_SIZE / 2;
    const iconRight = entry.x + REGIME_ICON_SIZE / 2;
    const previous = clusters.at(-1);
    const overlapsPrevious =
      previous &&
      previous.indicatorId === entry.indicatorId &&
      previous.groupKey === entry.groupKey &&
      iconLeft <= previous.right + REGIME_CLUSTER_GAP;

    if (overlapsPrevious) {
      previous.lastIntervalIndex = entry.intervalIndex;
      previous.count += 1;
      previous.left = Math.min(previous.left, iconLeft);
      previous.right = Math.max(previous.right, iconRight);
      previous.center = (previous.left + previous.right) / 2;
      continue;
    }

    clusters.push({
      indicatorId: entry.indicatorId,
      groupKey: entry.groupKey,
      count: 1,
      firstIntervalIndex: entry.intervalIndex,
      lastIntervalIndex: entry.intervalIndex,
      left: iconLeft,
      right: iconRight,
      center: entry.x,
    });
  }

  return clusters;
}

function buildRegimeIconClusters(
  visibleRegimePoints: TradingChartPoint[],
  regimeIconPositions: Map<number, number>,
) {
  return buildOverlayIconClusters(
    visibleRegimePoints
      .map((point) => {
        const x = regimeIconPositions.get(point.intervalIndex);
        return point.dominantRegime && x != null
          ? {
            indicatorId: 'regime' as const,
            groupKey: point.dominantRegime,
            intervalIndex: point.intervalIndex,
            x,
          }
          : null;
      })
      .filter((entry): entry is { indicatorId: 'regime'; groupKey: string; intervalIndex: number; x: number } => entry != null),
  );
}

function buildStackedOverlayMarkers({
  chartModel,
  clusters,
  editableIndicatorSettings,
  language,
  onSelectInterval,
  regimeIconPositions,
  regimePaneId,
  showRegimeIcons,
}: {
  chartModel: TradingChartModel;
  clusters: OverlayIconCluster[];
  editableIndicatorSettings: TradingChartIndicatorSettings;
  language: 'en' | 'km';
  onSelectInterval: (index: number) => void;
  regimeIconPositions: Map<number, number>;
  regimePaneId: string;
  showRegimeIcons: boolean;
}) {
  const markers: OverlayFlagMarker[] = [];

  if (showRegimeIcons) {
    for (const cluster of clusters) {
      const regime = cluster.groupKey;
      const regimeKey = regime.toLowerCase();
      markers.push({
        key: `regime:${cluster.firstIntervalIndex}-${cluster.lastIntervalIndex}-${regime}`,
        indicatorId: 'regime',
        paneId: regimePaneId,
        intervalIndex: cluster.lastIntervalIndex,
        layerOrder: editableIndicatorSettings.regime.layerOrder,
        left: cluster.count > 1 ? cluster.left : cluster.center - REGIME_ICON_SIZE / 2,
        width: cluster.count > 1 ? Math.max(REGIME_ICON_SIZE, cluster.right - cluster.left) : REGIME_ICON_SIZE,
        color: REGIME_COLORS[regimeKey] ?? REGIME_COLORS.unknown,
        label: regimeClusterLabel(language, regime, cluster.count),
        onClick: () => onSelectInterval(cluster.lastIntervalIndex),
        icon: getRegimeIcon(regime),
        clustered: cluster.count > 1,
      });
    }
  }

  const pushPointFlagMarkers = (
    indicatorId: 'newOrderFlags' | 'newReceiptFlags',
    enabled: boolean,
    hasValue: (point: TradingChartPoint) => boolean,
    Icon: IconComponent,
    label: string,
  ) => {
    if (!enabled) {
      return;
    }
    const setting = editableIndicatorSettings[indicatorId];
    const clusters = buildOverlayIconClusters(
      chartModel.points
        .map((point) => {
          const x = regimeIconPositions.get(point.intervalIndex);
          return hasValue(point) && x != null
            ? { indicatorId, groupKey: indicatorId, intervalIndex: point.intervalIndex, x }
            : null;
        })
        .filter((entry): entry is { indicatorId: 'newOrderFlags' | 'newReceiptFlags'; groupKey: string; intervalIndex: number; x: number } => entry != null),
    );
    for (const cluster of clusters) {
      markers.push({
        key: `${indicatorId}:${cluster.firstIntervalIndex}-${cluster.lastIntervalIndex}`,
        indicatorId,
        paneId: setting.paneId,
        intervalIndex: cluster.lastIntervalIndex,
        layerOrder: setting.layerOrder,
        left: cluster.count > 1 ? cluster.left : cluster.center - REGIME_ICON_SIZE / 2,
        width: cluster.count > 1 ? Math.max(REGIME_ICON_SIZE, cluster.right - cluster.left) : REGIME_ICON_SIZE,
        color: setting.color,
        label: cluster.count > 1 ? `${label}, ${cluster.count} intervals` : label,
        onClick: () => onSelectInterval(cluster.lastIntervalIndex),
        icon: Icon,
        clustered: cluster.count > 1,
      });
    }
  };

  pushPointFlagMarkers(
    'newOrderFlags',
    isEnabled(editableIndicatorSettings, chartModel.availability, 'newOrderFlags'),
    (point) => (point.newOrderFlag ?? 0) > 0,
    ActionCreatePackageIcon,
    'Supplier order activity',
  );
  pushPointFlagMarkers(
    'newReceiptFlags',
    isEnabled(editableIndicatorSettings, chartModel.availability, 'newReceiptFlags'),
    (point) => (point.newReceiptFlag ?? 0) > 0,
    ActionReceiveInventoryIcon,
    'Supplier receipt activity',
  );

  return stackOverlayFlagMarkers(markers);
}

function buildRegimeBackgroundBands(
  visibleRegimePoints: TradingChartPoint[],
  regimeIconPositions: Map<number, number>,
  width: number,
) {
  const positionedPoints = visibleRegimePoints
    .map((point) => ({
      point,
      x: regimeIconPositions.get(point.intervalIndex),
    }))
    .filter((entry): entry is { point: TradingChartPoint; x: number } => entry.x != null)
    .sort((left, right) => left.point.intervalIndex - right.point.intervalIndex);
  if (positionedPoints.length === 0) {
    return [] as Array<{ intervalIndex: number; regime: string; left: number; width: number }>;
  }
  return positionedPoints.map((entry, index) => {
    const previous = positionedPoints[index - 1];
    const next = positionedPoints[index + 1];
    const left = previous ? (previous.x + entry.x) / 2 : entry.x - Math.max(24, next ? (next.x - entry.x) / 2 : REGIME_ICON_SIZE);
    const right = next ? (entry.x + next.x) / 2 : entry.x + Math.max(24, previous ? (entry.x - previous.x) / 2 : REGIME_ICON_SIZE);
    return {
      intervalIndex: entry.point.intervalIndex,
      regime: entry.point.dominantRegime!,
      left: Math.max(0, left),
      width: Math.max(2, Math.min(width || right, right) - Math.max(0, left)),
    };
  });
}

function regimeIconClustersEqual(left: OverlayIconCluster[], right: OverlayIconCluster[]) {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((cluster, index) => {
    const other = right[index];
    return other != null &&
      cluster.indicatorId === other.indicatorId &&
      cluster.groupKey === other.groupKey &&
      cluster.count === other.count &&
      cluster.firstIntervalIndex === other.firstIntervalIndex &&
      cluster.lastIntervalIndex === other.lastIntervalIndex &&
      cluster.left === other.left &&
      cluster.right === other.right &&
      cluster.center === other.center;
  });
}

function stackedOverlayMarkersEqual(left: StackedOverlayFlagMarker[], right: StackedOverlayFlagMarker[]) {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((marker, index) => {
    const other = right[index];
    return other != null &&
      marker.key === other.key &&
      marker.indicatorId === other.indicatorId &&
      marker.paneId === other.paneId &&
      marker.intervalIndex === other.intervalIndex &&
      marker.layerOrder === other.layerOrder &&
      marker.left === other.left &&
      marker.width === other.width &&
      marker.color === other.color &&
      marker.label === other.label &&
      marker.icon === other.icon &&
      marker.clustered === other.clustered &&
      marker.bottom === other.bottom;
  });
}

function regimeBackgroundBandsEqual(
  left: Array<{ intervalIndex: number; regime: string; left: number; width: number }>,
  right: Array<{ intervalIndex: number; regime: string; left: number; width: number }>,
) {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((band, index) => {
    const other = right[index];
    return other != null &&
      band.intervalIndex === other.intervalIndex &&
      band.regime === other.regime &&
      band.left === other.left &&
      band.width === other.width;
  });
}

function structuralIndicatorSettingsSignature(
  settings: TradingChartIndicatorSettings,
  availability: TradingChartModel['availability'],
) {
  return INDICATOR_ORDER.map((id) => {
    const setting = settings[id];
    return [
      id,
      availability[id] ? '1' : '0',
      setting.enabled ? '1' : '0',
      setting.paneId,
      String(setting.layerOrder),
      setting.axisSide,
      setting.plotStyle,
    ].join(':');
  }).join('|');
}

function applySeriesOptions(
  series: ChartSeriesRefs,
  settings: TradingChartIndicatorSettings,
) {
  applyInputSeriesOptions(series.inventory, settings.inventory);

  const uncertainty = settings.uncertainty;
  const uncertaintyColor = rgba(
    uncertainty.color,
    uncertainty.plotStyle === 'band'
      ? Math.max(uncertainty.opacity ?? 0.35, 0.42)
      : uncertainty.opacity ?? 0.35,
  );
  series.uncertaintyLow?.applyOptions({
    color: uncertaintyColor,
    lineStyle: lineStyleValue(uncertainty.lineStyle),
    lineWidth: (uncertainty.lineWidth ?? 1) as 1,
    lastValueVisible: false,
  });
  series.uncertaintyHigh?.applyOptions({
    color: uncertaintyColor,
    lineStyle: lineStyleValue(uncertainty.lineStyle),
    lineWidth: (uncertainty.lineWidth ?? 1) as 1,
    lastValueVisible: uncertainty.showPriceScaleLabel ?? false,
  });

  for (const indicatorId of ['reorderPoint', 'safetyStock'] as const) {
    const setting = settings[indicatorId];
    applySeriesApiOptions(series[indicatorId], {
      color: setting.color,
      lineStyle: lineStyleValue(setting.lineStyle),
      lineWidth: (setting.lineWidth ?? 1) as 1,
      lastValueVisible: setting.showPriceScaleLabel ?? true,
    });
  }

  for (const indicatorId of HISTOGRAM_INDICATOR_IDS) {
    applyInputSeriesOptions(series[indicatorId], settings[indicatorId]);
  }

  applyInputSeriesOptions(series.price, settings.price);
  applyInputSeriesOptions(series.availableCapacity, settings.availableCapacity);
  applyInputSeriesOptions(series.demandMinusAvailableCapacity, settings.demandMinusAvailableCapacity);
  applyInputSeriesOptions(series.leadTime, settings.leadTime);

  const leadTimeRange = settings.leadTimeRange;
  const leadTimeRangeColor = rgba(
    leadTimeRange.color,
    leadTimeRange.plotStyle === 'band'
      ? Math.max(leadTimeRange.opacity ?? 0.22, 0.22)
      : leadTimeRange.opacity ?? 0.22,
  );
  series.leadTimeRangeLow?.applyOptions({
    color: leadTimeRangeColor,
    lineStyle: lineStyleValue(leadTimeRange.lineStyle),
    lineWidth: Math.max(1, Math.min(4, leadTimeRange.lineWidth ?? 2)) as 1 | 2 | 3 | 4,
    lastValueVisible: false,
  });
  series.leadTimeRangeHigh?.applyOptions({
    color: leadTimeRangeColor,
    lineStyle: lineStyleValue(leadTimeRange.lineStyle),
    lineWidth: Math.max(1, Math.min(4, leadTimeRange.lineWidth ?? 2)) as 1 | 2 | 3 | 4,
    lastValueVisible: leadTimeRange.showPriceScaleLabel ?? false,
  });
}

function indicatorAvailabilityKey(availability: TradingChartModel['availability']) {
  return INDICATOR_ORDER.map((id) => `${id}:${availability[id] ? '1' : '0'}`).join('|');
}

function buildLegendRows({
  chartModel,
  point,
  settings,
  language,
}: {
  chartModel: TradingChartModel;
  point: TradingChartPoint | null;
  settings: TradingChartIndicatorSettings;
  language: 'en' | 'km';
}) {
  return INDICATOR_ORDER.flatMap((id) => {
    if (!isEnabled(settings, chartModel.availability, id)) {
      return [];
    }
    const setting = settings[id];
    let value = translateUiLiteral(language, 'No data');
    if (point) {
      if (id === 'inventory') {
        value = formatValue(valueForInputSource(point, id, setting.inputSource), 'u', setting.precision);
      } else if (id === 'uncertainty') {
        value = point.inventoryLow == null || point.inventoryHigh == null
          ? translateUiLiteral(language, 'No data')
          : `${formatValue(point.inventoryLow, 'u', setting.precision)} - ${formatValue(point.inventoryHigh, 'u', setting.precision)}`;
      } else if (id === 'reorderPoint') {
        value = formatValue(point.reorderPoint, 'u', setting.precision);
      } else if (id === 'safetyStock') {
        value = formatValue(point.safetyStock, 'u', setting.precision);
      } else if (id === 'availableCapacity') {
        value = formatValue(point.availableCapacity, 'u', setting.precision);
      } else if (id === 'demandMinusAvailableCapacity') {
        value = formatValue(point.demandMinusAvailableCapacity, 'u', setting.precision);
      } else if (isHistogramIndicatorId(id)) {
        value = histogramIndicatorLegendValue(point, id, setting.precision, setting.inputSource);
      } else if (id === 'newOrderFlags') {
        value = point.newOrderFlag
          ? translateUiLiteral(language, 'Supplier order recorded')
          : translateUiLiteral(language, 'No activity');
      } else if (id === 'newReceiptFlags') {
        value = point.newReceiptFlag
          ? translateUiLiteral(language, 'Supplier receipt recorded')
          : translateUiLiteral(language, 'No activity');
      } else if (id === 'price') {
        value = formatValue(valueForInputSource(point, id, setting.inputSource), '', setting.precision);
      } else if (id === 'leadTime') {
        value = formatValue(point.leadTimeMean, 'd', setting.precision);
      } else if (id === 'leadTimeRange') {
        value = point.leadTimeLow == null || point.leadTimeHigh == null
          ? translateUiLiteral(language, 'No data')
          : `${formatValue(point.leadTimeLow, 'd', setting.precision)} - ${formatValue(point.leadTimeHigh, 'd', setting.precision)}`;
      } else if (id === 'regime') {
        value = point.dominantRegime ? translateRegimeLabel(language, point.dominantRegime) : translateUiLiteral(language, 'No data');
      }
    }
    return [{
      id,
      label: indicatorLabel(language, id),
      color: setting.color,
      value: setting.showStatusLineValue === false ? '' : value,
    }];
  });
}

function paneLegendRows(
  legendRows: LegendRow[],
  paneLayout: TradingChartPaneLayout[],
) {
  return paneLayout.map((pane) => ({
    paneId: pane.id,
    rows: pane.indicatorIds.flatMap((id) => legendRows.filter((row) => row.id === id)),
  }));
}

function paneLegendAnchors(chart: IChartApi | null) {
  if (!chart || typeof chart.panes !== 'function') {
    return [];
  }
  const panes = chart.panes();
  const anchors: Array<{ top: number; height: number }> = [];
  let top = 0;
  panes.forEach((pane, index) => {
    if (typeof pane.getHTMLElement === 'function') {
      const element = pane.getHTMLElement();
      if (element) {
        const height = Math.max(0, element.clientHeight);
        anchors.push({
          top: Math.max(0, element.offsetTop),
          height,
        });
        top = Math.max(top, element.offsetTop + height);
        return;
      }
    }
    const height = Math.max(0, pane.getHeight());
    anchors.push({ top, height });
    top += height;
    if (index < panes.length - 1) {
      top += 1;
    }
  });
  return anchors;
}

function chartSettingsEqual(
  left: TradingChartIndicatorSettings | null | undefined,
  right: TradingChartIndicatorSettings | null | undefined,
) {
  if (!left || !right) {
    return left === right;
  }
  return JSON.stringify(normalizeTradingChartIndicatorSettings(left)) === JSON.stringify(normalizeTradingChartIndicatorSettings(right));
}

function ChartSettingsLeavePrompt({
  language,
  open,
  onApply,
  onDiscard,
  onKeepEditing,
}: {
  language: AppLanguage;
  open: boolean;
  onApply: () => void;
  onDiscard: () => void;
  onKeepEditing: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/30 px-4 py-6"
      role="presentation"
      onClick={onKeepEditing}
    >
      <div
        aria-label={translateUiLiteral(language, 'Apply chart changes')}
        aria-modal="true"
        className="w-full max-w-md rounded-[1.5rem] border border-border/70 bg-background p-6 shadow-[0_24px_80px_rgba(0,0,0,0.18)]"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="grid gap-2">
          <p className="text-lg font-semibold tracking-[-0.03em] text-foreground">{translateUiLiteral(language, 'Apply chart changes?')}</p>
          <p className="text-sm leading-6 text-muted-foreground">
            {translateUiLiteral(language, 'You have staged chart setting changes. Apply them before leaving, discard them, or keep editing.')}
          </p>
        </div>
        <div className="mt-6 flex items-center justify-end gap-2">
          <Button className="h-11 px-4" type="button" variant="ghost" onClick={onKeepEditing}>
            <ActionUndoIcon data-icon="inline-start" />
            {translateUiLiteral(language, 'Keep editing')}
          </Button>
          <Button className="h-11 px-4" type="button" variant="destructive-outline" onClick={onDiscard}>
            <ActionDeleteIcon data-icon="inline-start" />
            {translateUiLiteral(language, 'Discard changes')}
          </Button>
          <Button className="h-11 px-4" type="button" onClick={onApply}>
            <ActionConfirmIcon data-icon="inline-start" />
            {translateUiLiteral(language, 'Apply changes')}
          </Button>
        </div>
      </div>
    </div>
  );
}

function layoutRowId(indicatorId: TradingChartIndicatorId) {
  return `layout:row:${indicatorId}`;
}

function isLayoutRowId(value: string) {
  return value.startsWith('layout:row:');
}

function layoutIndicatorIdFromRowId(value: string) {
  return isLayoutRowId(value) ? value.slice('layout:row:'.length) as TradingChartIndicatorId : null;
}

function layoutPaneId(paneId: string) {
  return `layout:pane:${paneId}`;
}

function isLayoutPaneId(value: string) {
  return value.startsWith('layout:pane:');
}

const layoutCollisionDetection: CollisionDetection = (args) => {
  const rowContainers = args.droppableContainers.filter((container) => isLayoutRowId(String(container.id)));
  const rowPointerCollisions = pointerWithin({ ...args, droppableContainers: rowContainers });
  if (rowPointerCollisions.length > 0) {
    const rowIds = new Set(rowPointerCollisions.map((collision) => collision.id));
    return closestCenter({
      ...args,
      droppableContainers: rowContainers.filter((container) => rowIds.has(container.id)),
    });
  }

  const newPaneContainers = args.droppableContainers.filter((container) => container.id === LAYOUT_NEW_PANE_DROP_ID);
  const newPaneCollisions = pointerWithin({ ...args, droppableContainers: newPaneContainers });
  if (newPaneCollisions.length > 0) {
    return newPaneCollisions;
  }

  const pointerY = args.pointerCoordinates?.y;
  if (pointerY == null) {
    return [];
  }
  const paneEdgeContainers = args.droppableContainers.filter((container) => {
    if (!isLayoutPaneId(String(container.id))) {
      return false;
    }
    const rect = args.droppableRects.get(container.id);
    if (!rect) {
      return false;
    }
    const edgeSize = Math.min(LAYOUT_PANE_EDGE_DROP_ZONE_PX, rect.height / 2);
    return pointerY <= rect.top + edgeSize || pointerY >= rect.bottom - edgeSize;
  });
  return pointerWithin({ ...args, droppableContainers: paneEdgeContainers });
};

function parseLayoutDropTarget(value: string): LayoutDropTarget | null {
  if (value === LAYOUT_NEW_PANE_DROP_ID) {
    return { type: 'new-pane' };
  }
  if (isLayoutRowId(value)) {
    return { type: 'row', indicatorId: value.slice('layout:row:'.length) as TradingChartIndicatorId };
  }
  if (isLayoutPaneId(value)) {
    return { type: 'pane', paneId: value.slice('layout:pane:'.length) };
  }
  return null;
}

function layoutPaneLabel(language: AppLanguage, paneId: string) {
  return translateUiLiteral(language, paneId === TRADING_CHART_MAIN_PANE_ID ? 'Main' : 'Pane');
}

function hasRenderedIndicatorData(chartModel: TradingChartModel, id: TradingChartIndicatorId) {
  return chartModel.points.some((point) => {
    switch (id) {
      case 'inventory':
        return point.inventoryMean != null;
      case 'uncertainty':
        return point.inventoryLow != null || point.inventoryHigh != null;
      case 'reorderPoint':
        return point.reorderPoint != null;
      case 'safetyStock':
        return point.safetyStock != null;
      case 'demand':
        return point.serviceDemandMean != null || point.retailDemandMean != null;
      case 'serviceDemand':
        return point.serviceDemandMean != null;
      case 'retailDemand':
        return point.retailDemandMean != null;
      case 'availableCapacity':
        return point.availableCapacity != null;
      case 'demandMinusAvailableCapacity':
        return point.demandMinusAvailableCapacity != null;
      case 'receipts':
        return point.receiptsMean != null || point.adjustmentsMean != null;
      case 'ordersInTransit':
        return point.ordersInTransitMean != null;
      case 'ordersLate':
        return (point.ordersLateMean ?? 0) > 0;
      case 'ordersReadyToReceive':
        return (point.ordersReadyToReceiveMean ?? 0) > 0;
      case 'ordersReceived':
        return (point.ordersReceivedMean ?? 0) > 0;
      case 'newOrderFlags':
        return (point.newOrderFlag ?? 0) > 0;
      case 'newReceiptFlags':
        return (point.newReceiptFlag ?? 0) > 0;
      case 'price':
        return point.price != null;
      case 'leadTime':
        return point.leadTimeMean != null;
      case 'leadTimeRange':
        return point.leadTimeLow != null || point.leadTimeHigh != null;
      case 'regime':
        return Boolean(point.dominantRegime);
    }
  });
}

function centeredSettingsPosition() {
  if (typeof window === 'undefined') {
    return { left: 16, top: 16 };
  }
  const rootFontSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const size = Math.min(42 * rootFontSize, window.innerWidth - 32, window.innerHeight - 96);
  return {
    left: Math.max(16, (window.innerWidth - size) / 2),
    top: Math.max(16, (window.innerHeight - size) / 2),
  };
}

interface SkuTradingChartProps {
  chartModel: TradingChartModel;
  chartZoomResetToken: string | number;
  additionalPaneMinRenderHeight?: number;
  chartRenderHeight?: CSSProperties['height'];
  expanded?: boolean;
  fillAvailableHeight?: boolean;
  hasOlderIntervals: boolean;
  isBusy: boolean;
  isVisuallyBusy?: boolean;
  isLoadingOlderIntervals: boolean;
  loadOlderIntervals: (limit?: number) => Promise<unknown>;
  onOlderLoadProgressChange?: (progress: { current: number; total: number } | null) => void;
  onPaneHeightsChange?: (paneHeights: Record<string, number>) => void;
  onReset: () => void;
  onSelectInterval: (index: number) => void;
  onCustomTimeframeChange?: (range: ChartCustomTimeframeRange | null) => void;
  onChartResolutionChange?: (value: ChartResolutionOption, custom: ChartCustomResolution | null) => void;
  onTimeframeChange: (value: ChartTimeframe) => void;
  onSaveDefaultIndicatorSettings: (settings: TradingChartIndicatorSettings) => void;
  onToggleExpand?: () => void;
  onVisibleDateRangeChange?: (range: ChartVisibleDateRange | null, options?: ChartLayoutPreferenceMergeOptions) => void;
  selectedIntervalIndex: number | null;
  baseMinRenderHeight?: number;
  defaultIndicatorSettings: TradingChartIndicatorSettings;
  initialPaneHeights?: Record<string, number> | null;
  initialVisibleDateRange?: ChartVisibleDateRange | null;
  setIndicatorSettings: Dispatch<SetStateAction<TradingChartIndicatorSettings>>;
  customTimeframeRange?: ChartCustomTimeframeRange | null;
  chartResolution?: ChartResolutionOption;
  customChartResolution?: ChartCustomResolution | null;
  indicatorSettings: TradingChartIndicatorSettings;
  timeframe: ChartTimeframe;
}

export function SkuTradingChart({
  chartModel: rawChartModel,
  chartZoomResetToken,
  additionalPaneMinRenderHeight = CHART_ADDITIONAL_PANE_MIN_RENDER_HEIGHT,
  chartResolution = DEFAULT_CHART_RESOLUTION,
  chartRenderHeight,
  customTimeframeRange = null,
  customChartResolution = null,
  expanded = false,
  fillAvailableHeight = true,
  hasOlderIntervals,
  isBusy,
  isVisuallyBusy,
  isLoadingOlderIntervals,
  loadOlderIntervals,
  onOlderLoadProgressChange,
  onPaneHeightsChange,
  onReset,
  onSelectInterval,
  onCustomTimeframeChange,
  onChartResolutionChange,
  onSaveDefaultIndicatorSettings,
  onToggleExpand,
  onTimeframeChange,
  onVisibleDateRangeChange,
  selectedIntervalIndex,
  baseMinRenderHeight = CHART_MIN_RENDER_HEIGHT,
  defaultIndicatorSettings,
  initialPaneHeights = null,
  initialVisibleDateRange = null,
  setIndicatorSettings,
  indicatorSettings,
  timeframe,
}: SkuTradingChartProps) {
  const { dimChartsWhileLoading, language } = usePreferences();
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRefs = useRef<AnySeries[]>([]);
  const chartSeriesRefs = useRef<ChartSeriesRefs>({});
  const loadingOlderRef = useRef(false);
  const olderLoadHysteresisKeyRef = useRef<string | null>(null);
  const previousChartPointsRef = useRef<TradingChartPoint[]>([]);
  const previousTimeframeRef = useRef<ChartTimeframe | null>(null);
  const previousSelectedIntervalRef = useRef<number | null>(null);
  const restoredVisibleDateRangeRef = useRef<ChartVisibleDateRange | null>(initialVisibleDateRange);
  const timeframeRangeLockRef = useRef(true);
  const appliedChartZoomResetTokenRef = useRef<string | number | null>(null);
  const uncertaintyBandPathRef = useRef('');
  const activeStylePopoverRef = useRef<HTMLDivElement | null>(null);
  const activeStyleTriggerRef = useRef<HTMLButtonElement | null>(null);
  const settingsContentRef = useRef<HTMLDivElement | null>(null);
  const dragOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const dragFrameRef = useRef<number | null>(null);
  const settingsPositionRef = useRef<{ top: number; left: number } | null>(null);
  const paneHeightUpdateFrameRef = useRef<number | null>(null);
  const paneHeightSyncGenerationRef = useRef(0);
  const paneRelayoutPendingRef = useRef(false);
  const activeAdditionalPaneCountRef = useRef(0);
  const paneLegendPositionsRef = useRef<Array<{ top: number; height: number }>>([]);
  const lastEmittedPaneHeightsRef = useRef<Record<string, number> | null>(null);
  const pendingPaneHeightsRef = useRef<Record<string, number> | null>(null);
  const paneHeightsDebounceTimerRef = useRef<number | null>(null);
  const lastEmittedVisibleDateRangeRef = useRef<ChartVisibleDateRange | null>(null);
  const pendingVisibleDateRangeRef = useRef<ChartVisibleDateRange | null>(null);
  const pendingVisibleDateRangeSyncRef = useRef(false);
  const visibleDateRangeDebounceTimerRef = useRef<number | null>(null);
  const viewportInteractionActiveRef = useRef(false);
  const viewportInteractionEndTimerRef = useRef<number | null>(null);
  const regimeIconPositionsRef = useRef<Map<number, number>>(new Map());
  const clusteredRegimeIconsRef = useRef<OverlayIconCluster[]>([]);
  const stackedOverlayMarkersRef = useRef<StackedOverlayFlagMarker[]>([]);
  const regimeBackgroundBandsRef = useRef<Array<{ intervalIndex: number; regime: string; left: number; width: number }>>([]);
  const [hoveredTime, setHoveredTime] = useState<Time | null>(null);
  const [indicatorsDialogOpen, setIndicatorsDialogOpen] = useState(false);
  const [layoutDialogOpen, setLayoutDialogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftIndicatorSettings, setDraftIndicatorSettings] = useState<TradingChartIndicatorSettings | null>(null);
  const [draftIndicatorsDialogSettings, setDraftIndicatorsDialogSettings] = useState<TradingChartIndicatorSettings | null>(null);
  const [draftLayoutIndicatorSettings, setDraftLayoutIndicatorSettings] = useState<TradingChartIndicatorSettings | null>(null);
  const [stylePopover, setStylePopover] = useState<{ indicatorId: TradingChartIndicatorId; kind: 'color' | 'plotStyle' } | null>(null);
  const [stylePopoverSide, setStylePopoverSide] = useState<'top' | 'bottom'>('bottom');
  const [stylePopoverAnchorRect, setStylePopoverAnchorRect] = useState<DOMRect | null>(null);
  const [settingsSelectOpen, setSettingsSelectOpen] = useState(false);
  const [defaultsActionValue, setDefaultsActionValue] = useState<string | undefined>(undefined);
  const [settingsRenderPosition, setSettingsRenderPosition] = useState<{ top: number; left: number } | null>(null);
  const [pendingSettingsLeave, setPendingSettingsLeave] = useState<{
    dialogId: ChartSettingsDialogId;
    action: () => void;
  } | null>(null);
  const [clusteredRegimeIcons, setClusteredRegimeIcons] = useState<OverlayIconCluster[]>([]);
  const [paneLegendPositions, setPaneLegendPositions] = useState<Array<{ top: number; height: number }>>([]);
  const [stackedOverlayMarkers, setStackedOverlayMarkers] = useState<StackedOverlayFlagMarker[]>([]);
  const [plotAreaWidth, setPlotAreaWidth] = useState(0);
  const [regimeBackgroundBands, setRegimeBackgroundBands] = useState<Array<{ intervalIndex: number; regime: string; left: number; width: number }>>([]);
  const [uncertaintyBandPath, setUncertaintyBandPath] = useState('');
  const [activeLayoutRowId, setActiveLayoutRowId] = useState<string | null>(null);
  const [chartBootstrapVersion, setChartBootstrapVersion] = useState(0);
  const [isPaneRelayoutPending, setIsPaneRelayoutPending] = useState(false);
  const [isOlderLoadPending, setIsOlderLoadPending] = useState(false);
  const [customRangeDialogOpen, setCustomRangeDialogOpen] = useState(false);
  const [customResolutionDialogOpen, setCustomResolutionDialogOpen] = useState(false);
  const [draftCustomRangeStart, setDraftCustomRangeStart] = useState(() => dateInputValueFromIsoString(customTimeframeRange?.startAt));
  const [draftCustomRangeEnd, setDraftCustomRangeEnd] = useState(() => dateInputValueFromIsoString(customTimeframeRange?.endAt));
  const [draftCustomResolution, setDraftCustomResolution] = useState(() => customChartResolution?.expression ?? '1D');
  const activeLayoutIndicatorId = activeLayoutRowId ? layoutIndicatorIdFromRowId(activeLayoutRowId) : null;
  const chartInteractionLocked = ENABLE_CHART_INTERACTION_LOCK && (isBusy || isLoadingOlderIntervals || isOlderLoadPending || isPaneRelayoutPending);
  const hideChartVisualsDuringRelayout = ENABLE_CHART_INTERACTION_LOCK && isPaneRelayoutPending;
  const showBusyState = (isVisuallyBusy ?? isBusy) || isLoadingOlderIntervals || isOlderLoadPending;
  const shouldDimChartWhileBusy = showBusyState && dimChartsWhileLoading;
  const draftEditableIndicatorSettings =
    draftIndicatorSettings ?? draftIndicatorsDialogSettings ?? draftLayoutIndicatorSettings ?? indicatorSettings;
  const editableIndicatorSettings = useMemo(
    () => normalizeTradingChartIndicatorSettings(draftEditableIndicatorSettings),
    [draftEditableIndicatorSettings],
  );
  const effectiveResolutionSpec = useMemo(
    () => resolutionSpecForOption(chartResolution, customChartResolution),
    [chartResolution, customChartResolution],
  );
  const chartModel = useMemo(
    () => deriveTradingChartDisplayModel(rawChartModel, effectiveResolutionSpec),
    [rawChartModel, effectiveResolutionSpec],
  );
  const availabilityKey = useMemo(
    () => indicatorAvailabilityKey(chartModel.availability),
    [chartModel.availability],
  );
  const hasCustomTimeframe = customTimeframeRange != null;
  const activeDurationOption = hasCustomTimeframe ? 'Custom' : timeframe;

  useEffect(() => {
    if (!customRangeDialogOpen) {
      setDraftCustomRangeStart(dateInputValueFromIsoString(customTimeframeRange?.startAt));
      setDraftCustomRangeEnd(dateInputValueFromIsoString(customTimeframeRange?.endAt));
    }
  }, [customRangeDialogOpen, customTimeframeRange]);

  useEffect(() => {
    if (!customResolutionDialogOpen) {
      setDraftCustomResolution(customChartResolution?.expression ?? '1D');
    }
  }, [customChartResolution, customResolutionDialogOpen]);

  useEffect(() => {
    restoredVisibleDateRangeRef.current = initialVisibleDateRange;
  }, [initialVisibleDateRange]);

  function openCustomRangeDialog() {
    const earliestPoint = chartModel.points[0] ?? null;
    const latestPoint = chartModel.points.at(-1) ?? null;
    setDraftCustomRangeStart(
      dateInputValueFromIsoString(customTimeframeRange?.startAt ?? earliestPoint?.startAt ?? earliestPoint?.endAt ?? null),
    );
    setDraftCustomRangeEnd(
      dateInputValueFromIsoString(customTimeframeRange?.endAt ?? latestPoint?.endAt ?? latestPoint?.startAt ?? null),
    );
    setCustomRangeDialogOpen(true);
  }

  function applyCustomRange() {
    if (!onCustomTimeframeChange) {
      setCustomRangeDialogOpen(false);
      return;
    }
    const startAt = isoStringFromDateInput(draftCustomRangeStart, 'start');
    const endAt = isoStringFromDateInput(draftCustomRangeEnd, 'end');
    if (!startAt || !endAt || Date.parse(startAt) > Date.parse(endAt)) {
      return;
    }
    onCustomTimeframeChange({ startAt, endAt });
    setCustomRangeDialogOpen(false);
  }

  function applyCustomResolution() {
    const parsed = parseChartCustomResolution(draftCustomResolution);
    if (!parsed) {
      return;
    }
    onChartResolutionChange?.('Custom', parsed);
    setCustomResolutionDialogOpen(false);
  }
  const structuralSettingsSignature = useMemo(
    () => structuralIndicatorSettingsSignature(editableIndicatorSettings, chartModel.availability),
    [chartModel.availability, editableIndicatorSettings],
  );
  const paneLayout = useMemo(
    () => deriveTradingChartPaneLayout(editableIndicatorSettings, chartModel.availability),
    [availabilityKey, structuralSettingsSignature],
  );
  const activeAdditionalPaneCount = Math.max(0, paneLayout.length - 1);
  const minimumRenderHeight = baseMinRenderHeight + Math.max(0, activeAdditionalPaneCount) * additionalPaneMinRenderHeight;
  const chartRenderStyle: CSSProperties = chartRenderHeight == null
    ? { minHeight: minimumRenderHeight }
    : { height: chartRenderHeight, minHeight: minimumRenderHeight };
  const regimeSetting = editableIndicatorSettings.regime;
  const regimeIndicatorEnabled = isEnabled(editableIndicatorSettings, chartModel.availability, 'regime');
  const showRegimeIcons = regimeIndicatorEnabled && regimeUsesIcons(regimeSetting.plotStyle);
  const showRegimeBackground = regimeIndicatorEnabled && regimeUsesBackground(regimeSetting.plotStyle);
  const settingsDialogDirty = draftIndicatorSettings != null && !chartSettingsEqual(draftIndicatorSettings, indicatorSettings);
  const indicatorsDialogDirty = draftIndicatorsDialogSettings != null && !chartSettingsEqual(draftIndicatorsDialogSettings, indicatorSettings);
  const layoutDialogDirty = draftLayoutIndicatorSettings != null && !chartSettingsEqual(draftLayoutIndicatorSettings, indicatorSettings);
  const legendPoint = useMemo(
    () => pointForLegend({ chartModel, hoveredTime, selectedIntervalIndex }),
    [chartModel, hoveredTime, selectedIntervalIndex],
  );
  const legendRows = useMemo(
    () => buildLegendRows({ chartModel, point: legendPoint, settings: editableIndicatorSettings, language }),
    [chartModel, editableIndicatorSettings, language, legendPoint],
  );
  const paneLegendGroups = useMemo(
    () => paneLegendRows(legendRows, paneLayout),
    [legendRows, paneLayout],
  );
  const paneIndexById = useMemo(
    () => new Map(paneLayout.map((pane, index) => [pane.id, index])),
    [paneLayout],
  );
  const regimePaneId = useMemo(
    () => paneLayout.find((pane) => pane.indicatorIds.includes('regime'))?.id ?? 'main',
    [paneLayout],
  );
  const regimePaneIndex = paneIndexById.get(regimePaneId) ?? 0;
  const regimePanePosition = paneLegendPositions[regimePaneIndex];
  const regimePaneTop = regimePanePosition?.top ?? 0;
  const regimePaneHeight = regimePanePosition?.height ?? 0;
  const hasMeasuredRegimePane = regimePaneHeight > 0 && plotAreaWidth > 0;
  const seriesStructureSignature = useMemo(
    () => structuralIndicatorSettingsSignature(editableIndicatorSettings, chartModel.availability),
    [chartModel.availability, editableIndicatorSettings],
  );
  const visibleRegimePoints = useMemo(
    () => (
      regimeIndicatorEnabled && (showRegimeIcons || showRegimeBackground)
        ? chartModel.points.filter((point) => point.dominantRegime)
        : []
    ),
    [chartModel.points, regimeIndicatorEnabled, showRegimeBackground, showRegimeIcons],
  );
  const overlayPointIntervals = useMemo(() => {
    const intervals = new Set<number>();
    if (showRegimeIcons) {
      for (const point of chartModel.points) {
        if (point.dominantRegime) {
          intervals.add(point.intervalIndex);
        }
      }
    }
    if (isEnabled(editableIndicatorSettings, chartModel.availability, 'newOrderFlags')) {
      for (const point of chartModel.points) {
        if ((point.newOrderFlag ?? 0) > 0) {
          intervals.add(point.intervalIndex);
        }
      }
    }
    if (isEnabled(editableIndicatorSettings, chartModel.availability, 'newReceiptFlags')) {
      for (const point of chartModel.points) {
        if ((point.newReceiptFlag ?? 0) > 0) {
          intervals.add(point.intervalIndex);
        }
      }
    }
    return [...intervals].sort((left, right) => left - right);
  }, [chartModel.availability, chartModel.points, editableIndicatorSettings, showRegimeIcons]);
  const olderLoadViewportToken = useMemo(
    () => `${chartModel.points[0]?.intervalIndex ?? 'none'}:${chartModel.points.length}`,
    [chartModel.points],
  );
  const layoutSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function setPaneRelayoutPendingState(next: boolean) {
    paneRelayoutPendingRef.current = next;
    setIsPaneRelayoutPending(next);
  }

  function finishPaneHeightSync(lockDuringSync: boolean, generation: number, retryCount = 0) {
    paneHeightUpdateFrameRef.current = null;
    const currentPaneCount = Math.max(0, paneLayout.length - 1);
    const currentMinimumRenderHeight = baseMinRenderHeight + Math.max(0, currentPaneCount) * additionalPaneMinRenderHeight;
    const totalHeight = Math.max(currentMinimumRenderHeight, chartContainerRef.current?.clientHeight || currentMinimumRenderHeight);
    const paneIds = paneLayout.map((pane) => pane.id);
    applyPaneHeights(
      chartRef.current,
      totalHeight,
      paneIds,
      initialPaneHeights,
    );
    const anchors = paneLegendAnchors(chartRef.current);
    setPaneLegendPositionsIfChanged(anchors);
    emitPaneHeightsChange(paneHeightsRecordFromAnchors(paneLayout, anchors));
    syncPlotAreaWidth();
    if (!paneHeightsMatchTargets(chartRef.current, totalHeight, paneIds, initialPaneHeights) && retryCount < 6) {
      paneHeightUpdateFrameRef.current = requestAnimationFrame(() => {
        finishPaneHeightSync(lockDuringSync, generation, retryCount + 1);
      });
      return;
    }
    if (lockDuringSync && paneHeightSyncGenerationRef.current === generation) {
      setPaneRelayoutPendingState(false);
    }
  }

  function syncPaneHeightImmediately(options?: { lockDuringSync?: boolean }) {
    const lockDuringSync = options?.lockDuringSync ?? paneRelayoutPendingRef.current;
    const generation = paneHeightSyncGenerationRef.current + 1;
    paneHeightSyncGenerationRef.current = generation;
    if (lockDuringSync && !paneRelayoutPendingRef.current) {
      setPaneRelayoutPendingState(true);
    }
    if (paneHeightUpdateFrameRef.current != null) {
      cancelAnimationFrame(paneHeightUpdateFrameRef.current);
      paneHeightUpdateFrameRef.current = null;
    }
    finishPaneHeightSync(lockDuringSync, generation);
  }

  function schedulePaneHeightSync(options?: { lockDuringSync?: boolean }) {
    const lockDuringSync = options?.lockDuringSync ?? paneRelayoutPendingRef.current;
    const generation = paneHeightSyncGenerationRef.current + 1;
    paneHeightSyncGenerationRef.current = generation;
    if (lockDuringSync && !paneRelayoutPendingRef.current) {
      setPaneRelayoutPendingState(true);
    }
    if (paneHeightUpdateFrameRef.current != null) {
      cancelAnimationFrame(paneHeightUpdateFrameRef.current);
    }
    paneHeightUpdateFrameRef.current = requestAnimationFrame(() => {
      finishPaneHeightSync(lockDuringSync, generation);
    });
  }

  function syncPlotAreaWidth() {
    const chart = chartRef.current;
    const container = chartContainerRef.current;
    const paneWidth = typeof chart?.paneSize === 'function' ? chart.paneSize().width : null;
    const nextWidth = Math.max(0, Math.floor(paneWidth ?? chart?.timeScale().width?.() ?? container?.clientWidth ?? 0));
    setPlotAreaWidth((current) => (Math.abs(current - nextWidth) < 1 ? current : nextWidth));
  }

  function emitPaneHeightsChange(nextPaneHeights: Record<string, number>, options?: { immediate?: boolean }) {
    if (!onPaneHeightsChange) {
      return;
    }
    if (numberRecordEqual(lastEmittedPaneHeightsRef.current, nextPaneHeights)) {
      pendingPaneHeightsRef.current = null;
      if (paneHeightsDebounceTimerRef.current != null) {
        window.clearTimeout(paneHeightsDebounceTimerRef.current);
        paneHeightsDebounceTimerRef.current = null;
      }
      return;
    }
    const flush = () => {
      paneHeightsDebounceTimerRef.current = null;
      const pending = pendingPaneHeightsRef.current;
      if (!pending || numberRecordEqual(lastEmittedPaneHeightsRef.current, pending)) {
        pendingPaneHeightsRef.current = null;
        return;
      }
      pendingPaneHeightsRef.current = null;
      lastEmittedPaneHeightsRef.current = pending;
      onPaneHeightsChange(pending);
    };
    pendingPaneHeightsRef.current = nextPaneHeights;
    if (options?.immediate) {
      if (paneHeightsDebounceTimerRef.current != null) {
        window.clearTimeout(paneHeightsDebounceTimerRef.current);
      }
      flush();
      return;
    }
    if (paneHeightsDebounceTimerRef.current != null) {
      window.clearTimeout(paneHeightsDebounceTimerRef.current);
    }
    paneHeightsDebounceTimerRef.current = window.setTimeout(flush, 120);
  }

  function startViewportInteraction() {
    viewportInteractionActiveRef.current = true;
    if (viewportInteractionEndTimerRef.current != null) {
      window.clearTimeout(viewportInteractionEndTimerRef.current);
      viewportInteractionEndTimerRef.current = null;
    }
  }

  function finishViewportInteractionSoon() {
    if (viewportInteractionEndTimerRef.current != null) {
      window.clearTimeout(viewportInteractionEndTimerRef.current);
    }
    viewportInteractionEndTimerRef.current = window.setTimeout(() => {
      viewportInteractionActiveRef.current = false;
      viewportInteractionEndTimerRef.current = null;
    }, 240);
  }

  function markWheelViewportInteraction() {
    startViewportInteraction();
    finishViewportInteractionSoon();
  }

  function emitVisibleDateRangeChange(
    nextRange: ChartVisibleDateRange | null,
    options?: { immediate?: boolean; syncCustomTimeframeRange?: boolean },
  ) {
    if (!onVisibleDateRangeChange) {
      return;
    }
    const sameAsLast =
      lastEmittedVisibleDateRangeRef.current?.startAt === nextRange?.startAt &&
      lastEmittedVisibleDateRangeRef.current?.endAt === nextRange?.endAt;
    if (sameAsLast) {
      pendingVisibleDateRangeRef.current = null;
      pendingVisibleDateRangeSyncRef.current = false;
      if (visibleDateRangeDebounceTimerRef.current != null) {
        window.clearTimeout(visibleDateRangeDebounceTimerRef.current);
        visibleDateRangeDebounceTimerRef.current = null;
      }
      return;
    }
    const flush = () => {
      visibleDateRangeDebounceTimerRef.current = null;
      const pending = pendingVisibleDateRangeRef.current;
      const shouldSyncCustomTimeframeRange = pendingVisibleDateRangeSyncRef.current;
      const previousVisibleDateRange = lastEmittedVisibleDateRangeRef.current;
      const matchesLast =
        lastEmittedVisibleDateRangeRef.current?.startAt === pending?.startAt &&
        lastEmittedVisibleDateRangeRef.current?.endAt === pending?.endAt;
      pendingVisibleDateRangeRef.current = null;
      pendingVisibleDateRangeSyncRef.current = false;
      if (matchesLast) {
        return;
      }
      lastEmittedVisibleDateRangeRef.current = pending;
      onVisibleDateRangeChange(pending ?? null, {
        previousVisibleDateRange,
        syncCustomTimeframeRange: shouldSyncCustomTimeframeRange,
      });
    };
    pendingVisibleDateRangeRef.current = nextRange;
    pendingVisibleDateRangeSyncRef.current = options?.syncCustomTimeframeRange ?? false;
    if (options?.immediate) {
      if (visibleDateRangeDebounceTimerRef.current != null) {
        window.clearTimeout(visibleDateRangeDebounceTimerRef.current);
      }
      flush();
      return;
    }
    if (visibleDateRangeDebounceTimerRef.current != null) {
      window.clearTimeout(visibleDateRangeDebounceTimerRef.current);
    }
    visibleDateRangeDebounceTimerRef.current = window.setTimeout(flush, 120);
  }

  function setPaneLegendPositionsIfChanged(nextAnchors: Array<{ top: number; height: number }>) {
    if (paneAnchorListsEqual(paneLegendPositionsRef.current, nextAnchors)) {
      return;
    }
    paneLegendPositionsRef.current = nextAnchors;
    setPaneLegendPositions(nextAnchors);
  }

  function setOverlayRenderStateIfChanged(nextPositions: Map<number, number>) {
    const positionsChanged = !numberMapEqual(regimeIconPositionsRef.current, nextPositions);
    const nextClusters = buildRegimeIconClusters(visibleRegimePoints, nextPositions);
    const nextMarkers = buildStackedOverlayMarkers({
      chartModel,
      clusters: nextClusters,
      editableIndicatorSettings,
      language,
      onSelectInterval,
      regimeIconPositions: nextPositions,
      regimePaneId,
      showRegimeIcons,
    });
    const nextBands = showRegimeBackground
      ? buildRegimeBackgroundBands(visibleRegimePoints, nextPositions, plotAreaWidth || chartContainerRef.current?.clientWidth || 0)
      : [];

    if (
      !positionsChanged &&
      regimeIconClustersEqual(clusteredRegimeIconsRef.current, nextClusters) &&
      stackedOverlayMarkersEqual(stackedOverlayMarkersRef.current, nextMarkers) &&
      regimeBackgroundBandsEqual(regimeBackgroundBandsRef.current, nextBands)
    ) {
      return;
    }

    regimeIconPositionsRef.current = nextPositions;
    if (!regimeIconClustersEqual(clusteredRegimeIconsRef.current, nextClusters)) {
      clusteredRegimeIconsRef.current = nextClusters;
      setClusteredRegimeIcons(nextClusters);
    }
    if (!stackedOverlayMarkersEqual(stackedOverlayMarkersRef.current, nextMarkers)) {
      stackedOverlayMarkersRef.current = nextMarkers;
      setStackedOverlayMarkers(nextMarkers);
    }
    if (!regimeBackgroundBandsEqual(regimeBackgroundBandsRef.current, nextBands)) {
      regimeBackgroundBandsRef.current = nextBands;
      setRegimeBackgroundBands(nextBands);
    }
  }

  function snapshotCurrentLayoutPreferences() {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    emitVisibleDateRangeChange(visibleDateRangeForLogicalRange(chartModel, chart.timeScale().getVisibleLogicalRange()), {
      immediate: true,
      syncCustomTimeframeRange: false,
    });
    emitPaneHeightsChange(paneHeightsRecordFromAnchors(paneLayout, paneLegendAnchors(chart)), { immediate: true });
  }

  function setChartVisibleLogicalRange(range: { from: number; to: number }) {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    chart.timeScale().setVisibleLogicalRange(range);
  }

  function updateDraftLayoutIndicator(
    indicatorId: TradingChartIndicatorId,
    patch: Partial<TradingChartIndicatorSettings[TradingChartIndicatorId]>,
  ) {
    setDraftLayoutIndicatorSettings((current) => {
      const base = normalizeTradingChartIndicatorSettings(current ?? indicatorSettings);
      return normalizeTradingChartIndicatorSettings({
        ...base,
        [indicatorId]: {
          ...base[indicatorId],
          ...patch,
        },
      });
    });
  }

  function deleteLayoutIndicator(indicatorId: TradingChartIndicatorId) {
    updateDraftLayoutIndicator(indicatorId, { enabled: false });
  }

  function moveLayoutIndicator(indicatorId: TradingChartIndicatorId, target: LayoutDropTarget) {
    setDraftLayoutIndicatorSettings((current) => {
      const base = normalizeTradingChartIndicatorSettings(current ?? indicatorSettings);
      const basePaneLayout = deriveTradingChartPaneLayout(base, chartModel.availability);
      if (target.type === 'new-pane') {
        return moveTradingChartIndicator(base, indicatorId, nextTradingChartPaneId(base), 0);
      }
      if (target.type === 'pane') {
        const targetPane = basePaneLayout.find((pane) => pane.id === target.paneId);
        return moveTradingChartIndicator(base, indicatorId, target.paneId, targetPane?.indicatorIds.length ?? 0);
      }
      const overPaneId = base[target.indicatorId].paneId;
      const targetPane = basePaneLayout.find((pane) => pane.id === overPaneId);
      const targetIndex = Math.max(0, targetPane?.indicatorIds.findIndex((id) => id === target.indicatorId) ?? 0);
      return moveTradingChartIndicator(base, indicatorId, overPaneId, targetIndex);
    });
  }

  function handleLayoutDragStart(event: DragStartEvent) {
    setActiveLayoutRowId(String(event.active.id));
  }

  function handleLayoutDragEnd(event: DragEndEvent) {
    setActiveLayoutRowId(null);
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    const indicatorId = layoutIndicatorIdFromRowId(activeId);
    if (!overId || !indicatorId) {
      return;
    }
    const target = parseLayoutDropTarget(overId);
    if (!target) {
      return;
    }
    moveLayoutIndicator(indicatorId, target);
  }
  useLayoutEffect(() => {
    activeAdditionalPaneCountRef.current = activeAdditionalPaneCount;
    syncPaneHeightImmediately({ lockDuringSync: true });
  }, [activeAdditionalPaneCount]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    chart.applyOptions({
      handleScroll: !chartInteractionLocked,
      handleScale: !chartInteractionLocked,
    });
  }, [chartInteractionLocked]);

  useEffect(() => {
    const chart = chartRef.current;
    const container = chartContainerRef.current;
    if (!chart || !container) {
      setPaneLegendPositionsIfChanged([]);
      return;
    }

    const updatePaneLegendPositions = () => {
      const anchors = paneLegendAnchors(chart);
      setPaneLegendPositionsIfChanged(anchors);
      emitPaneHeightsChange(paneHeightsRecordFromAnchors(paneLayout, anchors));
      syncPlotAreaWidth();
    };

    updatePaneLegendPositions();
    const layoutRoot = typeof chart.chartElement === 'function' ? chart.chartElement() : container;
    const stopObservingLayout = observeChartLayout(layoutRoot, updatePaneLegendPositions, () =>
      chart
        .panes()
        .flatMap((pane) => (typeof pane.getHTMLElement === 'function' ? [pane.getHTMLElement()].filter((element): element is HTMLElement => element instanceof HTMLElement) : [])),
      {
        mutationThrottleMs: 48,
        shouldTrackPointerDrag: shouldTrackChartPaneResize,
      },
    );
    chart.timeScale().subscribeVisibleLogicalRangeChange(updatePaneLegendPositions);
    return () => {
      stopObservingLayout();
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(updatePaneLegendPositions);
    };
  }, [activeAdditionalPaneCount, chartBootstrapVersion, paneLayout, seriesStructureSignature]);

  useLayoutEffect(() => {
    if (!chartRef.current || !chartContainerRef.current) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      syncPaneHeightImmediately({ lockDuringSync: true });
      syncPlotAreaWidth();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [expanded]);

  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container || !canUseCanvasChart()) {
      return;
    }

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        attributionLogo: false,
        background: { type: ColorType.Solid, color: 'rgba(255,255,255,0)' },
        textColor: CHART_TEXT_COLOR,
        fontFamily: getComputedStyle(document.body).fontFamily,
      },
      grid: {
        vertLines: { color: rgba('#94a3b8', 0.16) },
        horzLines: { color: rgba('#94a3b8', 0.18) },
      },
      panes: {
        enableResize: true,
        separatorColor: '#000000',
        separatorHoverColor: '#000000',
      },
      rightPriceScale: {
        visible: true,
        borderVisible: true,
        borderColor: CHART_BORDER_COLOR,
        scaleMargins: { top: 0.12, bottom: 0.18 },
      },
      leftPriceScale: {
        visible: true,
        borderVisible: true,
        borderColor: CHART_BORDER_COLOR,
      },
      timeScale: {
        borderVisible: true,
        borderColor: CHART_BORDER_COLOR,
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        vertLine: { color: CHART_MUTED_COLOR, width: 1, style: LineStyle.Dashed },
        horzLine: { color: CHART_MUTED_COLOR, width: 1, style: LineStyle.Dashed },
      },
      handleScroll: true,
      handleScale: true,
    });
    chartRef.current = chart;
    setChartBootstrapVersion((current) => current + 1);

    const syncChartRenderSize = () => {
      syncPaneHeightImmediately();
      syncPlotAreaWidth();
    };
    syncChartRenderSize();
    const resizeObserver = new ResizeObserver(syncChartRenderSize);
    resizeObserver.observe(container);

    return () => {
      if (paneHeightsDebounceTimerRef.current != null) {
        window.clearTimeout(paneHeightsDebounceTimerRef.current);
        paneHeightsDebounceTimerRef.current = null;
      }
      if (visibleDateRangeDebounceTimerRef.current != null) {
        window.clearTimeout(visibleDateRangeDebounceTimerRef.current);
        visibleDateRangeDebounceTimerRef.current = null;
      }
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRefs.current = [];
      chartSeriesRefs.current = {};
      setChartBootstrapVersion((current) => current + 1);
      if (paneHeightUpdateFrameRef.current != null) {
        cancelAnimationFrame(paneHeightUpdateFrameRef.current);
        paneHeightUpdateFrameRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!settingsOpen) {
      dragOffsetRef.current = null;
      settingsPositionRef.current = null;
      setSettingsRenderPosition(null);
      if (dragFrameRef.current != null) {
        cancelAnimationFrame(dragFrameRef.current);
        dragFrameRef.current = null;
      }
      if (settingsContentRef.current) {
        settingsContentRef.current.style.left = '';
        settingsContentRef.current.style.top = '';
        settingsContentRef.current.style.transform = '';
      }
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  }, [settingsOpen]);

  useEffect(() => {
    const dialogOpen = settingsOpen || indicatorsDialogOpen || layoutDialogOpen;
    if (!dialogOpen) {
      return;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const previousDocumentOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousDocumentOverflow;
    };
  }, [settingsOpen, indicatorsDialogOpen, layoutDialogOpen]);

  useEffect(() => {
    if (!stylePopover) {
      activeStylePopoverRef.current = null;
      activeStyleTriggerRef.current = null;
      setStylePopoverAnchorRect(null);
      setStylePopoverSide('bottom');
      return;
    }

    const updateAnchor = () => {
      const triggerRect = activeStyleTriggerRef.current?.getBoundingClientRect();
      if (!triggerRect) {
        return;
      }
      setStylePopoverAnchorRect(triggerRect);
      const estimatedHeight = stylePopover.kind === 'color' ? 420 : 260;
      const spaceBelow = window.innerHeight - triggerRect.bottom - 24;
      const spaceAbove = triggerRect.top - 24;
      setStylePopoverSide(spaceBelow < estimatedHeight && spaceAbove > spaceBelow ? 'top' : 'bottom');
    };
    updateAnchor();

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }
      const eventPath = event.composedPath();
      if (activeStylePopoverRef.current && (activeStylePopoverRef.current.contains(target) || eventPath.includes(activeStylePopoverRef.current))) {
        return;
      }
      if (activeStyleTriggerRef.current && (activeStyleTriggerRef.current.contains(target) || eventPath.includes(activeStyleTriggerRef.current))) {
        return;
      }
      setStylePopover(null);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('resize', updateAnchor);
    window.addEventListener('scroll', updateAnchor, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('resize', updateAnchor);
      window.removeEventListener('scroll', updateAnchor, true);
    };
  }, [stylePopover]);

  useEffect(() => {
    timeframeRangeLockRef.current = true;
  }, [chartZoomResetToken, timeframe]);

  useLayoutEffect(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }

    for (const series of seriesRefs.current) {
      chart.removeSeries(series);
    }
    seriesRefs.current = [];
    chartSeriesRefs.current = {};
    uncertaintyBandPathRef.current = '';
    setUncertaintyBandPath('');

    if (chartModel.points.length === 0) {
      return;
    }
    const paneSides = new Map<number, Set<TradingChartIndicatorAxisSide>>();
    const panesWithSeries = new Set<number>();
    const registerSide = (paneIndex: number, side: TradingChartIndicatorAxisSide) => {
      const sides = paneSides.get(paneIndex) ?? new Set<TradingChartIndicatorAxisSide>();
      sides.add(side);
      paneSides.set(paneIndex, sides);
    };
    const registerSeries = (paneIndex: number, ...series: AnySeries[]) => {
      panesWithSeries.add(paneIndex);
      seriesRefs.current.push(...series);
    };

    const chartPanes = chart.panes();
    for (let i = chartPanes.length; i < paneLayout.length; i++) {
      chart.addPane();
    }

    // Ensure price scales exist and are properly configured for all panes
    for (let i = 0; i < paneLayout.length; i++) {
      const rightScale = chart.priceScale('right', i);
      const leftScale = chart.priceScale('left', i);
      rightScale.applyOptions({ visible: true });
      leftScale.applyOptions({ visible: false });
    }

    for (const pane of paneLayout) {
      const paneIndex = paneIndexById.get(pane.id) ?? 0;
      for (const indicatorId of pane.indicatorIds) {
        const setting = editableIndicatorSettings[indicatorId];
        const priceScaleId = setting.axisSide;
        if (indicatorId === 'inventory') {
          const inventorySeries = addInputSeries({ chart, paneIndex, priceScaleId, setting });
          registerSeries(paneIndex, inventorySeries);
          chartSeriesRefs.current.inventory = inventorySeries;
          registerSide(paneIndex, setting.axisSide);
          continue;
        }
        if (indicatorId === 'uncertainty') {
          const showsBand = setting.plotStyle === 'band';
          const lowSeries = chart.addSeries(LineSeries, {
            priceScaleId,
            color: rgba(setting.color, showsBand ? Math.max(setting.opacity ?? 0.35, 0.42) : setting.opacity ?? 0.35),
            lineStyle: lineStyleValue(setting.lineStyle),
            lineWidth: (setting.lineWidth ?? 1) as 1,
            priceLineVisible: false,
            lastValueVisible: false,
          }, paneIndex);
          const highSeries = chart.addSeries(LineSeries, {
            priceScaleId,
            color: rgba(setting.color, showsBand ? Math.max(setting.opacity ?? 0.35, 0.42) : setting.opacity ?? 0.35),
            lineStyle: lineStyleValue(setting.lineStyle),
            lineWidth: (setting.lineWidth ?? 1) as 1,
            priceLineVisible: false,
            lastValueVisible: setting.showPriceScaleLabel ?? false,
          }, paneIndex);
          registerSeries(paneIndex, lowSeries, highSeries);
          chartSeriesRefs.current.uncertaintyLow = lowSeries;
          chartSeriesRefs.current.uncertaintyHigh = highSeries;
          registerSide(paneIndex, setting.axisSide);
          continue;
        }
        if (indicatorId === 'leadTimeRange') {
          const lowSeries = chart.addSeries(LineSeries, {
            priceScaleId,
            color: rgba(setting.color, setting.opacity ?? 0.22),
            lineStyle: lineStyleValue(setting.lineStyle),
            lineWidth: Math.max(1, Math.min(4, setting.lineWidth ?? 2)) as 1 | 2 | 3 | 4,
            priceLineVisible: false,
            lastValueVisible: false,
          }, paneIndex);
          const highSeries = chart.addSeries(LineSeries, {
            priceScaleId,
            color: rgba(setting.color, setting.opacity ?? 0.22),
            lineStyle: lineStyleValue(setting.lineStyle),
            lineWidth: Math.max(1, Math.min(4, setting.lineWidth ?? 2)) as 1 | 2 | 3 | 4,
            priceLineVisible: false,
            lastValueVisible: setting.showPriceScaleLabel ?? false,
          }, paneIndex);
          registerSeries(paneIndex, lowSeries, highSeries);
          chartSeriesRefs.current.leadTimeRangeLow = lowSeries;
          chartSeriesRefs.current.leadTimeRangeHigh = highSeries;
          registerSide(paneIndex, setting.axisSide);
          continue;
        }
        if (indicatorId === 'reorderPoint' || indicatorId === 'safetyStock') {
          const lineSeries = chart.addSeries(LineSeries, {
            priceScaleId,
            color: setting.color,
            lineStyle: lineStyleValue(setting.lineStyle),
            lineWidth: (setting.lineWidth ?? 1) as 1,
            priceLineVisible: false,
            lastValueVisible: setting.showPriceScaleLabel ?? true,
          }, paneIndex);
          registerSeries(paneIndex, lineSeries);
          chartSeriesRefs.current[indicatorId] = lineSeries;
          registerSide(paneIndex, setting.axisSide);
          continue;
        }
        if (indicatorId === 'availableCapacity' || indicatorId === 'demandMinusAvailableCapacity' || indicatorId === 'leadTime') {
          const lineSeries = addInputSeries({ chart, paneIndex, priceScaleId, setting });
          registerSeries(paneIndex, lineSeries);
          chartSeriesRefs.current[indicatorId] = lineSeries;
          registerSide(paneIndex, setting.axisSide);
          continue;
        }
        if (isOverlayIndicatorId(indicatorId)) {
          registerSide(paneIndex, setting.axisSide);
          continue;
        }
        if (isHistogramIndicatorId(indicatorId)) {
          const inputSeries = addInputSeries({ chart, paneIndex, priceScaleId, setting });
          registerSeries(paneIndex, inputSeries);
          chartSeriesRefs.current[indicatorId] = inputSeries;
          registerSide(paneIndex, setting.axisSide);
          continue;
        }
        if (indicatorId === 'price') {
          const priceSeries = addInputSeries({ chart, paneIndex, priceScaleId, setting });
          registerSeries(paneIndex, priceSeries);
          chartSeriesRefs.current.price = priceSeries;
          registerSide(paneIndex, setting.axisSide);
        }
      }
      if (pane.indicatorIds.some((indicatorId) => isOverlayIndicatorId(indicatorId)) && !panesWithSeries.has(paneIndex)) {
        // Overlay-only panes render via DOM overlays rather than chart series, so add an
        // invisible anchor series to keep the pane alive and its right axis configured.
        const zeroLineSeries = chart.addSeries(LineSeries, {
          color: 'rgba(0,0,0,0)',
          crosshairMarkerVisible: false,
          lastValueVisible: false,
          priceLineVisible: false,
          priceScaleId: 'right',
        }, paneIndex);

        zeroLineSeries.setData(cachedOverlayAnchorData(chartModel.points));
        registerSeries(paneIndex, zeroLineSeries);
        registerSide(paneIndex, 'right');
      }
    }

    for (const pane of paneLayout) {
      const paneIndex = paneIndexById.get(pane.id) ?? 0;
      const sides = paneSides.get(paneIndex) ?? new Set<TradingChartIndicatorAxisSide>();
      chart.priceScale('left', paneIndex).applyOptions({
        visible: sides.has('left'),
        borderVisible: sides.has('left'),
        borderColor: CHART_BORDER_COLOR,
      });
      chart.priceScale('right', paneIndex).applyOptions({
        visible: sides.has('right'),
        borderVisible: sides.has('right'),
        borderColor: CHART_BORDER_COLOR,
      });
    }

    setSeriesData(chartSeriesRefs.current, chartModel, editableIndicatorSettings);
    cleanupEmptyTrailingPanes(chart);
    syncPaneHeightImmediately({ lockDuringSync: true });
  }, [chartBootstrapVersion, paneLayout, paneIndexById, seriesStructureSignature]);

  useEffect(() => {
    applySeriesOptions(chartSeriesRefs.current, editableIndicatorSettings);
  }, [editableIndicatorSettings]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    const previousTimeframe = previousTimeframeRef.current;
    const visibleRange = chart.timeScale().getVisibleLogicalRange();
    setSeriesData(chartSeriesRefs.current, chartModel, editableIndicatorSettings);
    if (chartModel.points.length === 0) {
      previousChartPointsRef.current = chartModel.points;
      previousTimeframeRef.current = timeframe;
      return;
    }
    const shouldRestoreVisibleDateRange = previousTimeframe == null && restoredVisibleDateRangeRef.current != null;
    const shouldFitTimeframe = previousTimeframe !== timeframe || !visibleRange || (timeframeRangeLockRef.current && !isBusy);
    const nextVisibleRange = shouldRestoreVisibleDateRange
      ? visibleRangeForDateRange(chartModel, restoredVisibleDateRangeRef.current)
      : shouldFitTimeframe
        ? visibleRangeForTimeframe(chartModel, timeframe, customTimeframeRange)
        : null;
    if (nextVisibleRange && !logicalRangesAreClose(nextVisibleRange, visibleRange)) {
      setChartVisibleLogicalRange(nextVisibleRange);
    }
    if (timeframeRangeLockRef.current && !isBusy) {
      timeframeRangeLockRef.current = false;
    }
    previousChartPointsRef.current = chartModel.points;
    previousTimeframeRef.current = timeframe;
  }, [chartModel, customTimeframeRange, editableIndicatorSettings, isBusy, timeframe]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !onVisibleDateRangeChange) {
      return;
    }
    const updateVisibleDateRange = (range: { from: number; to: number } | null) => {
      emitVisibleDateRangeChange(visibleDateRangeForLogicalRange(chartModel, range), {
        syncCustomTimeframeRange: viewportInteractionActiveRef.current,
      });
    };
    emitVisibleDateRangeChange(visibleDateRangeForLogicalRange(chartModel, chart.timeScale().getVisibleLogicalRange()), {
      syncCustomTimeframeRange: false,
    });
    chart.timeScale().subscribeVisibleLogicalRangeChange(updateVisibleDateRange);
    return () => chart.timeScale().unsubscribeVisibleLogicalRangeChange(updateVisibleDateRange);
  }, [chartModel, onVisibleDateRangeChange]);

  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container) {
      return;
    }
    container.addEventListener('pointerdown', startViewportInteraction, true);
    container.addEventListener('wheel', markWheelViewportInteraction, { capture: true, passive: true });
    window.addEventListener('pointerup', finishViewportInteractionSoon);
    window.addEventListener('pointercancel', finishViewportInteractionSoon);
    window.addEventListener('blur', finishViewportInteractionSoon);
    return () => {
      container.removeEventListener('pointerdown', startViewportInteraction, true);
      container.removeEventListener('wheel', markWheelViewportInteraction, true);
      window.removeEventListener('pointerup', finishViewportInteractionSoon);
      window.removeEventListener('pointercancel', finishViewportInteractionSoon);
      window.removeEventListener('blur', finishViewportInteractionSoon);
      if (viewportInteractionEndTimerRef.current != null) {
        window.clearTimeout(viewportInteractionEndTimerRef.current);
        viewportInteractionEndTimerRef.current = null;
      }
      viewportInteractionActiveRef.current = false;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    const container = chartContainerRef.current;
    const uncertaintyLowSeries = chartSeriesRefs.current.uncertaintyLow;
    const uncertaintyHighSeries = chartSeriesRefs.current.uncertaintyHigh;
    const setting = editableIndicatorSettings.uncertainty;
    if (
      !chart ||
      !container ||
      !uncertaintyLowSeries ||
      !uncertaintyHighSeries ||
      !isEnabled(editableIndicatorSettings, chartModel.availability, 'uncertainty') ||
      setting.plotStyle !== 'band'
    ) {
      uncertaintyBandPathRef.current = '';
      setUncertaintyBandPath('');
      return;
    }

    const updateUncertaintyBandPath = () => {
      const segments: string[] = [];
      let upperPoints: Array<{ x: number; y: number }> = [];
      let lowerPoints: Array<{ x: number; y: number }> = [];

      const flushSegment = () => {
        if (upperPoints.length < 2 || lowerPoints.length < 2) {
          upperPoints = [];
          lowerPoints = [];
          return;
        }
        const upperPath = upperPoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
        const lowerPath = [...lowerPoints].reverse().map((point) => `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
        segments.push(`${upperPath} ${lowerPath} Z`);
        upperPoints = [];
        lowerPoints = [];
      };

      const visibleRange = chart.timeScale().getVisibleLogicalRange();
      const startIndex = visibleRange
        ? Math.max(0, Math.floor(visibleRange.from) - 2)
        : 0;
      const endIndex = visibleRange
        ? Math.min(chartModel.points.length - 1, Math.ceil(visibleRange.to) + 2)
        : chartModel.points.length - 1;
      for (const point of chartModel.points.slice(startIndex, endIndex + 1)) {
        if (point.inventoryLow == null || point.inventoryHigh == null) {
          flushSegment();
          continue;
        }
        const x = chart.timeScale().timeToCoordinate(point.time);
        if (x == null) {
          flushSegment();
          continue;
        }
        const yHigh = uncertaintyHighSeries.priceToCoordinate(point.inventoryHigh);
        const yLow = uncertaintyLowSeries.priceToCoordinate(point.inventoryLow);
        if (yHigh == null || yLow == null) {
          flushSegment();
          continue;
        }
        upperPoints.push({ x, y: yHigh });
        lowerPoints.push({ x, y: yLow });
      }
      flushSegment();
      const nextPath = segments.join(' ');
      if (uncertaintyBandPathRef.current !== nextPath) {
        uncertaintyBandPathRef.current = nextPath;
        setUncertaintyBandPath(nextPath);
      }
    };

    let animationFrame: number | null = null;
    let interactionFrame: number | null = null;
    let wheelStopTimer: number | null = null;
    const scheduleUncertaintyBandPathUpdate = () => {
      if (animationFrame != null) {
        return;
      }
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = null;
        updateUncertaintyBandPath();
      });
    };
    const stopInteractiveUpdates = () => {
      if (interactionFrame != null) {
        window.cancelAnimationFrame(interactionFrame);
        interactionFrame = null;
      }
      if (wheelStopTimer != null) {
        window.clearTimeout(wheelStopTimer);
        wheelStopTimer = null;
      }
      scheduleUncertaintyBandPathUpdate();
    };
    const runInteractiveUpdate = () => {
      updateUncertaintyBandPath();
      interactionFrame = window.requestAnimationFrame(runInteractiveUpdate);
    };
    const startInteractiveUpdates = () => {
      if (interactionFrame != null) {
        return;
      }
      runInteractiveUpdate();
    };
    const handleWheel = () => {
      startInteractiveUpdates();
      if (wheelStopTimer != null) {
        window.clearTimeout(wheelStopTimer);
      }
      wheelStopTimer = window.setTimeout(stopInteractiveUpdates, 120);
    };
    scheduleUncertaintyBandPathUpdate();
    const stopObservingLayout = observeChartLayout(container, scheduleUncertaintyBandPathUpdate, undefined, {
      mutationThrottleMs: 48,
    });
    container.addEventListener('pointerdown', startInteractiveUpdates);
    container.addEventListener('wheel', handleWheel, { passive: true });
    window.addEventListener('pointerup', stopInteractiveUpdates);
    window.addEventListener('pointercancel', stopInteractiveUpdates);
    window.addEventListener('blur', stopInteractiveUpdates);
    chart.timeScale().subscribeVisibleLogicalRangeChange(scheduleUncertaintyBandPathUpdate);
    return () => {
      if (animationFrame != null) {
        window.cancelAnimationFrame(animationFrame);
      }
      if (interactionFrame != null) {
        window.cancelAnimationFrame(interactionFrame);
      }
      if (wheelStopTimer != null) {
        window.clearTimeout(wheelStopTimer);
      }
      stopObservingLayout();
      container.removeEventListener('pointerdown', startInteractiveUpdates);
      container.removeEventListener('wheel', handleWheel);
      window.removeEventListener('pointerup', stopInteractiveUpdates);
      window.removeEventListener('pointercancel', stopInteractiveUpdates);
      window.removeEventListener('blur', stopInteractiveUpdates);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(scheduleUncertaintyBandPathUpdate);
    };
  }, [chartModel, editableIndicatorSettings]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    const handleCrosshairMove = (param: MouseEventParams<Time>) => {
      setHoveredTime(param.point && param.time != null ? param.time : null);
    };
    const handleClick = (param: MouseEventParams<Time>) => {
      if (param.time == null) {
        return;
      }
      const point = chartModel.pointByTimeKey.get(tradingChartTimeKey(param.time));
      if (point) {
        onSelectInterval(point.intervalIndex);
      }
    };
    chart.subscribeCrosshairMove(handleCrosshairMove);
    chart.subscribeClick(handleClick);
    return () => {
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      chart.unsubscribeClick(handleClick);
    };
  }, [chartModel, onSelectInterval]);

  useEffect(() => {
    const maybeLoadOlderIntervals = (range: { from: number; to: number } | null) => {
      const chart = chartRef.current;
      if (
        !chart ||
        !hasOlderIntervals ||
        (timeframe === 'MAX' && customTimeframeRange == null) ||
        isBusy ||
        isLoadingOlderIntervals ||
        loadingOlderRef.current
      ) {
        return;
      }
      const shouldLoad = shouldLoadOlderIntervalsForViewport(chart, chartModel.points, range);
      if (!shouldLoad) {
        olderLoadHysteresisKeyRef.current = null;
        return;
      }
      const hysteresisKey = `${olderLoadViewportToken}:${Math.floor(range?.from ?? 0)}:${Math.ceil(range?.to ?? 0)}`;
      if (olderLoadHysteresisKeyRef.current === hysteresisKey) {
        return;
      }
      olderLoadHysteresisKeyRef.current = hysteresisKey;
      loadingOlderRef.current = true;
      setIsOlderLoadPending(true);
      onOlderLoadProgressChange?.({ current: 1, total: 1 });
      void loadOlderIntervals()
        .catch(() => null)
        .finally(() => {
          loadingOlderRef.current = false;
          setIsOlderLoadPending(false);
          onOlderLoadProgressChange?.(null);
        });
    };
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    const handleRangeChange = (range: { from: number; to: number } | null) => {
      maybeLoadOlderIntervals(range);
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(handleRangeChange);
    const frame = window.requestAnimationFrame(() => {
      maybeLoadOlderIntervals(chart.timeScale().getVisibleLogicalRange());
    });
    return () => {
      window.cancelAnimationFrame(frame);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleRangeChange);
    };
  }, [
    chartModel.points,
    customTimeframeRange,
    hasOlderIntervals,
    isBusy,
    isLoadingOlderIntervals,
    loadOlderIntervals,
    olderLoadViewportToken,
    onOlderLoadProgressChange,
    timeframe,
  ]);

  useEffect(() => {
    const range = visibleRangeForTimeframe(chartModel, timeframe, customTimeframeRange);
    const chart = chartRef.current;
    if (!range || !chart || isBusy || appliedChartZoomResetTokenRef.current === chartZoomResetToken) {
      return;
    }
    setChartVisibleLogicalRange(range);
    appliedChartZoomResetTokenRef.current = chartZoomResetToken;
    setHoveredTime(null);
  }, [chartModel, chartZoomResetToken, customTimeframeRange, isBusy, timeframe]);

  useEffect(() => {
    const chart = chartRef.current;
    if (selectedIntervalIndex == null) {
      previousSelectedIntervalRef.current = null;
      return;
    }
    if (!chart) {
      return;
    }
    if (!shouldAutoCenterSelectedInterval(previousSelectedIntervalRef.current, selectedIntervalIndex)) {
      previousSelectedIntervalRef.current = selectedIntervalIndex;
      return;
    }
    const selectedPoint = chartModel.pointByIntervalIndex.get(selectedIntervalIndex);
    if (!selectedPoint) {
      return;
    }
    const selectedIndex = chart.timeScale().timeToIndex(selectedPoint.time, true);
    const visibleRange = chart.timeScale().getVisibleLogicalRange();
    if (selectedIndex == null || !visibleRange) {
      return;
    }
    previousSelectedIntervalRef.current = selectedIntervalIndex;
    const numericIndex = Number(selectedIndex);
    if (numericIndex >= visibleRange.from && numericIndex <= visibleRange.to) {
      return;
    }
    setChartVisibleLogicalRange({
      from: Math.max(0, numericIndex - 8),
      to: numericIndex + 8,
    });
  }, [chartModel, selectedIntervalIndex]);

  useEffect(() => {
    const chart = chartRef.current;
    const container = chartContainerRef.current;
    if (!chart || !container || overlayPointIntervals.length === 0) {
      setOverlayRenderStateIfChanged(new Map());
      return;
    }

    // Guard: ensure timeScale is ready
    const timeScaleWidth = chart.timeScale().width?.();
    if (!timeScaleWidth || timeScaleWidth <= 0) {
      setOverlayRenderStateIfChanged(new Map());
      return;
    }

    const updateRegimeIconPositions = () => {
      const tsWidth = chart.timeScale().width?.();
      if (!tsWidth || tsWidth <= 0) {
        return;
      }
      const nextPositions = new Map<number, number>();
      const clipWidth = plotAreaWidth || container.clientWidth;
      for (const intervalIndex of overlayPointIntervals) {
        const point = chartModel.pointByIntervalIndex.get(intervalIndex);
        if (!point) {
          continue;
        }
        const coordinate = chart.timeScale().timeToCoordinate(point.time);
        if (coordinate == null || coordinate < -clipWidth || coordinate > clipWidth * 2) {
          continue;
        }
        nextPositions.set(intervalIndex, coordinate);
      }
      syncPlotAreaWidth();
      setOverlayRenderStateIfChanged(nextPositions);
    };

    updateRegimeIconPositions();
    const layoutRoot = typeof chart.chartElement === 'function' ? chart.chartElement() : container;
    const stopObservingLayout = observeChartLayout(layoutRoot, updateRegimeIconPositions, undefined, {
      mutationThrottleMs: 48,
    });
    chart.timeScale().subscribeVisibleLogicalRangeChange(updateRegimeIconPositions);
    return () => {
      stopObservingLayout();
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(updateRegimeIconPositions);
    };
  }, [
    chartModel,
    editableIndicatorSettings,
    language,
    onSelectInterval,
    overlayPointIntervals,
    plotAreaWidth,
    regimePaneId,
    showRegimeBackground,
    showRegimeIcons,
    visibleRegimePoints,
  ]);

  function updateDraftIndicator(id: TradingChartIndicatorId, patch: Partial<TradingChartIndicatorSettings[TradingChartIndicatorId]>) {
    setDraftIndicatorSettings((current) => {
      const base = current ?? structuredClone(indicatorSettings);
      return normalizeTradingChartIndicatorSettings({
        ...base,
        [id]: {
          ...base[id],
          ...patch,
        },
      });
    });
  }

  function positionSettingsDialog(open: boolean) {
    const position = open ? centeredSettingsPosition() : null;
    setSettingsRenderPosition(position);
    settingsPositionRef.current = position;
  }

  function leaveSettingsDialog() {
    setSettingsOpen(false);
    setDraftIndicatorSettings(null);
    setStylePopover(null);
    setSettingsSelectOpen(false);
    positionSettingsDialog(false);
  }

  function openSettingsDialog() {
    setIndicatorsDialogOpen(false);
    setLayoutDialogOpen(false);
    setDraftIndicatorsDialogSettings(null);
    setDraftLayoutIndicatorSettings(null);
    setSettingsOpen(true);
    setStylePopover(null);
    setSettingsSelectOpen(false);
    positionSettingsDialog(true);
    setDraftIndicatorSettings(structuredClone(indicatorSettings));
  }

  function leaveIndicatorsDialog() {
    setIndicatorsDialogOpen(false);
    setDraftIndicatorsDialogSettings(null);
    positionSettingsDialog(false);
  }

  function openIndicatorsDialog() {
    setSettingsOpen(false);
    setLayoutDialogOpen(false);
    setDraftIndicatorSettings(null);
    setDraftLayoutIndicatorSettings(null);
    setStylePopover(null);
    setSettingsSelectOpen(false);
    setIndicatorsDialogOpen(true);
    positionSettingsDialog(true);
    setDraftIndicatorsDialogSettings(structuredClone(indicatorSettings));
  }

  function leaveLayoutDialog() {
    setLayoutDialogOpen(false);
    setDraftLayoutIndicatorSettings(null);
    setActiveLayoutRowId(null);
    positionSettingsDialog(false);
  }

  function openLayoutDialog() {
    setSettingsOpen(false);
    setIndicatorsDialogOpen(false);
    setDraftIndicatorSettings(null);
    setDraftIndicatorsDialogSettings(null);
    setStylePopover(null);
    setSettingsSelectOpen(false);
    setLayoutDialogOpen(true);
    positionSettingsDialog(true);
    setDraftLayoutIndicatorSettings(normalizeTradingChartIndicatorSettings(structuredClone(indicatorSettings)));
    setActiveLayoutRowId(null);
  }

  function requestSettingsDialogLeave(dialogId: ChartSettingsDialogId, action: () => void) {
    const dirty =
      (dialogId === 'settings' && settingsDialogDirty) ||
      (dialogId === 'indicators' && indicatorsDialogDirty) ||
      (dialogId === 'layout' && layoutDialogDirty);
    if (!dirty) {
      action();
      return;
    }
    setPendingSettingsLeave({ dialogId, action });
  }

  function applyPendingSettingsLeave() {
    if (!pendingSettingsLeave) {
      return;
    }
    if (pendingSettingsLeave.dialogId === 'settings' && draftIndicatorSettings) {
      setIndicatorSettings(draftIndicatorSettings);
    }
    if (pendingSettingsLeave.dialogId === 'indicators' && draftIndicatorsDialogSettings) {
      setIndicatorSettings(draftIndicatorsDialogSettings);
    }
    if (pendingSettingsLeave.dialogId === 'layout' && draftLayoutIndicatorSettings) {
      setIndicatorSettings(normalizeTradingChartIndicatorSettings(draftLayoutIndicatorSettings));
    }
    const action = pendingSettingsLeave.action;
    setPendingSettingsLeave(null);
    action();
  }

  function discardPendingSettingsLeave() {
    if (!pendingSettingsLeave) {
      return;
    }
    const action = pendingSettingsLeave.action;
    setPendingSettingsLeave(null);
    action();
  }

  function startSettingsDrag(event: React.PointerEvent<HTMLDivElement>) {
    const interactiveTarget = (event.target as HTMLElement | null)?.closest('button,[role="button"],input,select,[data-slot="select-trigger"]');
    if (interactiveTarget) {
      return;
    }
    event.preventDefault();
    const rect = settingsContentRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    dragOffsetRef.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    settingsPositionRef.current = { left: rect.left, top: rect.top };
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';

    const applyPosition = (left: number, top: number) => {
      settingsPositionRef.current = { left, top };
      const element = settingsContentRef.current;
      if (!element) {
        return;
      }
      element.style.left = `${left}px`;
      element.style.top = `${top}px`;
      element.style.transform = 'none';
    };

    applyPosition(rect.left, rect.top);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const element = settingsContentRef.current;
      if (!element || !dragOffsetRef.current) {
        return;
      }
      const width = element.offsetWidth;
      const height = element.offsetHeight;
      const nextLeft = Math.min(Math.max(-width + 48, moveEvent.clientX - dragOffsetRef.current.x), window.innerWidth - 48);
      const nextTop = Math.min(Math.max(0, moveEvent.clientY - dragOffsetRef.current.y), window.innerHeight - 48);
      if (dragFrameRef.current != null) {
        cancelAnimationFrame(dragFrameRef.current);
      }
      dragFrameRef.current = requestAnimationFrame(() => {
        applyPosition(nextLeft, nextTop);
        dragFrameRef.current = null;
      });
    };

    const handlePointerUp = () => {
      dragOffsetRef.current = null;
      if (settingsPositionRef.current) {
        setSettingsRenderPosition(settingsPositionRef.current);
      }
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (dragFrameRef.current != null) {
        cancelAnimationFrame(dragFrameRef.current);
        dragFrameRef.current = null;
      }
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
  }

  const hasPoints = chartModel.points.length > 0;
  const orderedVisibleIndicatorIds = useMemo(
    () =>
      paneLayout.flatMap((pane) =>
        pane.indicatorIds.filter((id) => hasRenderedIndicatorData(chartModel, id)),
      ),
    [chartModel, paneLayout],
  );
  const plottedIndicatorIds = useMemo(
    () => orderedVisibleIndicatorIds,
    [orderedVisibleIndicatorIds],
  );
  const visibleIndicatorSections = useMemo(
    () =>
      INDICATOR_SECTIONS
        .map((section) => ({
          ...section,
          ids: section.ids.filter((id) => chartModel.availability[id]),
        }))
        .filter((section) => section.ids.length > 0),
    [chartModel.availability],
  );
  const stylePopoverSetting = stylePopover ? editableIndicatorSettings[stylePopover.indicatorId] : null;
  const stylePopoverWidth = 304;
  const plotStyleOptionCount = stylePopover?.kind === 'plotStyle' ? compatiblePlotStyles(stylePopover.indicatorId).length : 0;
  const stylePopoverHeight = stylePopover?.kind === 'color'
    ? 520
    : plotStyleOptionCount > 0
      ? plotStyleOptionCount * 56 + 24
      : 260;
  const stylePopoverPortal = stylePopover && stylePopoverAnchorRect && stylePopoverSetting
    ? createPortal(
      <div
        data-chart-style-popover="true"
        ref={activeStylePopoverRef}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        className={cn(
          'fixed z-[90] overscroll-contain border border-border/70 bg-[#fdfaf6] shadow-[0_24px_60px_rgba(48,31,20,0.16)]',
          stylePopover.kind === 'color'
            ? 'grid w-[min(19rem,calc(100vw-2rem))] max-h-[min(32.5rem,calc(100vh-2rem))] gap-3 overflow-y-auto rounded-[1.25rem] p-4'
            : 'grid w-72 rounded-[1.5rem] py-2',
        )}
        style={{
          left: Math.max(16, Math.min(stylePopoverAnchorRect.left, window.innerWidth - stylePopoverWidth - 16)),
          top:
            stylePopoverSide === 'top'
              ? Math.max(16, stylePopoverAnchorRect.top - stylePopoverHeight - 12)
              : Math.max(16, Math.min(window.innerHeight - stylePopoverHeight - 16, stylePopoverAnchorRect.bottom + 12)),
        }}
      >
        {stylePopover.kind === 'color' ? (
          <>
            <div className="grid gap-3">
              {STYLE_COLOR_GRID.map((row, rowIndex) => (
                <div key={`color-row-${rowIndex}`} className="grid grid-cols-10 gap-2">
                  {row.map((color) => (
                    <button
                      key={color}
                      aria-label={translateUiLiteral(language, 'Use color {color}', { color })}
                      className={cn(
                        'size-6 rounded-[0.45rem] border transition-transform hover:scale-[1.04]',
                        stylePopoverSetting.color.toLowerCase() === color.toLowerCase()
                          ? 'border-[color:var(--indicator-accent)] ring-2 ring-[color:var(--indicator-accent)]/35'
                          : 'border-border/70',
                      )}
                      style={{ backgroundColor: color, ['--indicator-accent' as string]: SETTINGS_PANEL_ACCENT }}
                      type="button"
                      onClick={() => updateDraftIndicator(stylePopover.indicatorId, { color })}
                    />
                  ))}
                </div>
              ))}
            </div>
            {supportsLineWidth(stylePopoverSetting.plotStyle) ? (
              <div className="grid gap-2">
                <p className="text-xs font-medium text-foreground">{translateUiLiteral(language, 'Thickness')}</p>
                <div className={cn(SETTINGS_SEGMENTED_CLASS, 'grid grid-cols-4')}>
                  {LINE_WIDTH_OPTIONS.map((option) => (
                    <button
                      key={option}
                      aria-pressed={(stylePopoverSetting.lineWidth ?? 1) === option}
                      aria-label={translateUiLiteral(language, 'Use line width {width}', { width: option })}
                      className={cn(
                        SETTINGS_SEGMENTED_OPTION_CLASS,
                        'h-8',
                        (stylePopoverSetting.lineWidth ?? 1) === option ? 'bg-[color:var(--indicator-accent)] text-background' : 'text-foreground',
                      )}
                      style={{ ['--indicator-accent' as string]: SETTINGS_PANEL_ACCENT }}
                      type="button"
                      onClick={() => updateDraftIndicator(stylePopover.indicatorId, { lineWidth: option })}
                    >
                      <span
                        aria-hidden="true"
                        className={cn('block rounded-full', (stylePopoverSetting.lineWidth ?? 1) === option ? 'bg-background' : 'bg-foreground')}
                        style={{ width: 20, height: option }}
                      />
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {supportsLineType(stylePopoverSetting.plotStyle) ? (
              <div className="grid gap-2">
                <p className="text-xs font-medium text-foreground">{translateUiLiteral(language, 'Line type')}</p>
                <div className={cn(SETTINGS_SEGMENTED_CLASS, 'grid grid-cols-3')}>
                  {LINE_STYLE_OPTIONS.map((option) => (
                    <button
                      key={option}
                      aria-pressed={(stylePopoverSetting.lineStyle ?? 'solid') === option}
                      aria-label={translateUiLiteral(language, 'Use line type {type}', { type: option })}
                      className={cn(
                        SETTINGS_SEGMENTED_OPTION_CLASS,
                        'h-8',
                        (stylePopoverSetting.lineStyle ?? 'solid') === option ? 'bg-[color:var(--indicator-accent)] text-background' : 'text-foreground',
                      )}
                      style={{ ['--indicator-accent' as string]: SETTINGS_PANEL_ACCENT }}
                      type="button"
                      onClick={() => updateDraftIndicator(stylePopover.indicatorId, { lineStyle: option })}
                    >
                      <span
                        aria-hidden="true"
                        className={cn('block h-1 w-7 rounded-full', lineStylePreviewClass(option, (stylePopoverSetting.lineStyle ?? 'solid') === option))}
                      />
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : (
          compatiblePlotStyles(stylePopover.indicatorId).map((option) => (
            (() => {
              const PlotStyleIcon = plotStyleIcon(option);
              return (
                <button
                  key={option}
                  aria-pressed={stylePopoverSetting.plotStyle === option}
                  className={cn(
                    'flex items-center gap-3 px-5 py-4 text-left text-base transition-colors',
                    stylePopoverSetting.plotStyle === option ? 'bg-[color:var(--indicator-accent)] text-background' : 'text-foreground hover:bg-white/80',
                  )}
                  style={{ ['--indicator-accent' as string]: SETTINGS_PANEL_ACCENT }}
                  type="button"
                  onClick={() => updateDraftIndicator(stylePopover.indicatorId, { plotStyle: option })}
                >
                  <PlotStyleIcon aria-hidden="true" className="size-5 shrink-0" />
                  <span>{translateUiLiteral(language, plotStyleLabel(option))}</span>
                </button>
              );
            })()
          ))
        )}
      </div>,
      document.body,
    )
    : null;
  return (
    <div className={cn('flex min-h-0 w-full min-w-0 flex-col gap-4', fillAvailableHeight ? 'flex-1' : 'flex-none')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <DialogPrimitive.Root
            modal={false}
            open={settingsOpen}
            onOpenChange={(open) => {
              if (open) {
                if (indicatorsDialogOpen) {
                  requestSettingsDialogLeave('indicators', openSettingsDialog);
                  return;
                }
                if (layoutDialogOpen) {
                  requestSettingsDialogLeave('layout', openSettingsDialog);
                  return;
                }
                openSettingsDialog();
                return;
              }
              requestSettingsDialogLeave('settings', leaveSettingsDialog);
            }}
          >
              <DialogPrimitive.Trigger asChild>
              <Button className="gap-2" disabled={!hasPoints} size="sm" type="button" variant="outline">
                <StatusSettingsControlIcon aria-hidden="true" className="size-4" />
                <span>{translateUiLiteral(language, 'Settings')}</span>
              </Button>
            </DialogPrimitive.Trigger>
            <DialogPrimitive.Portal>
              <DialogPrimitive.Overlay
                data-chart-dialog-overlay="true"
                className="fixed inset-0 z-50 bg-transparent data-[state=open]:animate-in data-[state=open]:fade-in-0"
                onPointerDown={() => requestSettingsDialogLeave('settings', leaveSettingsDialog)}
              />
              <DialogPrimitive.Content
                data-chart-dialog-content="true"
                ref={settingsContentRef}
                className={SETTINGS_DIALOG_CLASS}
                onEscapeKeyDown={(event) => {
                  if (settingsDialogDirty) {
                    event.preventDefault();
                    requestSettingsDialogLeave('settings', leaveSettingsDialog);
                    return;
                  }
                  setStylePopover(null);
                  setSettingsSelectOpen(false);
                }}
                onFocusOutside={(event) => {
                  const target = event.target as Node | null;
                  if (target && activeStylePopoverRef.current?.contains(target)) {
                    event.preventDefault();
                  }
                }}
                onInteractOutside={(event) => {
                  const target = event.target as Node | null;
                  if (target && activeStylePopoverRef.current?.contains(target)) {
                    event.preventDefault();
                  }
                }}
                onPointerDownOutside={(event) => {
                  const target = event.target as Node | null;
                  if (target && activeStylePopoverRef.current?.contains(target)) {
                    event.preventDefault();
                  }
                }}
                style={settingsRenderPosition ?? { left: 16, top: 16 }}
              >
                <DialogPrimitive.Title className="sr-only">{translateUiLiteral(language, 'Chart indicator settings')}</DialogPrimitive.Title>
                <DialogPrimitive.Description className="sr-only">
                  {translateUiLiteral(language, 'Configure chart indicator styles, output values, and input values.')}
                </DialogPrimitive.Description>
                <div
                  className={SETTINGS_DIALOG_HEADER_CLASS}
                  onPointerDown={startSettingsDrag}
                >
                  <div>
                    <p className="text-[1.75rem] font-semibold text-foreground">{translateUiLiteral(language, 'Chart Settings')}</p>
                    <p className="mt-2 text-sm text-muted-foreground">{translateUiLiteral(language, 'Style, output values, and input values')}</p>
                  </div>
                  <button
                    aria-label={translateUiLiteral(language, 'Close settings')}
                    className="rounded-full p-2.5 text-foreground transition-colors hover:bg-white/80"
                    type="button"
                    onClick={() => requestSettingsDialogLeave('settings', leaveSettingsDialog)}
                  >
                    <ActionCloseIcon className="size-5" />
                  </button>
                </div>
                <div
                  className={settingsDialogBodyClassName(stylePopover != null || settingsSelectOpen)}
                  data-testid="chart-settings-body"
                  onTouchMove={(event) => {
                    if (stylePopover || settingsSelectOpen) {
                      event.preventDefault();
                    }
                  }}
                  onWheel={(event) => {
                    if (stylePopover || settingsSelectOpen) {
                      event.preventDefault();
                    }
                  }}
                >
                  <div className="grid gap-6">
                    {plottedIndicatorIds.map((id) => {
                      const setting = editableIndicatorSettings[id];
                      return (
                        <section key={id} className="grid gap-5 border-b border-border/50 pb-6 last:border-b-0 last:pb-0">
                          <div className="flex flex-wrap items-center gap-4">
                            <p className="text-base font-semibold text-foreground">{indicatorLabel(language, id)}</p>
                            <div className="relative">
                              <button
                                aria-label={translateUiLiteral(language, '{name} color', { name: indicatorLabel(language, id) })}
                                className={cn(SETTINGS_INPUT_CLASS, 'flex min-w-[9rem] items-center gap-3 px-2.5')}
                                ref={stylePopover?.indicatorId === id && stylePopover.kind === 'color' ? activeStyleTriggerRef : null}
                                type="button"
                                onClick={() => setStylePopover((current) => current?.indicatorId === id && current.kind === 'color' ? null : { indicatorId: id, kind: 'color' })}
                              >
                                <span className="h-7 w-7 shrink-0 rounded-[0.75rem] border border-border/30" style={{ backgroundColor: setting.color }} />
                                <span
                                  aria-hidden="true"
                                  className="mr-1 block h-0.5 flex-1 rounded-full"
                                  style={{ backgroundColor: setting.color, opacity: setting.opacity ?? 1 }}
                                />
                              </button>
                            </div>
                            <div className="relative">
                              <button
                                aria-label={translateUiLiteral(language, '{name} plot style', { name: indicatorLabel(language, id) })}
                                className={SETTINGS_ICON_CONTROL_CLASS}
                                ref={stylePopover?.indicatorId === id && stylePopover.kind === 'plotStyle' ? activeStyleTriggerRef : null}
                                type="button"
                                onClick={() => setStylePopover((current) => current?.indicatorId === id && current.kind === 'plotStyle' ? null : { indicatorId: id, kind: 'plotStyle' })}
                              >
                                <ActionChartLineTypeIcon data-icon="inline-start" className="size-4" />
                              </button>
                            </div>
                          </div>
                          <div className="grid gap-4">
                            <div className="grid gap-4">
                              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{translateUiLiteral(language, 'Input Values')}</p>
                              <div className="flex flex-wrap items-center gap-4">
                                <label className="text-sm font-medium text-foreground" htmlFor={`indicator-source-${id}`}>{translateUiLiteral(language, 'Source')}</label>
                                <Select
                                  disabled={!supportsTradingChartInputSource(setting.plotStyle)}
                                  value={isOhlcTradingChartPlotStyle(setting.plotStyle) ? 'ohlc' : setting.inputSource ?? 'close'}
                                  onOpenChange={setSettingsSelectOpen}
                                  onValueChange={(value) => updateDraftIndicator(id, { inputSource: value as ChartInputValueSource })}
                                >
                                  <SelectTrigger
                                    id={`indicator-source-${id}`}
                                    aria-label={translateUiLiteral(language, '{name} source', { name: indicatorLabel(language, id) })}
                                    className={cn(SETTINGS_INPUT_CLASS, 'w-full max-w-56 px-4')}
                                  >
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="overscroll-contain">
                                    <SelectGroup>
                                      {CHART_INPUT_VALUE_SOURCE_OPTIONS.map((option) => (
                                        <SelectItem
                                          key={option.value}
                                          disabled={inputSourceOptionDisabled(setting.plotStyle, option.value)}
                                          value={option.value}
                                        >
                                          {translateUiLiteral(language, option.label)}
                                        </SelectItem>
                                      ))}
                                    </SelectGroup>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            <div className="grid gap-4">
                              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{translateUiLiteral(language, 'Output Values')}</p>
                              <div className="flex flex-wrap items-center gap-4">
                                <label className="text-sm font-medium text-foreground" htmlFor={`indicator-precision-${id}`}>{translateUiLiteral(language, 'Precision')}</label>
                                <Select
                                  value={setting.precision ?? 'default'}
                                  onOpenChange={setSettingsSelectOpen}
                                  onValueChange={(value) => updateDraftIndicator(id, { precision: value as TradingChartIndicatorPrecision })}
                                >
                                  <SelectTrigger
                                    id={`indicator-precision-${id}`}
                                    aria-label={translateUiLiteral(language, '{name} precision', { name: indicatorLabel(language, id) })}
                                    className={cn(SETTINGS_INPUT_CLASS, 'w-full max-w-40 px-4')}
                                  >
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="overscroll-contain">
                                    <SelectGroup>
                                      {PRECISION_OPTIONS.map((option) => (
                                        <SelectItem key={option} value={option}>{translateUiLiteral(language, precisionLabel(option))}</SelectItem>
                                      ))}
                                    </SelectGroup>
                                  </SelectContent>
                                </Select>
                              </div>
                              <label className="inline-flex items-center gap-3 text-sm font-medium text-foreground">
                                <Checkbox
                                  aria-label={translateUiLiteral(language, '{name} labels on price scale', { name: indicatorLabel(language, id) })}
                                  checked={setting.showPriceScaleLabel ?? false}
                                  onCheckedChange={(checked) => updateDraftIndicator(id, { showPriceScaleLabel: checked === true })}
                                />
                                <span>{translateUiLiteral(language, 'Labels on price scale')}</span>
                              </label>
                              <label className="inline-flex items-center gap-3 text-sm font-medium text-foreground">
                                <Checkbox
                                  aria-label={translateUiLiteral(language, '{name} values in status line', { name: indicatorLabel(language, id) })}
                                  checked={setting.showStatusLineValue ?? true}
                                  onCheckedChange={(checked) => updateDraftIndicator(id, { showStatusLineValue: checked === true })}
                                />
                                <span>{translateUiLiteral(language, 'Values in status line')}</span>
                              </label>
                            </div>
                          </div>
                        </section>
                      );
                    })}
                  </div>
                </div>
                <div className={SETTINGS_DIALOG_FOOTER_CLASS}>
                  <Select
                    value={defaultsActionValue}
                    onOpenChange={setSettingsSelectOpen}
                    onValueChange={(value) => {
                      setDefaultsActionValue(undefined);
                      if (value === 'reset') {
                        setDraftIndicatorSettings(structuredClone(defaultIndicatorSettings));
                        setStylePopover(null);
                        setSettingsSelectOpen(false);
                      }
                      if (value === 'save' && draftIndicatorSettings) {
                        onSaveDefaultIndicatorSettings(structuredClone(draftIndicatorSettings));
                      }
                    }}
                  >
                    <SelectTrigger aria-label={translateUiLiteral(language, 'Default settings menu')} className="h-11 min-w-36 rounded-[1rem] bg-[#fffaf3] px-4 text-sm font-medium">
                      <SelectValue placeholder={translateUiLiteral(language, 'Default')} />
                    </SelectTrigger>
                    <SelectContent align="start" className="overscroll-contain rounded-[1rem] border-border/70 bg-[#fdfaf6]">
                      <SelectGroup>
                        <SelectItem value="reset">{translateUiLiteral(language, 'Reset settings')}</SelectItem>
                        <SelectItem value="save">{translateUiLiteral(language, 'Save as Default')}</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-3">
                    <Button
                      className={SETTINGS_DIALOG_FOOTER_BUTTON_CLASS}
                      size="sm"
                      type="button"
                      variant="outline"
                      onClick={() => requestSettingsDialogLeave('settings', leaveSettingsDialog)}
                    >
                      <ActionCloseIcon data-icon="inline-start" />
                      {translateUiLiteral(language, 'Cancel')}
                    </Button>
                    <Button
                      className={SETTINGS_DIALOG_FOOTER_BUTTON_CLASS}
                      size="sm"
                      type="button"
                      onClick={() => {
                        if (draftIndicatorSettings) {
                          setIndicatorSettings(draftIndicatorSettings);
                        }
                        leaveSettingsDialog();
                      }}
                    >
                      <ActionConfirmIcon data-icon="inline-start" />
                      {translateUiLiteral(language, 'Ok')}
                    </Button>
                  </div>
                </div>
              </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
          </DialogPrimitive.Root>
          <DialogPrimitive.Root
            modal={false}
            open={indicatorsDialogOpen}
            onOpenChange={(open) => {
              if (open) {
                if (settingsOpen) {
                  requestSettingsDialogLeave('settings', openIndicatorsDialog);
                  return;
                }
                if (layoutDialogOpen) {
                  requestSettingsDialogLeave('layout', openIndicatorsDialog);
                  return;
                }
                openIndicatorsDialog();
                return;
              }
              requestSettingsDialogLeave('indicators', leaveIndicatorsDialog);
            }}
          >
              <DialogPrimitive.Trigger asChild>
              <Button className="gap-2" disabled={!hasPoints} size="sm" type="button" variant="outline">
                <StatusTrendChartIcon aria-hidden="true" className="size-4" />
                <span>{translateUiLiteral(language, 'Indicators')}</span>
              </Button>
            </DialogPrimitive.Trigger>
            <DialogPrimitive.Portal>
              <DialogPrimitive.Overlay
                data-chart-dialog-overlay="true"
                className="fixed inset-0 z-50 bg-transparent data-[state=open]:animate-in data-[state=open]:fade-in-0"
                onPointerDown={() => requestSettingsDialogLeave('indicators', leaveIndicatorsDialog)}
              />
              <DialogPrimitive.Content
                data-chart-dialog-content="true"
                ref={settingsContentRef}
                className={SETTINGS_DIALOG_CLASS}
                onEscapeKeyDown={(event) => {
                  if (indicatorsDialogDirty) {
                    event.preventDefault();
                    requestSettingsDialogLeave('indicators', leaveIndicatorsDialog);
                  }
                }}
                style={settingsRenderPosition ?? { left: 16, top: 16 }}
              >
                <DialogPrimitive.Title className="sr-only">{translateUiLiteral(language, 'Chart indicators')}</DialogPrimitive.Title>
                <DialogPrimitive.Description className="sr-only">
                  {translateUiLiteral(language, 'Select which indicators are shown on the chart.')}
                </DialogPrimitive.Description>
                <div
                  className={SETTINGS_DIALOG_HEADER_CLASS}
                  onPointerDown={startSettingsDrag}
                >
                  <div>
                    <p className="text-[1.75rem] font-semibold text-foreground">{translateUiLiteral(language, 'Indicators')}</p>
                    <p className="mt-2 text-sm text-muted-foreground">{translateUiLiteral(language, 'Choose which indicators appear on the chart.')}</p>
                  </div>
                  <button
                    aria-label={translateUiLiteral(language, 'Close indicators')}
                    className="rounded-full p-2.5 text-foreground transition-colors hover:bg-white/80"
                    type="button"
                    onClick={() => requestSettingsDialogLeave('indicators', leaveIndicatorsDialog)}
                  >
                    <ActionCloseIcon className="size-5" />
                  </button>
                </div>
                <div className={settingsDialogBodyClassName(false)}>
                  <div className="grid gap-6">
                    {visibleIndicatorSections.map((section) => (
                      <section key={section.title} className="grid gap-3">
                        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{translateUiLiteral(language, section.title)}</p>
                        <div className="grid gap-0">
                          {section.ids.map((id) => {
                            const setting = draftIndicatorsDialogSettings?.[id] ?? indicatorSettings[id];
                            const IndicatorIcon = INDICATOR_ICONS[id];
                            return (
                              <div key={id} className="border-b border-border/50 py-4 first:pt-0 last:border-b-0 last:pb-0">
                                <label className="flex items-center gap-3 text-sm text-foreground">
                                  <Checkbox
                                    aria-label={translateUiLiteral(language, 'Show {name}', { name: indicatorLabel(language, id) })}
                                    className="self-center"
                                    checked={setting.enabled}
                                    onCheckedChange={(checked) => {
                                      setDraftIndicatorsDialogSettings((current) => {
                                        if (!current) {
                                          return current;
                                        }
                                        return {
                                          ...current,
                                          [id]: {
                                            ...current[id],
                                            enabled: checked === true,
                                          },
                                        };
                                      });
                                    }}
                                  />
                                  <IndicatorIcon aria-hidden="true" className="size-4 shrink-0 self-center text-muted-foreground" />
                                  <span className="grid gap-1">
                                    <span className="font-medium">{indicatorLabel(language, id)}</span>
                                    <span className="text-sm leading-5 text-muted-foreground">{indicatorDescription(language, id)}</span>
                                  </span>
                                </label>
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    ))}
                  </div>
                </div>
                <div className={SETTINGS_DIALOG_FOOTER_CLASS}>
                  <div />
                  <div className="flex items-center gap-3">
                    <Button
                      className={SETTINGS_DIALOG_FOOTER_BUTTON_CLASS}
                      size="sm"
                      type="button"
                      variant="outline"
                      onClick={() => requestSettingsDialogLeave('indicators', leaveIndicatorsDialog)}
                    >
                      <ActionCloseIcon data-icon="inline-start" />
                      {translateUiLiteral(language, 'Cancel')}
                    </Button>
                    <Button
                      className={SETTINGS_DIALOG_FOOTER_BUTTON_CLASS}
                      size="sm"
                      type="button"
                      onClick={() => {
                        if (draftIndicatorsDialogSettings) {
                          setIndicatorSettings(draftIndicatorsDialogSettings);
                        }
                        leaveIndicatorsDialog();
                      }}
                    >
                      <ActionConfirmIcon data-icon="inline-start" />
                      {translateUiLiteral(language, 'Ok')}
                    </Button>
                  </div>
                </div>
              </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
          </DialogPrimitive.Root>
          <DialogPrimitive.Root
            modal={false}
            open={layoutDialogOpen}
            onOpenChange={(open) => {
              if (open) {
                if (settingsOpen) {
                  requestSettingsDialogLeave('settings', openLayoutDialog);
                  return;
                }
                if (indicatorsDialogOpen) {
                  requestSettingsDialogLeave('indicators', openLayoutDialog);
                  return;
                }
                openLayoutDialog();
                return;
              }
              requestSettingsDialogLeave('layout', leaveLayoutDialog);
            }}
          >
            <DialogPrimitive.Trigger asChild>
              <Button className="gap-2" disabled={!hasPoints} size="sm" type="button" variant="outline">
                <EntityLayersIcon aria-hidden="true" className="size-4" />
                <span>{translateUiLiteral(language, 'Layout')}</span>
              </Button>
            </DialogPrimitive.Trigger>
            <DialogPrimitive.Portal>
              <DialogPrimitive.Overlay
                data-chart-dialog-overlay="true"
                className="fixed inset-0 z-50 bg-transparent data-[state=open]:animate-in data-[state=open]:fade-in-0"
                onPointerDown={() => requestSettingsDialogLeave('layout', leaveLayoutDialog)}
              />
              <DialogPrimitive.Content
                data-chart-dialog-content="true"
                ref={settingsContentRef}
                className={SETTINGS_DIALOG_CLASS}
                onEscapeKeyDown={(event) => {
                  if (layoutDialogDirty) {
                    event.preventDefault();
                    requestSettingsDialogLeave('layout', leaveLayoutDialog);
                    return;
                  }
                  setActiveLayoutRowId(null);
                }}
                style={settingsRenderPosition ?? { left: 16, top: 16 }}
              >
                <DialogPrimitive.Title className="sr-only">{translateUiLiteral(language, 'Chart layout')}</DialogPrimitive.Title>
                <DialogPrimitive.Description className="sr-only">
                  {translateUiLiteral(language, 'Arrange pane membership, axis side, and render order for chart indicators.')}
                </DialogPrimitive.Description>
                <div
                  className={SETTINGS_DIALOG_HEADER_CLASS}
                  onPointerDown={startSettingsDrag}
                >
                  <div>
                    <p className="text-[1.75rem] font-semibold text-foreground">{translateUiLiteral(language, 'Layout')}</p>
                    <p className="mt-2 text-sm text-muted-foreground">{translateUiLiteral(language, 'Move indicators between panes, change axis side, and remove rows from chart.')}</p>
                  </div>
                  <button
                    aria-label={translateUiLiteral(language, 'Close layout')}
                    className="rounded-full p-2.5 text-foreground transition-colors hover:bg-white/80"
                    type="button"
                    onClick={() => requestSettingsDialogLeave('layout', leaveLayoutDialog)}
                  >
                    <ActionCloseIcon className="size-5" />
                  </button>
                </div>
                <div className={settingsDialogBodyClassName(false)}>
                  <DndContext
                    collisionDetection={layoutCollisionDetection}
                    onDragCancel={() => setActiveLayoutRowId(null)}
                    onDragEnd={handleLayoutDragEnd}
                    onDragStart={handleLayoutDragStart}
                    sensors={layoutSensors}
                  >
                    <div className="grid gap-4">
                      {paneLayout.map((pane) => (
                        <LayoutPaneSection
                          key={pane.id}
                          language={language}
                          pane={pane}
                          settings={editableIndicatorSettings}
                          onAxisSideChange={(indicatorId, axisSide) => updateDraftLayoutIndicator(indicatorId, { axisSide })}
                          onDelete={deleteLayoutIndicator}
                        />
                      ))}
                      <LayoutNewPaneDropZone language={language} />
                    </div>
                    {typeof document !== 'undefined'
                      ? createPortal(
                          <DragOverlay dropAnimation={LAYOUT_DROP_ANIMATION}>
                            {activeLayoutIndicatorId ? (
                              <LayoutIndicatorRowCard
                                dragging
                                indicatorId={activeLayoutIndicatorId}
                                language={language}
                                settings={editableIndicatorSettings}
                              />
                            ) : null}
                          </DragOverlay>,
                          document.body,
                        )
                      : null}
                  </DndContext>
                </div>
                <div className={SETTINGS_DIALOG_FOOTER_CLASS}>
                  <div className="text-sm text-muted-foreground">
                    {translateUiLiteral(language, activeLayoutRowId ? 'Drop on a pane or New pane.' : 'Drag rows to reorder their pane and draw layer.')}
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      className={SETTINGS_DIALOG_FOOTER_BUTTON_CLASS}
                      size="sm"
                      type="button"
                      variant="outline"
                      onClick={() => requestSettingsDialogLeave('layout', leaveLayoutDialog)}
                    >
                      <ActionCloseIcon data-icon="inline-start" />
                      {translateUiLiteral(language, 'Cancel')}
                    </Button>
                    <Button
                      className={SETTINGS_DIALOG_FOOTER_BUTTON_CLASS}
                      size="sm"
                      type="button"
                      onClick={() => {
                        if (draftLayoutIndicatorSettings) {
                          setIndicatorSettings(normalizeTradingChartIndicatorSettings(draftLayoutIndicatorSettings));
                        }
                        leaveLayoutDialog();
                      }}
                    >
                      <ActionConfirmIcon data-icon="inline-start" />
                      {translateUiLiteral(language, 'Ok')}
                    </Button>
                  </div>
                </div>
              </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
          </DialogPrimitive.Root>
          <Button className="gap-2" size="sm" type="button" variant="outline" onClick={onReset}>
            <ActionResetIcon aria-hidden="true" className="size-4" />
            <span>{translateUiLiteral(language, 'Reset chart')}</span>
          </Button>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <p className="text-sm text-muted-foreground">{legendPoint ? intervalTooltipLabel(legendPoint.endAt ?? legendPoint.startAt, legendPoint.intervalIndex, language) : translateUiLiteral(language, 'No interval selected')}</p>
          {onToggleExpand ? (
            <Button
              aria-label={translateUiLiteral(language, expanded ? 'Collapse chart' : 'Expand chart')}
              className="gap-2 rounded-full px-3"
              size="sm"
              type="button"
              variant="outline"
              onClick={() => {
                snapshotCurrentLayoutPreferences();
                onToggleExpand();
              }}
            >
              {expanded ? <StatusMinimizeIcon className="size-4" /> : <StatusMaximizeIcon className="size-4" />}
              <span>{translateUiLiteral(language, expanded ? 'Collapse' : 'Expand')}</span>
            </Button>
          ) : null}
        </div>
      </div>

      <div
        className={cn(
          'relative min-h-[420px] flex-1 rounded-lg border border-border/70 bg-white transition-opacity duration-200 motion-reduce:transition-none',
          chartRenderHeight != null && 'shrink-0 flex-none',
          shouldDimChartWhileBusy && 'opacity-45',
        )}
        data-busy={showBusyState || undefined}
        style={chartRenderStyle}
      >
        {hasPoints ? (
          <>
            {hasMeasuredRegimePane && regimeBackgroundBands.length > 0 ? (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute left-0 z-[0] overflow-hidden"
                style={{
                  top: regimePaneTop,
                  width: plotAreaWidth || '100%',
                  height: Math.max(0, regimePaneHeight),
                }}
              >
                {regimeBackgroundBands.map((band) => (
                  <span
                    key={`${band.intervalIndex}-${band.regime}`}
                    className="absolute inset-y-0"
                    style={{
                      left: band.left,
                      width: band.width,
                      background: regimeChartFill(band.regime, 'muted'),
                    }}
                  />
                ))}
              </div>
            ) : null}
            <div className="absolute left-4 top-3 z-10 flex max-w-[calc(100%-2rem)] flex-wrap items-center gap-x-4 gap-y-2">
              {(paneLegendGroups[0]?.rows ?? []).map((row) => (
                <span key={row.id} className="inline-flex min-w-0 items-center gap-2 text-xs font-medium text-foreground">
                  <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: row.color }} />
                  <span>{row.label}</span>
                  {row.value ? <span className="text-muted-foreground">{row.value}</span> : null}
                </span>
              ))}
            </div>
            {paneLegendPositions.length === paneLayout.length ? paneLegendGroups.slice(1).map((group, index) => {
              const pane = paneLegendPositions[index + 1];
              const visibleRows = group.rows;
              if (!pane || visibleRows.length === 0) {
                return null;
              }
              return (
                <div
                  key={`pane-legend-${visibleRows[0]?.id ?? index}`}
                  className="pointer-events-none absolute left-4 z-10 flex max-w-[calc(100%-2rem)] flex-wrap items-center gap-x-4 gap-y-2"
                  style={{ top: pane.top + 10 }}
                >
                  {visibleRows.map((row) => (
                    <span key={row.id} className="inline-flex min-w-0 items-center gap-2 text-xs font-medium text-foreground">
                      <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: row.color }} />
                      <span>{row.label}</span>
                      {row.value ? <span className="text-muted-foreground">{row.value}</span> : null}
                    </span>
                  ))}
                </div>
              );
            }) : null}
            {stackedOverlayMarkers.length > 0 ? (
              <div
                aria-label="Chart flags"
                className="pointer-events-none absolute inset-y-0 left-0 z-10 overflow-hidden"
                style={{ width: plotAreaWidth || '100%' }}
              >
                {stackedOverlayMarkers.map((marker) => {
                  const paneIndex = paneIndexById.get(marker.paneId);
                  const pane = paneIndex == null ? null : paneLegendPositions[paneIndex];
                  if (!pane || pane.height <= 0) {
                    return null;
                  }
                  if (plotAreaWidth != null) {
                    const markerRight = marker.left + marker.width;
                    if (markerRight <= 0 || marker.left >= plotAreaWidth) {
                      return null;
                    }
                  }
                  const Icon = marker.icon;
                  return (
                    <button
                      key={marker.key}
                      aria-label={translateUiLiteral(language, 'Select {name}', { name: marker.label })}
                      className={cn(
                        'pointer-events-auto absolute flex h-7 items-center justify-center rounded-full border border-background/80 bg-background/92 text-foreground shadow-sm transition-transform hover:scale-105',
                        marker.clustered ? 'px-2' : 'w-7',
                      )}
                      style={{
                        top: Math.max(pane.top, pane.top + pane.height - marker.bottom - REGIME_ICON_SIZE),
                        left: marker.left,
                        width: marker.width,
                        color: marker.color,
                      }}
                      type="button"
                      onClick={marker.onClick}
                    >
                      <Icon aria-hidden="true" className="size-4" />
                      <span className="sr-only">
                        {marker.indicatorId === 'regime' ? shortRegimeLabel(marker.label) : marker.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </>
        ) : (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-6 text-center text-sm text-muted-foreground" data-testid="sku-trading-chart-empty">
            {translateUiLiteral(language, 'No chart intervals are available yet.')}
          </div>
        )}
        {uncertaintyBandPath ? (
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-0 z-[1] h-full overflow-hidden"
            focusable="false"
            style={{ width: plotAreaWidth || '100%' }}
          >
            <path
              d={uncertaintyBandPath}
              fill={rgba(editableIndicatorSettings.uncertainty.color, Math.max(editableIndicatorSettings.uncertainty.opacity ?? 0.22, 0.18))}
              stroke="none"
            />
          </svg>
        ) : null}
        <div
          ref={chartContainerRef}
          className={cn(
            'relative z-[2] h-full min-h-[420px] w-full transition-opacity duration-75 motion-reduce:transition-none',
            hideChartVisualsDuringRelayout && 'opacity-0',
          )}
          data-testid="sku-trading-chart"
          style={chartRenderStyle}
        />
        {shouldDimChartWhileBusy ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-[25] bg-white/55 backdrop-blur-[0.25px]"
          />
        ) : null}
      </div>

      <div className="relative flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
        <div className="flex flex-wrap items-center gap-2" aria-label="Chart duration">
          {CHART_TIMEFRAME_OPTIONS.map((option) => (
            <button
              key={option}
              className={cn(
                'rounded-md px-3 py-2 text-sm font-semibold transition-colors',
                activeDurationOption === option ? 'bg-foreground text-background' : 'text-foreground hover:bg-muted',
              )}
              type="button"
              onClick={() => {
                if (hasCustomTimeframe || option !== timeframe) {
                  onTimeframeChange(option);
                }
              }}
            >
              {option === 'MAX' ? translateUiLiteral(language, 'All') : translateChartTimeframeLabel(language, option)}
            </button>
          ))}
          {onCustomTimeframeChange ? (
          <DialogPrimitive.Root open={customRangeDialogOpen} onOpenChange={setCustomRangeDialogOpen}>
            <DialogPrimitive.Trigger asChild>
              <button
                aria-label={translateUiLiteral(language, 'Custom duration')}
                className={cn(
                  'rounded-md px-3 py-2 text-sm font-semibold transition-colors',
                  activeDurationOption === 'Custom' ? 'bg-foreground text-background' : 'text-foreground hover:bg-muted',
                )}
                type="button"
                onClick={openCustomRangeDialog}
              >
                {translateUiLiteral(language, 'Custom')}
              </button>
            </DialogPrimitive.Trigger>
            <DialogPrimitive.Portal>
              <DialogPrimitive.Overlay className="fixed inset-0 z-[100] bg-black/30 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
              <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[110] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-[1.75rem] border border-border/70 bg-background p-6 shadow-[0_24px_80px_rgba(0,0,0,0.18)]">
                <DialogPrimitive.Title className="text-lg font-semibold tracking-[-0.03em] text-foreground">{translateUiLiteral(language, 'Custom duration')}</DialogPrimitive.Title>
                <DialogPrimitive.Description className="mt-3 text-sm leading-6 text-muted-foreground">
                  {translateUiLiteral(language, 'Choose a start and end date for the chart range.')}
                </DialogPrimitive.Description>
                <div className="mt-5 grid gap-4">
                  <label className="grid gap-2 text-sm font-medium text-foreground">
                    <span>{translateUiLiteral(language, 'Start date')}</span>
                    <Input
                      aria-label={translateUiLiteral(language, 'Custom timeframe start date')}
                      className="h-11 rounded-[1rem] bg-background px-4"
                      max={draftCustomRangeEnd || undefined}
                      type="date"
                      value={draftCustomRangeStart}
                      onChange={(event) => setDraftCustomRangeStart(event.currentTarget.value)}
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-medium text-foreground">
                    <span>{translateUiLiteral(language, 'End date')}</span>
                    <Input
                      aria-label={translateUiLiteral(language, 'Custom timeframe end date')}
                      className="h-11 rounded-[1rem] bg-background px-4"
                      min={draftCustomRangeStart || undefined}
                      type="date"
                      value={draftCustomRangeEnd}
                      onChange={(event) => setDraftCustomRangeEnd(event.currentTarget.value)}
                    />
                  </label>
                </div>
                <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                  <Button
                    disabled={!hasCustomTimeframe}
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      onCustomTimeframeChange(null);
                      setCustomRangeDialogOpen(false);
                    }}
                  >
                    <ActionResetIcon data-icon="inline-start" />
                    {translateUiLiteral(language, 'Clear')}
                  </Button>
                  <div className="flex flex-wrap items-center justify-end gap-3">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setCustomRangeDialogOpen(false)}
                    >
                      <ActionCloseIcon data-icon="inline-start" />
                      {translateUiLiteral(language, 'Cancel')}
                    </Button>
                    <Button
                      disabled={!draftCustomRangeStart || !draftCustomRangeEnd || draftCustomRangeStart > draftCustomRangeEnd}
                      type="button"
                      onClick={applyCustomRange}
                    >
                      <ActionConfirmIcon data-icon="inline-start" />
                      {translateUiLiteral(language, 'Apply')}
                    </Button>
                  </div>
                </div>
              </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
          </DialogPrimitive.Root>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2" aria-label="Chart timeframe">
          <span className="mr-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{translateUiLiteral(language, 'Timeframe')}</span>
          {CHART_RESOLUTION_OPTIONS.map((option) => {
            const active = chartResolution === option;
            if (option === 'Custom') {
              return (
                <DialogPrimitive.Root key={option} open={customResolutionDialogOpen} onOpenChange={setCustomResolutionDialogOpen}>
                  <DialogPrimitive.Trigger asChild>
                    <button
                      aria-label={translateUiLiteral(language, 'Custom timeframe')}
                      className={cn(
                        'rounded-md px-3 py-2 text-sm font-semibold transition-colors',
                        active ? 'bg-foreground text-background' : 'text-foreground hover:bg-muted',
                      )}
                      type="button"
                    >
                      {formatChartResolution(option, customChartResolution)}
                    </button>
                  </DialogPrimitive.Trigger>
                  <DialogPrimitive.Portal>
                    <DialogPrimitive.Overlay className="fixed inset-0 z-[100] bg-black/30 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
                    <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[110] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-[1.75rem] border border-border/70 bg-background p-6 shadow-[0_24px_80px_rgba(0,0,0,0.18)]">
                      <DialogPrimitive.Title className="text-lg font-semibold tracking-[-0.03em] text-foreground">{translateUiLiteral(language, 'Custom timeframe')}</DialogPrimitive.Title>
                      <DialogPrimitive.Description className="mt-3 text-sm leading-6 text-muted-foreground">
                        {translateUiLiteral(language, 'Use minutes, hours, days, weeks, months, or years. Examples: 15m, 2H, 10D, 1W, 3M, 1Y.')}
                      </DialogPrimitive.Description>
                      <div className="mt-5 grid gap-2">
                        <label className="text-sm font-medium text-foreground" htmlFor="custom-chart-timeframe">{translateUiLiteral(language, 'Timeframe')}</label>
                        <Input
                          id="custom-chart-timeframe"
                          aria-label={translateUiLiteral(language, 'Custom chart timeframe')}
                          className="h-11 rounded-[1rem] bg-background px-4"
                          placeholder="15m"
                          value={draftCustomResolution}
                          onChange={(event) => setDraftCustomResolution(event.currentTarget.value)}
                        />
                        <p className="text-xs text-muted-foreground">{translateUiLiteral(language, 'Seconds and smaller units are not supported.')}</p>
                      </div>
                      <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
                        <Button type="button" variant="ghost" onClick={() => setCustomResolutionDialogOpen(false)}>
                          <ActionCloseIcon data-icon="inline-start" />
                          {translateUiLiteral(language, 'Cancel')}
                        </Button>
                        <Button
                          disabled={!parseChartCustomResolution(draftCustomResolution)}
                          type="button"
                          onClick={applyCustomResolution}
                        >
                          <ActionConfirmIcon data-icon="inline-start" />
                          {translateUiLiteral(language, 'Apply')}
                        </Button>
                      </div>
                    </DialogPrimitive.Content>
                  </DialogPrimitive.Portal>
                </DialogPrimitive.Root>
              );
            }
            return (
              <button
                key={option}
                className={cn(
                  'rounded-md px-3 py-2 text-sm font-semibold transition-colors',
                  active ? 'bg-foreground text-background' : 'text-foreground hover:bg-muted',
                )}
                type="button"
                onClick={() => onChartResolutionChange?.(option, null)}
              >
                {option}
              </button>
            );
          })}
        </div>
        {expanded && showBusyState ? (
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2">
            <div className="inline-flex items-center gap-3 rounded-[1.2rem] border border-[rgba(95,61,39,0.28)] bg-[rgba(63,39,25,0.96)] px-4 py-3 text-sm font-medium text-[rgba(255,248,241,0.98)] shadow-[0_20px_44px_rgba(48,31,20,0.28)] backdrop-blur-[14px]">
              <StatusLoadingIcon className="size-4 animate-spin text-[rgba(255,232,209,0.95)]" />
              <span>{translateUiLiteral(language, 'Loading data')}</span>
            </div>
          </div>
        ) : null}
      </div>
      {stylePopoverPortal}
      <ChartSettingsLeavePrompt
        language={language}
        open={pendingSettingsLeave != null}
        onApply={applyPendingSettingsLeave}
        onDiscard={discardPendingSettingsLeave}
        onKeepEditing={() => setPendingSettingsLeave(null)}
      />
    </div>
  );
}
