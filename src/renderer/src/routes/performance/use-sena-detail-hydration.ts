import { useEffect, useRef, useState } from 'react';
import type { SenaServiceDetail, SenaServiceDetailPage, SenaSkuDetail, SenaSkuDetailPage } from '@shared/sena';
import { INTERVAL_PAGE_SIZE } from '@/components/system/interval-strip';
import { normalizeServiceDetailPage, normalizeSkuDetailPage } from '@/lib/sena-detail-pages';
import { deriveSenaDetailCacheFreshnessFingerprint, readPersistedSenaDetailPage } from '@/lib/sena-detail-page-cache';
import { useInventory } from '@/state/inventory';
import { type AnalysisTimeframe, deriveAnalysisTimeframeBoundary, deriveEstimatedTimeframeBatchCount, isAnalysisTimeframeSatisfied, shouldPruneTimeframeTransition } from './analysis-timeframe';

interface SenaHydrationPages {
  servicePages: Record<string, SenaServiceDetailPage | null>;
  skuPages: Record<string, SenaSkuDetailPage | null>;
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

export function useSenaDetailHydration(timeframe: AnalysisTimeframe, timeframeBoundaryOverride?: Date | null, timeframeCacheKey?: string) {
  const inventory = useInventory();
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
  const activeCacheKey = timeframeCacheKey ?? timeframe;

  useEffect(() => {
    skuPagesByIdRef.current = skuPagesById;
  }, [skuPagesById]);

  useEffect(() => {
    servicePagesByIdRef.current = servicePagesById;
  }, [servicePagesById]);

  useEffect(() => {
    isLoadingOlderIntervalsRef.current = isLoadingOlderIntervals;
  }, [isLoadingOlderIntervals]);

  const loadOlderPageBatch = async ({
    currentServicePagesById,
    currentSkuPagesById,
    limit,
  }: {
    currentServicePagesById: Record<string, SenaServiceDetailPage | null>;
    currentSkuPagesById: Record<string, SenaSkuDetailPage | null>;
    limit: number;
  }) => {
    let maxPrependedCount = 0;
    const skuEntries = await Promise.all(
      inventory.catalog?.skus.map(async (sku) => {
        const current = currentSkuPagesById[sku.skuId];
        if (!current?.hasOlder || current.nextBeforeIntervalIndex == null) {
          return [sku.skuId, current ?? null] as const;
        }
        const older = normalizeSkuDetailPage(await inventory.loadSenaSkuDetail(sku.skuId, {
          beforeIntervalIndex: current.nextBeforeIntervalIndex,
          limit,
          strategy: 'network-only',
        }));
        maxPrependedCount = Math.max(maxPrependedCount, older?.detail.demandPosterior.length ?? 0);
        return [
          sku.skuId,
          older && current
            ? {
                ...older,
                latestIntervalIndex: current.latestIntervalIndex ?? older.latestIntervalIndex,
                detail: mergeSkuDetails(older.detail, current.detail),
              }
            : current ?? older ?? null,
        ] as const;
      }) ?? [],
    );
    const serviceEntries = await Promise.all(
      inventory.catalog?.services.map(async (service) => {
        const current = currentServicePagesById[service.serviceId];
        if (!current?.hasOlder || current.nextBeforeIntervalIndex == null) {
          return [service.serviceId, current ?? null] as const;
        }
        const older = normalizeServiceDetailPage(await inventory.loadSenaServiceDetail(service.serviceId, {
          beforeIntervalIndex: current.nextBeforeIntervalIndex,
          limit,
          strategy: 'network-only',
        }));
        maxPrependedCount = Math.max(maxPrependedCount, older?.detail.regimeTimeline.length ?? 0);
        return [
          service.serviceId,
          older && current
            ? {
                ...older,
                latestIntervalIndex: current.latestIntervalIndex ?? older.latestIntervalIndex,
                detail: mergeServiceDetails(older.detail, current.detail),
              }
            : current ?? older ?? null,
        ] as const;
      }) ?? [],
    );

    return {
      maxPrependedCount,
      servicePagesById: Object.fromEntries(serviceEntries) as Record<string, SenaServiceDetailPage | null>,
      skuPagesById: Object.fromEntries(skuEntries) as Record<string, SenaSkuDetailPage | null>,
    };
  };

  const pagesSatisfyTimeframe = ({
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
    const skuSatisfied = Object.values(skuPages).every((page) =>
      isAnalysisTimeframeSatisfied({
        boundary,
        hasOlder: page?.hasOlder ?? false,
        loadedIntervalCount: page?.detail.demandPosterior.length ?? 0,
        oldestIntervalAt: oldestSkuIntervalAt(page),
        respectRecentBoundary,
        timeframe: targetTimeframe,
      }),
    );
    const serviceSatisfied = Object.values(servicePages).every((page) =>
      isAnalysisTimeframeSatisfied({
        boundary,
        hasOlder: page?.hasOlder ?? false,
        loadedIntervalCount: page?.detail.regimeTimeline.length ?? 0,
        oldestIntervalAt: oldestServiceIntervalAt(page),
        respectRecentBoundary,
        timeframe: targetTimeframe,
      }),
    );
    return skuSatisfied && serviceSatisfied;
  };

  const loadInitialPages = async ({
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
    const freshnessFingerprint = deriveSenaDetailCacheFreshnessFingerprint(inventory.workspaceSummary);
    const cachedSkuPages = Object.fromEntries(
      (inventory.catalog?.skus ?? []).map((sku) => [
        sku.skuId,
        typeof window === 'undefined'
          ? null
          : readPersistedSenaDetailPage({
            beforeIntervalIndex: null,
            entityId: sku.skuId,
            entityType: 'sku',
            freshnessFingerprint,
            limit: INTERVAL_PAGE_SIZE,
            storage: window.localStorage,
          }),
      ]),
    ) as Record<string, SenaSkuDetailPage | null>;
    const cachedServicePages = Object.fromEntries(
      (inventory.catalog?.services ?? []).map((service) => [
        service.serviceId,
        typeof window === 'undefined'
          ? null
          : readPersistedSenaDetailPage({
            beforeIntervalIndex: null,
            entityId: service.serviceId,
            entityType: 'service',
            freshnessFingerprint,
            limit: INTERVAL_PAGE_SIZE,
            storage: window.localStorage,
          }),
      ]),
    ) as Record<string, SenaServiceDetailPage | null>;
    if (Object.values(cachedSkuPages).some(Boolean) || Object.values(cachedServicePages).some(Boolean)) {
      onPagesChange?.({
        servicePages: cachedServicePages,
        skuPages: cachedSkuPages,
      });
    }
    const [skuEntries, serviceEntries] = await Promise.all([
      Promise.all(
        (inventory.catalog?.skus ?? []).map(async (sku) => {
          try {
            return [sku.skuId, normalizeSkuDetailPage(await inventory.loadSenaSkuDetail(sku.skuId, { limit: INTERVAL_PAGE_SIZE, strategy: 'network-only' }))] as const;
          } catch {
            return [sku.skuId, null] as const;
          }
        }),
      ),
      Promise.all(
        (inventory.catalog?.services ?? []).map(async (service) => {
          try {
            return [service.serviceId, normalizeServiceDetailPage(await inventory.loadSenaServiceDetail(service.serviceId, { limit: INTERVAL_PAGE_SIZE, strategy: 'network-only' }))] as const;
          } catch {
            return [service.serviceId, null] as const;
          }
        }),
      ),
    ]);
    let skuPages = Object.fromEntries(skuEntries) as Record<string, SenaSkuDetailPage | null>;
    let servicePages = Object.fromEntries(serviceEntries) as Record<string, SenaServiceDetailPage | null>;
    onPagesChange?.({ servicePages, skuPages });
    const boundary = deriveAnalysisTimeframeBoundary(inventory.workspaceSummary?.latestObservedAt, targetTimeframe);
    const effectiveBoundary =
      targetTimeframe === 'Recent' && targetBoundaryOverride != null
        ? targetBoundaryOverride
        : (targetBoundaryOverride ?? boundary);
    const initiallyLoadedIntervalCount = Math.max(
      ...Object.values(skuPages).map((page) => page?.detail.demandPosterior.length ?? 0),
      ...Object.values(servicePages).map((page) => page?.detail.regimeTimeline.length ?? 0),
      0,
    );
    const oldestLoadedAt =
      Object.values(skuPages).find((page) => (page?.detail.demandPosterior.length ?? 0) > 0)?.detail.demandPosterior[0]?.startAt ??
      Object.values(servicePages).find((page) => (page?.detail.regimeTimeline.length ?? 0) > 0)?.detail.regimeTimeline[0]?.startAt ??
      null;
    const estimatedBatchCount = deriveEstimatedTimeframeBatchCount({
      batchSize: 10,
      boundary: effectiveBoundary,
      intervalCount: inventory.workspaceSummary?.intervalCount ?? initiallyLoadedIntervalCount,
      latestObservedAt: inventory.workspaceSummary?.latestObservedAt,
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
  };

  useEffect(() => {
    if (!inventory.catalog || !inventory.workspaceSummary) {
      timeframeCacheRef.current = {};
      setResolvedTimeframeCacheKey(null);
      skuPagesByIdRef.current = {};
      servicePagesByIdRef.current = {};
      setSkuPagesById({});
      setServicePagesById({});
      setIsHydratingDetails(false);
      setTimeframeHydrationProgress(null);
      return;
    }

    if (shouldPruneTimeframeTransition({
      latestObservedAt: inventory.workspaceSummary.latestObservedAt,
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
    const boundary = deriveAnalysisTimeframeBoundary(inventory.workspaceSummary.latestObservedAt, timeframe);
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
      skuPagesByIdRef.current = cachedPages.skuPages;
      servicePagesByIdRef.current = cachedPages.servicePages;
      setSkuPagesById(cachedPages.skuPages);
      setServicePagesById(cachedPages.servicePages);
      setIsHydratingDetails(false);
      setTimeframeHydrationProgress(null);
      setResolvedTimeframeCacheKey(activeCacheKey);
      return;
    }

    let active = true;
    setIsHydratingDetails(true);

    void loadInitialPages({
      onPagesChange: ({ servicePages, skuPages }) => {
        if (!active) {
          return;
        }
        timeframeCacheRef.current[activeCacheKey] = { servicePages, skuPages };
        skuPagesByIdRef.current = skuPages;
        servicePagesByIdRef.current = servicePages;
        setSkuPagesById(skuPages);
        setServicePagesById(servicePages);
      },
      targetBoundaryOverride: timeframeBoundaryOverride,
      targetCacheKey: activeCacheKey,
      targetTimeframe: timeframe,
    })
      .then(({ servicePages, skuPages }) => {
        if (!active) {
          return;
        }
        timeframeCacheRef.current[activeCacheKey] = { servicePages, skuPages };
        setResolvedTimeframeCacheKey(activeCacheKey);
        skuPagesByIdRef.current = skuPages;
        servicePagesByIdRef.current = servicePages;
        setSkuPagesById(skuPages);
        setServicePagesById(servicePages);
        setIsHydratingDetails(false);
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setIsHydratingDetails(false);
        setTimeframeHydrationProgress(null);
      });

    return () => {
      active = false;
    };
  }, [activeCacheKey, inventory, inventory.catalog, inventory.workspaceSummary, timeframe, timeframeBoundaryOverride, timeframeCacheKey]);

  const resetHydratedDetails = async () => {
    if (!inventory.catalog || !inventory.workspaceSummary) {
      skuPagesByIdRef.current = {};
      servicePagesByIdRef.current = {};
      setSkuPagesById({});
      setServicePagesById({});
      return;
    }
    setIsHydratingDetails(true);
    try {
      const { servicePages, skuPages } = await loadInitialPages({
        onPagesChange: ({ servicePages: nextServicePages, skuPages: nextSkuPages }) => {
          timeframeCacheRef.current[activeCacheKey] = {
            servicePages: nextServicePages,
            skuPages: nextSkuPages,
          };
          skuPagesByIdRef.current = nextSkuPages;
          servicePagesByIdRef.current = nextServicePages;
          setSkuPagesById(nextSkuPages);
          setServicePagesById(nextServicePages);
        },
        targetBoundaryOverride: timeframeBoundaryOverride,
        targetCacheKey: activeCacheKey,
        targetTimeframe: timeframe,
      });
      timeframeCacheRef.current[activeCacheKey] = { servicePages, skuPages };
      setResolvedTimeframeCacheKey(activeCacheKey);
      skuPagesByIdRef.current = skuPages;
      servicePagesByIdRef.current = servicePages;
      setSkuPagesById(skuPages);
      setServicePagesById(servicePages);
    } finally {
      setIsHydratingDetails(false);
      setTimeframeHydrationProgress(null);
    }
  };

  const loadOlderIntervals = async (limit = INTERVAL_PAGE_SIZE) => {
    if (!inventory.catalog || isLoadingOlderIntervalsRef.current) {
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
      skuPagesByIdRef.current = nextBatch.skuPagesById;
      servicePagesByIdRef.current = nextBatch.servicePagesById;
      timeframeCacheRef.current[activeCacheKey] = {
        servicePages: nextBatch.servicePagesById,
        skuPages: nextBatch.skuPagesById,
      };
      setResolvedTimeframeCacheKey(activeCacheKey);
      setSkuPagesById(nextBatch.skuPagesById);
      setServicePagesById(nextBatch.servicePagesById);
      return nextBatch.maxPrependedCount;
    } finally {
      isLoadingOlderIntervalsRef.current = false;
      setIsLoadingOlderIntervals(false);
    }
  };

  const skuDetailsById = Object.fromEntries(
    Object.entries(skuPagesById).map(([key, value]) => [key, value?.detail ?? null]),
  ) as Record<string, SenaSkuDetail | null>;
  const serviceDetailsById = Object.fromEntries(
    Object.entries(servicePagesById).map(([key, value]) => [key, value?.detail ?? null]),
  ) as Record<string, SenaServiceDetail | null>;
  const hasOlderIntervals =
    Object.values(skuPagesById).some((page) => page?.hasOlder) ||
    Object.values(servicePagesById).some((page) => page?.hasOlder);

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
