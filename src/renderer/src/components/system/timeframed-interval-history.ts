import { useCallback, useEffect, useRef, useState } from 'react';
import { INTERVAL_LOAD_BATCH_SIZE, INTERVAL_PAGE_SIZE } from '@/components/system/interval-strip';
import {
  deriveChartTimeframeBoundary,
  deriveEstimatedTimeframeBatchCount,
  isChartTimeframeSatisfied,
  RECENT_TIMEFRAME_MIN_REPORTS,
  shouldPruneTimeframeTransition,
  type ChartTimeframe,
} from '@/components/system/chart-timeframe';
import type { IntervalPageEnvelope } from '@/components/system/interval-history';

export function useTimeframedIntervalHistory<TDetail, TPage extends IntervalPageEnvelope<TDetail>>({
  fetchInitialPage,
  fetchOlderPage,
  getLoadedIntervalCount,
  getOldestIntervalAt,
  initialPage,
  intervalCount,
  latestObservedAt,
  mergeDetails,
  onPruneTransition,
  hydrateTimeframeSequentially = false,
  timeframe,
}: {
  fetchInitialPage: (limit?: number) => Promise<TPage | null>;
  fetchOlderPage: (beforeIntervalIndex: number, limit?: number) => Promise<TPage | null>;
  getLoadedIntervalCount: (page: TPage | null) => number;
  getOldestIntervalAt: (page: TPage | null) => string | null;
  initialPage: TPage | null;
  intervalCount: number;
  latestObservedAt: string | null | undefined;
  mergeDetails: (older: TDetail, newer: TDetail) => TDetail;
  onPruneTransition?: () => Promise<void> | void;
  hydrateTimeframeSequentially?: boolean;
  timeframe: ChartTimeframe;
}) {
  const [page, setPage] = useState<TPage | null>(initialPage);
  const [isHydratingDetails, setIsHydratingDetails] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [timeframeHydrationProgress, setTimeframeHydrationProgress] = useState<{ current: number; total: number } | null>(null);
  const [resolvedTimeframe, setResolvedTimeframe] = useState<ChartTimeframe | null>(
    initialPage ? 'Recent' : null,
  );
  const pageRef = useRef<TPage | null>(initialPage);
  const isLoadingOlderRef = useRef(false);
  const timeframeCacheRef = useRef<Partial<Record<ChartTimeframe, TPage | null>>>({
    Recent: initialPage,
  });
  const previousTimeframeRef = useRef<ChartTimeframe | null>(null);
  const latestInitialKeyRef = useRef<number | null>(initialPage?.latestIntervalIndex ?? null);
  const hydrationRequestIdRef = useRef(0);
  const fetchInitialPageRef = useRef(fetchInitialPage);
  const fetchOlderPageRef = useRef(fetchOlderPage);
  const getLoadedIntervalCountRef = useRef(getLoadedIntervalCount);
  const getOldestIntervalAtRef = useRef(getOldestIntervalAt);
  const mergeDetailsRef = useRef(mergeDetails);
  const onPruneTransitionRef = useRef(onPruneTransition);

  useEffect(() => {
    fetchInitialPageRef.current = fetchInitialPage;
    fetchOlderPageRef.current = fetchOlderPage;
    getLoadedIntervalCountRef.current = getLoadedIntervalCount;
    getOldestIntervalAtRef.current = getOldestIntervalAt;
    mergeDetailsRef.current = mergeDetails;
    onPruneTransitionRef.current = onPruneTransition;
  }, [fetchInitialPage, fetchOlderPage, getLoadedIntervalCount, getOldestIntervalAt, mergeDetails, onPruneTransition]);

  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  useEffect(() => {
    isLoadingOlderRef.current = isLoadingOlder;
  }, [isLoadingOlder]);

  useEffect(() => {
    const nextKey = initialPage?.latestIntervalIndex ?? null;
    if (nextKey !== latestInitialKeyRef.current) {
      latestInitialKeyRef.current = nextKey;
      timeframeCacheRef.current = { Recent: initialPage };
      setPage((current) => (timeframe === 'Recent' ? initialPage : current));
      return;
    }
    if (initialPage && timeframeCacheRef.current.Recent == null) {
      timeframeCacheRef.current.Recent = initialPage;
    }
  }, [initialPage, timeframe]);

  const loadOlderBatch = useCallback(async ({
    currentPage,
    limit,
  }: {
    currentPage: TPage;
    limit: number;
  }) => {
    if (!currentPage.hasOlder || currentPage.nextBeforeIntervalIndex == null) {
      return { page: currentPage, prependedCount: 0 };
    }
    const olderPage = await fetchOlderPageRef.current(currentPage.nextBeforeIntervalIndex, limit);
    if (!olderPage) {
      return {
        page: { ...currentPage, hasOlder: false, nextBeforeIntervalIndex: null } satisfies TPage,
        prependedCount: 0,
      };
    }
    return {
      page: {
        ...olderPage,
        latestIntervalIndex: currentPage.latestIntervalIndex ?? olderPage.latestIntervalIndex,
        detail: mergeDetailsRef.current(olderPage.detail, currentPage.detail),
      } satisfies TPage,
      prependedCount: getLoadedIntervalCountRef.current(olderPage),
    };
  }, []);

  const hydrateTimeframe = useCallback(async (targetTimeframe: ChartTimeframe, requestId: number) => {
    const isCurrentRequest = () => hydrationRequestIdRef.current === requestId;
    let nextPage = targetTimeframe === 'Recent'
      ? timeframeCacheRef.current.Recent ?? initialPage ?? await fetchInitialPageRef.current(RECENT_TIMEFRAME_MIN_REPORTS)
      : await fetchInitialPageRef.current(INTERVAL_PAGE_SIZE);
    if (!isCurrentRequest()) {
      return null;
    }
    timeframeCacheRef.current[targetTimeframe] = nextPage;
    setPage(nextPage);

    if (!nextPage) {
      setTimeframeHydrationProgress(null);
      return nextPage;
    }

    const boundary = deriveChartTimeframeBoundary(latestObservedAt, targetTimeframe);

    if (
      nextPage &&
      !isChartTimeframeSatisfied({
        boundary,
        hasOlder: nextPage.hasOlder,
        loadedIntervalCount: getLoadedIntervalCountRef.current(nextPage),
        oldestIntervalAt: getOldestIntervalAtRef.current(nextPage),
        timeframe: targetTimeframe,
      })
    ) {
      if (hydrateTimeframeSequentially) {
        while (
          nextPage &&
          !isChartTimeframeSatisfied({
            boundary,
            hasOlder: nextPage.hasOlder,
            loadedIntervalCount: getLoadedIntervalCountRef.current(nextPage),
            oldestIntervalAt: getOldestIntervalAtRef.current(nextPage),
            timeframe: targetTimeframe,
          })
        ) {
          const nextBatch = await loadOlderBatch({
            currentPage: nextPage,
            limit: INTERVAL_LOAD_BATCH_SIZE,
          });
          if (!isCurrentRequest()) {
            return null;
          }
          nextPage = nextBatch.page;
          timeframeCacheRef.current[targetTimeframe] = nextPage;
          setPage(nextPage);
          if (nextBatch.prependedCount <= 0) {
            break;
          }
        }
      } else {
        const loadedIntervalCount = getLoadedIntervalCountRef.current(nextPage);
        const estimatedBatchCount = deriveEstimatedTimeframeBatchCount({
          batchSize: INTERVAL_LOAD_BATCH_SIZE,
          boundary,
          intervalCount,
          latestObservedAt,
          loadedIntervalCount,
          oldestLoadedAt: getOldestIntervalAtRef.current(nextPage),
          timeframe: targetTimeframe,
        });
        const requestedBatchCount = Math.max(1, estimatedBatchCount);
        if (requestedBatchCount > 1) {
          setTimeframeHydrationProgress({
            current: 1,
            total: requestedBatchCount,
          });
        }
        const nextBatch = await loadOlderBatch({
          currentPage: nextPage,
          limit: INTERVAL_LOAD_BATCH_SIZE * requestedBatchCount,
        });
        if (!isCurrentRequest()) {
          return null;
        }
        nextPage = nextBatch.page;
        timeframeCacheRef.current[targetTimeframe] = nextPage;
        setPage(nextPage);
      }
    }

    if (!isCurrentRequest()) {
      return null;
    }
    setTimeframeHydrationProgress(null);
    setResolvedTimeframe(targetTimeframe);
    return nextPage;
  }, [hydrateTimeframeSequentially, initialPage, intervalCount, latestObservedAt, loadOlderBatch]);

  useEffect(() => {
    let active = true;

    if (shouldPruneTimeframeTransition({
      latestObservedAt,
      nextTimeframe: timeframe,
      previousTimeframe: previousTimeframeRef.current,
    })) {
      timeframeCacheRef.current = {
        Recent: timeframeCacheRef.current.Recent ?? initialPage,
      };
      setPage(null);
      setTimeframeHydrationProgress(null);
      setResolvedTimeframe(null);
      void onPruneTransitionRef.current?.();
    }

    previousTimeframeRef.current = timeframe;
    const cachedPage = timeframeCacheRef.current[timeframe];
    const cachedBoundary = deriveChartTimeframeBoundary(latestObservedAt, timeframe);
    const cachedPageSatisfiesTimeframe = cachedPage
      ? isChartTimeframeSatisfied({
        boundary: cachedBoundary,
        hasOlder: cachedPage.hasOlder,
        loadedIntervalCount: getLoadedIntervalCountRef.current(cachedPage),
        oldestIntervalAt: getOldestIntervalAtRef.current(cachedPage),
        timeframe,
      })
      : false;
    if (cachedPage && cachedPageSatisfiesTimeframe) {
      setIsHydratingDetails(false);
      setTimeframeHydrationProgress(null);
      setPage(cachedPage);
      setResolvedTimeframe(timeframe);
      return () => {
        active = false;
      };
    }

    setIsHydratingDetails(true);
    const requestId = hydrationRequestIdRef.current + 1;
    hydrationRequestIdRef.current = requestId;
    void hydrateTimeframe(timeframe, requestId).finally(() => {
      if (active) {
        setIsHydratingDetails(false);
      }
    });

    return () => {
      active = false;
    };
  }, [hydrateTimeframe, initialPage, latestObservedAt, timeframe]);

  const loadOlder = useCallback(async (limit = INTERVAL_LOAD_BATCH_SIZE) => {
    const currentPage = pageRef.current;
    if (
      isLoadingOlderRef.current ||
      !currentPage?.hasOlder ||
      currentPage.nextBeforeIntervalIndex == null
    ) {
      return null;
    }
    setIsLoadingOlder(true);
    try {
      const nextBatch = await loadOlderBatch({
        currentPage,
        limit,
      });
      timeframeCacheRef.current[timeframe] = nextBatch.page;
      setPage(nextBatch.page);
      return nextBatch.page;
    } finally {
      setIsLoadingOlder(false);
    }
  }, [loadOlderBatch, timeframe]);

  const resetHydratedDetails = useCallback(async () => {
    timeframeCacheRef.current[timeframe] = null;
    setPage(null);
    setTimeframeHydrationProgress(null);
    setIsHydratingDetails(true);
    try {
      const requestId = hydrationRequestIdRef.current + 1;
      hydrationRequestIdRef.current = requestId;
      const nextPage = await hydrateTimeframe(timeframe, requestId);
      return nextPage;
    } finally {
      setIsHydratingDetails(false);
    }
  }, [hydrateTimeframe, timeframe]);

  return {
    detail: page?.detail ?? null,
    hasOlder: page?.hasOlder ?? false,
    isHydratingDetails,
    isLoadingOlder,
    latestIntervalIndex: page?.latestIntervalIndex ?? null,
    loadOlder,
    page,
    resolvedTimeframe,
    resetHydratedDetails,
    timeframeHydrationProgress,
  };
}
