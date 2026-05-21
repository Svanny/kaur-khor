import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject, type UIEvent } from 'react';
import {
  ActionScanIcon,
  ActionZoomInIcon,
  ActionZoomOutIcon,
} from '@icons/actions';
import { StatusMaximizeIcon, StatusMinimizeIcon, StatusScheduleIcon } from '@icons/status';
import {
  AXIS_END_PADDING,
  AXIS_START_PADDING,
  clampScrollLeft,
  deriveAnchoredZoomScrollLeft,
  deriveAxisContentWidth,
  deriveFreshMountIntervalScrollLeft,
  deriveInitialViewportSlotWidth,
  derivePrependedScrollLeft,
  deriveSequentialOlderLoadBatchCount,
  deriveViewportPageScrollLeft,
  handleIntervalChartWheel,
  INTERVAL_LOAD_BATCH_SIZE,
  type IntervalChartWheelEvent,
  MAX_SLOT_WIDTH,
  MIN_SLOT_WIDTH,
  SCROLL_EDGE_TOLERANCE,
  shouldLoadOlderIntervals,
} from '@/components/system/interval-strip';
import { FloatingActionsIsland, useFloatingTitleActions, useObservedFloatingIslandWidth } from '@/components/system/floating-title-actions';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { translateChartTimeframeLabel } from '@/lib/localization/localized-display';
import { translateUiLiteral } from '@/lib/localization/translations';
import { cn } from '@/lib/utils';
import { usePreferences } from '@/state/preferences';
import { CHART_TIMEFRAME_OPTIONS, type ChartTimeframe } from '@/components/system/chart-timeframe';

const FLOATING_ISLAND_BASE_RIGHT = 24;
const FLOATING_ISLAND_GAP = 16;
export const CHART_MANUAL_ZOOM_STEP = 12;

type OlderLoadProgress = { current: number; total: number } | null;

export function LaneExpandButton({
  expanded,
  title,
  onClick,
}: {
  expanded: boolean;
  title: string;
  onClick: () => void;
}) {
  const { language } = usePreferences();
  const buttonLabel = translateUiLiteral(language, expanded ? 'Minimize' : 'Expand');
  return (
    <Button
      aria-label={translateUiLiteral(language, `${expanded ? 'Minimize' : 'Expand'} {title}`, { title })}
      className="rounded-full px-4"
      size="sm"
      type="button"
      variant="outline"
      onClick={onClick}
    >
      {expanded ? <StatusMinimizeIcon className="size-3.5" /> : <StatusMaximizeIcon className="size-3.5" />}
      {buttonLabel}
    </Button>
  );
}

function ChartZoomIsland({
  className,
  disabled,
  onReset,
  onZoomIn,
  onZoomOut,
}: {
  className?: string;
  disabled?: boolean;
  onReset: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}) {
  const { language } = usePreferences();
  const buttonClassName =
    'inline-flex size-9 items-center justify-center rounded-full text-foreground transition hover:bg-white/70 disabled:pointer-events-none disabled:opacity-45';
  return (
    <div className={cn('inline-flex h-[48px] items-center gap-1 rounded-full border border-border/70 bg-background/95 p-1 shadow-[0_12px_28px_rgba(48,31,20,0.09)] backdrop-blur', className)}>
      <button aria-label={translateUiLiteral(language, 'Zoom out chart')} className={buttonClassName} disabled={disabled} type="button" onClick={onZoomOut}>
        <ActionZoomOutIcon className="size-4" />
      </button>
      <button aria-label={translateUiLiteral(language, 'Reset chart zoom')} className={buttonClassName} disabled={disabled} type="button" onClick={onReset}>
        <ActionScanIcon className="size-4" />
      </button>
      <button aria-label={translateUiLiteral(language, 'Zoom in chart')} className={buttonClassName} disabled={disabled} type="button" onClick={onZoomIn}>
        <ActionZoomInIcon className="size-4" />
      </button>
    </div>
  );
}

function TimeframeIsland({
  disabled,
  onValueChange,
  value,
}: {
  disabled?: boolean;
  onValueChange: (value: ChartTimeframe) => void;
  value: ChartTimeframe;
}) {
  const { language } = usePreferences();
  return (
    <Select disabled={disabled} value={value} onValueChange={(nextValue) => onValueChange(nextValue as ChartTimeframe)}>
      <SelectTrigger
        aria-label={translateUiLiteral(language, 'Select chart timeframe')}
        className="h-[48px] min-h-[48px] rounded-full border border-border/70 bg-background/95 px-4 py-0 text-sm font-medium leading-none shadow-[0_12px_28px_rgba(48,31,20,0.09)] backdrop-blur data-[size=default]:h-[48px] [&_svg]:text-foreground [&_svg]:opacity-100"
      >
        <span className="inline-flex items-center gap-2 text-foreground">
          <StatusScheduleIcon className="size-4" />
          <span>{translateUiLiteral(language, 'Timeframe: {value}', { value: translateChartTimeframeLabel(language, value) })}</span>
        </span>
      </SelectTrigger>
      <SelectContent position="popper">
        {CHART_TIMEFRAME_OPTIONS.map((option) => (
          <SelectItem key={option} value={option}>
            {translateChartTimeframeLabel(language, option)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function useChartWorkspaceControls({
  disabled,
  onReset,
  onTimeframeChange,
  onZoomIn,
  onZoomOut,
  timeframe,
}: {
  disabled?: boolean;
  onReset: () => void;
  onTimeframeChange?: (value: ChartTimeframe) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  timeframe?: ChartTimeframe;
}) {
  const { showFloatingTitleActions } = usePreferences();
  const { anchorRef, visible } = useFloatingTitleActions(showFloatingTitleActions);
  const adjacentFloatingIslandWidth = useObservedFloatingIslandWidth({
    enabled: showFloatingTitleActions && visible,
    selector: '[data-slot="floating-title-actions"]',
  });
  const floatingTimeframeIslandWidth = useObservedFloatingIslandWidth({
    enabled: showFloatingTitleActions && visible,
    selector: '[data-slot="floating-timeframe-actions"]',
  });
  const floatingTimeframeIslandRightOffset = adjacentFloatingIslandWidth > 0
    ? FLOATING_ISLAND_BASE_RIGHT + adjacentFloatingIslandWidth + FLOATING_ISLAND_GAP
    : FLOATING_ISLAND_BASE_RIGHT;
  const floatingChartIslandRightOffset =
    floatingTimeframeIslandWidth > 0
      ? floatingTimeframeIslandRightOffset + floatingTimeframeIslandWidth + FLOATING_ISLAND_GAP
      : floatingTimeframeIslandRightOffset + FLOATING_ISLAND_GAP + 220;

  const chartControls = useMemo(
    () => (
      <ChartZoomIsland
        disabled={disabled}
        onReset={onReset}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
      />
    ),
    [disabled, onReset, onZoomIn, onZoomOut],
  );
  const timeframeControls = useMemo(
    () =>
      timeframe && onTimeframeChange ? (
        <TimeframeIsland
          disabled={disabled}
          value={timeframe}
          onValueChange={onTimeframeChange}
        />
      ) : null,
    [disabled, onTimeframeChange, timeframe],
  );

  return {
    headerActions: (
      <div ref={anchorRef} className="flex items-center gap-3" data-analysis-chart-controls-anchor="true">
        {chartControls}
        {timeframeControls}
      </div>
    ),
    floatingIslands: (
      <>
        {timeframeControls ? (
          <FloatingActionsIsland
            actions={timeframeControls}
            slot="floating-timeframe-actions"
            style={{ right: `${floatingTimeframeIslandRightOffset}px` }}
            visible={showFloatingTitleActions && visible}
          />
        ) : null}
        <FloatingActionsIsland
          actions={chartControls}
          slot="floating-chart-actions"
          style={{ right: `${floatingChartIslandRightOffset}px` }}
          visible={showFloatingTitleActions && visible}
        />
      </>
    ),
  };
}

export function useChartWorkspace<TLoadResult>({
  axisEndPadding = AXIS_END_PADDING,
  axisStartPadding = AXIS_START_PADDING,
  chartZoomResetToken = 0,
  getPrependedCount,
  hasOlderIntervals,
  intervalCount,
  intervalScrollRef,
  isLoadingOlderIntervals,
  latestLoadedIntervalIndex,
  loadOlderIntervals,
  maxSlotWidth = MAX_SLOT_WIDTH,
  minSlotWidth = MIN_SLOT_WIDTH,
  onOlderLoadProgressChange,
  syncRefs,
  targetVisibleIntervalCount,
}: {
  axisEndPadding?: number;
  axisStartPadding?: number;
  chartZoomResetToken?: string | number;
  getPrependedCount: (result: TLoadResult) => number;
  hasOlderIntervals: boolean;
  intervalCount: number;
  intervalScrollRef: RefObject<HTMLDivElement | null>;
  isLoadingOlderIntervals: boolean;
  latestLoadedIntervalIndex: number | null;
  loadOlderIntervals: (limit?: number) => Promise<TLoadResult>;
  maxSlotWidth?: number;
  minSlotWidth?: number;
  onOlderLoadProgressChange?: (progress: OlderLoadProgress) => void;
  syncRefs: Array<RefObject<HTMLDivElement | null>>;
  targetVisibleIntervalCount: number;
}) {
  const syncingScrollRef = useRef(false);
  const syncUnlockFrameRef = useRef<number | null>(null);
  const scrollCommitFrameRef = useRef<number | null>(null);
  const initializedLatestWindowRef = useRef(false);
  const latestLoadedIntervalKeyRef = useRef<number | null>(null);
  const loadingOlderRef = useRef(false);
  const pendingScrollLeftRef = useRef<number | null>(null);
  const scrollLeftRef = useRef(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [slotWidthPx, setSlotWidthPx] = useState<number | null>(null);
  const [scrollLeft, setScrollLeft] = useState(0);

  const slotWidth = Math.min(
    maxSlotWidth,
    Math.max(
      minSlotWidth,
      slotWidthPx ?? deriveInitialViewportSlotWidth({
        visibleCount: targetVisibleIntervalCount,
        itemCount: intervalCount,
        viewportWidth,
        axisStartPadding,
        axisEndPadding,
      }),
    ),
  );
  const contentWidth = deriveAxisContentWidth({
    itemCount: intervalCount,
    slotWidth,
    axisStartPadding,
    axisEndPadding,
  });
  const clampedScrollLeft = clampScrollLeft(scrollLeft, viewportWidth, contentWidth);
  const canScrollLeft = clampedScrollLeft > SCROLL_EDGE_TOLERANCE || hasOlderIntervals;
  const canScrollRight = clampedScrollLeft + viewportWidth < contentWidth - SCROLL_EDGE_TOLERANCE;

  const updateScrollSyncLock = useCallback(() => {
    if (syncUnlockFrameRef.current != null) {
      cancelAnimationFrame(syncUnlockFrameRef.current);
    }
    syncUnlockFrameRef.current = requestAnimationFrame(() => {
      syncingScrollRef.current = false;
      syncUnlockFrameRef.current = null;
    });
  }, []);

  const synchronizedNodes = useCallback(() => (
    Array.from(
      new Set(
        [intervalScrollRef.current, ...syncRefs.map((ref) => ref.current)].filter(
          (node): node is HTMLDivElement => node instanceof HTMLDivElement,
        ),
      ),
    )
  ), [intervalScrollRef, syncRefs]);

  const syncScrollNodes = useCallback((nextScrollLeft: number, sourceNode?: HTMLDivElement | null) => {
    syncingScrollRef.current = true;
    for (const node of synchronizedNodes()) {
      if (Math.abs(node.scrollLeft - nextScrollLeft) > 1) {
        node.scrollLeft = nextScrollLeft;
      }
    }
    updateScrollSyncLock();
  }, [synchronizedNodes, updateScrollSyncLock]);

  const commitScrollLeft = useCallback((nextScrollLeft: number, options?: {
    sourceNode?: HTMLDivElement | null;
    syncNodes?: boolean;
  }) => {
    const clampedNextScrollLeft = clampScrollLeft(nextScrollLeft, viewportWidth, contentWidth);
    scrollLeftRef.current = clampedNextScrollLeft;
    pendingScrollLeftRef.current = null;
    if (options?.syncNodes !== false) {
      syncScrollNodes(clampedNextScrollLeft, options?.sourceNode);
    }
    setScrollLeft((current) => (Math.abs(current - clampedNextScrollLeft) > 0.5 ? clampedNextScrollLeft : current));
    return clampedNextScrollLeft;
  }, [contentWidth, syncScrollNodes, viewportWidth]);

  const scheduleScrollLeftCommit = useCallback((nextScrollLeft: number, options?: {
    sourceNode?: HTMLDivElement | null;
  }) => {
    const clampedNextScrollLeft = clampScrollLeft(nextScrollLeft, viewportWidth, contentWidth);
    scrollLeftRef.current = clampedNextScrollLeft;
    pendingScrollLeftRef.current = clampedNextScrollLeft;
    syncScrollNodes(clampedNextScrollLeft, options?.sourceNode);
    if (scrollCommitFrameRef.current != null) {
      return clampedNextScrollLeft;
    }
    scrollCommitFrameRef.current = requestAnimationFrame(() => {
      scrollCommitFrameRef.current = null;
      syncingScrollRef.current = false;
      const pendingScrollLeft = pendingScrollLeftRef.current;
      if (pendingScrollLeft == null) {
        return;
      }
      pendingScrollLeftRef.current = null;
      setScrollLeft((current) => (Math.abs(current - pendingScrollLeft) > 0.5 ? pendingScrollLeft : current));
    });
    return clampedNextScrollLeft;
  }, [contentWidth, syncScrollNodes, viewportWidth]);

  const maybeLoadOlderIntervals = useCallback(async (nextScrollLeft: number) => {
    if (
      loadingOlderRef.current ||
      !shouldLoadOlderIntervals({
        hasOlder: hasOlderIntervals,
        isLoadingOlder: isLoadingOlderIntervals,
        scrollLeft: nextScrollLeft,
      })
    ) {
      return;
    }
    loadingOlderRef.current = true;
    try {
      const sequentialBatchCount = deriveSequentialOlderLoadBatchCount({
        batchSize: INTERVAL_LOAD_BATCH_SIZE,
        slotWidth,
        viewportWidth,
      });
      const loadCount = Math.max(1, sequentialBatchCount);
      let nextAnchoredScrollLeft = nextScrollLeft;
      for (let batchIndex = 0; batchIndex < loadCount; batchIndex += 1) {
        onOlderLoadProgressChange?.({ current: batchIndex + 1, total: loadCount });
        const olderResult = await loadOlderIntervals(INTERVAL_LOAD_BATCH_SIZE);
        const prependedCount = getPrependedCount(olderResult);
        if (prependedCount <= 0) {
          break;
        }
        nextAnchoredScrollLeft = derivePrependedScrollLeft({
          currentScrollLeft: nextAnchoredScrollLeft,
          prependedCount,
          slotWidth,
        });
        commitScrollLeft(nextAnchoredScrollLeft);
      }
    } finally {
      onOlderLoadProgressChange?.(null);
      loadingOlderRef.current = false;
    }
  }, [commitScrollLeft, getPrependedCount, hasOlderIntervals, isLoadingOlderIntervals, loadOlderIntervals, onOlderLoadProgressChange, slotWidth, viewportWidth]);

  useEffect(() => {
    if (latestLoadedIntervalKeyRef.current !== latestLoadedIntervalIndex) {
      latestLoadedIntervalKeyRef.current = latestLoadedIntervalIndex;
      initializedLatestWindowRef.current = false;
    }
  }, [latestLoadedIntervalIndex]);

  useEffect(() => {
    setSlotWidthPx(null);
    initializedLatestWindowRef.current = false;
  }, [chartZoomResetToken]);

  useLayoutEffect(() => {
    const usesFitAllVisibleWindow =
      slotWidthPx == null && targetVisibleIntervalCount >= intervalCount;
    if (initializedLatestWindowRef.current && !usesFitAllVisibleWindow) {
      return;
    }
    const nextScrollLeft = deriveFreshMountIntervalScrollLeft({
      contentWidth,
      itemCount: intervalCount,
      visibleCount: targetVisibleIntervalCount,
      viewportWidth,
    });
    if (nextScrollLeft == null) {
      return;
    }
    if (intervalScrollRef.current) {
      if (typeof intervalScrollRef.current.scrollTo === 'function') {
        intervalScrollRef.current.scrollTo({ left: nextScrollLeft, behavior: 'auto' });
      } else {
        intervalScrollRef.current.scrollLeft = nextScrollLeft;
      }
    }
    commitScrollLeft(nextScrollLeft, { sourceNode: intervalScrollRef.current });
    initializedLatestWindowRef.current = true;
  }, [commitScrollLeft, contentWidth, intervalCount, intervalScrollRef, slotWidthPx, targetVisibleIntervalCount, viewportWidth]);

  useEffect(() => {
    const primaryViewportNode = intervalScrollRef.current ?? syncRefs.find((ref) => ref.current instanceof HTMLDivElement)?.current ?? null;
    if (!(primaryViewportNode instanceof HTMLDivElement)) {
      return;
    }
    const updateViewportWidth = () => {
      const nextViewportWidth = primaryViewportNode.clientWidth;
      setViewportWidth((current) => (current === nextViewportWidth ? current : nextViewportWidth));
    };
    const observer = new ResizeObserver(() => updateViewportWidth());
    observer.observe(primaryViewportNode);
    window.addEventListener('resize', updateViewportWidth);
    updateViewportWidth();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateViewportWidth);
    };
  }, [intervalScrollRef, syncRefs]);

  useEffect(() => {
    const nextScrollLeft = clampScrollLeft(scrollLeftRef.current, viewportWidth, contentWidth);
    if (Math.abs(nextScrollLeft - scrollLeftRef.current) <= 0.5) {
      return;
    }
    commitScrollLeft(nextScrollLeft);
  }, [commitScrollLeft, contentWidth, viewportWidth]);

  useEffect(() => () => {
    if (syncUnlockFrameRef.current != null) {
      cancelAnimationFrame(syncUnlockFrameRef.current);
    }
    if (scrollCommitFrameRef.current != null) {
      cancelAnimationFrame(scrollCommitFrameRef.current);
    }
  }, []);

  useEffect(() => {
    const bindings = syncRefs
      .map((ref) => {
        const node = ref.current;
        if (!node) {
          return null;
        }
        const handleWheel = (event: globalThis.WheelEvent) => {
          handleIntervalChartWheel({
            axisEndPadding,
            axisStartPadding,
            contentWidth,
            currentSlotWidth: slotWidth,
            event: {
              clientX: event.clientX,
              ctrlKey: event.ctrlKey,
              currentTarget: node,
              deltaX: event.deltaX,
              deltaY: event.deltaY,
              metaKey: event.metaKey,
              preventDefault: () => event.preventDefault(),
            } satisfies IntervalChartWheelEvent,
            hasOlder: hasOlderIntervals,
            intervalCount,
            isLoadingOlder: isLoadingOlderIntervals,
            maxSlotWidth,
            minSlotWidth,
            onLoadOlder: () => {
              void maybeLoadOlderIntervals(0);
            },
            onPan: (nextScrollLeft) => {
              scheduleScrollLeftCommit(nextScrollLeft, { sourceNode: node });
            },
            onZoom: ({ nextScrollLeft, nextSlotWidth }) => {
              setSlotWidthPx(nextSlotWidth);
              scheduleScrollLeftCommit(nextScrollLeft, { sourceNode: node });
            },
            viewportWidth,
          });
        };
        node.addEventListener('wheel', handleWheel, { passive: false });
        return { handleWheel, node };
      })
      .filter((binding): binding is { handleWheel: (event: globalThis.WheelEvent) => void; node: HTMLDivElement } => binding != null);

    return () => {
      for (const { handleWheel, node } of bindings) {
        node.removeEventListener('wheel', handleWheel);
      }
    };
  }, [
    axisEndPadding,
    axisStartPadding,
    contentWidth,
    hasOlderIntervals,
    intervalCount,
    isLoadingOlderIntervals,
    maxSlotWidth,
    maybeLoadOlderIntervals,
    minSlotWidth,
    slotWidth,
    syncRefs,
    viewportWidth,
  ]);

  const handleScrollerScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    if (syncingScrollRef.current) {
      return;
    }
    const nextScrollLeft = event.currentTarget.scrollLeft;
    scheduleScrollLeftCommit(nextScrollLeft, { sourceNode: event.currentTarget });
    void maybeLoadOlderIntervals(nextScrollLeft);
  }, [maybeLoadOlderIntervals, scheduleScrollLeftCommit]);

  const scrollByViewport = useCallback((direction: -1 | 1) => {
    if (direction < 0 && clampedScrollLeft <= SCROLL_EDGE_TOLERANCE && hasOlderIntervals) {
      void maybeLoadOlderIntervals(0);
      return;
    }
    commitScrollLeft(deriveViewportPageScrollLeft({
      contentWidth,
      currentScrollLeft: scrollLeftRef.current,
      direction,
      slotWidth,
      viewportWidth,
    }));
  }, [clampedScrollLeft, commitScrollLeft, contentWidth, hasOlderIntervals, maybeLoadOlderIntervals, slotWidth, viewportWidth]);

  const adjustZoom = useCallback((direction: -1 | 1) => {
    if (intervalCount <= 0 || viewportWidth <= 0) {
      return;
    }
    const nextSlotWidth = Math.min(maxSlotWidth, Math.max(minSlotWidth, slotWidth + direction * CHART_MANUAL_ZOOM_STEP));
    if (Math.abs(nextSlotWidth - slotWidth) < 0.5) {
      return;
    }
    const nextContentWidth = deriveAxisContentWidth({
      itemCount: intervalCount,
      slotWidth: nextSlotWidth,
      axisStartPadding,
      axisEndPadding,
    });
    const nextScrollLeft = deriveAnchoredZoomScrollLeft({
      contentWidth: nextContentWidth,
      hoveredPointerX: viewportWidth / 2,
      intervalCount,
      nextSlotWidth,
      previousScrollLeft: clampScrollLeft(scrollLeftRef.current, viewportWidth, contentWidth),
      previousSlotWidth: slotWidth,
      axisStartPadding,
      viewportWidth,
    });
    setSlotWidthPx(nextSlotWidth);
    commitScrollLeft(nextScrollLeft);
  }, [axisEndPadding, axisStartPadding, commitScrollLeft, contentWidth, intervalCount, maxSlotWidth, minSlotWidth, slotWidth, viewportWidth]);

  return {
    canScrollLeft,
    canScrollRight,
    clampedScrollLeft,
    contentWidth,
    handleScrollerScroll,
    scrollByViewport,
    adjustZoom,
    slotWidth,
    viewportWidth,
  };
}
