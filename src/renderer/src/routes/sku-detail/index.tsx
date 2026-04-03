import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { WorkspaceEmpty, WorkspacePage } from '@/components/system/workspace';
import { Button } from '@/components/ui/button';
import { cardFrameClassName, cardSurfaceClassName } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { usePreferences } from '@/state/preferences';
import { useInventory } from '@/state/inventory';
import { SkuDetailActions } from './actions';
import { bootstrapSkuDetail, type BootstrapSkuDetailResult } from './bootstrap';
import { SkuDetailEvidence } from './evidence';
import { SkuDetailExposure } from './exposure';
import { SkuDetailHero } from './hero';
import { SkuDetailLedger } from './ledger';
import { SkuDetailRightRail } from './right-rail';
import { deriveSenaSkuDetailViewModel } from './view-model';

function emptyBootstrap(): BootstrapSkuDetailResult | null {
  return null;
}

function SkuDetailLoadingState({ label }: { label: string }) {
  return (
    <div className="grid gap-6">
      <div className="rounded-[1.4rem] border border-border/60 bg-secondary/30 px-4 py-3 text-sm text-foreground">
        {label}
      </div>

      <section className={`${cardFrameClassName} ${cardSurfaceClassName} rounded-[2rem] px-6 py-5`}>
        <div className="flex flex-col gap-5 border-b border-border/60 pb-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="grid gap-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 rounded-full" />
              <Skeleton className="h-7 w-48 rounded-full" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-7 w-24 rounded-full" />
              <Skeleton className="h-7 w-28 rounded-full" />
            </div>
            <Skeleton className="h-12 w-72 rounded-full" />
            <Skeleton className="h-5 w-[34rem] max-w-full rounded-full" />
          </div>
          <div className="grid grid-cols-2 gap-2 lg:w-[25rem]">
            <Skeleton className="h-10 rounded-full" />
            <Skeleton className="h-10 rounded-full" />
            <Skeleton className="h-10 rounded-full" />
            <Skeleton className="h-10 rounded-full" />
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-[1.4rem] border border-border/60 bg-border/50 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={`loading-ribbon-${index}`} className="bg-white px-4 py-3">
              <Skeleton className="h-4 w-20 rounded-full" />
              <Skeleton className="mt-2 h-6 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid min-w-0 gap-6">
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
              {Array.from({ length: 4 }, (_, index) => (
                <div key={`loading-lane-${index}`} className="space-y-3 border-t border-border/60 pt-5 first:border-t-0 first:pt-0">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-5 w-40 rounded-full" />
                    <Skeleton className="h-4 w-24 rounded-full" />
                  </div>
                  <Skeleton className="h-28 w-full rounded-[1.4rem]" />
                </div>
              ))}
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
        </div>

        <section className={`${cardFrameClassName} ${cardSurfaceClassName} rounded-[2rem] p-4`}>
          <div className="space-y-4">
            {Array.from({ length: 5 }, (_, index) => (
              <div key={`loading-rail-${index}`} className="rounded-[1.4rem] border border-border/60 bg-white px-4 py-4 shadow-[0_12px_28px_rgba(48,31,20,0.07)]">
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

export function SkuDetailRoute() {
  const { currency, language, t } = usePreferences();
  const inventory = useInventory();
  const { skuId = '' } = useParams();
  const [bootstrap, setBootstrap] = useState<BootstrapSkuDetailResult | null>(() => emptyBootstrap());
  const [selectedIntervalIndex, setSelectedIntervalIndex] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  async function loadPage() {
    setIsRefreshing(true);
    try {
      const result = await bootstrapSkuDetail({ inventory, skuId, language });
      setBootstrap(result);
      setSelectedIntervalIndex(result.detail?.demandPosterior.at(-1)?.intervalIndex ?? null);
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
    void loadPage();
  }, [skuId]);

  const snapshotSku = bootstrap?.snapshot.skus.find((entry) => entry.skuId === skuId) ?? null;

  const model = useMemo(() => {
    if (!bootstrap || !snapshotSku) {
      return null;
    }
    return deriveSenaSkuDetailViewModel({
      currency,
      diagnostics: bootstrap.diagnostics,
      observations: bootstrap.observations,
      linkedServiceDetails: bootstrap.linkedServiceDetails,
      selectedIntervalIndex,
      skuId,
      snapshot: bootstrap.snapshot,
      detail: bootstrap.detail,
      uiState: bootstrap.uiState,
      workspaceSummary: bootstrap.workspaceSummary,
      language,
    });
  }, [bootstrap, currency, language, selectedIntervalIndex, skuId, snapshotSku]);

  if (!bootstrap && (inventory.isLoading || isRefreshing)) {
    return (
      <WorkspacePage>
        <SkuDetailLoadingState label={t('catalogSenaSkuPreparing')} />
      </WorkspacePage>
    );
  }

  if (!snapshotSku || !bootstrap) {
    return (
      <WorkspacePage>
        <WorkspaceEmpty
          title={t('catalogSkuDetailNotFoundTitle')}
          description={t('catalogSkuDetailNotFoundDescription')}
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

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid min-w-0 gap-6">
            <SkuDetailLedger model={model} selectedIntervalIndex={selectedIntervalIndex} setSelectedIntervalIndex={setSelectedIntervalIndex} />
            <div className="grid gap-6 xl:grid-cols-2">
              <SkuDetailExposure rows={model.dependencyImpact} />
              <SkuDetailEvidence evidence={model.evidence} />
            </div>
          </div>
          <SkuDetailRightRail model={model} />
        </div>
      </div>
    </WorkspacePage>
  );
}
