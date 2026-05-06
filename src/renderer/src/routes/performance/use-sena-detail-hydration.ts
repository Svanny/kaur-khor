import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SenaServiceDetail, SenaServiceDetailPage, SenaSkuDetail, SenaSkuDetailPage } from '@shared/sena';
import { INTERVAL_PAGE_SIZE } from '@/components/system/interval-strip';
import { normalizeServiceDetailPage, normalizeSkuDetailPage } from '@/lib/sena-detail-pages';
import { deriveSenaDetailCacheFreshnessFingerprint, readPersistedSenaDetailPage } from '@/lib/sena-detail-page-cache';
import { useInventoryActions, useInventoryState } from '@/state/inventory';
import {
  type AnalysisTimeframe,
  deriveAnalysisTimeframeBoundary,
  deriveEstimatedTimeframeBatchCount,
  isAnalysisTimeframeSatisfied,
  shouldPruneTimeframeTransition,
} from './analysis-timeframe';

interface SenaHydrationPages {
  servicePages: Record<string, SenaServiceDetailPage | null>;
  skuPages: Record<string, SenaSkuDetailPage | null>;
}

interface SenaDetailHydrationOptions {
  deferInitialHydrationMs?: number;
  priorityServiceIds?: string[];
  prioritySkuIds?: string[];
  serviceIds?: string[];
  skuIds?: string[];
  timeframeBoundaryOverride?: Date | null;
  timeframeCacheKey?: string;
}

const DETAIL_HYDRATION_CONCURRENCY = 2;
const EMPTY_IDS: string[] = [];

async function runTaskBatches(tasks: Array<() => Promise<void>>, concurrency: number, onBatchComplete?: () => void) {
  if (tasks.length === 0) {
    return;
  }
  for (let index = 0; index < tasks.length; index += concurrency) {
    const batch = tasks.slice(index, index + concurrency);
    await Promise.all(batch.map((task) => task()));
    onBatchComplete?.();
  }
}

function mergeSkuDetails(older: SenaSkuDetail, newer: SenaSkuDetail): SenaSkuDetail {
  return {
    ...newer,
    inventoryPosterior: [...older.inventoryPosterior, ...newer.inventoryPosterior],
    demandPosterior: [...older.demandPosterior, ...newer.demandPosterior],
    pipelinePosterior: [...older.pipelinePosterior, ...newer.pipelinePosterior],
    leadTimePosterior: [...older.leadTimePosterior, ...newer.leadTimePosterior],
  };
}

function mergeServiceDetails(older: SenaServiceDetail, newer: SenaServiceDetail): SenaServiceDetail {
  return {
    ...newer,
    regimeTimeline: [...older.regimeTimeline, ...newer.regimeTimeline],
  };
}

function oldestSkuIntervalAt(page: SenaSkuDetailPage | null) {
  return page?.detail.demandPosterior[0]?.startAt ?? page?.detail.demandPosterior[0]?.endAt ?? null;
}

function oldestServiceIntervalAt(page: SenaServiceDetailPage | null) {
  return page?.detail.regimeTimeline[0]?.startAt ?? page?.detail.regimeTimeline[0]?.endAt ?? null;
}

function dedupeIds(ids: string[]) {
  return Array.from(new Set(ids.filter(Boolean)));
}

function prioritizeIds(ids: string[], priorityIds: string[]) {
  if (ids.length === 0) {
    return [];
  }
  const targetIds = new Set(ids);
  const orderedPriorityIds = dedupeIds(priorityIds).filter((id) => targetIds.has(id));
  return [...orderedPriorityIds, ...ids.filter((id) => !orderedPriorityIds.includes(id))];
}

export function useSenaDetailHydration(
  timeframe: AnalysisTimeframe,
  {
    priorityServiceIds,
    prioritySkuIds,
    deferInitialHydrationMs = 0,
    serviceIds,
    skuIds,
    timeframeBoundaryOverride,
    timeframeCacheKey,
  }: SenaDetailHydrationOptions = {},
) {
  const { catalog, workspaceSummary } = useInventoryState();
  const { loadSenaServiceDetail, loadSenaSkuDetail } = useInventoryActions();
  const [skuPagesById, setSkuPagesById] = useState<Record<string, SenaSkuDetailPage | null>>({});
  const [servicePagesById, setServicePagesById] = useState<Record<string, SenaServiceDetailPage | null>>({});
  const [isHydratingDetails, setIsHydratingDetails] = useState(false);
  const [isLoadingOlderIntervals, setIsLoadingOlderIntervals] = useState(false);
  const [resolvedTimeframeCacheKey, setResolvedTimeframeCacheKey] = useState<string | null>(null);
  const [timeframeHydrationProgress, setTimeframeHydrationProgress] = useState<{ current: number; total: number } | null>(null);
  const skuPagesByIdRef = useRef<Record<string, SenaSkuDetailPage | null>>({});
  const servicePagesByIdRef = useRef<Record<string, SenaServiceDetailPage | null>>({});
  const isLoadingOlderIntervalsRef = useRef(false);
  const timeframeCacheRef = useRef<Record<string, SenaHydrationPages>>({});
  const previousTimeframeRef = useRef<AnalysisTimeframe | null>(null);
  const previousFreshnessFingerprintRef = useRef<string | null>(null);
  const activeCacheKey = timeframeCacheKey ?? timeframe;
  const freshnessFingerprint = useMemo(
    () => deriveSenaDetailCacheFreshnessFingerprint(workspaceSummary),
    [workspaceSummary],
  );

  const targetSkuIds = useMemo(
    () => dedupeIds(skuIds ?? catalog?.skus.map((sku) => sku.skuId) ?? []),
    [catalog?.skus, skuIds],
  );
  const targetServiceIds = useMemo(
    () => dedupeIds(serviceIds ?? catalog?.services.map((service) => service.serviceId) ?? []),
    [catalog?.services, serviceIds],
  );
  const orderedSkuIds = useMemo(
    () => prioritizeIds(targetSkuIds, prioritySkuIds ?? workspaceSummary?.highRiskSkuIds ?? EMPTY_IDS),
    [prioritySkuIds, targetSkuIds, workspaceSummary?.highRiskSkuIds],
  );
  const orderedServiceIds = useMemo(
    () => prioritizeIds(targetServiceIds, priorityServiceIds ?? EMPTY_IDS),
    [priorityServiceIds, targetServiceIds],
  );

  useEffect(() => {
    skuPagesByIdRef.current = skuPagesById;
  }, [skuPagesById]);

  useEffect(() => {
    servicePagesByIdRef.current = servicePagesById;
  }, [servicePagesById]);

  useEffect(() => {
    isLoadingOlderIntervalsRef.current = isLoadingOlderIntervals;
  }, [isLoadingOlderIntervals]);

  const publishPages = useCallback((cacheKey: string, pages: SenaHydrationPages) => {
    timeframeCacheRef.current[cacheKey] = pages;
    skuPagesByIdRef.current = pages.skuPages;
    servicePagesByIdRef.current = pages.servicePages;
    setSkuPagesById(pages.skuPages);
    setServicePagesById(pages.servicePages);
  }, []);

  const loadOlderPageBatch = useCallback(async ({
    currentServicePagesById,
    currentSkuPagesById,
    limit,
  }: {
    currentServicePagesById: Record<string, SenaServiceDetailPage | null>;
    currentSkuPagesById: Record<string, SenaSkuDetailPage | null>;
    limit: number;
  }) => {
    let maxPrependedCount = 0;
    const nextSkuPagesById = { ...currentSkuPagesById };
    const nextServicePagesById = { ...currentServicePagesById };
    const tasks: Array<() => Promise<void>> = [
      ...orderedSkuIds.map((skuId) => async () => {
        const current = currentSkuPagesById[skuId];
        if (!current?.hasOlder || current.nextBeforeIntervalIndex == null) {
          nextSkuPagesById[skuId] = current ?? null;
          return;
        }
        const older = normalizeSkuDetailPage(await loadSenaSkuDetail(skuId, {
          beforeIntervalIndex: current.nextBeforeIntervalIndex,
          limit,
          strategy: 'network-only',
        }));
        maxPrependedCount = Math.max(maxPrependedCount, older?.detail.demandPosterior.length ?? 0);
        nextSkuPagesById[skuId] = older && current
          ? {
              ...older,
              latestIntervalIndex: current.latestIntervalIndex ?? older.latestIntervalIndex,
              detail: mergeSkuDetails(older.detail, current.detail),
            }
          : current ?? older ?? null;
      }),
      ...orderedServiceIds.map((serviceId) => async () => {
        const current = currentServicePagesById[serviceId];
        if (!current?.hasOlder || current.nextBeforeIntervalIndex == null) {
          nextServicePagesById[serviceId] = current ?? null;
          return;
        }
        const older = normalizeServiceDetailPage(await loadSenaServiceDetail(serviceId, {
          beforeIntervalIndex: current.nextBeforeIntervalIndex,
          limit,
          strategy: 'network-only',
        }));
        maxPrependedCount = Math.max(maxPrependedCount, older?.detail.regimeTimeline.length ?? 0);
        nextServicePagesById[serviceId] = older && current
          ? {
              ...older,
              latestIntervalIndex: current.latestIntervalIndex ?? older.latestIntervalIndex,
              detail: mergeServiceDetails(older.detail, current.detail),
            }
          : current ?? older ?? null;
      }),
    ];
    await runTaskBatches(tasks, DETAIL_HYDRATION_CONCURRENCY);

    return {
      maxPrependedCount,
      servicePagesById: nextServicePagesById,
      skuPagesById: nextSkuPagesById,
    };
  }, [loadSenaServiceDetail, loadSenaSkuDetail, orderedServiceIds, orderedSkuIds]);

  const pagesSatisfyTimeframe = useCallback(({
    boundary,
    respectRecentBoundary = false,
    servicePages,
    skuPages,
    targetTimeframe,
  }: {
    boundary: Date | null;
    respectRecentBoundary?: boolean;
    servicePages: Record<string, SenaServiceDetailPage | null>;
    skuPages: Record<string, SenaSkuDetailPage | null>;
    targetTimeframe: AnalysisTimeframe;
  }) => {
    const skuSatisfied = orderedSkuIds.every((skuId) =>
      isAnalysisTimeframeSatisfied({
        boundary,
        hasOlder: skuPages[skuId]?.hasOlder ?? false,
        loadedIntervalCount: skuPages[skuId]?.detail.demandPosterior.length ?? 0,
        oldestIntervalAt: oldestSkuIntervalAt(skuPages[skuId] ?? null),
        respectRecentBoundary,
        timeframe: targetTimeframe,
      }),
    );
    const serviceSatisfied = orderedServiceIds.every((serviceId) =>
      isAnalysisTimeframeSatisfied({
        boundary,
        hasOlder: servicePages[serviceId]?.hasOlder ?? false,
        loadedIntervalCount: servicePages[serviceId]?.detail.regimeTimeline.length ?? 0,
        oldestIntervalAt: oldestServiceIntervalAt(servicePages[serviceId] ?? null),
        respectRecentBoundary,
        timeframe: targetTimeframe,
      }),
    );
    return skuSatisfied && serviceSatisfied;
  }, [orderedServiceIds, orderedSkuIds]);

  const loadInitialPages = useCallback(async ({
    onPagesChange,
    targetBoundaryOverride,
    targetCacheKey,
    targetTimeframe,
  }: {
    onPagesChange?: (pages: SenaHydrationPages) => void;
    targetBoundaryOverride?: Date | null;
    targetCacheKey: string;
    targetTimeframe: AnalysisTimeframe;
  }) => {
    const cachedSkuPages = Object.fromEntries(
      targetSkuIds.map((skuId) => [
        skuId,
        typeof window === 'undefined'
          ? null
          : readPersistedSenaDetailPage({
              beforeIntervalIndex: null,
              entityId: skuId,
              entityType: 'sku',
              freshnessFingerprint,
              limit: INTERVAL_PAGE_SIZE,
              storage: window.localStorage,
            }),
      ]),
    ) as Record<string, SenaSkuDetailPage | null>;
    const cachedServicePages = Object.fromEntries(
      targetServiceIds.map((serviceId) => [
        serviceId,
        typeof window === 'undefined'
          ? null
          : readPersistedSenaDetailPage({
              beforeIntervalIndex: null,
              entityId: serviceId,
              entityType: 'service',
              freshnessFingerprint,
              limit: INTERVAL_PAGE_SIZE,
              storage: window.localStorage,
            }),
      ]),
    ) as Record<string, SenaServiceDetailPage | null>;
    let skuPages = { ...cachedSkuPages };
    let servicePages = { ...cachedServicePages };
    if (Object.values(cachedSkuPages).some(Boolean) || Object.values(cachedServicePages).some(Boolean)) {
      onPagesChange?.({ servicePages, skuPages });
    }

    const hydrationTasks: Array<() => Promise<void>> = [
      ...orderedSkuIds.map((skuId) => async () => {
        try {
          skuPages = {
            ...skuPages,
            [skuId]: normalizeSkuDetailPage(await loadSenaSkuDetail(skuId, { limit: INTERVAL_PAGE_SIZE })),
          };
        } catch {
          skuPages = { ...skuPages, [skuId]: null };
        }
      }),
      ...orderedServiceIds.map((serviceId) => async () => {
        try {
          servicePages = {
            ...servicePages,
            [serviceId]: normalizeServiceDetailPage(await loadSenaServiceDetail(serviceId, { limit: INTERVAL_PAGE_SIZE })),
          };
        } catch {
          servicePages = { ...servicePages, [serviceId]: null };
        }
      }),
    ];
    await runTaskBatches(hydrationTasks, DETAIL_HYDRATION_CONCURRENCY, () => {
      onPagesChange?.({ servicePages, skuPages });
    });
    onPagesChange?.({ servicePages, skuPages });

    const boundary = deriveAnalysisTimeframeBoundary(workspaceSummary?.latestObservedAt, targetTimeframe);
    const effectiveBoundary =
      targetTimeframe === 'Recent' && targetBoundaryOverride != null
        ? targetBoundaryOverride
        : (targetBoundaryOverride ?? boundary);
    const initiallyLoadedIntervalCount = Math.max(
      ...orderedSkuIds.map((skuId) => skuPages[skuId]?.detail.demandPosterior.length ?? 0),
      ...orderedServiceIds.map((serviceId) => servicePages[serviceId]?.detail.regimeTimeline.length ?? 0),
      0,
    );
    const oldestLoadedAt =
      orderedSkuIds
        .map((skuId) => oldestSkuIntervalAt(skuPages[skuId] ?? null))
        .find((value) => value != null)
      ?? orderedServiceIds
        .map((serviceId) => oldestServiceIntervalAt(servicePages[serviceId] ?? null))
        .find((value) => value != null)
      ?? null;
    const estimatedBatchCount = deriveEstimatedTimeframeBatchCount({
      batchSize: 10,
      boundary: effectiveBoundary,
      intervalCount: workspaceSummary?.intervalCount ?? initiallyLoadedIntervalCount,
      latestObservedAt: workspaceSummary?.latestObservedAt,
      loadedIntervalCount: initiallyLoadedIntervalCount,
      oldestLoadedAt,
      timeframe: targetTimeframe,
    });
    if (!pagesSatisfyTimeframe({
      boundary: effectiveBoundary,
      respectRecentBoundary: targetBoundaryOverride != null,
      servicePages,
      skuPages,
      targetTimeframe,
    })) {
      const requestedBatchCount = Math.max(1, estimatedBatchCount);
      if (requestedBatchCount > 1) {
        setTimeframeHydrationProgress({
          current: 1,
          total: requestedBatchCount,
        });
      }
      const nextBatch = await loadOlderPageBatch({
        currentServicePagesById: servicePages,
        currentSkuPagesById: skuPages,
        limit: 10 * requestedBatchCount,
      });
      skuPages = nextBatch.skuPagesById;
      servicePages = nextBatch.servicePagesById;
      onPagesChange?.({ servicePages, skuPages });
    }

    setTimeframeHydrationProgress(null);
    timeframeCacheRef.current[targetCacheKey] = { servicePages, skuPages };
    setResolvedTimeframeCacheKey(targetCacheKey);

    return {
      servicePages,
      skuPages,
    };
  }, [
    loadOlderPageBatch,
    loadSenaServiceDetail,
    loadSenaSkuDetail,
    orderedServiceIds,
    orderedSkuIds,
    pagesSatisfyTimeframe,
    targetServiceIds,
    targetSkuIds,
    freshnessFingerprint,
    workspaceSummary,
  ]);

  useEffect(() => {
    if (!catalog || !workspaceSummary) {
      timeframeCacheRef.current = {};
      setResolvedTimeframeCacheKey(null);
      skuPagesByIdRef.current = {};
      servicePagesByIdRef.current = {};
      setSkuPagesById({});
      setServicePagesById({});
      setIsHydratingDetails(false);
      setTimeframeHydrationProgress(null);
      previousFreshnessFingerprintRef.current = null;
      return;
    }

    if (previousFreshnessFingerprintRef.current !== freshnessFingerprint) {
      timeframeCacheRef.current = {};
      setResolvedTimeframeCacheKey(null);
      skuPagesByIdRef.current = {};
      servicePagesByIdRef.current = {};
      setSkuPagesById({});
      setServicePagesById({});
      setTimeframeHydrationProgress(null);
      previousFreshnessFingerprintRef.current = freshnessFingerprint;
    }

    if (shouldPruneTimeframeTransition({
      latestObservedAt: workspaceSummary.latestObservedAt,
      nextTimeframe: timeframe,
      previousTimeframe: previousTimeframeRef.current,
    }) && !timeframeBoundaryOverride) {
      const recentPages = timeframeCacheRef.current.Recent;
      timeframeCacheRef.current = recentPages ? { Recent: recentPages } : {};
      setResolvedTimeframeCacheKey(null);
      skuPagesByIdRef.current = {};
      servicePagesByIdRef.current = {};
      setSkuPagesById({});
      setServicePagesById({});
      setTimeframeHydrationProgress(null);
    }
    previousTimeframeRef.current = timeframe;

    const cachedPages = timeframeCacheRef.current[activeCacheKey];
    const boundary = deriveAnalysisTimeframeBoundary(workspaceSummary.latestObservedAt, timeframe);
    const effectiveBoundary =
      timeframe === 'Recent' && timeframeBoundaryOverride != null
        ? timeframeBoundaryOverride
        : (timeframeBoundaryOverride ?? boundary);
    if (
      cachedPages &&
      pagesSatisfyTimeframe({
        boundary: effectiveBoundary,
        respectRecentBoundary: timeframeBoundaryOverride != null,
        servicePages: cachedPages.servicePages,
        skuPages: cachedPages.skuPages,
        targetTimeframe: timeframe,
      })
    ) {
      publishPages(activeCacheKey, cachedPages);
      setIsHydratingDetails(false);
      setTimeframeHydrationProgress(null);
      setResolvedTimeframeCacheKey(activeCacheKey);
      return;
    }

    let active = true;
    setIsHydratingDetails(true);

    const startHydration = () => {
      if (!active) {
        return;
      }
      void loadInitialPages({
        onPagesChange: (pages) => {
          if (!active) {
            return;
          }
          publishPages(activeCacheKey, pages);
        },
        targetBoundaryOverride: timeframeBoundaryOverride,
        targetCacheKey: activeCacheKey,
        targetTimeframe: timeframe,
      })
        .then((pages) => {
          if (!active) {
            return;
          }
          publishPages(activeCacheKey, pages);
          setResolvedTimeframeCacheKey(activeCacheKey);
          setIsHydratingDetails(false);
        })
        .catch(() => {
          if (!active) {
            return;
          }
          setIsHydratingDetails(false);
          setTimeframeHydrationProgress(null);
        });
    };

    const timeoutId = deferInitialHydrationMs > 0
      ? window.setTimeout(startHydration, deferInitialHydrationMs)
      : null;
    if (timeoutId == null) {
      startHydration();
    }

    return () => {
      active = false;
      if (timeoutId != null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [
    activeCacheKey,
    catalog,
    deferInitialHydrationMs,
    loadInitialPages,
    pagesSatisfyTimeframe,
    publishPages,
    freshnessFingerprint,
    timeframe,
    timeframeBoundaryOverride,
    workspaceSummary,
  ]);

  const resetHydratedDetails = useCallback(async () => {
    if (!catalog || !workspaceSummary) {
      skuPagesByIdRef.current = {};
      servicePagesByIdRef.current = {};
      setSkuPagesById({});
      setServicePagesById({});
      return;
    }
    setIsHydratingDetails(true);
    try {
      const pages = await loadInitialPages({
        onPagesChange: (nextPages) => publishPages(activeCacheKey, nextPages),
        targetBoundaryOverride: timeframeBoundaryOverride,
        targetCacheKey: activeCacheKey,
        targetTimeframe: timeframe,
      });
      publishPages(activeCacheKey, pages);
      setResolvedTimeframeCacheKey(activeCacheKey);
    } finally {
      setIsHydratingDetails(false);
      setTimeframeHydrationProgress(null);
    }
  }, [activeCacheKey, catalog, loadInitialPages, publishPages, timeframe, timeframeBoundaryOverride, workspaceSummary]);

  const loadOlderIntervals = useCallback(async (limit = INTERVAL_PAGE_SIZE) => {
    if (!catalog || isLoadingOlderIntervalsRef.current) {
      return 0;
    }
    isLoadingOlderIntervalsRef.current = true;
    setIsLoadingOlderIntervals(true);
    try {
      const nextBatch = await loadOlderPageBatch({
        currentServicePagesById: servicePagesByIdRef.current,
        currentSkuPagesById: skuPagesByIdRef.current,
        limit,
      });
      publishPages(activeCacheKey, {
        servicePages: nextBatch.servicePagesById,
        skuPages: nextBatch.skuPagesById,
      });
      setResolvedTimeframeCacheKey(activeCacheKey);
      return nextBatch.maxPrependedCount;
    } finally {
      isLoadingOlderIntervalsRef.current = false;
      setIsLoadingOlderIntervals(false);
    }
  }, [activeCacheKey, catalog, loadOlderPageBatch, publishPages]);

  const skuDetailsById = useMemo(
    () => Object.fromEntries(
      Object.entries(skuPagesById).map(([key, value]) => [key, value?.detail ?? null]),
    ) as Record<string, SenaSkuDetail | null>,
    [skuPagesById],
  );
  const serviceDetailsById = useMemo(
    () => Object.fromEntries(
      Object.entries(servicePagesById).map(([key, value]) => [key, value?.detail ?? null]),
    ) as Record<string, SenaServiceDetail | null>,
    [servicePagesById],
  );
  const hasOlderIntervals = useMemo(
    () =>
      orderedSkuIds.some((skuId) => skuPagesById[skuId]?.hasOlder) ||
      orderedServiceIds.some((serviceId) => servicePagesById[serviceId]?.hasOlder),
    [orderedServiceIds, orderedSkuIds, servicePagesById, skuPagesById],
  );

  return {
    hasOlderIntervals,
    isHydratingDetails,
    isLoadingOlderIntervals,
    loadOlderIntervals,
    resetHydratedDetails,
    resolvedTimeframeCacheKey,
    serviceDetailsById,
    skuDetailsById,
    timeframeHydrationProgress,
  };
}
