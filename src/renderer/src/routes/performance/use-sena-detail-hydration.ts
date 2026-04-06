import { useEffect, useState } from 'react';
import type { SenaServiceDetail, SenaServiceDetailPage, SenaSkuDetail, SenaSkuDetailPage } from '@shared/sena';
import { INTERVAL_PAGE_SIZE } from '@/components/system/interval-strip';
import { normalizeServiceDetailPage, normalizeSkuDetailPage } from '@/lib/sena-detail-pages';
import { useInventory } from '@/state/inventory';

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

export function useSenaDetailHydration() {
  const inventory = useInventory();
  const [skuPagesById, setSkuPagesById] = useState<Record<string, SenaSkuDetailPage | null>>({});
  const [servicePagesById, setServicePagesById] = useState<Record<string, SenaServiceDetailPage | null>>({});
  const [isHydratingDetails, setIsHydratingDetails] = useState(false);
  const [isLoadingOlderIntervals, setIsLoadingOlderIntervals] = useState(false);

  useEffect(() => {
    if (!inventory.catalog || !inventory.workspaceSummary) {
      setSkuPagesById({});
      setServicePagesById({});
      setIsHydratingDetails(false);
      return;
    }

    let active = true;
    setIsHydratingDetails(true);

    void Promise.all([
      Promise.all(
        inventory.catalog.skus.map(async (sku) => {
          try {
            return [sku.skuId, normalizeSkuDetailPage(await inventory.loadSenaSkuDetail(sku.skuId, { limit: INTERVAL_PAGE_SIZE }))] as const;
          } catch {
            return [sku.skuId, null] as const;
          }
        }),
      ),
      Promise.all(
        inventory.catalog.services.map(async (service) => {
          try {
            return [service.serviceId, normalizeServiceDetailPage(await inventory.loadSenaServiceDetail(service.serviceId, { limit: INTERVAL_PAGE_SIZE }))] as const;
          } catch {
            return [service.serviceId, null] as const;
          }
        }),
      ),
    ])
      .then(([skuEntries, serviceEntries]) => {
        if (!active) {
          return;
        }
        setSkuPagesById(Object.fromEntries(skuEntries));
        setServicePagesById(Object.fromEntries(serviceEntries));
        setIsHydratingDetails(false);
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setIsHydratingDetails(false);
      });

    return () => {
      active = false;
    };
  }, [inventory, inventory.catalog, inventory.workspaceSummary]);

  const loadOlderIntervals = async () => {
    if (!inventory.catalog || isLoadingOlderIntervals) {
      return 0;
    }
    setIsLoadingOlderIntervals(true);
    try {
      let maxPrependedCount = 0;
      const skuEntries = await Promise.all(
        inventory.catalog.skus.map(async (sku) => {
          const current = skuPagesById[sku.skuId];
          if (!current?.hasOlder || current.nextBeforeIntervalIndex == null) {
            return [sku.skuId, current ?? null] as const;
          }
          const older = normalizeSkuDetailPage(await inventory.loadSenaSkuDetail(sku.skuId, {
            beforeIntervalIndex: current.nextBeforeIntervalIndex,
            limit: INTERVAL_PAGE_SIZE,
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
        }),
      );
      const serviceEntries = await Promise.all(
        inventory.catalog.services.map(async (service) => {
          const current = servicePagesById[service.serviceId];
          if (!current?.hasOlder || current.nextBeforeIntervalIndex == null) {
            return [service.serviceId, current ?? null] as const;
          }
          const older = normalizeServiceDetailPage(await inventory.loadSenaServiceDetail(service.serviceId, {
            beforeIntervalIndex: current.nextBeforeIntervalIndex,
            limit: INTERVAL_PAGE_SIZE,
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
        }),
      );
      setSkuPagesById(Object.fromEntries(skuEntries));
      setServicePagesById(Object.fromEntries(serviceEntries));
      return maxPrependedCount;
    } finally {
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
    serviceDetailsById,
    skuDetailsById,
  };
}
