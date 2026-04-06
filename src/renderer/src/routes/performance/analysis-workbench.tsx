import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode, type UIEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  BadgePercent,
  ArrowUpRight,
  AudioLines,
  CircleGauge,
  CircleOff,
  Cog,
  FileSearch,
  Flame,
  ListTree,
  Map as MapIcon,
  MoonStar,
  PackageSearch,
  Package,
  Radio,
  Rows3,
  SearchCheck,
  Store,
  Waypoints,
  Wrench,
} from 'lucide-react';
import {
  AXIS_END_PADDING,
  AXIS_START_PADDING,
  clampScrollLeft,
  DEFAULT_SLOT_WIDTH,
  derivePrependedScrollLeft,
  deriveAxisContentWidth,
  deriveSlotCenterX,
  deriveViewportPageScrollLeft,
  INTERVAL_PAGE_SIZE,
  IntervalStrip,
  MIN_SLOT_WIDTH,
  SCROLL_EDGE_TOLERANCE,
  shouldLoadOlderIntervals,
} from '@/components/system/interval-strip';
import {
  buildPointCoordinatesWithDomain,
  buildPolylineWithDomain,
  buildTrajectoryBandPath,
  deriveFlowStackHeights,
  deriveLabelGutterOffset,
  SelectedIntervalColumnOverlay,
} from '@/components/system/timeline-chart';
import { RIGHT_RAIL_ASIDE_CLASS_NAME } from '@/components/system/right-rail-layout';
import {
  createHeaderedTableLayout,
  HeaderedTableCellStack,
  HeaderedTable,
  HeaderedTableBody,
  HeaderedTableHeader,
  HeaderedTableHeaderCell,
  HeaderedTableMobileLabel,
  HeaderedTableRow,
} from '@/components/system/headered-table';
import { Button } from '@/components/ui/button';
import { ChromeTabs, ChromeTabsList, ChromeTabsTrigger } from '@/components/ui/chrome-tabs';
import { cardFrameClassName, cardSurfaceClassName } from '@/components/ui/card';
import { rowHoverClassName } from '@/lib/interactive-surface';
import { cn } from '@/lib/utils';
import { statusPillClassName } from '@/lib/state-tones';
import { SectionLabel } from '@/routes/sku-detail/section-heading';
import { usePreferences } from '@/state/preferences';
import { PagedPanelNavigation } from '@/routes/detail-panels';
import { PerformanceSectionShell, PERFORMANCE_HEADER_SURFACE_CLASS_NAME } from './chrome';
import type {
  AnalysisEntityPressureRow,
  AnalysisObservationLedgerRow,
  AnalysisSection,
  AnalysisSelection,
  AnalysisWorkbenchViewModel,
} from './analysis-view-model';
import { PIPELINE_PILL_END_OFFSET, PIPELINE_PILL_START_OFFSET } from './analysis-view-model';

const pressureTableLayout = createHeaderedTableLayout({
  breakpoint: 'xl',
  columns: 'minmax(18rem,1.45fr) minmax(8rem,0.72fr) minmax(8rem,0.72fr) minmax(8rem,0.72fr) minmax(10rem,0.9fr)',
  gap: 4,
});

const NAV_OPTIONS: Array<{
  value: AnalysisSection;
  label: string;
  leading: ReactNode;
}> = [
  { value: 'workbench', label: 'Workbench', leading: <Waypoints className="size-4" /> },
  { value: 'pressure', label: 'Pressure', leading: <Rows3 className="size-4" /> },
  { value: 'observations', label: 'Observations', leading: <SearchCheck className="size-4" /> },
  { value: 'fragility', label: 'Fragility', leading: <MapIcon className="size-4" /> },
  { value: 'settings', label: 'Parameters', leading: <Cog className="size-4" /> },
];

const ANALYSIS_BOARD_CLASS_NAME = `${cardFrameClassName} ${cardSurfaceClassName} relative z-[1] overflow-hidden rounded-[2rem]`;
const ANALYSIS_RAIL_PANEL_CLASS_NAME = 'flex h-full flex-col bg-secondary/15 lg:rounded-l-none';

const ANALYSIS_SETTINGS_FIELDS = [
  {
    key: 'run-id',
    label: 'Run ID',
    tooltip: 'Unique identifier for the analysis run that produced the current posterior and diagnostics.',
    valueKey: 'runId',
  },
  {
    key: 'latest-observed',
    label: 'Latest observed',
    tooltip: 'Most recent observation timestamp included in this analysis window.',
    valueKey: 'latestObservedAt',
  },
  {
    key: 'observations-used',
    label: 'Observations used',
    tooltip: 'Count of observation records that remained after scope and coverage filtering.',
    valueKey: 'observationsUsed',
  },
  {
    key: 'intervals-in-view',
    label: 'Intervals in view',
    tooltip: 'Number of modeled intervals currently represented in the workbench and diagnostics.',
    valueKey: 'intervalCount',
  },
  {
    key: 'smoothing',
    label: 'Smoothing',
    tooltip: 'Whether smoothing is applied to reduce noise before diagnostics and posterior summaries are shown.',
    valueKey: 'smoothingLabel',
  },
  {
    key: 'effective-sample-size',
    label: 'Effective sample size',
    tooltip: 'Estimate of how much independent evidence the posterior behaves as if it contains after weighting and resampling.',
    valueKey: 'effectiveSampleSize',
  },
  {
    key: 'predictive-error',
    label: 'Predictive error',
    tooltip: 'Average gap between observed outcomes and what the posterior predictive distribution expected.',
    valueKey: 'predictiveError',
  },
  {
    key: 'coverage-estimate',
    label: 'Coverage estimate',
    tooltip: 'Share of the expected evidence surface that was actually observed across the current analysis window.',
    valueKey: 'coverageEstimate',
  },
  {
    key: 'scope',
    label: 'Scope',
    tooltip: 'Entity slice included in this run, such as all entities, SKU-only, service-only, or a mixed system scan.',
    valueKey: 'scopeSummary',
  },
] as const;

function sectionSupportsRightRail(section: AnalysisSection) {
  return section !== 'observations' && section !== 'fragility';
}

function analysisRailBlockClassName() {
  return 'border-t border-border/60 px-5 py-5 first:border-t-0';
}

function scoreCellTone(label: string) {
  if (label === 'critical' || label === 'high') {
    return 'danger';
  }
  if (label === 'medium') {
    return 'warning';
  }
  return 'info';
}

function entityIcon(type: AnalysisEntityPressureRow['entityType']) {
  if (type === 'sku') {
    return <Package className="size-4 text-muted-foreground" />;
  }
  return <Store className="size-4 text-muted-foreground" />;
}

function selectionsEqual(left: AnalysisSelection, right: AnalysisSelection) {
  if (left.type !== right.type) {
    return false;
  }
  if (left.type === 'overview' && right.type === 'overview') {
    return true;
  }
  if (left.type === 'interval' && right.type === 'interval') {
    return left.intervalIndex === right.intervalIndex;
  }
  if (left.type === 'entity' && right.type === 'entity') {
    return left.entityId === right.entityId && left.entityType === right.entityType;
  }
  if (left.type === 'observation' && right.type === 'observation') {
    return left.observationId === right.observationId;
  }
  return false;
}

type IntervalRailSectionKey = 'observed-signals' | 'what-happened' | 'orders-transit-lead-time';

function regimeTint(regime: string) {
  const normalized = regime.trim().toLowerCase();
  if (normalized.includes('promo')) {
    return 'border-amber-200/80 bg-amber-50/85';
  }
  if (normalized.includes('spike')) {
    return 'border-rose-200/80 bg-rose-50/85';
  }
  if (normalized.includes('lull')) {
    return 'border-emerald-200/80 bg-emerald-50/85';
  }
  if (normalized.includes('correction')) {
    return 'border-sky-200/80 bg-sky-50/85';
  }
  if (normalized.includes('stockout')) {
    return 'border-red-200/80 bg-red-50/85';
  }
  return 'border-stone-200/80 bg-stone-50/90';
}

function regimeFill(regime: string) {
  const normalized = regime.trim().toLowerCase();
  if (normalized.includes('promo')) {
    return 'rgba(248, 224, 184, 0.72)';
  }
  if (normalized.includes('spike')) {
    return 'rgba(245, 196, 176, 0.72)';
  }
  if (normalized.includes('lull')) {
    return 'rgba(216, 232, 222, 0.72)';
  }
  if (normalized.includes('correction')) {
    return 'rgba(207, 218, 234, 0.74)';
  }
  if (normalized.includes('stockout')) {
    return 'rgba(239, 192, 192, 0.76)';
  }
  return 'rgba(244, 223, 207, 0.64)';
}

function regimeIcon(regime: string) {
  const normalized = regime.trim().toLowerCase();
  if (normalized.includes('promo')) {
    return <BadgePercent className="size-4" />;
  }
  if (normalized.includes('spike')) {
    return <Flame className="size-4" />;
  }
  if (normalized.includes('lull')) {
    return <MoonStar className="size-4" />;
  }
  if (normalized.includes('correction')) {
    return <Wrench className="size-4" />;
  }
  if (normalized.includes('stockout')) {
    return <CircleOff className="size-4" />;
  }
  return <CircleGauge className="size-4" />;
}

function HeaderTooltipLabel({
  children,
  tooltip,
}: {
  children: ReactNode;
  tooltip: string;
}) {
  return <SectionLabel tooltip={tooltip}>{children}</SectionLabel>;
}

const LANE_LABEL_COLUMN = '14rem';
const CHART_GUTTER_HEIGHT = 24;
const CHART_VIEWBOX_HEIGHT = 42;
const INVENTORY_CHART_CONTENT_HEIGHT = 156;
const LEAD_TIME_CHART_CONTENT_HEIGHT = 96;

function LaneLabel({
  title,
  subtitle,
  tooltip,
}: {
  title: string;
  subtitle: string;
  tooltip: string;
}) {
  return (
    <div className="sticky left-0 z-[1] flex h-full min-h-[8.75rem] flex-col justify-between rounded-[1.2rem] border border-border/60 bg-white/95 px-4 py-3 backdrop-blur">
      <div className="grid gap-2">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          <SectionLabel tooltip={tooltip}>{title}</SectionLabel>
        </p>
        <p className="text-sm leading-6 text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

function SignalsWrap({ values }: { values: string[] }) {
  if (values.length === 0) {
    return <span className="text-xs text-muted-foreground">No signal</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {values.slice(0, 4).map((value) => (
        <span key={value} className="rounded-full border border-border/60 bg-background/80 px-2 py-1 text-[0.68rem] text-muted-foreground">
          {value}
        </span>
      ))}
    </div>
  );
}

function AnalysisRailSection({
  title,
  tooltip,
  icon,
  children,
  flash,
}: {
  title: string;
  tooltip: string;
  icon: ReactNode;
  children: ReactNode;
  flash?: boolean;
}) {
  return (
    <section
      className={cn(
        analysisRailBlockClassName(),
        'scroll-mt-6 rounded-[1.1rem] transition-colors duration-300',
        flash && 'bg-primary/[0.08] ring-1 ring-primary/20',
      )}
    >
      <div className="mb-4 flex items-center gap-2">
        <span className="text-primary">{icon}</span>
        <h2 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
          <SectionLabel tooltip={tooltip}>{title}</SectionLabel>
        </h2>
      </div>
      {children}
    </section>
  );
}

function AnalysisRailList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn('divide-y divide-border/50', className)}>{children}</div>;
}

function AnalysisRailRow({
  primary,
  secondary,
}: {
  primary: ReactNode;
  secondary?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[1rem] px-3 py-3">
      <div className="min-w-0 pr-3 text-sm text-foreground">{primary}</div>
      {secondary ? <div className="shrink-0 text-sm text-muted-foreground">{secondary}</div> : null}
    </div>
  );
}

function DiagnosticStrip({ model }: { model: AnalysisWorkbenchViewModel }) {
  return (
    <section className={`${PERFORMANCE_HEADER_SURFACE_CLASS_NAME} overflow-hidden`}>
      <div className="grid divide-y divide-border/60 bg-border/40 md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-6">
        {model.diagnostics.map((entry) => (
          <div key={entry.key} className="bg-white px-5 py-4 sm:px-6">
            <p className="text-[0.72rem] font-medium tracking-[0.08em] text-muted-foreground/80">{entry.label}</p>
            <p className="mt-2 text-[1.45rem] font-semibold tracking-[-0.04em] text-foreground">{entry.value}</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{entry.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function InternalNav({
  section,
  showRightRailCards,
}: {
  section: AnalysisSection;
  showRightRailCards: boolean;
}) {
  return (
    <div className={`relative flex overflow-x-auto overflow-y-hidden px-5 sm:px-6 ${showRightRailCards ? 'lg:pr-[calc(320px+1.5rem)]' : ''}`}>
      <ChromeTabsList aria-label="Select analysis surface" className="min-w-max">
        {NAV_OPTIONS.map((option) => (
          <ChromeTabsTrigger key={option.value} leading={option.leading} value={option.value}>
            {option.label}
          </ChromeTabsTrigger>
        ))}
      </ChromeTabsList>
    </div>
  );
}

function SystemLedger({
  hasOlderIntervals,
  isLoadingOlderIntervals,
  loadOlderIntervals,
  model,
  selectedIntervalIndex,
  setSelection,
  onIntervalChartLabelClick,
  showRightRailCards,
}: {
  hasOlderIntervals: boolean;
  isLoadingOlderIntervals: boolean;
  loadOlderIntervals: () => Promise<number>;
  model: AnalysisWorkbenchViewModel;
  selectedIntervalIndex: number | null;
  setSelection: (value: AnalysisSelection) => void;
  onIntervalChartLabelClick: (intervalIndex: number, section: IntervalRailSectionKey) => void;
  showRightRailCards: boolean;
}) {
  const { language } = usePreferences();
  const intervalScrollRef = useRef<HTMLDivElement | null>(null);
  const regimeScrollRef = useRef<HTMLDivElement | null>(null);
  const inventoryScrollRef = useRef<HTMLDivElement | null>(null);
  const pipelineScrollRef = useRef<HTMLDivElement | null>(null);
  const leadTimeScrollRef = useRef<HTMLDivElement | null>(null);
  const syncingScrollRef = useRef(false);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const intervalEntries = model.intervals.map((interval) => ({
    intervalIndex: interval.intervalIndex,
    startAt: interval.startAt,
    endAt: interval.endAt,
  }));
  const itemCount = intervalEntries.length;
  const syncRefs = [intervalScrollRef, regimeScrollRef, inventoryScrollRef, pipelineScrollRef, leadTimeScrollRef];
  const slotWidth = itemCount > 0 && viewportWidth > 0
    ? Math.max(MIN_SLOT_WIDTH, (viewportWidth - AXIS_START_PADDING - AXIS_END_PADDING) / Math.min(itemCount, INTERVAL_PAGE_SIZE))
    : DEFAULT_SLOT_WIDTH;
  const contentWidth = deriveAxisContentWidth({
    itemCount,
    slotWidth,
    axisStartPadding: AXIS_START_PADDING,
    axisEndPadding: AXIS_END_PADDING,
  });
  const clampedScrollLeft = clampScrollLeft(scrollLeft, viewportWidth, contentWidth);
  const canScrollLeft = clampedScrollLeft > SCROLL_EDGE_TOLERANCE;
  const canScrollRight = clampedScrollLeft + viewportWidth < contentWidth - SCROLL_EDGE_TOLERANCE;
  const selectedIntervalPosition = selectedIntervalIndex == null
    ? null
    : model.workbench.regimePriceLane.intervals.find((interval) => interval.intervalIndex === selectedIntervalIndex)?.intervalPosition ?? null;
  const visibleRegimes = useMemo(
    () => [...new Map(model.workbench.regimePriceLane.intervals.map((interval) => [interval.dominantRegime, interval.dominantRegime])).values()],
    [model.workbench.regimePriceLane.intervals],
  );
  const inventoryPoints = model.workbench.inventoryDemandLane.points;
  const inventoryMeanValues = inventoryPoints.map((point) => point.inventoryMean);
  const inventoryLowValues = inventoryPoints.map((point) => point.inventoryLow);
  const inventoryHighValues = inventoryPoints.map((point) => point.inventoryHigh);
  const inventoryDomainMin = inventoryLowValues.length > 0 ? Math.min(...inventoryLowValues) : 0;
  const inventoryDomainMax = inventoryHighValues.length > 0 ? Math.max(...inventoryHighValues) : 1;
  const inventoryPolyline = buildPolylineWithDomain(
    inventoryMeanValues,
    slotWidth,
    CHART_VIEWBOX_HEIGHT,
    inventoryDomainMin,
    inventoryDomainMax,
    { axisStartPadding: AXIS_START_PADDING, topPadding: 5, bottomPadding: 5 },
  );
  const inventoryCoordinates = buildPointCoordinatesWithDomain(
    inventoryMeanValues,
    slotWidth,
    CHART_VIEWBOX_HEIGHT,
    inventoryDomainMin,
    inventoryDomainMax,
    { axisStartPadding: AXIS_START_PADDING, topPadding: 5, bottomPadding: 5 },
  );
  const inventoryBandPath = buildTrajectoryBandPath(
    inventoryLowValues,
    inventoryHighValues,
    slotWidth,
    CHART_VIEWBOX_HEIGHT,
    inventoryDomainMin,
    inventoryDomainMax,
    { axisStartPadding: AXIS_START_PADDING, topPadding: 5, bottomPadding: 5 },
  );
  const leadTimePoints = model.workbench.leadTimeLane.points;
  const leadTimeMeanValues = leadTimePoints.map((point) => point.meanDays);
  const leadTimeLowValues = leadTimePoints.map((point) => point.lowDays);
  const leadTimeHighValues = leadTimePoints.map((point) => point.highDays);
  const leadTimeDomainMin = leadTimeLowValues.length > 0 ? Math.min(...leadTimeLowValues) : 0;
  const leadTimeDomainMax = leadTimeHighValues.length > 0 ? Math.max(...leadTimeHighValues) : 1;
  const leadTimePolyline = buildPolylineWithDomain(
    leadTimeMeanValues,
    slotWidth,
    CHART_VIEWBOX_HEIGHT,
    leadTimeDomainMin,
    leadTimeDomainMax,
    { axisStartPadding: AXIS_START_PADDING, topPadding: 5, bottomPadding: 5 },
  );
  const leadTimeCoordinates = buildPointCoordinatesWithDomain(
    leadTimeMeanValues,
    slotWidth,
    CHART_VIEWBOX_HEIGHT,
    leadTimeDomainMin,
    leadTimeDomainMax,
    { axisStartPadding: AXIS_START_PADDING, topPadding: 5, bottomPadding: 5 },
  );
  const leadTimeBandPath = buildTrajectoryBandPath(
    leadTimeLowValues,
    leadTimeHighValues,
    slotWidth,
    CHART_VIEWBOX_HEIGHT,
    leadTimeDomainMin,
    leadTimeDomainMax,
    { axisStartPadding: AXIS_START_PADDING, topPadding: 5, bottomPadding: 5 },
  );
  const pipelineRowHeight = 28;
  const pipelineChartContentHeight = Math.max(122, 18 + Math.max(0, model.workbench.pipelineLane.rowCount - 1) * pipelineRowHeight + 28);
  const pipelineLaneMinHeight = pipelineChartContentHeight;
  const selectedPipelineSpan = selectedIntervalIndex == null
    ? null
    : model.workbench.pipelineLane.spans.find((span) => span.intervalIndex === selectedIntervalIndex) ?? null;
  const selectedPipelineMarkers = selectedIntervalIndex == null
    ? []
    : model.workbench.pipelineLane.markers.filter((marker) => marker.intervalIndex === selectedIntervalIndex);
  const selectedPipelineLabels = [
    ...(selectedPipelineSpan ? [`${Math.round(selectedPipelineSpan.orderProbability * 100)}% order probability`] : []),
    ...selectedPipelineMarkers.map((marker) => `${marker.kind === 'order' ? 'Order' : 'Receipt'} ${Math.round(marker.quantityMean)}`),
  ];
  const selectedPipelineLabelX = selectedIntervalPosition == null
    ? null
    : deriveSlotCenterX({ index: selectedIntervalPosition, slotWidth, axisStartPadding: AXIS_START_PADDING });
  const maybeLoadOlder = async (nextScrollLeft: number) => {
    if (!shouldLoadOlderIntervals({ hasOlder: hasOlderIntervals, isLoadingOlder: isLoadingOlderIntervals, scrollLeft: nextScrollLeft })) {
      return;
    }
    const prependedCount = await loadOlderIntervals();
    if (prependedCount > 0) {
      setScrollLeft((current) =>
        derivePrependedScrollLeft({
          currentScrollLeft: current,
          prependedCount,
          slotWidth,
        }),
      );
    }
  };

  useEffect(() => {
    const node = intervalScrollRef.current;
    if (!node) {
      return;
    }
    const updateViewportWidth = () => setViewportWidth(node.clientWidth);
    const observer = new ResizeObserver(() => updateViewportWidth());
    observer.observe(node);
    updateViewportWidth();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (scrollLeft === clampedScrollLeft) {
      return;
    }
    setScrollLeft(clampedScrollLeft);
  }, [clampedScrollLeft, scrollLeft]);

  useEffect(() => {
    syncingScrollRef.current = true;
    for (const ref of syncRefs) {
      const node = ref.current;
      if (!node) {
        continue;
      }
      if (Math.abs(node.scrollLeft - clampedScrollLeft) > 1) {
        node.scrollLeft = clampedScrollLeft;
      }
    }
    requestAnimationFrame(() => {
      syncingScrollRef.current = false;
    });
  }, [clampedScrollLeft]);

  const handleSharedScroll = (event: UIEvent<HTMLDivElement>) => {
    if (syncingScrollRef.current) {
      return;
    }
    const nextScrollLeft = event.currentTarget.scrollLeft;
    setScrollLeft(nextScrollLeft);
    void maybeLoadOlder(nextScrollLeft);
  };

  const scrollByViewport = (direction: -1 | 1) => {
    setScrollLeft((current) =>
      deriveViewportPageScrollLeft({
        contentWidth,
        currentScrollLeft: current,
        direction,
        slotWidth,
        viewportWidth,
      }),
    );
  };

  const laneGridStyle = { gridTemplateColumns: `${LANE_LABEL_COLUMN} minmax(0,1fr)` };

  return (
    <PerformanceSectionShell
      title="SENA system ledger"
      tooltip="One synchronized ledger across regime, demand decomposition, pipeline posture, and latent lead-time drift."
      description="Observation to inference to operational consequence in one canvas. Each interval stays aligned across regime, flow, pipeline, and lead-time lanes."
      className={showRightRailCards ? 'lg:rounded-r-none' : undefined}
      contentClassName="px-0 py-0"
    >
      <div className="grid h-full gap-4 px-6 py-5 [grid-template-rows:auto_minmax(0,1fr)]">
        <div className="grid gap-3" style={laneGridStyle}>
          <div />
          <IntervalStrip
            activeIndex={selectedIntervalIndex}
            axisContentWidth={contentWidth}
            axisEndPadding={AXIS_END_PADDING}
            axisStartPadding={AXIS_START_PADDING}
            canScrollLeft={canScrollLeft}
            canScrollRight={canScrollRight}
            intervals={intervalEntries}
            language={language}
            onScroll={handleSharedScroll}
            scrollByViewport={scrollByViewport}
            scrollRef={intervalScrollRef}
            slotWidth={slotWidth}
            onSelect={(intervalIndex) => onIntervalChartLabelClick(intervalIndex, 'observed-signals')}
          />
        </div>

        <div className="grid min-h-0 gap-4 [grid-template-rows:repeat(4,minmax(0,1fr))]">
          <div className="grid h-full min-h-0 gap-3" style={laneGridStyle}>
            <LaneLabel
              subtitle="Continuous regime state with price and stockout cues carried as lightweight markers instead of interval cards."
              title="Regime + price lane"
              tooltip="The current system regime plus interval-level price and stockout evidence."
            />
            <div className="grid min-h-0 gap-2 [grid-template-rows:auto_minmax(0,1fr)]">
              <div className="flex flex-wrap gap-3 px-1 text-xs text-muted-foreground">
                {visibleRegimes.map((regime) => (
                  <span key={regime} className="inline-flex items-center gap-2">
                    <span className={cn('inline-flex size-5 items-center justify-center rounded-full border border-foreground/10', regimeTint(regime))}>
                      {regimeIcon(regime)}
                    </span>
                    {regime}
                  </span>
                ))}
                <span className="inline-flex items-center gap-2">
                  <span className="inline-flex min-w-7 items-center justify-center rounded-full bg-white/78 px-2 py-0.5 text-[0.62rem] font-medium text-foreground shadow-sm">
                    P
                  </span>
                  Price cue count
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="inline-flex min-w-7 items-center justify-center rounded-full bg-white/78 px-2 py-0.5 text-[0.62rem] font-medium text-foreground shadow-sm">
                    S
                  </span>
                  Stockout cue count
                </span>
              </div>
              <div
                ref={regimeScrollRef}
                className="hidden-scrollbar min-h-0 overflow-x-auto overscroll-contain rounded-[1.2rem] border border-border/60 bg-muted/20"
                onScroll={handleSharedScroll}
              >
                <div className="relative h-full min-h-[92px]" style={{ width: contentWidth }}>
                  <SelectedIntervalColumnOverlay
                    activeIndex={selectedIntervalPosition}
                    axisContentWidth={contentWidth}
                    axisEndPadding={AXIS_END_PADDING}
                    axisStartPadding={AXIS_START_PADDING}
                    itemCount={itemCount}
                    slotWidth={slotWidth}
                    className="inset-y-2"
                  />
                  <div
                    className="absolute inset-y-0 grid items-center px-0"
                    style={{
                      paddingLeft: AXIS_START_PADDING,
                      paddingRight: AXIS_END_PADDING,
                      gridTemplateColumns: `repeat(${Math.max(itemCount, 1)}, ${slotWidth}px)`,
                    }}
                  >
                    {model.workbench.regimePriceLane.intervals.map((interval) => (
                      <button
                        key={`regime:${interval.intervalIndex}`}
                        aria-label={`${interval.dominantRegime} regime, ${interval.cueSummary}`}
                        className={cn(
                          'relative mx-1 h-[4.1rem] rounded-[1rem] border text-left transition-transform hover:-translate-y-0.5',
                          selectedIntervalIndex === interval.intervalIndex ? 'border-foreground/20 shadow-sm' : 'border-white/70',
                        )}
                        style={{ backgroundColor: regimeFill(interval.dominantRegime) }}
                        data-analysis-datalabel="true"
                        type="button"
                        onClick={() => onIntervalChartLabelClick(interval.intervalIndex, 'observed-signals')}
                      >
                        <span className="absolute left-1/2 top-[1.35rem] inline-flex -translate-x-1/2 -translate-y-1/2 items-center justify-center text-foreground/75">
                          {regimeIcon(interval.dominantRegime)}
                        </span>
                        <span className="absolute inset-x-2.5 bottom-2 flex items-center gap-1.5">
                          {interval.priceCueCount > 0 ? (
                            <span className="inline-flex items-center rounded-full bg-white/78 px-2 py-0.5 text-[0.62rem] font-medium text-foreground">
                              {interval.priceCueCount}P
                            </span>
                          ) : null}
                          {interval.stockoutCueCount > 0 ? (
                            <span className="inline-flex items-center rounded-full bg-white/78 px-2 py-0.5 text-[0.62rem] font-medium text-foreground">
                              {interval.stockoutCueCount}S
                            </span>
                          ) : null}
                          {interval.priceCueCount === 0 && interval.stockoutCueCount === 0 ? (
                            <span className="text-[0.62rem] text-foreground/60">Quiet</span>
                          ) : null}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid h-full min-h-0 gap-3" style={laneGridStyle}>
            <LaneLabel
              subtitle="Inventory trajectory stays continuous while service demand, retail demand, receipts, and adjustments remain interval-native."
              title="Inventory + demand lane"
              tooltip="The demand decomposition that turns sparse observations into a reconstructed stock story."
            />
            <div className="grid min-h-0 gap-2 [grid-template-rows:auto_minmax(0,1fr)]">
              <div className="flex flex-wrap gap-3 px-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block h-2 w-6 rounded-[0.2rem] bg-foreground/12" />
                  Inventory band
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block h-px w-7 bg-foreground" />
                  Inventory mean
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="size-2 rounded-full bg-slate-500/70" />
                  Service demand
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="size-2 rounded-full bg-slate-800/80" />
                  Retail demand
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="size-2 rounded-full bg-emerald-600/80" />
                  Receipts
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="size-2 rounded-full bg-amber-600/85" />
                  Adjustments
                </span>
              </div>
              <div
                ref={inventoryScrollRef}
                className="hidden-scrollbar min-h-0 overflow-x-auto overscroll-contain rounded-[1.2rem] border border-border/60 bg-muted/20 px-0"
                onScroll={handleSharedScroll}
              >
                <div className="relative flex h-full min-h-[168px] items-center" style={{ width: contentWidth }}>
                  <SelectedIntervalColumnOverlay
                    activeIndex={selectedIntervalPosition}
                    axisContentWidth={contentWidth}
                    axisEndPadding={AXIS_END_PADDING}
                    axisStartPadding={AXIS_START_PADDING}
                    itemCount={itemCount}
                    slotWidth={slotWidth}
                    className="inset-y-2"
                  />
                  <div className="relative w-full" style={{ height: INVENTORY_CHART_CONTENT_HEIGHT }}>
                    <svg
                      aria-hidden="true"
                      className="absolute left-0 top-0 w-full"
                      preserveAspectRatio="none"
                      style={{ height: 72, top: CHART_GUTTER_HEIGHT }}
                      viewBox={`0 0 ${Math.max(contentWidth, 1)} ${CHART_VIEWBOX_HEIGHT}`}
                    >
                      {inventoryBandPath ? <path d={inventoryBandPath} fill="currentColor" className="text-foreground/10" /> : null}
                      <polyline fill="none" points={inventoryPolyline} stroke="currentColor" strokeWidth="1.8" className="text-foreground" />
                    </svg>
                    {inventoryCoordinates.map((point, index) => {
                      const entry = inventoryPoints[index];
                      if (!entry) {
                        return null;
                      }
                      const isSelected = selectedIntervalIndex === entry.intervalIndex;
                      return (
                        <button
                          key={`inventory-point:${entry.intervalIndex}`}
                          aria-label={`Inventory ${Math.round(entry.inventoryMean)} units in interval ${entry.intervalIndex + 1}`}
                          className="absolute z-[2] -translate-x-1/2 -translate-y-1/2"
                          style={{
                            left: point.x,
                            top: deriveLabelGutterOffset({
                              plotY: point.y,
                              plotHeight: 72,
                              gutterHeight: CHART_GUTTER_HEIGHT,
                              viewBoxHeight: CHART_VIEWBOX_HEIGHT,
                            }),
                          }}
                          data-analysis-datalabel="true"
                          type="button"
                          onClick={() => onIntervalChartLabelClick(entry.intervalIndex, 'what-happened')}
                        >
                          {isSelected ? (
                            <span className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-full border border-border/70 bg-background px-2 py-0.5 text-[10px] font-medium text-foreground shadow-sm">
                              {Math.round(entry.inventoryMean)}u
                            </span>
                          ) : null}
                          <span className={cn('block size-3 rounded-full border-2', isSelected ? 'border-foreground bg-foreground' : 'border-foreground/55 bg-background')} />
                        </button>
                      );
                    })}
                    <div
                      className="absolute left-0 top-[96px] grid"
                      style={{
                        paddingLeft: AXIS_START_PADDING,
                        paddingRight: AXIS_END_PADDING,
                        gridTemplateColumns: `repeat(${Math.max(itemCount, 1)}, ${slotWidth}px)`,
                      }}
                    >
                      {inventoryPoints.map((point) => {
                        const flowStackHeights = deriveFlowStackHeights(
                          point,
                          model.workbench.inventoryDemandLane.maxFlowMagnitude,
                          {
                            demandMaxHeight: 24,
                            supplyMaxHeight: 24,
                            minHeight: 2,
                          },
                        );

                        return (
                          <button
                            key={`flow:${point.intervalIndex}`}
                            aria-label={`Service demand ${Math.round(point.serviceDemandMean)}, retail demand ${Math.round(point.retailDemandMean)}, receipts ${Math.round(point.receiptsMean)}, adjustments ${Math.round(point.adjustmentsMean)}`}
                            className="relative h-[60px]"
                            data-analysis-datalabel="true"
                            type="button"
                            onClick={() => onIntervalChartLabelClick(point.intervalIndex, 'what-happened')}
                          >
                            <span className="absolute inset-x-1 top-1/2 h-px -translate-y-1/2 bg-border/80" />
                            {flowStackHeights.supply.receiptsHeight > 0 ? (
                              <span className="absolute bottom-1/2 left-1/2 w-[32%] -translate-x-1/2 rounded-none bg-emerald-600/80" style={{ height: flowStackHeights.supply.receiptsHeight }} />
                            ) : null}
                            {flowStackHeights.supply.adjustmentHeight > 0 ? (
                              <span
                                className="absolute left-1/2 w-[32%] -translate-x-1/2 rounded-none bg-amber-600/85"
                                style={{
                                  bottom: `calc(50% + ${flowStackHeights.supply.adjustmentOffset}px)`,
                                  height: flowStackHeights.supply.adjustmentHeight,
                                }}
                              />
                            ) : null}
                            {flowStackHeights.demand.serviceHeight > 0 ? (
                              <span className="absolute left-1/2 top-1/2 w-[32%] -translate-x-1/2 rounded-none bg-slate-500/70" style={{ height: flowStackHeights.demand.serviceHeight }} />
                            ) : null}
                            {flowStackHeights.demand.retailHeight > 0 ? (
                              <span
                                className="absolute left-1/2 w-[32%] -translate-x-1/2 rounded-none bg-slate-800/80"
                                style={{
                                  top: `calc(50% + ${flowStackHeights.demand.retailOffset}px)`,
                                  height: flowStackHeights.demand.retailHeight,
                                }}
                              />
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid h-full min-h-0 gap-3" style={laneGridStyle}>
            <LaneLabel
              subtitle="Aggregate transit windows approximate the pipeline story now, with order and receipt activity pulled out as explicit markers."
              title="Pipeline lane"
              tooltip="Pipeline posterior across in-transit stock, order placement, receipt expectation, and transit age."
            />
            <div className="grid min-h-0 gap-2 [grid-template-rows:auto_minmax(0,1fr)]">
              <div className="flex flex-wrap gap-3 px-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block h-3 w-8 rounded-full border border-emerald-700/25 bg-emerald-600/20" />
                  In-transit window
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block h-3 w-8 rounded-full border border-rose-300/70 bg-rose-100/75" />
                  Overdue window
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block size-2 rotate-45 rounded-[0.2rem] bg-sky-600/85" />
                  Order cue
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block size-2 rounded-full bg-emerald-600/85" />
                  Receipt cue
                </span>
              </div>
              <div
                ref={pipelineScrollRef}
                className="hidden-scrollbar min-h-0 overflow-x-auto overscroll-contain rounded-[1.2rem] border border-border/60 bg-muted/20"
                onScroll={handleSharedScroll}
              >
                <div className="relative flex h-full items-center" style={{ width: contentWidth, minHeight: pipelineLaneMinHeight }}>
                  <SelectedIntervalColumnOverlay
                    activeIndex={selectedIntervalPosition}
                    axisContentWidth={contentWidth}
                    axisEndPadding={AXIS_END_PADDING}
                    axisStartPadding={AXIS_START_PADDING}
                    itemCount={itemCount}
                    slotWidth={slotWidth}
                    className="inset-y-2"
                  />
                  <div className="relative w-full" style={{ height: pipelineChartContentHeight }}>
                    {selectedPipelineLabelX != null && selectedPipelineLabels.length > 0 ? (
                      <div
                        className="pointer-events-none absolute z-[3] flex -translate-x-1/2 flex-col items-center gap-1"
                        style={{ left: selectedPipelineLabelX, top: 8 }}
                      >
                        {selectedPipelineLabels.map((label, index) => (
                          <span
                            key={`${label}:${index}`}
                            className="whitespace-nowrap rounded-full border border-border/70 bg-background px-2 py-0.5 text-[10px] font-medium text-foreground shadow-sm"
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {model.workbench.pipelineLane.spans.map((span) => {
                      const left = AXIS_START_PADDING + span.startPosition * slotWidth + slotWidth * PIPELINE_PILL_START_OFFSET;
                      const right = AXIS_START_PADDING + span.endPosition * slotWidth + slotWidth * PIPELINE_PILL_END_OFFSET;
                      const width = Math.max(slotWidth * 0.32, right - left);
                      const top = 18 + span.row * pipelineRowHeight;

                      return (
                        <button
                          key={span.key}
                          aria-label={`${Math.round(span.inTransitMean)} in transit, ${Math.round(span.orderQuantityMean)} ordered, ${Math.round(span.receiptQuantityMean)} expected receipt`}
                          className={cn(
                            'absolute flex h-5 items-center rounded-full border px-2 text-[0.62rem] font-medium transition-colors',
                            span.overdue
                              ? 'border-rose-300/70 bg-rose-100/75 text-rose-900'
                              : 'border-emerald-700/20 bg-emerald-600/20 text-emerald-900',
                          )}
                          style={{ left, top, width }}
                          data-analysis-datalabel="true"
                          type="button"
                          onClick={() => onIntervalChartLabelClick(span.intervalIndex, 'orders-transit-lead-time')}
                        >
                          <span className="truncate">{Math.round(span.inTransitMean)} in transit</span>
                        </button>
                      );
                    })}
                    {model.workbench.pipelineLane.markers.map((marker) => {
                      const x = deriveSlotCenterX({ index: marker.intervalPosition, slotWidth, axisStartPadding: AXIS_START_PADDING });
                      const top = 18 + marker.row * pipelineRowHeight + (marker.kind === 'receipt' ? 2 : -7);
                      return (
                        <button
                          key={marker.key}
                          aria-label={`${marker.kind === 'order' ? 'Order' : 'Receipt'} cue ${Math.round(marker.quantityMean)} units`}
                          className="absolute z-[2] -translate-x-1/2"
                          data-analysis-datalabel="true"
                          style={{ left: x, top }}
                          type="button"
                          onClick={() => onIntervalChartLabelClick(marker.intervalIndex, 'orders-transit-lead-time')}
                        >
                          <span
                            className={cn(
                              'block size-3 border border-white shadow-sm',
                              marker.kind === 'order' ? 'rotate-45 rounded-[0.25rem] bg-sky-600/85' : 'rounded-full bg-emerald-600/85',
                            )}
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid h-full min-h-0 gap-3" style={laneGridStyle}>
            <LaneLabel
              subtitle="Lead-time drift reads as a trajectory with spread, while variability class stays available on selection instead of printed everywhere."
              title="Lead-time lane"
              tooltip="The latent lead-time state SENA is carrying at each interval."
            />
            <div className="grid min-h-0 gap-2 [grid-template-rows:auto_minmax(0,1fr)]">
              <div className="flex flex-wrap gap-3 px-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block h-2 w-6 rounded-[0.2rem] bg-sky-600/14" />
                  Spread band
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block h-px w-7 bg-sky-700/80" />
                  Mean lead time
                </span>
              </div>
              <div
                ref={leadTimeScrollRef}
                className="hidden-scrollbar min-h-0 overflow-x-auto overscroll-contain rounded-[1.2rem] border border-border/60 bg-muted/20"
                onScroll={handleSharedScroll}
              >
                <div className="relative flex h-full min-h-[132px] items-center" style={{ width: contentWidth }}>
                  <SelectedIntervalColumnOverlay
                    activeIndex={selectedIntervalPosition}
                    axisContentWidth={contentWidth}
                    axisEndPadding={AXIS_END_PADDING}
                    axisStartPadding={AXIS_START_PADDING}
                    itemCount={itemCount}
                    slotWidth={slotWidth}
                    className="inset-y-2"
                  />
                  <div className="relative w-full" style={{ height: LEAD_TIME_CHART_CONTENT_HEIGHT }}>
                    <svg
                      aria-hidden="true"
                      className="absolute left-0 top-0 w-full"
                      preserveAspectRatio="none"
                      style={{ height: 72, top: CHART_GUTTER_HEIGHT }}
                      viewBox={`0 0 ${Math.max(contentWidth, 1)} ${CHART_VIEWBOX_HEIGHT}`}
                    >
                      {leadTimeBandPath ? <path d={leadTimeBandPath} fill="currentColor" className="text-sky-600/14" /> : null}
                      <polyline fill="none" points={leadTimePolyline} stroke="currentColor" strokeWidth="1.8" className="text-sky-700/80" />
                    </svg>
                    {leadTimeCoordinates.map((point, index) => {
                      const entry = leadTimePoints[index];
                      if (!entry) {
                        return null;
                      }
                      const isSelected = selectedIntervalIndex === entry.intervalIndex;
                      const spreadDays = Math.max(0, (entry.highDays - entry.lowDays) / 2);
                      return (
                        <button
                          key={`lead-time:${entry.intervalIndex}`}
                          aria-label={`Lead time ${entry.meanDays.toFixed(1)} days`}
                          className="absolute z-[2] -translate-x-1/2 -translate-y-1/2"
                          style={{
                            left: point.x,
                            top: deriveLabelGutterOffset({
                              plotY: point.y,
                              plotHeight: 72,
                              gutterHeight: CHART_GUTTER_HEIGHT,
                              viewBoxHeight: CHART_VIEWBOX_HEIGHT,
                            }),
                          }}
                          data-analysis-datalabel="true"
                          type="button"
                          onClick={() => onIntervalChartLabelClick(entry.intervalIndex, 'orders-transit-lead-time')}
                        >
                          {isSelected ? (
                            <span className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-full border border-border/70 bg-background px-2 py-0.5 text-[10px] font-medium text-foreground shadow-sm">
                              {`${entry.meanDays.toFixed(1)} ± ${spreadDays.toFixed(1)} Days`}
                            </span>
                          ) : null}
                          <span className={cn('block size-3 rounded-full border-2', isSelected ? 'border-sky-700 bg-sky-700' : 'border-sky-700/55 bg-background')} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PerformanceSectionShell>
  );
}

function ObservationChannels({
  row,
  className,
}: {
  row: AnalysisObservationLedgerRow;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {[
        ['Stock', row.stockSnapshotLabel],
        ['Svc rank', row.serviceRankingLabel],
        ['Retail', row.retailRankingLabel],
        ['Stockout', row.stockoutFlagsLabel],
        ['Order', row.orderPlacedLabel],
        ['Receipt', row.receiptArrivedLabel],
        ['Svc price', row.servicePriceLabel],
        ['Retail price', row.retailPriceLabel],
        ['LT', row.leadTimeHintLabel],
        ['Note', row.noteLabel],
      ].map(([label, value]) => (
        <span
          key={`${row.id}:${label}`}
          className={cn(
            'inline-flex items-center rounded-full border px-2 py-1 text-[0.68rem]',
            value === '—' ? 'border-border/60 bg-background/70 text-muted-foreground' : 'border-foreground/10 bg-white text-foreground',
          )}
          data-observation-pill="true"
        >
          {label}: {value}
        </span>
      ))}
    </div>
  );
}

function ObservationEntityList({ row }: { row: AnalysisObservationLedgerRow }) {
  if (row.affectedEntityLabels.length === 0) {
    return <span className="text-sm text-muted-foreground">No named entity</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {row.affectedEntityLabels.map((label) => (
        <span
          key={`${row.id}:${label}`}
          className="rounded-full border border-border/60 bg-white px-2 py-1 text-[0.68rem] text-muted-foreground"
        >
          {label}
        </span>
      ))}
    </div>
  );
}

function EntityPressureTable({
  model,
  selectedEntityId,
  setSelection,
}: {
  model: AnalysisWorkbenchViewModel;
  selectedEntityId: string | null;
  setSelection: (value: AnalysisSelection) => void;
}) {
  return (
    <HeaderedTable>
      <div className={pressureTableLayout.containerClassName} style={pressureTableLayout.style}>
        <HeaderedTableHeader className={pressureTableLayout.headerClassName}>
          <HeaderedTableHeaderCell>
            <HeaderTooltipLabel tooltip="The service or SKU carrying the pressure signal. The icon shows which subsystem it comes from: package for SKUs and storefront for services.">
              Item
            </HeaderTooltipLabel>
          </HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell align="center">
            <HeaderTooltipLabel tooltip="The composite pressure score for the entity on a 0 to 100 scale. Higher values mean stronger evidence that demand, pipeline, lead time, or price conditions are creating operational pressure.">
              Pressure score
            </HeaderTooltipLabel>
          </HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell align="center">
            <HeaderTooltipLabel tooltip="How much inbound timing and pipeline posture are contributing to the entity's risk. Typical states range from Low through High to Critical when in-transit relief is missing, late, or unreliable.">
              Pipeline risk
            </HeaderTooltipLabel>
          </HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell align="center">
            <HeaderTooltipLabel tooltip="How much lead-time uncertainty is contributing to pressure on the entity. Higher risk means longer or more variable lead times are making replenishment less dependable.">
              Lead time risk
            </HeaderTooltipLabel>
          </HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell align="center">
            <HeaderTooltipLabel tooltip="A read on whether pricing conditions are materially contributing to pressure. Higher sensitivity means price posture is likely changing demand quality, margin quality, or both.">
              Price sensitivity
            </HeaderTooltipLabel>
          </HeaderedTableHeaderCell>
        </HeaderedTableHeader>
        <HeaderedTableBody className={pressureTableLayout.bodyClassName}>
          {model.entityRows.map((row) => (
            <HeaderedTableRow
              key={`${row.entityType}:${row.id}`}
              className={cn(
                rowHoverClassName,
                pressureTableLayout.rowClassName,
                selectedEntityId === row.id && 'bg-background/60',
              )}
              onClick={() => setSelection({ type: 'entity', entityId: row.id, entityType: row.entityType })}
            >
              <div className="group min-w-0 text-left" data-pressure-cell="true">
                <div className="min-w-0">
                  <div className="flex items-start gap-2.5">
                    <span className="shrink-0 pt-0.5">{entityIcon(row.entityType)}</span>
                    <p className="truncate font-semibold text-foreground transition-colors group-hover:text-primary">{row.name}</p>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{row.summary}</p>
                </div>
              </div>
              <div className="flex items-center justify-center" data-pressure-cell="true">
                <HeaderedTableMobileLabel className={pressureTableLayout.mobileLabelClassName}>Pressure score</HeaderedTableMobileLabel>
                <div className="flex items-center gap-2">
                  <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-sm', statusPillClassName(row.tone))}>
                    {row.pressureScoreLabel}
                  </span>
                  <span className="text-sm text-muted-foreground">/ 100</span>
                </div>
              </div>
              <div className="flex items-center justify-center" data-pressure-cell="true">
                <HeaderedTableMobileLabel className={pressureTableLayout.mobileLabelClassName}>Pipeline risk</HeaderedTableMobileLabel>
                <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-sm capitalize', statusPillClassName(scoreCellTone(row.pipelineRiskLabel)))}>
                  {row.pipelineRiskLabel}
                </span>
              </div>
              <div className="flex items-center justify-center" data-pressure-cell="true">
                <HeaderedTableMobileLabel className={pressureTableLayout.mobileLabelClassName}>Lead time risk</HeaderedTableMobileLabel>
                <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-sm capitalize', statusPillClassName(scoreCellTone(row.leadTimeRiskLabel)))}>
                  {row.leadTimeRiskLabel}
                </span>
              </div>
              <div className="flex items-center justify-center" data-pressure-cell="true">
                <HeaderedTableMobileLabel className={pressureTableLayout.mobileLabelClassName}>Price sensitivity</HeaderedTableMobileLabel>
                <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-sm capitalize', statusPillClassName(scoreCellTone(row.priceSensitivityLabel)))}>
                  {row.priceSensitivityLabel}
                </span>
              </div>
            </HeaderedTableRow>
          ))}
        </HeaderedTableBody>
      </div>
    </HeaderedTable>
  );
}

function ObservationLedgerCompact({
  model,
}: {
  model: AnalysisWorkbenchViewModel;
}) {
  const observationLedgerGridClassName = 'lg:grid lg:grid-cols-[minmax(18rem,1.3fr)_minmax(14rem,1fr)_minmax(12rem,0.9fr)] lg:gap-0 lg:[&>*]:px-3';
  const rowsPerPage = 5;
  const [pageIndex, setPageIndex] = useState(0);
  const pageCount = Math.max(1, Math.ceil(model.evidenceRows.length / rowsPerPage));
  const rows = useMemo(() => {
    const start = pageIndex * rowsPerPage;
    return model.evidenceRows.slice(start, start + rowsPerPage);
  }, [model.evidenceRows, pageIndex]);

  useEffect(() => {
    setPageIndex((current) => Math.min(current, pageCount - 1));
  }, [pageCount]);

  return (
    <div className="grid gap-0">
      <HeaderedTable>
        <HeaderedTableHeader className={observationLedgerGridClassName}>
          <HeaderedTableHeaderCell className="justify-self-start">
            <HeaderTooltipLabel tooltip="The observation record itself: title, observed timestamp, and the short narrative detail explaining what landed in that row.">
              Observed
            </HeaderTooltipLabel>
          </HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell className="justify-self-start">
            <HeaderTooltipLabel tooltip="The raw evidence channels present in the selected observation, such as stock snapshots, rankings, stockout flags, orders, receipts, price inputs, lead-time hints, and notes.">
              Observation channels
            </HeaderTooltipLabel>
          </HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell className="justify-self-start">
            <HeaderTooltipLabel tooltip="The named services or SKUs that were resolved from the observation. When none are listed, the observation was not tied to a specific entity.">
              Affected entities
            </HeaderTooltipLabel>
          </HeaderedTableHeaderCell>
        </HeaderedTableHeader>
        <HeaderedTableBody>
          {rows.map((row) => (
            <HeaderedTableRow key={row.id} className={observationLedgerGridClassName}>
              <div className="min-w-0 text-left" data-observation-cell="true">
                <HeaderedTableCellStack
                  primary={row.title}
                  secondary={
                    <>
                      <p>{row.observedAt}</p>
                      <p className="mt-2">{row.detail}</p>
                    </>
                  }
                  primaryClassName="font-semibold"
                  secondaryClassName="text-sm leading-6 text-muted-foreground"
                />
              </div>
              <div className="min-w-0" data-observation-cell="true">
                <HeaderedTableMobileLabel>Channels</HeaderedTableMobileLabel>
                <ObservationChannels row={row} />
              </div>
              <div className="min-w-0" data-observation-cell="true">
                <HeaderedTableMobileLabel>Affected entities</HeaderedTableMobileLabel>
                <ObservationEntityList row={row} />
              </div>
            </HeaderedTableRow>
          ))}
        </HeaderedTableBody>
      </HeaderedTable>
      {pageCount > 1 ? <PagedPanelNavigation pageCount={pageCount} pageIndex={pageIndex} setPageIndex={setPageIndex} /> : null}
    </div>
  );
}

function SupplyFragilityMap({
  model,
  setSelection,
  showRightRailCards,
}: {
  model: AnalysisWorkbenchViewModel;
  setSelection: (value: AnalysisSelection) => void;
  showRightRailCards: boolean;
}) {
  const measuredCellRefs = useRef(new Map<string, HTMLDivElement>());
  const measuredCellContentRefs = useRef(new Map<string, HTMLDivElement>());
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [sharedCellWidth, setSharedCellWidth] = useState(240);

  const setMeasuredCellRef = (key: string) => (node: HTMLDivElement | null) => {
    if (node) {
      measuredCellRefs.current.set(key, node);
      return;
    }
    measuredCellRefs.current.delete(key);
  };

  const setMeasuredCellContentRef = (key: string) => (node: HTMLDivElement | null) => {
    if (node) {
      measuredCellContentRefs.current.set(key, node);
      return;
    }
    measuredCellContentRefs.current.delete(key);
  };

  const transposedRows = useMemo(
    () =>
      model.fragilityColumns.map((column) => ({
        key: `sku:${column.skuId}`,
        skuId: column.skuId,
        name: column.name,
        cells: model.fragilityRows
          .map((service, serviceIndex) => ({
            serviceId: service.entityId,
            serviceName: service.name,
            serviceColumnStart: serviceIndex + 2,
            cell: service.cells.find((entry) => entry.skuId === column.skuId),
          }))
          .filter(({ cell }) => cell?.tone !== 'neutral'),
      }))
      .filter((row) => row.cells.length > 0),
    [model.fragilityColumns, model.fragilityRows],
  );

  useLayoutEffect(() => {
    const measure = () => {
      const widestContent = Array.from(measuredCellContentRefs.current.values()).reduce((max, element) => {
        return Math.max(max, Math.ceil(element.scrollWidth));
      }, 0);
      const tallestCell = Array.from(measuredCellRefs.current.values()).reduce((max, element) => {
        return Math.max(max, Math.ceil(element.getBoundingClientRect().height));
      }, 0);
      const baseWidth = Math.max(widestContent + 26, tallestCell);
      const columnCount = model.fragilityRows.length + 1;
      const columnGap = 8;
      const viewportWidth = viewportRef.current?.clientWidth ?? 0;
      const horizontalPadding = 48;
      const availableWidth = Math.max(0, viewportWidth - horizontalPadding);
      const stretchedWidth =
        columnCount > 0 && availableWidth > 0 ? Math.floor((availableWidth - columnGap * (columnCount - 1)) / columnCount) : 0;
      const nextWidth = stretchedWidth > baseWidth ? stretchedWidth : baseWidth;
      setSharedCellWidth((current) => (current === nextWidth ? current : nextWidth));
    };

    measure();
    window.addEventListener('resize', measure);
    const observer = new ResizeObserver(() => {
      measure();
    });
    if (viewportRef.current) {
      observer.observe(viewportRef.current);
    }
    return () => {
      window.removeEventListener('resize', measure);
      observer.disconnect();
    };
  }, [model.fragilityRows.length, transposedRows]);

  return (
    <PerformanceSectionShell
      title="Supply fragility map"
      tooltip="Linked SKUs against services, with contributor pressure and inbound relief in each cell."
      description="The system-level sibling of the service contributor stack, transposed to show each SKU across the services it supports."
      className={showRightRailCards ? 'lg:rounded-r-none' : undefined}
      contentClassName="px-0 py-0"
    >
      <div ref={viewportRef} className="overflow-x-auto px-6 py-5">
        <div
          className="grid min-w-max gap-2"
          style={{ gridTemplateColumns: `repeat(${model.fragilityRows.length + 1}, ${sharedCellWidth}px)` }}
        >
          <div aria-hidden="true" />
          {model.fragilityRows.map((service, serviceIndex) => (
            <button
              key={service.entityId}
              className="flex items-center gap-2 px-3 py-2 text-left text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              style={{ gridColumnStart: serviceIndex + 2, gridRowStart: 1 }}
              type="button"
              onClick={() => setSelection({ type: 'entity', entityId: service.entityId, entityType: service.entityType })}
            >
              <Store className="size-4 shrink-0" />
              <span>{service.name}</span>
            </button>
          ))}

          {transposedRows.map((row, rowIndex) => (
            <Fragment key={row.key}>
              <div className="flex items-center rounded-[1rem] border border-border/60 bg-white px-3 py-3" style={{ gridColumnStart: 1, gridRowStart: rowIndex + 2 }}>
                <div className="max-w-full min-w-0">
                  <p className="flex items-center gap-2 font-medium text-foreground">
                    <Package className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 break-words">{row.name}</span>
                  </p>
                </div>
              </div>
              {row.cells.map(({ serviceId, serviceName, serviceColumnStart, cell }) => (
                <div
                  key={`${row.skuId}:${serviceId}`}
                  className={cn(
                    'rounded-[1rem] border px-3 py-3',
                    cell?.tone === 'danger'
                      ? 'border-rose-200/80 bg-rose-50/90'
                      : cell?.tone === 'warning'
                        ? 'border-amber-200/80 bg-amber-50/90'
                        : cell?.tone === 'info'
                          ? 'border-sky-200/80 bg-sky-50/90'
                          : 'border-border/60 bg-white',
                  )}
                  ref={setMeasuredCellRef(`${row.skuId}:${serviceId}`)}
                  style={{ gridColumnStart: serviceColumnStart, gridRowStart: rowIndex + 2 }}
                >
                  <div ref={setMeasuredCellContentRef(`${row.skuId}:${serviceId}`)} className="w-max max-w-none">
                    <p className="text-sm font-medium text-foreground">{cell?.usageLabel ?? '—'}</p>
                    <p className="mt-1 text-xs capitalize text-muted-foreground">{cell?.pressureLabel ?? '—'}</p>
                    <p className="mt-2 text-xs text-muted-foreground">{cell?.reliefLabel ?? '—'}</p>
                    <p className="mt-3 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground lg:hidden">{serviceName}</p>
                  </div>
                </div>
              ))}
            </Fragment>
          ))}
        </div>
      </div>
    </PerformanceSectionShell>
  );
}

function SelectedObservationRail({ row }: { row: AnalysisObservationLedgerRow }) {
  return (
    <>
      <AnalysisRailSection icon={<FileSearch className="size-4" />} title="Observation" tooltip="The raw observation row currently selected from the evidence ledger.">
        <p className="text-2xl font-semibold tracking-[-0.03em] text-foreground">{row.title}</p>
        <p className="text-sm text-muted-foreground">{row.observedAt}</p>
        <p className="text-sm leading-6 text-muted-foreground">{row.detail}</p>
      </AnalysisRailSection>

      <AnalysisRailSection icon={<Radio className="size-4" />} title="Channels" tooltip="Every observation channel present in this record.">
        <ObservationChannels row={row} />
      </AnalysisRailSection>

      <AnalysisRailSection icon={<ListTree className="size-4" />} title="Affected entities" tooltip="Named services or SKUs that appear in this observation.">
        <AnalysisRailList>
          {row.affectedEntityLabels.length > 0 ? row.affectedEntityLabels.map((label) => (
            <AnalysisRailRow key={`${row.id}:${label}`} primary={<span className="text-muted-foreground">{label}</span>} />
          )) : <AnalysisRailRow primary={<span className="text-muted-foreground">No named entity in this observation.</span>} />}
        </AnalysisRailList>
      </AnalysisRailSection>
    </>
  );
}

function IntervalRail({
  interval,
  flashedSection,
}: {
  interval: AnalysisWorkbenchViewModel['intervals'][number];
  flashedSection: IntervalRailSectionKey | null;
}) {
  return (
    <>
      <AnalysisRailSection icon={<CircleGauge className="size-4" />} title="Interval explanation" tooltip="What SENA thinks happened in the currently selected interval.">
        <p className="text-2xl font-semibold tracking-[-0.03em] text-foreground">{interval.dateLabel}</p>
        <div className="grid gap-1 text-sm text-muted-foreground">
          <p>{interval.dominantRegime} regime</p>
          <p>{interval.dominantDriver}</p>
          <p>{interval.priceOrStockoutSummary}</p>
        </div>
      </AnalysisRailSection>

      <AnalysisRailSection
        flash={flashedSection === 'observed-signals'}
        icon={<Radio className="size-4" />}
        title="Observed signals"
        tooltip="The raw observation channels that touched this interval."
      >
        <SignalsWrap values={interval.observedSignals} />
        <AnalysisRailList className="mt-3">
          {interval.affectedEntities.length > 0 ? interval.affectedEntities.map((label) => (
            <AnalysisRailRow key={`${interval.key}:${label}`} primary={<span className="text-muted-foreground">{label}</span>} />
          )) : <AnalysisRailRow primary={<span className="text-muted-foreground">No named entity resolved for this interval.</span>} />}
        </AnalysisRailList>
      </AnalysisRailSection>

      <AnalysisRailSection
        flash={flashedSection === 'what-happened'}
        icon={<AudioLines className="size-4" />}
        title="What happened"
        tooltip="The dominant causal explanation in the selected interval."
      >
        <AnalysisRailList>
          <AnalysisRailRow primary={<span className="text-muted-foreground">Service demand</span>} secondary={interval.serviceDemandLabel} />
          <AnalysisRailRow primary={<span className="text-muted-foreground">Retail demand</span>} secondary={interval.retailDemandLabel} />
          <AnalysisRailRow primary={<span className="text-muted-foreground">Receipts</span>} secondary={interval.receiptsLabel} />
          <AnalysisRailRow primary={<span className="text-muted-foreground">Adjustments</span>} secondary={interval.adjustmentsLabel} />
        </AnalysisRailList>
      </AnalysisRailSection>

      <AnalysisRailSection
        flash={flashedSection === 'orders-transit-lead-time'}
        icon={<Waypoints className="size-4" />}
        title="Orders, transit, lead time"
        tooltip="Inbound order placement, pipeline state, and lead-time conditions for the selected interval."
      >
        <AnalysisRailList>
          <AnalysisRailRow primary={<span className="text-muted-foreground">In transit</span>} secondary={interval.inTransitLabel} />
          <AnalysisRailRow primary={<span className="text-muted-foreground">Order probability</span>} secondary={interval.orderProbabilityLabel} />
          <AnalysisRailRow primary={<span className="text-muted-foreground">Order quantity</span>} secondary={interval.orderQuantityLabel} />
          <AnalysisRailRow primary={<span className="text-muted-foreground">Receipt quantity</span>} secondary={interval.receiptQuantityLabel} />
          <AnalysisRailRow primary={<span className="text-muted-foreground">Transit age</span>} secondary={interval.ageDaysLabel} />
          <AnalysisRailRow primary={<span className="text-muted-foreground">Lead-time mean</span>} secondary={interval.leadTimeMeanLabel} />
          <AnalysisRailRow primary={<span className="text-muted-foreground">Lead-time spread</span>} secondary={interval.leadTimeSpreadLabel} />
          <AnalysisRailRow primary={<span className="text-muted-foreground">Lead-time class</span>} secondary={interval.leadTimeVariabilityLabel} />
        </AnalysisRailList>
      </AnalysisRailSection>
    </>
  );
}

function EntityRail({ row }: { row: AnalysisEntityPressureRow }) {
  return (
    <>
      <AnalysisRailSection
        icon={row.entityType === 'sku' ? <PackageSearch className="size-4" /> : <Store className="size-4" />}
        title={row.entityType === 'sku' ? 'Selected SKU' : 'Selected service'}
        tooltip="The currently selected SKU or service."
      >
        <p className="text-2xl font-semibold tracking-[-0.03em] text-foreground">{row.name}</p>
        <div className="grid gap-1 text-sm text-muted-foreground">
          <p>{row.pressureScoreLabel} pressure score</p>
          <p>{row.driverLabel}</p>
          <p>{row.summary}</p>
        </div>
        <Button asChild className="mt-4 w-full">
          <Link to={row.href}>
            <ArrowUpRight className="size-4" />
            Open detail
          </Link>
        </Button>
      </AnalysisRailSection>

      <AnalysisRailSection icon={<CircleGauge className="size-4" />} title="Posterior state" tooltip="Posterior units, demand, reorder posture, and pipeline exposure for the selected entity.">
        <AnalysisRailList>
          <AnalysisRailRow primary={<span className="text-muted-foreground">Posterior units</span>} secondary={row.posteriorUnitsLabel} />
          <AnalysisRailRow primary={<span className="text-muted-foreground">Demand per day</span>} secondary={row.demandPerDayLabel} />
          <AnalysisRailRow primary={<span className="text-muted-foreground">Reorder trigger</span>} secondary={row.reorderTriggerLabel} />
          <AnalysisRailRow primary={<span className="text-muted-foreground">In transit</span>} secondary={row.inTransitExposureLabel} />
          <AnalysisRailRow primary={<span className="text-muted-foreground">Lead-time mean</span>} secondary={row.leadTimeMeanLabel} />
          <AnalysisRailRow primary={<span className="text-muted-foreground">Lead-time spread</span>} secondary={row.leadTimeSpreadLabel} />
        </AnalysisRailList>
      </AnalysisRailSection>

      <AnalysisRailSection icon={<ListTree className="size-4" />} title="Contributor stack" tooltip="The strongest linked contributors or dependent services behind the selected entity.">
        <AnalysisRailList>
          {row.contributorStack.length > 0 ? row.contributorStack.map((entry) => (
            <AnalysisRailRow key={`${row.id}:${entry}`} primary={<span className="text-muted-foreground">{entry}</span>} />
          )) : <AnalysisRailRow primary={<span className="text-muted-foreground">No contributor stack available for this entity.</span>} />}
        </AnalysisRailList>
      </AnalysisRailSection>
    </>
  );
}

function OverviewRail({ model }: { model: AnalysisWorkbenchViewModel }) {
  return (
    <>
      <AnalysisRailSection icon={<CircleGauge className="size-4" />} title="Current system state" tooltip="The default inspector summary when no interval or entity is selected.">
        <p className="text-2xl font-semibold tracking-[-0.03em] text-foreground">{model.inspectorOverview.dominantRegime}</p>
        <div className="grid gap-1 text-sm text-muted-foreground">
          <p>Change-point probability {model.inspectorOverview.changePointProbability}</p>
          <p>{model.inspectorOverview.coverageSummary}</p>
        </div>
      </AnalysisRailSection>

      <AnalysisRailSection icon={<Radio className="size-4" />} title="Strongest channels" tooltip="Which observation channels are most responsible for the current system inference.">
        <AnalysisRailList>
          {model.inspectorOverview.strongestChannels.map((entry, index) => (
            <AnalysisRailRow key={`${entry}:${index}`} primary={<span className="text-muted-foreground">{entry}</span>} />
          ))}
        </AnalysisRailList>
      </AnalysisRailSection>

      <AnalysisRailSection icon={<ListTree className="size-4" />} title="Affected entities" tooltip="The current system actors carrying the most structural pressure.">
        <AnalysisRailList>
          {model.inspectorOverview.affectedEntities.map((entry, index) => (
            <AnalysisRailRow key={`${entry}:${index}`} primary={<span className="text-muted-foreground">{entry}</span>} />
          ))}
        </AnalysisRailList>
      </AnalysisRailSection>
    </>
  );
}

function InspectorRail({
  model,
  section,
  selection,
  flashedSection,
}: {
  model: AnalysisWorkbenchViewModel;
  section: AnalysisSection;
  selection: AnalysisSelection;
  flashedSection: IntervalRailSectionKey | null;
}) {
  const interval = selection.type === 'interval'
    ? model.intervals.find((entry) => entry.intervalIndex === selection.intervalIndex) ?? null
    : null;
  const entity = selection.type === 'entity'
    ? model.entityRows.find((entry) => entry.id === selection.entityId && entry.entityType === selection.entityType) ?? null
    : null;
  const observation = selection.type === 'observation'
    ? model.evidenceRows.find((entry) => entry.id === selection.observationId) ?? null
    : null;
  const measurementRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [reservedHeight, setReservedHeight] = useState<number | null>(null);
  const measurementVariants = useMemo(() => {
    const overviewVariant = [{ key: 'overview', content: <OverviewRail model={model} /> }];
    if (section === 'workbench') {
      return [
        ...overviewVariant,
        ...model.intervals.map((interval) => ({
          key: `interval:${interval.key}`,
          content: <IntervalRail flashedSection={null} interval={interval} />,
        })),
      ];
    }
    if (section === 'pressure') {
      return [
        ...overviewVariant,
        ...model.entityRows.map((row) => ({
          key: `entity:${row.entityType}:${row.id}`,
          content: <EntityRail row={row} />,
        })),
      ];
    }
    if (section === 'observations') {
      return [
        ...overviewVariant,
        ...model.evidenceRows.map((row) => ({
          key: `observation:${row.id}`,
          content: <SelectedObservationRail row={row} />,
        })),
      ];
    }
    if (section === 'fragility') {
      return [
        ...overviewVariant,
        ...model.entityRows.map((row) => ({
          key: `entity:${row.entityType}:${row.id}`,
          content: <EntityRail row={row} />,
        })),
      ];
    }
    return overviewVariant;
  }, [model, section]);

  useEffect(() => {
    measurementRefs.current = measurementRefs.current.slice(0, measurementVariants.length);
    const updateReservedHeight = () => {
      const nextHeight = Math.max(...measurementRefs.current.map((node) => node?.offsetHeight ?? 0), 0);
      setReservedHeight((current) => (current === nextHeight ? current : nextHeight));
    };
    updateReservedHeight();
    const observer = new ResizeObserver(() => updateReservedHeight());
    for (const node of measurementRefs.current) {
      if (node) {
        observer.observe(node);
      }
    }
    return () => observer.disconnect();
  }, [measurementVariants]);

  return (
    <aside
      className={cn(RIGHT_RAIL_ASIDE_CLASS_NAME, ANALYSIS_RAIL_PANEL_CLASS_NAME, 'relative gap-0')}
      data-analysis-inspector="true"
      style={reservedHeight != null ? { minHeight: reservedHeight } : undefined}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 invisible">
        {measurementVariants.map((variant, index) => (
          <div
            key={variant.key}
            ref={(node) => {
              measurementRefs.current[index] = node;
            }}
            className={cn(ANALYSIS_RAIL_PANEL_CLASS_NAME, 'gap-0')}
          >
            {variant.content}
          </div>
        ))}
      </div>
      {observation ? <SelectedObservationRail row={observation} /> : null}
      {!observation && interval ? <IntervalRail flashedSection={flashedSection} interval={interval} /> : null}
      {!observation && !interval && entity ? <EntityRail row={entity} /> : null}
      {!observation && !interval && !entity ? <OverviewRail model={model} /> : null}
    </aside>
  );
}

function WorkbenchSurface({
  hasOlderIntervals,
  isLoadingOlderIntervals,
  loadOlderIntervals,
  model,
  selectedIntervalIndex,
  setSelection,
  onIntervalChartLabelClick,
  showRightRailCards,
}: {
  hasOlderIntervals: boolean;
  isLoadingOlderIntervals: boolean;
  loadOlderIntervals: () => Promise<number>;
  model: AnalysisWorkbenchViewModel;
  selectedIntervalIndex: number | null;
  setSelection: (value: AnalysisSelection) => void;
  onIntervalChartLabelClick: (intervalIndex: number, section: IntervalRailSectionKey) => void;
  showRightRailCards: boolean;
}) {
  return (
    <div className="grid gap-6">
      <SystemLedger
        hasOlderIntervals={hasOlderIntervals}
        isLoadingOlderIntervals={isLoadingOlderIntervals}
        loadOlderIntervals={loadOlderIntervals}
        model={model}
        selectedIntervalIndex={selectedIntervalIndex}
        setSelection={setSelection}
        onIntervalChartLabelClick={onIntervalChartLabelClick}
        showRightRailCards={showRightRailCards}
      />
    </div>
  );
}

function PressureSurface({
  model,
  selectedEntityId,
  setSelection,
  showRightRailCards,
}: {
  model: AnalysisWorkbenchViewModel;
  selectedEntityId: string | null;
  setSelection: (value: AnalysisSelection) => void;
  showRightRailCards: boolean;
}) {
  return (
    <div className="grid gap-6">
      <PerformanceSectionShell
        title="Entity pressure explorer"
        tooltip="A ranked mixed table across SKUs and services showing where structural pressure is coming from."
        description="Compare whether pressure is demand-led, pipeline-led, lead-time-led, or price-sensitive across entities in one surface."
        className={showRightRailCards ? 'lg:rounded-r-none' : undefined}
        contentClassName="px-0 py-0"
      >
        <EntityPressureTable model={model} selectedEntityId={selectedEntityId} setSelection={setSelection} />
      </PerformanceSectionShell>
    </div>
  );
}

function ObservationsSurface({
  model,
  setSelection,
  showRightRailCards,
}: {
  model: AnalysisWorkbenchViewModel;
  setSelection: (value: AnalysisSelection) => void;
  showRightRailCards: boolean;
}) {
  return (
    <div className="grid gap-6">
      <PerformanceSectionShell
        title="Observation ledger"
        tooltip="The compact trust surface for which evidence channels were present in each observation."
        description="Stock snapshots, rankings, stockout flags, order and receipt events, price inputs, lead-time hints, and notes."
        className={showRightRailCards ? 'lg:rounded-r-none' : undefined}
        contentClassName="px-0 py-0"
      >
        <ObservationLedgerCompact model={model} />
      </PerformanceSectionShell>
    </div>
  );
}

function FragilitySurface({
  model,
  setSelection,
  showRightRailCards,
}: {
  model: AnalysisWorkbenchViewModel;
  setSelection: (value: AnalysisSelection) => void;
  showRightRailCards: boolean;
}) {
  return (
    <div className="grid gap-6">
      <SupplyFragilityMap model={model} setSelection={setSelection} showRightRailCards={showRightRailCards} />
    </div>
  );
}

function SettingsSurface({
  model,
  showRightRailCards,
}: {
  model: AnalysisWorkbenchViewModel;
  showRightRailCards: boolean;
}) {
  return (
    <div className="grid gap-6">
      <PerformanceSectionShell
        title="Analysis Parameters"
        tooltip="Read-only model state and evidence coverage for the current analysis window."
        description="The least important surface in the analysis stack. It exposes current model status without competing with the workbench."
        className={showRightRailCards ? 'lg:rounded-r-none' : undefined}
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {ANALYSIS_SETTINGS_FIELDS.map((field) => {
            const value = model.settings[field.valueKey];

            return (
              <div key={field.key} className="rounded-[1.25rem] border border-border/60 bg-white px-4 py-4">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  <SectionLabel tooltip={field.tooltip}>{field.label}</SectionLabel>
                </p>
                <p className="mt-2 text-base font-medium text-foreground">{value}</p>
              </div>
            );
          })}
        </div>
      </PerformanceSectionShell>
    </div>
  );
}

export function AnalysisWorkbench({
  hasOlderIntervals,
  isLoadingOlderIntervals,
  loadOlderIntervals,
  model,
  section,
  setSection,
  showRightRailCards,
}: {
  hasOlderIntervals: boolean;
  isLoadingOlderIntervals: boolean;
  loadOlderIntervals: () => Promise<number>;
  model: AnalysisWorkbenchViewModel;
  section: AnalysisSection;
  setSection: (value: AnalysisSection) => void;
  showRightRailCards: boolean;
}) {
  const [selection, setSelection] = useState<AnalysisSelection>({ type: 'overview' });
  const [flashedIntervalSection, setFlashedIntervalSection] = useState<IntervalRailSectionKey | null>(null);
  const flashTimeoutRef = useRef<number | null>(null);
  const railEnabled = showRightRailCards && sectionSupportsRightRail(section);
  const handleSelection = (nextSelection: AnalysisSelection) => {
    setSelection((current) => (selectionsEqual(current, nextSelection) ? current : nextSelection));
  };
  const flashIntervalSection = (sectionKey: IntervalRailSectionKey) => {
    setFlashedIntervalSection(sectionKey);
    if (flashTimeoutRef.current != null) {
      window.clearTimeout(flashTimeoutRef.current);
    }
    flashTimeoutRef.current = window.setTimeout(() => {
      setFlashedIntervalSection((current) => (current === sectionKey ? null : current));
      flashTimeoutRef.current = null;
    }, 550);
  };
  const handleIntervalChartLabelClick = (intervalIndex: number, sectionKey: IntervalRailSectionKey) => {
    handleSelection({ type: 'interval', intervalIndex });
    flashIntervalSection(sectionKey);
  };
  const clearIntervalSelection = () => {
    setFlashedIntervalSection(null);
    handleSelection({ type: 'overview' });
  };

  const selectedIntervalIndex = selection.type === 'interval' ? selection.intervalIndex : null;
  const selectedEntityId = selection.type === 'entity' ? selection.entityId : null;
  const selectedObservationId = selection.type === 'observation' ? selection.observationId : null;

  useEffect(() => {
    setSelection((current) => {
      if (current.type === 'interval') {
        return model.intervals.some((entry) => entry.intervalIndex === current.intervalIndex) ? current : { type: 'overview' };
      }
      if (current.type === 'entity') {
        return model.entityRows.some((entry) => entry.id === current.entityId && entry.entityType === current.entityType) ? current : { type: 'overview' };
      }
      if (current.type === 'observation') {
        return model.evidenceRows.some((entry) => entry.id === current.observationId) ? current : { type: 'overview' };
      }
      return current;
    });
  }, [model]);

  useEffect(() => () => {
    if (flashTimeoutRef.current != null) {
      window.clearTimeout(flashTimeoutRef.current);
    }
  }, []);

  const handleWorkbenchPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    if (target.closest('[data-analysis-inspector="true"]')) {
      return;
    }
    if (section === 'workbench' && selection.type === 'interval') {
      if (target.closest('[data-analysis-datalabel="true"]')) {
        return;
      }
      clearIntervalSelection();
      return;
    }
    if (section === 'pressure' && selection.type === 'entity') {
      if (target.closest('[data-pressure-cell="true"]')) {
        return;
      }
      handleSelection({ type: 'overview' });
      return;
    }
    if (section === 'observations' && selection.type === 'observation') {
      if (target.closest('[data-observation-cell="true"]')) {
        return;
      }
      handleSelection({ type: 'overview' });
      return;
    }
  };

  const surface = useMemo(() => {
    if (section === 'pressure') {
      return <PressureSurface model={model} selectedEntityId={selectedEntityId} setSelection={handleSelection} showRightRailCards={railEnabled} />;
    }
    if (section === 'observations') {
      return <ObservationsSurface model={model} setSelection={handleSelection} showRightRailCards={railEnabled} />;
    }
    if (section === 'fragility') {
      return <FragilitySurface model={model} setSelection={handleSelection} showRightRailCards={railEnabled} />;
    }
    if (section === 'settings') {
      return <SettingsSurface model={model} showRightRailCards={railEnabled} />;
    }
    return (
            <WorkbenchSurface
              hasOlderIntervals={hasOlderIntervals}
              isLoadingOlderIntervals={isLoadingOlderIntervals}
              loadOlderIntervals={loadOlderIntervals}
              model={model}
              selectedIntervalIndex={selectedIntervalIndex}
              setSelection={handleSelection}
        onIntervalChartLabelClick={handleIntervalChartLabelClick}
        showRightRailCards={railEnabled}
      />
    );
  }, [handleIntervalChartLabelClick, handleSelection, model, railEnabled, section, selectedEntityId, selectedIntervalIndex]);

  return (
    <div className="grid gap-6" onPointerDown={handleWorkbenchPointerDown}>
      <DiagnosticStrip model={model} />
      <ChromeTabs
        className="relative gap-0"
        value={section}
        onValueChange={(nextValue) => {
          if (nextValue) {
            setSection(nextValue as AnalysisSection);
          }
        }}
      >
        <InternalNav section={section} showRightRailCards={railEnabled} />

        <section
          className={ANALYSIS_BOARD_CLASS_NAME}
          style={{
            marginTop: 'calc(var(--chrome-tabs-surface-overlap) * -2.75)',
          }}
        >
          <div className={railEnabled ? 'grid gap-0 lg:grid-cols-[minmax(0,1fr)_320px]' : 'grid gap-0'}>
            <div className={cn('min-w-0 border-b border-border/60 lg:border-b-0', railEnabled && 'lg:border-r lg:rounded-r-none')}>
              <div className="grid min-h-full min-w-0 gap-6 px-0 py-0">{surface}</div>
            </div>
            {railEnabled ? <InspectorRail flashedSection={flashedIntervalSection} model={model} section={section} selection={selectedObservationId ? selection : selection} /> : null}
          </div>
        </section>
      </ChromeTabs>
    </div>
  );
}
