import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { InventorySnapshot, StockReport } from '@shared/inventory';
import type { SenaServiceDetail } from '@shared/sena';
import { WorkspaceEmpty, WorkspacePage } from '@/components/system/workspace';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { linkedSkuIdsForService } from '@/lib/sena-catalog';
import { usePreferences } from '@/state/preferences';
import { useInventory } from '@/state/inventory';
import { ServiceDependencyImpact } from './service-detail/dependency-impact';
import { ServiceEvidenceTimeline } from './service-detail/evidence';
import { ServiceDetailActions } from './service-detail/actions';
import { ServiceDetailHero } from './service-detail/hero';
import { ServiceDetailLedger } from './service-detail/ledger';
import { ServiceDetailRightRail } from './service-detail/right-rail';
import { deriveServiceDetailViewModel, type ServiceInspectorSelection } from './service-detail/view-model';

function ServiceDetailLoadingState() {
  return (
    <div className="grid gap-6">
      <section className="rounded-[2rem] border border-border/60 bg-white px-6 py-5 shadow-[0_16px_44px_rgba(48,31,20,0.08)]">
        <div className="flex flex-col gap-4 border-b border-border/60 pb-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="grid gap-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 rounded-full" />
              <Skeleton className="h-7 w-56 rounded-full" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-7 w-20 rounded-full" />
              <Skeleton className="h-7 w-20 rounded-full" />
              <Skeleton className="h-7 w-32 rounded-full" />
            </div>
            <Skeleton className="h-12 w-[30rem] max-w-full rounded-full" />
            <Skeleton className="h-5 w-[40rem] max-w-full rounded-full" />
          </div>
          <div className="grid grid-cols-2 gap-2 lg:w-[25rem]">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={`service-action-${index}`} className="h-10 rounded-full" />
            ))}
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-[1.4rem] border border-border/60 bg-border/50 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={`service-ribbon-${index}`} className="bg-white px-4 py-3">
              <Skeleton className="h-4 w-20 rounded-full" />
              <Skeleton className="mt-2 h-6 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="rounded-[2rem] border border-border/60 bg-white px-6 py-5 shadow-[0_16px_44px_rgba(48,31,20,0.08)]">
          <Skeleton className="h-8 w-64 rounded-full" />
          <Skeleton className="mt-3 h-5 w-4/5 rounded-full" />
          <div className="mt-6 flex gap-2">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={`service-interval-${index}`} className="h-10 w-24 rounded-full" />
            ))}
          </div>
          <div className="mt-6 space-y-5">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={`service-lane-${index}`} className="space-y-3 border-t border-border/60 pt-5 first:border-t-0 first:pt-0">
                <Skeleton className="h-6 w-44 rounded-full" />
                <Skeleton className="h-32 w-full rounded-[1.4rem]" />
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[2rem] border border-border/60 bg-white p-4 shadow-[0_16px_44px_rgba(48,31,20,0.08)]">
          <div className="space-y-4">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={`service-rail-${index}`} className="rounded-[1.4rem] border border-border/60 bg-white px-4 py-4">
                <Skeleton className="h-4 w-28 rounded-full" />
                <Skeleton className="mt-4 h-6 w-40 rounded-full" />
                <Skeleton className="mt-2 h-4 w-full rounded-full" />
                <Skeleton className="mt-2 h-4 w-4/5 rounded-full" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export function ServiceDetailRoute() {
  const { currency, language } = usePreferences();
  const {
    catalog,
    listStockReports,
    loadInventorySnapshot,
    loadSenaServiceDetail,
    observations,
    reports,
    snapshot,
    workspaceSummary,
  } = useInventory();
  const { serviceId = '' } = useParams();
  const [detail, setDetail] = useState<SenaServiceDetail | null>(null);
  const [loadedSnapshot, setLoadedSnapshot] = useState<InventorySnapshot | null>(null);
  const [loadedReports, setLoadedReports] = useState<StockReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selection, setSelection] = useState<ServiceInspectorSelection>({ type: 'overview' });

  const catalogService = catalog?.services.find((entry) => entry.serviceId === serviceId) ?? null;
  const linkedSkuIds = useMemo(
    () => (catalog ? linkedSkuIdsForService(catalog, serviceId) : []),
    [catalog, serviceId],
  );
  const activeSnapshot = snapshot ?? loadedSnapshot;
  const activeReports = reports.length > 0 ? reports : loadedReports ?? [];
  const snapshotService = activeSnapshot?.services.find((entry) => entry.serviceId === serviceId) ?? null;
  const service =
    snapshotService ??
    (catalogService
      ? {
          serviceId: catalogService.serviceId,
          name: catalogService.name,
          description: catalogService.description,
          price: catalogService.price,
          skuIds: linkedSkuIds,
        }
      : null);

  const fetchPageData = useCallback(async () => {
    const [nextDetail, nextSnapshot, nextReports] = await Promise.all([
      loadSenaServiceDetail(serviceId).catch(() => null),
      snapshot ? Promise.resolve(snapshot) : loadInventorySnapshot(),
      reports.length > 0 ? Promise.resolve(reports) : listStockReports().catch(() => []),
    ]);
    return {
      nextDetail,
      nextReports,
      nextSnapshot: nextSnapshot ?? null,
    };
  }, [listStockReports, loadInventorySnapshot, loadSenaServiceDetail, reports, serviceId, snapshot]);

  const refreshPage = useCallback(async () => {
    setError(null);
    const { nextDetail, nextReports, nextSnapshot } = await fetchPageData();
    setDetail(nextDetail);
    setLoadedSnapshot(nextSnapshot);
    setLoadedReports(nextReports);
  }, [fetchPageData]);

  useEffect(() => {
    let cancelled = false;

    if (!serviceId) {
      return;
    }

    setIsLoading(true);
    setError(null);

    fetchPageData()
      .then(({ nextDetail, nextReports, nextSnapshot }) => {
        if (cancelled) {
          return;
        }
        setDetail(nextDetail);
        setLoadedSnapshot(nextSnapshot);
        setLoadedReports(nextReports);
      })
      .catch((nextError) => {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : 'Failed to load service detail.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fetchPageData, serviceId]);

  const model = useMemo(() => {
    if (!service || !activeSnapshot) {
      return null;
    }
    return deriveServiceDetailViewModel({
      currency,
      detail,
      language,
      observations,
      reports: activeReports,
      service,
      snapshot: activeSnapshot,
      workspaceSummary,
    });
  }, [activeReports, activeSnapshot, currency, detail, language, observations, service, workspaceSummary]);

  useEffect(() => {
    if (!model) {
      setSelection({ type: 'overview' });
      return;
    }

    setSelection((current) => {
      if (current.type === 'contributor' && current.skuId) {
        return model.contributors.some((entry) => entry.skuId === current.skuId) ? current : { type: 'overview' };
      }
      if (current.type === 'interval' && current.intervalIndex != null) {
        return model.intervals.some((entry) => entry.intervalIndex === current.intervalIndex) ? current : { type: 'overview' };
      }
      return current;
    });
  }, [model]);

  if (!catalogService && !service) {
    return (
      <WorkspacePage>
        <WorkspaceEmpty
          title="Service not found"
          description="This service is not present in the current SENA catalog."
          action={
            <Button asChild variant="outline">
              <Link to="/catalog">Return to catalog</Link>
            </Button>
          }
        />
      </WorkspacePage>
    );
  }

  if (!model && (isLoading || !activeSnapshot)) {
    return (
      <WorkspacePage>
        <ServiceDetailLoadingState />
      </WorkspacePage>
    );
  }

  if (!model) {
    return (
      <WorkspacePage>
        <WorkspaceEmpty
          title="SENA service detail unavailable"
          description={error ?? 'No service viability detail is available for this service yet.'}
          action={
            <Button asChild variant="outline">
              <Link to="/catalog">Return to catalog</Link>
            </Button>
          }
        />
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage>
      <div className="grid gap-6">
        {error ? (
          <div className="rounded-[1.4rem] border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <ServiceDetailHero
          actions={<ServiceDetailActions actions={model.actions} onComplete={refreshPage} />}
          model={model}
        />

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid min-w-0 gap-6">
            <ServiceDetailLedger model={model} selection={selection} setSelection={setSelection} />
            <div className="grid gap-6 xl:grid-cols-2">
              <ServiceDependencyImpact rows={model.dependencyImpact} />
              <ServiceEvidenceTimeline evidence={model.evidence} />
            </div>
          </div>
          <ServiceDetailRightRail model={model} selection={selection} />
        </div>
      </div>
    </WorkspacePage>
  );
}
