import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { RefObject, UIEvent } from 'react';
import { useDescriptionTextVisible } from '@/components/system/description-text';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatSenaCompactIntervalDate, formatSenaCompactIntervalDay, formatSenaDate, formatSenaWideIntervalDate } from '@/routes/sku-detail/format';

export const SHARED_PILL_MIN_WIDTH = 48;
export const DEFAULT_SLOT_WIDTH = 72;
export const MIN_SLOT_WIDTH = 40;
export const MAX_SLOT_WIDTH = 120;
export const INTERVAL_PILL_GAP = 0;
export const SCROLL_EDGE_TOLERANCE = 6;
export const AXIS_START_PADDING = 20;
export const AXIS_END_PADDING = 36;
export const INTERVAL_PAGE_SIZE = 10;
export const LOAD_OLDER_SCROLL_THRESHOLD_PX = 24;

export interface IntervalStripEntry {
  intervalIndex: number;
  startAt: string | null;
  endAt: string | null;
}

export function deriveAxisContentWidth({
  itemCount,
  slotWidth,
  axisStartPadding = AXIS_START_PADDING,
  axisEndPadding = AXIS_END_PADDING,
}: {
  itemCount: number;
  slotWidth: number;
  axisStartPadding?: number;
  axisEndPadding?: number;
}) {
  return Math.max(axisStartPadding + itemCount * slotWidth + axisEndPadding, 0);
}

export function deriveSlotLeftX({
  index,
  slotWidth,
  axisStartPadding = AXIS_START_PADDING,
}: {
  index: number;
  slotWidth: number;
  axisStartPadding?: number;
}) {
  return axisStartPadding + index * slotWidth;
}

export function deriveSlotCenterX({
  index,
  slotWidth,
  axisStartPadding = AXIS_START_PADDING,
}: {
  index: number;
  slotWidth: number;
  axisStartPadding?: number;
}) {
  return deriveSlotLeftX({ index, slotWidth, axisStartPadding }) + slotWidth / 2;
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

export function intervalLabelForWidth(endAt: string | null, intervalIndex: number, slotWidth: number) {
  const compactDate = formatSenaCompactIntervalDate(endAt);
  const wideDate = formatSenaWideIntervalDate(endAt);
  if (compactDate !== '—') {
    const compactDay = formatSenaCompactIntervalDay(endAt);
    return responsivePillLabel(fullLabelOrWide(wideDate, compactDate, slotWidth), compactDate, slotWidth) ||
      responsivePillLabel(compactDate, compactDay !== '—' ? compactDay : compactDate, slotWidth);
  }
  return responsivePillLabel(`Interval ${intervalIndex + 1}`, String(intervalIndex + 1), slotWidth);
}

function fullLabelOrWide(wideDate: string, compactDate: string, slotWidth: number) {
  return slotWidth >= 132 && wideDate !== '—' ? wideDate : compactDate;
}

export function intervalTooltipLabel(
  endAt: string | null,
  intervalIndex: number,
  language: Parameters<typeof formatSenaDate>[1],
) {
  const fullDate = formatSenaDate(endAt, language);
  if (fullDate !== '—') {
    return fullDate;
  }
  return `Interval ${intervalIndex + 1}`;
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

export function shouldLoadOlderIntervals({
  hasOlder,
  isLoadingOlder,
  scrollLeft,
  thresholdPx = LOAD_OLDER_SCROLL_THRESHOLD_PX,
}: {
  hasOlder: boolean;
  isLoadingOlder: boolean;
  scrollLeft: number;
  thresholdPx?: number;
}) {
  return hasOlder && !isLoadingOlder && scrollLeft <= thresholdPx;
}

export function derivePrependedScrollLeft({
  currentScrollLeft,
  prependedCount,
  slotWidth,
  gapWidth = INTERVAL_PILL_GAP,
}: {
  currentScrollLeft: number;
  prependedCount: number;
  slotWidth: number;
  gapWidth?: number;
}) {
  return currentScrollLeft + prependedCount * (slotWidth + gapWidth);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function clampScrollLeft(scrollLeft: number, viewportWidth: number, contentWidth: number) {
  return clamp(scrollLeft, 0, Math.max(0, contentWidth - viewportWidth));
}

export function deriveCenteredIntervalScrollLeft({
  contentWidth,
  intervalIndex,
  axisStartPadding = 0,
  slotWidth,
  viewportWidth,
}: {
  contentWidth: number;
  intervalIndex: number;
  axisStartPadding?: number;
  slotWidth: number;
  viewportWidth: number;
}) {
  const slotCenter = deriveSlotCenterX({ index: intervalIndex, slotWidth, axisStartPadding });
  return clampScrollLeft(slotCenter - viewportWidth / 2, viewportWidth, contentWidth);
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
  axisStartPadding = 0,
  viewportWidth,
}: {
  contentWidth: number;
  hoveredPointerX: number;
  intervalCount: number;
  nextSlotWidth: number;
  previousScrollLeft: number;
  previousSlotWidth: number;
  axisStartPadding?: number;
  viewportWidth: number;
}) {
  if (intervalCount <= 0 || previousSlotWidth <= 0 || nextSlotWidth <= 0) {
    return 0;
  }
  const hoveredContentX = Math.max(0, previousScrollLeft + hoveredPointerX - axisStartPadding);
  const hoveredIndex = clamp(Math.floor(hoveredContentX / previousSlotWidth), 0, intervalCount - 1);
  const anchoredCenterX = deriveSlotCenterX({ index: hoveredIndex, slotWidth: nextSlotWidth, axisStartPadding });
  return clampScrollLeft(anchoredCenterX - hoveredPointerX, viewportWidth, contentWidth);
}

export function deriveViewportPageScrollLeft({
  contentWidth,
  currentScrollLeft,
  direction,
  slotWidth,
  viewportWidth,
  gapWidth = INTERVAL_PILL_GAP,
}: {
  contentWidth: number;
  currentScrollLeft: number;
  direction: -1 | 1;
  slotWidth: number;
  viewportWidth: number;
  gapWidth?: number;
}) {
  return clampScrollLeft(
    currentScrollLeft + direction * Math.max(viewportWidth - slotWidth - gapWidth, slotWidth),
    viewportWidth,
    contentWidth,
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

export function IntervalStrip({
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
  intervals: IntervalStripEntry[];
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
              return (
                <div key={interval.intervalIndex} className="flex min-h-10 items-center justify-center px-1">
                  <ResponsivePillButton
                    active={activeIndex === interval.intervalIndex}
                    ariaLabel={tooltipLabel}
                    className={`w-full rounded-full border px-2 py-2 text-center text-sm leading-none ${activeIndex === interval.intervalIndex ? 'border-foreground bg-foreground text-background' : 'border-border/70 bg-background text-foreground'}`}
                    compactLabel={compactDate !== '—' ? compactDay : String(interval.intervalIndex + 1)}
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
