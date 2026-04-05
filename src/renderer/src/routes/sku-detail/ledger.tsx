import { useEffect, useRef, useState, type RefObject, type UIEvent, type WheelEvent } from 'react';
import { Package } from 'lucide-react';
import {
  AXIS_END_PADDING,
  AXIS_START_PADDING,
  classifyWheelIntent,
  clampScrollLeft,
  DEFAULT_SLOT_WIDTH,
  deriveAnchoredZoomScrollLeft,
  deriveAxisContentWidth,
  deriveCenteredIntervalScrollLeft,
  deriveViewportPageScrollLeft,
  deriveVisibleWindow,
  INTERVAL_PILL_GAP,
  IntervalStrip,
  MAX_SLOT_WIDTH,
  MIN_SLOT_WIDTH,
  SCROLL_EDGE_TOLERANCE,
  SHARED_PILL_MIN_WIDTH,
} from '@/components/system/interval-strip';
import {
  IntervalBarTimelineChart,
  IntervalTileTimelineChart,
  MeanBandTimelineChart,
  SparseTimelineChart,
} from '@/components/system/timeline-chart';
import { cardFrameClassName, cardSurfaceClassName } from '@/components/ui/card';
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
  intervalLabelForWidth,
  intervalTooltipLabel,
  responsivePillLabel,
} from '@/components/system/interval-strip';
export {
  deriveLabelGutterOffset,
} from '@/components/system/timeline-chart';

const LABEL_GUTTER_HEIGHT = 32;
const CHART_PLOT_HEIGHT = 120;
const FLOW_LABEL_GUTTER_HEIGHT = 64;
const FLOW_LANE_PLOT_HEIGHT = 112;

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

export function SkuDetailLedger({
  model,
  selectedIntervalIndex,
  setSelectedIntervalIndex,
}: {
  model: SenaSkuDetailViewModel;
  selectedIntervalIndex: number | null;
  setSelectedIntervalIndex: (index: number) => void;
}) {
  const { language, t } = usePreferences();
  const intervalScrollRef = useRef<HTMLDivElement | null>(null);
  const priceScrollRef = useRef<HTMLDivElement | null>(null);
  const inventoryScrollRef = useRef<HTMLDivElement | null>(null);
  const flowScrollRef = useRef<HTMLDivElement | null>(null);
  const pipelineScrollRef = useRef<HTMLDivElement | null>(null);
  const intervals = intervalEntries(model);
  const visibleRegimes = presentRegimes(model.lanes.regimePriceLane.intervals.map((interval) => interval.dominantRegime));
  const indices = intervals.map((entry) => entry.intervalIndex);
  const syncRefs = [intervalScrollRef, priceScrollRef, inventoryScrollRef, flowScrollRef, pipelineScrollRef];
  const syncingScrollRef = useRef(false);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [slotWidthPx, setSlotWidthPx] = useState(DEFAULT_SLOT_WIDTH);
  const effectiveSlotWidth = clamp(slotWidthPx, Math.max(SHARED_PILL_MIN_WIDTH, MIN_SLOT_WIDTH), MAX_SLOT_WIDTH);
  const stretchedSlotWidth =
    viewportWidth > 0 && indices.length > 0
      ? Math.max(effectiveSlotWidth, (viewportWidth - AXIS_START_PADDING - AXIS_END_PADDING) / indices.length)
      : effectiveSlotWidth;
  const axisStartPadding = AXIS_START_PADDING;
  const axisEndPadding = AXIS_END_PADDING;
  const contentWidth = deriveAxisContentWidth({
    itemCount: indices.length,
    slotWidth: stretchedSlotWidth,
    axisStartPadding,
    axisEndPadding,
  });
  const [scrollLeft, setScrollLeft] = useState(0);
  const clampedScrollLeft = clampScrollLeft(scrollLeft, viewportWidth, contentWidth);
  const visibleWindow = deriveVisibleWindow(indices.length, clampedScrollLeft, viewportWidth, stretchedSlotWidth, INTERVAL_PILL_GAP);
  const canScrollLeft = clampedScrollLeft > SCROLL_EDGE_TOLERANCE;
  const canScrollRight = clampedScrollLeft + viewportWidth < contentWidth - SCROLL_EDGE_TOLERANCE;
  const intervalPositionByIndex = new Map(indices.map((value, index) => [value, index]));
  const inventoryChartData = model.lanes.inventoryLane.points.map((point, index) => ({
    high: point.high,
    intervalIndex: indices[index] ?? index,
    intervalPosition: index,
    low: point.low,
    mean: point.mean,
  }));
  const priceSlots = model.lanes.regimePriceLane.intervals
    .map((interval) => {
      const intervalPosition = intervalPositionByIndex.get(interval.intervalIndex);
      if (intervalPosition == null) {
        return null;
      }
      return {
        ariaLabel: interval.dominantRegime,
        fill: regimeTint(interval.dominantRegime, selectedIntervalIndex === interval.intervalIndex),
        intervalIndex: interval.intervalIndex,
        intervalPosition,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry != null);
  const pricePoints = model.lanes.regimePriceLane.priceMarkers
    .map((marker) => {
      const intervalPosition = intervalPositionByIndex.get(marker.intervalIndex);
      if (intervalPosition == null) {
        return null;
      }
      return {
        ariaLabel: `Price ${marker.price}`,
        intervalIndex: marker.intervalIndex,
        intervalPosition,
        key: `${marker.observedAt}:${marker.intervalIndex}`,
        value: marker.price,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry != null);
  const selectedPointIndex =
    selectedIntervalIndex != null ? Math.max(0, indices.indexOf(selectedIntervalIndex)) : null;
  const maxPipelineInTransit = Math.max(0, ...model.lanes.pipelineLane.intervals.map((interval) => interval.inTransitMean));
  const maxFlowMagnitude = Math.max(
    1,
    ...model.lanes.flowLane.intervals.flatMap((interval) => [
      Math.abs(interval.serviceDemandMean),
      Math.abs(interval.retailDemandMean),
      Math.abs(interval.receiptsMean),
    ]),
  );
  const flowChartData = model.lanes.flowLane.intervals.map((interval) => ({
    ariaLabel: `Service demand ${Math.round(interval.serviceDemandMean)}, retail demand ${Math.round(interval.retailDemandMean)}, receipts ${Math.round(interval.receiptsMean)}`,
    intervalIndex: interval.intervalIndex,
    values: {
      receipts: Math.abs(interval.receiptsMean),
      retailDemand: -Math.abs(interval.retailDemandMean),
      serviceDemand: -Math.abs(interval.serviceDemandMean),
    },
  }));
  const pipelineChartData = model.lanes.pipelineLane.intervals.map((interval) => {
    const isCompact = pipelineUsesCompactTile(stretchedSlotWidth);
    const isNumberOnly = pipelineUsesNumberOnlyTile(stretchedSlotWidth);

    return {
      ariaLabel: `${Math.round(interval.inTransitMean)} in transit`,
      className: 'border-border/60',
      fill: pipelineTintStyle(interval.inTransitMean, maxPipelineInTransit).backgroundColor,
      intervalIndex: interval.intervalIndex,
      label: isNumberOnly ? (
        <span className={`flex flex-col items-center justify-center gap-1 text-sm leading-none ${selectedIntervalIndex === interval.intervalIndex ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
          <span>{Math.round(interval.inTransitMean)}</span>
          <Package className="size-3.5" />
        </span>
      ) : (
        <>
          <span className={`inline-flex items-center justify-center gap-1 whitespace-nowrap text-sm leading-none ${selectedIntervalIndex === interval.intervalIndex ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
            <span>{Math.round(interval.inTransitMean)}</span>
            <Package className="size-3.5" />
          </span>
          {!isCompact && !isNumberOnly ? (
            <span className={`text-sm leading-tight ${selectedIntervalIndex === interval.intervalIndex ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
              in transit
            </span>
          ) : null}
        </>
      ),
      selectedLabel: selectedIntervalIndex === interval.intervalIndex ? (
        <span className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-full border border-border/70 bg-background px-2 py-0.5 text-[10px] font-medium text-foreground shadow-sm">
          {Math.round(interval.orderQuantityMean)} pending delivery
        </span>
      ) : null,
      value: interval.inTransitMean,
    };
  });
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

  const handleScrollerScroll = (event: UIEvent<HTMLDivElement>) => {
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
        slotWidth: stretchedSlotWidth,
        viewportWidth,
      }),
    );
  };

  const handleLaneWheel =
    (scrollRef: RefObject<HTMLDivElement | null>, axisPaddingStart = 0) =>
    (event: WheelEvent<HTMLDivElement>) => {
      const node = scrollRef.current;
      if (!node) {
        return;
      }
      const intent = classifyWheelIntent(event.deltaX, event.deltaY);
      if (intent === 'pan') {
        if (Math.abs(event.deltaX) < 1 || contentWidth <= viewportWidth + 1) {
          return;
        }
        event.preventDefault();
        setScrollLeft((current) => clampScrollLeft(current + event.deltaX, viewportWidth, contentWidth));
        return;
      }
      if (Math.abs(event.deltaY) < 1 || indices.length === 0) {
        return;
      }
      event.preventDefault();
      const rect = node.getBoundingClientRect();
      const pointerX = clamp(event.clientX - rect.left, 0, node.clientWidth);
      setSlotWidthPx((currentWidth) => {
        const nextWidth = clamp(currentWidth - event.deltaY * 0.08, Math.max(SHARED_PILL_MIN_WIDTH, MIN_SLOT_WIDTH), MAX_SLOT_WIDTH);
        if (Math.abs(nextWidth - currentWidth) < 0.5) {
          return currentWidth;
        }
        const nextContentWidth = deriveAxisContentWidth({
          itemCount: indices.length,
          slotWidth: nextWidth,
          axisStartPadding: axisPaddingStart,
          axisEndPadding,
        });
        setScrollLeft((currentScrollLeft) =>
          deriveAnchoredZoomScrollLeft({
            contentWidth: nextContentWidth,
            hoveredPointerX: pointerX,
            intervalCount: indices.length,
            nextSlotWidth: nextWidth,
            previousScrollLeft: currentScrollLeft,
            previousSlotWidth: currentWidth,
            axisStartPadding: axisPaddingStart,
            viewportWidth,
          }),
        );
        return nextWidth;
      });
    };

  return (
    <section className={`${cardFrameClassName} ${cardSurfaceClassName} min-w-0 rounded-[2rem] px-6 py-5`}>
      <div className="flex flex-col gap-2 border-b border-border/60 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">SENA</p>
          <div className="mt-1">
            <SectionTitle title="Ledger" tooltip={t('catalogSenaSkuLedgerTooltip')} />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{model.selectedInterval.label}</p>
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

      <div className="mt-5">
        <div className="pb-5">
          <LaneTitle
            title={t('catalogSenaSkuRegimePriceLane')}
            subtitle={model.lanes.regimePriceLane.currentPriceLabel}
            tooltip={t('catalogSenaSkuRegimePriceLaneTooltip')}
          />
          <div className="grid gap-3">
            <div className="flex flex-wrap items-center gap-4 px-1 text-xs text-muted-foreground">
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
                Retail price line
              </span>
            </div>
            <div ref={priceScrollRef} className="hidden-scrollbar overflow-x-auto overscroll-contain" onScroll={handleScrollerScroll} onWheel={handleLaneWheel(priceScrollRef, axisStartPadding)}>
              <SparseTimelineChart
                axisEndPadding={axisEndPadding}
                axisStartPadding={axisStartPadding}
                gutterHeight={LABEL_GUTTER_HEIGHT}
                lineStroke="rgba(48,31,20,0.7)"
                plotHeight={CHART_PLOT_HEIGHT}
                pointButtons={{
                  ariaLabel: (marker) => `Price ${marker.value}`,
                  onSelect: (marker) => setSelectedIntervalIndex(marker.intervalIndex),
                  selected: (marker) => marker.intervalIndex === selectedIntervalIndex,
                  selectedLabel: (marker) => (
                    <span className="absolute bottom-full left-1/2 mb-2 flex -translate-x-1/2 flex-col items-center rounded-[0.9rem] border border-border/70 bg-background px-2.5 py-1 text-[10px] font-medium text-foreground shadow-sm">
                      <span className="whitespace-nowrap text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                        {formatRegimeLabel(model.lanes.regimePriceLane.intervals.find((interval) => interval.intervalIndex === marker.intervalIndex)?.dominantRegime ?? '')}
                      </span>
                      <span className="whitespace-nowrap">${marker.value}</span>
                    </span>
                  ),
                }}
                points={pricePoints}
                slotButtons={{
                  className: 'border-r border-background/35 last:border-r-0',
                  onSelect: (slot) => setSelectedIntervalIndex(slot.intervalIndex),
                  selected: (slot) => slot.intervalIndex === selectedIntervalIndex,
                  style: (slot, isSelected) => {
                    const intervalPosition = priceSlots.findIndex((entry) => entry.intervalIndex === slot.intervalIndex);
                    return {
                      borderTopLeftRadius: intervalPosition === 0 ? '0.85rem' : undefined,
                      borderBottomLeftRadius: intervalPosition === 0 ? '0.85rem' : undefined,
                      borderTopRightRadius: intervalPosition === priceSlots.length - 1 ? '0.85rem' : undefined,
                      borderBottomRightRadius: intervalPosition === priceSlots.length - 1 ? '0.85rem' : undefined,
                      boxShadow: isSelected ? 'inset 0 0 0 1px rgba(48,31,20,0.12)' : undefined,
                    };
                  },
                }}
                slots={priceSlots}
                slotWidth={stretchedSlotWidth}
              />
            </div>
            <p className="text-sm text-muted-foreground">{model.lanes.regimePriceLane.summary}</p>
          </div>
        </div>

        <div className="border-t border-border/60 py-5">
          <LaneTitle title={t('catalogSenaSkuInventoryLane')} tooltip={t('catalogSenaSkuInventoryLaneTooltip')} />
          <div className="mb-3 flex flex-wrap items-center gap-4 px-1 text-xs text-muted-foreground">
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
                className="inline-block h-px w-7 opacity-70"
                style={{
                  backgroundImage: 'repeating-linear-gradient(to right, currentColor 0 2px, transparent 2px 4px)',
                }}
              />
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
          <div ref={inventoryScrollRef} className="hidden-scrollbar overflow-x-auto overscroll-contain rounded-md bg-muted/25 px-2 py-3" onScroll={handleScrollerScroll} onWheel={handleLaneWheel(inventoryScrollRef, axisStartPadding)}>
            <MeanBandTimelineChart
              axisEndPadding={axisEndPadding}
              axisStartPadding={axisStartPadding}
              bandFill="rgba(48,31,20,0.1)"
              data={inventoryChartData}
              gutterHeight={LABEL_GUTTER_HEIGHT}
              lineStroke="rgba(48,31,20,1)"
              plotHeight={CHART_PLOT_HEIGHT}
              pointButtons={{
                ariaLabel: (datum) => `Inventory ${Math.round(datum.mean)} units`,
                onSelect: (datum) => setSelectedIntervalIndex(datum.intervalIndex),
                selected: (datum, index) => selectedPointIndex === index,
                selectedLabel: (datum) => (
                  <span className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-full border border-border/70 bg-background px-2 py-0.5 text-[10px] font-medium text-foreground shadow-sm">
                    {Math.round(datum.mean)}u
                  </span>
                ),
              }}
              slotWidth={stretchedSlotWidth}
            />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">{model.lanes.inventoryLane.summary}</p>
        </div>

        <div className="border-t border-border/60 py-5">
          <LaneTitle title={t('catalogSenaSkuFlowLane')} tooltip={t('catalogSenaSkuFlowLaneTooltip')} />
          <div className="mb-3 flex items-center gap-4 px-2 text-xs text-muted-foreground">
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
          </div>
          <div ref={flowScrollRef} className="hidden-scrollbar overflow-x-auto overscroll-contain" onScroll={handleScrollerScroll} onWheel={handleLaneWheel(flowScrollRef, axisStartPadding)}>
            <IntervalBarTimelineChart
              axisEndPadding={axisEndPadding}
              axisStartPadding={axisStartPadding}
              data={flowChartData}
              gutterHeight={FLOW_LABEL_GUTTER_HEIGHT}
              plotHeight={FLOW_LANE_PLOT_HEIGHT}
              series={[
                { dataKey: 'serviceDemand', fill: 'rgba(48,31,20,0.2)', stackId: 'demand' },
                { dataKey: 'retailDemand', fill: 'rgba(48,31,20,0.45)', stackId: 'demand' },
                { dataKey: 'receipts', fill: 'rgba(188, 161, 125, 1)', stackId: 'supply' },
              ]}
              selected={(datum) => selectedIntervalIndex === datum.intervalIndex}
              selectedLabel={(datum, index) => {
                const interval = model.lanes.flowLane.intervals[index];
                if (!interval) {
                  return null;
                }
                return (
                  <div className="absolute bottom-full left-1/2 z-[2] mb-2 flex -translate-x-1/2 flex-col items-start gap-1 rounded-md border border-border/60 bg-background/95 px-2 py-1 text-[10px] shadow-sm">
                    <span className="whitespace-nowrap text-foreground">{`Service: -${Math.round(interval.serviceDemandMean)}`}</span>
                    <span className="whitespace-nowrap text-foreground">{`Retail: -${Math.round(interval.retailDemandMean)}`}</span>
                    <span className="whitespace-nowrap text-foreground">{`Receipts: +${Math.round(interval.receiptsMean)}`}</span>
                  </div>
                );
              }}
              slotWidth={stretchedSlotWidth}
              symmetricDomainMax={maxFlowMagnitude}
              onSelect={(datum) => setSelectedIntervalIndex(datum.intervalIndex)}
            />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">{model.lanes.flowLane.summary}</p>
        </div>

        <div className="border-t border-border/60 pt-5">
          <LaneTitle title={t('catalogSenaSkuPipelineLane')} tooltip={t('catalogSenaSkuPipelineLaneTooltip')} />
          <div ref={pipelineScrollRef} className="hidden-scrollbar overflow-x-auto overflow-y-visible overscroll-contain" onScroll={handleScrollerScroll} onWheel={handleLaneWheel(pipelineScrollRef, axisStartPadding)}>
            <IntervalTileTimelineChart
              axisEndPadding={axisEndPadding}
              axisStartPadding={axisStartPadding}
              data={pipelineChartData}
              gutterHeight={LABEL_GUTTER_HEIGHT}
              plotHeight={96}
              slotWidth={stretchedSlotWidth}
              onSelect={(datum) => setSelectedIntervalIndex(datum.intervalIndex)}
              selected={(datum) => selectedIntervalIndex === datum.intervalIndex}
            />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">{model.lanes.pipelineLane.summary}</p>
        </div>
      </div>
    </section>
  );
}
