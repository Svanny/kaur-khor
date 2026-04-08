import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { INTERVAL_PAGE_SIZE } from '@/components/system/interval-strip';
import { type ChartTimeframe } from '@/components/system/chart-timeframe';
import { useTimeframedIntervalHistory } from '@/components/system/timeframed-interval-history';
import { WorkspaceEmpty, WorkspacePage } from '@/components/system/workspace';
import { LoadingMoreIntervalsIsland } from '@/components/system/loading-more-intervals-island';
import { rightRailLayoutClassName } from '@/components/system/right-rail-layout';
import { Button } from '@/components/ui/button';
import { cardFrameClassName, cardSurfaceClassName } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { normalizeSkuDetailPage } from '@/lib/sena-detail-pages';
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

export function SkuDetailRoute() {
  const { currency, language, showRightRailCards, t, usdToKhrExchangeRate } = usePreferences();
  const inventory = useInventory();
  const { skuId = '' } = useParams();
  const [bootstrap, setBootstrap] = useState<BootstrapSkuDetailResult | null>(() => emptyBootstrap());
  const [selectedIntervalIndex, setSelectedIntervalIndex] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [olderLoadProgress, setOlderLoadProgress] = useState<{ current: number; total: number } | null>(null);
  const [timeframe, setTimeframe] = useState<ChartTimeframe>('Recent');
  const [pendingTimeframe, setPendingTimeframe] = useState<ChartTimeframe | null>(null);
  const [chartZoomResetToken, setChartZoomResetToken] = useState(0);

  async function loadPage() {
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
    setTimeframe('Recent');
    setChartZoomResetToken(0);
    void loadPage();
  }, [skuId]);

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
      normalizeSkuDetailPage(await inventory.loadSenaSkuDetail(skuId, { limit })),
    fetchOlderPage: async (beforeIntervalIndex, limit = INTERVAL_PAGE_SIZE) =>
      normalizeSkuDetailPage(await inventory.loadSenaSkuDetail(skuId, { beforeIntervalIndex, limit })),
    getLoadedIntervalCount: (page) => page?.detail.demandPosterior.length ?? 0,
    getOldestIntervalAt: (page) =>
      page?.detail.demandPosterior[0]?.startAt ?? page?.detail.demandPosterior[0]?.endAt ?? null,
    initialPage: bootstrap?.detailPage ?? null,
    intervalCount: bootstrap?.workspaceSummary?.intervalCount ?? bootstrap?.detailPage?.detail.demandPosterior.length ?? 0,
    latestObservedAt: bootstrap?.workspaceSummary?.latestObservedAt,
    mergeDetails: mergeSkuDetailPages,
    onPruneTransition: () => inventory.clearSenaSkuDetailCache(skuId),
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
      selectedIntervalIndex,
      skuId,
      snapshot: bootstrap.snapshot,
      detail: pagedDetail,
      uiState: bootstrap.uiState,
      workspaceSummary: bootstrap.workspaceSummary,
      language,
    });
  }, [bootstrap, currency, language, pagedDetail, selectedIntervalIndex, skuId, snapshotSku, usdToKhrExchangeRate]);

  if (!bootstrap && (inventory.isLoading || isRefreshing)) {
    const loadingTitle = snapshotSku?.name ?? skuId ?? t('catalogSenaSkuPreparing');
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
          actions={<SkuDetailActions actionContext={model.actionContext} skuId={skuId} onComplete={loadPage} />}
          model={model}
        />

        <div className={rightRailLayoutClassName(showRightRailCards)}>
          <div className="grid min-w-0 gap-6">
            <SkuDetailLedger
              chartZoomResetToken={chartZoomResetToken}
              hasOlderIntervals={hasOlder}
              isHydratingDetails={effectiveIsHydratingDetails}
              isLoadingOlderIntervals={isLoadingOlder}
              loadOlderIntervals={loadOlder}
              model={model}
              onOlderLoadProgressChange={setOlderLoadProgress}
              onResetCharts={() => void handleResetCharts()}
              onTimeframeChange={handleTimeframeChange}
              selectedIntervalIndex={selectedIntervalIndex}
              setSelectedIntervalIndex={setSelectedIntervalIndex}
              timeframe={timeframe}
            />
            <div className="grid gap-6 xl:grid-cols-2">
              <SkuDetailExposure rows={model.dependencyImpact} />
              <SkuDetailEvidence evidence={model.evidence} />
            </div>
          </div>
          {showRightRailCards ? <SkuDetailRightRail model={model} /> : null}
        </div>
      </div>
    </WorkspacePage>
  );
}
