import {
  useEffect,
  useRef,
  useState,
  type RefObject,
  type UIEvent,
  type WheelEvent,
} from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useDescriptionTextVisible } from '@/components/system/description-text';
import { cardFrameClassName, cardSurfaceClassName } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { usePreferences } from '@/state/preferences';
import {
  buildSparsePolylineSegments,
  classifyWheelIntent,
  deriveAnchoredZoomScrollLeft,
  deriveAxisContentWidth,
  deriveLabelGutterOffset,
  deriveSlotCenterX,
} from '@/routes/sku-detail/ledger';
import { formatSenaCompactIntervalDate, formatSenaCompactIntervalDay, formatSenaDate, formatSenaWideIntervalDate } from '@/routes/sku-detail/format';
import { SectionLabel, SectionTitle } from '@/routes/sku-detail/section-heading';
import type { ServiceDetailViewModel, ServiceInspectorSelection } from './view-model';

const SHARED_PILL_MIN_WIDTH = 48;
const DEFAULT_SLOT_WIDTH = 72;
const MIN_SLOT_WIDTH = 40;
const MAX_SLOT_WIDTH = 120;
const INTERVAL_PILL_GAP = 0;
const SCROLL_EDGE_TOLERANCE = 6;
const AXIS_START_PADDING = 20;
const AXIS_END_PADDING = 36;
const LABEL_GUTTER_HEIGHT = 32;
const CHART_PLOT_HEIGHT = 120;
const CHART_VIEWBOX_HEIGHT = 42;
const FLOW_LABEL_GUTTER_HEIGHT = 64;
const FLOW_LANE_PLOT_HEIGHT = 112;
const FLOW_LINE_VIEWBOX_HEIGHT = 52;
const FLOW_LINE_TOP_PADDING = 6;
const FLOW_LINE_BOTTOM_PADDING = 6;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function clampScrollLeft(scrollLeft: number, viewportWidth: number, contentWidth: number) {
  return clamp(scrollLeft, 0, Math.max(0, contentWidth - viewportWidth));
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
  const fullDate = formatSenaDate(endAt, language);
  if (fullDate !== '—') {
    return fullDate;
  }
  return `Interval ${intervalIndex + 1}`;
}

function buildPointCoordinatesWithDomain(
  values: number[],
  slotWidth: number,
  height: number,
  domainMin: number,
  domainMax: number,
  options?: {
    axisStartPadding?: number;
    topPadding?: number;
    bottomPadding?: number;
  },
) {
  if (values.length === 0) {
    return [];
  }
  const min = Math.min(domainMin, domainMax);
  const max = Math.max(domainMin, domainMax);
  const range = max - min || 1;
  const axisStartPadding = options?.axisStartPadding ?? 0;
  const topPadding = options?.topPadding ?? 0;
  const bottomPadding = options?.bottomPadding ?? 0;
  const drawableHeight = Math.max(1, height - topPadding - bottomPadding);

  return values.map((value, index) => ({
    x: deriveSlotCenterX({ index, slotWidth, axisStartPadding }),
    y: topPadding + drawableHeight - ((value - min) / range) * drawableHeight,
    value,
  }));
}

function buildPolylineWithDomain(
  values: number[],
  slotWidth: number,
  height: number,
  domainMin: number,
  domainMax: number,
  options?: {
    axisStartPadding?: number;
    topPadding?: number;
    bottomPadding?: number;
  },
) {
  return buildPointCoordinatesWithDomain(values, slotWidth, height, domainMin, domainMax, options)
    .map((point) => `${point.x},${point.y}`)
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
  model,
  selection,
  setSelection,
}: {
  model: ServiceDetailViewModel;
  selection: ServiceInspectorSelection;
  setSelection: (value: ServiceInspectorSelection) => void;
}) {
  const { language } = usePreferences();
  const intervalScrollRef = useRef<HTMLDivElement | null>(null);
  const priceScrollRef = useRef<HTMLDivElement | null>(null);
  const flowScrollRef = useRef<HTMLDivElement | null>(null);
  const intervals = model.intervals;
  const selectedIntervalIndex = selectedIntervalIndexFromSelection(model, selection);
  const indices = intervals.map((entry) => entry.intervalIndex);
  const visibleRegimes = presentRegimes(intervals.map((interval) => interval.dominantRegime));
  const syncRefs = [intervalScrollRef, priceScrollRef, flowScrollRef];
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
  const renderWidth = Math.max(contentWidth, viewportWidth || 0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const clampedScrollLeft = clampScrollLeft(scrollLeft, viewportWidth, contentWidth);
  const canScrollLeft = clampedScrollLeft > SCROLL_EDGE_TOLERANCE;
  const canScrollRight = clampedScrollLeft + viewportWidth < contentWidth - SCROLL_EDGE_TOLERANCE;
  const priceMarkers = intervals.map((interval) => ({
    intervalIndex: interval.intervalIndex,
    price: interval.priceValue,
    observedAt: interval.endAt ?? `interval-${interval.intervalIndex}`,
  }));
  const { points: priceCoordinates, segments: pricePolylines } = buildSparsePolylineSegments(
    priceMarkers,
    indices,
    stretchedSlotWidth,
    CHART_VIEWBOX_HEIGHT,
    { axisStartPadding, topPadding: 6, bottomPadding: 6 },
  );
  const gapValues = intervals.map((interval) => interval.sellableValue - interval.demandValue);
  const maxGapMagnitude = Math.max(1, ...gapValues.map((value) => Math.abs(value)));

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
      clampScrollLeft(
        current + direction * Math.max(viewportWidth - stretchedSlotWidth - INTERVAL_PILL_GAP, stretchedSlotWidth),
        viewportWidth,
        contentWidth,
      ),
    );
  };

  const handleLaneWheel =
    (scrollRef: RefObject<HTMLDivElement | null>, axisPaddingStart = 0) =>
    (event: WheelEvent<HTMLDivElement>) => {
      const node = scrollRef.current;
      if (!node) {
        return;
      }
      event.preventDefault();
      const intent = classifyWheelIntent(event.deltaX, event.deltaY);
      if (intent === 'pan') {
        if (Math.abs(event.deltaX) < 1 || contentWidth <= viewportWidth + 1) {
          return;
        }
        setScrollLeft((current) => clampScrollLeft(current + event.deltaX, viewportWidth, contentWidth));
        return;
      }
      if (Math.abs(event.deltaY) < 1 || indices.length === 0) {
        return;
      }
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
            <SectionTitle
              title="Service viability ledger"
              tooltip="A service-native ledger for regime shifts, demand versus sellability, contributor pressure, and restoration signals."
            />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {intervals.find((interval) => interval.intervalIndex === selectedIntervalIndex)?.label ?? 'Latest interval'}
        </p>
      </div>

      <IntervalStrip
        activeIndex={selectedIntervalIndex}
        axisContentWidth={renderWidth}
        axisEndPadding={axisEndPadding}
        axisStartPadding={axisStartPadding}
        canScrollLeft={canScrollLeft}
        canScrollRight={canScrollRight}
        intervals={intervals.map((interval) => ({ intervalIndex: interval.intervalIndex, endAt: interval.endAt }))}
        language={language}
        onSelect={(index) => setSelection({ type: 'interval', intervalIndex: index })}
        onScroll={handleScrollerScroll}
        scrollByViewport={scrollByViewport}
        scrollRef={intervalScrollRef}
        slotWidth={stretchedSlotWidth}
      />

      <div className="mt-5">
        <div className="pb-5">
          <LaneTitle
            title="Regime + price lane"
            subtitle={intervals.find((interval) => interval.intervalIndex === selectedIntervalIndex)?.priceLabel ?? intervals.at(-1)?.priceLabel}
            tooltip="Demand conditions and service price context across the active interval sequence."
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
                Service price line
              </span>
            </div>
            <div
              ref={priceScrollRef}
              className="hidden-scrollbar overflow-x-auto overscroll-contain"
              onScroll={handleScrollerScroll}
              onWheel={handleLaneWheel(priceScrollRef, axisStartPadding)}
            >
              <div className="relative overflow-visible" style={{ width: renderWidth, height: LABEL_GUTTER_HEIGHT + CHART_PLOT_HEIGHT }}>
                <TooltipProvider>
                  <RegimeChartHighlightOverlay
                    activeIndex={selectedIntervalIndex}
                    axisContentWidth={renderWidth}
                    axisEndPadding={axisEndPadding}
                    axisStartPadding={axisStartPadding}
                    intervals={intervals.map((interval) => ({
                      intervalIndex: interval.intervalIndex,
                      dominantRegime: interval.dominantRegime,
                    }))}
                    onSelect={(index) => setSelection({ type: 'interval', intervalIndex: index })}
                  />
                </TooltipProvider>
                <svg
                  aria-hidden="true"
                  className="absolute left-0 top-0 z-[1] w-full"
                  preserveAspectRatio="none"
                  style={{ height: CHART_PLOT_HEIGHT, top: LABEL_GUTTER_HEIGHT }}
                  viewBox={`0 0 ${Math.max(renderWidth, 1)} ${CHART_VIEWBOX_HEIGHT}`}
                >
                  {pricePolylines.map((segment, index) => (
                    <polyline
                      key={`service-price-segment-${index}`}
                      fill="none"
                      points={segment}
                      stroke="currentColor"
                      strokeWidth="1.4"
                      className="text-foreground/70"
                    />
                  ))}
                </svg>
                {priceCoordinates.map((point, index) => {
                  const marker = priceMarkers[index];
                  const isSelected = marker?.intervalIndex === selectedIntervalIndex;
                  return (
                    <button
                      key={marker ? `${marker.observedAt}:${marker.intervalIndex}` : `price-${index}`}
                      aria-label={marker ? `Price ${marker.price}` : `Price point ${index + 1}`}
                      className="absolute z-[2] -translate-x-1/2 -translate-y-1/2"
                      style={{ left: point.x, top: deriveLabelGutterOffset({ plotY: point.y }) }}
                      type="button"
                      onClick={() => marker && setSelection({ type: 'interval', intervalIndex: marker.intervalIndex })}
                    >
                      {isSelected ? (
                        <span className="absolute bottom-full left-1/2 mb-2 flex -translate-x-1/2 flex-col items-center rounded-[0.9rem] border border-border/70 bg-background px-2.5 py-1 text-[10px] font-medium text-foreground shadow-sm">
                          <span className="whitespace-nowrap text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                            {formatRegimeLabel(intervals[index]?.dominantRegime ?? '')}
                          </span>
                          <span className="whitespace-nowrap">{intervals[index]?.priceLabel ?? ''}</span>
                        </span>
                      ) : null}
                      <span className={`block size-4 rounded-full border-2 ${isSelected ? 'border-foreground bg-foreground' : 'border-foreground/55 bg-background'}`} />
                    </button>
                  );
                })}
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {intervals.find((interval) => interval.intervalIndex === selectedIntervalIndex)?.evidenceSummary ?? intervals.at(-1)?.evidenceSummary}
            </p>
          </div>
        </div>

        <div className="border-t border-border/60 py-5">
          <LaneTitle
            title="Demand and sellability lane"
            tooltip="Sellable capacity minus demand, using a single service margin bar around the midline."
          />
          <div className="mb-3 flex items-center gap-4 px-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <span className="size-2 rounded-full bg-foreground/70" />
              Sellable minus demand
            </span>
          </div>
          <div
            ref={flowScrollRef}
            className="hidden-scrollbar overflow-x-auto overscroll-contain"
            onScroll={handleScrollerScroll}
            onWheel={handleLaneWheel(flowScrollRef, axisStartPadding)}
          >
            <div
              className="grid rounded-md bg-muted/20 pb-3 pt-2"
              style={{
                width: renderWidth,
                paddingLeft: axisStartPadding,
                paddingRight: axisEndPadding,
                paddingTop: FLOW_LABEL_GUTTER_HEIGHT,
                gridTemplateColumns: `repeat(${Math.max(intervals.length, 1)}, ${stretchedSlotWidth}px)`,
                minHeight: FLOW_LABEL_GUTTER_HEIGHT + FLOW_LANE_PLOT_HEIGHT,
              }}
            >
              {intervals.map((interval, index) => {
                const plotHalfHeight = FLOW_LANE_PLOT_HEIGHT / 2;
                const gapValue = gapValues[index] ?? 0;
                const gapHeight = Math.max(3, (Math.abs(gapValue) / maxGapMagnitude) * (plotHalfHeight - 4));
                const tooltipPositionClassName =
                  index === 0
                    ? 'left-0 translate-x-0'
                    : index === intervals.length - 1
                      ? 'right-0 translate-x-0'
                      : 'left-1/2 -translate-x-1/2';
                const tooltipInsetTop = Math.max(4, FLOW_LABEL_GUTTER_HEIGHT - 60);
                return (
                  <button
                    key={interval.intervalIndex}
                    className="relative flex w-full items-stretch justify-center"
                    style={{ height: FLOW_LANE_PLOT_HEIGHT }}
                    type="button"
                    onClick={() => setSelection({ type: 'interval', intervalIndex: interval.intervalIndex })}
                  >
                    {selectedIntervalIndex === interval.intervalIndex ? (
                      <div
                        className={`absolute z-[2] flex max-w-[220px] flex-col items-start gap-1 rounded-md border border-border/60 bg-background/95 px-2 py-1 text-[10px] shadow-sm ${tooltipPositionClassName}`}
                        style={{ top: tooltipInsetTop - FLOW_LABEL_GUTTER_HEIGHT }}
                      >
                        <span className="whitespace-nowrap text-foreground">{`Demand: ${interval.demandLabel}`}</span>
                        <span className="whitespace-nowrap text-foreground">{`Sellable: ${interval.sellableLabel}`}</span>
                        <span className="whitespace-nowrap text-foreground">{`Gap: ${gapValue > 0 ? '+' : ''}${gapValue.toFixed(2).replace(/\.00$/, '')}`}</span>
                        <span className="whitespace-nowrap text-foreground">{interval.tensionLabel}</span>
                      </div>
                    ) : null}
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
                );
              })}
            </div>
          </div>
        </div>

        <div className="border-t border-border/60 py-5">
          <LaneTitle
            title="Contributor pressure lane"
            tooltip="Linked SKUs ranked by days of cover, bottleneck probability, and service pressure."
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

        <div className="border-t border-border/60 pt-5">
          <LaneTitle
            title="Restoration pipeline lane"
            tooltip="Inbound linked-SKU events and confirmed receipts that restore service capacity."
          />
          {model.restoration.length > 0 ? (
            <div className="grid gap-3 xl:grid-cols-2">
              {model.restoration.map((event) => (
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
          ) : (
            <div className="rounded-[1.2rem] border border-dashed border-border/70 bg-background/70 px-4 py-5 text-sm leading-6 text-muted-foreground">
              No open restoration signal is visible yet. Use linked SKU updates to refresh the service recovery path.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
