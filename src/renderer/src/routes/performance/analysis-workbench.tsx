import { Fragment, startTransition, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode, type RefObject, type UIEvent, type WheelEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  ActionOpenExternalIcon,
} from '@icons/actions';
import { getRegimeIcon } from '@icons/domain';
import {
  EntityEvidenceIcon,
  EntityPackageSearchIcon,
  EntityServiceIcon,
  EntitySignalIcon,
  EntitySkuIcon,
  EntityWaypointsIcon,
} from '@icons/entities';
import {
  NavigationCatalogIcon,
  NavigationDenseGridIcon,
  NavigationHierarchyIcon,
} from '@icons/navigation';
import {
  StatusGaugeIcon,
  StatusRadarIcon,
  StatusSettingsControlIcon,
  StatusTrendChartIcon,
  StatusWaveformIcon,
} from '@icons/status';
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
import { ItemIdentityBlock } from '@/components/system/item-identity';
import { useFloatingTitleActions } from '@/components/system/floating-title-actions';
import { Button } from '@/components/ui/button';
import { ChromeTabs, ChromeTabsList, ChromeTabsTrigger } from '@/components/ui/chrome-tabs';
import { cardFrameClassName, cardSurfaceClassName } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { rowHoverClassName } from '@/lib/interactive-surface';
import { translateObservationEvidenceLabel, translateRegimeLabel } from '@/lib/localized-display';
import { regimeChartFill, regimeTintedSurfaceClassName } from '@/lib/state-tones';
import { translateUiLiteral } from '@/lib/translations';
import { cn } from '@/lib/utils';
import { statusPillClassName } from '@/lib/state-tones';
import { SectionLabel } from '@/routes/sku-detail/section-heading';
import { usePreferences } from '@/state/preferences';
import { LaneExpandButton, useChartWorkspace, useChartWorkspaceControls } from '@/components/system/chart-workspace';
import type { ChartCustomTimeframeRange } from '@/components/system/chart-timeframe';
import type { ChartLayoutPreferenceMergeOptions, PersistedChartLayoutPreferences } from '@/lib/chart-layout-preferences';
import { PagedPanelNavigation } from '@/routes/detail-panels';
import { PerformanceSectionShell, PERFORMANCE_HEADER_SURFACE_CLASS_NAME } from './chrome';
import type {
  AnalysisEntityPressureRow,
  AnalysisRiskLevel,
  AnalysisObservationLedgerRow,
  AnalysisScope,
  AnalysisSection,
  AnalysisSelection,
  AnalysisWorkbenchViewModel,
} from './analysis-view-model';
import { PIPELINE_PILL_END_OFFSET, PIPELINE_PILL_START_OFFSET } from './analysis-view-model';
import { ANALYSIS_TIMEFRAME_OPTIONS, type AnalysisTimeframe } from './analysis-timeframe';
import { AnalysisTradingChartLedger } from './trading-chart-ledger';

const pressureTableLayout = createHeaderedTableLayout({
  breakpoint: 'xl',
  columns: 'minmax(18rem,1.45fr) minmax(8rem,0.72fr) minmax(8rem,0.72fr) minmax(8rem,0.72fr) minmax(10rem,0.9fr)',
  gap: 4,
});

const ANALYSIS_BOARD_CLASS_NAME = `${cardFrameClassName} ${cardSurfaceClassName} relative z-[1] overflow-hidden rounded-[2rem]`;
const ANALYSIS_RAIL_PANEL_CLASS_NAME = 'flex h-full flex-col bg-secondary/15 lg:rounded-l-none';

function sectionSupportsRightRail(section: AnalysisSection) {
  return section !== 'observations' && section !== 'fragility';
}

function analysisRailBlockClassName() {
  return 'border-t border-border/60 px-5 py-5 first:border-t-0';
}

function scoreCellTone(level: AnalysisRiskLevel) {
  if (level === 'critical' || level === 'high') {
    return 'danger';
  }
  if (level === 'medium') {
    return 'warning';
  }
  return 'info';
}

function entityIcon(type: AnalysisEntityPressureRow['entityType']) {
  if (type === 'sku') {
    return <EntitySkuIcon className="size-4 text-muted-foreground" />;
  }
  return <EntityServiceIcon className="size-4 text-muted-foreground" />;
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

function eventTargetsChartDialog(target: HTMLElement) {
  return Boolean(
    target.closest('[data-chart-dialog-overlay="true"]') ||
    target.closest('[data-chart-dialog-content="true"]') ||
    target.closest('[data-chart-style-popover="true"]') ||
    target.closest('[role="dialog"]'),
  );
}

type IntervalRailSectionKey = 'observed-signals' | 'what-happened' | 'orders-transit-lead-time';
type WorkbenchLaneKey = 'regime' | 'inventory' | 'pipeline' | 'lead-time';

function regimeIcon(regime: string) {
  const Icon = getRegimeIcon(regime);
  return <Icon className="size-4" />;
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
const EXPANDED_LANE_HEIGHT_MULTIPLIER = 4;
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
  const { t } = usePreferences();
  if (priceCueCount === 0 && stockoutCueCount === 0) {
    return <span className="text-[0.62rem] text-foreground/60">{t('analysisWorkbenchQuiet')}</span>;
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
  const { t } = usePreferences();
  if (values.length === 0) {
    return <span className="text-xs text-muted-foreground">{t('analysisWorkbenchNoSignal')}</span>;
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
  if (!secondary) {
    return (
      <div className="rounded-[1rem] px-3 py-3">
        <div className="min-w-0 break-words text-sm text-foreground">{primary}</div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[minmax(6.5rem,0.85fr)_minmax(0,1.15fr)] items-start gap-3 rounded-[1rem] px-3 py-3">
      <div className="min-w-0 break-words text-sm text-foreground">{primary}</div>
      <div className="min-w-0 break-words text-right text-sm text-muted-foreground [overflow-wrap:anywhere]">{secondary}</div>
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
  const { t } = usePreferences();
  const navOptions: Array<{ value: AnalysisSection; label: string; leading: ReactNode }> = [
    { value: 'workbench', label: t('analysisWorkbenchNavWorkbench'), leading: <EntityWaypointsIcon className="size-4" /> },
    { value: 'pressure', label: t('analysisWorkbenchNavPressure'), leading: <StatusGaugeIcon className="size-4" /> },
    { value: 'observations', label: t('analysisWorkbenchNavObservations'), leading: <EntityEvidenceIcon className="size-4" /> },
    { value: 'fragility', label: t('analysisWorkbenchNavFragility'), leading: <NavigationDenseGridIcon className="size-4" /> },
    { value: 'settings', label: t('analysisWorkbenchNavSettings'), leading: <StatusSettingsControlIcon className="size-4" /> },
  ];
  return (
    <div className={`relative flex overflow-x-auto overflow-y-hidden px-5 sm:px-6 ${showRightRailCards ? 'lg:pr-[calc(320px+1.5rem)]' : ''}`}>
      <ChromeTabsList aria-label={t('analysisWorkbenchSelectSurface')} className="min-w-max">
        {navOptions.map((option) => (
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
  const { t } = usePreferences();
  const intervalScrollRef = useRef<HTMLDivElement | null>(null);
  const regimeScrollRef = useRef<HTMLDivElement | null>(null);
  const inventoryScrollRef = useRef<HTMLDivElement | null>(null);
  const pipelineScrollRef = useRef<HTMLDivElement | null>(null);
  const leadTimeScrollRef = useRef<HTMLDivElement | null>(null);
  const laneRowsRef = useRef<HTMLDivElement | null>(null);
  const [expandedLane, setExpandedLane] = useState<WorkbenchLaneKey | null>(null);
  const [collapsedRegimeViewportHeight, setCollapsedRegimeViewportHeight] = useState(0);
  const [sectionHeightCap, setSectionHeightCap] = useState(0);
  const intervalEntries = useMemo(() => model.intervals.map((interval) => ({
    intervalIndex: interval.intervalIndex,
    startAt: interval.startAt,
    endAt: interval.endAt,
  })), [model.intervals]);
  const itemCount = intervalEntries.length;
  const syncRefs = [intervalScrollRef, regimeScrollRef, inventoryScrollRef, pipelineScrollRef, leadTimeScrollRef];
  const regimeViewportHeight = useObservedElementHeight(regimeScrollRef, expandedLane);
  useEffect(() => {
    if (expandedLane == null && regimeViewportHeight > 0) {
      setCollapsedRegimeViewportHeight((current) => (current === regimeViewportHeight ? current : regimeViewportHeight));
    }
  }, [expandedLane, regimeViewportHeight]);
  useEffect(() => {
    const section = laneRowsRef.current?.closest('section');
    if (!(section instanceof HTMLElement)) {
      return;
    }
    const updateHeight = () => setSectionHeightCap((current) => (current === section.clientHeight ? current : section.clientHeight));
    const observer = new ResizeObserver(updateHeight);
    observer.observe(section);
    updateHeight();
    return () => observer.disconnect();
  }, [expandedLane]);
  const expandedLaneViewportHeight =
    expandedLane != null && collapsedRegimeViewportHeight > 0
      ? Math.min(
          collapsedRegimeViewportHeight * EXPANDED_LANE_HEIGHT_MULTIPLIER,
          sectionHeightCap > 0 ? sectionHeightCap : Number.POSITIVE_INFINITY,
        )
      : 0;
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
  const regimeIntervalsByIndex = useMemo(
    () => new Map(model.workbench.regimePriceLane.intervals.map((interval) => [interval.intervalIndex, interval])),
    [model.workbench.regimePriceLane.intervals],
  );
  const selectedIntervalPosition = useMemo(
    () => (selectedIntervalIndex == null ? null : regimeIntervalsByIndex.get(selectedIntervalIndex)?.intervalPosition ?? null),
    [regimeIntervalsByIndex, selectedIntervalIndex],
  );
  const visibleRegimes = useMemo(
    () => [...new Map(model.workbench.regimePriceLane.intervals.map((interval) => [interval.dominantRegime, interval.dominantRegime])).values()],
    [model.workbench.regimePriceLane.intervals],
  );
  const inventoryPoints = model.workbench.inventoryDemandLane.points;
  const inventoryAvailableHeight = expandedLane === 'inventory' && expandedLaneViewportHeight > 0
    ? Math.max(INVENTORY_CHART_PLOT_HEIGHT + INVENTORY_FLOW_SECTION_HEIGHT, expandedLaneViewportHeight - CHART_GUTTER_HEIGHT - 4)
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
  const inventoryChart = useMemo(() => {
    const meanValues = inventoryPoints.map((point) => point.inventoryMean);
    const lowValues = inventoryPoints.map((point) => point.inventoryLow);
    const highValues = inventoryPoints.map((point) => point.inventoryHigh);
    const domainMin = lowValues.length > 0 ? Math.min(...lowValues) : 0;
    const domainMax = highValues.length > 0 ? Math.max(...highValues) : 1;

    return {
      meanValues,
      lowValues,
      highValues,
      domainMin,
      domainMax,
      polyline: buildPolylineWithDomain(
        meanValues,
        slotWidth,
        CHART_VIEWBOX_HEIGHT,
        domainMin,
        domainMax,
        { axisStartPadding: AXIS_START_PADDING, topPadding: 5, bottomPadding: 5 },
      ),
      coordinates: buildPointCoordinatesWithDomain(
        meanValues,
        slotWidth,
        CHART_VIEWBOX_HEIGHT,
        domainMin,
        domainMax,
        { axisStartPadding: AXIS_START_PADDING, topPadding: 5, bottomPadding: 5 },
      ),
      bandPath: buildTrajectoryBandPath(
        lowValues,
        highValues,
        slotWidth,
        CHART_VIEWBOX_HEIGHT,
        domainMin,
        domainMax,
        {
          axisStartPadding: AXIS_START_PADDING,
          topPadding: 5,
          bottomPadding: 5,
          minVisibleThickness: inventoryGeometry.bandMinThickness,
        },
      ),
    };
  }, [inventoryGeometry.bandMinThickness, inventoryPoints, slotWidth]);
  const leadTimePoints = model.workbench.leadTimeLane.points;
  const leadTimeAvailableHeight = expandedLane === 'lead-time' && expandedLaneViewportHeight > 0
    ? Math.max(LEAD_TIME_CHART_PLOT_HEIGHT, expandedLaneViewportHeight - CHART_GUTTER_HEIGHT - 4)
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
  const leadTimeChart = useMemo(() => {
    const meanValues = leadTimePoints.map((point) => point.meanDays);
    const lowValues = leadTimePoints.map((point) => point.lowDays);
    const highValues = leadTimePoints.map((point) => point.highDays);
    const domainMin = lowValues.length > 0 ? Math.min(...lowValues) : 0;
    const domainMax = highValues.length > 0 ? Math.max(...highValues) : 1;

    return {
      meanValues,
      lowValues,
      highValues,
      domainMin,
      domainMax,
      polyline: buildPolylineWithDomain(
        meanValues,
        slotWidth,
        CHART_VIEWBOX_HEIGHT,
        domainMin,
        domainMax,
        { axisStartPadding: AXIS_START_PADDING, topPadding: 5, bottomPadding: 5 },
      ),
      coordinates: buildPointCoordinatesWithDomain(
        meanValues,
        slotWidth,
        CHART_VIEWBOX_HEIGHT,
        domainMin,
        domainMax,
        { axisStartPadding: AXIS_START_PADDING, topPadding: 5, bottomPadding: 5 },
      ),
      bandPath: buildTrajectoryBandPath(
        lowValues,
        highValues,
        slotWidth,
        CHART_VIEWBOX_HEIGHT,
        domainMin,
        domainMax,
        {
          axisStartPadding: AXIS_START_PADDING,
          topPadding: 5,
          bottomPadding: 5,
          minVisibleThickness: leadTimeGeometry.bandMinThickness,
        },
      ),
    };
  }, [leadTimeGeometry.bandMinThickness, leadTimePoints, slotWidth]);
  const regimeAvailableHeight = expandedLane === 'regime' && expandedLaneViewportHeight > 0
    ? Math.max(REGIME_CHART_MIN_HEIGHT, expandedLaneViewportHeight - 4)
    : REGIME_CHART_MIN_HEIGHT;
  const regimeChartMinHeight = regimeAvailableHeight;
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
  const pipelineAvailableHeight = expandedLane === 'pipeline' && expandedLaneViewportHeight > 0
    ? Math.max(pipelineCollapsedBodyHeight, expandedLaneViewportHeight - 4)
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
  const pipelineSpanByIntervalIndex = useMemo(
    () => new Map(model.workbench.pipelineLane.spans.map((span) => [span.intervalIndex, span])),
    [model.workbench.pipelineLane.spans],
  );
  const pipelineMarkersByIntervalIndex = useMemo(() => {
    const markersByIntervalIndex = new Map<number, typeof model.workbench.pipelineLane.markers>();
    for (const marker of model.workbench.pipelineLane.markers) {
      const current = markersByIntervalIndex.get(marker.intervalIndex);
      if (current) {
        current.push(marker);
      } else {
        markersByIntervalIndex.set(marker.intervalIndex, [marker]);
      }
    }
    return markersByIntervalIndex;
  }, [model.workbench.pipelineLane.markers]);
  const selectedPipeline = useMemo(() => {
    const span = selectedIntervalIndex == null ? null : pipelineSpanByIntervalIndex.get(selectedIntervalIndex) ?? null;
    const markers = selectedIntervalIndex == null ? [] : pipelineMarkersByIntervalIndex.get(selectedIntervalIndex) ?? [];
    const labels = [
      ...(span ? [`${Math.round(span.orderProbability * 100)}% order probability`] : []),
      ...markers.map((marker) => `${marker.kind === 'order' ? 'Order' : 'Receipt'} ${Math.round(marker.quantityMean)}`),
    ];
    return { labels, markers, span };
  }, [pipelineMarkersByIntervalIndex, pipelineSpanByIntervalIndex, selectedIntervalIndex]);
  const selectedPipelineLabelX = selectedIntervalPosition == null
    ? null
    : deriveSlotCenterX({ index: selectedIntervalPosition, slotWidth, axisStartPadding: AXIS_START_PADDING });
  const selectedPipelineLabelY = (() => {
    if (selectedPipeline.span) {
      return pipelineTopPadding + selectedPipeline.span.row * pipelineRowHeight;
    }
    if (selectedPipeline.markers.length > 0) {
      return Math.min(
        ...selectedPipeline.markers.map((marker) => (
          pipelineTopPadding + marker.row * pipelineRowHeight + (marker.kind === 'receipt' ? 2 : -pipelineMarkerHalf - 1)
        )),
      );
    }
    return null;
  })();
  const laneGridStyle = useMemo(() => ({ gridTemplateColumns: `${LANE_LABEL_COLUMN} minmax(0,1fr)` }), []);
  const showsRegimeCueLabels = slotWidth >= REGIME_CUE_LABEL_MIN_SLOT_WIDTH;
  const showsRegimeIcons = slotWidth >= REGIME_ICON_MIN_SLOT_WIDTH;
  const showsRegimeInitials = slotWidth >= REGIME_INITIALS_MIN_SLOT_WIDTH;
  const showsLinePointMarkers = slotWidth >= LINE_POINT_MARKER_MIN_SLOT_WIDTH;
  const laneOrder: WorkbenchLaneKey[] = ['regime', 'inventory', 'pipeline', 'lead-time'];
  const visibleLaneOrder = expandedLane == null ? laneOrder : [expandedLane];
  const laneRowsStyle = useMemo(
    () => ({ gridTemplateRows: visibleLaneOrder.map(() => (expandedLane == null ? 'minmax(0,1fr)' : 'auto')).join(' ') }),
    [expandedLane, visibleLaneOrder],
  );
  const isLaneExpanded = (laneKey: WorkbenchLaneKey) => expandedLane === laneKey;
  const toggleLaneExpanded = (laneKey: WorkbenchLaneKey) => {
    setExpandedLane((current) => (current === laneKey ? null : laneKey));
  };
  return (
    <>
      {floatingChartControlIslands}
      <PerformanceSectionShell
        title={t('analysisWorkbenchLedgerTitle')}
        tooltip={t('analysisWorkbenchLedgerTooltip')}
        descriptor={t('analysisWorkbenchLedgerDescriptor')}
        headerActions={chartHeaderActions}
        className={cn(showRightRailCards && 'lg:rounded-r-none', 'h-full')}
        contentClassName="px-0 py-0"
      >
        <div
          className={cn(
            'grid gap-4 px-6 py-5',
            expandedLane == null ? 'h-full [grid-template-rows:auto_minmax(0,1fr)]' : '[grid-template-rows:auto_auto]',
          )}
        >
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

        <div
          ref={laneRowsRef}
          className="grid min-h-0 gap-4"
          data-analysis-lane-rows="true"
          style={laneRowsStyle}
        >
          {visibleLaneOrder.includes('regime') ? <div className="grid h-full min-h-0 gap-3" data-lane="regime" style={laneGridStyle}>
            <LaneLabel
              subtitle={t('analysisWorkbenchLaneRegimeSubtitle')}
              title={t('analysisWorkbenchLaneRegimeTitle')}
              tooltip={t('analysisWorkbenchLaneRegimeTooltip')}
            />
            <div className="grid min-h-0 gap-2 [grid-template-rows:auto_minmax(0,1fr)]">
              <div className="flex items-start justify-between gap-3 px-1">
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  {visibleRegimes.map((regime) => (
                    <span key={regime} className="inline-flex items-center gap-2">
                      <span className={cn('inline-flex size-5 items-center justify-center rounded-full border border-foreground/10', regimeTintedSurfaceClassName(regime))}>
                        {regimeIcon(regime)}
                      </span>
                      {translateRegimeLabel(language, regime)}
                    </span>
                  ))}
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-flex min-w-7 items-center justify-center rounded-full bg-white/78 px-2 py-0.5 text-[0.62rem] font-medium text-foreground">
                      P
                    </span>
                    {t('analysisWorkbenchPriceCueCount')}
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-flex min-w-7 items-center justify-center rounded-full bg-white/78 px-2 py-0.5 text-[0.62rem] font-medium text-foreground">
                      S
                    </span>
                    {t('analysisWorkbenchStockoutCueCount')}
                  </span>
                </div>
                <LaneExpandButton expanded={isLaneExpanded('regime')} title={t('analysisWorkbenchLaneRegimeTitle')} onClick={() => toggleLaneExpanded('regime')} />
              </div>
              <div
                ref={regimeScrollRef}
                className="hidden-scrollbar min-h-0 overflow-x-auto overscroll-contain rounded-[1.2rem] border border-border/60 bg-muted/20"
                onScroll={handleScrollerScroll}
              >
                <div className="relative h-full" style={{ width: contentWidth, height: regimeChartMinHeight }}>
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
                    className="absolute inset-y-0 grid items-stretch px-0"
                    style={{
                      paddingLeft: AXIS_START_PADDING,
                      paddingRight: AXIS_END_PADDING,
                      gridTemplateColumns: `repeat(${Math.max(itemCount, 1)}, ${slotWidth}px)`,
                    }}
                  >
                    {model.workbench.regimePriceLane.intervals.map((interval) => (
                      <button
                        key={`regime:${interval.intervalIndex}`}
                        aria-label={t('analysisWorkbenchRegimeIntervalAria', {
                          regime: translateRegimeLabel(language, interval.dominantRegime),
                          summary: interval.cueSummary,
                        })}
                        className={cn(
                          'flex flex-col items-center justify-center gap-3 rounded-[1rem] border px-2 text-left transition-transform hover:-translate-y-0.5',
                          selectedIntervalIndex === interval.intervalIndex ? 'border-foreground/20 shadow-sm' : 'border-white/70',
                        )}
                        style={{
                          backgroundColor: regimeChartFill(interval.dominantRegime),
                          height: regimeChartMinHeight,
                          width: regimeTileLayout.width,
                          marginLeft: regimeTileLayout.inset,
                          marginRight: regimeTileLayout.inset,
                        }}
                        data-analysis-datalabel="true"
                        type="button"
                        onClick={() => onIntervalChartLabelClick(interval.intervalIndex, 'observed-signals')}
                      >
                        <span className="inline-flex items-center justify-center text-foreground/75">
                          {showsRegimeIcons ? (
                            regimeIcon(interval.dominantRegime)
                          ) : showsRegimeInitials ? (
                            <span className="text-[0.62rem] font-semibold tracking-[0.02em] text-foreground/80">
                              {regimeInitials(interval.dominantRegime)}
                            </span>
                          ) : null}
                        </span>
                        <span className="flex flex-wrap items-center justify-center gap-1 whitespace-nowrap">
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
              subtitle={t('analysisWorkbenchLaneInventorySubtitle')}
              title={t('analysisWorkbenchLaneInventoryTitle')}
              tooltip={t('analysisWorkbenchLaneInventoryTooltip')}
            />
            <div className="grid min-h-0 gap-2 [grid-template-rows:auto_minmax(0,1fr)]">
              <div className="flex items-start justify-between gap-3 px-1">
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block h-2 w-6 rounded-[0.2rem] bg-foreground/12" />
                    {t('analysisWorkbenchInventoryBand')}
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block h-px w-7 bg-foreground" />
                    {t('analysisWorkbenchInventoryMean')}
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <span className="size-2 rounded-full bg-slate-500/70" />
                    {t('analysisWorkbenchServiceDemand')}
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <span className="size-2 rounded-full bg-slate-800/80" />
                    {t('analysisWorkbenchRetailDemand')}
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <span className="size-2 rounded-full bg-emerald-600/80" />
                    {t('analysisWorkbenchReceipts')}
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <span className="size-2 rounded-full bg-amber-600/85" />
                    {t('analysisWorkbenchAdjustments')}
                  </span>
                </div>
                <LaneExpandButton expanded={isLaneExpanded('inventory')} title={t('analysisWorkbenchLaneInventoryTitle')} onClick={() => toggleLaneExpanded('inventory')} />
              </div>
              <div
                ref={inventoryScrollRef}
                className="hidden-scrollbar min-h-0 overflow-x-auto overscroll-contain rounded-[1.2rem] border border-border/60 bg-muted/20 px-0"
                onScroll={handleScrollerScroll}
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
                      {inventoryChart.bandPath ? <path d={inventoryChart.bandPath} fill="currentColor" className="text-foreground/10" /> : null}
                      <polyline
                        fill="none"
                        points={inventoryChart.polyline}
                        stroke="currentColor"
                        strokeWidth={inventoryGeometry.strokeWidth}
                        className="text-foreground"
                        data-analysis-line="inventory"
                      />
                    </svg>
                    {inventoryChart.coordinates.map((point, index) => {
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
                            aria-label={t('analysisWorkbenchInventoryPointAria', {
                              units: Math.round(entry.inventoryMean),
                              interval: entry.intervalIndex + 1,
                            })}
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
                            aria-label={t('analysisWorkbenchFlowCellAria', {
                              service: Math.round(point.serviceDemandMean),
                              retail: Math.round(point.retailDemandMean),
                              receipts: Math.round(point.receiptsMean),
                              adjustments: Math.round(point.adjustmentsMean),
                            })}
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
              subtitle={t('analysisWorkbenchLanePipelineSubtitle')}
              title={t('analysisWorkbenchLanePipelineTitle')}
              tooltip={t('analysisWorkbenchLanePipelineTooltip')}
            />
            <div className="grid min-h-0 gap-2 [grid-template-rows:auto_minmax(0,1fr)]">
              <div className="flex items-start justify-between gap-3 px-1">
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block h-3 w-8 rounded-full border border-emerald-700/25 bg-emerald-600/20" />
                    {t('analysisWorkbenchInTransitWindow')}
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block h-3 w-8 rounded-full border border-rose-300/70 bg-rose-100/75" />
                    {t('analysisWorkbenchOverdueWindow')}
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block size-2 rotate-45 rounded-[0.2rem] bg-sky-600/85" />
                    {t('analysisWorkbenchOrderCue')}
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block size-2 rounded-full bg-emerald-600/85" />
                    {t('analysisWorkbenchReceiptCue')}
                  </span>
                </div>
                <LaneExpandButton expanded={isLaneExpanded('pipeline')} title={t('analysisWorkbenchLanePipelineTitle')} onClick={() => toggleLaneExpanded('pipeline')} />
              </div>
              <div
                ref={pipelineScrollRef}
                className="hidden-scrollbar min-h-0 overflow-x-auto overscroll-contain rounded-[1.2rem] border border-border/60 bg-muted/20"
                onScroll={handleScrollerScroll}
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
                    {selectedPipelineLabelX != null && selectedPipelineLabelY != null && selectedPipeline.labels.length > 0 ? (
                      <ClampedChartDataLabel
                        anchorX={selectedPipelineLabelX}
                        anchorY={selectedPipelineLabelY}
                        containerWidth={contentWidth}
                        containerHeight={pipelineChartContentHeight}
                        gap={8}
                        className="flex flex-col items-center gap-1"
                      >
                        {selectedPipeline.labels.map((label, index) => (
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
                          aria-label={t('analysisWorkbenchPipelineSpanAria', {
                            inTransit: Math.round(span.inTransitMean),
                            ordered: Math.round(span.orderQuantityMean),
                            receipt: Math.round(span.receiptQuantityMean),
                          })}
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
                          <span className="truncate">
                            {t('analysisWorkbenchPipelinePillLabel', {
                              count: Math.round(span.inTransitMean),
                            })}
                          </span>
                        </button>
                      );
                    })}
                    {model.workbench.pipelineLane.markers.map((marker) => {
                      const x = deriveSlotCenterX({ index: marker.intervalPosition, slotWidth, axisStartPadding: AXIS_START_PADDING });
                      const top = pipelineTopPadding + marker.row * pipelineRowHeight + (marker.kind === 'receipt' ? 2 : -pipelineMarkerHalf - 1);
                      return (
                        <button
                          key={marker.key}
                          aria-label={t('analysisWorkbenchPipelineMarkerAria', {
                            kind: marker.kind === 'order' ? t('analysisWorkbenchOrderCueKind') : t('analysisWorkbenchReceiptCueKind'),
                            quantity: Math.round(marker.quantityMean),
                          })}
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
              subtitle={t('analysisWorkbenchLaneLeadTimeSubtitle')}
              title={t('analysisWorkbenchLaneLeadTimeTitle')}
              tooltip={t('analysisWorkbenchLaneLeadTimeTooltip')}
            />
            <div className="grid min-h-0 gap-2 [grid-template-rows:auto_minmax(0,1fr)]">
              <div className="flex items-start justify-between gap-3 px-1">
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block h-2 w-6 rounded-[0.2rem] bg-sky-600/14" />
                    {t('analysisWorkbenchSpreadBand')}
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block h-px w-7 bg-sky-700/80" />
                    {t('analysisWorkbenchMeanLeadTime')}
                  </span>
                </div>
                <LaneExpandButton expanded={isLaneExpanded('lead-time')} title={t('analysisWorkbenchLaneLeadTimeTitle')} onClick={() => toggleLaneExpanded('lead-time')} />
              </div>
              <div
                ref={leadTimeScrollRef}
                className="hidden-scrollbar min-h-0 overflow-x-auto overscroll-contain rounded-[1.2rem] border border-border/60 bg-muted/20"
                onScroll={handleScrollerScroll}
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
                      {leadTimeChart.bandPath ? <path d={leadTimeChart.bandPath} fill="currentColor" className="text-sky-600/14" /> : null}
                      <polyline
                        fill="none"
                        points={leadTimeChart.polyline}
                        stroke="currentColor"
                        strokeWidth={leadTimeGeometry.strokeWidth}
                        className="text-sky-700/80"
                        data-analysis-line="lead-time"
                      />
                    </svg>
                    {leadTimeChart.coordinates.map((point, index) => {
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
                              {t('analysisWorkbenchLeadTimeSelectedLabel', {
                                mean: entry.meanDays.toFixed(1),
                                spread: spreadDays.toFixed(1),
                              })}
                            </ClampedChartDataLabel>
                          ) : null}
                          <button
                            aria-label={t('analysisWorkbenchLeadTimePointAria', {
                              days: entry.meanDays.toFixed(1),
                            })}
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
  const { t } = usePreferences();
  if (row.affectedEntityLabels.length === 0) {
    return <span className="text-sm text-muted-foreground">{t('analysisWorkbenchNoNamedEntity')}</span>;
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
  const { language, t } = usePreferences();
  return (
    <HeaderedTable>
      <div className={pressureTableLayout.containerClassName} style={pressureTableLayout.style}>
        <HeaderedTableHeader className={pressureTableLayout.headerClassName}>
          <HeaderedTableHeaderCell>
            <HeaderTooltipLabel tooltip={t('performanceRouteItemHeaderTooltip')}>
              {t('performanceRouteItemHeader')}
            </HeaderTooltipLabel>
          </HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell align="center">
            <HeaderTooltipLabel tooltip={t('analysisWorkbenchPressureScoreHeaderTooltip')}>
              {t('analysisWorkbenchPressureScoreHeader')}
            </HeaderTooltipLabel>
          </HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell align="center">
            <HeaderTooltipLabel tooltip={t('analysisWorkbenchPipelineRiskHeaderTooltip')}>
              {t('analysisWorkbenchPipelineRiskHeader')}
            </HeaderTooltipLabel>
          </HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell align="center">
            <HeaderTooltipLabel tooltip={t('analysisWorkbenchLeadTimeRiskHeaderTooltip')}>
              {t('analysisWorkbenchLeadTimeRiskHeader')}
            </HeaderTooltipLabel>
          </HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell align="center">
            <HeaderTooltipLabel tooltip={t('analysisWorkbenchPriceSensitivityHeaderTooltip')}>
              {t('analysisWorkbenchPriceSensitivityHeader')}
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
                <ItemIdentityBlock
                  align="center"
                  description={row.summary}
                  imagePath={row.imagePath}
                  name={
                    <span className="truncate font-semibold text-foreground transition-colors group-hover:text-primary">
                      {row.name}
                    </span>
                  }
                  size="compact"
                  type={row.entityType}
                />
              </div>
              <div className="flex items-center justify-center" data-pressure-cell="true">
                <HeaderedTableMobileLabel className={pressureTableLayout.mobileLabelClassName}>{t('analysisWorkbenchPressureScoreHeader')}</HeaderedTableMobileLabel>
                <div className="flex items-center gap-2">
                  <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-sm', statusPillClassName(row.tone))}>
                    {row.pressureScoreLabel}
                  </span>
                  <span className="text-sm text-muted-foreground">/ 100</span>
                </div>
              </div>
              <div className="flex items-center justify-center" data-pressure-cell="true">
                <HeaderedTableMobileLabel className={pressureTableLayout.mobileLabelClassName}>{t('analysisWorkbenchPipelineRiskHeader')}</HeaderedTableMobileLabel>
                <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-sm capitalize', statusPillClassName(scoreCellTone(row.pipelineRiskLevel)))}>
                  {row.pipelineRiskLabel}
                </span>
              </div>
              <div className="flex items-center justify-center" data-pressure-cell="true">
                <HeaderedTableMobileLabel className={pressureTableLayout.mobileLabelClassName}>{t('analysisWorkbenchLeadTimeRiskHeader')}</HeaderedTableMobileLabel>
                <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-sm capitalize', statusPillClassName(scoreCellTone(row.leadTimeRiskLevel)))}>
                  {row.leadTimeRiskLabel}
                </span>
              </div>
              <div className="flex items-center justify-center" data-pressure-cell="true">
                <HeaderedTableMobileLabel className={pressureTableLayout.mobileLabelClassName}>{t('analysisWorkbenchPriceSensitivityHeader')}</HeaderedTableMobileLabel>
                <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-sm capitalize', statusPillClassName(scoreCellTone(row.priceSensitivityLevel)))}>
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
  const { t } = usePreferences();
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
            <HeaderTooltipLabel tooltip={t('analysisWorkbenchObservedHeaderTooltip')}>
              {t('analysisWorkbenchObservedHeader')}
            </HeaderTooltipLabel>
          </HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell className="justify-self-start">
            <HeaderTooltipLabel tooltip={t('analysisWorkbenchObservationChannelsHeaderTooltip')}>
              {t('analysisWorkbenchObservationChannelsHeader')}
            </HeaderTooltipLabel>
          </HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell className="justify-self-start">
            <HeaderTooltipLabel tooltip={t('analysisWorkbenchAffectedEntitiesHeaderTooltip')}>
              {t('analysisWorkbenchAffectedEntitiesHeader')}
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
                      <p className="mt-1">{row.intervalLabel}</p>
                      <p className="mt-2">{row.detail}</p>
                    </>
                  }
                  primaryClassName="font-semibold"
                  secondaryClassName="text-sm leading-6 text-muted-foreground"
                />
              </div>
              <div className="min-w-0" data-observation-cell="true">
                <HeaderedTableMobileLabel>{t('analysisWorkbenchChannelsRailTitle')}</HeaderedTableMobileLabel>
                <ObservationChannels row={row} />
              </div>
              <div className="min-w-0" data-observation-cell="true">
                <HeaderedTableMobileLabel>{t('analysisWorkbenchAffectedEntitiesHeader')}</HeaderedTableMobileLabel>
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
  const { t } = usePreferences();
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
        imagePath: column.imagePath,
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
      title={t('analysisWorkbenchFragilityTitle')}
      tooltip={t('analysisWorkbenchFragilityTooltip')}
      descriptor={t('analysisWorkbenchFragilityDescriptor')}
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
                  <ItemIdentityBlock
                    align="center"
                    imagePath={service.imagePath}
                    name={<span>{service.name}</span>}
                    size="compact"
                    type="service"
                  />
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
              className="flex items-center gap-2 rounded-[1rem] border border-border/60 bg-white px-3 py-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted/30"
              style={{ gridColumnStart: serviceIndex + 2, gridRowStart: 1 }}
              type="button"
              onClick={() => setSelection({ type: 'entity', entityId: service.entityId, entityType: service.entityType })}
            >
              <ItemIdentityBlock
                align="center"
                imagePath={service.imagePath}
                name={<span>{service.name}</span>}
                size="compact"
                type="service"
              />
            </button>
          ))}

          {transposedRows.map((row, rowIndex) => (
            <Fragment key={row.key}>
              <div className="flex items-center rounded-[1rem] border border-border/60 bg-white px-3 py-3" style={{ gridColumnStart: 1, gridRowStart: rowIndex + 2 }}>
                <ItemIdentityBlock
                  align="center"
                  className="max-w-full min-w-0"
                  imagePath={row.imagePath}
                  name={<span className="min-w-0 break-words">{row.name}</span>}
                  size="compact"
                  type="sku"
                />
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
                    <p className="mt-1 text-xs text-muted-foreground">{t('analysisWorkbenchUsageLabel')}: {cell?.usageLabel ?? '—'}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{t('analysisWorkbenchBottleneckLabel')}: {cell?.bottleneckLabel ?? '—'}</p>
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
  const { t } = usePreferences();
  return (
    <>
      <AnalysisRailSection icon={<EntityEvidenceIcon className="size-4" />} title={t('analysisWorkbenchObservationRailTitle')} tooltip={t('analysisWorkbenchObservationRailTooltip')}>
        <p className="text-2xl font-semibold tracking-[-0.03em] text-foreground">{row.title}</p>
        <p className="text-sm text-muted-foreground">{row.observedAt}</p>
        <p className="text-sm leading-6 text-muted-foreground">{row.detail}</p>
      </AnalysisRailSection>

      <AnalysisRailSection icon={<EntitySignalIcon className="size-4" />} title={t('analysisWorkbenchChannelsRailTitle')} tooltip={t('analysisWorkbenchChannelsRailTooltip')}>
        <ObservationChannels row={row} />
      </AnalysisRailSection>

      <AnalysisRailSection icon={<NavigationHierarchyIcon className="size-4" />} title={t('analysisWorkbenchAffectedEntitiesHeader')} tooltip={t('analysisWorkbenchAffectedEntitiesRailTooltip')}>
        <AnalysisRailList>
          {row.affectedEntityLabels.length > 0 ? row.affectedEntityLabels.map((label) => (
            <AnalysisRailRow key={`${row.id}:${label}`} primary={<span className="text-muted-foreground">{label}</span>} />
          )) : <AnalysisRailRow primary={<span className="text-muted-foreground">{t('analysisWorkbenchNoNamedEntityInObservation')}</span>} />}
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
  const { language, t } = usePreferences();
  return (
    <>
      <AnalysisRailSection icon={<StatusGaugeIcon className="size-4" />} title={t('analysisWorkbenchIntervalExplanationTitle')} tooltip={t('analysisWorkbenchIntervalExplanationTooltip')}>
        <p className="text-2xl font-semibold tracking-[-0.03em] text-foreground">{interval.dateLabel}</p>
        <div className="grid gap-1 text-sm text-muted-foreground">
          <p>{t('analysisWorkbenchSalesPatternLine', { value: translateRegimeLabel(language, interval.dominantRegime) })}</p>
          <p>{interval.dominantDriver}</p>
          <p>{interval.priceOrStockoutSummary}</p>
        </div>
      </AnalysisRailSection>

      <AnalysisRailSection
        flash={flashedSection === 'observed-signals'}
        icon={<EntitySignalIcon className="size-4" />}
        title={t('analysisWorkbenchObservedSignalsTitle')}
        tooltip={t('analysisWorkbenchObservedSignalsTooltip')}
      >
        <SignalsWrap values={interval.observedSignals} />
        <AnalysisRailList className="mt-3">
          {interval.affectedEntities.length > 0 ? interval.affectedEntities.map((label) => (
            <AnalysisRailRow key={`${interval.key}:${label}`} primary={<span className="text-muted-foreground">{label}</span>} />
          )) : <AnalysisRailRow primary={<span className="text-muted-foreground">{t('analysisWorkbenchNoNamedEntityInInterval')}</span>} />}
        </AnalysisRailList>
      </AnalysisRailSection>

      <AnalysisRailSection
        flash={flashedSection === 'what-happened'}
        icon={<StatusWaveformIcon className="size-4" />}
        title={t('analysisWorkbenchWhatHappenedTitle')}
        tooltip={t('analysisWorkbenchWhatHappenedTooltip')}
      >
        <AnalysisRailList>
          <AnalysisRailRow primary={<span className="text-muted-foreground">{t('analysisWorkbenchServiceDemand')}</span>} secondary={interval.serviceDemandLabel} />
          <AnalysisRailRow primary={<span className="text-muted-foreground">{t('analysisWorkbenchRetailDemand')}</span>} secondary={interval.retailDemandLabel} />
          <AnalysisRailRow primary={<span className="text-muted-foreground">{t('analysisWorkbenchReceipts')}</span>} secondary={interval.receiptsLabel} />
          <AnalysisRailRow primary={<span className="text-muted-foreground">{t('analysisWorkbenchAdjustments')}</span>} secondary={interval.adjustmentsLabel} />
        </AnalysisRailList>
      </AnalysisRailSection>

      <AnalysisRailSection
        flash={flashedSection === 'orders-transit-lead-time'}
        icon={<EntityWaypointsIcon className="size-4" />}
        title={t('analysisWorkbenchOrdersTransitLeadTimeTitle')}
        tooltip={t('analysisWorkbenchOrdersTransitLeadTimeTooltip')}
      >
        <AnalysisRailList>
          <AnalysisRailRow primary={<span className="text-muted-foreground">{t('analysisWorkbenchInTransit')}</span>} secondary={interval.inTransitLabel} />
          <AnalysisRailRow primary={<span className="text-muted-foreground">{t('analysisWorkbenchOrderProbability')}</span>} secondary={interval.orderProbabilityLabel} />
          <AnalysisRailRow primary={<span className="text-muted-foreground">{t('analysisWorkbenchOrderQuantity')}</span>} secondary={interval.orderQuantityLabel} />
          <AnalysisRailRow primary={<span className="text-muted-foreground">{t('analysisWorkbenchReceiptQuantity')}</span>} secondary={interval.receiptQuantityLabel} />
          <AnalysisRailRow primary={<span className="text-muted-foreground">{t('analysisWorkbenchTransitAge')}</span>} secondary={interval.ageDaysLabel} />
          <AnalysisRailRow primary={<span className="text-muted-foreground">{t('analysisWorkbenchMeanLeadTime')}</span>} secondary={interval.leadTimeMeanLabel} />
          <AnalysisRailRow primary={<span className="text-muted-foreground">{t('analysisWorkbenchLeadTimeSpread')}</span>} secondary={interval.leadTimeSpreadLabel} />
          <AnalysisRailRow primary={<span className="text-muted-foreground">{t('analysisWorkbenchLeadTimeClass')}</span>} secondary={interval.leadTimeVariabilityLabel} />
        </AnalysisRailList>
      </AnalysisRailSection>
    </>
  );
}

function EntityRail({ row }: { row: AnalysisEntityPressureRow }) {
  const { language, t } = usePreferences();
  return (
    <>
      <AnalysisRailSection
        icon={row.entityType === 'sku' ? <EntityPackageSearchIcon className="size-4" /> : <EntityServiceIcon className="size-4" />}
        title={row.entityType === 'sku' ? t('analysisWorkbenchSelectedSkuTitle') : t('analysisWorkbenchSelectedServiceTitle')}
        tooltip={t('analysisWorkbenchSelectedEntityTooltip')}
      >
        <p className="text-2xl font-semibold tracking-[-0.03em] text-foreground">{row.name}</p>
        <div className="grid gap-1 text-sm text-muted-foreground">
          <p>{translateUiLiteral(language, '{value} pressure score', { value: row.pressureScoreLabel })}</p>
          <p>{row.driverLabel}</p>
          <p>{row.summary}</p>
        </div>
        <Button asChild className="mt-4 w-full">
          <Link to={row.href}>
            <ActionOpenExternalIcon className="size-4" />
            {t('analysisWorkbenchOpenDetail')}
          </Link>
        </Button>
      </AnalysisRailSection>

      <AnalysisRailSection icon={<StatusGaugeIcon className="size-4" />} title={t('analysisWorkbenchPosteriorStateTitle')} tooltip={t('analysisWorkbenchPosteriorStateTooltip')}>
        <AnalysisRailList>
          <AnalysisRailRow primary={<span className="text-muted-foreground">{t('analysisWorkbenchPosteriorUnits')}</span>} secondary={row.posteriorUnitsLabel} />
          <AnalysisRailRow primary={<span className="text-muted-foreground">{t('analysisWorkbenchDemandPerDay')}</span>} secondary={row.demandPerDayLabel} />
          <AnalysisRailRow primary={<span className="text-muted-foreground">{t('analysisWorkbenchReorderTrigger')}</span>} secondary={row.reorderTriggerLabel} />
          <AnalysisRailRow primary={<span className="text-muted-foreground">{t('analysisWorkbenchInTransit')}</span>} secondary={row.inTransitExposureLabel} />
          <AnalysisRailRow primary={<span className="text-muted-foreground">{t('analysisWorkbenchMeanLeadTime')}</span>} secondary={row.leadTimeMeanLabel} />
          <AnalysisRailRow primary={<span className="text-muted-foreground">{t('analysisWorkbenchLeadTimeSpread')}</span>} secondary={row.leadTimeSpreadLabel} />
        </AnalysisRailList>
      </AnalysisRailSection>

      {row.entityType === 'sku' && row.reorderPolicyLabels ? (
        <AnalysisRailSection icon={<StatusGaugeIcon className="size-4" />} title={t('analysisWorkbenchReorderPolicyTitle')} tooltip={t('analysisWorkbenchReorderPolicyTooltip')}>
          <AnalysisRailList>
            <AnalysisRailRow primary={<span className="text-muted-foreground">{t('analysisWorkbenchNeedProbability')}</span>} secondary={row.reorderPolicyLabels.needProbability} />
            <AnalysisRailRow primary={<span className="text-muted-foreground">{t('analysisWorkbenchRecommendedOrder')}</span>} secondary={row.reorderPolicyLabels.recommendedOrder} />
            <AnalysisRailRow primary={<span className="text-muted-foreground">{t('analysisWorkbenchLikelyRange')}</span>} secondary={row.reorderPolicyLabels.likelyRange} />
            <AnalysisRailRow primary={<span className="text-muted-foreground">{t('analysisWorkbenchProtectionHorizon')}</span>} secondary={row.reorderPolicyLabels.protectionHorizon} />
            <AnalysisRailRow primary={<span className="text-muted-foreground">{t('analysisWorkbenchPolicyBasis')}</span>} secondary={row.reorderPolicyLabels.policyBasis} />
          </AnalysisRailList>
        </AnalysisRailSection>
      ) : null}

      <AnalysisRailSection icon={<NavigationHierarchyIcon className="size-4" />} title={t('analysisWorkbenchContributorStackTitle')} tooltip={t('analysisWorkbenchContributorStackTooltip')}>
        <AnalysisRailList>
          {row.contributorStack.length > 0 ? row.contributorStack.map((entry) => (
            <AnalysisRailRow key={`${row.id}:${entry}`} primary={<span className="text-muted-foreground">{entry}</span>} />
          )) : <AnalysisRailRow primary={<span className="text-muted-foreground">{t('analysisWorkbenchNoContributorStack')}</span>} />}
        </AnalysisRailList>
      </AnalysisRailSection>
    </>
  );
}

function OverviewRail({ model }: { model: AnalysisWorkbenchViewModel }) {
  const { language, t } = usePreferences();
  return (
    <>
      <AnalysisRailSection icon={<StatusRadarIcon className="size-4" />} title={t('analysisWorkbenchOverviewTitle')} tooltip={t('analysisWorkbenchOverviewTooltip')}>
        <p className="text-2xl font-semibold tracking-[-0.03em] text-foreground">
          {translateRegimeLabel(language, model.inspectorOverview.dominantRegime)}
        </p>
        <div className="grid gap-1 text-sm text-muted-foreground">
          <p>{t('analysisWorkbenchChangePointProbability', { value: model.inspectorOverview.changePointProbability })}</p>
          <p>{model.inspectorOverview.coverageSummary}</p>
        </div>
      </AnalysisRailSection>

      <AnalysisRailSection icon={<StatusTrendChartIcon className="size-4" />} title={t('analysisWorkbenchStrongestChannelsTitle')} tooltip={t('analysisWorkbenchStrongestChannelsTooltip')}>
        <AnalysisRailList>
          {model.inspectorOverview.strongestChannels.map((entry, index) => (
            <AnalysisRailRow
              key={`${entry}:${index}`}
              primary={<span className="text-muted-foreground">{translateObservationEvidenceLabel(language, entry)}</span>}
            />
          ))}
        </AnalysisRailList>
      </AnalysisRailSection>

      <AnalysisRailSection icon={<NavigationCatalogIcon className="size-4" />} title={t('analysisWorkbenchAffectedEntitiesHeader')} tooltip={t('analysisWorkbenchAffectedEntitiesHeaderTooltip')}>
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
  chartLayoutPreferences,
  customTimeframeRange = null,
  expanded = false,
  hasOlderIntervals,
  isHydratingDetails = false,
  isVisuallyBusy,
  isLoadingOlderIntervals,
  loadOlderIntervals,
  model,
  onChartLayoutPreferencesChange,
  onCustomTimeframeChange,
  onOlderLoadProgressChange,
  onResetCharts,
  onTimeframeChange,
  onToggleExpand,
  selectedIntervalIndex,
  setSelection,
  timeframe,
}: {
  chartZoomResetToken?: number;
  chartLayoutPreferences?: PersistedChartLayoutPreferences;
  customTimeframeRange?: ChartCustomTimeframeRange | null;
  expanded?: boolean;
  hasOlderIntervals: boolean;
  isHydratingDetails?: boolean;
  isVisuallyBusy?: boolean;
  isLoadingOlderIntervals: boolean;
  loadOlderIntervals: (limit?: number) => Promise<number>;
  model: AnalysisWorkbenchViewModel;
  onChartLayoutPreferencesChange?: (next: Partial<PersistedChartLayoutPreferences>, options?: ChartLayoutPreferenceMergeOptions) => void;
  onCustomTimeframeChange?: (value: ChartCustomTimeframeRange | null) => void;
  onOlderLoadProgressChange?: (progress: { current: number; total: number } | null) => void;
  onResetCharts?: () => Promise<void> | void;
  onTimeframeChange: (value: AnalysisTimeframe) => void;
  onToggleExpand?: () => void;
  selectedIntervalIndex: number | null;
  setSelection: (value: AnalysisSelection) => void;
  timeframe: AnalysisTimeframe;
}) {
  return (
    <div className={cn('grid w-full min-w-0 gap-6', expanded && 'h-full min-h-0')}>
      <AnalysisTradingChartLedger
        chartZoomResetToken={chartZoomResetToken}
        chartLayoutPreferences={chartLayoutPreferences}
        customTimeframeRange={customTimeframeRange}
        expanded={expanded}
        hasOlderIntervals={hasOlderIntervals}
        isBusy={isHydratingDetails || isLoadingOlderIntervals}
        isVisuallyBusy={isVisuallyBusy}
        isLoadingOlderIntervals={isLoadingOlderIntervals}
        loadOlderIntervals={loadOlderIntervals}
        model={model}
        onChartLayoutPreferencesChange={onChartLayoutPreferencesChange}
        onCustomTimeframeChange={onCustomTimeframeChange}
        onOlderLoadProgressChange={onOlderLoadProgressChange}
        onResetCharts={onResetCharts}
        onTimeframeChange={onTimeframeChange}
        onToggleExpand={onToggleExpand}
        selectedIntervalIndex={selectedIntervalIndex}
        setSelection={setSelection}
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
  const { t } = usePreferences();
  return (
    <div className="grid gap-6">
      <PerformanceSectionShell
        title={t('analysisWorkbenchPressureTitle')}
        tooltip={t('analysisWorkbenchPressureTooltip')}
        descriptor={t('analysisWorkbenchPressureDescriptor')}
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
  const { t } = usePreferences();
  return (
    <div className="grid gap-6">
      <PerformanceSectionShell
        title={t('analysisWorkbenchObservationsTitle')}
        tooltip={t('analysisWorkbenchObservationsTooltip')}
        descriptor={t('analysisWorkbenchObservationsDescriptor')}
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
  const { t } = usePreferences();
  const analysisSettingsFields = [
    { key: 'run-id', label: t('analysisWorkbenchSettingsRunIdLabel'), tooltip: t('analysisWorkbenchSettingsRunIdTooltip'), valueKey: 'runId' },
    { key: 'latest-observed', label: t('analysisWorkbenchSettingsLatestObservedLabel'), tooltip: t('analysisWorkbenchSettingsLatestObservedTooltip'), valueKey: 'latestObservedAt' },
    { key: 'observations-used', label: t('analysisWorkbenchSettingsObservationsUsedLabel'), tooltip: t('analysisWorkbenchSettingsObservationsUsedTooltip'), valueKey: 'observationsUsed' },
    { key: 'intervals-in-view', label: t('analysisWorkbenchSettingsIntervalsLabel'), tooltip: t('analysisWorkbenchSettingsIntervalsTooltip'), valueKey: 'intervalCount' },
    { key: 'smoothing', label: t('analysisWorkbenchSettingsSmoothingLabel'), tooltip: t('analysisWorkbenchSettingsSmoothingTooltip'), valueKey: 'smoothingLabel' },
    { key: 'effective-sample-size', label: t('analysisWorkbenchSettingsSampleSizeLabel'), tooltip: t('analysisWorkbenchSettingsSampleSizeTooltip'), valueKey: 'effectiveSampleSize' },
    { key: 'predictive-error', label: t('analysisWorkbenchSettingsPredictiveErrorLabel'), tooltip: t('analysisWorkbenchSettingsPredictiveErrorTooltip'), valueKey: 'predictiveError' },
    { key: 'coverage-estimate', label: t('analysisWorkbenchSettingsCoverageLabel'), tooltip: t('analysisWorkbenchSettingsCoverageTooltip'), valueKey: 'coverageEstimate' },
    { key: 'scope', label: t('analysisWorkbenchSettingsScopeLabel'), tooltip: t('analysisWorkbenchSettingsScopeTooltip'), valueKey: 'scopeSummary' },
  ] as const;
  return (
    <div className="grid gap-6">
      <PerformanceSectionShell
        title={t('analysisWorkbenchSettingsTitle')}
        tooltip={t('analysisWorkbenchSettingsTooltip')}
        descriptor={t('analysisWorkbenchSettingsDescriptor')}
        className={showRightRailCards ? 'lg:rounded-r-none' : undefined}
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {analysisSettingsFields.map((field) => {
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
  chartLayoutPreferences,
  customTimeframeRange = null,
  expanded = false,
  hasOlderIntervals,
  isHydratingDetails = false,
  isVisuallyBusy,
  isLoadingOlderIntervals,
  loadOlderIntervals,
  model,
  onChartLayoutPreferencesChange,
  onCustomTimeframeChange,
  onOlderLoadProgressChange,
  onResetCharts,
  onToggleExpand,
  section,
  setSection,
  setTimeframe = () => {},
  showRightRailCards,
  timeframe = 'Recent',
}: {
  chartZoomResetToken?: number;
  chartLayoutPreferences?: PersistedChartLayoutPreferences;
  customTimeframeRange?: ChartCustomTimeframeRange | null;
  expanded?: boolean;
  hasOlderIntervals: boolean;
  isHydratingDetails?: boolean;
  isVisuallyBusy?: boolean;
  isLoadingOlderIntervals: boolean;
  loadOlderIntervals: (limit?: number) => Promise<number>;
  model: AnalysisWorkbenchViewModel;
  onChartLayoutPreferencesChange?: (next: Partial<PersistedChartLayoutPreferences>, options?: ChartLayoutPreferenceMergeOptions) => void;
  onCustomTimeframeChange?: (value: ChartCustomTimeframeRange | null) => void;
  onOlderLoadProgressChange?: (progress: { current: number; total: number } | null) => void;
  onResetCharts?: () => Promise<void> | void;
  onToggleExpand?: () => void;
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
    if (eventTargetsChartDialog(target)) {
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
              chartLayoutPreferences={chartLayoutPreferences}
              customTimeframeRange={customTimeframeRange}
              expanded={expanded}
              hasOlderIntervals={hasOlderIntervals}
              isHydratingDetails={isHydratingDetails}
              isVisuallyBusy={isVisuallyBusy}
              isLoadingOlderIntervals={isLoadingOlderIntervals}
              loadOlderIntervals={loadOlderIntervals}
              model={model}
              onChartLayoutPreferencesChange={onChartLayoutPreferencesChange}
              onCustomTimeframeChange={onCustomTimeframeChange}
              onOlderLoadProgressChange={onOlderLoadProgressChange}
              onResetCharts={onResetCharts}
              onTimeframeChange={setTimeframe}
              onToggleExpand={onToggleExpand}
              selectedIntervalIndex={selectedIntervalIndex}
              setSelection={handleSelection}
              timeframe={timeframe}
            />
    );
  }, [activeSection, chartLayoutPreferences, chartZoomResetToken, customTimeframeRange, expanded, handleSelection, isHydratingDetails, isSectionPending, isVisuallyBusy, model, onChartLayoutPreferencesChange, onCustomTimeframeChange, onOlderLoadProgressChange, onResetCharts, onToggleExpand, railEnabled, section, selectedEntityId, selectedIntervalIndex, setTimeframe, timeframe, hasOlderIntervals, isLoadingOlderIntervals, loadOlderIntervals]);

  return (
    <div className={cn('grid gap-6', expanded && 'h-full min-h-0')} onPointerDown={handleWorkbenchPointerDown}>
      <DiagnosticStrip model={model} />
      <ChromeTabs
        className={cn('relative gap-0', expanded && 'flex min-h-0 flex-1 flex-col')}
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
          className={cn(ANALYSIS_BOARD_CLASS_NAME, expanded && 'flex min-h-0 flex-1 flex-col')}
          style={{
            marginTop: 'calc(var(--chrome-tabs-surface-overlap) * -2.75)',
          }}
        >
          <div className={cn(railEnabled ? 'grid gap-0 lg:grid-cols-[minmax(0,1fr)_320px]' : 'grid gap-0', expanded && 'min-h-0 flex-1')}>
            <div className={cn('min-w-0 border-b border-border/60 lg:border-b-0', expanded && 'flex min-h-0 flex-col', railEnabled && 'lg:border-r lg:rounded-r-none')}>
              <div className={cn('grid min-h-full min-w-0 gap-6 px-0 py-0', expanded && 'flex min-h-0 flex-1 flex-col')}>{surface}</div>
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
