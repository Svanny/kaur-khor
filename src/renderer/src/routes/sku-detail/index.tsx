import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, generatePath, useParams, useSearchParams } from 'react-router-dom';
import { INTERVAL_PAGE_SIZE } from '@/components/system/interval-strip';
import { type ChartCustomTimeframeRange, type ChartTimeframe } from '@/components/system/chart-timeframe';
import {
  DEFAULT_CHART_RESOLUTION,
  type ChartCustomResolution,
  type ChartResolutionOption,
} from '@/components/system/chart-resolution';
import { useTimeframedIntervalHistory } from '@/components/system/timeframed-interval-history';
import { WorkspaceEmpty, WorkspacePage } from '@/components/system/workspace';
import { LoadingMoreIntervalsIsland } from '@/components/system/loading-more-intervals-island';
import { rightRailLayoutClassName } from '@/components/system/right-rail-layout';
import { Button } from '@/components/ui/button';
import { cardFrameClassName, cardSurfaceClassName } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  chartLayoutPreferencesEqual,
  defaultChartLayoutPreferences,
  normalizeChartLayoutPreferences,
  readEntityChartLayoutPreferences,
  readSubtypeDefaultChartLayoutPreferences,
  writeEntityChartLayoutPreferences,
  writeSubtypeDefaultChartLayoutPreferences,
  type PersistedChartLayoutPreferences,
} from '@/lib/chart-layout-preferences';
import { normalizeSkuDetailPage } from '@/lib/sena-detail-pages';
import { readSkuAction } from '@/lib/navigation-state';
import { hasActiveSenaSku } from '@/lib/sena-catalog';
import { usePreferences } from '@/state/preferences';
import { useInventory } from '@/state/inventory';
import { DetailHeroWireframe, WireframeRightRailLayout, WireframeRows } from '../loading-wireframes';
import { SkuDetailActions } from './actions';
import { bootstrapSkuDetail, type BootstrapSkuDetailResult } from './bootstrap';
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

function resolveSkuChartLayoutPreferences(skuId: string): PersistedChartLayoutPreferences {
  return (
    readEntityChartLayoutPreferences('sku', skuId) ??
    readSubtypeDefaultChartLayoutPreferences('sku') ??
    defaultChartLayoutPreferences()
  );
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
  const [bootstrap, setBootstrap] = useState<BootstrapSkuDetailResult | null>(() => emptyBootstrap());
  const [selectedIntervalIndex, setSelectedIntervalIndex] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [olderLoadProgress, setOlderLoadProgress] = useState<{ current: number; total: number } | null>(null);
  const initialChartLayoutPreferences = resolveSkuChartLayoutPreferences(skuId);
  const [timeframe, setTimeframe] = useState<ChartTimeframe>(initialChartLayoutPreferences.timeframe);
  const [customTimeframeRange, setCustomTimeframeRange] = useState<ChartCustomTimeframeRange | null>(initialChartLayoutPreferences.customTimeframeRange);
  const [chartResolution, setChartResolution] = useState<ChartResolutionOption>(initialChartLayoutPreferences.chartResolution);
  const [customChartResolution, setCustomChartResolution] = useState<ChartCustomResolution | null>(initialChartLayoutPreferences.customChartResolution);
  const [chartLayoutPreferences, setChartLayoutPreferences] = useState<PersistedChartLayoutPreferences>(initialChartLayoutPreferences);
  const [pendingTimeframe, setPendingTimeframe] = useState<ChartTimeframe | null>(null);
  const [chartZoomResetToken, setChartZoomResetToken] = useState(0);
  const actionMode = readSkuAction(searchParams);
  const isLedgerExpanded = chartSearchValue(searchParams) === 'expanded';

  function updateActionMode(nextMode: typeof actionMode, replace = false) {
    const nextSearchParams = new URLSearchParams(searchParams);
    if (nextMode) {
      nextSearchParams.set('action', nextMode);
    } else {
      nextSearchParams.delete('action');
    }
    setSearchParams(nextSearchParams, { replace });
  }

  function setLedgerExpanded(nextExpanded: boolean, replace = false) {
    const nextSearchParams = buildSkuDetailSearchParams(searchParams, {
      chart: nextExpanded ? 'expanded' : null,
    });
    if (nextSearchParams.toString() === searchParams.toString()) {
      return;
    }
    setSearchParams(nextSearchParams, { replace });
  }

  async function loadPage() {
    if (inventory.catalog && !hasActiveSenaSku(inventory.catalog, skuId)) {
      setBootstrap(emptyBootstrap());
      setSelectedIntervalIndex(null);
      return;
    }
    setIsRefreshing(true);
    try {
      const result = await bootstrapSkuDetail({ inventory, skuId, language });
      setBootstrap(result);
      setSelectedIntervalIndex(result.detailPage?.latestIntervalIndex ?? result.detail?.demandPosterior.at(-1)?.intervalIndex ?? null);
    } finally {
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    if (!skuId) {
      return;
    }
    setBootstrap(emptyBootstrap());
    setSelectedIntervalIndex(null);
    const nextLayoutPreferences = resolveSkuChartLayoutPreferences(skuId);
    setChartLayoutPreferences(nextLayoutPreferences);
    setTimeframe(nextLayoutPreferences.timeframe);
    setCustomTimeframeRange(nextLayoutPreferences.customTimeframeRange);
    setChartResolution(nextLayoutPreferences.chartResolution);
    setCustomChartResolution(nextLayoutPreferences.customChartResolution);
    setChartZoomResetToken(0);
    setPendingTimeframe(null);
    void loadPage();
  }, [inventory.catalog, skuId]);

  useEffect(() => {
    if (!skuId) {
      return;
    }
    writeEntityChartLayoutPreferences('sku', skuId, chartLayoutPreferences);
  }, [chartLayoutPreferences, skuId]);

  const snapshotSku = bootstrap?.snapshot.skus.find((entry) => entry.skuId === skuId) ?? null;
  const {
    detail: pagedDetail,
    isHydratingDetails,
    hasOlder,
    isLoadingOlder,
    loadOlder,
    resolvedTimeframe,
    resetHydratedDetails,
    timeframeHydrationProgress,
  } = useTimeframedIntervalHistory({
    fetchInitialPage: async (limit = INTERVAL_PAGE_SIZE) =>
      normalizeSkuDetailPage(await inventory.loadSenaSkuDetail(skuId, { limit }), limit),
    fetchOlderPage: async (beforeIntervalIndex, limit = INTERVAL_PAGE_SIZE) =>
      normalizeSkuDetailPage(await inventory.loadSenaSkuDetail(skuId, { beforeIntervalIndex, limit }), limit),
    getLoadedIntervalCount: (page) => page?.detail.demandPosterior.length ?? 0,
    getOldestIntervalAt: (page) =>
      page?.detail.demandPosterior[0]?.startAt ?? page?.detail.demandPosterior[0]?.endAt ?? null,
    hydrateTimeframeSequentially: true,
    initialPage: bootstrap?.detailPage ?? null,
    intervalCount: bootstrap?.workspaceSummary?.intervalCount ?? bootstrap?.detailPage?.detail.demandPosterior.length ?? 0,
    latestObservedAt: bootstrap?.workspaceSummary?.latestObservedAt,
    mergeDetails: mergeSkuDetailPages,
    onPruneTransition: () => inventory.clearSenaSkuDetailCache(skuId),
    timeframe,
    timeframeBoundaryOverride: customTimeframeRange ? new Date(customTimeframeRange.startAt) : undefined,
    timeframeCacheKey: customTimeframeRange ? `Custom:${customTimeframeRange.startAt}:${customTimeframeRange.endAt}` : undefined,
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
      if (customTimeframeRange == null) {
        return;
      }
    } else {
      setPendingTimeframe(nextTimeframe);
      setTimeframe(nextTimeframe);
    }
    setCustomTimeframeRange(null);
    setChartLayoutPreferences((current) => ({
      ...current,
      timeframe: nextTimeframe,
      customTimeframeRange: null,
      visibleDateRange: null,
    }));
    setOlderLoadProgress(null);
    setChartZoomResetToken((current) => current + 1);
  }

  function handleCustomTimeframeChange(nextRange: ChartCustomTimeframeRange | null) {
    setOlderLoadProgress(null);
    setCustomTimeframeRange(nextRange);
    setChartLayoutPreferences((current) => ({
      ...current,
      customTimeframeRange: nextRange,
      visibleDateRange: nextRange,
    }));
    if (nextRange == null && timeframe === 'Recent') {
      return;
    }
    setChartZoomResetToken((current) => current + 1);
  }

  function handleChartResolutionChange(nextResolution: ChartResolutionOption, nextCustom: ChartCustomResolution | null) {
    setChartResolution(nextResolution);
    setCustomChartResolution(nextResolution === 'Custom' ? nextCustom : null);
    setChartLayoutPreferences((current) => ({
      ...current,
      chartResolution: nextResolution,
      customChartResolution: nextResolution === 'Custom' ? nextCustom : null,
    }));
    setChartZoomResetToken((current) => current + 1);
  }

  function handleChartLayoutPreferencesChange(next: Partial<PersistedChartLayoutPreferences>) {
    setChartLayoutPreferences((current) => {
      const normalized = normalizeChartLayoutPreferences({
        ...current,
        ...next,
      });
      return chartLayoutPreferencesEqual(current, normalized) ? current : normalized;
    });
  }

  function handleSaveDefaultChartLayoutPreferences(next: PersistedChartLayoutPreferences) {
    writeSubtypeDefaultChartLayoutPreferences('sku', next);
  }

  async function handleResetCharts() {
    setOlderLoadProgress(null);
    await resetHydratedDetails();
    setChartZoomResetToken((current) => current + 1);
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
  }, [bootstrap, currency, inventory.catalog?.skus, language, pagedDetail, selectedIntervalIndex, skuId, snapshotSku, usdToKhrExchangeRate]);
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
              <Link to="/catalog">{t('backToCatalog')}</Link>
            </Button>
          }
        />
      </WorkspacePage>
    );
  }

  if (!model) {
    return null;
  }

  return (
    <WorkspacePage>
      <LoadingMoreIntervalsIsland
        currentBatch={(timeframeHydrationProgress ?? olderLoadProgress)?.current ?? null}
        totalBatches={(timeframeHydrationProgress ?? olderLoadProgress)?.total ?? null}
        visible={effectiveIsHydratingDetails || isLoadingOlder || olderLoadProgress != null}
      />
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
              onModeChange={(nextMode) => updateActionMode(nextMode, true)}
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
                  chartLayoutPreferences={chartLayoutPreferences}
                  chartZoomResetToken={chartZoomResetToken}
                  chartResolution={chartResolution}
                  customChartResolution={customChartResolution}
                  hasOlderIntervals={hasOlder}
                  isHydratingDetails={effectiveIsHydratingDetails}
                  isLoadingOlderIntervals={isLoadingOlder}
                  loadOlderIntervals={loadOlder}
                  model={model}
                  customTimeframeRange={customTimeframeRange}
                  onChartLayoutPreferencesChange={handleChartLayoutPreferencesChange}
                  onOlderLoadProgressChange={setOlderLoadProgress}
                  onCustomTimeframeChange={handleCustomTimeframeChange}
                  onChartResolutionChange={handleChartResolutionChange}
                  onResetCharts={() => void handleResetCharts()}
                  onSaveDefaultChartLayoutPreferences={handleSaveDefaultChartLayoutPreferences}
                  onTimeframeChange={handleTimeframeChange}
                  onToggleExpand={() => setLedgerExpanded(true)}
                  selectedIntervalIndex={selectedIntervalIndex}
                  setSelectedIntervalIndex={setSelectedIntervalIndex}
                  timeframe={timeframe}
                />
              ) : (
                <div
                  aria-hidden="true"
                  className={`${cardFrameClassName} ${cardSurfaceClassName} min-h-[100svh] rounded-[2rem]`}
                />
              )}
            </div>
            <div className="grid gap-6 xl:grid-cols-2">
              <SkuDetailExposure rows={model.dependencyImpact} />
              <SkuDetailEvidence evidence={model.evidence} />
            </div>
          </div>
          {showRightRailCards ? <SkuDetailRightRail model={model} /> : null}
        </div>
      </div>
      {isLedgerExpanded ? (
        <div
          aria-label={`Expanded ledger for ${model.identity.name}`}
          aria-modal="true"
          className="fixed inset-0 z-50 p-4"
          role="dialog"
        >
          <button
            aria-label="Close expanded ledger"
            className="absolute inset-0 bg-[rgba(29,20,12,0.46)] backdrop-blur-sm"
            onClick={() => setLedgerExpanded(false, true)}
            type="button"
          />
          <div className="relative z-10 flex h-full w-full">
            <SkuDetailLedger
              chartLayoutPreferences={chartLayoutPreferences}
              chartZoomResetToken={chartZoomResetToken}
              chartResolution={chartResolution}
              customChartResolution={customChartResolution}
              expanded
              hasOlderIntervals={hasOlder}
              isHydratingDetails={effectiveIsHydratingDetails}
              isLoadingOlderIntervals={isLoadingOlder}
              loadOlderIntervals={loadOlder}
              model={model}
              customTimeframeRange={customTimeframeRange}
              onChartLayoutPreferencesChange={handleChartLayoutPreferencesChange}
              onOlderLoadProgressChange={setOlderLoadProgress}
              onCustomTimeframeChange={handleCustomTimeframeChange}
              onChartResolutionChange={handleChartResolutionChange}
              onResetCharts={() => void handleResetCharts()}
              onSaveDefaultChartLayoutPreferences={handleSaveDefaultChartLayoutPreferences}
              onTimeframeChange={handleTimeframeChange}
              onToggleExpand={() => setLedgerExpanded(false, true)}
              selectedIntervalIndex={selectedIntervalIndex}
              setSelectedIntervalIndex={setSelectedIntervalIndex}
              timeframe={timeframe}
            />
          </div>
        </div>
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
