import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { InventorySnapshot, StockReport } from '@shared/inventory';
import type { SenaServiceDetail, SenaServiceDetailPage } from '@shared/sena';
import { INTERVAL_PAGE_SIZE } from '@/components/system/interval-strip';
import { type ChartTimeframe } from '@/components/system/chart-timeframe';
import { useTimeframedIntervalHistory } from '@/components/system/timeframed-interval-history';
import { WorkspaceEmpty, WorkspacePage } from '@/components/system/workspace';
import { scrollWorkspaceViewportToTop } from '@/components/system/workspace-scroll';
import { LoadingMoreIntervalsIsland } from '@/components/system/loading-more-intervals-island';
import { rightRailLayoutClassName } from '@/components/system/right-rail-layout';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { linkedSkuIdsForService } from '@/lib/sena-catalog';
import { activeSenaCatalog } from '@/lib/sena-catalog';
import { readServiceAction } from '@/lib/navigation-state';
import { normalizeServiceDetailPage } from '@/lib/sena-detail-pages';
import { projectInventorySnapshotFromSena } from '@/lib/project-inventory-snapshot-from-sena';
import { usePreferences } from '@/state/preferences';
import { useInventory } from '@/state/inventory';
import { DetailHeroWireframe, WireframeRightRailLayout, WireframeRows } from './loading-wireframes';
import { ServiceDependencyImpact } from './service-detail/dependency-impact';
import { ServiceEvidenceTimeline } from './service-detail/evidence';
import { ServiceDetailActions } from './service-detail/actions';
import { ServiceDetailHero } from './service-detail/hero';
import { ServiceDetailLedger } from './service-detail/ledger';
import { ServiceDetailRightRail } from './service-detail/right-rail';
import { deriveServiceDetailViewModel, type ServiceInspectorSelection } from './service-detail/view-model';

function mergeServiceDetailPages(older: SenaServiceDetail, newer: SenaServiceDetail) {
  return {
    ...newer,
    regimeTimeline: [...older.regimeTimeline, ...newer.regimeTimeline],
  };
}

function ServiceDetailLoadingState({
  showRightRailCards,
  title,
}: {
  showRightRailCards: boolean;
  title: string;
}) {
  return (
    <div className="grid gap-6">
      <DetailHeroWireframe headlineWidthClassName="w-[30rem]" summaryWidthClassName="w-[40rem]" title={title} />

      <WireframeRightRailLayout railCount={4} showRightRailCards={showRightRailCards}>
        <section className="rounded-[2rem] border border-border/60 bg-white px-6 py-5 shadow-[0_16px_44px_rgba(48,31,20,0.08)]">
          <Skeleton className="h-8 w-64 rounded-full" />
          <Skeleton className="mt-3 h-5 w-4/5 rounded-full" />
          <div className="mt-6 flex gap-2">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={`service-interval-${index}`} className="h-10 w-24 rounded-full" />
            ))}
          </div>
          <div className="mt-6 space-y-5">
            {WireframeRows({ chartHeightClassName: 'h-32', rowCount: 4 })}
          </div>
        </section>
      </WireframeRightRailLayout>
    </div>
  );
}

export function ServiceDetailRoute() {
  const { currency, language, showRightRailCards, t, usdToKhrExchangeRate } = usePreferences();
  const {
    catalog,
    listStockReports,
    loadInventorySnapshot,
    clearSenaServiceDetailCache,
    loadSenaServiceDetail,
    observations,
    reports,
    snapshot,
    workspaceSummary,
  } = useInventory();
  const { serviceId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [detailPage, setDetailPage] = useState<SenaServiceDetailPage | null>(null);
  const [loadedSnapshot, setLoadedSnapshot] = useState<InventorySnapshot | null>(null);
  const [loadedReports, setLoadedReports] = useState<StockReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selection, setSelection] = useState<ServiceInspectorSelection>({ type: 'overview' });
  const [olderLoadProgress, setOlderLoadProgress] = useState<{ current: number; total: number } | null>(null);
  const [timeframe, setTimeframe] = useState<ChartTimeframe>('Recent');
  const [pendingTimeframe, setPendingTimeframe] = useState<ChartTimeframe | null>(null);
  const [chartZoomResetToken, setChartZoomResetToken] = useState(0);
  const actionMode = readServiceAction(searchParams);
  const visibleCatalog = useMemo(() => activeSenaCatalog(catalog), [catalog]);

  function updateActionMode(nextMode: typeof actionMode, replace = false) {
    const nextSearchParams = new URLSearchParams(searchParams);
    if (nextMode) {
      nextSearchParams.set('action', nextMode);
    } else {
      nextSearchParams.delete('action');
    }
    setSearchParams(nextSearchParams, { replace });
  }

  useLayoutEffect(() => {
    if (!serviceId) {
      return;
    }

    scrollWorkspaceViewportToTop();
  }, [serviceId]);

  const catalogService = visibleCatalog?.services.find((entry) => entry.serviceId === serviceId) ?? null;
  const projectedSnapshot = useMemo(
    () => (visibleCatalog ? projectInventorySnapshotFromSena(visibleCatalog, observations) : null),
    [observations, visibleCatalog],
  );
  const linkedSkuIds = useMemo(
    () => (visibleCatalog ? linkedSkuIdsForService(visibleCatalog, serviceId) : []),
    [serviceId, visibleCatalog],
  );
  const activeSnapshot = snapshot ?? loadedSnapshot ?? projectedSnapshot;
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
      loadSenaServiceDetail(serviceId, { limit: INTERVAL_PAGE_SIZE }).catch(() => null),
      snapshot ? Promise.resolve(snapshot) : projectedSnapshot ? Promise.resolve(projectedSnapshot) : loadInventorySnapshot(),
      reports.length > 0 ? Promise.resolve(reports) : listStockReports().catch(() => []),
    ]);
    return {
      nextDetail: normalizeServiceDetailPage(nextDetail),
      nextReports,
      nextSnapshot: nextSnapshot ?? null,
    };
  }, [listStockReports, loadInventorySnapshot, loadSenaServiceDetail, projectedSnapshot, reports, serviceId, snapshot]);

  const refreshPage = useCallback(async () => {
    setError(null);
    const { nextDetail, nextReports, nextSnapshot } = await fetchPageData();
    setDetailPage(nextDetail);
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
    setTimeframe('Recent');
    setChartZoomResetToken(0);

    fetchPageData()
      .then(({ nextDetail, nextReports, nextSnapshot }) => {
        if (cancelled) {
          return;
        }
        setDetailPage(nextDetail);
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

  const {
    detail,
    hasOlder,
    isHydratingDetails,
    isLoadingOlder,
    loadOlder,
    page: hydratedPage,
    resolvedTimeframe,
    resetHydratedDetails,
    timeframeHydrationProgress,
  } = useTimeframedIntervalHistory({
    fetchInitialPage: async (limit = INTERVAL_PAGE_SIZE) =>
      normalizeServiceDetailPage(
        (await loadSenaServiceDetail(serviceId, { limit }).catch(() => null)) ?? null,
      ),
    fetchOlderPage: async (beforeIntervalIndex, limit = INTERVAL_PAGE_SIZE) =>
      normalizeServiceDetailPage(
        (await loadSenaServiceDetail(serviceId, { beforeIntervalIndex, limit }).catch(() => null)) ?? null,
      ),
    getLoadedIntervalCount: (page) => page?.detail.regimeTimeline.length ?? 0,
    getOldestIntervalAt: (page) => page?.detail.regimeTimeline[0]?.startAt ?? page?.detail.regimeTimeline[0]?.endAt ?? null,
    initialPage: detailPage,
    intervalCount: workspaceSummary?.intervalCount ?? detailPage?.detail.regimeTimeline.length ?? 0,
    latestObservedAt: workspaceSummary?.latestObservedAt,
    mergeDetails: mergeServiceDetailPages,
    onPruneTransition: () => clearSenaServiceDetailCache(serviceId),
    timeframe,
  });
  const effectiveIsHydratingDetails =
    isHydratingDetails || timeframeHydrationProgress != null || pendingTimeframe != null;

  useEffect(() => {
    if (pendingTimeframe == null) {
      return;
    }
    if (timeframe !== pendingTimeframe) {
      return;
    }
    if (
      resolvedTimeframe === pendingTimeframe ||
      isHydratingDetails ||
      timeframeHydrationProgress != null
    ) {
      setPendingTimeframe(null);
    }
  }, [isHydratingDetails, pendingTimeframe, resolvedTimeframe, timeframe, timeframeHydrationProgress]);

  function handleTimeframeChange(nextTimeframe: ChartTimeframe) {
    if (nextTimeframe === timeframe) {
      return;
    }
    setOlderLoadProgress(null);
    setPendingTimeframe(nextTimeframe);
    setTimeframe(nextTimeframe);
    setChartZoomResetToken((current) => current + 1);
  }

  async function handleResetCharts() {
    setOlderLoadProgress(null);
    await resetHydratedDetails();
    setChartZoomResetToken((current) => current + 1);
  }

  useEffect(() => {
    setDetailPage(hydratedPage);
  }, [hydratedPage]);

  const model = useMemo(() => {
    if (!service || !activeSnapshot) {
      return null;
    }
    return deriveServiceDetailViewModel({
      currency,
      usdToKhrExchangeRate,
      detail,
      language,
      observations,
      reports: activeReports,
      service,
      snapshot: activeSnapshot,
      workspaceSummary,
    });
  }, [activeReports, activeSnapshot, currency, detail, language, observations, service, workspaceSummary, usdToKhrExchangeRate]);

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
          title={t('catalogServiceDetailNotFoundTitle')}
          hint={t('catalogServiceDetailNotFoundDescription')}
          action={
            <Button asChild variant="outline">
              <Link to="/catalog">{t('backToCatalog')}</Link>
            </Button>
          }
        />
      </WorkspacePage>
    );
  }

  if (!model && (isLoading || !activeSnapshot)) {
    const loadingTitle = service?.name ?? catalogService?.name ?? serviceId ?? t('catalogServiceDetailTitle');
    return (
      <WorkspacePage>
        <ServiceDetailLoadingState
          showRightRailCards={showRightRailCards}
          title={loadingTitle}
        />
      </WorkspacePage>
    );
  }

  if (!model) {
    return (
      <WorkspacePage>
        <WorkspaceEmpty
          title={t('catalogServiceDetailUnavailableTitle')}
          hint={error ?? t('catalogServiceDetailUnavailableDescription')}
          action={
            <Button asChild variant="outline">
              <Link to="/catalog">{t('backToCatalog')}</Link>
            </Button>
          }
        />
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage>
      <LoadingMoreIntervalsIsland
        currentBatch={(timeframeHydrationProgress ?? olderLoadProgress)?.current ?? null}
        totalBatches={(timeframeHydrationProgress ?? olderLoadProgress)?.total ?? null}
        visible={effectiveIsHydratingDetails || isLoadingOlder || olderLoadProgress != null}
      />
      <div className="grid gap-6">
        {error ? (
          <div className="rounded-[1.4rem] border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <ServiceDetailHero
          actions={(
            <ServiceDetailActions
              actions={model.actions}
              mode={actionMode}
              onModeChange={(nextMode) => updateActionMode(nextMode, true)}
              onComplete={refreshPage}
            />
          )}
          model={model}
        />

        <div className={rightRailLayoutClassName(showRightRailCards)}>
          <div className="grid min-w-0 gap-6">
            <ServiceDetailLedger
              chartZoomResetToken={chartZoomResetToken}
              hasOlderIntervals={hasOlder}
              isHydratingDetails={effectiveIsHydratingDetails}
              isLoadingOlderIntervals={isLoadingOlder}
              loadOlderIntervals={loadOlder}
              model={model}
              onOlderLoadProgressChange={setOlderLoadProgress}
              onResetCharts={() => void handleResetCharts()}
              onTimeframeChange={handleTimeframeChange}
              selection={selection}
              setSelection={setSelection}
              timeframe={timeframe}
            />
            <div className="grid gap-6 xl:grid-cols-2">
              <ServiceDependencyImpact rows={model.dependencyImpact} />
              <ServiceEvidenceTimeline evidence={model.evidence} />
            </div>
          </div>
          {showRightRailCards ? <ServiceDetailRightRail model={model} selection={selection} /> : null}
        </div>
      </div>
    </WorkspacePage>
  );
}
