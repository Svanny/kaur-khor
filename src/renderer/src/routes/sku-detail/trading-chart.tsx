import { forwardRef, useEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type HTMLAttributes, type SetStateAction } from 'react';
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
import {
  AreaSeries,
  ColorType,
  createChart,
  HistogramSeries,
  LineSeries,
  LineStyle,
  type HistogramData,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type MouseEventParams,
  type SeriesType,
  type Time,
} from 'lightweight-charts';
import { ActionAddBadgeIcon, ActionCloseIcon, ActionDeleteIcon, ActionDragHandleIcon, ActionResetIcon } from '@icons/actions';
import { getRegimeIcon } from '@icons/domain';
import {
  EntityLayersIcon,
  EntityReceiptDocumentIcon,
  EntityRevenueIcon,
  EntitySafetyStockIcon,
  EntitySkuIcon,
  EntityTransitIcon,
} from '@icons/entities';
import {
  StatusGaugeIcon,
  StatusRadarIcon,
  StatusReorderPointIcon,
  StatusSettingsControlIcon,
  StatusTrendChartIcon,
} from '@icons/status';
import type { IconComponent } from '@icons/types';
import { CHART_TIMEFRAME_OPTIONS, deriveChartTimeframeBoundary, RECENT_TIMEFRAME_MIN_REPORTS, type ChartTimeframe } from '@/components/system/chart-timeframe';
import { intervalTooltipLabel } from '@/components/system/interval-strip';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { translateChartTimeframeLabel, translateRegimeLabel } from '@/lib/localized-display';
import { regimeChartFill } from '@/lib/state-tones';
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
} from './trading-chart-model';
import {
  compatiblePlotStyles,
  deriveTradingChartPaneLayout,
  moveTradingChartIndicator,
  nextTradingChartPaneId,
  normalizeTradingChartIndicatorSettings,
  precisionLabel,
  plotStyleLabel,
  supportsLineType,
  supportsLineWidth,
  TRADING_CHART_MAIN_PANE_ID,
  tradingChartTimeKey,
} from './trading-chart-model';

type AnySeries = ISeriesApi<SeriesType, Time>;
type ChartSeriesRefs = Partial<Record<
  'inventory' | 'uncertaintyLow' | 'uncertaintyHigh' | 'reorderPoint' | 'safetyStock' | 'demand' | 'receipts' | 'pipeline' | 'price',
  AnySeries
>>;
type LegendRow = ReturnType<typeof buildLegendRows>[number];
type ChartSettingsDialogId = 'settings' | 'indicators' | 'layout';
type LayoutDropTarget =
  | { type: 'row'; indicatorId: TradingChartIndicatorId }
  | { type: 'pane'; paneId: string }
  | { type: 'new-pane' };

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
const INDICATOR_ICONS: Record<TradingChartIndicatorId, IconComponent> = {
  inventory: EntitySkuIcon,
  uncertainty: StatusRadarIcon,
  reorderPoint: StatusReorderPointIcon,
  safetyStock: EntitySafetyStockIcon,
  demand: StatusTrendChartIcon,
  receipts: EntityReceiptDocumentIcon,
  pipeline: EntityTransitIcon,
  price: EntityRevenueIcon,
  regime: StatusGaugeIcon,
};
const INDICATOR_SECTIONS: Array<{ title: string; ids: TradingChartIndicatorId[] }> = [
  { title: 'Stock', ids: ['inventory', 'uncertainty', 'reorderPoint', 'safetyStock'] },
  { title: 'Flow', ids: ['demand', 'receipts', 'pipeline'] },
  { title: 'Commercial', ids: ['price'] },
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
const CHART_ICON_AXIS_OFFSET = 56;
const LAYOUT_DROP_ANIMATION = {
  duration: 160,
  easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
};
const REGIME_ICON_SIZE = 28;
const REGIME_HIGHLIGHT_ICON_BOTTOM_OFFSET = CHART_ICON_AXIS_OFFSET - REGIME_ICON_SIZE;
const REGIME_CLUSTER_GAP = 8;
const OLDER_LOAD_MIN_LOGICAL_RANGE_THRESHOLD = 5;
const OLDER_LOAD_RANGE_FRACTION = 0.25;
const OLDER_LOAD_MAX_LOGICAL_RANGE_THRESHOLD = 40;

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

function visibleRangeForTimeframe(chartModel: TradingChartModel, timeframe: ChartTimeframe) {
  if (chartModel.points.length === 0) {
    return null;
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

function olderLoadThreshold(range: { from: number; to: number }) {
  const visibleWidth = Math.max(1, range.to - range.from);
  return Math.max(
    OLDER_LOAD_MIN_LOGICAL_RANGE_THRESHOLD,
    Math.min(OLDER_LOAD_MAX_LOGICAL_RANGE_THRESHOLD, visibleWidth * OLDER_LOAD_RANGE_FRACTION),
  );
}

function paneHeightAllocation(totalHeight: number, indicatorPaneCount: number) {
  if (indicatorPaneCount <= 0) {
    return { main: totalHeight, indicators: [] as number[] };
  }
  if (indicatorPaneCount === 1) {
    const indicatorHeight = Math.round(totalHeight * 0.25);
    return {
      main: totalHeight - indicatorHeight,
      indicators: [indicatorHeight],
    };
  }
  const defaultMainRatio = 1 - indicatorPaneCount * 0.25;
  if (defaultMainRatio >= 0.5) {
    const indicatorHeight = Math.round(totalHeight * 0.25);
    const indicators = Array.from({ length: indicatorPaneCount }, () => indicatorHeight);
    return {
      main: Math.max(0, totalHeight - indicatorHeight * indicatorPaneCount),
      indicators,
    };
  }
  const main = Math.round(totalHeight * 0.5);
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

function applyPaneHeights(
  chart: IChartApi | null,
  totalHeight: number,
  indicatorPaneCount: number,
) {
  if (!chart || typeof chart.panes !== 'function') {
    return;
  }
  const panes = chart.panes();
  if (panes.length === 0) {
    return;
  }
  const targetPaneCount = Math.min(panes.length, indicatorPaneCount + 1);
  if (targetPaneCount <= 0) {
    return;
  }
  const timeScaleHeight = stableTimeScaleHeight(chart, totalHeight);
  const plottableHeight = Math.max(0, totalHeight - timeScaleHeight);
  if (plottableHeight <= 0) {
    return;
  }
  const allocation = paneHeightAllocation(plottableHeight, Math.max(0, targetPaneCount - 1));
  const targets = [allocation.main, ...allocation.indicators];
  for (let pass = 0; pass < 4; pass += 1) {
    for (let index = 1; index < targetPaneCount; index += 1) {
      panes[index]?.setHeight(targets[index]!);
    }
    panes[0]?.setHeight(targets[0]!);
  }
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

function observeChartLayout(container: HTMLElement, onLayoutChange: () => void) {
  let frame: number | null = null;
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
  resizeObserver.observe(container);

  const mutationObserver = new MutationObserver(schedule);
  mutationObserver.observe(container, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['style', 'width', 'height'],
  });

  return () => {
    if (frame != null) {
      window.cancelAnimationFrame(frame);
    }
    resizeObserver.disconnect();
    mutationObserver.disconnect();
  };
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
  onAxisSideChange?: (indicatorId: TradingChartIndicatorId, axisSide: TradingChartIndicatorAxisSide) => void;
  onDelete?: (indicatorId: TradingChartIndicatorId) => void;
  settings: TradingChartIndicatorSettings;
  style?: CSSProperties;
}>(function LayoutIndicatorRowCard({
  className,
  dragging = false,
  indicatorId,
  onAxisSideChange,
  onDelete,
  settings,
  style,
  ...props
}, ref) {
  const IndicatorIcon = INDICATOR_ICONS[indicatorId];

  return (
    <div
      ref={ref}
      aria-label={`Drag ${indicatorLabel(indicatorId)}`}
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
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{indicatorLabel(indicatorId)}</span>
      <Select
        value={settings[indicatorId].axisSide}
        onValueChange={(value) => onAxisSideChange?.(indicatorId, value as TradingChartIndicatorAxisSide)}
      >
        <SelectTrigger aria-label={`${indicatorLabel(indicatorId)} axis side`} className="h-9 min-w-36 rounded-[0.9rem] bg-white px-3 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end" className="rounded-[1rem] border-border/70 bg-[#fdfaf6]">
          <SelectItem value="left">Left y-axis</SelectItem>
          <SelectItem value="right">Right y-axis</SelectItem>
        </SelectContent>
      </Select>
      <Button
        aria-label={`Delete ${indicatorLabel(indicatorId)}`}
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
  settings,
  onAxisSideChange,
  onDelete,
}: {
  indicatorId: TradingChartIndicatorId;
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
  pane,
  settings,
  onAxisSideChange,
  onDelete,
}: {
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
          {layoutPaneLabel(pane.id)}
        </p>
      </div>
      <SortableContext items={pane.indicatorIds.map(layoutRowId)} strategy={verticalListSortingStrategy}>
        <div className="grid gap-3">
          {pane.indicatorIds.map((indicatorId) => (
            <LayoutIndicatorRow
              key={indicatorId}
              indicatorId={indicatorId}
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

function LayoutNewPaneDropZone() {
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
      <span>New pane</span>
    </div>
  );
}

function indicatorLabel(id: TradingChartIndicatorId) {
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
      return 'Demand';
    case 'receipts':
      return 'Receipts';
    case 'pipeline':
      return 'Pipeline';
    case 'price':
      return 'Price';
    case 'regime':
      return 'Regime';
  }
}

function indicatorDescription(id: TradingChartIndicatorId) {
  switch (id) {
    case 'demand':
      return 'Expected service and retail demand for each interval.';
    case 'inventory':
      return 'Projected on-hand inventory across the loaded intervals.';
    case 'pipeline':
      return 'In-transit units and ordered quantity moving toward stock.';
    case 'price':
      return 'Observed selling price when product price data is available.';
    case 'receipts':
      return 'Receipts and adjustments that increase or correct stock.';
    case 'regime':
      return 'Sales-pattern state markers such as stock-limited or spike intervals.';
    case 'reorderPoint':
      return 'Threshold where replenishment should be considered.';
    case 'safetyStock':
      return 'Buffer inventory intended to absorb variability.';
    case 'uncertainty':
      return 'Upper and lower inventory uncertainty around the main forecast.';
  }
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

function constantLineData(points: TradingChartPoint[], selector: (point: TradingChartPoint) => number | null) {
  return lineData(points, selector);
}

function setSeriesData(
  series: ChartSeriesRefs,
  chartModel: TradingChartModel,
  settings: TradingChartIndicatorSettings,
) {
  series.inventory?.setData(lineData(chartModel.points, (point) => point.inventoryMean));
  series.uncertaintyLow?.setData(lineData(chartModel.points, (point) => point.inventoryLow));
  series.uncertaintyHigh?.setData(lineData(chartModel.points, (point) => point.inventoryHigh));
  series.reorderPoint?.setData(constantLineData(chartModel.points, (point) => point.reorderPoint));
  series.safetyStock?.setData(constantLineData(chartModel.points, (point) => point.safetyStock));
  series.demand?.setData(histogramData(
    chartModel.points,
    (point) => {
      if (point.serviceDemandMean == null && point.retailDemandMean == null) {
        return null;
      }
      return -((point.serviceDemandMean ?? 0) + (point.retailDemandMean ?? 0));
    },
    histogramSeriesColor(settings.demand.color, settings.demand.opacity ?? 0.5, settings.demand.plotStyle),
  ));
  series.receipts?.setData(histogramData(
    chartModel.points,
    (point) => {
      if (point.receiptsMean == null && point.adjustmentsMean == null) {
        return null;
      }
      return (point.receiptsMean ?? 0) + (point.adjustmentsMean ?? 0);
    },
    histogramSeriesColor(settings.receipts.color, settings.receipts.opacity ?? 0.5, settings.receipts.plotStyle),
  ));
  series.pipeline?.setData(histogramData(
    chartModel.points,
    (point) => point.inTransitMean,
    histogramSeriesColor(settings.pipeline.color, settings.pipeline.opacity ?? 0.45, settings.pipeline.plotStyle),
  ));
  series.price?.setData(lineData(chartModel.points, (point) => point.price));
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
    let value = 'No data';
    if (point) {
      if (id === 'inventory') {
        value = formatValue(point.inventoryMean, 'u', setting.precision);
      } else if (id === 'uncertainty') {
        value = point.inventoryLow == null || point.inventoryHigh == null
          ? 'No data'
          : `${formatValue(point.inventoryLow, 'u', setting.precision)} - ${formatValue(point.inventoryHigh, 'u', setting.precision)}`;
      } else if (id === 'reorderPoint') {
        value = formatValue(point.reorderPoint, 'u', setting.precision);
      } else if (id === 'safetyStock') {
        value = formatValue(point.safetyStock, 'u', setting.precision);
      } else if (id === 'demand') {
        const totalDemand = (point.serviceDemandMean ?? 0) + (point.retailDemandMean ?? 0);
        value = point.serviceDemandMean == null && point.retailDemandMean == null ? 'No data' : formatValue(totalDemand, 'u', setting.precision);
      } else if (id === 'receipts') {
        value = point.receiptsMean == null && point.adjustmentsMean == null
          ? 'No data'
          : `${formatValue(point.receiptsMean ?? 0, 'u', setting.precision)} / ${formatValue(point.adjustmentsMean ?? 0, 'u', setting.precision)} adj`;
      } else if (id === 'pipeline') {
        value = point.inTransitMean == null
          ? 'No data'
          : `${formatValue(point.inTransitMean, 'u', setting.precision)} in transit, ${formatValue(point.orderQuantityMean, 'u', setting.precision)} ordered`;
      } else if (id === 'price') {
        value = formatValue(point.price, '', setting.precision);
      } else if (id === 'regime') {
        value = point.dominantRegime ? translateRegimeLabel(language, point.dominantRegime) : 'No data';
      }
    }
    return [{
      id,
      label: indicatorLabel(id),
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
  open,
  onApply,
  onDiscard,
  onKeepEditing,
}: {
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
        aria-label="Apply chart changes"
        aria-modal="true"
        className="w-full max-w-md rounded-[1.5rem] border border-border/70 bg-background p-6 shadow-[0_24px_80px_rgba(0,0,0,0.18)]"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="grid gap-2">
          <p className="text-lg font-semibold tracking-[-0.03em] text-foreground">Apply chart changes?</p>
          <p className="text-sm leading-6 text-muted-foreground">
            You have staged chart setting changes. Apply them before leaving, discard them, or keep editing.
          </p>
        </div>
        <div className="mt-6 flex items-center justify-end gap-2">
          <Button className="h-11 px-4" type="button" variant="ghost" onClick={onKeepEditing}>
            Keep editing
          </Button>
          <Button className="h-11 px-4" type="button" variant="destructive-outline" onClick={onDiscard}>
            Discard changes
          </Button>
          <Button className="h-11 px-4" type="button" onClick={onApply}>
            Apply changes
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

function layoutPaneLabel(paneId: string) {
  return paneId === TRADING_CHART_MAIN_PANE_ID ? 'Main' : 'Pane';
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
      case 'receipts':
        return point.receiptsMean != null || point.adjustmentsMean != null;
      case 'pipeline':
        return point.inTransitMean != null;
      case 'price':
        return point.price != null;
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
  hasOlderIntervals: boolean;
  isBusy: boolean;
  isLoadingOlderIntervals: boolean;
  loadOlderIntervals: (limit?: number) => Promise<unknown>;
  onOlderLoadProgressChange?: (progress: { current: number; total: number } | null) => void;
  onReset: () => void;
  onSelectInterval: (index: number) => void;
  onTimeframeChange: (value: ChartTimeframe) => void;
  onSaveDefaultIndicatorSettings: (settings: TradingChartIndicatorSettings) => void;
  selectedIntervalIndex: number | null;
  defaultIndicatorSettings: TradingChartIndicatorSettings;
  setIndicatorSettings: Dispatch<SetStateAction<TradingChartIndicatorSettings>>;
  indicatorSettings: TradingChartIndicatorSettings;
  timeframe: ChartTimeframe;
}

export function SkuTradingChart({
  chartModel,
  chartZoomResetToken,
  hasOlderIntervals,
  isBusy,
  isLoadingOlderIntervals,
  loadOlderIntervals,
  onOlderLoadProgressChange,
  onReset,
  onSelectInterval,
  onSaveDefaultIndicatorSettings,
  onTimeframeChange,
  selectedIntervalIndex,
  defaultIndicatorSettings,
  setIndicatorSettings,
  indicatorSettings,
  timeframe,
}: SkuTradingChartProps) {
  const { language } = usePreferences();
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRefs = useRef<AnySeries[]>([]);
  const chartSeriesRefs = useRef<ChartSeriesRefs>({});
  const loadingOlderRef = useRef(false);
  const previousChartPointsRef = useRef<TradingChartPoint[]>([]);
  const previousTimeframeRef = useRef<ChartTimeframe | null>(null);
  const previousSelectedIntervalRef = useRef<number | null>(null);
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
  const activeAdditionalPaneCountRef = useRef(0);
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
  const [regimeIconPositions, setRegimeIconPositions] = useState<Map<number, number>>(() => new Map());
  const [paneLegendPositions, setPaneLegendPositions] = useState<Array<{ top: number; height: number }>>([]);
  const [plotAreaWidth, setPlotAreaWidth] = useState(0);
  const [uncertaintyBandPath, setUncertaintyBandPath] = useState('');
  const [activeLayoutRowId, setActiveLayoutRowId] = useState<string | null>(null);
  const activeLayoutIndicatorId = activeLayoutRowId ? layoutIndicatorIdFromRowId(activeLayoutRowId) : null;
  const draftEditableIndicatorSettings =
    draftIndicatorSettings ?? draftIndicatorsDialogSettings ?? draftLayoutIndicatorSettings ?? indicatorSettings;
  const editableIndicatorSettings = useMemo(
    () => normalizeTradingChartIndicatorSettings(draftEditableIndicatorSettings),
    [draftEditableIndicatorSettings],
  );
  const paneLayout = useMemo(
    () => deriveTradingChartPaneLayout(editableIndicatorSettings, chartModel.availability),
    [chartModel.availability, editableIndicatorSettings],
  );
  const activeAdditionalPaneCount = Math.max(0, paneLayout.length - 1);
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
  const regimePaneIndex = Math.max(0, paneLayout.findIndex((pane) => pane.indicatorIds.includes('regime')));
  const regimePanePosition = paneLegendPositions[regimePaneIndex];
  const regimePaneTop = regimePanePosition?.top ?? 0;
  const regimePaneHeight = regimePanePosition?.height ?? 0;
  const hasMeasuredRegimePane = regimePaneHeight > 0;
  const seriesLayoutKey = useMemo(() => JSON.stringify({
    availability: indicatorAvailabilityKey(chartModel.availability),
    settings: editableIndicatorSettings,
    reorderPoint: chartModel.points.find((point) => point.reorderPoint != null)?.reorderPoint ?? null,
    safetyStock: chartModel.points.find((point) => point.safetyStock != null)?.safetyStock ?? null,
  }), [chartModel.availability, chartModel.points, editableIndicatorSettings]);
  const visibleRegimePoints = useMemo(
    () => (
      regimeIndicatorEnabled && (showRegimeIcons || showRegimeBackground)
        ? chartModel.points.filter((point) => point.dominantRegime)
        : []
    ),
    [chartModel.points, regimeIndicatorEnabled, showRegimeBackground, showRegimeIcons],
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

  function schedulePaneHeightSync() {
    if (paneHeightUpdateFrameRef.current != null) {
      cancelAnimationFrame(paneHeightUpdateFrameRef.current);
    }
    paneHeightUpdateFrameRef.current = requestAnimationFrame(() => {
      paneHeightUpdateFrameRef.current = requestAnimationFrame(() => {
        paneHeightUpdateFrameRef.current = null;
        const minimumRenderHeight = deriveTradingChartMinRenderHeight(activeAdditionalPaneCountRef.current);
        applyPaneHeights(
          chartRef.current,
          Math.max(minimumRenderHeight, chartContainerRef.current?.clientHeight || minimumRenderHeight),
          activeAdditionalPaneCountRef.current,
        );
        setPaneLegendPositions(paneLegendAnchors(chartRef.current));
        syncPlotAreaWidth();
      });
    });
  }

  function syncPlotAreaWidth() {
    const chart = chartRef.current;
    const container = chartContainerRef.current;
    const nextWidth = Math.max(0, Math.floor(chart?.timeScale().width?.() ?? container?.clientWidth ?? 0));
    setPlotAreaWidth((current) => (Math.abs(current - nextWidth) < 1 ? current : nextWidth));
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
  const clusteredRegimeIcons = useMemo(() => {
    const positionedPoints = visibleRegimePoints
      .map((point) => ({
        point,
        x: regimeIconPositions.get(point.intervalIndex),
      }))
      .filter((entry): entry is { point: TradingChartPoint; x: number } => entry.x != null)
      .sort((left, right) => left.point.intervalIndex - right.point.intervalIndex);

    const clusters: Array<{
      dominantRegime: string;
      count: number;
      firstIntervalIndex: number;
      lastIntervalIndex: number;
      left: number;
      right: number;
      center: number;
    }> = [];

    for (const entry of positionedPoints) {
      const regime = entry.point.dominantRegime;
      if (!regime) {
        continue;
      }

      const iconLeft = entry.x - REGIME_ICON_SIZE / 2;
      const iconRight = entry.x + REGIME_ICON_SIZE / 2;
      const previous = clusters.at(-1);
      const overlapsPrevious =
        previous &&
        previous.dominantRegime === regime &&
        iconLeft <= previous.right + REGIME_CLUSTER_GAP;

      if (overlapsPrevious) {
        previous.lastIntervalIndex = entry.point.intervalIndex;
        previous.count += 1;
        previous.left = Math.min(previous.left, iconLeft);
        previous.right = Math.max(previous.right, iconRight);
        previous.center = (previous.left + previous.right) / 2;
        continue;
      }

      clusters.push({
        dominantRegime: regime,
        count: 1,
        firstIntervalIndex: entry.point.intervalIndex,
        lastIntervalIndex: entry.point.intervalIndex,
        left: iconLeft,
        right: iconRight,
        center: entry.x,
      });
    }

    return clusters;
  }, [regimeIconPositions, visibleRegimePoints]);
  const regimeBackgroundBands = useMemo(() => {
    if (!showRegimeBackground) {
      return [];
    }
    const positionedPoints = visibleRegimePoints
      .map((point) => ({
        point,
        x: regimeIconPositions.get(point.intervalIndex),
      }))
      .filter((entry): entry is { point: TradingChartPoint; x: number } => entry.x != null)
      .sort((left, right) => left.point.intervalIndex - right.point.intervalIndex);
    if (positionedPoints.length === 0) {
      return [];
    }
    const width = plotAreaWidth || chartContainerRef.current?.clientWidth || 0;
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
  }, [plotAreaWidth, regimeIconPositions, showRegimeBackground, visibleRegimePoints]);

  useEffect(() => {
    activeAdditionalPaneCountRef.current = activeAdditionalPaneCount;
    schedulePaneHeightSync();
  }, [activeAdditionalPaneCount]);

  useEffect(() => {
    const chart = chartRef.current;
    const container = chartContainerRef.current;
    if (!chart || !container) {
      setPaneLegendPositions([]);
      return;
    }

    const updatePaneLegendPositions = () => {
      setPaneLegendPositions(paneLegendAnchors(chart));
      syncPlotAreaWidth();
    };

    updatePaneLegendPositions();
    const stopObservingLayout = observeChartLayout(container, updatePaneLegendPositions);
    chart.timeScale().subscribeVisibleLogicalRangeChange(updatePaneLegendPositions);
    return () => {
      stopObservingLayout();
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(updatePaneLegendPositions);
    };
  }, [activeAdditionalPaneCount, seriesLayoutKey]);

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

    const syncChartRenderSize = () => {
      schedulePaneHeightSync();
      syncPlotAreaWidth();
    };
    syncChartRenderSize();
    const resizeObserver = new ResizeObserver(syncChartRenderSize);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRefs.current = [];
      chartSeriesRefs.current = {};
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
  }, [timeframe]);

  useEffect(() => {
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

    for (const pane of paneLayout) {
      const paneIndex = paneIndexById.get(pane.id) ?? 0;
      for (const indicatorId of pane.indicatorIds) {
        const setting = editableIndicatorSettings[indicatorId];
        const priceScaleId = setting.axisSide;
        if (indicatorId === 'inventory') {
          const inventorySeries = setting.plotStyle === 'line'
            ? chart.addSeries(LineSeries, {
              priceScaleId,
              color: setting.color,
              lineStyle: lineStyleValue(setting.lineStyle),
              lineWidth: (setting.lineWidth ?? 2) as 2,
              priceLineVisible: false,
              lastValueVisible: setting.showPriceScaleLabel ?? true,
            }, paneIndex)
            : chart.addSeries(AreaSeries, {
              priceScaleId,
              lineColor: setting.color,
              lineStyle: lineStyleValue(setting.lineStyle),
              lineWidth: (setting.lineWidth ?? 2) as 2,
              topColor: rgba(setting.color, 0.22),
              bottomColor: rgba(setting.color, 0.03),
              priceLineVisible: false,
              lastValueVisible: setting.showPriceScaleLabel ?? true,
            }, paneIndex);
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
        if (indicatorId === 'demand' || indicatorId === 'receipts' || indicatorId === 'pipeline') {
          const opacity = indicatorId === 'pipeline' ? setting.opacity ?? 0.45 : setting.opacity ?? 0.5;
          const histogramSeries = chart.addSeries(HistogramSeries, {
            color: histogramSeriesColor(setting.color, opacity, setting.plotStyle),
            priceScaleId,
            priceLineVisible: false,
            lastValueVisible: setting.showPriceScaleLabel ?? false,
            base: 0,
            priceFormat: { type: 'volume' },
            ...(setting.plotStyle === 'columns' ? { lastValueVisible: setting.showPriceScaleLabel ?? false } : {}),
          }, paneIndex);
          registerSeries(paneIndex, histogramSeries);
          chartSeriesRefs.current[indicatorId] = histogramSeries;
          registerSide(paneIndex, setting.axisSide);
          continue;
        }
        if (indicatorId === 'price') {
          const priceSeries = setting.plotStyle === 'area'
            ? chart.addSeries(AreaSeries, {
              lineColor: setting.color,
              lineStyle: lineStyleValue(setting.lineStyle),
              lineWidth: (setting.lineWidth ?? 2) as 2,
              topColor: rgba(setting.color, 0.2),
              bottomColor: rgba(setting.color, 0.03),
              priceScaleId,
              priceLineVisible: false,
              lastValueVisible: setting.showPriceScaleLabel ?? true,
            }, paneIndex)
            : chart.addSeries(LineSeries, {
              color: setting.color,
              lineStyle: lineStyleValue(setting.lineStyle),
              lineWidth: (setting.lineWidth ?? 2) as 2,
              priceScaleId,
              priceLineVisible: false,
              lastValueVisible: setting.showPriceScaleLabel ?? true,
            }, paneIndex);
          registerSeries(paneIndex, priceSeries);
          chartSeriesRefs.current.price = priceSeries;
          registerSide(paneIndex, setting.axisSide);
        }
      }
      if (pane.indicatorIds.includes('regime') && !panesWithSeries.has(paneIndex)) {
        const anchorSeries = chart.addSeries(LineSeries, {
          color: 'rgba(0,0,0,0)',
          crosshairMarkerVisible: false,
          lastValueVisible: false,
          priceLineVisible: false,
          priceScaleId: 'right',
        }, paneIndex);
        anchorSeries.setData([]);
        registerSeries(paneIndex, anchorSeries);
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
    schedulePaneHeightSync();
  }, [paneIndexById, paneLayout, seriesLayoutKey]);

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
    const shouldFitTimeframe = previousTimeframe !== timeframe || !visibleRange || (timeframeRangeLockRef.current && !isBusy);
    const nextVisibleRange = shouldFitTimeframe ? visibleRangeForTimeframe(chartModel, timeframe) : null;
    if (nextVisibleRange && !logicalRangesAreClose(nextVisibleRange, visibleRange)) {
      chart.timeScale().setVisibleLogicalRange(nextVisibleRange);
    }
    if (timeframeRangeLockRef.current && !isBusy) {
      timeframeRangeLockRef.current = false;
    }
    previousChartPointsRef.current = chartModel.points;
    previousTimeframeRef.current = timeframe;
  }, [chartModel, editableIndicatorSettings, isBusy, timeframe]);

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
        const yHigh = uncertaintyHighSeries.priceToCoordinate(point.inventoryHigh);
        const yLow = uncertaintyLowSeries.priceToCoordinate(point.inventoryLow);
        if (x == null || yHigh == null || yLow == null) {
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
    const stopObservingLayout = observeChartLayout(container, scheduleUncertaintyBandPathUpdate);
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
    const chart = chartRef.current;
    if (!chart) {
      return;
    }
    const handleRangeChange = (range: { from: number; to: number } | null) => {
      if (!range || !hasOlderIntervals || isBusy || isLoadingOlderIntervals || loadingOlderRef.current) {
        return;
      }
      if (range.from > olderLoadThreshold(range)) {
        return;
      }
      loadingOlderRef.current = true;
      onOlderLoadProgressChange?.({ current: 1, total: 1 });
      void loadOlderIntervals()
        .catch(() => null)
        .finally(() => {
          loadingOlderRef.current = false;
          onOlderLoadProgressChange?.(null);
        });
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(handleRangeChange);
    return () => chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleRangeChange);
  }, [hasOlderIntervals, isBusy, isLoadingOlderIntervals, loadOlderIntervals, onOlderLoadProgressChange]);

  useEffect(() => {
    const range = visibleRangeForTimeframe(chartModel, timeframe);
    const chart = chartRef.current;
    if (!range || !chart || appliedChartZoomResetTokenRef.current === chartZoomResetToken) {
      return;
    }
    chart.timeScale().setVisibleLogicalRange(range);
    appliedChartZoomResetTokenRef.current = chartZoomResetToken;
    setHoveredTime(null);
  }, [chartModel, chartZoomResetToken, timeframe]);

  useEffect(() => {
    const chart = chartRef.current;
    if (selectedIntervalIndex == null) {
      previousSelectedIntervalRef.current = null;
      return;
    }
    if (!chart) {
      return;
    }
    if (previousSelectedIntervalRef.current === selectedIntervalIndex) {
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
    chart.timeScale().setVisibleLogicalRange({
      from: Math.max(0, numericIndex - 8),
      to: numericIndex + 8,
    });
  }, [chartModel, selectedIntervalIndex]);

  useEffect(() => {
    const chart = chartRef.current;
    const container = chartContainerRef.current;
    if (!chart || !container || visibleRegimePoints.length === 0) {
      setRegimeIconPositions(new Map());
      return;
    }

    const updateRegimeIconPositions = () => {
      const nextPositions = new Map<number, number>();
      const clipWidth = plotAreaWidth || container.clientWidth;
      for (const point of visibleRegimePoints) {
        const coordinate = chart.timeScale().timeToCoordinate(point.time);
        if (coordinate == null || coordinate < -clipWidth || coordinate > clipWidth * 2) {
          continue;
        }
        nextPositions.set(point.intervalIndex, coordinate);
      }
      syncPlotAreaWidth();
      setRegimeIconPositions(nextPositions);
    };

    updateRegimeIconPositions();
    const stopObservingLayout = observeChartLayout(container, updateRegimeIconPositions);
    chart.timeScale().subscribeVisibleLogicalRangeChange(updateRegimeIconPositions);
    return () => {
      stopObservingLayout();
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(updateRegimeIconPositions);
    };
  }, [plotAreaWidth, visibleRegimePoints]);

  function updateDraftIndicator(id: TradingChartIndicatorId, patch: Partial<TradingChartIndicatorSettings[TradingChartIndicatorId]>) {
    setDraftIndicatorSettings((current) => {
      const base = current ?? structuredClone(indicatorSettings);
      return {
        ...base,
        [id]: {
          ...base[id],
          ...patch,
        },
      };
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
  const plottedIndicatorIds = useMemo(
    () => INDICATOR_ORDER.filter((id) => editableIndicatorSettings[id].enabled && chartModel.availability[id] && hasRenderedIndicatorData(chartModel, id)),
    [chartModel, editableIndicatorSettings],
  );
  const stylePopoverSetting = stylePopover ? editableIndicatorSettings[stylePopover.indicatorId] : null;
  const stylePopoverWidth = 304;
  const stylePopoverHeight = stylePopover?.kind === 'color' ? 520 : 260;
  const stylePopoverPortal = stylePopover && stylePopoverAnchorRect && stylePopoverSetting
    ? createPortal(
      <div
        ref={activeStylePopoverRef}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        className={cn(
          'fixed z-[90] overscroll-contain border border-border/70 bg-[#fdfaf6] shadow-[0_24px_60px_rgba(48,31,20,0.16)]',
          stylePopover.kind === 'color'
            ? 'grid w-[min(19rem,calc(100vw-2rem))] max-h-[min(32.5rem,calc(100vh-2rem))] gap-3 overflow-y-auto rounded-[1.25rem] p-4'
            : 'grid w-72 max-h-[min(20rem,calc(100vh-4rem))] overflow-y-auto rounded-[1.5rem]',
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
                      aria-label={`Use color ${color}`}
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
                <p className="text-xs font-medium text-foreground">Thickness</p>
                <div className={cn(SETTINGS_SEGMENTED_CLASS, 'grid grid-cols-4')}>
                  {LINE_WIDTH_OPTIONS.map((option) => (
                    <button
                      key={option}
                      aria-pressed={(stylePopoverSetting.lineWidth ?? 1) === option}
                      aria-label={`Use line width ${option}`}
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
                <p className="text-xs font-medium text-foreground">Line type</p>
                <div className={cn(SETTINGS_SEGMENTED_CLASS, 'grid grid-cols-3')}>
                  {LINE_STYLE_OPTIONS.map((option) => (
                    <button
                      key={option}
                      aria-pressed={(stylePopoverSetting.lineStyle ?? 'solid') === option}
                      aria-label={`Use line type ${option}`}
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
            <button
              key={option}
              aria-pressed={stylePopoverSetting.plotStyle === option}
              className={cn(
                'flex items-center justify-between px-5 py-4 text-left text-base transition-colors',
                stylePopoverSetting.plotStyle === option ? 'bg-[color:var(--indicator-accent)] text-background' : 'text-foreground hover:bg-white/80',
              )}
              style={{ ['--indicator-accent' as string]: SETTINGS_PANEL_ACCENT }}
              type="button"
              onClick={() => updateDraftIndicator(stylePopover.indicatorId, { plotStyle: option })}
            >
              <span>{plotStyleLabel(option)}</span>
            </button>
          ))
        )}
      </div>,
      document.body,
    )
    : null;
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
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
                <span>Settings</span>
              </Button>
            </DialogPrimitive.Trigger>
            <DialogPrimitive.Portal>
              <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-transparent data-[state=open]:animate-in data-[state=open]:fade-in-0" />
              <DialogPrimitive.Content
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
                <DialogPrimitive.Title className="sr-only">Chart indicator settings</DialogPrimitive.Title>
                <DialogPrimitive.Description className="sr-only">
                  Configure chart indicator styles, output values, and input values.
                </DialogPrimitive.Description>
                <div
                  className={SETTINGS_DIALOG_HEADER_CLASS}
                  onPointerDown={startSettingsDrag}
                >
                  <div>
                    <p className="text-[1.75rem] font-semibold text-foreground">Chart Settings</p>
                    <p className="mt-2 text-sm text-muted-foreground">Style, output values, and input values</p>
                  </div>
                  <button
                    aria-label="Close settings"
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
                            <p className="text-base font-semibold text-foreground">{indicatorLabel(id)}</p>
                            <div className="relative">
                              <button
                                aria-label={`${indicatorLabel(id)} color`}
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
                                aria-label={`${indicatorLabel(id)} plot style`}
                                className={SETTINGS_ICON_CONTROL_CLASS}
                                ref={stylePopover?.indicatorId === id && stylePopover.kind === 'plotStyle' ? activeStyleTriggerRef : null}
                                type="button"
                                onClick={() => setStylePopover((current) => current?.indicatorId === id && current.kind === 'plotStyle' ? null : { indicatorId: id, kind: 'plotStyle' })}
                              >
                                <span className="text-xl leading-none">~</span>
                              </button>
                            </div>
                          </div>
                          <div className="grid gap-4">
                            <div className="grid gap-4">
                              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Output Values</p>
                              <div className="flex flex-wrap items-center gap-4">
                                <label className="text-sm font-medium text-foreground" htmlFor={`indicator-precision-${id}`}>Precision</label>
                                <Select
                                  value={setting.precision ?? 'default'}
                                  onOpenChange={setSettingsSelectOpen}
                                  onValueChange={(value) => updateDraftIndicator(id, { precision: value as TradingChartIndicatorPrecision })}
                                >
                                  <SelectTrigger
                                    id={`indicator-precision-${id}`}
                                    aria-label={`${indicatorLabel(id)} precision`}
                                    className={cn(SETTINGS_INPUT_CLASS, 'w-full max-w-40 px-4')}
                                  >
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="overscroll-contain">
                                    <SelectGroup>
                                      {PRECISION_OPTIONS.map((option) => (
                                        <SelectItem key={option} value={option}>{precisionLabel(option)}</SelectItem>
                                      ))}
                                    </SelectGroup>
                                  </SelectContent>
                                </Select>
                              </div>
                              <label className="inline-flex items-center gap-3 text-sm font-medium text-foreground">
                                <Checkbox
                                  aria-label={`${indicatorLabel(id)} labels on price scale`}
                                  checked={setting.showPriceScaleLabel ?? false}
                                  onCheckedChange={(checked) => updateDraftIndicator(id, { showPriceScaleLabel: checked === true })}
                                />
                                <span>Labels on price scale</span>
                              </label>
                              <label className="inline-flex items-center gap-3 text-sm font-medium text-foreground">
                                <Checkbox
                                  aria-label={`${indicatorLabel(id)} values in status line`}
                                  checked={setting.showStatusLineValue ?? true}
                                  onCheckedChange={(checked) => updateDraftIndicator(id, { showStatusLineValue: checked === true })}
                                />
                                <span>Values in status line</span>
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
                    <SelectTrigger aria-label="Default settings menu" className="h-11 min-w-36 rounded-[1rem] bg-[#fffaf3] px-4 text-sm font-medium">
                      <SelectValue placeholder="Default" />
                    </SelectTrigger>
                    <SelectContent align="start" className="overscroll-contain rounded-[1rem] border-border/70 bg-[#fdfaf6]">
                      <SelectGroup>
                        <SelectItem value="reset">Reset settings</SelectItem>
                        <SelectItem value="save">Save as Default</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-3">
                    <Button
                      className="h-11 rounded-[1rem] px-5"
                      type="button"
                      variant="outline"
                      onClick={() => requestSettingsDialogLeave('settings', leaveSettingsDialog)}
                    >
                      Cancel
                    </Button>
                    <Button
                      className="h-11 rounded-[1rem] px-5"
                      type="button"
                      onClick={() => {
                        if (draftIndicatorSettings) {
                          setIndicatorSettings(draftIndicatorSettings);
                        }
                        leaveSettingsDialog();
                      }}
                    >
                      Ok
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
                <span>Indicators</span>
              </Button>
            </DialogPrimitive.Trigger>
            <DialogPrimitive.Portal>
              <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-transparent data-[state=open]:animate-in data-[state=open]:fade-in-0" />
              <DialogPrimitive.Content
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
                <DialogPrimitive.Title className="sr-only">Chart indicators</DialogPrimitive.Title>
                <DialogPrimitive.Description className="sr-only">
                  Select which indicators are shown on the chart.
                </DialogPrimitive.Description>
                <div
                  className={SETTINGS_DIALOG_HEADER_CLASS}
                  onPointerDown={startSettingsDrag}
                >
                  <div>
                    <p className="text-[1.75rem] font-semibold text-foreground">Indicators</p>
                    <p className="mt-2 text-sm text-muted-foreground">Choose which indicators appear on the chart.</p>
                  </div>
                  <button
                    aria-label="Close indicators"
                    className="rounded-full p-2.5 text-foreground transition-colors hover:bg-white/80"
                    type="button"
                    onClick={() => requestSettingsDialogLeave('indicators', leaveIndicatorsDialog)}
                  >
                    <ActionCloseIcon className="size-5" />
                  </button>
                </div>
                <div className={settingsDialogBodyClassName(false)}>
                  <div className="grid gap-6">
                    {INDICATOR_SECTIONS.map((section) => (
                      <section key={section.title} className="grid gap-3">
                        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{section.title}</p>
                        <div className="grid gap-0">
                          {section.ids.map((id) => {
                            const setting = draftIndicatorsDialogSettings?.[id] ?? indicatorSettings[id];
                            const available = chartModel.availability[id];
                            const disabled = !available;
                            const IndicatorIcon = INDICATOR_ICONS[id];
                            return (
                              <div key={id} className="border-b border-border/50 py-4 first:pt-0 last:border-b-0 last:pb-0">
                                <label className={cn('flex items-start gap-3 text-sm text-foreground', disabled && 'opacity-55')}>
                                  <Checkbox
                                    aria-label={`Show ${indicatorLabel(id)}`}
                                    className="mt-0.5"
                                    checked={setting.enabled && available}
                                    disabled={disabled}
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
                                  <IndicatorIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                                  <span className="grid gap-1">
                                    <span className="font-medium">{indicatorLabel(id)}</span>
                                    <span className="text-sm leading-5 text-muted-foreground">
                                      {!available ? 'Unavailable for the current chart data.' : indicatorDescription(id)}
                                    </span>
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
                      className="h-11 rounded-[1rem] px-5"
                      type="button"
                      variant="outline"
                      onClick={() => requestSettingsDialogLeave('indicators', leaveIndicatorsDialog)}
                    >
                      Cancel
                    </Button>
                    <Button
                      className="h-11 rounded-[1rem] px-5"
                      type="button"
                      onClick={() => {
                        if (draftIndicatorsDialogSettings) {
                          setIndicatorSettings(draftIndicatorsDialogSettings);
                        }
                        leaveIndicatorsDialog();
                      }}
                    >
                      Ok
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
                <span>Layout</span>
              </Button>
            </DialogPrimitive.Trigger>
            <DialogPrimitive.Portal>
              <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-transparent data-[state=open]:animate-in data-[state=open]:fade-in-0" />
              <DialogPrimitive.Content
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
                <DialogPrimitive.Title className="sr-only">Chart layout</DialogPrimitive.Title>
                <DialogPrimitive.Description className="sr-only">
                  Arrange pane membership, axis side, and render order for chart indicators.
                </DialogPrimitive.Description>
                <div
                  className={SETTINGS_DIALOG_HEADER_CLASS}
                  onPointerDown={startSettingsDrag}
                >
                  <div>
                    <p className="text-[1.75rem] font-semibold text-foreground">Layout</p>
                    <p className="mt-2 text-sm text-muted-foreground">Move indicators between panes, change axis side, and remove rows from chart.</p>
                  </div>
                  <button
                    aria-label="Close layout"
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
                          pane={pane}
                          settings={editableIndicatorSettings}
                          onAxisSideChange={(indicatorId, axisSide) => updateDraftLayoutIndicator(indicatorId, { axisSide })}
                          onDelete={deleteLayoutIndicator}
                        />
                      ))}
                      <LayoutNewPaneDropZone />
                    </div>
                    {typeof document !== 'undefined'
                      ? createPortal(
                          <DragOverlay dropAnimation={LAYOUT_DROP_ANIMATION}>
                            {activeLayoutIndicatorId ? (
                              <LayoutIndicatorRowCard
                                dragging
                                indicatorId={activeLayoutIndicatorId}
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
                    {activeLayoutRowId ? 'Drop on a pane or New pane.' : 'Drag rows to reorder their pane and draw layer.'}
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      className="h-11 rounded-[1rem] px-5"
                      type="button"
                      variant="outline"
                      onClick={() => requestSettingsDialogLeave('layout', leaveLayoutDialog)}
                    >
                      Cancel
                    </Button>
                    <Button
                      className="h-11 rounded-[1rem] px-5"
                      type="button"
                      onClick={() => {
                        if (draftLayoutIndicatorSettings) {
                          setIndicatorSettings(normalizeTradingChartIndicatorSettings(draftLayoutIndicatorSettings));
                        }
                        leaveLayoutDialog();
                      }}
                    >
                      Ok
                    </Button>
                  </div>
                </div>
              </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
          </DialogPrimitive.Root>
          <Button className="gap-2" disabled={isBusy} size="sm" type="button" variant="outline" onClick={onReset}>
            <ActionResetIcon aria-hidden="true" className="size-4" />
            <span>Reset chart</span>
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">{legendPoint ? intervalTooltipLabel(legendPoint.endAt ?? legendPoint.startAt, legendPoint.intervalIndex, language) : 'No interval selected'}</p>
      </div>

      <div
        className={cn(
          'relative min-h-[420px] flex-1 overflow-hidden rounded-lg border border-border/70 bg-white transition-opacity duration-200 motion-reduce:transition-none',
          isBusy && 'opacity-45',
        )}
        data-busy={isBusy || undefined}
        style={{ minHeight: deriveTradingChartMinRenderHeight(activeAdditionalPaneCount) }}
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
              {(paneLegendGroups[0]?.rows ?? []).filter((row) => editableIndicatorSettings[row.id].showStatusLineValue !== false).map((row) => (
                <span key={row.id} className="inline-flex min-w-0 items-center gap-2 text-xs font-medium text-foreground">
                  <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: row.color }} />
                  <span>{row.label}</span>
                  {row.value ? <span className="text-muted-foreground">{row.value}</span> : null}
                </span>
              ))}
            </div>
            {paneLegendGroups.slice(1).map((group, index) => {
              const pane = paneLegendPositions[index + 1];
              const visibleRows = group.rows.filter((row) => editableIndicatorSettings[row.id].showStatusLineValue !== false);
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
            })}
            {hasMeasuredRegimePane && showRegimeIcons && clusteredRegimeIcons.length > 0 ? (
              <div
                aria-label="Sales pattern markers"
                className="pointer-events-none absolute left-0 z-10 overflow-hidden"
                style={{ top: regimePaneTop, width: plotAreaWidth || '100%', height: regimePaneHeight, bottom: 'auto' }}
              >
                {clusteredRegimeIcons.map((cluster) => {
                  const regimeKey = cluster.dominantRegime.toLowerCase();
                  const Icon = getRegimeIcon(cluster.dominantRegime);
                  const clusterWidth = Math.max(REGIME_ICON_SIZE, cluster.right - cluster.left);
                  const clustered = cluster.count > 1;
                  return (
                    <button
                      key={`${cluster.firstIntervalIndex}-${cluster.lastIntervalIndex}-${cluster.dominantRegime}`}
                      aria-label={`Select ${regimeClusterLabel(language, cluster.dominantRegime, cluster.count)}`}
                      className={cn(
                        'pointer-events-auto absolute flex h-7 items-center justify-center rounded-full border border-background/80 bg-background/92 text-foreground shadow-sm transition-transform hover:scale-105',
                        clustered ? 'px-2' : 'w-7 -translate-x-1/2',
                      )}
                      style={{
                        bottom: CHART_ICON_AXIS_OFFSET,
                        left: clustered ? cluster.left : cluster.center,
                        width: clustered ? clusterWidth : undefined,
                        color: REGIME_COLORS[regimeKey] ?? REGIME_COLORS.unknown,
                      }}
                      type="button"
                      onClick={() => onSelectInterval(cluster.lastIntervalIndex)}
                    >
                      <Icon aria-hidden="true" className="size-4" />
                      <span className="sr-only">{shortRegimeLabel(translateRegimeLabel(language, cluster.dominantRegime))}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </>
        ) : (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-6 text-center text-sm text-muted-foreground" data-testid="sku-trading-chart-empty">
            No chart intervals are available yet.
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
          className="relative z-[2] h-full min-h-[420px] w-full"
          data-testid="sku-trading-chart"
          style={{ minHeight: deriveTradingChartMinRenderHeight(activeAdditionalPaneCount) }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3" aria-label="Chart timeframe">
        {CHART_TIMEFRAME_OPTIONS.map((option) => (
          <button
            key={option}
            className={cn(
              'rounded-md px-3 py-2 text-sm font-semibold transition-colors',
              timeframe === option ? 'bg-foreground text-background' : 'text-foreground hover:bg-muted',
            )}
            type="button"
            onClick={() => {
              if (option !== timeframe) {
                onTimeframeChange(option);
              }
            }}
          >
            {option === 'MAX' ? 'All' : translateChartTimeframeLabel(language, option)}
          </button>
        ))}
      </div>
      {stylePopoverPortal}
      <ChartSettingsLeavePrompt
        open={pendingSettingsLeave != null}
        onApply={applyPendingSettingsLeave}
        onDiscard={discardPendingSettingsLeave}
        onKeepEditing={() => setPendingSettingsLeave(null)}
      />
    </div>
  );
}
