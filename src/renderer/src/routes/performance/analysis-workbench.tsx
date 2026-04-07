import { Fragment, startTransition, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode, type RefObject, type UIEvent, type WheelEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  BadgePercent,
  ArrowUpRight,
  AudioLines,
  Boxes,
  ChartNoAxesColumnIncreasing,
  CircleGauge,
  CircleOff,
  Cog,
  FileSearch,
  Flame,
  Grid3x3,
  ListTree,
  Map as MapIcon,
  MoonStar,
  CalendarClock,
  PackageSearch,
  Package,
  Radar,
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
  deriveAnchoredZoomScrollLeft,
  derivePrependedScrollLeft,
  deriveAxisContentWidth,
  deriveFreshMountIntervalScrollLeft,
  deriveInitialViewportSlotWidth,
  deriveLatestWindowScrollLeft,
  deriveSlotCenterX,
  deriveSequentialOlderLoadBatchCount,
  deriveViewportPageScrollLeft,
  handleIntervalChartWheel,
  INTERVAL_LOAD_BATCH_SIZE,
  INTERVAL_VISIBLE_COUNT,
  INTERVAL_PAGE_SIZE,
  IntervalStrip,
  MAX_SLOT_WIDTH,
  MIN_SLOT_WIDTH,
  SCROLL_EDGE_TOLERANCE,
  shouldLoadOlderIntervals,
} from '@/components/system/interval-strip';
import {
  buildPointCoordinatesWithDomain,
  buildPolylineWithDomain,
  buildTrajectoryBandPath,
  ClampedChartDataLabel,
  deriveProportionalChartGeometry,
  deriveScaledVisualValue,
  deriveFlowStackHeights,
  deriveLabelGutterOffset,
  deriveTouchingRangeBounds,
  deriveTouchingSlotGlyphLayout,
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
import { useFloatingTitleActions } from '@/components/system/floating-title-actions';
import { Button } from '@/components/ui/button';
import { ChromeTabs, ChromeTabsList, ChromeTabsTrigger } from '@/components/ui/chrome-tabs';
import { cardFrameClassName, cardSurfaceClassName } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { rowHoverClassName } from '@/lib/interactive-surface';
import { cn } from '@/lib/utils';
import { statusPillClassName } from '@/lib/state-tones';
import { SectionLabel } from '@/routes/sku-detail/section-heading';
import { usePreferences } from '@/state/preferences';
import { LaneExpandButton, useChartWorkspace, useChartWorkspaceControls } from '@/components/system/chart-workspace';
import { PagedPanelNavigation } from '@/routes/detail-panels';
import { PerformanceSectionShell, PERFORMANCE_HEADER_SURFACE_CLASS_NAME } from './chrome';
import type {
  AnalysisEntityPressureRow,
  AnalysisObservationLedgerRow,
  AnalysisScope,
  AnalysisSection,
  AnalysisSelection,
  AnalysisWorkbenchViewModel,
} from './analysis-view-model';
import { PIPELINE_PILL_END_OFFSET, PIPELINE_PILL_START_OFFSET } from './analysis-view-model';
import { ANALYSIS_TIMEFRAME_OPTIONS, type AnalysisTimeframe } from './analysis-timeframe';

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
  { value: 'pressure', label: 'Pressure', leading: <CircleGauge className="size-4" /> },
  { value: 'observations', label: 'Observations', leading: <FileSearch className="size-4" /> },
  { value: 'fragility', label: 'Fragility', leading: <Grid3x3 className="size-4" /> },
  { value: 'settings', label: 'Parameters', leading: <Cog className="size-4" /> },
];

const ANALYSIS_BOARD_CLASS_NAME = `${cardFrameClassName} ${cardSurfaceClassName} relative z-[1] overflow-hidden rounded-[2rem]`;
const ANALYSIS_RAIL_PANEL_CLASS_NAME = 'flex h-full flex-col bg-secondary/15 lg:rounded-l-none';

const ANALYSIS_SETTINGS_FIELDS = [
  {
    key: 'run-id',
    label: 'Run ID',
    tooltip: 'Unique identifier for the current analysis run.',
    valueKey: 'runId',
  },
  {
    key: 'latest-observed',
    label: 'Latest observed',
    tooltip: 'Most recent observation included in this analysis window.',
    valueKey: 'latestObservedAt',
  },
  {
    key: 'observations-used',
    label: 'Observations used',
    tooltip: 'Number of saved observations included after filtering.',
    valueKey: 'observationsUsed',
  },
  {
    key: 'intervals-in-view',
    label: 'Intervals in view',
    tooltip: 'Number of modeled intervals currently shown.',
    valueKey: 'intervalCount',
  },
  {
    key: 'smoothing',
    label: 'Smoothing',
    tooltip: 'Whether smoothing was applied before the summaries were shown.',
    valueKey: 'smoothingLabel',
  },
  {
    key: 'effective-sample-size',
    label: 'Effective sample size',
    tooltip: 'Estimate of how much independent evidence the posterior behaves as if it contains.',
    valueKey: 'effectiveSampleSize',
  },
  {
    key: 'predictive-error',
    label: 'Predictive error',
    tooltip: 'Average gap between observed outcomes and model expectations.',
    valueKey: 'predictiveError',
  },
  {
    key: 'coverage-estimate',
    label: 'Coverage estimate',
    tooltip: 'Share of the expected evidence surface that was actually observed.',
    valueKey: 'coverageEstimate',
  },
  {
    key: 'scope',
    label: 'Scope',
    tooltip: 'Entity slice included in this run.',
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
type WorkbenchLaneKey = 'regime' | 'inventory' | 'pipeline' | 'lead-time';

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

function regimeInitials(regime: string) {
  const normalized = regime.trim().toLowerCase();
  if (normalized.includes('stockout')) {
    return 'SC';
  }
  if (normalized.includes('promo')) {
    return 'P';
  }
  if (normalized.includes('spike')) {
    return 'S';
  }
  if (normalized.includes('lull')) {
    return 'L';
  }
  if (normalized.includes('correction')) {
    return 'C';
  }
  return 'N';
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
const REGIME_CHART_MIN_HEIGHT = 92;
const INVENTORY_CHART_PLOT_HEIGHT = 72;
const INVENTORY_FLOW_SECTION_HEIGHT = 60;
const LEAD_TIME_CHART_PLOT_HEIGHT = 72;
const PIPELINE_ROW_HEIGHT = 28;
const PIPELINE_PILL_HEIGHT = 20;
const PIPELINE_TOP_PADDING = 18;
const PIPELINE_MARKER_SIZE = 12;
const REGIME_CUE_LABEL_MIN_SLOT_WIDTH = 88;
const REGIME_ICON_MIN_SLOT_WIDTH = 22;
const REGIME_INITIALS_MIN_SLOT_WIDTH = 20;
const LINE_POINT_MARKER_MIN_SLOT_WIDTH = 20;
const MAX_LINE_STROKE_WIDTH = 1;
const MAX_POINT_MARKER_SIZE = 14;
const MAX_BAND_MIN_THICKNESS = 6;
const MAX_PIPELINE_ROW_HEIGHT = 46;
const MAX_PIPELINE_PILL_HEIGHT = 28;
const MAX_PIPELINE_MARKER_SIZE = 16;
const MAX_PIPELINE_TOP_PADDING = 28;
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

function useObservedElementHeight(
  ref: RefObject<HTMLDivElement | null>,
  resetKey: string | null,
) {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      setHeight(0);
      return;
    }
    const updateHeight = () => setHeight(node.clientHeight);
    const observer = new ResizeObserver(() => updateHeight());
    observer.observe(node);
    updateHeight();
    return () => observer.disconnect();
  }, [ref, resetKey]);

  return height;
}

function RegimeCueBadges({
  priceCueCount,
  stockoutCueCount,
  showLabels,
}: {
  priceCueCount: number;
  stockoutCueCount: number;
  showLabels: boolean;
}) {
  if (!showLabels) {
    return null;
  }
  if (priceCueCount === 0 && stockoutCueCount === 0) {
    return <span className="text-[0.62rem] text-foreground/60">Quiet</span>;
  }
  return (
    <>
      {priceCueCount > 0 ? (
        <span className="inline-flex shrink-0 items-center rounded-full bg-white/78 px-2 py-0.5 text-[0.62rem] font-medium text-foreground">
          {priceCueCount}P
        </span>
      ) : null}
      {stockoutCueCount > 0 ? (
        <span className="inline-flex shrink-0 items-center rounded-full bg-white/78 px-2 py-0.5 text-[0.62rem] font-medium text-foreground">
          {stockoutCueCount}S
        </span>
      ) : null}
    </>
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

function AnalysisSurfaceWireframe({ section }: { section: AnalysisSection }) {
  if (section === 'workbench') {
    return (
      <div className="grid gap-6 p-6">
        <Skeleton className="h-6 w-44 rounded-full" />
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={`wireframe-workbench:${index}`} className="grid gap-3 lg:grid-cols-[240px_minmax(0,1fr)]">
            <Skeleton className="h-28 rounded-[1.2rem]" />
            <Skeleton className="h-28 rounded-[1.2rem]" />
          </div>
        ))}
      </div>
    );
  }

  if (section === 'pressure') {
    return (
      <div className="grid gap-4 p-6">
        <Skeleton className="h-6 w-56 rounded-full" />
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={`wireframe-pressure:${index}`} className="h-20 rounded-[1.2rem]" />
        ))}
      </div>
    );
  }

  if (section === 'observations') {
    return (
      <div className="grid gap-4 p-6">
        <Skeleton className="h-6 w-48 rounded-full" />
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={`wireframe-observations:${index}`} className="h-24 rounded-[1.2rem]" />
        ))}
      </div>
    );
  }

  if (section === 'fragility') {
    return (
      <div className="grid gap-4 p-6">
        <Skeleton className="h-6 w-40 rounded-full" />
        <Skeleton className="h-16 rounded-[1.2rem]" />
        <div className="grid min-h-[22rem] gap-2" style={{ gridTemplateColumns: '200px repeat(4, minmax(0, 1fr))' }}>
          {Array.from({ length: 25 }).map((_, index) => (
            <Skeleton key={`wireframe-fragility:${index}`} className="h-20 rounded-[1rem]" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 p-6">
      <Skeleton className="h-6 w-44 rounded-full" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 9 }).map((_, index) => (
          <Skeleton key={`wireframe-settings:${index}`} className="h-24 rounded-[1.2rem]" />
        ))}
      </div>
    </div>
  );
}

function AnalysisRailWireframe() {
  return (
    <aside className={cn(RIGHT_RAIL_ASIDE_CLASS_NAME, ANALYSIS_RAIL_PANEL_CLASS_NAME, 'gap-4 px-4 py-4')}>
      {Array.from({ length: 3 }).map((_, index) => (
        <section key={`wireframe-rail:${index}`} className="rounded-[1.4rem] border border-border/60 bg-white/85 px-4 py-4">
          <Skeleton className="h-5 w-32 rounded-full" />
          <div className="mt-4 grid gap-3">
            <Skeleton className="h-7 w-40 rounded-full" />
            <Skeleton className="h-4 w-full rounded-full" />
            <Skeleton className="h-4 w-4/5 rounded-full" />
            <Skeleton className="h-12 rounded-[1rem]" />
          </div>
        </section>
      ))}
    </aside>
  );
}

function SystemLedger({
  chartZoomResetToken = 0,
  hasOlderIntervals,
  isLoadingOlderIntervals,
  loadOlderIntervals,
  model,
  onOlderLoadProgressChange,
  onResetCharts,
  onTimeframeChange,
  selectedIntervalIndex,
  setSelection,
  onIntervalChartLabelClick,
  showRightRailCards,
  timeframe,
}: {
  chartZoomResetToken?: number;
  hasOlderIntervals: boolean;
  isLoadingOlderIntervals: boolean;
  loadOlderIntervals: (limit?: number) => Promise<number>;
  model: AnalysisWorkbenchViewModel;
  onOlderLoadProgressChange?: (progress: { current: number; total: number } | null) => void;
  onResetCharts?: () => Promise<void> | void;
  onTimeframeChange: (value: AnalysisTimeframe) => void;
  selectedIntervalIndex: number | null;
  setSelection: (value: AnalysisSelection) => void;
  onIntervalChartLabelClick: (intervalIndex: number, section: IntervalRailSectionKey) => void;
  showRightRailCards: boolean;
  timeframe: AnalysisTimeframe;
}) {
  const { language } = usePreferences();
  const intervalScrollRef = useRef<HTMLDivElement | null>(null);
  const regimeScrollRef = useRef<HTMLDivElement | null>(null);
  const inventoryScrollRef = useRef<HTMLDivElement | null>(null);
  const pipelineScrollRef = useRef<HTMLDivElement | null>(null);
  const leadTimeScrollRef = useRef<HTMLDivElement | null>(null);
  const [expandedLane, setExpandedLane] = useState<WorkbenchLaneKey | null>(null);
  const intervalEntries = model.intervals.map((interval) => ({
    intervalIndex: interval.intervalIndex,
    startAt: interval.startAt,
    endAt: interval.endAt,
  }));
  const itemCount = intervalEntries.length;
  const syncRefs = [intervalScrollRef, regimeScrollRef, inventoryScrollRef, pipelineScrollRef, leadTimeScrollRef];
  const regimeViewportHeight = useObservedElementHeight(regimeScrollRef, expandedLane);
  const inventoryViewportHeight = useObservedElementHeight(inventoryScrollRef, expandedLane);
  const pipelineViewportHeight = useObservedElementHeight(pipelineScrollRef, expandedLane);
  const leadTimeViewportHeight = useObservedElementHeight(leadTimeScrollRef, expandedLane);
  const targetVisibleIntervalCount = timeframe === 'Recent'
    ? INTERVAL_VISIBLE_COUNT
    : Math.max(1, itemCount);
  const latestLoadedIntervalIndex = intervalEntries.at(-1)?.intervalIndex ?? null;
  const {
    adjustZoom,
    canScrollLeft,
    canScrollRight,
    clampedScrollLeft,
    contentWidth,
    createWheelHandler,
    handleScrollerScroll,
    scrollByViewport,
    slotWidth,
    viewportWidth,
  } = useChartWorkspace<number>({
    chartZoomResetToken,
    getPrependedCount: (result) => result,
    hasOlderIntervals,
    intervalCount: itemCount,
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
    onReset: () => {
      void onResetCharts?.();
    },
    onTimeframeChange,
    onZoomIn: () => adjustZoom(1),
    onZoomOut: () => adjustZoom(-1),
    timeframe,
  });
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
  const inventoryAvailableHeight = expandedLane === 'inventory' && inventoryViewportHeight > 0
    ? Math.max(INVENTORY_CHART_PLOT_HEIGHT + INVENTORY_FLOW_SECTION_HEIGHT, inventoryViewportHeight - CHART_GUTTER_HEIGHT - 4)
    : INVENTORY_CHART_PLOT_HEIGHT + INVENTORY_FLOW_SECTION_HEIGHT;
  const inventoryGeometry = deriveProportionalChartGeometry({
    collapsedPlotHeight: INVENTORY_CHART_PLOT_HEIGHT,
    collapsedAuxHeight: INVENTORY_FLOW_SECTION_HEIGHT,
    availableHeight: inventoryAvailableHeight,
    baseStrokeWidth: 1.8,
    maxStrokeWidth: MAX_LINE_STROKE_WIDTH,
    baseMarkerSize: 12,
    maxMarkerSize: MAX_POINT_MARKER_SIZE,
    baseBandMinThickness: 2,
    maxBandMinThickness: MAX_BAND_MIN_THICKNESS,
  });
  const inventoryPlotHeight = inventoryGeometry.plotHeight;
  const inventoryFlowSectionHeight = inventoryGeometry.auxHeight;
  const inventoryChartContentHeight = CHART_GUTTER_HEIGHT + inventoryPlotHeight + inventoryFlowSectionHeight;
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
    {
      axisStartPadding: AXIS_START_PADDING,
      topPadding: 5,
      bottomPadding: 5,
      minVisibleThickness: inventoryGeometry.bandMinThickness,
    },
  );
  const leadTimePoints = model.workbench.leadTimeLane.points;
  const leadTimeMeanValues = leadTimePoints.map((point) => point.meanDays);
  const leadTimeLowValues = leadTimePoints.map((point) => point.lowDays);
  const leadTimeHighValues = leadTimePoints.map((point) => point.highDays);
  const leadTimeDomainMin = leadTimeLowValues.length > 0 ? Math.min(...leadTimeLowValues) : 0;
  const leadTimeDomainMax = leadTimeHighValues.length > 0 ? Math.max(...leadTimeHighValues) : 1;
  const leadTimeAvailableHeight = expandedLane === 'lead-time' && leadTimeViewportHeight > 0
    ? Math.max(LEAD_TIME_CHART_PLOT_HEIGHT, leadTimeViewportHeight - CHART_GUTTER_HEIGHT - 4)
    : LEAD_TIME_CHART_PLOT_HEIGHT;
  const leadTimeGeometry = deriveProportionalChartGeometry({
    collapsedPlotHeight: LEAD_TIME_CHART_PLOT_HEIGHT,
    availableHeight: leadTimeAvailableHeight,
    baseStrokeWidth: 1.8,
    maxStrokeWidth: MAX_LINE_STROKE_WIDTH,
    baseMarkerSize: 12,
    maxMarkerSize: MAX_POINT_MARKER_SIZE,
    baseBandMinThickness: 2,
    maxBandMinThickness: MAX_BAND_MIN_THICKNESS,
  });
  const leadTimePlotHeight = leadTimeGeometry.plotHeight;
  const leadTimeChartContentHeight = CHART_GUTTER_HEIGHT + leadTimePlotHeight;
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
    {
      axisStartPadding: AXIS_START_PADDING,
      topPadding: 5,
      bottomPadding: 5,
      minVisibleThickness: leadTimeGeometry.bandMinThickness,
    },
  );
  const regimeAvailableHeight = expandedLane === 'regime' && regimeViewportHeight > 0
    ? Math.max(REGIME_CHART_MIN_HEIGHT, regimeViewportHeight - 4)
    : REGIME_CHART_MIN_HEIGHT;
  const regimeChartMinHeight = regimeAvailableHeight;
  const regimeTileHeight = Math.min(
    92,
    Math.round(66 * Math.max(1, regimeAvailableHeight / REGIME_CHART_MIN_HEIGHT) ** 0.45),
  );
  const regimeTileLayout = deriveTouchingSlotGlyphLayout({
    slotWidth,
    preferredInset: 4,
  });
  const inventoryFlowTop = CHART_GUTTER_HEIGHT + inventoryPlotHeight;
  const inventoryFlowCellHeight = inventoryFlowSectionHeight;
  const inventoryFlowMaxBarHeight = Math.max(24, Math.floor((inventoryFlowCellHeight - 12) / 2));
  const inventoryFlowBarLayout = deriveTouchingSlotGlyphLayout({
    slotWidth,
    preferredInset: 6,
  });
  const inventoryLaneMinHeight = CHART_GUTTER_HEIGHT + INVENTORY_CHART_PLOT_HEIGHT + INVENTORY_FLOW_SECTION_HEIGHT + 12;
  const leadTimeLaneMinHeight = CHART_GUTTER_HEIGHT + LEAD_TIME_CHART_PLOT_HEIGHT + 36;
  const pipelineCollapsedBodyHeight = PIPELINE_TOP_PADDING + Math.max(1, model.workbench.pipelineLane.rowCount - 1) * PIPELINE_ROW_HEIGHT + PIPELINE_PILL_HEIGHT + 28;
  const pipelineAvailableHeight = expandedLane === 'pipeline' && pipelineViewportHeight > 0
    ? Math.max(pipelineCollapsedBodyHeight, pipelineViewportHeight - 4)
    : pipelineCollapsedBodyHeight;
  const pipelineGeometry = deriveProportionalChartGeometry({
    collapsedPlotHeight: pipelineCollapsedBodyHeight,
    availableHeight: pipelineAvailableHeight,
    baseStrokeWidth: 1.8,
    maxStrokeWidth: MAX_LINE_STROKE_WIDTH,
    baseMarkerSize: PIPELINE_MARKER_SIZE,
    maxMarkerSize: MAX_PIPELINE_MARKER_SIZE,
  });
  const pipelineRowHeight = Math.round(deriveScaledVisualValue(PIPELINE_ROW_HEIGHT, pipelineGeometry.expandedHeightRatio, {
    min: PIPELINE_ROW_HEIGHT,
    max: MAX_PIPELINE_ROW_HEIGHT,
    power: 0.9,
  }));
  const pipelinePillHeight = Math.round(deriveScaledVisualValue(PIPELINE_PILL_HEIGHT, pipelineGeometry.expandedHeightRatio, {
    min: PIPELINE_PILL_HEIGHT,
    max: MAX_PIPELINE_PILL_HEIGHT,
    power: 0.8,
  }));
  const pipelineTopPadding = Math.round(deriveScaledVisualValue(PIPELINE_TOP_PADDING, pipelineGeometry.expandedHeightRatio, {
    min: PIPELINE_TOP_PADDING,
    max: MAX_PIPELINE_TOP_PADDING,
    power: 0.8,
  }));
  const pipelineMarkerSize = deriveScaledVisualValue(PIPELINE_MARKER_SIZE, pipelineGeometry.expandedHeightRatio, {
    min: PIPELINE_MARKER_SIZE,
    max: MAX_PIPELINE_MARKER_SIZE,
    power: 0.5,
  });
  const pipelineMarkerHalf = pipelineMarkerSize / 2;
  const pipelineChartContentHeight = Math.max(
    pipelineGeometry.plotHeight,
    pipelineTopPadding + Math.max(0, model.workbench.pipelineLane.rowCount - 1) * pipelineRowHeight + pipelinePillHeight + 28,
  );
  const pipelineLaneMinHeight = pipelineCollapsedBodyHeight + 24;
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
  const selectedPipelineLabelY = (() => {
    if (selectedPipelineSpan) {
      return pipelineTopPadding + selectedPipelineSpan.row * pipelineRowHeight;
    }
    if (selectedPipelineMarkers.length > 0) {
      return Math.min(
        ...selectedPipelineMarkers.map((marker) => (
          pipelineTopPadding + marker.row * pipelineRowHeight + (marker.kind === 'receipt' ? 2 : -pipelineMarkerHalf - 1)
        )),
      );
    }
    return null;
  })();
  const laneGridStyle = { gridTemplateColumns: `${LANE_LABEL_COLUMN} minmax(0,1fr)` };
  const showsRegimeCueLabels = slotWidth >= REGIME_CUE_LABEL_MIN_SLOT_WIDTH;
  const showsRegimeIcons = slotWidth >= REGIME_ICON_MIN_SLOT_WIDTH;
  const showsRegimeInitials = slotWidth >= REGIME_INITIALS_MIN_SLOT_WIDTH;
  const showsLinePointMarkers = slotWidth >= LINE_POINT_MARKER_MIN_SLOT_WIDTH;
  const laneOrder: WorkbenchLaneKey[] = ['regime', 'inventory', 'pipeline', 'lead-time'];
  const visibleLaneOrder = expandedLane == null ? laneOrder : [expandedLane];
  const laneRowsStyle = {
    gridTemplateRows: visibleLaneOrder.map(() => 'minmax(0,1fr)').join(' '),
  };
  const isLaneExpanded = (laneKey: WorkbenchLaneKey) => expandedLane === laneKey;
  const toggleLaneExpanded = (laneKey: WorkbenchLaneKey) => {
    setExpandedLane((current) => (current === laneKey ? null : laneKey));
  };
  return (
    <>
      {floatingChartControlIslands}
      <PerformanceSectionShell
        title="SENA system ledger"
        tooltip="Interval-by-interval analysis across regime, inventory, pipeline, and lead time."
        descriptor="Inspect how observations turned into the current system reading."
        headerActions={chartHeaderActions}
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
            onScroll={handleScrollerScroll}
            scrollByViewport={scrollByViewport}
            scrollRef={intervalScrollRef}
            slotWidth={slotWidth}
            onSelect={(intervalIndex) => onIntervalChartLabelClick(intervalIndex, 'observed-signals')}
          />
        </div>

        <div className="grid min-h-0 gap-4" style={laneRowsStyle}>
          {visibleLaneOrder.includes('regime') ? <div className="grid h-full min-h-0 gap-3" data-lane="regime" style={laneGridStyle}>
            <LaneLabel
              subtitle="Continuous regime state with price and stockout cues carried as lightweight markers instead of interval cards."
              title="Regime + price lane"
              tooltip="Dominant regime in each interval, with price and stockout cues."
            />
            <div className="grid min-h-0 gap-2 [grid-template-rows:auto_minmax(0,1fr)]">
              <div className="flex items-start justify-between gap-3 px-1">
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  {visibleRegimes.map((regime) => (
                    <span key={regime} className="inline-flex items-center gap-2">
                      <span className={cn('inline-flex size-5 items-center justify-center rounded-full border border-foreground/10', regimeTint(regime))}>
                        {regimeIcon(regime)}
                      </span>
                      {regime}
                    </span>
                  ))}
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-flex min-w-7 items-center justify-center rounded-full bg-white/78 px-2 py-0.5 text-[0.62rem] font-medium text-foreground">
                      P
                    </span>
                    Price cue count
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-flex min-w-7 items-center justify-center rounded-full bg-white/78 px-2 py-0.5 text-[0.62rem] font-medium text-foreground">
                      S
                    </span>
                    Stockout cue count
                  </span>
                </div>
                <LaneExpandButton expanded={isLaneExpanded('regime')} title="Regime + price lane" onClick={() => toggleLaneExpanded('regime')} />
              </div>
              <div
                ref={regimeScrollRef}
                className="hidden-scrollbar min-h-0 overflow-x-auto overscroll-contain rounded-[1.2rem] border border-border/60 bg-muted/20"
                onScroll={handleScrollerScroll}
                onWheel={createWheelHandler(regimeScrollRef)}
              >
                <div className="relative h-full" style={{ width: contentWidth, minHeight: regimeChartMinHeight }}>
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
                          'relative rounded-[1rem] border text-left transition-transform hover:-translate-y-0.5',
                          selectedIntervalIndex === interval.intervalIndex ? 'border-foreground/20 shadow-sm' : 'border-white/70',
                        )}
                        style={{
                          backgroundColor: regimeFill(interval.dominantRegime),
                          height: regimeTileHeight,
                          width: regimeTileLayout.width,
                          marginLeft: regimeTileLayout.inset,
                          marginRight: regimeTileLayout.inset,
                        }}
                        data-analysis-datalabel="true"
                        type="button"
                        onClick={() => onIntervalChartLabelClick(interval.intervalIndex, 'observed-signals')}
                      >
                        <span className="absolute left-1/2 top-[1.35rem] inline-flex -translate-x-1/2 -translate-y-1/2 items-center justify-center text-foreground/75">
                          {showsRegimeIcons ? (
                            regimeIcon(interval.dominantRegime)
                          ) : showsRegimeInitials ? (
                            <span className="text-[0.62rem] font-semibold tracking-[0.02em] text-foreground/80">
                              {regimeInitials(interval.dominantRegime)}
                            </span>
                          ) : null}
                        </span>
                        <span className="absolute inset-x-2.5 bottom-2 flex flex-nowrap items-center justify-center gap-1 whitespace-nowrap">
                          <RegimeCueBadges
                            priceCueCount={interval.priceCueCount}
                            stockoutCueCount={interval.stockoutCueCount}
                            showLabels={showsRegimeCueLabels}
                          />
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div> : null}

          {visibleLaneOrder.includes('inventory') ? <div className="grid h-full min-h-0 gap-3" data-lane="inventory" style={laneGridStyle}>
            <LaneLabel
              subtitle="Inventory trajectory stays continuous while service demand, retail demand, receipts, and adjustments remain interval-native."
              title="Inventory + demand lane"
              tooltip="Reconstructed inventory with demand, receipts, and adjustments by interval."
            />
            <div className="grid min-h-0 gap-2 [grid-template-rows:auto_minmax(0,1fr)]">
              <div className="flex items-start justify-between gap-3 px-1">
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
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
                <LaneExpandButton expanded={isLaneExpanded('inventory')} title="Inventory + demand lane" onClick={() => toggleLaneExpanded('inventory')} />
              </div>
              <div
                ref={inventoryScrollRef}
                className="hidden-scrollbar min-h-0 overflow-x-auto overscroll-contain rounded-[1.2rem] border border-border/60 bg-muted/20 px-0"
                onScroll={handleScrollerScroll}
                onWheel={createWheelHandler(inventoryScrollRef)}
              >
                <div className="relative flex h-full items-stretch" style={{ width: contentWidth, minHeight: inventoryLaneMinHeight }}>
                  <SelectedIntervalColumnOverlay
                    activeIndex={selectedIntervalPosition}
                    axisContentWidth={contentWidth}
                    axisEndPadding={AXIS_END_PADDING}
                    axisStartPadding={AXIS_START_PADDING}
                    itemCount={itemCount}
                    slotWidth={slotWidth}
                    className="inset-y-2"
                  />
                  <div className="relative w-full self-stretch" data-analysis-chart="inventory" style={{ height: inventoryChartContentHeight }}>
                    <svg
                      aria-hidden="true"
                      className="absolute left-0 top-0 w-full"
                      preserveAspectRatio="none"
                      style={{ height: inventoryPlotHeight, top: CHART_GUTTER_HEIGHT }}
                      viewBox={`0 0 ${Math.max(contentWidth, 1)} ${CHART_VIEWBOX_HEIGHT}`}
                    >
                      {inventoryBandPath ? <path d={inventoryBandPath} fill="currentColor" className="text-foreground/10" /> : null}
                      <polyline
                        fill="none"
                        points={inventoryPolyline}
                        stroke="currentColor"
                        strokeWidth={inventoryGeometry.strokeWidth}
                        className="text-foreground"
                        data-analysis-line="inventory"
                      />
                    </svg>
                    {inventoryCoordinates.map((point, index) => {
                      const entry = inventoryPoints[index];
                      if (!entry) {
                        return null;
                      }
                      const isSelected = selectedIntervalIndex === entry.intervalIndex;
                      if (!showsLinePointMarkers && !isSelected) {
                        return null;
                      }
                      const pointTop = deriveLabelGutterOffset({
                        plotY: point.y,
                        plotHeight: inventoryPlotHeight,
                        gutterHeight: CHART_GUTTER_HEIGHT,
                        viewBoxHeight: CHART_VIEWBOX_HEIGHT,
                      });
                      return (
                        <Fragment key={`inventory-point:${entry.intervalIndex}`}>
                          {isSelected ? (
                            <ClampedChartDataLabel
                              anchorX={point.x}
                              anchorY={pointTop}
                              containerWidth={contentWidth}
                              containerHeight={CHART_GUTTER_HEIGHT + inventoryPlotHeight}
                              className="whitespace-nowrap rounded-full border border-border/70 bg-background px-2 py-0.5 text-[10px] font-medium text-foreground shadow-sm"
                            >
                              {Math.round(entry.inventoryMean)}u
                            </ClampedChartDataLabel>
                          ) : null}
                          <button
                            aria-label={`Inventory ${Math.round(entry.inventoryMean)} units in interval ${entry.intervalIndex + 1}`}
                            className="absolute z-[2] -translate-x-1/2 -translate-y-1/2"
                            style={{
                              left: point.x,
                              top: pointTop,
                            }}
                            data-analysis-datalabel="true"
                            type="button"
                            onClick={() => onIntervalChartLabelClick(entry.intervalIndex, 'what-happened')}
                          >
                          <span
                            className={cn('block rounded-full border-2', isSelected ? 'border-foreground bg-foreground' : 'border-foreground/55 bg-background')}
                            style={{ width: inventoryGeometry.markerSize, height: inventoryGeometry.markerSize }}
                          />
                          </button>
                        </Fragment>
                      );
                    })}
                    <div
                      className="absolute left-0 grid"
                      style={{
                        top: inventoryFlowTop,
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
                            demandMaxHeight: inventoryFlowMaxBarHeight,
                            supplyMaxHeight: inventoryFlowMaxBarHeight,
                            minHeight: 2,
                          },
                        );

                        return (
                          <button
                            key={`flow:${point.intervalIndex}`}
                            aria-label={`Service demand ${Math.round(point.serviceDemandMean)}, retail demand ${Math.round(point.retailDemandMean)}, receipts ${Math.round(point.receiptsMean)}, adjustments ${Math.round(point.adjustmentsMean)}`}
                            className="relative"
                            style={{ height: inventoryFlowCellHeight }}
                            data-analysis-flow-cell="inventory"
                            data-analysis-datalabel="true"
                            type="button"
                            onClick={() => onIntervalChartLabelClick(point.intervalIndex, 'what-happened')}
                          >
                            <span
                              className="absolute top-1/2 h-px -translate-y-1/2 bg-border/80"
                              style={{
                                left: inventoryFlowBarLayout.inset,
                                right: inventoryFlowBarLayout.inset,
                              }}
                            />
                            {flowStackHeights.supply.receiptsHeight > 0 ? (
                              <span
                                className="absolute bottom-1/2 left-1/2 -translate-x-1/2 rounded-none bg-emerald-600/80"
                                style={{
                                  width: inventoryFlowBarLayout.width,
                                  height: flowStackHeights.supply.receiptsHeight,
                                }}
                              />
                            ) : null}
                            {flowStackHeights.supply.adjustmentHeight > 0 ? (
                              <span
                                className="absolute left-1/2 -translate-x-1/2 rounded-none bg-amber-600/85"
                                style={{
                                  width: inventoryFlowBarLayout.width,
                                  bottom: `calc(50% + ${flowStackHeights.supply.adjustmentOffset}px)`,
                                  height: flowStackHeights.supply.adjustmentHeight,
                                }}
                              />
                            ) : null}
                            {flowStackHeights.demand.serviceHeight > 0 ? (
                              <span
                                className="absolute left-1/2 top-1/2 -translate-x-1/2 rounded-none bg-slate-500/70"
                                style={{
                                  width: inventoryFlowBarLayout.width,
                                  height: flowStackHeights.demand.serviceHeight,
                                }}
                              />
                            ) : null}
                            {flowStackHeights.demand.retailHeight > 0 ? (
                              <span
                                className="absolute left-1/2 -translate-x-1/2 rounded-none bg-slate-800/80"
                                style={{
                                  width: inventoryFlowBarLayout.width,
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
          </div> : null}

          {visibleLaneOrder.includes('pipeline') ? <div className="grid h-full min-h-0 gap-3" data-lane="pipeline" style={laneGridStyle}>
            <LaneLabel
              subtitle="Aggregate transit windows approximate the pipeline story now, with order and receipt activity pulled out as explicit markers."
              title="Pipeline lane"
              tooltip="Estimated inbound pipeline, order timing, receipts, and transit age by interval."
            />
            <div className="grid min-h-0 gap-2 [grid-template-rows:auto_minmax(0,1fr)]">
              <div className="flex items-start justify-between gap-3 px-1">
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
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
                <LaneExpandButton expanded={isLaneExpanded('pipeline')} title="Pipeline lane" onClick={() => toggleLaneExpanded('pipeline')} />
              </div>
              <div
                ref={pipelineScrollRef}
                className="hidden-scrollbar min-h-0 overflow-x-auto overscroll-contain rounded-[1.2rem] border border-border/60 bg-muted/20"
                onScroll={handleScrollerScroll}
                onWheel={createWheelHandler(pipelineScrollRef)}
              >
                <div className="relative flex h-full items-stretch" style={{ width: contentWidth, minHeight: pipelineLaneMinHeight }}>
                  <SelectedIntervalColumnOverlay
                    activeIndex={selectedIntervalPosition}
                    axisContentWidth={contentWidth}
                    axisEndPadding={AXIS_END_PADDING}
                    axisStartPadding={AXIS_START_PADDING}
                    itemCount={itemCount}
                    slotWidth={slotWidth}
                    className="inset-y-2"
                  />
                  <div className="relative w-full self-stretch" data-analysis-chart="pipeline" style={{ height: pipelineChartContentHeight }}>
                    {selectedPipelineLabelX != null && selectedPipelineLabelY != null && selectedPipelineLabels.length > 0 ? (
                      <ClampedChartDataLabel
                        anchorX={selectedPipelineLabelX}
                        anchorY={selectedPipelineLabelY}
                        containerWidth={contentWidth}
                        containerHeight={pipelineChartContentHeight}
                        gap={8}
                        className="flex flex-col items-center gap-1"
                      >
                        {selectedPipelineLabels.map((label, index) => (
                          <span
                            key={`${label}:${index}`}
                            className="whitespace-nowrap rounded-full border border-border/70 bg-background px-2 py-0.5 text-[10px] font-medium text-foreground shadow-sm"
                          >
                            {label}
                          </span>
                        ))}
                      </ClampedChartDataLabel>
                    ) : null}
                    {model.workbench.pipelineLane.spans.map((span) => {
                      const rangeStart = AXIS_START_PADDING + span.startPosition * slotWidth;
                      const rangeEnd = AXIS_START_PADDING + span.endPosition * slotWidth + slotWidth;
                      const spanBounds = deriveTouchingRangeBounds({
                        start: rangeStart,
                        end: rangeEnd,
                        leadingGap: slotWidth * PIPELINE_PILL_START_OFFSET,
                        trailingGap: slotWidth * (1 - PIPELINE_PILL_END_OFFSET),
                        minWidth: slotWidth * 0.32,
                      });
                      const top = pipelineTopPadding + span.row * pipelineRowHeight;

                      return (
                        <button
                          key={span.key}
                          aria-label={`${Math.round(span.inTransitMean)} in transit, ${Math.round(span.orderQuantityMean)} ordered, ${Math.round(span.receiptQuantityMean)} expected receipt`}
                          className={cn(
                            'absolute flex items-center rounded-full border px-2 text-[0.62rem] font-medium transition-colors',
                            span.overdue
                              ? 'border-rose-300/70 bg-rose-100/75 text-rose-900'
                              : 'border-emerald-700/20 bg-emerald-600/20 text-emerald-900',
                          )}
                          style={{ left: spanBounds.left, top, width: spanBounds.width, height: pipelinePillHeight }}
                          data-analysis-pipeline-pill="true"
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
                      const top = pipelineTopPadding + marker.row * pipelineRowHeight + (marker.kind === 'receipt' ? 2 : -pipelineMarkerHalf - 1);
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
                              'block border border-white shadow-sm',
                              marker.kind === 'order' ? 'rotate-45 rounded-[0.25rem] bg-sky-600/85' : 'rounded-full bg-emerald-600/85',
                            )}
                            style={{ width: pipelineMarkerSize, height: pipelineMarkerSize }}
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div> : null}

          {visibleLaneOrder.includes('lead-time') ? <div className="grid h-full min-h-0 gap-3" data-lane="lead-time" style={laneGridStyle}>
            <LaneLabel
              subtitle="Lead-time drift reads as a trajectory with spread, while variability class stays available on selection instead of printed everywhere."
              title="Lead-time lane"
              tooltip="Estimated lead-time level and spread across intervals."
            />
            <div className="grid min-h-0 gap-2 [grid-template-rows:auto_minmax(0,1fr)]">
              <div className="flex items-start justify-between gap-3 px-1">
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block h-2 w-6 rounded-[0.2rem] bg-sky-600/14" />
                    Spread band
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block h-px w-7 bg-sky-700/80" />
                    Mean lead time
                  </span>
                </div>
                <LaneExpandButton expanded={isLaneExpanded('lead-time')} title="Lead-time lane" onClick={() => toggleLaneExpanded('lead-time')} />
              </div>
              <div
                ref={leadTimeScrollRef}
                className="hidden-scrollbar min-h-0 overflow-x-auto overscroll-contain rounded-[1.2rem] border border-border/60 bg-muted/20"
                onScroll={handleScrollerScroll}
                onWheel={createWheelHandler(leadTimeScrollRef)}
              >
                <div className="relative flex h-full items-stretch" style={{ width: contentWidth, minHeight: leadTimeLaneMinHeight }}>
                  <SelectedIntervalColumnOverlay
                    activeIndex={selectedIntervalPosition}
                    axisContentWidth={contentWidth}
                    axisEndPadding={AXIS_END_PADDING}
                    axisStartPadding={AXIS_START_PADDING}
                    itemCount={itemCount}
                    slotWidth={slotWidth}
                    className="inset-y-2"
                  />
                  <div className="relative w-full self-stretch" data-analysis-chart="lead-time" style={{ height: leadTimeChartContentHeight }}>
                    <svg
                      aria-hidden="true"
                      className="absolute left-0 top-0 w-full"
                      preserveAspectRatio="none"
                      style={{ height: leadTimePlotHeight, top: CHART_GUTTER_HEIGHT }}
                      viewBox={`0 0 ${Math.max(contentWidth, 1)} ${CHART_VIEWBOX_HEIGHT}`}
                    >
                      {leadTimeBandPath ? <path d={leadTimeBandPath} fill="currentColor" className="text-sky-600/14" /> : null}
                      <polyline
                        fill="none"
                        points={leadTimePolyline}
                        stroke="currentColor"
                        strokeWidth={leadTimeGeometry.strokeWidth}
                        className="text-sky-700/80"
                        data-analysis-line="lead-time"
                      />
                    </svg>
                    {leadTimeCoordinates.map((point, index) => {
                      const entry = leadTimePoints[index];
                      if (!entry) {
                        return null;
                      }
                      const isSelected = selectedIntervalIndex === entry.intervalIndex;
                      const spreadDays = Math.max(0, (entry.highDays - entry.lowDays) / 2);
                      if (!showsLinePointMarkers && !isSelected) {
                        return null;
                      }
                      const pointTop = deriveLabelGutterOffset({
                        plotY: point.y,
                        plotHeight: leadTimePlotHeight,
                        gutterHeight: CHART_GUTTER_HEIGHT,
                        viewBoxHeight: CHART_VIEWBOX_HEIGHT,
                      });
                      return (
                        <Fragment key={`lead-time:${entry.intervalIndex}`}>
                          {isSelected ? (
                            <ClampedChartDataLabel
                              anchorX={point.x}
                              anchorY={pointTop}
                              containerWidth={contentWidth}
                              containerHeight={CHART_GUTTER_HEIGHT + leadTimePlotHeight}
                              className="whitespace-nowrap rounded-full border border-border/70 bg-background px-2 py-0.5 text-[10px] font-medium text-foreground shadow-sm"
                            >
                              {`${entry.meanDays.toFixed(1)} ± ${spreadDays.toFixed(1)} Days`}
                            </ClampedChartDataLabel>
                          ) : null}
                          <button
                            aria-label={`Lead time ${entry.meanDays.toFixed(1)} days`}
                            className="absolute z-[2] -translate-x-1/2 -translate-y-1/2"
                            style={{
                              left: point.x,
                              top: pointTop,
                            }}
                            data-analysis-datalabel="true"
                            type="button"
                            onClick={() => onIntervalChartLabelClick(entry.intervalIndex, 'orders-transit-lead-time')}
                          >
                          <span
                            className={cn('block rounded-full border-2', isSelected ? 'border-sky-700 bg-sky-700' : 'border-sky-700/55 bg-background')}
                            style={{ width: leadTimeGeometry.markerSize, height: leadTimeGeometry.markerSize }}
                          />
                          </button>
                        </Fragment>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div> : null}
        </div>
        </div>
      </PerformanceSectionShell>
    </>
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
            <HeaderTooltipLabel tooltip="The service or SKU carrying the pressure signal.">
              Item
            </HeaderTooltipLabel>
          </HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell align="center">
            <HeaderTooltipLabel tooltip="Composite pressure score from 0 to 100. Higher means stronger operational pressure.">
              Pressure score
            </HeaderTooltipLabel>
          </HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell align="center">
            <HeaderTooltipLabel tooltip="How much inbound timing and pipeline posture are driving pressure.">
              Pipeline risk
            </HeaderTooltipLabel>
          </HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell align="center">
            <HeaderTooltipLabel tooltip="How much lead-time delay or variability is driving pressure.">
              Lead time risk
            </HeaderTooltipLabel>
          </HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell align="center">
            <HeaderTooltipLabel tooltip="How much pricing conditions appear to be affecting pressure.">
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
            <HeaderTooltipLabel tooltip="The saved observation record: when it was captured and what it said.">
              Observed
            </HeaderTooltipLabel>
          </HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell className="justify-self-start">
            <HeaderTooltipLabel tooltip="Which evidence types were present in this observation.">
              Observation channels
            </HeaderTooltipLabel>
          </HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell className="justify-self-start">
            <HeaderTooltipLabel tooltip="Services or SKUs tied to this observation.">
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
  const { anchorRef: serviceHeaderAnchorRef, visible: floatingServiceHeaderVisible } = useFloatingTitleActions(model.fragilityRows.length > 0);
  const [floatingServiceHeaderFrame, setFloatingServiceHeaderFrame] = useState({
    left: 0,
    scrollLeft: 0,
    width: 0,
  });

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

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const viewportPadding = 24;
    const columnGap = 8;
    const islandPadding = 8;
    const updateFrame = () => {
      const rect = viewport.getBoundingClientRect();
      const headerLeft = rect.left + viewportPadding + sharedCellWidth + columnGap - viewport.scrollLeft;
      const headerWidth = model.fragilityRows.length > 0
        ? model.fragilityRows.length * sharedCellWidth + Math.max(0, model.fragilityRows.length - 1) * columnGap
        : 0;
      const nextFrame = {
        left: headerLeft - islandPadding,
        scrollLeft: viewport.scrollLeft,
        width: headerWidth + islandPadding * 2,
      };

      setFloatingServiceHeaderFrame((current) =>
        current.left === nextFrame.left &&
        current.scrollLeft === nextFrame.scrollLeft &&
        current.width === nextFrame.width
          ? current
          : nextFrame,
      );
    };

    updateFrame();
    viewport.addEventListener('scroll', updateFrame, { passive: true });
    window.addEventListener('scroll', updateFrame, { passive: true });
    window.addEventListener('resize', updateFrame);

    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateFrame) : null;
    observer?.observe(viewport);

    return () => {
      viewport.removeEventListener('scroll', updateFrame);
      window.removeEventListener('scroll', updateFrame);
      window.removeEventListener('resize', updateFrame);
      observer?.disconnect();
    };
  }, [model.fragilityRows.length, sharedCellWidth]);

  return (
    <PerformanceSectionShell
      title="Supply fragility map"
      tooltip="Matrix of services and linked SKUs, with contributor pressure in each cell."
      descriptor="See which linked SKUs are most likely to limit each service."
      className={showRightRailCards ? 'lg:rounded-r-none' : undefined}
      contentClassName="px-0 py-0"
    >
      {floatingServiceHeaderVisible ? (
        <div
          className="pointer-events-none fixed top-4 z-40"
          style={{ left: floatingServiceHeaderFrame.left, width: floatingServiceHeaderFrame.width }}
          data-slot="floating-title-actions"
        >
          <div className="editorial-panel rounded-[1.5rem] border-white/70 bg-background/92 p-2 shadow-[var(--shadow-float)] backdrop-blur-[10px]">
            <div
              className="grid min-w-max gap-2"
              style={{
                gridTemplateColumns: `repeat(${model.fragilityRows.length}, ${sharedCellWidth}px)`,
              }}
            >
              {model.fragilityRows.map((service, serviceIndex) => (
                <button
                  key={`floating:${service.entityId}`}
                  className="pointer-events-auto flex items-center gap-2 rounded-[1.15rem] border border-border/70 bg-white px-3 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted/30"
                  style={{ gridColumnStart: serviceIndex + 1, gridRowStart: 1 }}
                  type="button"
                  onClick={() => setSelection({ type: 'entity', entityId: service.entityId, entityType: service.entityType })}
                >
                  <Store className="size-4 shrink-0" />
                  <span>{service.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
      <div ref={viewportRef} className="overflow-x-auto px-6 py-5">
        <div
          className="grid min-w-max gap-2"
          style={{ gridTemplateColumns: `repeat(${model.fragilityRows.length + 1}, ${sharedCellWidth}px)` }}
        >
          <div aria-hidden="true" />
          {model.fragilityRows.map((service, serviceIndex) => (
            <button
              key={service.entityId}
              ref={serviceIndex === 0 ? serviceHeaderAnchorRef : undefined}
              className="flex items-center gap-2 rounded-[1.15rem] border border-transparent bg-transparent px-3 py-2 text-left text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
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
                    <p className="text-sm font-semibold capitalize text-foreground">{cell?.pressureLabel ?? '—'}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Usage: {cell?.usageLabel ?? '—'}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Bottleneck: {cell?.bottleneckLabel ?? '—'}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{cell?.reliefLabel ?? '—'}</p>
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
      <AnalysisRailSection icon={<FileSearch className="size-4" />} title="Observation" tooltip="The saved observation currently selected.">
        <p className="text-2xl font-semibold tracking-[-0.03em] text-foreground">{row.title}</p>
        <p className="text-sm text-muted-foreground">{row.observedAt}</p>
        <p className="text-sm leading-6 text-muted-foreground">{row.detail}</p>
      </AnalysisRailSection>

      <AnalysisRailSection icon={<Radio className="size-4" />} title="Channels" tooltip="Evidence types present in this observation.">
        <ObservationChannels row={row} />
      </AnalysisRailSection>

      <AnalysisRailSection icon={<ListTree className="size-4" />} title="Affected entities" tooltip="Services or SKUs linked to this observation.">
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
      <AnalysisRailSection icon={<CircleGauge className="size-4" />} title="Interval explanation" tooltip="Banji's summary of the selected interval.">
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
        tooltip="Observed evidence that touched this interval."
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
        tooltip="The main demand and inventory movements in this interval."
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
        tooltip="Order, inbound, and lead-time conditions in this interval."
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
        tooltip="The entity currently selected in the analysis."
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

      <AnalysisRailSection icon={<CircleGauge className="size-4" />} title="Posterior state" tooltip="Current modeled state for demand, stock, reorder posture, and inbound exposure.">
        <AnalysisRailList>
          <AnalysisRailRow primary={<span className="text-muted-foreground">Posterior units</span>} secondary={row.posteriorUnitsLabel} />
          <AnalysisRailRow primary={<span className="text-muted-foreground">Demand per day</span>} secondary={row.demandPerDayLabel} />
          <AnalysisRailRow primary={<span className="text-muted-foreground">Reorder trigger</span>} secondary={row.reorderTriggerLabel} />
          <AnalysisRailRow primary={<span className="text-muted-foreground">In transit</span>} secondary={row.inTransitExposureLabel} />
          <AnalysisRailRow primary={<span className="text-muted-foreground">Lead-time mean</span>} secondary={row.leadTimeMeanLabel} />
          <AnalysisRailRow primary={<span className="text-muted-foreground">Lead-time spread</span>} secondary={row.leadTimeSpreadLabel} />
        </AnalysisRailList>
      </AnalysisRailSection>

      <AnalysisRailSection icon={<ListTree className="size-4" />} title="Contributor stack" tooltip="The strongest linked contributors behind this entity.">
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
      <AnalysisRailSection icon={<Radar className="size-4" />} title="Current system state" tooltip="Summary of the current system when nothing specific is selected.">
        <p className="text-2xl font-semibold tracking-[-0.03em] text-foreground">{model.inspectorOverview.dominantRegime}</p>
        <div className="grid gap-1 text-sm text-muted-foreground">
          <p>Change-point probability {model.inspectorOverview.changePointProbability}</p>
          <p>{model.inspectorOverview.coverageSummary}</p>
        </div>
      </AnalysisRailSection>

      <AnalysisRailSection icon={<ChartNoAxesColumnIncreasing className="size-4" />} title="Strongest channels" tooltip="Evidence channels contributing most to the current system read.">
        <AnalysisRailList>
          {model.inspectorOverview.strongestChannels.map((entry, index) => (
            <AnalysisRailRow key={`${entry}:${index}`} primary={<span className="text-muted-foreground">{entry}</span>} />
          ))}
        </AnalysisRailList>
      </AnalysisRailSection>

      <AnalysisRailSection icon={<Boxes className="size-4" />} title="Affected entities" tooltip="Entities currently carrying the most structural pressure.">
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
  chartZoomResetToken = 0,
  hasOlderIntervals,
  isLoadingOlderIntervals,
  loadOlderIntervals,
  model,
  onOlderLoadProgressChange,
  onResetCharts,
  onTimeframeChange,
  selectedIntervalIndex,
  setSelection,
  onIntervalChartLabelClick,
  showRightRailCards,
  timeframe,
}: {
  chartZoomResetToken?: number;
  hasOlderIntervals: boolean;
  isLoadingOlderIntervals: boolean;
  loadOlderIntervals: (limit?: number) => Promise<number>;
  model: AnalysisWorkbenchViewModel;
  onOlderLoadProgressChange?: (progress: { current: number; total: number } | null) => void;
  onResetCharts?: () => Promise<void> | void;
  onTimeframeChange: (value: AnalysisTimeframe) => void;
  selectedIntervalIndex: number | null;
  setSelection: (value: AnalysisSelection) => void;
  onIntervalChartLabelClick: (intervalIndex: number, section: IntervalRailSectionKey) => void;
  showRightRailCards: boolean;
  timeframe: AnalysisTimeframe;
}) {
  return (
    <div className="grid gap-6">
      <SystemLedger
        chartZoomResetToken={chartZoomResetToken}
        hasOlderIntervals={hasOlderIntervals}
        isLoadingOlderIntervals={isLoadingOlderIntervals}
        loadOlderIntervals={loadOlderIntervals}
        model={model}
        onOlderLoadProgressChange={onOlderLoadProgressChange}
        onResetCharts={onResetCharts}
        onTimeframeChange={onTimeframeChange}
        selectedIntervalIndex={selectedIntervalIndex}
        setSelection={setSelection}
        onIntervalChartLabelClick={onIntervalChartLabelClick}
        showRightRailCards={showRightRailCards}
        timeframe={timeframe}
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
        tooltip="Ranked table of entities showing where structural pressure comes from."
        descriptor="Compare whether pressure is coming from demand, pipeline, lead time, or price."
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
        tooltip="Ledger of saved observations and the evidence channels each one carried."
        descriptor="Review which observation channels were present in each saved record."
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
        tooltip="Read-only model and evidence metadata for the current analysis window."
        descriptor="Check the run settings and evidence coverage behind this analysis."
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
  chartZoomResetToken = 0,
  hasOlderIntervals,
  isLoadingOlderIntervals,
  loadOlderIntervals,
  model,
  onOlderLoadProgressChange,
  onResetCharts,
  section,
  setSection,
  setTimeframe = () => {},
  showRightRailCards,
  timeframe = 'Recent',
}: {
  chartZoomResetToken?: number;
  hasOlderIntervals: boolean;
  isLoadingOlderIntervals: boolean;
  loadOlderIntervals: (limit?: number) => Promise<number>;
  model: AnalysisWorkbenchViewModel;
  onOlderLoadProgressChange?: (progress: { current: number; total: number } | null) => void;
  onResetCharts?: () => Promise<void> | void;
  section: AnalysisSection;
  setSection: (value: AnalysisSection) => void;
  setTimeframe?: (value: AnalysisTimeframe) => void;
  showRightRailCards: boolean;
  timeframe?: AnalysisTimeframe;
}) {
  const [selection, setSelection] = useState<AnalysisSelection>({ type: 'overview' });
  const [pendingSection, setPendingSection] = useState<AnalysisSection | null>(null);
  const [flashedIntervalSection, setFlashedIntervalSection] = useState<IntervalRailSectionKey | null>(null);
  const flashTimeoutRef = useRef<number | null>(null);
  const activeSection = pendingSection ?? section;
  const isSectionPending = pendingSection != null && pendingSection !== section;
  const railEnabled = showRightRailCards && sectionSupportsRightRail(activeSection);
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
    if (pendingSection === section) {
      setPendingSection(null);
    }
  }, [pendingSection, section]);

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
    if (activeSection === 'workbench' && selection.type === 'interval') {
      if (target.closest('[data-analysis-datalabel="true"]')) {
        return;
      }
      clearIntervalSelection();
      return;
    }
    if (activeSection === 'pressure' && selection.type === 'entity') {
      if (target.closest('[data-pressure-cell="true"]')) {
        return;
      }
      handleSelection({ type: 'overview' });
      return;
    }
    if (activeSection === 'observations' && selection.type === 'observation') {
      if (target.closest('[data-observation-cell="true"]')) {
        return;
      }
      handleSelection({ type: 'overview' });
      return;
    }
  };

  const surface = useMemo(() => {
    if (isSectionPending) {
      return <AnalysisSurfaceWireframe section={activeSection} />;
    }
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
              chartZoomResetToken={chartZoomResetToken}
              hasOlderIntervals={hasOlderIntervals}
              isLoadingOlderIntervals={isLoadingOlderIntervals}
              loadOlderIntervals={loadOlderIntervals}
              model={model}
              onOlderLoadProgressChange={onOlderLoadProgressChange}
              onResetCharts={onResetCharts}
              onTimeframeChange={setTimeframe}
              selectedIntervalIndex={selectedIntervalIndex}
              setSelection={handleSelection}
              onIntervalChartLabelClick={handleIntervalChartLabelClick}
              showRightRailCards={railEnabled}
              timeframe={timeframe}
            />
    );
  }, [activeSection, chartZoomResetToken, handleIntervalChartLabelClick, handleSelection, isSectionPending, model, onOlderLoadProgressChange, onResetCharts, railEnabled, section, selectedEntityId, selectedIntervalIndex, setTimeframe, timeframe, hasOlderIntervals, isLoadingOlderIntervals, loadOlderIntervals]);

  return (
    <div className="grid gap-6" onPointerDown={handleWorkbenchPointerDown}>
      <DiagnosticStrip model={model} />
      <ChromeTabs
        className="relative gap-0"
        value={activeSection}
        onValueChange={(nextValue) => {
          if (nextValue) {
            const nextSection = nextValue as AnalysisSection;
            if (nextSection === activeSection) {
              return;
            }
            setPendingSection(nextSection);
            startTransition(() => {
              setSection(nextSection);
            });
          }
        }}
      >
        <InternalNav section={activeSection} showRightRailCards={railEnabled} />

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
            {railEnabled ? (
              isSectionPending
                ? <AnalysisRailWireframe />
                : <InspectorRail flashedSection={flashedIntervalSection} model={model} section={activeSection} selection={selectedObservationId ? selection : selection} />
            ) : null}
          </div>
        </section>
      </ChromeTabs>
    </div>
  );
}
