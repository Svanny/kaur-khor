import { StatusTimingIcon } from '@icons/status';
import { NavigationNextIcon, NavigationPreviousIcon } from '@icons/navigation';
import type { RefObject, UIEvent } from 'react';
import { getTranslation } from '@/lib/translations';
import { formatSenaCompactIntervalDate, formatSenaCompactIntervalDay, formatSenaDate, formatSenaLongDateTime24, formatSenaWideIntervalDate, formatSenaWideIntervalDateLocalized } from '@/routes/sku-detail/format';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export const SHARED_PILL_MIN_WIDTH = 48;
export const DEFAULT_SLOT_WIDTH = 72;
export const MIN_SLOT_WIDTH = 4;
export const MAX_SLOT_WIDTH = 120;
export const INTERVAL_PILL_GAP = 0;
export const SCROLL_EDGE_TOLERANCE = 6;
export const AXIS_START_PADDING = 20;
export const AXIS_END_PADDING = 36;
export const INTERVAL_VISIBLE_COUNT = 10;
export const INTERVAL_PAGE_SIZE = 20;
export const INTERVAL_LOAD_BATCH_SIZE = 10;
export const LOAD_OLDER_SCROLL_THRESHOLD_PX = 24;
export const PINCH_ZOOM_SENSITIVITY = 0.16;

export interface IntervalChartWheelEvent {
  clientX: number;
  ctrlKey: boolean;
  currentTarget: HTMLDivElement;
  deltaX: number;
  deltaY: number;
  metaKey: boolean;
  preventDefault: () => void;
}

export interface IntervalStripEntry {
  intervalIndex: number;
  startAt: string | null;
  endAt: string | null;
}

export type IntervalPillLabelMode = 'full' | 'compact' | 'hidden';

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

export function deriveInitialViewportSlotWidth({
  itemCount,
  viewportWidth,
  visibleCount = INTERVAL_VISIBLE_COUNT,
  minSlotWidth = MIN_SLOT_WIDTH,
  axisStartPadding = AXIS_START_PADDING,
  axisEndPadding = AXIS_END_PADDING,
}: {
  itemCount: number;
  viewportWidth: number;
  visibleCount?: number;
  minSlotWidth?: number;
  axisStartPadding?: number;
  axisEndPadding?: number;
}) {
  if (itemCount <= 0 || viewportWidth <= 0) {
    return DEFAULT_SLOT_WIDTH;
  }
  const targetVisibleCount = Math.max(1, Math.min(itemCount, visibleCount));
  const availableWidth = Math.max(0, viewportWidth - axisStartPadding - axisEndPadding);
  return Math.max(minSlotWidth, availableWidth / targetVisibleCount);
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

export function deriveUniformPillLabelMode(
  labels: Array<{ fullLabel: string; compactLabel: string }>,
  slotWidth: number,
) {
  const requiredWidth = (label: string) => label.length * 9 + 20;
  const maxFullWidth = labels.reduce((max, entry) => Math.max(max, requiredWidth(entry.fullLabel)), 0);
  if (slotWidth >= maxFullWidth) {
    return 'full' satisfies IntervalPillLabelMode;
  }
  const maxCompactWidth = labels.reduce((max, entry) => Math.max(max, requiredWidth(entry.compactLabel)), 0);
  if (slotWidth >= maxCompactWidth) {
    return 'compact' satisfies IntervalPillLabelMode;
  }
  return 'hidden' satisfies IntervalPillLabelMode;
}

export function responsivePillLabelForMode(
  fullLabel: string,
  compactLabel: string,
  mode: IntervalPillLabelMode,
) {
  if (mode === 'full') {
    return fullLabel;
  }
  if (mode === 'compact') {
    return compactLabel;
  }
  return '';
}

export function intervalLabelForWidth(
  endAt: string | null,
  intervalIndex: number,
  slotWidth: number,
  language: Parameters<typeof formatSenaDate>[1] = 'en',
) {
  const compactDate = formatSenaCompactIntervalDate(endAt, language);
  const wideDate =
    language === 'en' ? formatSenaWideIntervalDate(endAt) : formatSenaWideIntervalDateLocalized(endAt, language);
  if (compactDate !== '—') {
    const compactDay = formatSenaCompactIntervalDay(endAt, language);
    return responsivePillLabel(fullLabelOrWide(wideDate, compactDate, slotWidth), compactDate, slotWidth) ||
      responsivePillLabel(compactDate, compactDay !== '—' ? compactDay : compactDate, slotWidth);
  }
  return responsivePillLabel(
    getTranslation(language, 'intervalLabel', { index: intervalIndex + 1 }),
    String(intervalIndex + 1),
    slotWidth,
  );
}

function fullLabelOrWide(wideDate: string, compactDate: string, slotWidth: number) {
  return slotWidth >= 132 && wideDate !== '—' ? wideDate : compactDate;
}

export function intervalTooltipLabel(
  endAt: string | null,
  intervalIndex: number,
  language: Parameters<typeof formatSenaDate>[1],
) {
  const fullDate = formatSenaLongDateTime24(endAt, language);
  if (fullDate !== '—') {
    return fullDate;
  }
  return getTranslation(language, 'intervalLabel', { index: intervalIndex + 1 });
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

export function deriveVisibleIntervalCount(
  viewportWidth: number,
  slotWidth: number,
  gapWidth = INTERVAL_PILL_GAP,
) {
  if (viewportWidth <= 0 || slotWidth <= 0) {
    return 0;
  }
  const stride = slotWidth + gapWidth;
  return Math.max(1, Math.ceil((viewportWidth + gapWidth) / Math.max(stride, 1)));
}

export function deriveSequentialOlderLoadBatchCount({
  batchSize = INTERVAL_LOAD_BATCH_SIZE,
  gapWidth = INTERVAL_PILL_GAP,
  slotWidth,
  viewportWidth,
}: {
  batchSize?: number;
  gapWidth?: number;
  slotWidth: number;
  viewportWidth: number;
}) {
  const visibleIntervalCount = deriveVisibleIntervalCount(viewportWidth, slotWidth, gapWidth);
  const requestedIntervalCount = Math.max(INTERVAL_LOAD_BATCH_SIZE, visibleIntervalCount);
  return Math.max(1, Math.ceil(requestedIntervalCount / Math.max(batchSize, 1)));
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

export function deriveLatestWindowScrollLeft({
  contentWidth,
  itemCount,
  viewportWidth,
  visibleCount = INTERVAL_VISIBLE_COUNT,
}: {
  contentWidth: number;
  itemCount: number;
  viewportWidth: number;
  visibleCount?: number;
}) {
  if (viewportWidth <= 0 || itemCount <= visibleCount) {
    return 0;
  }
  return Math.max(0, contentWidth - viewportWidth);
}

export function deriveFreshMountIntervalScrollLeft({
  contentWidth,
  itemCount,
  viewportWidth,
  visibleCount = INTERVAL_VISIBLE_COUNT,
}: {
  contentWidth: number;
  itemCount: number;
  viewportWidth: number;
  visibleCount?: number;
}) {
  if (viewportWidth <= 0) {
    return null;
  }
  if (itemCount <= visibleCount) {
    return 0;
  }
  return deriveLatestWindowScrollLeft({
    contentWidth,
    itemCount,
    viewportWidth,
    visibleCount,
  });
}

export function isPinchZoomGesture({ ctrlKey, metaKey = false }: { ctrlKey: boolean; metaKey?: boolean }) {
  return ctrlKey || metaKey;
}

export function classifyWheelIntent(
  deltaX: number,
  _deltaY: number,
  options?: { isPinchZoom?: boolean },
) {
  if (options?.isPinchZoom) {
    return 'zoom';
  }
  return Math.abs(deltaX) >= 1 ? 'pan' : 'ignore';
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

export function handleIntervalChartWheel({
  axisEndPadding = AXIS_END_PADDING,
  axisStartPadding = 0,
  contentWidth,
  currentSlotWidth,
  event,
  hasOlder,
  intervalCount,
  isLoadingOlder,
  maxSlotWidth = MAX_SLOT_WIDTH,
  minSlotWidth = MIN_SLOT_WIDTH,
  onLoadOlder,
  onPan,
  onZoom,
  viewportWidth,
}: {
  axisEndPadding?: number;
  axisStartPadding?: number;
  contentWidth: number;
  currentSlotWidth: number;
  event: IntervalChartWheelEvent;
  hasOlder: boolean;
  intervalCount: number;
  isLoadingOlder: boolean;
  maxSlotWidth?: number;
  minSlotWidth?: number;
  onLoadOlder: () => void;
  onPan: (nextScrollLeft: number) => void;
  onZoom: (payload: { nextScrollLeft: number; nextSlotWidth: number }) => void;
  viewportWidth: number;
}) {
  const node = event.currentTarget;
  const intent = classifyWheelIntent(event.deltaX, event.deltaY, {
    isPinchZoom: isPinchZoomGesture({ ctrlKey: event.ctrlKey, metaKey: event.metaKey }),
  });
  if (intent === 'pan') {
    if (event.deltaX < -1 && shouldLoadOlderIntervals({ hasOlder, isLoadingOlder, scrollLeft: node.scrollLeft })) {
      event.preventDefault();
      onLoadOlder();
      return;
    }
    if (Math.abs(event.deltaX) < 1 || contentWidth <= viewportWidth + 1) {
      return;
    }
    event.preventDefault();
    onPan(clampScrollLeft(node.scrollLeft + event.deltaX, viewportWidth, contentWidth));
    return;
  }
  if (intent !== 'zoom' || Math.abs(event.deltaY) < 1 || intervalCount === 0) {
    return;
  }
  event.preventDefault();
  const rect = node.getBoundingClientRect();
  const pointerX = clamp(event.clientX - rect.left, 0, node.clientWidth);
  const nextSlotWidth = clamp(currentSlotWidth - event.deltaY * PINCH_ZOOM_SENSITIVITY, minSlotWidth, maxSlotWidth);
  if (Math.abs(nextSlotWidth - currentSlotWidth) < 0.5) {
    return;
  }
  const nextContentWidth = deriveAxisContentWidth({
    itemCount: intervalCount,
    slotWidth: nextSlotWidth,
    axisStartPadding,
    axisEndPadding,
  });
  onZoom({
    nextScrollLeft: deriveAnchoredZoomScrollLeft({
      contentWidth: nextContentWidth,
      hoveredPointerX: pointerX,
      intervalCount,
      nextSlotWidth,
      previousScrollLeft: node.scrollLeft,
      previousSlotWidth: currentSlotWidth,
      axisStartPadding,
      viewportWidth,
    }),
    nextSlotWidth,
  });
}

function ResponsivePillButton({
  active,
  ariaLabel,
  className,
  compactLabel,
  fullLabel,
  labelMode,
  tooltipLabel,
  width,
  onClick,
}: {
  active: boolean;
  ariaLabel?: string;
  className: string;
  compactLabel: string;
  fullLabel: string;
  labelMode: IntervalPillLabelMode;
  tooltipLabel?: string;
  width?: number;
  onClick: () => void;
}) {
  const visibleLabel = responsivePillLabelForMode(fullLabel, compactLabel, labelMode);
  const accessibleLabel = ariaLabel ?? tooltipLabel ?? fullLabel;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label={accessibleLabel}
          className={className}
          data-active={active ? 'true' : 'false'}
          style={width != null ? { width } : undefined}
          type="button"
          onClick={onClick}
        >
          <StatusTimingIcon data-icon="inline-start" className="mr-1 inline size-3" />
          <span aria-hidden="true" className="block overflow-hidden whitespace-nowrap">
            {visibleLabel}
          </span>
        </button>
      </TooltipTrigger>
      {tooltipLabel ? (
        <TooltipContent
          className="rounded-[1.2rem] border border-[rgba(73,48,33,0.16)] bg-[rgba(51,31,20,0.98)] px-4 py-2 text-sm font-medium text-[rgba(255,248,241,0.98)] shadow-[0_18px_40px_rgba(48,31,20,0.24)]"
          side="top"
          sideOffset={12}
        >
          {tooltipLabel}
        </TooltipContent>
      ) : null}
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
  const t = (key: Parameters<typeof getTranslation>[1], variables?: Parameters<typeof getTranslation>[2]) =>
    getTranslation(language, key, variables);
  const pillLabels = intervals.map((interval) => {
    const compactDate = formatSenaCompactIntervalDate(interval.endAt, language);
    const compactDay = formatSenaCompactIntervalDay(interval.endAt, language);
    return {
      fullLabel:
        compactDate !== '—'
          ? compactDate
          : t('intervalLabel', { index: interval.intervalIndex + 1 }),
      compactLabel: compactDate !== '—' ? compactDay : String(interval.intervalIndex + 1),
    };
  });
  const labelMode = deriveUniformPillLabelMode(pillLabels, slotWidth - 8);
  return (
    <TooltipProvider delayDuration={0}>
      <div className="relative mt-4 min-h-12">
        {canScrollLeft ? (
          <button
            aria-label={t('scrollIntervalsLeft')}
            className="absolute left-0 top-1/2 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-border/70 bg-background/95 text-foreground shadow-sm"
            type="button"
            onClick={() => scrollByViewport(-1)}
          >
            <NavigationPreviousIcon className="size-4" />
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
              const compactDate = formatSenaCompactIntervalDate(interval.endAt, language);
              const compactDay = formatSenaCompactIntervalDay(interval.endAt, language);
              return (
                <div key={interval.intervalIndex} className="flex min-h-10 items-center justify-center px-1">
                  <ResponsivePillButton
                    active={activeIndex === interval.intervalIndex}
                    ariaLabel={tooltipLabel}
                    className={`w-full rounded-full border px-2 py-2 text-center text-sm leading-none ${activeIndex === interval.intervalIndex ? 'border-foreground bg-foreground text-background' : 'border-border/70 bg-background text-foreground'}`}
                    compactLabel={compactDate !== '—' ? compactDay : String(interval.intervalIndex + 1)}
                    fullLabel={
                      compactDate !== '—'
                        ? compactDate
                        : t('intervalLabel', { index: interval.intervalIndex + 1 })
                    }
                    labelMode={labelMode}
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
            aria-label={t('scrollIntervalsRight')}
            className="absolute right-0 top-1/2 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-border/70 bg-background/95 text-foreground shadow-sm"
            type="button"
            onClick={() => scrollByViewport(1)}
          >
            <NavigationNextIcon className="size-4" />
          </button>
        ) : null}
      </div>
    </TooltipProvider>
  );
}
