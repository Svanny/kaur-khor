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
import { traceRenderer } from '@/lib/ui/trace';

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
  seedInitialPage,
  hydrateTimeframeSequentially = false,
  timeframe,
  timeframeBoundaryOverride,
  timeframeCacheKey,
  traceScope = 'timeframed-interval-history',
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
  seedInitialPage?: (limit?: number) => Promise<TPage | null | undefined> | TPage | null | undefined;
  hydrateTimeframeSequentially?: boolean;
  timeframe: ChartTimeframe;
  timeframeBoundaryOverride?: Date | null;
  timeframeCacheKey?: string;
  traceScope?: string;
}) {
  const [page, setPage] = useState<TPage | null>(initialPage);
  const [isHydratingDetails, setIsHydratingDetails] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [timeframeHydrationProgress, setTimeframeHydrationProgress] = useState<{ current: number; total: number } | null>(null);
  const [resolvedTimeframe, setResolvedTimeframe] = useState<ChartTimeframe | null>(
    initialPage ? 'Recent' : null,
  );
  const [resolvedTimeframeCacheKey, setResolvedTimeframeCacheKey] = useState<string | null>(
    initialPage ? 'Recent' : null,
  );
  const pageRef = useRef<TPage | null>(initialPage);
  const isLoadingOlderRef = useRef(false);
  const timeframeCacheRef = useRef<Record<string, TPage | null>>({ Recent: initialPage });
  const previousTimeframeRef = useRef<ChartTimeframe | null>(null);
  const previousHadBoundaryOverrideRef = useRef(Boolean(timeframeBoundaryOverride));
  const latestInitialKeyRef = useRef<number | null>(initialPage?.latestIntervalIndex ?? null);
  const hydrationRequestIdRef = useRef(0);
  const fetchInitialPageRef = useRef(fetchInitialPage);
  const fetchOlderPageRef = useRef(fetchOlderPage);
  const getLoadedIntervalCountRef = useRef(getLoadedIntervalCount);
  const getOldestIntervalAtRef = useRef(getOldestIntervalAt);
  const mergeDetailsRef = useRef(mergeDetails);
  const onPruneTransitionRef = useRef(onPruneTransition);
  const seedInitialPageRef = useRef(seedInitialPage);
  const timeframeBoundaryOverrideTime = timeframeBoundaryOverride?.getTime() ?? null;

  useEffect(() => {
    fetchInitialPageRef.current = fetchInitialPage;
    fetchOlderPageRef.current = fetchOlderPage;
    getLoadedIntervalCountRef.current = getLoadedIntervalCount;
    getOldestIntervalAtRef.current = getOldestIntervalAt;
    mergeDetailsRef.current = mergeDetails;
    onPruneTransitionRef.current = onPruneTransition;
    seedInitialPageRef.current = seedInitialPage;
  }, [fetchInitialPage, fetchOlderPage, getLoadedIntervalCount, getOldestIntervalAt, mergeDetails, onPruneTransition, seedInitialPage]);

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

  const hydrateTimeframe = useCallback(async (
    targetTimeframe: ChartTimeframe,
    requestId: number,
    targetCacheKey: string,
    targetBoundaryOverride?: Date | null,
  ) => {
    traceRenderer(traceScope, 'hydrate start', {
      requestId,
      targetBoundaryOverride: targetBoundaryOverride?.toISOString() ?? null,
      targetCacheKey,
      targetTimeframe,
    });
    const isCurrentRequest = () => hydrationRequestIdRef.current === requestId;
    const recentLimit = RECENT_TIMEFRAME_MIN_REPORTS;
    const initialLimit = targetCacheKey === 'Recent' ? recentLimit : INTERVAL_PAGE_SIZE;
    const seededPage =
      targetCacheKey === 'Recent'
        ? await seedInitialPageRef.current?.(initialLimit)
        : undefined;
    let nextPage = targetCacheKey === 'Recent'
      ? timeframeCacheRef.current.Recent
        ?? initialPage
        ?? (seededPage !== undefined ? seededPage : await fetchInitialPageRef.current(recentLimit))
      : await fetchInitialPageRef.current(INTERVAL_PAGE_SIZE);
    if (!isCurrentRequest()) {
      traceRenderer(traceScope, 'hydrate cancelled before initial page', {
        requestId,
        targetCacheKey,
        targetTimeframe,
      });
      return null;
    }
    timeframeCacheRef.current[targetCacheKey] = nextPage;
    setPage(nextPage);
    traceRenderer(traceScope, 'hydrate initial page resolved', {
      hasOlder: nextPage?.hasOlder ?? null,
      loadedIntervalCount: getLoadedIntervalCountRef.current(nextPage),
      requestId,
      targetCacheKey,
      targetTimeframe,
    });

    if (!nextPage) {
      setTimeframeHydrationProgress(null);
      return nextPage;
    }

    const boundary = targetBoundaryOverride ?? deriveChartTimeframeBoundary(latestObservedAt, targetTimeframe);

    if (
      nextPage &&
      !isChartTimeframeSatisfied({
        boundary,
        hasOlder: nextPage.hasOlder,
        loadedIntervalCount: getLoadedIntervalCountRef.current(nextPage),
        oldestIntervalAt: getOldestIntervalAtRef.current(nextPage),
        respectRecentBoundary: Boolean(targetBoundaryOverride),
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
            respectRecentBoundary: Boolean(targetBoundaryOverride),
            timeframe: targetTimeframe,
          })
        ) {
          const nextBatch = await loadOlderBatch({
            currentPage: nextPage,
            limit: INTERVAL_LOAD_BATCH_SIZE,
          });
          if (!isCurrentRequest()) {
            traceRenderer(traceScope, 'hydrate cancelled during sequential batch', {
              requestId,
              targetCacheKey,
              targetTimeframe,
            });
            return null;
          }
          nextPage = nextBatch.page;
          timeframeCacheRef.current[targetCacheKey] = nextPage;
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
        traceRenderer(traceScope, 'hydrate loading older batch', {
          estimatedBatchCount,
          loadedIntervalCount,
          requestId,
          requestedBatchCount,
          targetCacheKey,
          targetTimeframe,
        });
        const nextBatch = await loadOlderBatch({
          currentPage: nextPage,
          limit: INTERVAL_LOAD_BATCH_SIZE * requestedBatchCount,
        });
        if (!isCurrentRequest()) {
          traceRenderer(traceScope, 'hydrate cancelled during batch', {
            requestId,
            targetCacheKey,
            targetTimeframe,
          });
          return null;
        }
        nextPage = nextBatch.page;
        timeframeCacheRef.current[targetCacheKey] = nextPage;
        setPage(nextPage);
      }
    }

    if (!isCurrentRequest()) {
      traceRenderer(traceScope, 'hydrate cancelled before completion', {
        requestId,
        targetCacheKey,
        targetTimeframe,
      });
      return null;
    }
    setTimeframeHydrationProgress(null);
    setResolvedTimeframe(targetTimeframe);
    setResolvedTimeframeCacheKey(targetCacheKey);
    traceRenderer(traceScope, 'hydrate complete', {
      hasOlder: nextPage?.hasOlder ?? null,
      loadedIntervalCount: getLoadedIntervalCountRef.current(nextPage),
      requestId,
      targetCacheKey,
      targetTimeframe,
    });
    return nextPage;
  }, [hydrateTimeframeSequentially, initialPage, intervalCount, latestObservedAt, loadOlderBatch, traceScope]);

  useEffect(() => {
    let active = true;
    const activeCacheKey = timeframeCacheKey ?? timeframe;
    traceRenderer(traceScope, 'effect evaluate timeframe', {
      activeCacheKey,
      initialLatestIntervalIndex: initialPage?.latestIntervalIndex ?? null,
      latestObservedAt,
      previousTimeframe: previousTimeframeRef.current,
      timeframe,
      timeframeBoundaryOverride: timeframeBoundaryOverride?.toISOString() ?? null,
      timeframeBoundaryOverrideTime,
    });

    if (
      !timeframeBoundaryOverride &&
      !previousHadBoundaryOverrideRef.current &&
      shouldPruneTimeframeTransition({
        latestObservedAt,
        nextTimeframe: timeframe,
        previousTimeframe: previousTimeframeRef.current,
      })
    ) {
      timeframeCacheRef.current = {
        Recent: timeframeCacheRef.current.Recent ?? initialPage,
      };
      traceRenderer(traceScope, 'prune timeframe transition cache', {
        activeCacheKey,
        latestObservedAt,
        previousTimeframe: previousTimeframeRef.current,
        timeframe,
      });
      setPage(null);
      setTimeframeHydrationProgress(null);
      setResolvedTimeframe(null);
      setResolvedTimeframeCacheKey(null);
      void onPruneTransitionRef.current?.();
    }

    previousTimeframeRef.current = timeframe;
    previousHadBoundaryOverrideRef.current = Boolean(timeframeBoundaryOverride);
    const cachedPage = timeframeCacheRef.current[activeCacheKey];
    const cachedBoundary = timeframeBoundaryOverride ?? deriveChartTimeframeBoundary(latestObservedAt, timeframe);
    const cachedPageSatisfiesTimeframe = cachedPage
      ? isChartTimeframeSatisfied({
        boundary: cachedBoundary,
        hasOlder: cachedPage.hasOlder,
        loadedIntervalCount: getLoadedIntervalCountRef.current(cachedPage),
        oldestIntervalAt: getOldestIntervalAtRef.current(cachedPage),
        respectRecentBoundary: Boolean(timeframeBoundaryOverride),
        timeframe,
      })
      : false;
    if (cachedPage && cachedPageSatisfiesTimeframe) {
      traceRenderer(traceScope, 'using cached timeframe page', {
        activeCacheKey,
        loadedIntervalCount: getLoadedIntervalCountRef.current(cachedPage),
        timeframe,
      });
      setIsHydratingDetails(false);
      setTimeframeHydrationProgress(null);
      setPage(cachedPage);
      setResolvedTimeframe(timeframe);
      setResolvedTimeframeCacheKey(activeCacheKey);
      return () => {
        active = false;
      };
    }

    setIsHydratingDetails(true);
    const requestId = hydrationRequestIdRef.current + 1;
    hydrationRequestIdRef.current = requestId;
    traceRenderer(traceScope, 'queue hydrate request', {
      activeCacheKey,
      requestId,
      timeframe,
      timeframeBoundaryOverride: timeframeBoundaryOverride?.toISOString() ?? null,
    });
    void hydrateTimeframe(timeframe, requestId, activeCacheKey, timeframeBoundaryOverride).finally(() => {
      if (active) {
        setIsHydratingDetails(false);
      }
    });

    return () => {
      active = false;
      hydrationRequestIdRef.current += 1;
      traceRenderer(traceScope, 'cleanup hydrate request', {
        activeCacheKey,
        nextRequestId: hydrationRequestIdRef.current,
        requestId,
        timeframe,
      });
    };
  }, [hydrateTimeframe, initialPage, latestObservedAt, timeframe, timeframeBoundaryOverrideTime, timeframeCacheKey, traceScope]);

  const loadOlder = useCallback(async (limit = INTERVAL_LOAD_BATCH_SIZE) => {
    const currentPage = pageRef.current;
    const activeCacheKey = timeframeCacheKey ?? timeframe;
    const requestId = hydrationRequestIdRef.current;
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
      if (hydrationRequestIdRef.current !== requestId) {
        return null;
      }
      timeframeCacheRef.current[activeCacheKey] = nextBatch.page;
      setPage(nextBatch.page);
      return nextBatch.page;
    } finally {
      setIsLoadingOlder(false);
    }
  }, [loadOlderBatch, timeframe, timeframeCacheKey]);

  const resetHydratedDetails = useCallback(async () => {
    const activeCacheKey = timeframeCacheKey ?? timeframe;
    timeframeCacheRef.current[activeCacheKey] = null;
    setPage(null);
    setTimeframeHydrationProgress(null);
    setIsHydratingDetails(true);
    try {
      const requestId = hydrationRequestIdRef.current + 1;
      hydrationRequestIdRef.current = requestId;
      const nextPage = await hydrateTimeframe(timeframe, requestId, activeCacheKey, timeframeBoundaryOverride);
      return nextPage;
    } finally {
      setIsHydratingDetails(false);
    }
  }, [hydrateTimeframe, timeframe, timeframeBoundaryOverrideTime, timeframeCacheKey]);

  return {
    detail: page?.detail ?? null,
    hasOlder: page?.hasOlder ?? false,
    isHydratingDetails,
    isLoadingOlder,
    latestIntervalIndex: page?.latestIntervalIndex ?? null,
    loadOlder,
    page,
    resolvedTimeframe,
    resolvedTimeframeCacheKey,
    resetHydratedDetails,
    timeframeHydrationProgress,
  };
}
