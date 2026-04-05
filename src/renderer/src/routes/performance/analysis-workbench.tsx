import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode, type UIEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  AudioLines,
  CircleGauge,
  Cog,
  FileSearch,
  ListTree,
  Map,
  PackageSearch,
  Package,
  Radio,
  Rows3,
  SearchCheck,
  Store,
  Waypoints,
} from 'lucide-react';
import {
  AXIS_END_PADDING,
  AXIS_START_PADDING,
  clampScrollLeft,
  DEFAULT_SLOT_WIDTH,
  deriveAxisContentWidth,
  deriveSlotCenterX,
  deriveViewportPageScrollLeft,
  IntervalStrip,
  SCROLL_EDGE_TOLERANCE,
} from '@/components/system/interval-strip';
import {
  buildPointCoordinatesWithDomain,
  buildPolylineWithDomain,
  buildTrajectoryBandPath,
  deriveLabelGutterOffset,
  SelectedIntervalColumnOverlay,
} from '@/components/system/timeline-chart';
import { RIGHT_RAIL_ASIDE_CLASS_NAME } from '@/components/system/right-rail-layout';
import {
  createHeaderedTableLayout,
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
import { PerformanceSectionShell, PERFORMANCE_HEADER_SURFACE_CLASS_NAME } from './chrome';
import type {
  AnalysisEntityPressureRow,
  AnalysisObservationLedgerRow,
  AnalysisSection,
  AnalysisSelection,
  AnalysisWorkbenchViewModel,
} from './analysis-view-model';

const pressureTableLayout = createHeaderedTableLayout({
  breakpoint: 'xl',
  columns: 'minmax(15rem,1.2fr) minmax(7rem,0.7fr) minmax(8rem,0.7fr) minmax(8rem,0.72fr) minmax(8rem,0.72fr) minmax(8rem,0.72fr) minmax(7rem,0.65fr)',
  gap: 4,
});

const evidenceTableLayout = createHeaderedTableLayout({
  breakpoint: 'xl',
  columns: 'minmax(13rem,1fr) minmax(20rem,1.8fr) minmax(13rem,0.9fr)',
  gap: 4,
});

const fullEvidenceTableLayout = createHeaderedTableLayout({
  breakpoint: 'xl',
  columns:
    'minmax(12rem,0.95fr) minmax(5rem,0.45fr) minmax(5rem,0.45fr) minmax(5rem,0.45fr) minmax(5rem,0.45fr) minmax(5rem,0.45fr) minmax(5rem,0.45fr) minmax(5rem,0.45fr) minmax(5rem,0.45fr) minmax(5rem,0.45fr) minmax(4rem,0.4fr)',
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
  { value: 'fragility', label: 'Fragility', leading: <Map className="size-4" /> },
  { value: 'evidence', label: 'Evidence', leading: <SearchCheck className="size-4" /> },
  { value: 'settings', label: 'Settings', leading: <Cog className="size-4" /> },
];

const ANALYSIS_BOARD_CLASS_NAME = `${cardFrameClassName} ${cardSurfaceClassName} relative z-[1] overflow-hidden rounded-[2rem]`;
const ANALYSIS_RAIL_PANEL_CLASS_NAME = 'flex h-full flex-col bg-secondary/15 lg:rounded-l-none';

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

const LANE_LABEL_COLUMN = '14rem';
const CHART_GUTTER_HEIGHT = 24;
const CHART_VIEWBOX_HEIGHT = 42;
const INVENTORY_LANE_HEIGHT = 168;
const LEAD_TIME_LANE_HEIGHT = 132;
const PIPELINE_LANE_HEIGHT = 122;

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
    <div className="sticky left-0 z-[1] flex min-h-[8.75rem] flex-col justify-between rounded-[1.2rem] border border-border/60 bg-white/95 px-4 py-3 backdrop-blur">
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
}: {
  title: string;
  tooltip: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={analysisRailBlockClassName()}>
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
    <div className={`relative flex overflow-hidden px-5 sm:px-6 ${showRightRailCards ? 'lg:pr-[calc(320px+1.5rem)]' : ''}`}>
      <ChromeTabsList aria-label="Select analysis surface" className="min-w-0" collapseBehavior="progressive">
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
  model,
  selectedIntervalIndex,
  setSelection,
  showRightRailCards,
}: {
  model: AnalysisWorkbenchViewModel;
  selectedIntervalIndex: number | null;
  setSelection: (value: AnalysisSelection) => void;
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
    ? Math.max(DEFAULT_SLOT_WIDTH, (viewportWidth - AXIS_START_PADDING - AXIS_END_PADDING) / itemCount)
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
    setScrollLeft(event.currentTarget.scrollLeft);
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
      <div className="grid gap-4 px-6 py-5">
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
            onSelect={(intervalIndex) => setSelection({ type: 'interval', intervalIndex })}
          />
        </div>

        <div className="grid gap-4">
          <div className="grid gap-3" style={laneGridStyle}>
            <LaneLabel
              subtitle="Continuous regime state with price and stockout cues carried as lightweight markers instead of interval cards."
              title="Regime + price lane"
              tooltip="The current system regime plus interval-level price and stockout evidence."
            />
            <div className="grid gap-2">
              <div className="flex flex-wrap gap-3 px-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <span className="size-2 rounded-full bg-amber-500/80" />
                  Price cues
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="size-2 rounded-full bg-rose-500/80" />
                  Stockout cues
                </span>
              </div>
              <div ref={regimeScrollRef} className="hidden-scrollbar overflow-x-auto overscroll-contain rounded-[1.2rem] border border-border/60 bg-muted/20" onScroll={handleSharedScroll}>
                <div className="relative" style={{ width: contentWidth, height: 92 }}>
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
                        type="button"
                        onClick={() => setSelection({ type: 'interval', intervalIndex: interval.intervalIndex })}
                      >
                        <span className="absolute left-2.5 top-2 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-foreground/70">
                          {interval.dominantRegime}
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

          <div className="grid gap-3" style={laneGridStyle}>
            <LaneLabel
              subtitle="Inventory trajectory stays continuous while service demand, retail demand, receipts, and adjustments remain interval-native."
              title="Inventory + demand lane"
              tooltip="The demand decomposition that turns sparse observations into a reconstructed stock story."
            />
            <div className="grid gap-2">
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
              <div ref={inventoryScrollRef} className="hidden-scrollbar overflow-x-auto overscroll-contain rounded-[1.2rem] border border-border/60 bg-muted/20 px-0" onScroll={handleSharedScroll}>
                <div className="relative" style={{ width: contentWidth, height: INVENTORY_LANE_HEIGHT }}>
                  <SelectedIntervalColumnOverlay
                    activeIndex={selectedIntervalPosition}
                    axisContentWidth={contentWidth}
                    axisEndPadding={AXIS_END_PADDING}
                    axisStartPadding={AXIS_START_PADDING}
                    itemCount={itemCount}
                    slotWidth={slotWidth}
                    className="inset-y-2"
                  />
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
                        type="button"
                        onClick={() => setSelection({ type: 'interval', intervalIndex: entry.intervalIndex })}
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
                      const serviceHeight = Math.max(2, (Math.abs(point.serviceDemandMean) / model.workbench.inventoryDemandLane.maxFlowMagnitude) * 24);
                      const retailHeight = Math.max(2, (Math.abs(point.retailDemandMean) / model.workbench.inventoryDemandLane.maxFlowMagnitude) * 24);
                      const receiptsHeight = Math.max(2, (Math.abs(point.receiptsMean) / model.workbench.inventoryDemandLane.maxFlowMagnitude) * 24);
                      const adjustmentHeight = Math.max(2, (Math.abs(point.adjustmentsMean) / model.workbench.inventoryDemandLane.maxFlowMagnitude) * 18);

                      return (
                        <button
                          key={`flow:${point.intervalIndex}`}
                          aria-label={`Service demand ${Math.round(point.serviceDemandMean)}, retail demand ${Math.round(point.retailDemandMean)}, receipts ${Math.round(point.receiptsMean)}, adjustments ${Math.round(point.adjustmentsMean)}`}
                          className="relative h-[60px]"
                          type="button"
                          onClick={() => setSelection({ type: 'interval', intervalIndex: point.intervalIndex })}
                        >
                          <span className="absolute inset-x-1 top-1/2 h-px -translate-y-1/2 bg-border/80" />
                          <span className="absolute left-[28%] bottom-1/2 w-[18%] rounded-sm bg-emerald-600/80" style={{ height: receiptsHeight }} />
                          <span
                            className={cn('absolute left-[50%] w-[14%] rounded-sm', point.adjustmentsMean >= 0 ? 'bottom-1/2 bg-amber-600/85' : 'top-1/2 bg-amber-600/85')}
                            style={{ height: adjustmentHeight }}
                          />
                          <span className="absolute left-[18%] top-1/2 w-[18%] rounded-sm bg-slate-500/70" style={{ height: serviceHeight }} />
                          <span className="absolute left-[40%] top-1/2 w-[18%] rounded-sm bg-slate-800/80" style={{ top: `calc(50% + ${serviceHeight}px)`, height: retailHeight }} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-3" style={laneGridStyle}>
            <LaneLabel
              subtitle="Aggregate transit windows approximate the pipeline story now, with order and receipt activity pulled out as explicit markers."
              title="Pipeline lane"
              tooltip="Pipeline posterior across in-transit stock, order placement, receipt expectation, and transit age."
            />
            <div className="grid gap-2">
              <div className="flex flex-wrap gap-3 px-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block h-3 w-8 rounded-full border border-emerald-700/25 bg-emerald-600/20" />
                  In-transit window
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
              <div ref={pipelineScrollRef} className="hidden-scrollbar overflow-x-auto overscroll-contain rounded-[1.2rem] border border-border/60 bg-muted/20" onScroll={handleSharedScroll}>
                <div className="relative" style={{ width: contentWidth, height: PIPELINE_LANE_HEIGHT }}>
                  <SelectedIntervalColumnOverlay
                    activeIndex={selectedIntervalPosition}
                    axisContentWidth={contentWidth}
                    axisEndPadding={AXIS_END_PADDING}
                    axisStartPadding={AXIS_START_PADDING}
                    itemCount={itemCount}
                    slotWidth={slotWidth}
                    className="inset-y-2"
                  />
                  {model.workbench.pipelineLane.spans.map((span) => {
                    const left = AXIS_START_PADDING + span.startPosition * slotWidth + slotWidth * 0.14;
                    const right = AXIS_START_PADDING + span.endPosition * slotWidth + slotWidth * 0.86;
                    const width = Math.max(slotWidth * 0.32, right - left);
                    const top = 18 + span.row * 28;
                    const isSelected = selectedIntervalIndex === span.intervalIndex;

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
                        type="button"
                        onClick={() => setSelection({ type: 'interval', intervalIndex: span.intervalIndex })}
                      >
                        <span className="truncate">{Math.round(span.inTransitMean)} in transit</span>
                        {isSelected ? (
                          <span className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-full border border-border/70 bg-background px-2 py-0.5 text-[10px] font-medium text-foreground shadow-sm">
                            {Math.round(span.orderProbability * 100)}% order probability
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                  {model.workbench.pipelineLane.markers.map((marker) => {
                    const x = deriveSlotCenterX({ index: marker.intervalPosition, slotWidth, axisStartPadding: AXIS_START_PADDING });
                    const top = 18 + marker.row * 28 + (marker.kind === 'receipt' ? 2 : -7);
                    const isSelected = selectedIntervalIndex === marker.intervalIndex;
                    return (
                      <button
                        key={marker.key}
                        aria-label={`${marker.kind === 'order' ? 'Order' : 'Receipt'} cue ${Math.round(marker.quantityMean)} units`}
                        className="absolute z-[2] -translate-x-1/2"
                        style={{ left: x, top }}
                        type="button"
                        onClick={() => setSelection({ type: 'interval', intervalIndex: marker.intervalIndex })}
                      >
                        {isSelected ? (
                          <span className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-full border border-border/70 bg-background px-2 py-0.5 text-[10px] font-medium text-foreground shadow-sm">
                            {marker.kind === 'order' ? 'Order' : 'Receipt'} {Math.round(marker.quantityMean)}
                          </span>
                        ) : null}
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

          <div className="grid gap-3" style={laneGridStyle}>
            <LaneLabel
              subtitle="Lead-time drift reads as a trajectory with spread, while variability class stays available on selection instead of printed everywhere."
              title="Lead-time lane"
              tooltip="The latent lead-time state SENA is carrying at each interval."
            />
            <div className="grid gap-2">
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
              <div ref={leadTimeScrollRef} className="hidden-scrollbar overflow-x-auto overscroll-contain rounded-[1.2rem] border border-border/60 bg-muted/20" onScroll={handleSharedScroll}>
                <div className="relative" style={{ width: contentWidth, height: LEAD_TIME_LANE_HEIGHT }}>
                  <SelectedIntervalColumnOverlay
                    activeIndex={selectedIntervalPosition}
                    axisContentWidth={contentWidth}
                    axisEndPadding={AXIS_END_PADDING}
                    axisStartPadding={AXIS_START_PADDING}
                    itemCount={itemCount}
                    slotWidth={slotWidth}
                    className="inset-y-2"
                  />
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
                        type="button"
                        onClick={() => setSelection({ type: 'interval', intervalIndex: entry.intervalIndex })}
                      >
                        {isSelected ? (
                          <span className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-full border border-border/70 bg-background px-2 py-0.5 text-[10px] font-medium text-foreground shadow-sm">
                            {entry.meanDays.toFixed(1)}d mean
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
    </PerformanceSectionShell>
  );
}

function ObservationChannels({ row }: { row: AnalysisObservationLedgerRow }) {
  return (
    <div className="flex flex-wrap gap-1.5">
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
        >
          {label}: {value}
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
          <HeaderedTableHeaderCell>Entity</HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell>Type</HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell>Pressure score</HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell>Pipeline risk</HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell>LT risk</HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell>Price sensitivity</HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell align="center">Open</HeaderedTableHeaderCell>
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
            >
              <button
                className="min-w-0 text-left"
                type="button"
                onClick={() => setSelection({ type: 'entity', entityId: row.id, entityType: row.entityType })}
              >
                <div className="flex items-center gap-2.5">
                  {entityIcon(row.entityType)}
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{row.name}</p>
                    <p className="text-sm text-muted-foreground">{row.summary}</p>
                  </div>
                </div>
              </button>
              <div>
                <HeaderedTableMobileLabel className={pressureTableLayout.mobileLabelClassName}>Type</HeaderedTableMobileLabel>
                <span className="text-sm capitalize text-muted-foreground">{row.entityType}</span>
              </div>
              <div>
                <HeaderedTableMobileLabel className={pressureTableLayout.mobileLabelClassName}>Pressure score</HeaderedTableMobileLabel>
                <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-sm', statusPillClassName(row.tone))}>
                  {row.pressureScoreLabel}
                </span>
              </div>
              <div>
                <HeaderedTableMobileLabel className={pressureTableLayout.mobileLabelClassName}>Pipeline risk</HeaderedTableMobileLabel>
                <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-sm capitalize', statusPillClassName(scoreCellTone(row.pipelineRiskLabel)))}>
                  {row.pipelineRiskLabel}
                </span>
              </div>
              <div>
                <HeaderedTableMobileLabel className={pressureTableLayout.mobileLabelClassName}>LT risk</HeaderedTableMobileLabel>
                <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-sm capitalize', statusPillClassName(scoreCellTone(row.leadTimeRiskLabel)))}>
                  {row.leadTimeRiskLabel}
                </span>
              </div>
              <div>
                <HeaderedTableMobileLabel className={pressureTableLayout.mobileLabelClassName}>Price sensitivity</HeaderedTableMobileLabel>
                <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-sm capitalize', statusPillClassName(scoreCellTone(row.priceSensitivityLabel)))}>
                  {row.priceSensitivityLabel}
                </span>
              </div>
              <div className="flex items-start lg:justify-center">
                <Button asChild className="w-full lg:w-auto" size="sm" variant="outline">
                  <Link to={row.href}>
                    <ArrowUpRight className="size-3.5" />
                    Detail
                  </Link>
                </Button>
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
  setSelection,
}: {
  model: AnalysisWorkbenchViewModel;
  setSelection: (value: AnalysisSelection) => void;
}) {
  const rows = model.evidenceRows.slice(0, 6);

  return (
    <HeaderedTable>
      <div className={evidenceTableLayout.containerClassName} style={evidenceTableLayout.style}>
        <HeaderedTableHeader className={evidenceTableLayout.headerClassName}>
          <HeaderedTableHeaderCell>Observed</HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell>Observation channels</HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell>Affected entities</HeaderedTableHeaderCell>
        </HeaderedTableHeader>
        <HeaderedTableBody className={evidenceTableLayout.bodyClassName}>
          {rows.map((row) => (
            <HeaderedTableRow key={row.id} className={cn(rowHoverClassName, evidenceTableLayout.rowClassName)}>
              <button className="min-w-0 text-left" type="button" onClick={() => setSelection({ type: 'observation', observationId: row.id })}>
                <p className="font-medium text-foreground">{row.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{row.observedAt}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{row.detail}</p>
              </button>
              <div>
                <HeaderedTableMobileLabel className={evidenceTableLayout.mobileLabelClassName}>Channels</HeaderedTableMobileLabel>
                <ObservationChannels row={row} />
              </div>
              <div>
                <HeaderedTableMobileLabel className={evidenceTableLayout.mobileLabelClassName}>Affected entities</HeaderedTableMobileLabel>
                <div className="flex flex-wrap gap-1.5">
                  {row.affectedEntityLabels.length > 0 ? row.affectedEntityLabels.map((label) => (
                    <span key={`${row.id}:${label}`} className="rounded-full border border-border/60 bg-background/70 px-2 py-1 text-[0.68rem] text-muted-foreground">
                      {label}
                    </span>
                  )) : <span className="text-sm text-muted-foreground">No named entity</span>}
                </div>
              </div>
            </HeaderedTableRow>
          ))}
        </HeaderedTableBody>
      </div>
    </HeaderedTable>
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
  return (
    <PerformanceSectionShell
      title="Supply fragility map"
      tooltip="Services against linked SKUs, with contributor pressure and inbound relief in each cell."
      description="The system-level sibling of the service contributor stack: where pressure is concentrated, and whether pipeline relief is likely to land soon."
      className={showRightRailCards ? 'lg:rounded-r-none' : undefined}
      contentClassName="px-0 py-0"
    >
      <div className="overflow-x-auto px-6 py-5">
        <div className="min-w-max rounded-[1.4rem] border border-border/60 bg-background/55 p-3">
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: `minmax(15rem, 1fr) repeat(${model.fragilityColumns.length}, minmax(8rem, 1fr))` }}
          >
            <div className="px-3 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Service</div>
            {model.fragilityColumns.map((column) => (
              <div key={column.skuId} className="px-3 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {column.name}
              </div>
            ))}

            {model.fragilityRows.map((row) => (
              <Fragment key={row.key}>
                <button
                  className="rounded-[1rem] border border-border/60 bg-white px-3 py-3 text-left hover:border-border/90"
                  type="button"
                  onClick={() => setSelection({ type: 'entity', entityId: row.entityId, entityType: row.entityType })}
                >
                  <p className="font-medium text-foreground">{row.name}</p>
                  <p className="mt-1 text-sm capitalize text-muted-foreground">{row.entityType}</p>
                </button>
                {row.cells.map((cell) => (
                  <div
                    key={cell.key}
                    className={cn(
                      'rounded-[1rem] border px-3 py-3',
                      cell.tone === 'danger'
                        ? 'border-rose-200/80 bg-rose-50/90'
                        : cell.tone === 'warning'
                          ? 'border-amber-200/80 bg-amber-50/90'
                          : cell.tone === 'info'
                            ? 'border-sky-200/80 bg-sky-50/90'
                            : 'border-border/60 bg-white',
                    )}
                  >
                    <p className="text-sm font-medium text-foreground">{cell.usageLabel}</p>
                    <p className="mt-1 text-xs capitalize text-muted-foreground">{cell.pressureLabel}</p>
                    <p className="mt-2 text-xs text-muted-foreground">{cell.reliefLabel}</p>
                  </div>
                ))}
              </Fragment>
            ))}
          </div>
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

function IntervalRail({ interval }: { interval: AnalysisWorkbenchViewModel['intervals'][number] }) {
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

      <AnalysisRailSection icon={<AudioLines className="size-4" />} title="What happened" tooltip="The dominant causal explanation in the selected interval.">
        <p className="text-sm leading-6 text-muted-foreground">{interval.narrative}</p>
        <AnalysisRailList>
          <AnalysisRailRow primary={<span className="text-muted-foreground">Service demand</span>} secondary={interval.serviceDemandLabel} />
          <AnalysisRailRow primary={<span className="text-muted-foreground">Retail demand</span>} secondary={interval.retailDemandLabel} />
          <AnalysisRailRow primary={<span className="text-muted-foreground">Receipts</span>} secondary={interval.receiptsLabel} />
          <AnalysisRailRow primary={<span className="text-muted-foreground">Adjustments</span>} secondary={interval.adjustmentsLabel} />
        </AnalysisRailList>
      </AnalysisRailSection>

      <AnalysisRailSection icon={<Radio className="size-4" />} title="Observed signals" tooltip="The raw observation channels that touched this interval.">
        <SignalsWrap values={interval.observedSignals} />
        <AnalysisRailList className="mt-3">
          {interval.affectedEntities.length > 0 ? interval.affectedEntities.map((label) => (
            <AnalysisRailRow key={`${interval.key}:${label}`} primary={<span className="text-muted-foreground">{label}</span>} />
          )) : <AnalysisRailRow primary={<span className="text-muted-foreground">No named entity resolved for this interval.</span>} />}
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
          {model.inspectorOverview.strongestChannels.map((entry) => (
            <AnalysisRailRow key={entry} primary={<span className="text-muted-foreground">{entry}</span>} />
          ))}
        </AnalysisRailList>
      </AnalysisRailSection>

      <AnalysisRailSection icon={<ListTree className="size-4" />} title="Affected entities" tooltip="The current system actors carrying the most structural pressure.">
        <AnalysisRailList>
          {model.inspectorOverview.affectedEntities.map((entry) => (
            <AnalysisRailRow key={entry} primary={<span className="text-muted-foreground">{entry}</span>} />
          ))}
        </AnalysisRailList>
      </AnalysisRailSection>
    </>
  );
}

function InspectorRail({
  model,
  selection,
}: {
  model: AnalysisWorkbenchViewModel;
  selection: AnalysisSelection;
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

  return (
    <aside className={cn(RIGHT_RAIL_ASIDE_CLASS_NAME, ANALYSIS_RAIL_PANEL_CLASS_NAME, 'gap-0')}>
      {observation ? <SelectedObservationRail row={observation} /> : null}
      {!observation && interval ? <IntervalRail interval={interval} /> : null}
      {!observation && !interval && entity ? <EntityRail row={entity} /> : null}
      {!observation && !interval && !entity ? <OverviewRail model={model} /> : null}
    </aside>
  );
}

function WorkbenchSurface({
  model,
  selectedIntervalIndex,
  setSelection,
  showRightRailCards,
}: {
  model: AnalysisWorkbenchViewModel;
  selectedIntervalIndex: number | null;
  setSelection: (value: AnalysisSelection) => void;
  showRightRailCards: boolean;
}) {
  return (
    <div className="grid gap-6">
      <SystemLedger
        model={model}
        selectedIntervalIndex={selectedIntervalIndex}
        setSelection={setSelection}
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
        <ObservationLedgerCompact model={model} setSelection={setSelection} />
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

function EvidenceSurface({
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
        tooltip="The full evidence ledger across every raw channel that fed the current system inference."
        description="This is the trust layer for SENA: which observations existed, which channels were active, and when they landed."
        className={showRightRailCards ? 'lg:rounded-r-none' : undefined}
        contentClassName="px-0 py-0"
      >
        <HeaderedTable>
          <div className={fullEvidenceTableLayout.containerClassName} style={fullEvidenceTableLayout.style}>
            <HeaderedTableHeader className={fullEvidenceTableLayout.headerClassName}>
              <HeaderedTableHeaderCell>Observed</HeaderedTableHeaderCell>
              <HeaderedTableHeaderCell>Stock</HeaderedTableHeaderCell>
              <HeaderedTableHeaderCell>Svc rank</HeaderedTableHeaderCell>
              <HeaderedTableHeaderCell>Retail</HeaderedTableHeaderCell>
              <HeaderedTableHeaderCell>Stockout</HeaderedTableHeaderCell>
              <HeaderedTableHeaderCell>Order</HeaderedTableHeaderCell>
              <HeaderedTableHeaderCell>Receipt</HeaderedTableHeaderCell>
              <HeaderedTableHeaderCell>Svc price</HeaderedTableHeaderCell>
              <HeaderedTableHeaderCell>Retail price</HeaderedTableHeaderCell>
              <HeaderedTableHeaderCell>LT hint</HeaderedTableHeaderCell>
              <HeaderedTableHeaderCell>Note</HeaderedTableHeaderCell>
            </HeaderedTableHeader>
            <HeaderedTableBody className={fullEvidenceTableLayout.bodyClassName}>
              {model.evidenceRows.map((row) => (
                <HeaderedTableRow key={row.id} className={cn(rowHoverClassName, fullEvidenceTableLayout.rowClassName)}>
                  <button className="min-w-0 text-left" type="button" onClick={() => setSelection({ type: 'observation', observationId: row.id })}>
                    <p className="font-medium text-foreground">{row.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{row.observedAt}</p>
                  </button>
                  {[
                    row.stockSnapshotLabel,
                    row.serviceRankingLabel,
                    row.retailRankingLabel,
                    row.stockoutFlagsLabel,
                    row.orderPlacedLabel,
                    row.receiptArrivedLabel,
                    row.servicePriceLabel,
                    row.retailPriceLabel,
                    row.leadTimeHintLabel,
                    row.noteLabel,
                  ].map((value, index) => (
                    <div key={`${row.id}:${index}`}>
                      <HeaderedTableMobileLabel className={fullEvidenceTableLayout.mobileLabelClassName}>Signal</HeaderedTableMobileLabel>
                      <span className="text-sm text-muted-foreground">{value}</span>
                    </div>
                  ))}
                </HeaderedTableRow>
              ))}
            </HeaderedTableBody>
          </div>
        </HeaderedTable>
      </PerformanceSectionShell>
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
        title="Analysis settings"
        tooltip="Read-only model state and evidence coverage for the current analysis window."
        description="The least important surface in the analysis stack. It exposes current model status without competing with the workbench."
        className={showRightRailCards ? 'lg:rounded-r-none' : undefined}
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[
            ['Run ID', model.settings.runId],
            ['Latest observed', model.settings.latestObservedAt],
            ['Observations used', model.settings.observationsUsed],
            ['Intervals in view', model.settings.intervalCount],
            ['Smoothing', model.settings.smoothingLabel],
            ['Effective sample size', model.settings.effectiveSampleSize],
            ['Predictive error', model.settings.predictiveError],
            ['Coverage estimate', model.settings.coverageEstimate],
            ['Scope', model.settings.scopeSummary],
          ].map(([label, value]) => (
            <div key={label} className="rounded-[1.25rem] border border-border/60 bg-white px-4 py-4">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
              <p className="mt-2 text-base font-medium text-foreground">{value}</p>
            </div>
          ))}
        </div>
      </PerformanceSectionShell>
    </div>
  );
}

export function AnalysisWorkbench({
  model,
  section,
  setSection,
  showRightRailCards,
}: {
  model: AnalysisWorkbenchViewModel;
  section: AnalysisSection;
  setSection: (value: AnalysisSection) => void;
  showRightRailCards: boolean;
}) {
  const [selection, setSelection] = useState<AnalysisSelection>({ type: 'overview' });

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

  const surface = useMemo(() => {
    if (section === 'pressure') {
      return <PressureSurface model={model} selectedEntityId={selectedEntityId} setSelection={setSelection} showRightRailCards={showRightRailCards} />;
    }
    if (section === 'observations') {
      return <ObservationsSurface model={model} setSelection={setSelection} showRightRailCards={showRightRailCards} />;
    }
    if (section === 'fragility') {
      return <FragilitySurface model={model} setSelection={setSelection} showRightRailCards={showRightRailCards} />;
    }
    if (section === 'evidence') {
      return <EvidenceSurface model={model} setSelection={setSelection} showRightRailCards={showRightRailCards} />;
    }
    if (section === 'settings') {
      return <SettingsSurface model={model} showRightRailCards={showRightRailCards} />;
    }
    return (
      <WorkbenchSurface
        model={model}
        selectedIntervalIndex={selectedIntervalIndex}
        setSelection={setSelection}
        showRightRailCards={showRightRailCards}
      />
    );
  }, [model, section, selectedEntityId, selectedIntervalIndex, showRightRailCards]);

  return (
    <div className="grid gap-6">
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
        <InternalNav section={section} showRightRailCards={showRightRailCards} />

        <section
          className={ANALYSIS_BOARD_CLASS_NAME}
          style={{
            marginTop: 'calc(var(--chrome-tabs-surface-overlap) * -2.75)',
          }}
        >
          <div className={showRightRailCards ? 'grid gap-0 lg:grid-cols-[minmax(0,1fr)_320px]' : 'grid gap-0'}>
            <div className="min-w-0 border-b border-border/60 lg:border-r lg:border-b-0 lg:rounded-r-none">
              <div className="grid min-w-0 gap-6 px-0 py-0">{surface}</div>
            </div>
            {showRightRailCards ? <InspectorRail model={model} selection={selectedObservationId ? selection : selection} /> : null}
          </div>
        </section>
      </ChromeTabs>
    </div>
  );
}
