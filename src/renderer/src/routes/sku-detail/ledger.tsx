import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject, type UIEvent, type WheelEvent } from 'react';
import { Package } from 'lucide-react';
import type { SenaSkuDetailPage } from '@shared/sena';
import type { ChartTimeframe } from '@/components/system/chart-timeframe';
import { LaneExpandButton, useChartWorkspace, useChartWorkspaceControls } from '@/components/system/chart-workspace';
import {
  AXIS_END_PADDING,
  AXIS_START_PADDING,
  classifyWheelIntent,
  clampScrollLeft,
  DEFAULT_SLOT_WIDTH,
  derivePrependedScrollLeft,
  deriveAnchoredZoomScrollLeft,
  deriveAxisContentWidth,
  deriveCenteredIntervalScrollLeft,
  deriveFreshMountIntervalScrollLeft,
  deriveInitialViewportSlotWidth,
  deriveLatestWindowScrollLeft,
  deriveSequentialOlderLoadBatchCount,
  deriveViewportPageScrollLeft,
  deriveVisibleWindow,
  handleIntervalChartWheel,
  INTERVAL_LOAD_BATCH_SIZE,
  INTERVAL_VISIBLE_COUNT,
  INTERVAL_PAGE_SIZE,
  INTERVAL_PILL_GAP,
  IntervalStrip,
  MAX_SLOT_WIDTH,
  MIN_SLOT_WIDTH,
  SCROLL_EDGE_TOLERANCE,
  SHARED_PILL_MIN_WIDTH,
  isPinchZoomGesture,
  shouldLoadOlderIntervals,
} from '@/components/system/interval-strip';
import {
  buildPointCoordinatesWithDomain,
  buildPolylineWithDomain,
  buildSparsePolylineSegments,
  buildTrajectoryBandPath,
  ClampedChartDataLabel,
  deriveDashUnit,
  deriveHorizontalDotGuideLayout,
  deriveExpandedChartVisualStyle,
  deriveProportionalChartGeometry,
  deriveTouchingSlotGlyphLayout,
  deriveFlowStackHeights,
  deriveLabelGutterOffset,
} from '@/components/system/timeline-chart';
import { cardFrameClassName, cardSurfaceClassName } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { usePreferences } from '@/state/preferences';
import { SectionLabel, SectionTitle } from './section-heading';
import type { SenaSkuDetailViewModel } from './view-model';

export {
  classifyWheelIntent,
  deriveAnchoredZoomScrollLeft,
  deriveAxisContentWidth,
  deriveCenteredIntervalScrollLeft,
  deriveSlotCenterX,
  deriveSlotLeftX,
  deriveVisibleWindow,
  isPinchZoomGesture,
  intervalLabelForWidth,
  intervalTooltipLabel,
  responsivePillLabel,
} from '@/components/system/interval-strip';
export {
  buildSparsePolylineSegments,
  deriveLabelGutterOffset,
} from '@/components/system/timeline-chart';

const LABEL_GUTTER_HEIGHT = 32;
const CHART_PLOT_HEIGHT = 120;
const CHART_VIEWBOX_HEIGHT = 42;
const FLOW_LABEL_GUTTER_HEIGHT = 64;
const FLOW_LANE_PLOT_HEIGHT = 112;
const LINE_POINT_MARKER_MIN_SLOT_WIDTH = 20;
const EXPANDED_LANE_HEADER_ALLOWANCE = 136;
const EXPANDED_LANE_HEIGHT_MULTIPLIER = 4;
const PIPELINE_TILE_MIN_HEIGHT = 96;

function intervalEntries(model: SenaSkuDetailViewModel) {
  const entries = new Map<number, { intervalIndex: number; startAt: string | null; endAt: string | null }>();
  for (const interval of model.lanes.regimePriceLane.intervals) {
    entries.set(interval.intervalIndex, { intervalIndex: interval.intervalIndex, startAt: interval.startAt, endAt: interval.endAt });
  }
  for (const interval of model.lanes.flowLane.intervals) {
    if (!entries.has(interval.intervalIndex)) {
      entries.set(interval.intervalIndex, { intervalIndex: interval.intervalIndex, startAt: interval.startAt, endAt: interval.endAt });
    }
  }
  for (const interval of model.lanes.pipelineLane.intervals) {
    if (!entries.has(interval.intervalIndex)) {
      entries.set(interval.intervalIndex, { intervalIndex: interval.intervalIndex, startAt: null, endAt: null });
    }
  }
  return [...entries.values()].sort((left, right) => left.intervalIndex - right.intervalIndex);
}

function formatRegimeLabel(regime: string) {
  return regime
    .split(/[_\s-]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
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

export function regimeCompactLabel(regime: string) {
  const normalized = regime.trim().toLowerCase();
  if (normalized === 'stockout-constrained') {
    return 'SC';
  }
  return normalized
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2);
}

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

function pipelineTintStyle(value: number, maxValue: number) {
  const normalized = maxValue > 0 ? clamp(value / maxValue, 0, 1) : 0;
  const eased = Math.pow(normalized, 1.6);
  const baseAlpha = 0.04 + eased * 0.26;
  const borderAlpha = 0.08 + eased * 0.22;
  return {
    backgroundColor: `rgba(134, 166, 95, ${baseAlpha})`,
    borderColor: `rgba(103, 132, 69, ${borderAlpha})`,
  };
}

function pipelineUsesCompactTile(slotWidth: number) {
  return slotWidth < 92;
}

function pipelineUsesNumberOnlyTile(slotWidth: number) {
  return slotWidth < 64;
}

function pipelineUsesExternalDataLabel(slotWidth: number) {
  return slotWidth < 72;
}

function pipelineTileLayout(slotWidth: number) {
  return deriveTouchingSlotGlyphLayout({
    slotWidth,
    preferredInset: slotWidth >= 96 ? 8 : slotWidth >= 72 ? 5 : 0,
  });
}

function normalizeRegimeKey(regime: string) {
  return regime.trim().toLowerCase().replace(/[\s-]+/g, '_');
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
  intervals: SenaSkuDetailViewModel['lanes']['regimePriceLane']['intervals'];
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

export function SkuDetailLedger({
  chartZoomResetToken = 0,
  hasOlderIntervals = false,
  isHydratingDetails = false,
  isLoadingOlderIntervals = false,
  loadOlderIntervals = async () => null,
  model,
  onOlderLoadProgressChange,
  onResetCharts = () => {},
  onTimeframeChange = () => {},
  selectedIntervalIndex,
  setSelectedIntervalIndex,
  timeframe = 'Recent',
}: {
  chartZoomResetToken?: string | number;
  hasOlderIntervals: boolean;
  isHydratingDetails: boolean;
  isLoadingOlderIntervals: boolean;
  loadOlderIntervals: (limit?: number) => Promise<SenaSkuDetailPage | null>;
  model: SenaSkuDetailViewModel;
  onOlderLoadProgressChange?: (progress: { current: number; total: number } | null) => void;
  onResetCharts: () => void;
  onTimeframeChange: (value: ChartTimeframe) => void;
  selectedIntervalIndex: number | null;
  setSelectedIntervalIndex: (index: number) => void;
  timeframe: ChartTimeframe;
}) {
  const { language, t } = usePreferences();
  const intervalScrollRef = useRef<HTMLDivElement | null>(null);
  const priceScrollRef = useRef<HTMLDivElement | null>(null);
  const inventoryScrollRef = useRef<HTMLDivElement | null>(null);
  const flowScrollRef = useRef<HTMLDivElement | null>(null);
  const pipelineScrollRef = useRef<HTMLDivElement | null>(null);
  const laneBodyRef = useRef<HTMLDivElement | null>(null);
  const regimeLaneRef = useRef<HTMLDivElement | null>(null);
  const intervals = intervalEntries(model);
  const showsPriceSurfaces = model.identity.soldAsProduct;
  const visibleRegimes = useMemo(
    () => presentRegimes(model.lanes.regimePriceLane.intervals.map((interval) => interval.dominantRegime)),
    [model.lanes.regimePriceLane.intervals],
  );
  const indices = useMemo(() => intervals.map((entry) => entry.intervalIndex), [intervals]);
  const syncRefs = [intervalScrollRef, priceScrollRef, inventoryScrollRef, flowScrollRef, pipelineScrollRef];
  const [expandedLane, setExpandedLane] = useState<'regime' | 'inventory' | 'flow' | 'pipeline' | null>(null);
  const latestLoadedIntervalIndex = indices.at(-1) ?? null;
  const targetVisibleIntervalCount = timeframe === 'Recent'
    ? INTERVAL_VISIBLE_COUNT
    : Math.max(1, indices.length);
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
  } = useChartWorkspace<SenaSkuDetailPage | null>({
    chartZoomResetToken,
    getPrependedCount: (result) => result?.detail?.demandPosterior.length ?? 0,
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
  const visibleWindow = deriveVisibleWindow(indices.length, clampedScrollLeft, viewportWidth, stretchedSlotWidth, INTERVAL_PILL_GAP);
  const inventoryChart = useMemo(() => {
    const meanValues = model.lanes.inventoryLane.points.map((point) => point.mean);
    const lowValues = model.lanes.inventoryLane.points.map((point) => point.low);
    const highValues = model.lanes.inventoryLane.points.map((point) => point.high);
    const domainMin = Math.min(...lowValues);
    const domainMax = Math.max(...highValues);

    return {
      meanValues,
      lowValues,
      highValues,
      domainMin,
      domainMax,
      polyline: buildPolylineWithDomain(
        meanValues,
        stretchedSlotWidth,
        CHART_VIEWBOX_HEIGHT,
        domainMin,
        domainMax,
        { axisStartPadding, topPadding: 6, bottomPadding: 6 },
      ),
      coordinates: buildPointCoordinatesWithDomain(
        meanValues,
        stretchedSlotWidth,
        CHART_VIEWBOX_HEIGHT,
        domainMin,
        domainMax,
        { axisStartPadding, topPadding: 6, bottomPadding: 6 },
      ),
      bandPath: buildTrajectoryBandPath(
        lowValues,
        highValues,
        stretchedSlotWidth,
        CHART_VIEWBOX_HEIGHT,
        domainMin,
        domainMax,
        { axisStartPadding, topPadding: 6, bottomPadding: 6 },
      ),
    };
  }, [axisStartPadding, model.lanes.inventoryLane.points, stretchedSlotWidth]);
  const priceChart = useMemo(
    () => buildSparsePolylineSegments(
      model.lanes.regimePriceLane.priceMarkers,
      indices,
      stretchedSlotWidth,
      CHART_VIEWBOX_HEIGHT,
      { axisStartPadding, topPadding: 6, bottomPadding: 6 },
    ),
    [axisStartPadding, indices, model.lanes.regimePriceLane.priceMarkers, stretchedSlotWidth],
  );
  const regimeIntervalsByIndex = useMemo(
    () => new Map(model.lanes.regimePriceLane.intervals.map((interval) => [interval.intervalIndex, interval])),
    [model.lanes.regimePriceLane.intervals],
  );
  const selectedPointIndex = useMemo(
    () => (selectedIntervalIndex != null ? Math.max(0, indices.indexOf(selectedIntervalIndex)) : null),
    [indices, selectedIntervalIndex],
  );
  const maxPipelineInTransit = Math.max(0, ...model.lanes.pipelineLane.intervals.map((interval) => interval.inTransitMean));
  const maxFlowMagnitude = Math.max(
    1,
    ...model.lanes.flowLane.intervals.flatMap((interval) => [
      Math.abs(interval.serviceDemandMean),
      Math.abs(interval.retailDemandMean),
      Math.abs(interval.receiptsMean),
    ]),
  );
  const laneOrder = ['regime', 'inventory', 'flow', 'pipeline'] as const;
  const visibleLaneOrder = expandedLane == null ? laneOrder : [expandedLane];
  const isLaneExpanded = (laneKey: (typeof laneOrder)[number]) => expandedLane === laneKey;
  const toggleLaneExpanded = (laneKey: (typeof laneOrder)[number]) => {
    setExpandedLane((current) => (current === laneKey ? null : laneKey));
  };
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
  const expandedPipelineBodyHeight =
    expandedLane === 'pipeline' && reservedExpandedLaneBodyHeight != null
      ? Math.max(128, reservedExpandedLaneBodyHeight - EXPANDED_LANE_HEADER_ALLOWANCE)
      : 128;
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
  const inventoryGeometry = deriveProportionalChartGeometry({
    collapsedPlotHeight: CHART_PLOT_HEIGHT,
    availableHeight: expandedLinePlotHeight,
    baseStrokeWidth: 1,
    maxStrokeWidth: 1,
    baseMarkerSize: 12,
    maxMarkerSize: 14,
  });
  const inventoryVisual = deriveExpandedChartVisualStyle({
    expandedHeightRatio: inventoryGeometry.expandedHeightRatio,
    maxStrokeWidth: 1,
  });
  const inventoryReorderDotRadius = Math.max(0.5, deriveDashUnit(inventoryVisual.secondaryDashArray));
  const inventoryReorderGuide = deriveHorizontalDotGuideLayout({
    startX: axisStartPadding,
    endX: Math.max(contentWidth - axisEndPadding, 1),
    dotDiameter: inventoryReorderDotRadius * 2,
    gap: inventoryVisual.primaryDotGap,
  });
  const inventoryReorderGuideTop = deriveLabelGutterOffset({
    plotY: 10,
    plotHeight: expandedLinePlotHeight,
    gutterHeight: LABEL_GUTTER_HEIGHT,
    viewBoxHeight: CHART_VIEWBOX_HEIGHT,
  });
  const flowVisual = deriveExpandedChartVisualStyle({
    expandedHeightRatio: Math.max(1, expandedFlowPlotHeight / FLOW_LANE_PLOT_HEIGHT),
    maxStrokeWidth: 1,
    maxDataLabelFontSize: 12,
  });

  return (
    <>
      {floatingChartControlIslands}
      <section className={`${cardFrameClassName} ${cardSurfaceClassName} min-w-0 rounded-[2rem] px-6 py-5`}>
      <div className="flex flex-col gap-2 border-b border-border/60 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">SENA</p>
          <div className="mt-1">
            <SectionTitle title="Ledger" tooltip={t('catalogSenaSkuLedgerTooltip')} />
          </div>
        </div>
        <div className="flex items-center sm:justify-end">
          {chartHeaderActions}
        </div>
      </div>

      <IntervalStrip
        activeIndex={selectedIntervalIndex}
        axisContentWidth={contentWidth}
        axisEndPadding={axisEndPadding}
        axisStartPadding={axisStartPadding}
        canScrollLeft={canScrollLeft}
        canScrollRight={canScrollRight}
        intervals={intervals}
        language={language}
        onSelect={setSelectedIntervalIndex}
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
            title={showsPriceSurfaces ? t('catalogSenaSkuRegimePriceLane') : t('catalogSenaSkuRegimeLane')}
            tooltip={
              showsPriceSurfaces ? t('catalogSenaSkuRegimePriceLaneTooltip') : t('catalogSenaSkuRegimeLaneTooltip')
            }
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
                {showsPriceSurfaces ? (
                  <span className="inline-flex items-center gap-2">
                    <span aria-hidden="true" className="relative inline-flex h-4 w-8 items-center">
                    <span className="block h-px w-full bg-foreground/70" />
                    <span className="absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-foreground/55 bg-background" />
                  </span>
                    {t('catalogSenaSkuRetailPriceLine')}
                  </span>
                ) : null}
              </div>
              <LaneExpandButton
                expanded={isLaneExpanded('regime')}
                title={showsPriceSurfaces ? t('catalogSenaSkuRegimePriceLane') : t('catalogSenaSkuRegimeLane')}
                onClick={() => toggleLaneExpanded('regime')}
              />
            </div>
            <div ref={priceScrollRef} className={cn('hidden-scrollbar overflow-x-auto overscroll-contain', isLaneExpanded('regime') && 'min-h-0 h-full')} onScroll={handleScrollerScroll}>
              <div className="relative overflow-visible" style={{ width: contentWidth, height: LABEL_GUTTER_HEIGHT + expandedLinePlotHeight }}>
                <TooltipProvider>
                  <RegimeChartHighlightOverlay
                    activeIndex={selectedIntervalIndex}
                    axisContentWidth={contentWidth}
                    axisEndPadding={axisEndPadding}
                    axisStartPadding={axisStartPadding}
                    intervals={model.lanes.regimePriceLane.intervals}
                    onSelect={setSelectedIntervalIndex}
                  />
                </TooltipProvider>
                <svg
                  aria-hidden="true"
                  className="absolute left-0 top-0 z-[1] w-full"
                  preserveAspectRatio="none"
                  style={{ height: expandedLinePlotHeight, top: LABEL_GUTTER_HEIGHT }}
                  viewBox={`0 0 ${Math.max(contentWidth, 1)} ${CHART_VIEWBOX_HEIGHT}`}
                >
                  {showsPriceSurfaces
                    ? priceChart.segments.map((segment, index) => (
                        <polyline
                          key={`price-segment-${index}`}
                          fill="none"
                          points={segment}
                          stroke="currentColor"
                          strokeWidth={regimeVisual.strokeWidth}
                          className="text-foreground/70"
                        />
                      ))
                    : null}
                </svg>
                {showsPriceSurfaces ? priceChart.points.map((point, index) => {
                  const marker = model.lanes.regimePriceLane.priceMarkers[index];
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
                        containerWidth={contentWidth}
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
                          {formatRegimeLabel(marker == null ? '' : regimeIntervalsByIndex.get(marker.intervalIndex)?.dominantRegime ?? '')}
                        </span>
                        <span className="whitespace-nowrap">{marker ? `$${marker.price}` : ''}</span>
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
                      onClick={() => marker && setSelectedIntervalIndex(marker.intervalIndex)}
                    >
                      <span
                        className={`block rounded-full border-2 ${isSelected ? 'border-foreground bg-foreground' : 'border-foreground/55 bg-background'}`}
                        style={{ width: regimeVisual.markerSize, height: regimeVisual.markerSize }}
                      />
                    </button>
                  </Fragment>
                );
              }) : null}
              </div>
            </div>
          </div>
        </div>
        ) : null}

        {visibleLaneOrder.includes('inventory') ? (
        <div className={cn('border-t border-border/60 py-5', isLaneExpanded('inventory') && 'grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)]')}>
          <LaneTitle title={t('catalogSenaSkuInventoryLane')} tooltip={t('catalogSenaSkuInventoryLaneTooltip')} />
          <div className="mb-3 flex items-start justify-between gap-3 px-1">
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="inline-block h-2 w-6 rounded-[0.2rem] bg-foreground/10"
                />
                Uncertainty band
              </span>
              <span className="inline-flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="inline-flex items-center gap-1"
                >
                  {Array.from({ length: 3 }).map((_, index) => (
                    <span
                      key={`inventory-reorder-legend-dot-${index}`}
                      className="block size-2 rounded-full bg-muted-foreground/70"
                    />
                  ))}
                </span>
                {t('catalogSenaSkuReorderPoint')}: {model.lanes.inventoryLane.reorderPointLabel}
              </span>
              <span className="inline-flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="inline-block h-px w-7 opacity-50"
                  style={{
                    backgroundImage: 'repeating-linear-gradient(to right, currentColor 0 4px, transparent 4px 7px)',
                  }}
                />
                {t('catalogSenaSkuSafetyStock')}: {model.lanes.inventoryLane.safetyStockLabel}
              </span>
            </div>
            <LaneExpandButton expanded={isLaneExpanded('inventory')} title="Inventory posterior lane" onClick={() => toggleLaneExpanded('inventory')} />
          </div>
          <div ref={inventoryScrollRef} className={cn('hidden-scrollbar overflow-x-auto overscroll-contain rounded-md bg-muted/25 px-2 py-3', isLaneExpanded('inventory') && 'min-h-0 h-full')} onScroll={handleScrollerScroll}>
              <div className="relative overflow-visible" style={{ width: contentWidth, height: LABEL_GUTTER_HEIGHT + expandedLinePlotHeight }}>
                <svg
                  aria-hidden="true"
                  className="absolute left-0 top-0 w-full"
                  preserveAspectRatio="none"
                  style={{ height: expandedLinePlotHeight, top: LABEL_GUTTER_HEIGHT }}
                  viewBox={`0 0 ${Math.max(contentWidth, 1)} 42`}
                >
                {inventoryChart.bandPath ? (
                  <path
                    d={inventoryChart.bandPath}
                    fill="currentColor"
                    className="text-foreground/10"
                  />
                ) : null}
                <path d={`M${axisStartPadding} 24 H${Math.max(contentWidth - axisEndPadding, 1)}`} strokeDasharray={inventoryVisual.secondaryDashArray} stroke="currentColor" strokeWidth={inventoryVisual.dashedStrokeWidth} className="text-muted-foreground/50" />
                <polyline fill="none" points={inventoryChart.polyline} stroke="currentColor" strokeWidth={inventoryVisual.strokeWidth} className="text-foreground" />
              </svg>
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 z-[1]"
                style={{ top: inventoryReorderGuideTop, height: inventoryReorderDotRadius * 2 }}
              >
                {inventoryReorderGuide.centers.map((centerX) => (
                  <span
                    key={`inventory-reorder-dot-${centerX}`}
                    className="absolute rounded-full bg-muted-foreground/70"
                    style={{
                      left: centerX - inventoryReorderDotRadius,
                      top: 0,
                      width: inventoryReorderDotRadius * 2,
                      height: inventoryReorderDotRadius * 2,
                    }}
                  />
                ))}
              </div>
              {inventoryChart.coordinates.map((point, index) => {
                const isSelected = selectedPointIndex === index;
                const detailPoint = model.lanes.inventoryLane.points[index];
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
                  <Fragment key={detailPoint?.at ?? `inventory-${index}`}>
                    {isSelected ? (
                      <ClampedChartDataLabel
                        anchorX={point.x}
                        anchorY={pointTop}
                        containerWidth={contentWidth}
                        containerHeight={LABEL_GUTTER_HEIGHT + expandedLinePlotHeight}
                        gap={inventoryVisual.dataLabelGap}
                        className="whitespace-nowrap rounded-full border border-border/70 bg-background font-medium text-foreground shadow-sm"
                        style={{
                          padding: `${inventoryVisual.dataLabelPaddingY}px ${inventoryVisual.dataLabelPaddingX}px`,
                          fontSize: inventoryVisual.dataLabelFontSize,
                        }}
                      >
                        {Math.round(detailPoint?.mean ?? point.value)}u
                      </ClampedChartDataLabel>
                    ) : null}
                    <button
                      aria-label={detailPoint ? `Inventory ${Math.round(detailPoint.mean)} units` : `Inventory point ${index + 1}`}
                      className="absolute -translate-x-1/2 -translate-y-1/2"
                      style={{
                        left: point.x,
                        top: pointTop,
                      }}
                      type="button"
                      onClick={() => setSelectedIntervalIndex(indices[index] ?? index)}
                    >
                    <span
                      className={`block rounded-full border-2 ${isSelected ? 'border-foreground bg-foreground' : 'border-foreground/55 bg-background'}`}
                      style={{ width: inventoryVisual.markerSize, height: inventoryVisual.markerSize }}
                    />
                    </button>
                  </Fragment>
                );
              })}
            </div>
          </div>
        </div>
        ) : null}

        {visibleLaneOrder.includes('flow') ? (
        <div className={cn('border-t border-border/60 py-5', isLaneExpanded('flow') && 'grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)]')}>
          <LaneTitle title={t('catalogSenaSkuFlowLane')} tooltip={t('catalogSenaSkuFlowLaneTooltip')} />
          <div className="mb-3 flex items-start justify-between gap-3 px-2">
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <span className="size-2 rounded-full bg-foreground/20" />
                Service demand
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="size-2 rounded-full bg-foreground/45" />
                Retail demand
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="size-2 rounded-full bg-secondary" />
                Receipts
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="size-2 rounded-full bg-amber-600/85" />
                Adjustments
              </span>
            </div>
            <LaneExpandButton expanded={isLaneExpanded('flow')} title="Flow decomposition lane" onClick={() => toggleLaneExpanded('flow')} />
          </div>
          <div ref={flowScrollRef} className={cn('hidden-scrollbar overflow-x-auto overscroll-contain', isLaneExpanded('flow') && 'min-h-0 h-full')} onScroll={handleScrollerScroll}>
            <div
              className="relative grid rounded-md bg-muted/20 pb-3 pt-2"
              style={{
                width: contentWidth,
                paddingLeft: axisStartPadding,
                paddingRight: axisEndPadding,
                paddingTop: FLOW_LABEL_GUTTER_HEIGHT,
                gridTemplateColumns: `repeat(${Math.max(model.lanes.flowLane.intervals.length, 1)}, ${stretchedSlotWidth}px)`,
                minHeight: FLOW_LABEL_GUTTER_HEIGHT + expandedFlowPlotHeight,
              }}
            >
              {model.lanes.flowLane.intervals.map((interval, index) => {
                const plotHalfHeight = expandedFlowPlotHeight / 2;
                const flowStackHeights = deriveFlowStackHeights(interval, maxFlowMagnitude, {
                  demandMaxHeight: plotHalfHeight - 4,
                  supplyMaxHeight: plotHalfHeight - 4,
                  minHeight: 3,
                });
                const flowAnchorX = axisStartPadding + index * stretchedSlotWidth + stretchedSlotWidth / 2;
                return (
                  <Fragment key={interval.intervalIndex}>
                    {selectedIntervalIndex === interval.intervalIndex ? (
                      <ClampedChartDataLabel
                        anchorX={flowAnchorX}
                        anchorY={FLOW_LABEL_GUTTER_HEIGHT}
                        containerWidth={contentWidth}
                        containerHeight={FLOW_LABEL_GUTTER_HEIGHT + expandedFlowPlotHeight}
                        gap={flowVisual.dataLabelGap}
                        className="flex flex-col items-start gap-1 rounded-md border border-border/60 bg-background/95 shadow-sm"
                        style={{
                          padding: `${flowVisual.dataLabelPaddingY}px ${flowVisual.dataLabelPaddingX}px`,
                          fontSize: flowVisual.dataLabelFontSize,
                        }}
                      >
                        <span className="whitespace-nowrap text-foreground">
                          {`Service: -${Math.round(interval.serviceDemandMean)}`}
                        </span>
                        <span className="whitespace-nowrap text-foreground">
                          {`Retail: -${Math.round(interval.retailDemandMean)}`}
                        </span>
                        <span className="whitespace-nowrap text-foreground">
                          {`Receipts: +${Math.round(interval.receiptsMean)}`}
                        </span>
                        <span className="whitespace-nowrap text-foreground">
                          {`Adjustments: ${interval.adjustmentsMean >= 0 ? '+' : ''}${Math.round(interval.adjustmentsMean)}`}
                        </span>
                      </ClampedChartDataLabel>
                    ) : null}
                    <button
                      className="relative flex w-full items-stretch justify-center"
                      style={{ height: expandedFlowPlotHeight }}
                      type="button"
                      onClick={() => setSelectedIntervalIndex(interval.intervalIndex)}
                    >
                    <span className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border/70" />
                    <div className="relative h-full w-[85%] self-center">
                      <div className="absolute inset-x-0 top-1/2 h-1/2">
                        {flowStackHeights.demand.serviceHeight > 0 ? (
                          <span
                            className="absolute top-0 left-1/2 w-full -translate-x-1/2 rounded-none bg-foreground/20"
                            style={{ height: flowStackHeights.demand.serviceHeight }}
                          />
                        ) : null}
                        {flowStackHeights.demand.retailHeight > 0 ? (
                          <span
                            className="absolute left-1/2 w-full -translate-x-1/2 rounded-none bg-foreground/45"
                            style={{ top: flowStackHeights.demand.retailOffset, height: flowStackHeights.demand.retailHeight }}
                          />
                        ) : null}
                      </div>
                      <div className="absolute inset-x-0 bottom-1/2 h-1/2">
                        {flowStackHeights.supply.receiptsHeight > 0 ? (
                          <span
                            className="absolute bottom-0 left-1/2 w-full -translate-x-1/2 rounded-none bg-secondary"
                            style={{ height: flowStackHeights.supply.receiptsHeight }}
                          />
                        ) : null}
                        {flowStackHeights.supply.adjustmentHeight > 0 ? (
                          <span
                            className="absolute left-1/2 w-full -translate-x-1/2 rounded-none bg-amber-600/85"
                            style={{
                              bottom: flowStackHeights.supply.adjustmentOffset,
                              height: flowStackHeights.supply.adjustmentHeight,
                            }}
                          />
                        ) : null}
                      </div>
                    </div>
                    </button>
                  </Fragment>
                );
              })}
            </div>
          </div>
        </div>
        ) : null}

        {visibleLaneOrder.includes('pipeline') ? (
        <div className={cn('border-t border-border/60 pt-5', isLaneExpanded('pipeline') && 'grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)]')}>
          <LaneTitle title={t('catalogSenaSkuPipelineLane')} tooltip={t('catalogSenaSkuPipelineLaneTooltip')} />
          <div className="-mt-1 mb-3 flex justify-end">
            <LaneExpandButton expanded={isLaneExpanded('pipeline')} title="Pipeline lane" onClick={() => toggleLaneExpanded('pipeline')} />
          </div>
          <div ref={pipelineScrollRef} className={cn('hidden-scrollbar overflow-x-auto overflow-y-visible overscroll-contain', isLaneExpanded('pipeline') && 'min-h-0 h-full')} onScroll={handleScrollerScroll}>
            <div
              className="relative grid rounded-md bg-muted/20"
              style={{
                width: contentWidth,
                height: LABEL_GUTTER_HEIGHT + expandedPipelineBodyHeight,
                paddingLeft: axisStartPadding,
                paddingRight: axisEndPadding,
                paddingTop: LABEL_GUTTER_HEIGHT,
                gridTemplateColumns: `repeat(${Math.max(model.lanes.pipelineLane.intervals.length, 1)}, ${stretchedSlotWidth}px)`,
              }}
            >
              {model.lanes.pipelineLane.intervals.map((interval, index) => {
                const isSelected = selectedIntervalIndex === interval.intervalIndex;
                const isCompact = pipelineUsesCompactTile(stretchedSlotWidth);
                const isNumberOnly = pipelineUsesNumberOnlyTile(stretchedSlotWidth);
                const usesExternalDataLabel = pipelineUsesExternalDataLabel(stretchedSlotWidth);
                const tileLayout = pipelineTileLayout(stretchedSlotWidth);
                const pipelineAnchorX = axisStartPadding + index * stretchedSlotWidth + stretchedSlotWidth / 2;
                const pipelineTileTop = LABEL_GUTTER_HEIGHT + Math.max(0, (expandedPipelineBodyHeight - PIPELINE_TILE_MIN_HEIGHT) / 2);
                return (
                  <Fragment key={interval.intervalIndex}>
                    {isSelected ? (
                      <ClampedChartDataLabel
                        anchorX={pipelineAnchorX}
                        anchorY={pipelineTileTop}
                        containerWidth={contentWidth}
                        containerHeight={LABEL_GUTTER_HEIGHT + expandedPipelineBodyHeight}
                        gap={flowVisual.dataLabelGap}
                        className="flex flex-col items-start gap-1 rounded-md border border-border/70 bg-background font-medium text-foreground shadow-sm"
                        style={{
                          padding: `${flowVisual.dataLabelPaddingY}px ${flowVisual.dataLabelPaddingX}px`,
                          fontSize: flowVisual.dataLabelFontSize,
                        }}
                      >
                        {usesExternalDataLabel ? (
                          <>
                            <span className="whitespace-nowrap">{Math.round(interval.orderQuantityMean)} pending delivery</span>
                            <span className="whitespace-nowrap">{Math.round(interval.inTransitMean)} in transit</span>
                          </>
                        ) : (
                          <span className="whitespace-nowrap">{Math.round(interval.orderQuantityMean)} pending delivery</span>
                        )}
                      </ClampedChartDataLabel>
                    ) : null}
                    <button
                      className="relative flex self-end flex-col items-center justify-center gap-1 rounded-[1.35rem] border px-1.5 py-3 text-center transition-colors"
                      data-pipeline-tile="true"
                      style={{
                        ...pipelineTintStyle(interval.inTransitMean, maxPipelineInTransit),
                        height: expandedPipelineBodyHeight,
                        width: tileLayout.width,
                        marginLeft: tileLayout.inset,
                        marginRight: tileLayout.inset,
                      }}
                      type="button"
                      onClick={() => setSelectedIntervalIndex(interval.intervalIndex)}
                    >
                    {usesExternalDataLabel ? null : isNumberOnly ? (
                      <span className={`flex flex-col items-center justify-center gap-1 text-sm leading-none ${isSelected ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                        <span>{Math.round(interval.inTransitMean)}</span>
                        <Package className="size-3.5" />
                      </span>
                    ) : (
                      <span className={`inline-flex items-center justify-center gap-1 whitespace-nowrap text-sm leading-none ${isSelected ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                        <span>{Math.round(interval.inTransitMean)}</span>
                        <Package className="size-3.5" />
                      </span>
                    )}
                    {!isCompact && !isNumberOnly ? (
                      <span className={`text-sm leading-tight ${isSelected ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                        in transit
                      </span>
                    ) : null}
                    </button>
                  </Fragment>
                );
              })}
            </div>
          </div>
        </div>
        ) : null}
      </div>
    </section>
    </>
  );
}
