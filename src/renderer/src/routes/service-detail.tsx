import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { InventorySnapshot, StockReport } from '@shared/inventory';
import type { SenaServiceDetail, SenaServiceDetailPage } from '@shared/sena';
import { NavigationBackIcon } from '@icons/navigation';
import { INTERVAL_PAGE_SIZE } from '@/components/system/interval-strip';
import { useTimeframedIntervalHistory } from '@/components/system/timeframed-interval-history';
import { ChartLedgerOverlay, useHeldTradingChartBusy, useTradingChartController } from '@/components/system/trading-chart';
import { WorkspaceEmpty, WorkspacePage } from '@/components/system/workspace';
import { scrollWorkspaceViewportToTop } from '@/components/system/workspace-scroll';
import { LoadingMoreIntervalsIsland } from '@/components/system/loading-more-intervals-island';
import { rightRailLayoutClassName } from '@/components/system/right-rail-layout';
import { buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { linkedSkuIdsForService } from '@/lib/sena-catalog';
import { activeSenaCatalog } from '@/lib/sena-catalog';
import { normalizeServiceDetailPage } from '@/lib/sena-detail-pages';
import { deriveSenaDetailCacheFreshnessFingerprint, readPersistedSenaDetailPage } from '@/lib/sena-detail-page-cache';
import { projectInventorySnapshotFromSena } from '@/lib/project-inventory-snapshot-from-sena';
import { translateUiLiteral } from '@/lib/translations';
import { useBenchmarkRouteReady } from '@/lib/benchmark-route-ready';
import { buildRememberedCatalogHref, useRememberedPageValue } from '@/lib/page-state-memory';
import { traceRenderer } from '@/lib/trace';
import { usePreferences } from '@/state/preferences';
import { useInventoryActions, useInventoryState } from '@/state/inventory';
import { DetailHeroWireframe, WireframeRightRailLayout, WireframeRows } from './loading-wireframes';
import { detailPanelGridClassName } from './detail-panels';
import { ServiceDependencyImpact } from './service-detail/dependency-impact';
import { ServiceEvidenceTimeline } from './service-detail/evidence';
import { ServiceDetailActions } from './service-detail/actions';
import { ServiceDetailHero } from './service-detail/hero';
import { ServiceTradingChartLedger } from './service-detail/trading-chart-ledger';
import { ServiceDetailRightRail } from './service-detail/right-rail';
import { deriveServiceDetailViewModel, type ServiceInspectorSelection } from './service-detail/view-model';

function chartSearchValue(searchParams: URLSearchParams) {
  return searchParams.get('chart');
}

function buildServiceDetailSearchParams(
  searchParams: URLSearchParams,
  options: {
    action?: string | null;
    chart?: string | null;
  },
) {
  const nextSearchParams = new URLSearchParams(searchParams);
  if (options.action) {
    nextSearchParams.set('action', options.action);
  } else if (options.action === null) {
    nextSearchParams.delete('action');
  }
  if (options.chart) {
    nextSearchParams.set('chart', options.chart);
  } else if (options.chart === null) {
    nextSearchParams.delete('chart');
  }
  return nextSearchParams;
}

function mergeServiceDetailPages(older: SenaServiceDetail, newer: SenaServiceDetail) {
  return {
    ...newer,
    regimeTimeline: [...older.regimeTimeline, ...newer.regimeTimeline],
  };
}

function rememberedContributorValidator(value: unknown) {
  return typeof value === 'string' ? value : null;
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
    observations,
    reports,
    snapshot,
    workspaceSummary,
  } = useInventoryState();
  const {
    listStockReports,
    loadInventorySnapshot,
    clearSenaServiceDetailCache,
    loadSenaServiceDetail,
  } = useInventoryActions();
  const { serviceId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [actionMode, setActionMode] = useState<Parameters<typeof ServiceDetailActions>[0]['mode']>(null);
  const [detailPage, setDetailPage] = useState<SenaServiceDetailPage | null>(null);
  const [loadedSnapshot, setLoadedSnapshot] = useState<InventorySnapshot | null>(null);
  const [loadedReports, setLoadedReports] = useState<StockReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selection, setSelection] = useState<ServiceInspectorSelection>({ type: 'overview' });
  const [rememberedContributorSkuId, setRememberedContributorSkuId] = useRememberedPageValue(
    'catalog',
    'serviceContributor',
    '',
    rememberedContributorValidator,
    { scope: `service:${serviceId}` },
  );
  const initialDetailRequestRef = useRef<Promise<SenaServiceDetailPage | null> | null>(null);
  const listStockReportsRef = useRef(listStockReports);
  const loadInventorySnapshotRef = useRef(loadInventorySnapshot);
  const loadSenaServiceDetailRef = useRef(loadSenaServiceDetail);
  const projectedSnapshotRef = useRef<InventorySnapshot | null>(null);
  const reportsRef = useRef(reports);
  const snapshotRef = useRef(snapshot);
  const chartController = useTradingChartController({
    subjectId: serviceId,
    subtype: 'service',
    traceScope: 'service-detail/chart-controller',
  });
  const isLedgerExpanded = chartSearchValue(searchParams) === 'expanded';
  const visibleCatalog = useMemo(() => activeSenaCatalog(catalog), [catalog]);
  const detailCacheFreshnessFingerprint = useMemo(
    () => deriveSenaDetailCacheFreshnessFingerprint(workspaceSummary),
    [workspaceSummary?.latestObservedAt, workspaceSummary?.runId],
  );
  const cachedRecentDetailPage = useMemo(
    () =>
      typeof window === 'undefined'
        ? null
        : readPersistedSenaDetailPage({
          beforeIntervalIndex: null,
          entityId: serviceId,
          entityType: 'service',
          freshnessFingerprint: detailCacheFreshnessFingerprint,
          limit: INTERVAL_PAGE_SIZE,
          storage: window.localStorage,
        }),
    [detailCacheFreshnessFingerprint, serviceId],
  );

  function setLedgerExpanded(nextExpanded: boolean, replace = false) {
    const nextSearchParams = buildServiceDetailSearchParams(searchParams, {
      chart: nextExpanded ? 'expanded' : null,
    });
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

  useEffect(() => {
    listStockReportsRef.current = listStockReports;
    loadInventorySnapshotRef.current = loadInventorySnapshot;
    loadSenaServiceDetailRef.current = loadSenaServiceDetail;
    projectedSnapshotRef.current = projectedSnapshot;
    reportsRef.current = reports;
    snapshotRef.current = snapshot;
  }, [listStockReports, loadInventorySnapshot, loadSenaServiceDetail, projectedSnapshot, reports, snapshot]);

  const fetchPageData = useCallback(async () => {
    const currentProjectedSnapshot = projectedSnapshotRef.current;
    const currentReports = reportsRef.current;
    const currentSnapshot = snapshotRef.current;
    traceRenderer('service-detail', 'fetch page data start', {
      hasProjectedSnapshot: Boolean(currentProjectedSnapshot),
      hasSnapshot: Boolean(currentSnapshot),
      reportCount: currentReports.length,
      serviceId,
    });
    const detailRequest = loadSenaServiceDetailRef.current(serviceId, { limit: INTERVAL_PAGE_SIZE }).catch(() => null);
    initialDetailRequestRef.current = detailRequest;
    const [nextDetail, nextSnapshot, nextReports] = await Promise.all([
      detailRequest,
      currentSnapshot
        ? Promise.resolve(currentSnapshot)
        : currentProjectedSnapshot
          ? Promise.resolve(currentProjectedSnapshot)
          : loadInventorySnapshotRef.current(),
      currentReports.length > 0 ? Promise.resolve(currentReports) : listStockReportsRef.current().catch(() => []),
    ]);
    const normalizedDetail = normalizeServiceDetailPage(nextDetail);
    traceRenderer('service-detail', 'fetch page data complete', {
      hasDetail: Boolean(normalizedDetail),
      hasOlder: normalizedDetail?.hasOlder ?? null,
      latestIntervalIndex: normalizedDetail?.latestIntervalIndex ?? null,
      nextBeforeIntervalIndex: normalizedDetail?.nextBeforeIntervalIndex ?? null,
      reportCount: nextReports.length,
      serviceId,
      snapshotServiceCount: nextSnapshot?.services.length ?? null,
    });
    return {
      nextDetail: normalizedDetail,
      nextReports,
      nextSnapshot: nextSnapshot ?? null,
    };
  }, [serviceId]);

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

    traceRenderer('service-detail', 'load effect start', {
      cachedHasDetail: Boolean(cachedRecentDetailPage),
      cachedLatestIntervalIndex: cachedRecentDetailPage?.latestIntervalIndex ?? null,
      cachedRegimeCount: cachedRecentDetailPage?.detail.regimeTimeline.length ?? null,
      serviceId,
    });
    setIsLoading(true);
    setError(null);
    setDetailPage(cachedRecentDetailPage);
    initialDetailRequestRef.current = cachedRecentDetailPage ? Promise.resolve(cachedRecentDetailPage) : null;

    fetchPageData()
      .then(({ nextDetail, nextReports, nextSnapshot }) => {
        if (cancelled) {
          traceRenderer('service-detail', 'load effect ignored after cancel', { serviceId });
          return;
        }
        traceRenderer('service-detail', 'load effect applying data', {
          hasDetail: Boolean(nextDetail),
          hasSnapshot: Boolean(nextSnapshot),
          reportCount: nextReports.length,
          serviceId,
        });
        setDetailPage(nextDetail);
        setLoadedSnapshot(nextSnapshot);
        setLoadedReports(nextReports);
      })
      .catch((nextError) => {
        if (!cancelled) {
          traceRenderer('service-detail', 'load effect failed', {
            error: nextError instanceof Error ? nextError.message : String(nextError),
            serviceId,
          });
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
      traceRenderer('service-detail', 'load effect cleanup', { serviceId });
      initialDetailRequestRef.current = null;
    };
  }, [cachedRecentDetailPage, fetchPageData, serviceId]);

  const {
    detail,
    hasOlder,
    isHydratingDetails,
    isLoadingOlder,
    loadOlder,
    resolvedTimeframe,
    resolvedTimeframeCacheKey,
    resetHydratedDetails,
    timeframeHydrationProgress,
  } = useTimeframedIntervalHistory({
    fetchInitialPage: async (limit = INTERVAL_PAGE_SIZE) =>
      normalizeServiceDetailPage(
        (await loadSenaServiceDetail(serviceId, { limit }).catch(() => null)) ?? null,
      ),
    seedInitialPage: async () => initialDetailRequestRef.current ? normalizeServiceDetailPage(await initialDetailRequestRef.current) : undefined,
    fetchOlderPage: async (beforeIntervalIndex, limit = INTERVAL_PAGE_SIZE) =>
      normalizeServiceDetailPage(
        (await loadSenaServiceDetail(serviceId, { beforeIntervalIndex, limit, strategy: 'network-only' }).catch(() => null)) ?? null,
      ),
    getLoadedIntervalCount: (page) => page?.detail.regimeTimeline.length ?? 0,
    getOldestIntervalAt: (page) => page?.detail.regimeTimeline[0]?.startAt ?? page?.detail.regimeTimeline[0]?.endAt ?? null,
    initialPage: detailPage,
    intervalCount: workspaceSummary?.intervalCount ?? detailPage?.detail.regimeTimeline.length ?? 0,
    latestObservedAt: workspaceSummary?.latestObservedAt,
    mergeDetails: mergeServiceDetailPages,
    onPruneTransition: () => clearSenaServiceDetailCache(serviceId),
    timeframe: chartController.timeframe,
    timeframeBoundaryOverride: chartController.timeframeBoundaryOverride,
    timeframeCacheKey: chartController.timeframeCacheKey,
    traceScope: 'service-detail/timeframed-history',
  });

  const effectiveIsHydratingDetails =
    isHydratingDetails ||
    timeframeHydrationProgress != null ||
    chartController.pendingTimeframe != null ||
    chartController.pendingCustomTimeframeRange != null;
  const isChartLoading =
    effectiveIsHydratingDetails ||
    isLoadingOlder ||
    chartController.olderLoadProgress != null;
  const heldIsChartLoading = useHeldTradingChartBusy(isChartLoading);

  useEffect(() => {
    traceRenderer('service-detail', 'chart hydration state', {
      isHydratingDetails,
      pendingCustomTimeframeRange: chartController.pendingCustomTimeframeRange,
      pendingTimeframe: chartController.pendingTimeframe,
      resolvedTimeframe,
      resolvedTimeframeCacheKey,
      serviceId,
      timeframe: chartController.timeframe,
      timeframeBoundaryOverride: chartController.timeframeBoundaryOverride?.toISOString() ?? null,
      timeframeCacheKey: chartController.timeframeCacheKey ?? null,
      timeframeHydrationProgress,
    });
    chartController.settlePendingTimeframe({
      isHydratingDetails,
      resolvedTimeframe,
      resolvedTimeframeCacheKey,
      timeframeHydrationProgress,
    });
  }, [
    chartController.pendingCustomTimeframeRange,
    chartController.pendingTimeframe,
    chartController.settlePendingTimeframe,
    chartController.timeframe,
    chartController.timeframeBoundaryOverride,
    chartController.timeframeCacheKey,
    isHydratingDetails,
    resolvedTimeframe,
    resolvedTimeframeCacheKey,
    serviceId,
    timeframeHydrationProgress,
  ]);

  async function handleResetCharts() {
    await chartController.handleResetCharts(resetHydratedDetails);
  }

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

  useBenchmarkRouteReady(
    'service-detail',
    !isLoading && (!serviceId || Boolean(model) || Boolean(error) || (!catalogService && !service)),
    useMemo(
      () => ({
        hasWorkspaceSummary: Boolean(workspaceSummary),
        serviceId,
      }),
      [catalogService, error, model, service, serviceId, workspaceSummary],
    ),
  );

  useEffect(() => {
    if (!model) {
      setSelection((current) => (current.type === 'overview' ? current : { type: 'overview' }));
      return;
    }

    if (
      rememberedContributorSkuId &&
      selection.type === 'overview' &&
      model.contributors.some((entry) => entry.skuId === rememberedContributorSkuId)
    ) {
      setSelection({ type: 'contributor', skuId: rememberedContributorSkuId });
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
  }, [model, rememberedContributorSkuId, selection.type]);

  const setRememberedSelection = useCallback((nextSelection: ServiceInspectorSelection) => {
    setSelection(nextSelection);
    if (nextSelection.type === 'contributor' && nextSelection.skuId) {
      setRememberedContributorSkuId(nextSelection.skuId);
    } else if (nextSelection.type === 'overview') {
      setRememberedContributorSkuId('');
    }
  }, [setRememberedContributorSkuId]);

  if (!catalogService && !service) {
    return (
      <WorkspacePage>
        <WorkspaceEmpty
          title={t('catalogServiceDetailNotFoundTitle')}
          hint={t('catalogServiceDetailNotFoundDescription')}
          action={
            <Link className={buttonVariants({ variant: 'outline' })} to={buildRememberedCatalogHref()}>
              <NavigationBackIcon data-icon="inline-start" />
              {t('backToCatalog')}
            </Link>
          }
        />
      </WorkspacePage>
    );
  }

  if (!model && (isLoading || !activeSnapshot)) {
    const loadingTitle = service?.name ?? catalogService?.name ?? t('catalogServiceDetailTitle');
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
            <Link className={buttonVariants({ variant: 'outline' })} to={buildRememberedCatalogHref()}>
              <NavigationBackIcon data-icon="inline-start" />
              {t('backToCatalog')}
            </Link>
          }
        />
      </WorkspacePage>
    );
  }

  const lowerDetailPanelCount =
    (model.dependencyImpact.length > 0 ? 1 : 0) +
    1;

  return (
    <WorkspacePage>
      {!isLedgerExpanded ? (
        <LoadingMoreIntervalsIsland
          currentBatch={(timeframeHydrationProgress ?? chartController.olderLoadProgress)?.current ?? null}
          totalBatches={(timeframeHydrationProgress ?? chartController.olderLoadProgress)?.total ?? null}
          visible={heldIsChartLoading}
        />
      ) : null}
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
              onModeChange={setActionMode}
              onComplete={refreshPage}
            />
          )}
          imagePath={catalogService?.imagePath}
          model={model}
        />

        <div className={rightRailLayoutClassName(showRightRailCards)}>
          <div className="grid min-w-0 gap-6">
            <div>
              {!isLedgerExpanded ? (
                <ServiceTradingChartLedger
                  chartZoomResetToken={chartController.chartZoomResetToken}
                  chartLayoutPreferences={chartController.chartLayoutPreferences}
                  chartResolution={chartController.chartResolution}
                  customChartResolution={chartController.customChartResolution}
                  hasOlderIntervals={hasOlder}
                  isHydratingDetails={effectiveIsHydratingDetails}
                  isVisuallyBusy={heldIsChartLoading}
                  isLoadingOlderIntervals={isLoadingOlder}
                  loadOlderIntervals={loadOlder}
                  model={model}
                  onChartLayoutPreferencesChange={chartController.handleChartLayoutPreferencesChange}
                  onChartResolutionChange={chartController.handleChartResolutionChange}
                  customTimeframeRange={chartController.customTimeframeRange}
                  onOlderLoadProgressChange={chartController.setOlderLoadProgress}
                  onCustomTimeframeChange={chartController.handleCustomTimeframeChange}
                  onResetCharts={() => void handleResetCharts()}
                  onTimeframeChange={chartController.handleTimeframeChange}
                  onToggleExpand={() => setLedgerExpanded(true)}
                  selection={selection}
                  setSelection={setRememberedSelection}
                  timeframe={chartController.timeframe}
                />
              ) : (
                <div
                  aria-hidden="true"
                  className="min-h-[100svh] rounded-[2rem]"
                />
              )}
            </div>
            <div className={detailPanelGridClassName(lowerDetailPanelCount)}>
              <ServiceDependencyImpact rows={model.dependencyImpact} />
              <ServiceEvidenceTimeline evidence={model.evidence} />
            </div>
          </div>
          {showRightRailCards ? <ServiceDetailRightRail model={model} selection={selection} /> : null}
        </div>
      </div>
      {isLedgerExpanded ? (
        <ChartLedgerOverlay
          ariaLabel={translateUiLiteral(language, 'Expanded ledger for {name}', { name: model.identity.name })}
          closeAriaLabel={translateUiLiteral(language, 'Close expanded chart overlay')}
          panelClassName="grid"
          onClose={() => setLedgerExpanded(false, true)}
        >
          <ServiceTradingChartLedger
            chartZoomResetToken={chartController.chartZoomResetToken}
            chartLayoutPreferences={chartController.chartLayoutPreferences}
            chartResolution={chartController.chartResolution}
            customChartResolution={chartController.customChartResolution}
            expanded
            hasOlderIntervals={hasOlder}
            isHydratingDetails={effectiveIsHydratingDetails}
            isVisuallyBusy={heldIsChartLoading}
            isLoadingOlderIntervals={isLoadingOlder}
            loadOlderIntervals={loadOlder}
            model={model}
            onChartLayoutPreferencesChange={chartController.handleChartLayoutPreferencesChange}
            onChartResolutionChange={chartController.handleChartResolutionChange}
            customTimeframeRange={chartController.customTimeframeRange}
            onOlderLoadProgressChange={chartController.setOlderLoadProgress}
            onCustomTimeframeChange={chartController.handleCustomTimeframeChange}
            onResetCharts={() => void handleResetCharts()}
            onTimeframeChange={chartController.handleTimeframeChange}
            onToggleExpand={() => setLedgerExpanded(false, true)}
            selection={selection}
            setSelection={setRememberedSelection}
            timeframe={chartController.timeframe}
          />
        </ChartLedgerOverlay>
      ) : null}
    </WorkspacePage>
  );
}
