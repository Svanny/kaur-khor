import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, generatePath, useParams, useSearchParams } from 'react-router-dom';
import type { SenaSkuDetailPage } from '@shared/sena';
import { NavigationBackIcon } from '@icons/navigation';
import { INTERVAL_PAGE_SIZE } from '@/components/system/interval-strip';
import { useTimeframedIntervalHistory } from '@/components/system/timeframed-interval-history';
import { ChartLedgerOverlay, useHeldTradingChartBusy, useTradingChartController } from '@/components/system/trading-chart';
import { WorkspaceEmpty, WorkspacePage } from '@/components/system/workspace';
import { LoadingMoreIntervalsIsland } from '@/components/system/loading-more-intervals-island';
import { rightRailLayoutClassName } from '@/components/system/right-rail-layout';
import { Button } from '@/components/ui/button';
import { cardFrameClassName, cardSurfaceClassName } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { normalizeSkuDetailPage } from '@/lib/sena-detail-pages';
import { deriveSenaDetailCacheFreshnessFingerprint, readPersistedSenaDetailPage } from '@/lib/sena-detail-page-cache';
import { hasActiveSenaSku } from '@/lib/sena-catalog';
import { buildRememberedCatalogHref } from '@/lib/page-state-memory';
import { translateUiLiteral } from '@/lib/translations';
import { usePreferences } from '@/state/preferences';
import { useInventory } from '@/state/inventory';
import { DetailHeroWireframe, WireframeRightRailLayout, WireframeRows } from '../loading-wireframes';
import { detailPanelGridClassName } from '../detail-panels';
import { SkuDetailActions } from './actions';
import { bootstrapSkuDetail, buildSkuDetailBootstrapPreview, type BootstrapSkuDetailResult } from './bootstrap';
import { SkuDetailEvidence } from './evidence';
import { SkuDetailExposure } from './exposure';
import { SkuDetailHero } from './hero';
import { SkuDetailLedger } from './ledger';
import { SkuDetailRightRail } from './right-rail';
import { deriveSenaSkuDetailViewModel } from './view-model';

function mergeSkuDetailPages(older: NonNullable<BootstrapSkuDetailResult['detail']>, newer: NonNullable<BootstrapSkuDetailResult['detail']>) {
  return {
    ...newer,
    inventoryPosterior: [...older.inventoryPosterior, ...newer.inventoryPosterior],
    demandPosterior: [...older.demandPosterior, ...newer.demandPosterior],
    pipelinePosterior: [...older.pipelinePosterior, ...newer.pipelinePosterior],
    leadTimePosterior: [...older.leadTimePosterior, ...newer.leadTimePosterior],
  };
}

function emptyBootstrap(): BootstrapSkuDetailResult | null {
  return null;
}

function skuDetailStorage() {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function chartSearchValue(searchParams: URLSearchParams) {
  return searchParams.get('chart');
}

function buildSkuDetailSearchParams(
  searchParams: URLSearchParams,
  options: {
    chart?: string | null;
  },
) {
  const nextSearchParams = new URLSearchParams(searchParams);
  if (options.chart) {
    nextSearchParams.set('chart', options.chart);
  } else {
    nextSearchParams.delete('chart');
  }
  return nextSearchParams;
}

function SkuDetailLoadingState({
  showRightRailCards,
  title,
}: {
  showRightRailCards: boolean;
  title: string;
}) {
  return (
    <div className="grid gap-6">
      <DetailHeroWireframe title={title} />

      <WireframeRightRailLayout railCount={5} showRightRailCards={showRightRailCards}>
          <section className={`${cardFrameClassName} ${cardSurfaceClassName} rounded-[2rem] px-6 py-5`}>
            <div className="flex items-end justify-between border-b border-border/60 pb-4">
              <div className="grid gap-2">
                <Skeleton className="h-4 w-16 rounded-full" />
                <Skeleton className="h-8 w-44 rounded-full" />
              </div>
              <Skeleton className="h-5 w-28 rounded-full" />
            </div>
            <div className="mt-4 flex gap-2">
              {Array.from({ length: 10 }, (_, index) => (
                <Skeleton key={`loading-interval-${index}`} className="h-10 w-14 rounded-full" />
              ))}
            </div>
            <div className="mt-6 space-y-6">
              {WireframeRows({ rowCount: 4 })}
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-2">
            {Array.from({ length: 2 }, (_, index) => (
              <section key={`loading-lower-${index}`} className={`${cardFrameClassName} ${cardSurfaceClassName} rounded-[2rem]`}>
                <div className="border-b border-border/60 px-6 py-4">
                  <Skeleton className="h-4 w-28 rounded-full" />
                  <Skeleton className="mt-3 h-8 w-52 rounded-full" />
                </div>
                <div className="space-y-4 px-6 py-5">
                  {Array.from({ length: 4 }, (_, rowIndex) => (
                    <div key={`loading-row-${index}-${rowIndex}`} className="space-y-2">
                      <Skeleton className="h-5 w-40 rounded-full" />
                      <Skeleton className="h-4 w-full rounded-full" />
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
      </WireframeRightRailLayout>
    </div>
  );
}

function SkuDetailScreen() {
  const { currency, language, showRightRailCards, t, usdToKhrExchangeRate } = usePreferences();
  const inventory = useInventory();
  const { skuId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [actionMode, setActionMode] = useState<Parameters<typeof SkuDetailActions>[0]['mode']>(null);
  const [bootstrap, setBootstrap] = useState<BootstrapSkuDetailResult | null>(() => emptyBootstrap());
  const [selectedIntervalIndex, setSelectedIntervalIndex] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const chartController = useTradingChartController({
    subjectId: skuId,
    subtype: 'sku',
  });
  const isLedgerExpanded = chartSearchValue(searchParams) === 'expanded';

  function setLedgerExpanded(nextExpanded: boolean, replace = false) {
    const nextSearchParams = buildSkuDetailSearchParams(searchParams, {
      chart: nextExpanded ? 'expanded' : null,
    });
    if (nextSearchParams.toString() === searchParams.toString()) {
      return;
    }
    setSearchParams(nextSearchParams, { replace });
  }

  async function loadPage(shouldContinue = () => true) {
    if (inventory.catalog && !hasActiveSenaSku(inventory.catalog, skuId)) {
      setBootstrap(emptyBootstrap());
      setSelectedIntervalIndex(null);
      return;
    }
    setIsRefreshing(true);
    try {
      const result = await bootstrapSkuDetail({ inventory, skuId, shouldContinue });
      if (!shouldContinue()) {
        return;
      }
      setBootstrap(result);
      setSelectedIntervalIndex(result.detailPage?.latestIntervalIndex ?? result.detail?.demandPosterior.at(-1)?.intervalIndex ?? null);
    } finally {
      if (shouldContinue()) {
        setIsRefreshing(false);
      }
    }
  }

  useEffect(() => {
    if (!skuId) {
      return;
    }
    const storage = skuDetailStorage();
    const cachedDetailPage =
      storage
        ? normalizeSkuDetailPage(
            readPersistedSenaDetailPage<SenaSkuDetailPage>({
              beforeIntervalIndex: null,
              entityId: skuId,
              entityType: 'sku',
              freshnessFingerprint: deriveSenaDetailCacheFreshnessFingerprint(inventory.workspaceSummary),
              limit: INTERVAL_PAGE_SIZE,
              storage,
            }),
          )
        : null;
    setBootstrap(emptyBootstrap());
    setBootstrap(buildSkuDetailBootstrapPreview({
      catalog: inventory.catalog,
      detailPage: cachedDetailPage,
      diagnostics: inventory.diagnostics,
      observations: inventory.observations,
      reports: inventory.reports,
      skuId,
      workspaceSummary: inventory.workspaceSummary,
    }));
    setSelectedIntervalIndex(null);
    let active = true;
    void loadPage(() => active);

    return () => {
      active = false;
    };
  }, [inventory.catalog, skuId]);

  const snapshotSku = bootstrap?.snapshot.skus.find((entry) => entry.skuId === skuId) ?? null;
  const {
    detail: pagedDetail,
    isHydratingDetails,
    hasOlder,
    isLoadingOlder,
    loadOlder,
    resolvedTimeframe,
    resolvedTimeframeCacheKey,
    resetHydratedDetails,
    timeframeHydrationProgress,
  } = useTimeframedIntervalHistory({
    fetchInitialPage: async (limit = INTERVAL_PAGE_SIZE) =>
      normalizeSkuDetailPage(await inventory.loadSenaSkuDetail(skuId, { limit, strategy: 'network-only' }), limit),
    fetchOlderPage: async (beforeIntervalIndex, limit = INTERVAL_PAGE_SIZE) =>
      normalizeSkuDetailPage(await inventory.loadSenaSkuDetail(skuId, { beforeIntervalIndex, limit, strategy: 'network-only' }), limit),
    getLoadedIntervalCount: (page) => page?.detail.demandPosterior.length ?? 0,
    getOldestIntervalAt: (page) =>
      page?.detail.demandPosterior[0]?.startAt ?? page?.detail.demandPosterior[0]?.endAt ?? null,
    hydrateTimeframeSequentially: true,
    initialPage: bootstrap?.detailPage ?? null,
    intervalCount: bootstrap?.workspaceSummary?.intervalCount ?? bootstrap?.detailPage?.detail.demandPosterior.length ?? 0,
    latestObservedAt: bootstrap?.workspaceSummary?.latestObservedAt,
    mergeDetails: mergeSkuDetailPages,
    onPruneTransition: () => inventory.clearSenaSkuDetailCache(skuId),
    timeframe: chartController.timeframe,
    timeframeBoundaryOverride: chartController.timeframeBoundaryOverride,
    timeframeCacheKey: chartController.timeframeCacheKey,
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
    chartController.settlePendingTimeframe({
      isHydratingDetails,
      resolvedTimeframe,
      resolvedTimeframeCacheKey,
      timeframeHydrationProgress,
    });
  }, [chartController, isHydratingDetails, resolvedTimeframe, resolvedTimeframeCacheKey, timeframeHydrationProgress]);

  async function handleResetCharts() {
    await chartController.handleResetCharts(resetHydratedDetails);
  }

  const model = useMemo(() => {
    if (!bootstrap || !snapshotSku) {
      return null;
    }
    return deriveSenaSkuDetailViewModel({
      currency,
      usdToKhrExchangeRate,
      diagnostics: bootstrap.diagnostics,
      observations: bootstrap.observations,
      linkedServiceDetails: bootstrap.linkedServiceDetails,
      orderBatches: inventory.orderBatches,
      selectedIntervalIndex,
      skuId,
      supplierName: inventory.catalog?.skus.find((sku) => sku.skuId === skuId)?.supplierName ?? null,
      snapshot: bootstrap.snapshot,
      detail: pagedDetail,
      uiState: bootstrap.uiState,
      workspaceSummary: bootstrap.workspaceSummary,
      language,
    });
  }, [bootstrap, currency, inventory.catalog?.skus, inventory.orderBatches, language, pagedDetail, selectedIntervalIndex, skuId, snapshotSku, usdToKhrExchangeRate]);
  const catalogSku = inventory.catalog?.skus.find((sku) => sku.skuId === skuId) ?? null;

  if (!bootstrap && (inventory.isLoading || isRefreshing)) {
    const loadingTitle = snapshotSku?.name ?? t('catalogSenaSkuPreparing');
    return (
      <WorkspacePage>
        <SkuDetailLoadingState
          showRightRailCards={showRightRailCards}
          title={loadingTitle}
        />
      </WorkspacePage>
    );
  }

  if (!snapshotSku || !bootstrap) {
    return (
      <WorkspacePage>
        <WorkspaceEmpty
          title={t('catalogSkuDetailNotFoundTitle')}
          hint={t('catalogSkuDetailNotFoundDescription')}
          action={
          <Button asChild variant="outline">
              <Link to={buildRememberedCatalogHref()}>
                <NavigationBackIcon data-icon="inline-start" />
                {t('backToCatalog')}
              </Link>
            </Button>
          }
        />
      </WorkspacePage>
    );
  }

  if (!model) {
    return null;
  }

  const lowerDetailPanelCount =
    (model.dependencyImpact.length > 0 ? 1 : 0) +
    (model.evidence.length > 0 ? 1 : 0);

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
        {bootstrap.uiState === 'running' || isRefreshing ? (
          <div className="rounded-[1.4rem] border border-border/60 bg-secondary/30 px-4 py-3 text-sm text-foreground">
            {t('catalogSenaSkuRefreshing')}
          </div>
        ) : null}
        {bootstrap.uiState === 'needs_observations' ? (
          <div className="rounded-[1.4rem] border border-border/60 bg-secondary/30 px-4 py-3 text-sm text-foreground">
            {t('catalogSenaSkuNeedsObservations')}
          </div>
        ) : null}
        {bootstrap.uiState === 'degraded' ? (
          <div className="rounded-[1.4rem] border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {bootstrap.error ?? t('catalogSenaSkuDegraded')}
          </div>
        ) : null}

        <SkuDetailHero
          actions={(
            <SkuDetailActions
              actionContext={model.actionContext}
              mode={actionMode}
              onModeChange={setActionMode}
              skuId={skuId}
              onComplete={loadPage}
            />
          )}
          imagePath={catalogSku?.imagePath}
          model={model}
        />

        <div className={rightRailLayoutClassName(showRightRailCards)}>
          <div className="grid min-w-0 gap-6">
            <div>
              {!isLedgerExpanded ? (
                <SkuDetailLedger
                  chartLayoutPreferences={chartController.chartLayoutPreferences}
                  chartZoomResetToken={chartController.chartZoomResetToken}
                  chartResolution={chartController.chartResolution}
                  customChartResolution={chartController.customChartResolution}
                  hasOlderIntervals={hasOlder}
                  isHydratingDetails={effectiveIsHydratingDetails}
                  isVisuallyBusy={heldIsChartLoading}
                  isLoadingOlderIntervals={isLoadingOlder}
                  loadOlderIntervals={loadOlder}
                  model={model}
                  customTimeframeRange={chartController.customTimeframeRange}
                  onChartLayoutPreferencesChange={chartController.handleChartLayoutPreferencesChange}
                  onOlderLoadProgressChange={chartController.setOlderLoadProgress}
                  onCustomTimeframeChange={chartController.handleCustomTimeframeChange}
                  onChartResolutionChange={chartController.handleChartResolutionChange}
                  onResetCharts={() => void handleResetCharts()}
                  onTimeframeChange={chartController.handleTimeframeChange}
                  onToggleExpand={() => setLedgerExpanded(true)}
                  selectedIntervalIndex={selectedIntervalIndex}
                  setSelectedIntervalIndex={setSelectedIntervalIndex}
                  timeframe={chartController.timeframe}
                />
              ) : (
                <div
                  aria-hidden="true"
                  className={`${cardFrameClassName} ${cardSurfaceClassName} min-h-[100svh] rounded-[2rem]`}
                />
              )}
            </div>
            {lowerDetailPanelCount > 0 ? (
              <div className={detailPanelGridClassName(lowerDetailPanelCount)}>
                <SkuDetailExposure rows={model.dependencyImpact} />
                <SkuDetailEvidence evidence={model.evidence} />
              </div>
            ) : null}
          </div>
          {showRightRailCards ? <SkuDetailRightRail model={model} /> : null}
        </div>
      </div>
      {isLedgerExpanded ? (
        <ChartLedgerOverlay
          ariaLabel={translateUiLiteral(language, 'Expanded ledger for {name}', { name: model.identity.name })}
          closeAriaLabel={translateUiLiteral(language, 'Close expanded chart overlay')}
          onClose={() => setLedgerExpanded(false, true)}
        >
            <SkuDetailLedger
              chartLayoutPreferences={chartController.chartLayoutPreferences}
              chartZoomResetToken={chartController.chartZoomResetToken}
              chartResolution={chartController.chartResolution}
              customChartResolution={chartController.customChartResolution}
              expanded
              hasOlderIntervals={hasOlder}
              isHydratingDetails={effectiveIsHydratingDetails}
              isVisuallyBusy={heldIsChartLoading}
              isLoadingOlderIntervals={isLoadingOlder}
              loadOlderIntervals={loadOlder}
              model={model}
              customTimeframeRange={chartController.customTimeframeRange}
              onChartLayoutPreferencesChange={chartController.handleChartLayoutPreferencesChange}
              onOlderLoadProgressChange={chartController.setOlderLoadProgress}
              onCustomTimeframeChange={chartController.handleCustomTimeframeChange}
              onChartResolutionChange={chartController.handleChartResolutionChange}
              onResetCharts={() => void handleResetCharts()}
              onTimeframeChange={chartController.handleTimeframeChange}
              onToggleExpand={() => setLedgerExpanded(false, true)}
              selectedIntervalIndex={selectedIntervalIndex}
              setSelectedIntervalIndex={setSelectedIntervalIndex}
              timeframe={chartController.timeframe}
            />
        </ChartLedgerOverlay>
      ) : null}
    </WorkspacePage>
  );
}

export function SkuDetailRoute() {
  return <SkuDetailScreen />;
}

export function SkuDetailLedgerRoute() {
  const { skuId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const redirectedSearchParams = buildSkuDetailSearchParams(searchParams, { chart: 'expanded' });

  return (
    <Navigate
      replace
      to={{
        pathname: generatePath('/catalog/skus/:skuId', { skuId }),
        search: `?${redirectedSearchParams.toString()}`,
      }}
    />
  );
}
