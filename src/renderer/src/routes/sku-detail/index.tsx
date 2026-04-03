import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { WorkspaceEmpty, WorkspacePage } from '@/components/system/workspace';
import { Button } from '@/components/ui/button';
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

  if (!bootstrap && inventory.isLoading) {
    return (
      <WorkspacePage>
        <div className="rounded-[2rem] border border-border/70 bg-background/85 p-6 shadow-sm">
          <p className="text-sm text-muted-foreground">{t('catalogSenaSkuPreparing')}</p>
        </div>
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
