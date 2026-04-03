import { useEffect, useRef, useState, type RefObject, type UIEvent, type WheelEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useDescriptionTextVisible } from '@/components/system/description-text';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { usePreferences } from '@/state/preferences';
import { formatSenaCompactIntervalDate, formatSenaDate } from './format';
import { SectionLabel, SectionTitle } from './section-heading';
import type { SenaSkuDetailViewModel } from './view-model';

const SHARED_PILL_MIN_WIDTH = 48;
const DEFAULT_SLOT_WIDTH = 72;
const MIN_SLOT_WIDTH = 40;
const MAX_SLOT_WIDTH = 120;
const INTERVAL_PILL_GAP = 0;
const SCROLL_EDGE_TOLERANCE = 6;

function intervalEntries(model: SenaSkuDetailViewModel) {
  const entries = new Map<number, { intervalIndex: number; startAt: string | null }>();
  for (const interval of model.lanes.regimePriceLane.intervals) {
    entries.set(interval.intervalIndex, { intervalIndex: interval.intervalIndex, startAt: interval.startAt });
  }
  for (const interval of model.lanes.flowLane.intervals) {
    if (!entries.has(interval.intervalIndex)) {
      entries.set(interval.intervalIndex, { intervalIndex: interval.intervalIndex, startAt: interval.startAt });
    }
  }
  for (const interval of model.lanes.pipelineLane.intervals) {
    if (!entries.has(interval.intervalIndex)) {
      entries.set(interval.intervalIndex, { intervalIndex: interval.intervalIndex, startAt: null });
    }
  }
  return [...entries.values()].sort((left, right) => left.intervalIndex - right.intervalIndex);
}

function buildPolyline(
  values: number[],
  slotWidth: number,
  height: number,
  options?: {
    topPadding?: number;
    bottomPadding?: number;
  },
) {
  if (values.length === 0) {
    return '';
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const topPadding = options?.topPadding ?? 0;
  const bottomPadding = options?.bottomPadding ?? 0;
  const drawableHeight = Math.max(1, height - topPadding - bottomPadding);
  return values
    .map((value, index) => {
      const x = slotWidth * index + slotWidth / 2;
      const y = topPadding + drawableHeight - ((value - min) / range) * drawableHeight;
      return `${x},${y}`;
    })
    .join(' ');
}

function buildPointCoordinates(
  values: number[],
  slotWidth: number,
  height: number,
  options?: {
    topPadding?: number;
    bottomPadding?: number;
  },
) {
  if (values.length === 0) {
    return [];
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const topPadding = options?.topPadding ?? 0;
  const bottomPadding = options?.bottomPadding ?? 0;
  const drawableHeight = Math.max(1, height - topPadding - bottomPadding);
  return values.map((value, index) => ({
    x: slotWidth * index + slotWidth / 2,
    y: topPadding + drawableHeight - ((value - min) / range) * drawableHeight,
    value,
  }));
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

export function intervalLabelForWidth(startAt: string | null, intervalIndex: number, slotWidth: number) {
  const compactDate = formatSenaCompactIntervalDate(startAt);
  if (compactDate !== '—') {
    return responsivePillLabel(compactDate, compactDate, slotWidth);
  }
  return responsivePillLabel(`Interval ${intervalIndex + 1}`, String(intervalIndex + 1), slotWidth);
}

export function intervalTooltipLabel(startAt: string | null, intervalIndex: number, language: Parameters<typeof formatSenaDate>[1]) {
  const fullDate = formatSenaDate(startAt, language);
  if (fullDate !== '—') {
    return fullDate;
  }
  return `Interval ${intervalIndex + 1}`;
}

export function responsivePillLabel(fullLabel: string, compactLabel: string, slotWidth: number) {
  const requiredWidth = (label: string) => label.length * 9 + 20;
  if (slotWidth >= requiredWidth(fullLabel)) {
    return fullLabel;
  }
  if (slotWidth >= requiredWidth(compactLabel)) {
    return compactLabel;
  }
  return '';
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

export function deriveVisibleWindow(itemCount: number, scrollLeft: number, viewportWidth: number, slotWidth: number, gapWidth: number) {
  if (itemCount <= 0 || viewportWidth <= 0 || slotWidth <= 0) {
    return { start: 0, end: Math.max(0, itemCount - 1) };
  }
  const stride = slotWidth + gapWidth;
  const start = Math.max(0, Math.min(itemCount - 1, Math.floor(scrollLeft / Math.max(stride, 1))));
  const visibleCount = Math.max(1, Math.ceil((viewportWidth + gapWidth) / Math.max(stride, 1)));
  const end = Math.max(start, Math.min(itemCount - 1, start + visibleCount - 1));
  return { start, end };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function clampScrollLeft(scrollLeft: number, viewportWidth: number, contentWidth: number) {
  return clamp(scrollLeft, 0, Math.max(0, contentWidth - viewportWidth));
}

export function classifyWheelIntent(deltaX: number, deltaY: number) {
  return Math.abs(deltaY) > Math.abs(deltaX) ? 'zoom' : 'pan';
}

export function deriveAnchoredZoomScrollLeft({
  contentWidth,
  hoveredPointerX,
  intervalCount,
  nextSlotWidth,
  previousScrollLeft,
  previousSlotWidth,
  viewportWidth,
}: {
  contentWidth: number;
  hoveredPointerX: number;
  intervalCount: number;
  nextSlotWidth: number;
  previousScrollLeft: number;
  previousSlotWidth: number;
  viewportWidth: number;
}) {
  if (intervalCount <= 0 || previousSlotWidth <= 0 || nextSlotWidth <= 0) {
    return 0;
  }
  const hoveredContentX = previousScrollLeft + hoveredPointerX;
  const hoveredIndex = clamp(Math.floor(hoveredContentX / previousSlotWidth), 0, intervalCount - 1);
  const anchoredCenterX = hoveredIndex * nextSlotWidth + nextSlotWidth / 2;
  return clampScrollLeft(anchoredCenterX - hoveredPointerX, viewportWidth, contentWidth);
}

function ResponsivePillButton({
  active,
  ariaLabel,
  className,
  compactLabel,
  fullLabel,
  slotWidth,
  tooltipLabel,
  width,
  onClick,
}: {
  active: boolean;
  ariaLabel?: string;
  className: string;
  compactLabel: string;
  fullLabel: string;
  slotWidth: number;
  tooltipLabel?: string;
  width?: number;
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
          style={width != null ? { width } : undefined}
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
  canScrollLeft: boolean;
  canScrollRight: boolean;
  intervals: Array<{ intervalIndex: number; startAt: string | null }>;
  language: Parameters<typeof formatSenaDate>[1];
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
          <div className="grid min-w-full pr-1" style={{ gridTemplateColumns: `repeat(${Math.max(intervals.length, 1)}, ${slotWidth}px)` }}>
          {intervals.map((interval) => {
            const tooltipLabel = intervalTooltipLabel(interval.startAt, interval.intervalIndex, language);
            const compactDate = formatSenaCompactIntervalDate(interval.startAt);
            return (
              <div key={interval.intervalIndex} className="flex min-h-10 items-center justify-center px-1">
                <ResponsivePillButton
                  active={activeIndex === interval.intervalIndex}
                  ariaLabel={tooltipLabel}
                  className={`w-full rounded-full border px-2 py-2 text-center text-sm leading-none ${activeIndex === interval.intervalIndex ? 'border-foreground bg-foreground text-background' : 'border-border/70 bg-background text-foreground'}`}
                  compactLabel={compactDate !== '—' ? compactDate : String(interval.intervalIndex + 1)}
                  fullLabel={compactDate !== '—' ? compactDate : `Interval ${interval.intervalIndex + 1}`}
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

function RegimePillLane({
  activeIndex,
  onScroll,
  pillWidth,
  scrollRef,
  intervals,
  onSelect,
}: {
  activeIndex: number | null;
  onScroll: (event: UIEvent<HTMLDivElement>) => void;
  pillWidth: number;
  scrollRef: RefObject<HTMLDivElement | null>;
  intervals: SenaSkuDetailViewModel['lanes']['regimePriceLane']['intervals'];
  onSelect: (index: number) => void;
}) {
  return (
    <div ref={scrollRef} className="hidden-scrollbar overflow-x-auto overscroll-contain rounded-md px-1" onScroll={onScroll}>
      <div className="grid rounded-md bg-muted/35 pr-1" style={{ gridTemplateColumns: `repeat(${Math.max(intervals.length, 1)}, ${pillWidth}px)` }}>
        {intervals.map((interval, intervalPosition) => (
          <div key={interval.intervalIndex} className={`${intervalPosition < intervals.length - 1 ? 'border-r border-background/40' : ''} flex items-center justify-center px-1`}>
            <ResponsivePillButton
              active={activeIndex === interval.intervalIndex}
              className={`min-h-8 w-full px-2 text-center text-xs ${activeIndex === interval.intervalIndex ? 'bg-foreground/80 text-background' : 'bg-secondary/45 text-foreground'}`}
              compactLabel={regimeCompactLabel(interval.dominantRegime)}
              fullLabel={interval.dominantRegime}
              slotWidth={pillWidth - 8}
              onClick={() => onSelect(interval.intervalIndex)}
            />
          </div>
        ))}
      </div>
    </div>
  );
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
  const regimeScrollRef = useRef<HTMLDivElement | null>(null);
  const priceScrollRef = useRef<HTMLDivElement | null>(null);
  const inventoryScrollRef = useRef<HTMLDivElement | null>(null);
  const flowScrollRef = useRef<HTMLDivElement | null>(null);
  const pipelineScrollRef = useRef<HTMLDivElement | null>(null);
  const intervals = intervalEntries(model);
  const indices = intervals.map((entry) => entry.intervalIndex);
  const syncRefs = [intervalScrollRef, regimeScrollRef, priceScrollRef, inventoryScrollRef, flowScrollRef, pipelineScrollRef];
  const syncingScrollRef = useRef(false);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [slotWidthPx, setSlotWidthPx] = useState(DEFAULT_SLOT_WIDTH);
  const effectiveSlotWidth = clamp(slotWidthPx, Math.max(SHARED_PILL_MIN_WIDTH, MIN_SLOT_WIDTH), MAX_SLOT_WIDTH);
  const contentWidth = Math.max(indices.length * effectiveSlotWidth, 0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const clampedScrollLeft = clampScrollLeft(scrollLeft, viewportWidth, contentWidth);
  const visibleWindow = deriveVisibleWindow(indices.length, clampedScrollLeft, viewportWidth, effectiveSlotWidth, INTERVAL_PILL_GAP);
  const canScrollLeft = clampedScrollLeft > SCROLL_EDGE_TOLERANCE;
  const canScrollRight = clampedScrollLeft + viewportWidth < contentWidth - SCROLL_EDGE_TOLERANCE;
  const inventoryValues = model.lanes.inventoryLane.points.map((point) => point.mean);
  const inventoryPolyline = buildPolyline(inventoryValues, effectiveSlotWidth, 42);
  const inventoryCoordinates = buildPointCoordinates(inventoryValues, effectiveSlotWidth, 42);
  const priceValues =
    model.lanes.regimePriceLane.priceMarkers.length > 0
      ? model.lanes.regimePriceLane.priceMarkers.map((marker) => marker.price)
      : [0];
  const pricePolyline = buildPolyline(priceValues, effectiveSlotWidth, 42, { topPadding: 6, bottomPadding: 6 });
  const priceCoordinates = buildPointCoordinates(priceValues, effectiveSlotWidth, 42, { topPadding: 6, bottomPadding: 6 });
  const selectedPointIndex =
    selectedIntervalIndex != null ? Math.max(0, indices.indexOf(selectedIntervalIndex)) : null;

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
        current + direction * Math.max(viewportWidth - effectiveSlotWidth - INTERVAL_PILL_GAP, effectiveSlotWidth),
        viewportWidth,
        contentWidth,
      ),
    );
  };

  const handleLaneWheel =
    (scrollRef: RefObject<HTMLDivElement | null>) =>
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
        const nextContentWidth = indices.length * nextWidth;
        setScrollLeft((currentScrollLeft) =>
          deriveAnchoredZoomScrollLeft({
            contentWidth: nextContentWidth,
            hoveredPointerX: pointerX,
            intervalCount: indices.length,
            nextSlotWidth: nextWidth,
            previousScrollLeft: currentScrollLeft,
            previousSlotWidth: currentWidth,
            viewportWidth,
          }),
        );
        return nextWidth;
      });
    };

  return (
    <section className="min-w-0 overflow-hidden rounded-[2rem] border border-border/70 bg-background/90 px-6 py-5 shadow-sm">
      <div className="flex flex-col gap-2 border-b border-border/60 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Ledger</p>
          <div className="mt-1">
            <SectionTitle title={t('catalogSenaSkuLedgerTitle')} tooltip={t('catalogSenaSkuLedgerTooltip')} />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{model.selectedInterval.label}</p>
      </div>

      <IntervalStrip
        activeIndex={selectedIntervalIndex}
        canScrollLeft={canScrollLeft}
        canScrollRight={canScrollRight}
        intervals={intervals}
        language={language}
        onSelect={setSelectedIntervalIndex}
        onScroll={handleScrollerScroll}
        scrollByViewport={scrollByViewport}
        scrollRef={intervalScrollRef}
        slotWidth={effectiveSlotWidth}
      />

      <div className="mt-5">
        <div className="pb-5">
          <LaneTitle
            title={t('catalogSenaSkuRegimePriceLane')}
            subtitle={model.lanes.regimePriceLane.currentPriceLabel}
            tooltip={t('catalogSenaSkuRegimePriceLaneTooltip')}
          />
          <div className="grid gap-3">
            <TooltipProvider>
              <RegimePillLane
                activeIndex={selectedIntervalIndex}
                intervals={model.lanes.regimePriceLane.intervals}
                onSelect={setSelectedIntervalIndex}
                onScroll={handleScrollerScroll}
                pillWidth={effectiveSlotWidth}
                scrollRef={regimeScrollRef}
              />
            </TooltipProvider>
            <div ref={priceScrollRef} className="hidden-scrollbar overflow-x-auto overscroll-contain pt-8" onScroll={handleScrollerScroll} onWheel={handleLaneWheel(priceScrollRef)}>
              <div className="relative h-32 overflow-visible px-2 pt-2" style={{ width: contentWidth + 16 }}>
                <svg
                  aria-hidden="true"
                  className="h-full w-full"
                  preserveAspectRatio="none"
                  viewBox={`0 0 ${Math.max(contentWidth + 16, 1)} 42`}
                >
                  <polyline fill="none" points={pricePolyline} stroke="currentColor" strokeWidth="1.4" className="text-foreground/70" transform="translate(8 0)" />
                </svg>
                {priceCoordinates.map((point, index) => {
                  const marker = model.lanes.regimePriceLane.priceMarkers[index];
                  const isSelected = selectedPointIndex === index;
                return (
                  <button
                    key={marker?.observedAt ?? `price-${index}`}
                      aria-label={marker ? `Price ${marker.price}` : `Price point ${index + 1}`}
                      className="absolute -translate-x-1/2 -translate-y-1/2"
                    style={{ left: point.x + 8, top: (point.y / 42) * 120 + 8 }}
                    type="button"
                    onClick={() => setSelectedIntervalIndex(indices[index] ?? index)}
                  >
                      {isSelected ? (
                        <span className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-border/70 bg-background px-2 py-0.5 text-[10px] font-medium text-foreground shadow-sm">
                          {marker ? `$${marker.price}` : ''}
                        </span>
                      ) : null}
                      <span className={`block size-4 rounded-full border-2 ${isSelected ? 'border-foreground bg-foreground' : 'border-foreground/55 bg-background'}`} />
                  </button>
                );
              })}
              </div>
            </div>
            <p className="text-sm text-muted-foreground">{model.lanes.regimePriceLane.summary}</p>
          </div>
        </div>

        <div className="border-t border-border/60 py-5">
          <LaneTitle title={t('catalogSenaSkuInventoryLane')} tooltip={t('catalogSenaSkuInventoryLaneTooltip')} />
          <div className="mb-3 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-block h-px w-8 opacity-70"
                style={{
                  backgroundImage: 'repeating-linear-gradient(to right, currentColor 0 2px, transparent 2px 4px)',
                }}
              />
              {t('catalogSenaSkuReorderPoint')}: {model.lanes.inventoryLane.reorderPointLabel}
            </span>
            <span className="inline-flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-block h-px w-8 opacity-50"
                style={{
                  backgroundImage: 'repeating-linear-gradient(to right, currentColor 0 4px, transparent 4px 7px)',
                }}
              />
              {t('catalogSenaSkuSafetyStock')}: {model.lanes.inventoryLane.safetyStockLabel}
            </span>
          </div>
          <div ref={inventoryScrollRef} className="hidden-scrollbar overflow-x-auto overscroll-contain rounded-md bg-muted/25 px-2 py-3" onScroll={handleScrollerScroll} onWheel={handleLaneWheel(inventoryScrollRef)}>
            <div className="relative h-32 overflow-visible px-2 pt-2" style={{ width: contentWidth + 16 }}>
              <svg
                aria-hidden="true"
                className="h-full w-full"
                preserveAspectRatio="none"
                viewBox={`0 0 ${Math.max(contentWidth + 16, 1)} 42`}
              >
                <path d={`M8 10 H${Math.max(contentWidth + 8, 1)}`} strokeDasharray="2 2" stroke="currentColor" strokeWidth="0.6" className="text-muted-foreground/70" />
                <path d={`M8 24 H${Math.max(contentWidth + 8, 1)}`} strokeDasharray="4 3" stroke="currentColor" strokeWidth="0.6" className="text-muted-foreground/50" />
                <polyline fill="none" points={inventoryPolyline} stroke="currentColor" strokeWidth="1.8" className="text-foreground" transform="translate(8 0)" />
              </svg>
              {inventoryCoordinates.map((point, index) => {
                const isSelected = selectedPointIndex === index;
                const detailPoint = model.lanes.inventoryLane.points[index];
                return (
                  <button
                    key={detailPoint?.at ?? `inventory-${index}`}
                    aria-label={detailPoint ? `Inventory ${Math.round(detailPoint.mean)} units` : `Inventory point ${index + 1}`}
                    className="absolute -translate-x-1/2 -translate-y-1/2"
                    style={{ left: point.x + 8, top: (point.y / 42) * 120 + 8 }}
                    type="button"
                    onClick={() => setSelectedIntervalIndex(indices[index] ?? index)}
                  >
                    {isSelected ? (
                      <span className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-border/70 bg-background px-2 py-0.5 text-[10px] font-medium text-foreground shadow-sm">
                        {Math.round(detailPoint?.mean ?? point.value)}u
                      </span>
                    ) : null}
                    <span className={`block size-4 rounded-full border-2 ${isSelected ? 'border-foreground bg-foreground' : 'border-foreground/55 bg-background'}`} />
                  </button>
                );
              })}
            </div>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">{model.lanes.inventoryLane.summary}</p>
        </div>

        <div className="border-t border-border/60 py-5">
          <LaneTitle title={t('catalogSenaSkuFlowLane')} tooltip={t('catalogSenaSkuFlowLaneTooltip')} />
          <div ref={flowScrollRef} className="hidden-scrollbar overflow-x-auto overscroll-contain" onScroll={handleScrollerScroll} onWheel={handleLaneWheel(flowScrollRef)}>
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
            <div
              className="grid items-end gap-1 rounded-md bg-muted/20 px-2 py-3"
              style={{ gridTemplateColumns: `repeat(${Math.max(model.lanes.flowLane.intervals.length, 1)}, ${effectiveSlotWidth}px)` }}
            >
              {model.lanes.flowLane.intervals.map((interval) => (
                <button
                  key={interval.intervalIndex}
                  className="flex flex-col items-center gap-1"
                  type="button"
                  onClick={() => setSelectedIntervalIndex(interval.intervalIndex)}
                >
                  {selectedIntervalIndex === interval.intervalIndex ? (
                    <div className="mb-1 flex flex-col items-center gap-1 rounded-md border border-border/60 bg-background/95 px-2 py-1 text-[10px] shadow-sm">
                      <span className="whitespace-nowrap text-foreground">
                        Service {Math.round(interval.serviceDemandMean)}
                      </span>
                      <span className="whitespace-nowrap text-foreground">
                        Retail {Math.round(interval.retailDemandMean)}
                      </span>
                      <span className="whitespace-nowrap text-foreground">
                        Receipts {Math.round(interval.receiptsMean)}
                      </span>
                    </div>
                  ) : null}
                  <span className="w-full rounded-sm bg-foreground/20" style={{ height: `${Math.max(6, interval.serviceDemandMean * 9)}px` }} />
                  <span className="w-full rounded-sm bg-foreground/45" style={{ height: `${Math.max(5, interval.retailDemandMean * 9)}px` }} />
                  <span className="w-full rounded-sm bg-secondary" style={{ height: `${Math.max(4, interval.receiptsMean * 9)}px` }} />
                </button>
              ))}
            </div>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">{model.lanes.flowLane.summary}</p>
        </div>

        <div className="border-t border-border/60 pt-5">
          <LaneTitle title={t('catalogSenaSkuPipelineLane')} tooltip={t('catalogSenaSkuPipelineLaneTooltip')} />
          <div ref={pipelineScrollRef} className="hidden-scrollbar overflow-x-auto overscroll-contain" onScroll={handleScrollerScroll} onWheel={handleLaneWheel(pipelineScrollRef)}>
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${Math.max(model.lanes.pipelineLane.intervals.length, 1)}, ${effectiveSlotWidth}px)` }}
            >
              {model.lanes.pipelineLane.intervals.map((interval) => (
                <button
                  key={interval.intervalIndex}
                  className={`grid gap-2 rounded-md px-2 py-2 text-left ${selectedIntervalIndex === interval.intervalIndex ? 'bg-muted/35' : 'bg-transparent'}`}
                  type="button"
                  onClick={() => setSelectedIntervalIndex(interval.intervalIndex)}
                >
                  {selectedIntervalIndex === interval.intervalIndex ? (
                    <span className="text-[10px] font-medium text-foreground">{`${Math.round(interval.inTransitMean)}u`}</span>
                  ) : null}
                  <div className="relative h-3 rounded-full bg-muted/35">
                    <div className="absolute inset-y-0 left-0 rounded-full bg-secondary" style={{ width: `${Math.min(100, Math.max(6, interval.inTransitMean * 10))}%` }} />
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {Math.round(interval.inTransitMean)} in transit
                  </span>
                </button>
              ))}
            </div>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">{model.lanes.pipelineLane.summary}</p>
        </div>
      </div>
    </section>
  );
}
