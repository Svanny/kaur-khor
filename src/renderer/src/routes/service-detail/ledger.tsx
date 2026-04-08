import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
  type UIEvent,
  type WheelEvent,
} from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { SenaServiceDetailPage } from '@shared/sena';
import type { ChartTimeframe } from '@/components/system/chart-timeframe';
import { LaneExpandButton, useChartWorkspace, useChartWorkspaceControls } from '@/components/system/chart-workspace';
import { PagedPanelNavigation } from '@/routes/detail-panels';
import { useDescriptionTextVisible } from '@/components/system/description-text';
import {
  deriveFreshMountIntervalScrollLeft,
  deriveInitialViewportSlotWidth,
  deriveSequentialOlderLoadBatchCount,
  handleIntervalChartWheel,
  INTERVAL_LOAD_BATCH_SIZE,
  INTERVAL_VISIBLE_COUNT,
  MAX_SLOT_WIDTH,
  MIN_SLOT_WIDTH,
} from '@/components/system/interval-strip';
import { cardFrameClassName, cardSurfaceClassName } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { usePreferences } from '@/state/preferences';
import {
  buildPointCoordinatesWithDomain,
  buildPolylineWithDomain,
  buildSparsePolylineSegments,
  ClampedChartDataLabel,
  deriveLabelGutterOffset,
  deriveExpandedChartVisualStyle,
  deriveProportionalChartGeometry,
} from '@/components/system/timeline-chart';
import {
  classifyWheelIntent,
  deriveAnchoredZoomScrollLeft,
  deriveAxisContentWidth,
  deriveSlotCenterX,
  isPinchZoomGesture,
} from '@/routes/sku-detail/ledger';
import { formatSenaCompactIntervalDate, formatSenaCompactIntervalDay, formatSenaDate, formatSenaLongDate, formatSenaWideIntervalDate } from '@/routes/sku-detail/format';
import { SectionLabel, SectionTitle } from '@/routes/sku-detail/section-heading';
import type { ServiceDetailViewModel, ServiceInspectorSelection } from './view-model';

const DEFAULT_SLOT_WIDTH = 72;
const INTERVAL_PILL_GAP = 0;
const SCROLL_EDGE_TOLERANCE = 6;
const AXIS_START_PADDING = 20;
const AXIS_END_PADDING = 36;
const LOAD_OLDER_SCROLL_THRESHOLD_PX = 24;
const LABEL_GUTTER_HEIGHT = 32;
const CHART_PLOT_HEIGHT = 120;
const CHART_VIEWBOX_HEIGHT = 42;
const FLOW_LABEL_GUTTER_HEIGHT = 64;
const FLOW_LANE_PLOT_HEIGHT = 112;
const FLOW_LINE_VIEWBOX_HEIGHT = 52;
const FLOW_LINE_TOP_PADDING = 6;
const FLOW_LINE_BOTTOM_PADDING = 6;
const LINE_POINT_MARKER_MIN_SLOT_WIDTH = 20;
const EXPANDED_LANE_HEADER_ALLOWANCE = 136;
const RESTORATION_PAGE_SIZE = 10;
const EXPANDED_LANE_HEIGHT_MULTIPLIER = 4;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function useObservedElementHeight(
  ref: RefObject<HTMLDivElement | null>,
  enabled: boolean,
) {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const node = ref.current;
    if (!node) {
      return;
    }
    const updateHeight = () => setHeight(node.offsetHeight);
    const observer = new ResizeObserver(updateHeight);
    observer.observe(node);
    updateHeight();
    return () => observer.disconnect();
  }, [enabled, ref]);

  return height;
}

function clampScrollLeft(scrollLeft: number, viewportWidth: number, contentWidth: number) {
  return clamp(scrollLeft, 0, Math.max(0, contentWidth - viewportWidth));
}

function shouldLoadOlderIntervals(hasOlder: boolean, isLoadingOlder: boolean, scrollLeft: number) {
  return hasOlder && !isLoadingOlder && scrollLeft <= LOAD_OLDER_SCROLL_THRESHOLD_PX;
}

function derivePrependedScrollLeft(currentScrollLeft: number, prependedCount: number, slotWidth: number) {
  return currentScrollLeft + prependedCount * (slotWidth + INTERVAL_PILL_GAP);
}

function normalizeRegimeKey(regime: string) {
  return regime.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function formatRegimeLabel(regime: string) {
  return regime
    .split(/[_\s-]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function regimeTint(regime: string, isSelected: boolean) {
  const key = normalizeRegimeKey(regime);
  const palette: Record<string, { selected: string; idle: string }> = {
    normal: {
      selected: 'rgba(244, 223, 207, 0.72)',
      idle: 'rgba(244, 223, 207, 0.48)',
    },
    promo: {
      selected: 'rgba(248, 224, 184, 0.78)',
      idle: 'rgba(248, 224, 184, 0.54)',
    },
    spike: {
      selected: 'rgba(245, 196, 176, 0.78)',
      idle: 'rgba(245, 196, 176, 0.5)',
    },
    lull: {
      selected: 'rgba(216, 232, 222, 0.74)',
      idle: 'rgba(216, 232, 222, 0.5)',
    },
    stockout_constrained: {
      selected: 'rgba(239, 192, 192, 0.8)',
      idle: 'rgba(239, 192, 192, 0.54)',
    },
    correction: {
      selected: 'rgba(207, 218, 234, 0.78)',
      idle: 'rgba(207, 218, 234, 0.52)',
    },
  };
  const resolved = palette[key] ?? palette.normal;
  return isSelected ? resolved.selected : resolved.idle;
}

const REGIME_LEGEND = [
  'normal',
  'promo',
  'spike',
  'lull',
  'stockout_constrained',
  'correction',
] as const;

function regimeLegendLabel(regime: (typeof REGIME_LEGEND)[number]) {
  if (regime === 'stockout_constrained') {
    return 'Stockout constrained regime';
  }
  return `${regime.charAt(0).toUpperCase()}${regime.slice(1).replace(/_/g, ' ')} regime`;
}

function presentRegimes(regimes: string[]) {
  const present = new Set(regimes.map((regime) => normalizeRegimeKey(regime)));
  return REGIME_LEGEND.filter((regime) => present.has(regime));
}

function responsivePillLabel(fullLabel: string, compactLabel: string, slotWidth: number) {
  const requiredWidth = (label: string) => label.length * 9 + 20;
  if (slotWidth >= requiredWidth(fullLabel)) {
    return fullLabel;
  }
  if (slotWidth >= requiredWidth(compactLabel)) {
    return compactLabel;
  }
  return '';
}

function intervalTooltipLabel(endAt: string | null, intervalIndex: number, language: 'en' | 'km') {
  const fullDate = formatSenaLongDate(endAt, language);
  if (fullDate !== '—') {
    return fullDate;
  }
  return `Interval ${intervalIndex + 1}`;
}

function LaneTitle({ title, subtitle, tooltip }: { title: string; subtitle?: string; tooltip: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        <SectionLabel tooltip={tooltip}>{title}</SectionLabel>
      </h3>
      {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
    </div>
  );
}

function ResponsivePillButton({
  active,
  ariaLabel,
  className,
  compactLabel,
  fullLabel,
  slotWidth,
  tooltipLabel,
  onClick,
}: {
  active: boolean;
  ariaLabel?: string;
  className: string;
  compactLabel: string;
  fullLabel: string;
  slotWidth: number;
  tooltipLabel?: string;
  onClick: () => void;
}) {
  const showExplanatoryTooltips = useDescriptionTextVisible();
  const visibleLabel = responsivePillLabel(fullLabel, compactLabel, slotWidth);
  const accessibleLabel = ariaLabel ?? tooltipLabel ?? fullLabel;
  const hoverLabel = tooltipLabel ?? fullLabel;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label={accessibleLabel}
          className={className}
          data-active={active ? 'true' : 'false'}
          title={showExplanatoryTooltips ? hoverLabel : undefined}
          type="button"
          onClick={onClick}
        >
          <span aria-hidden="true" className="block overflow-hidden whitespace-nowrap">
            {visibleLabel}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6}>{hoverLabel}</TooltipContent>
    </Tooltip>
  );
}

function IntervalStrip({
  activeIndex,
  axisContentWidth,
  axisEndPadding,
  axisStartPadding,
  canScrollLeft,
  canScrollRight,
  intervals,
  language,
  onScroll,
  scrollByViewport,
  scrollRef,
  slotWidth,
  onSelect,
}: {
  activeIndex: number | null;
  axisContentWidth: number;
  axisEndPadding: number;
  axisStartPadding: number;
  canScrollLeft: boolean;
  canScrollRight: boolean;
  intervals: Array<{ intervalIndex: number; endAt: string | null }>;
  language: 'en' | 'km';
  onScroll: (event: UIEvent<HTMLDivElement>) => void;
  scrollByViewport: (direction: -1 | 1) => void;
  scrollRef: RefObject<HTMLDivElement | null>;
  slotWidth: number;
  onSelect: (index: number) => void;
}) {
  return (
    <TooltipProvider>
      <div className="relative mt-4 min-h-12">
        {canScrollLeft ? (
          <button
            aria-label="Scroll intervals left"
            className="absolute left-0 top-1/2 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-border/70 bg-background/95 text-foreground shadow-sm"
            type="button"
            onClick={() => scrollByViewport(-1)}
          >
            <ChevronLeft className="size-4" />
          </button>
        ) : null}
        <div ref={scrollRef} className="hidden-scrollbar max-w-full overflow-x-auto overscroll-contain px-1 py-1" onScroll={onScroll}>
          <div
            className="grid min-w-full"
            style={{
              width: axisContentWidth,
              paddingLeft: axisStartPadding,
              paddingRight: axisEndPadding,
              gridTemplateColumns: `repeat(${Math.max(intervals.length, 1)}, ${slotWidth}px)`,
            }}
          >
            {intervals.map((interval) => {
              const tooltipLabel = intervalTooltipLabel(interval.endAt, interval.intervalIndex, language);
              const compactDate = formatSenaCompactIntervalDate(interval.endAt);
              const compactDay = formatSenaCompactIntervalDay(interval.endAt);
              const wideDate = formatSenaWideIntervalDate(interval.endAt);
              const fullLabel = slotWidth >= 132 && wideDate !== '—' ? wideDate : compactDate !== '—' ? compactDate : `Interval ${interval.intervalIndex + 1}`;
              return (
                <div key={interval.intervalIndex} className="flex min-h-10 items-center justify-center px-1">
                  <ResponsivePillButton
                    active={activeIndex === interval.intervalIndex}
                    ariaLabel={tooltipLabel}
                    className={`w-full rounded-full border px-2 py-2 text-center text-sm leading-none ${activeIndex === interval.intervalIndex ? 'border-foreground bg-foreground text-background' : 'border-border/70 bg-background text-foreground'}`}
                    compactLabel={compactDate !== '—' ? compactDay : String(interval.intervalIndex + 1)}
                    fullLabel={fullLabel}
                    slotWidth={slotWidth - 8}
                    tooltipLabel={tooltipLabel}
                    onClick={() => onSelect(interval.intervalIndex)}
                  />
                </div>
              );
            })}
          </div>
        </div>
        {canScrollRight ? (
          <button
            aria-label="Scroll intervals right"
            className="absolute right-0 top-1/2 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-border/70 bg-background/95 text-foreground shadow-sm"
            type="button"
            onClick={() => scrollByViewport(1)}
          >
            <ChevronRight className="size-4" />
          </button>
        ) : null}
      </div>
    </TooltipProvider>
  );
}

function RegimeChartHighlightOverlay({
  activeIndex,
  axisContentWidth,
  axisEndPadding,
  axisStartPadding,
  intervals,
  onSelect,
}: {
  activeIndex: number | null;
  axisContentWidth: number;
  axisEndPadding: number;
  axisStartPadding: number;
  intervals: Array<{ intervalIndex: number; dominantRegime: string }>;
  onSelect: (index: number) => void;
}) {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 grid overflow-hidden rounded-[1rem]"
      style={{
        width: axisContentWidth,
        paddingLeft: axisStartPadding,
        paddingRight: axisEndPadding,
        gridTemplateColumns: `repeat(${Math.max(intervals.length, 1)}, minmax(0, 1fr))`,
      }}
    >
      {intervals.map((interval, intervalPosition) => {
        const isSelected = activeIndex === interval.intervalIndex;
        return (
          <Tooltip key={interval.intervalIndex}>
            <TooltipTrigger asChild>
              <button
                aria-label={interval.dominantRegime}
                className={`relative border-r border-background/35 text-center text-xs text-foreground transition-colors last:border-r-0 ${isSelected ? '' : 'text-foreground/80'}`}
                data-regime-slot="true"
                data-selected={isSelected ? 'true' : 'false'}
                style={{
                  backgroundColor: regimeTint(interval.dominantRegime, isSelected),
                  borderTopLeftRadius: intervalPosition === 0 ? '0.85rem' : undefined,
                  borderBottomLeftRadius: intervalPosition === 0 ? '0.85rem' : undefined,
                  borderTopRightRadius: intervalPosition === intervals.length - 1 ? '0.85rem' : undefined,
                  borderBottomRightRadius: intervalPosition === intervals.length - 1 ? '0.85rem' : undefined,
                }}
                type="button"
                onClick={() => onSelect(interval.intervalIndex)}
              />
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={6}>{interval.dominantRegime}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

function selectedIntervalIndexFromSelection(model: ServiceDetailViewModel, selection: ServiceInspectorSelection) {
  if (selection.type === 'interval' && selection.intervalIndex != null) {
    return selection.intervalIndex;
  }
  return model.intervals.at(-1)?.intervalIndex ?? null;
}

export function ServiceDetailLedger({
  chartZoomResetToken = 0,
  hasOlderIntervals = false,
  isHydratingDetails = false,
  isLoadingOlderIntervals = false,
  loadOlderIntervals = async () => null,
  model,
  onOlderLoadProgressChange,
  onResetCharts = () => {},
  onTimeframeChange = () => {},
  selection,
  setSelection,
  timeframe = 'Recent',
}: {
  chartZoomResetToken?: string | number;
  hasOlderIntervals: boolean;
  isHydratingDetails: boolean;
  isLoadingOlderIntervals: boolean;
  loadOlderIntervals: (limit?: number) => Promise<SenaServiceDetailPage | null>;
  model: ServiceDetailViewModel;
  onOlderLoadProgressChange?: (progress: { current: number; total: number } | null) => void;
  onResetCharts: () => void;
  onTimeframeChange: (value: ChartTimeframe) => void;
  selection: ServiceInspectorSelection;
  setSelection: (value: ServiceInspectorSelection) => void;
  timeframe: ChartTimeframe;
}) {
  const { language } = usePreferences();
  const intervalScrollRef = useRef<HTMLDivElement | null>(null);
  const priceScrollRef = useRef<HTMLDivElement | null>(null);
  const flowScrollRef = useRef<HTMLDivElement | null>(null);
  const laneBodyRef = useRef<HTMLDivElement | null>(null);
  const regimeLaneRef = useRef<HTMLDivElement | null>(null);
  const intervals = model.intervals;
  const selectedIntervalIndex = selectedIntervalIndexFromSelection(model, selection);
  const indices = useMemo(() => intervals.map((entry) => entry.intervalIndex), [intervals]);
  const visibleRegimes = useMemo(
    () => presentRegimes(intervals.map((interval) => interval.dominantRegime)),
    [intervals],
  );
  const intervalsByIndex = useMemo(
    () => new Map(intervals.map((interval) => [interval.intervalIndex, interval])),
    [intervals],
  );
  const intervalStripEntries = useMemo(
    () => intervals.map((interval) => ({ intervalIndex: interval.intervalIndex, endAt: interval.endAt })),
    [intervals],
  );
  const regimeOverlayIntervals = useMemo(
    () => intervals.map((interval) => ({
      intervalIndex: interval.intervalIndex,
      dominantRegime: interval.dominantRegime,
    })),
    [intervals],
  );
  const syncRefs = [intervalScrollRef, priceScrollRef, flowScrollRef];
  const [expandedLane, setExpandedLane] = useState<'regime' | 'flow' | null>(null);
  const [restorationPageIndex, setRestorationPageIndex] = useState(0);
  const latestLoadedIntervalIndex = indices.at(-1) ?? null;
  const targetVisibleIntervalCount = timeframe === 'Recent' ? INTERVAL_VISIBLE_COUNT : Math.max(1, indices.length);
  const {
    adjustZoom,
    canScrollLeft,
    canScrollRight,
    clampedScrollLeft,
    contentWidth,
    handleScrollerScroll,
    scrollByViewport,
    slotWidth: stretchedSlotWidth,
    viewportWidth,
  } = useChartWorkspace<SenaServiceDetailPage | null>({
    chartZoomResetToken,
    getPrependedCount: (result) => result?.detail?.regimeTimeline.length ?? 0,
    hasOlderIntervals,
    intervalCount: indices.length,
    intervalScrollRef,
    isLoadingOlderIntervals,
    latestLoadedIntervalIndex,
    loadOlderIntervals,
    onOlderLoadProgressChange,
    syncRefs,
    targetVisibleIntervalCount,
  });
  const { floatingIslands: floatingChartControlIslands, headerActions: chartHeaderActions } = useChartWorkspaceControls({
    disabled: isLoadingOlderIntervals,
    onReset: onResetCharts,
    onTimeframeChange,
    onZoomIn: () => adjustZoom(1),
    onZoomOut: () => adjustZoom(-1),
    timeframe,
  });
  const axisStartPadding = AXIS_START_PADDING;
  const axisEndPadding = AXIS_END_PADDING;
  const showsLinePointMarkers = stretchedSlotWidth >= LINE_POINT_MARKER_MIN_SLOT_WIDTH;
  const renderWidth = Math.max(contentWidth, viewportWidth || 0);
  const priceMarkers = useMemo(
    () => intervals.map((interval) => ({
      intervalIndex: interval.intervalIndex,
      price: interval.priceValue,
      observedAt: interval.endAt ?? `interval-${interval.intervalIndex}`,
    })),
    [intervals],
  );
  const priceChart = useMemo(
    () => buildSparsePolylineSegments(
      priceMarkers,
      indices,
      stretchedSlotWidth,
      CHART_VIEWBOX_HEIGHT,
      { axisStartPadding, topPadding: 6, bottomPadding: 6 },
    ),
    [axisStartPadding, indices, priceMarkers, stretchedSlotWidth],
  );
  const gapValues = useMemo(
    () => intervals.map((interval) => interval.sellableValue - interval.demandValue),
    [intervals],
  );
  const maxGapMagnitude = Math.max(1, ...gapValues.map((value) => Math.abs(value)));
  const laneOrder = ['regime', 'flow'] as const;
  const visibleLaneOrder = expandedLane == null ? laneOrder : [expandedLane];
  const isLaneExpanded = (laneKey: (typeof laneOrder)[number]) => expandedLane === laneKey;
  const toggleLaneExpanded = (laneKey: (typeof laneOrder)[number]) => {
    setExpandedLane((current) => (current === laneKey ? null : laneKey));
  };
  const showSupplementalLanes = expandedLane == null;
  const collapsedLaneBodyHeight = useObservedElementHeight(laneBodyRef, expandedLane == null);
  const collapsedRegimeLaneHeight = useObservedElementHeight(regimeLaneRef, expandedLane == null);
  const reservedExpandedLaneBodyHeight =
    expandedLane != null
      ? collapsedRegimeLaneHeight > 0
        ? collapsedRegimeLaneHeight * EXPANDED_LANE_HEIGHT_MULTIPLIER
        : collapsedLaneBodyHeight > 0
          ? collapsedLaneBodyHeight
          : undefined
      : undefined;
  const expandedLinePlotHeight =
    expandedLane != null && reservedExpandedLaneBodyHeight != null
      ? Math.max(CHART_PLOT_HEIGHT, reservedExpandedLaneBodyHeight - EXPANDED_LANE_HEADER_ALLOWANCE)
      : CHART_PLOT_HEIGHT;
  const expandedFlowPlotHeight =
    expandedLane === 'flow' && reservedExpandedLaneBodyHeight != null
      ? Math.max(FLOW_LANE_PLOT_HEIGHT, reservedExpandedLaneBodyHeight - EXPANDED_LANE_HEADER_ALLOWANCE)
      : FLOW_LANE_PLOT_HEIGHT;
  const regimeGeometry = deriveProportionalChartGeometry({
    collapsedPlotHeight: CHART_PLOT_HEIGHT,
    availableHeight: expandedLinePlotHeight,
    baseStrokeWidth: 1,
    maxStrokeWidth: 1,
    baseMarkerSize: 12,
    maxMarkerSize: 14,
  });
  const regimeVisual = deriveExpandedChartVisualStyle({
    expandedHeightRatio: regimeGeometry.expandedHeightRatio,
    maxStrokeWidth: 1,
  });
  const flowVisual = deriveExpandedChartVisualStyle({
    expandedHeightRatio: Math.max(1, expandedFlowPlotHeight / FLOW_LANE_PLOT_HEIGHT),
    maxStrokeWidth: 1,
    maxDataLabelFontSize: 12,
  });
  const restorationPageCount = Math.max(1, Math.ceil(model.restoration.length / RESTORATION_PAGE_SIZE));
  const pagedRestorationEvents = useMemo(() => {
    const start = restorationPageIndex * RESTORATION_PAGE_SIZE;
    return model.restoration.slice(start, start + RESTORATION_PAGE_SIZE);
  }, [model.restoration, restorationPageIndex]);

  useEffect(() => {
    setRestorationPageIndex((current) => Math.min(current, restorationPageCount - 1));
  }, [restorationPageCount]);

  return (
    <>
      {floatingChartControlIslands}
      <section className={`${cardFrameClassName} ${cardSurfaceClassName} min-w-0 rounded-[2rem] px-6 py-5`}>
      <div className="flex flex-col gap-2 border-b border-border/60 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">SENA</p>
          <div className="mt-1">
            <SectionTitle
              title="Service viability ledger"
              tooltip="Interval-by-interval view of service sellability, contributor pressure, and recovery signals."
            />
          </div>
        </div>
        <div className="flex items-center sm:justify-end">
          {chartHeaderActions}
        </div>
      </div>

      <IntervalStrip
        activeIndex={selectedIntervalIndex}
        axisContentWidth={renderWidth}
        axisEndPadding={axisEndPadding}
        axisStartPadding={axisStartPadding}
        canScrollLeft={canScrollLeft}
        canScrollRight={canScrollRight}
        intervals={intervalStripEntries}
        language={language}
        onSelect={(index) => setSelection({ type: 'interval', intervalIndex: index })}
        onScroll={handleScrollerScroll}
        scrollByViewport={scrollByViewport}
        scrollRef={intervalScrollRef}
        slotWidth={stretchedSlotWidth}
      />

      <div
        ref={laneBodyRef}
        className="mt-5"
        style={
          reservedExpandedLaneBodyHeight != null
            ? {
                height: reservedExpandedLaneBodyHeight,
                minHeight: reservedExpandedLaneBodyHeight,
                maxHeight: reservedExpandedLaneBodyHeight,
              }
            : undefined
        }
      >
        {visibleLaneOrder.includes('regime') ? (
        <div
          ref={regimeLaneRef}
          className={cn('pb-5', isLaneExpanded('regime') && 'grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]')}
        >
          <LaneTitle
            title="Regime + price lane"
            subtitle={selectedIntervalIndex == null ? intervals.at(-1)?.priceLabel : intervalsByIndex.get(selectedIntervalIndex)?.priceLabel ?? intervals.at(-1)?.priceLabel}
            tooltip="Demand regime and service price context across the selected intervals."
          />
          <div className={cn('grid gap-3', isLaneExpanded('regime') && 'min-h-0 grid-rows-[auto_minmax(0,1fr)]')}>
            <div className="flex items-start justify-between gap-3 px-1">
              <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                <span className="sr-only">Regime</span>
                {visibleRegimes.map((regime) => (
                  <span key={regime} className="inline-flex items-center gap-2">
                    <span aria-hidden="true" className="inline-block size-4 rounded-[0.2rem]" style={{ backgroundColor: regimeTint(regime, true) }} />
                    {regimeLegendLabel(regime)}
                  </span>
                ))}
                <span className="inline-flex items-center gap-2">
                  <span aria-hidden="true" className="relative inline-flex h-4 w-8 items-center">
                    <span className="block h-px w-full bg-foreground/70" />
                    <span className="absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-foreground/55 bg-background" />
                  </span>
                  Service price line
                </span>
              </div>
              <LaneExpandButton expanded={isLaneExpanded('regime')} title="Regime + price lane" onClick={() => toggleLaneExpanded('regime')} />
            </div>
            <div
              ref={priceScrollRef}
              className={cn('hidden-scrollbar overflow-x-auto overscroll-contain', isLaneExpanded('regime') && 'min-h-0 h-full')}
              onScroll={handleScrollerScroll}
            >
              <div className="relative overflow-visible" style={{ width: renderWidth, height: LABEL_GUTTER_HEIGHT + expandedLinePlotHeight }}>
                <TooltipProvider>
                  <RegimeChartHighlightOverlay
                    activeIndex={selectedIntervalIndex}
                    axisContentWidth={renderWidth}
                    axisEndPadding={axisEndPadding}
                    axisStartPadding={axisStartPadding}
                    intervals={regimeOverlayIntervals}
                    onSelect={(index) => setSelection({ type: 'interval', intervalIndex: index })}
                  />
                </TooltipProvider>
                <svg
                  aria-hidden="true"
                  className="absolute left-0 top-0 z-[1] w-full"
                  preserveAspectRatio="none"
                  style={{ height: expandedLinePlotHeight, top: LABEL_GUTTER_HEIGHT }}
                  viewBox={`0 0 ${Math.max(renderWidth, 1)} ${CHART_VIEWBOX_HEIGHT}`}
                >
                  {priceChart.segments.map((segment, index) => (
                    <polyline
                      key={`service-price-segment-${index}`}
                      fill="none"
                      points={segment}
                      stroke="currentColor"
                      strokeWidth={regimeVisual.strokeWidth}
                      className="text-foreground/70"
                    />
                  ))}
                </svg>
                {priceChart.points.map((point, index) => {
                  const marker = priceMarkers[index];
                  const isSelected = marker?.intervalIndex === selectedIntervalIndex;
                  if (!showsLinePointMarkers && !isSelected) {
                    return null;
                  }
                  const pointTop = deriveLabelGutterOffset({
                    plotY: point.y,
                    plotHeight: expandedLinePlotHeight,
                    gutterHeight: LABEL_GUTTER_HEIGHT,
                    viewBoxHeight: CHART_VIEWBOX_HEIGHT,
                  });
                  return (
                    <Fragment key={marker ? `${marker.observedAt}:${marker.intervalIndex}` : `price-${index}`}>
                      {isSelected ? (
                        <ClampedChartDataLabel
                          anchorX={point.x}
                          anchorY={pointTop}
                          containerWidth={renderWidth}
                          containerHeight={LABEL_GUTTER_HEIGHT + expandedLinePlotHeight}
                          gap={regimeVisual.dataLabelGap}
                          className="flex flex-col items-center rounded-[0.9rem] border border-border/70 bg-background font-medium text-foreground shadow-sm"
                          style={{
                            padding: `${regimeVisual.dataLabelPaddingY}px ${regimeVisual.dataLabelPaddingX}px`,
                            fontSize: regimeVisual.dataLabelFontSize,
                          }}
                        >
                          <span
                            className="whitespace-nowrap uppercase tracking-[0.14em] text-muted-foreground"
                            style={{ fontSize: Math.max(9, regimeVisual.dataLabelFontSize - 1) }}
                          >
                            {formatRegimeLabel(intervals[index]?.dominantRegime ?? '')}
                          </span>
                          <span className="whitespace-nowrap">{intervals[index]?.priceLabel ?? ''}</span>
                        </ClampedChartDataLabel>
                      ) : null}
                      <button
                        aria-label={marker ? `Price ${marker.price}` : `Price point ${index + 1}`}
                        className="absolute z-[2] -translate-x-1/2 -translate-y-1/2"
                        style={{
                          left: point.x,
                          top: pointTop,
                        }}
                        type="button"
                        onClick={() => marker && setSelection({ type: 'interval', intervalIndex: marker.intervalIndex })}
                      >
                      <span
                        className={`block rounded-full border-2 ${isSelected ? 'border-foreground bg-foreground' : 'border-foreground/55 bg-background'}`}
                        style={{ width: regimeVisual.markerSize, height: regimeVisual.markerSize }}
                      />
                      </button>
                    </Fragment>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
        ) : null}

        {visibleLaneOrder.includes('flow') ? (
        <div className={cn('border-t border-border/60 py-5', isLaneExpanded('flow') && 'grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)]')}>
          <LaneTitle
            title="Demand and sellability lane"
            tooltip="Gap between demand and sellable capacity in each interval."
          />
          <div className="mb-3 flex items-start justify-between gap-3 px-2">
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <span className="size-2 rounded-full bg-foreground/70" />
                Sellable minus demand
              </span>
            </div>
            <LaneExpandButton expanded={isLaneExpanded('flow')} title="Demand and sellability lane" onClick={() => toggleLaneExpanded('flow')} />
          </div>
          <div
            ref={flowScrollRef}
            className={cn('hidden-scrollbar overflow-x-auto overscroll-contain', isLaneExpanded('flow') && 'min-h-0 h-full')}
            onScroll={handleScrollerScroll}
          >
            <div
              className="relative grid rounded-md bg-muted/20 pb-3 pt-2"
              style={{
                width: renderWidth,
                paddingLeft: axisStartPadding,
                paddingRight: axisEndPadding,
                paddingTop: FLOW_LABEL_GUTTER_HEIGHT,
                gridTemplateColumns: `repeat(${Math.max(intervals.length, 1)}, ${stretchedSlotWidth}px)`,
                minHeight: FLOW_LABEL_GUTTER_HEIGHT + expandedFlowPlotHeight,
              }}
            >
              {intervals.map((interval, index) => {
                const plotHalfHeight = expandedFlowPlotHeight / 2;
                const gapValue = gapValues[index] ?? 0;
                const gapHeight = Math.max(3, (Math.abs(gapValue) / maxGapMagnitude) * (plotHalfHeight - 4));
                const flowAnchorX = axisStartPadding + index * stretchedSlotWidth + stretchedSlotWidth / 2;
                return (
                  <Fragment key={interval.intervalIndex}>
                    {selectedIntervalIndex === interval.intervalIndex ? (
                      <ClampedChartDataLabel
                        anchorX={flowAnchorX}
                        anchorY={FLOW_LABEL_GUTTER_HEIGHT}
                        containerWidth={renderWidth}
                        containerHeight={FLOW_LABEL_GUTTER_HEIGHT + expandedFlowPlotHeight}
                        gap={flowVisual.dataLabelGap}
                        className="flex max-w-[220px] flex-col items-start gap-1 rounded-md border border-border/60 bg-background/95 shadow-sm"
                        style={{
                          padding: `${flowVisual.dataLabelPaddingY}px ${flowVisual.dataLabelPaddingX}px`,
                          fontSize: flowVisual.dataLabelFontSize,
                        }}
                      >
                        <span className="whitespace-nowrap text-foreground">{`Demand: ${interval.demandLabel}`}</span>
                        <span className="whitespace-nowrap text-foreground">{`Sellable: ${interval.sellableLabel}`}</span>
                        <span className="whitespace-nowrap text-foreground">{`Gap: ${gapValue > 0 ? '+' : ''}${gapValue.toFixed(2).replace(/\.00$/, '')}`}</span>
                        <span className="whitespace-nowrap text-foreground">{interval.tensionLabel}</span>
                      </ClampedChartDataLabel>
                    ) : null}
                    <button
                      className="relative flex w-full items-stretch justify-center"
                      style={{ height: expandedFlowPlotHeight }}
                      type="button"
                      onClick={() => setSelection({ type: 'interval', intervalIndex: interval.intervalIndex })}
                    >
                    <span className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border/70" />
                    <div className="relative h-full w-[85%] self-center">
                      {gapValue >= 0 ? (
                        <div className="absolute inset-x-0 bottom-1/2 h-1/2">
                          <span
                            className="absolute bottom-0 left-1/2 w-full -translate-x-1/2 rounded-none bg-foreground/70"
                            style={{ height: gapHeight }}
                          />
                        </div>
                      ) : (
                        <div className="absolute inset-x-0 top-1/2 h-1/2">
                          <span
                            className="absolute top-0 left-1/2 w-full -translate-x-1/2 rounded-none bg-destructive/70"
                            style={{ height: gapHeight }}
                          />
                        </div>
                      )}
                    </div>
                    </button>
                  </Fragment>
                );
              })}
            </div>
          </div>
        </div>
        ) : null}

        {showSupplementalLanes ? (
        <div className="border-t border-border/60 py-5">
          <LaneTitle
            title="Contributor pressure lane"
            tooltip="Linked SKUs ranked by how strongly they limit this service."
          />
          <div className="grid gap-3">
            {model.contributors.map((contributor) => {
              const isSelected = selection.type === 'contributor' && selection.skuId === contributor.skuId;
              return (
                <button
                  key={contributor.skuId}
                  className={`grid gap-3 rounded-[1.2rem] border bg-white p-4 text-left transition hover:border-foreground/35 md:grid-cols-[minmax(0,1fr)_180px] ${
                    isSelected ? 'border-foreground' : 'border-border/70'
                  }`}
                  type="button"
                  onClick={() => setSelection({ type: 'contributor', skuId: contributor.skuId })}
                >
                  <div className="grid gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-lg font-semibold tracking-[-0.03em] text-foreground">{contributor.name}</p>
                      <span className="rounded-full border border-border/70 bg-muted/45 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                        {contributor.roleLabel}
                      </span>
                    </div>
                    <p className="text-sm leading-6 text-muted-foreground">
                      {contributor.daysOfCoverLabel} cover · {contributor.probabilityLabel} limiting probability · {contributor.usageLabel} usage share
                    </p>
                    <p className="text-sm leading-6 text-muted-foreground">{contributor.recoveryNote}</p>
                  </div>
                  <div className="grid content-between gap-3">
                    <div>
                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span>Pressure</span>
                        <span>{Math.round(contributor.limitingProbability * 100)}%</span>
                      </div>
                      <div className="mt-2 h-2 rounded-full bg-border/60">
                        <div
                          className={`h-full rounded-full ${contributor.limitingProbability >= 0.5 ? 'bg-destructive/70' : contributor.limitingProbability >= 0.3 ? 'bg-amber-500/80' : 'bg-emerald-600/75'}`}
                          style={{ width: `${Math.max(contributor.limitingProbability * 100, 4)}%` }}
                        />
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      <p>{contributor.stockLabel}</p>
                      <p className="mt-1">{contributor.inboundLabel}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        ) : null}

        {showSupplementalLanes ? (
        <div className="border-t border-border/60 pt-5">
          <LaneTitle
            title="Restoration pipeline lane"
            tooltip="Inbound linked-SKU events that can restore service capacity."
          />
          {model.restoration.length > 0 ? (
            <div className="mt-4 overflow-hidden rounded-[1.4rem] border border-border/60 bg-background/70">
              <div className="grid gap-3 p-4 md:grid-cols-2">
                {pagedRestorationEvents.map((event) => (
                  <div key={event.key} className="rounded-[1.2rem] border border-border/70 bg-white p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-semibold tracking-[-0.02em] text-foreground">{event.headline}</p>
                      <span className="rounded-full border border-border/70 bg-muted/45 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                        {event.state === 'open' ? 'Open inbound' : 'Receipt logged'}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {event.timingLabel} · {event.quantityLabel}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{event.detail}</p>
                  </div>
                ))}
              </div>
              {model.restoration.length > RESTORATION_PAGE_SIZE ? (
                <PagedPanelNavigation
                  className="bg-background/40 px-4"
                  pageCount={restorationPageCount}
                  pageIndex={restorationPageIndex}
                  setPageIndex={setRestorationPageIndex}
                />
              ) : null}
            </div>
          ) : (
            <div className="rounded-[1.2rem] border border-dashed border-border/70 bg-background/70 px-4 py-5 text-sm leading-6 text-muted-foreground">
              No restoration event is visible yet. Log linked SKU orders or receipts to refresh the recovery path.
            </div>
          )}
        </div>
        ) : null}
      </div>
    </section>
    </>
  );
}
