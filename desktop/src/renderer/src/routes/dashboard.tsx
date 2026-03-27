import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Boxes,
  DatabaseZap,
  ListOrdered,
  PackagePlus,
  PanelsTopLeft,
  SquareChartGantt,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  MetricCard,
  MetricGrid,
  StatusBadge,
  WorkspaceActionRow,
  WorkspaceEmpty,
  WorkspaceHero,
  WorkspacePage,
  WorkspacePanel,
} from '@/components/system/workspace';
import { formatCurrency, formatNumber, rankLabel } from '@/lib/format';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';

function healthLabel(
  state: 'ready' | 'starting' | 'failed',
  t: (key: any) => string,
) {
  if (state === 'failed') return t('dashboardHealthFailed');
  if (state === 'starting') return t('dashboardHealthStarting');
  return t('dashboardHealthReady');
}

export function DashboardRoute() {
  const { snapshot, backendStatus, error } = useInventory();
  const { currency, language, t } = usePreferences();

  const metrics = useMemo(() => {
    if (!snapshot) {
      return null;
    }

    const totalValue = snapshot.skus.reduce(
      (sum, sku) => sum + sku.unitsInStock * sku.costPerUnit,
      0,
    );
    const inventoryDepth = snapshot.skus.reduce((sum, sku) => sum + sku.unitsInStock, 0);
    const saleReady = snapshot.skus.filter((sku) => sku.soldAsProduct).length;

    return {
      totalValue,
      inventoryDepth,
      saleReady,
      services: snapshot.services.length,
      ranked: snapshot.ranking.length,
      coverage: `${snapshot.skus.length} SKUs / ${snapshot.services.length} services`,
    };
  }, [snapshot]);

  const runtimeState =
    error || backendStatus === 'error'
      ? 'failed'
      : backendStatus === 'starting'
        ? 'starting'
        : 'ready';
  const runtimeLabel = healthLabel(runtimeState, t);
  const runtimeBadgeVariant = runtimeState === 'ready' ? 'secondary' : 'outline';

  const recentEntries = snapshot?.ranking.slice(0, 5) ?? [];

  return (
    <WorkspacePage>
      <WorkspaceHero
        actions={
          <WorkspaceActionRow>
            <Button asChild>
              <Link to="/inventory">
                <Boxes data-icon="inline-start" />
                {t('navInventory')}
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to="/inventory/stock">
                <SquareChartGantt data-icon="inline-start" />
                {t('navStock')}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/inventory/ranking">
                <ListOrdered data-icon="inline-start" />
                {t('navRanking')}
              </Link>
            </Button>
          </WorkspaceActionRow>
        }
        description={t('dashboardBody')}
        eyebrow={t('dashboardEyebrow')}
        title={t('dashboardHeading')}
      >
        <div className="flex flex-wrap gap-2">
          <StatusBadge variant={runtimeBadgeVariant}>{runtimeLabel}</StatusBadge>
        </div>
      </WorkspaceHero>

      <MetricGrid>
        <MetricCard
          detail={t('dashboardQuickCreateDescription')}
          label={t('dashboardTotalValue')}
          value={metrics ? formatCurrency(metrics.totalValue, currency, language) : '—'}
        />
        <MetricCard
          detail={t('dashboardInventoryDepth')}
          label={t('dashboardSaleReady')}
          value={metrics ? formatNumber(metrics.saleReady, language) : '—'}
        />
        <MetricCard
          detail={t('dashboardMarginMix')}
          label={t('dashboardServices')}
          value={metrics ? formatNumber(metrics.services, language) : '—'}
        />
        <MetricCard
          detail={metrics?.coverage ?? '—'}
          label={t('dashboardRanked')}
          value={metrics ? formatNumber(metrics.ranked, language) : '—'}
        />
      </MetricGrid>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <WorkspacePanel
          description={t('dashboardHealthDescription')}
          title={t('dashboardHealthTitle')}
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl border border-border/80 bg-background/60 p-5">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                {t('dashboardHealthTitle')}
              </p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.04em]">
                {runtimeLabel}
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {t('dashboardHealthDescription')}
              </p>
            </div>

            <div className="rounded-3xl border border-border/80 bg-background/60 p-5">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                {t('dashboardQuickCreateTitle')}
              </p>
              <div className="mt-4 grid gap-2">
                <Button asChild className="justify-start" variant="outline">
                  <Link to="/inventory/skus/new">
                    <PackagePlus data-icon="inline-start" />
                    {t('createSkuAction')}
                  </Link>
                </Button>
                <Button asChild className="justify-start" variant="outline">
                  <Link to="/inventory/services/new">
                    <PanelsTopLeft data-icon="inline-start" />
                    {t('createServiceAction')}
                  </Link>
                </Button>
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-3xl border border-border/70 bg-card/55 p-4">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                {t('dashboardInventoryDepth')}
              </p>
              <p className="mt-2 text-xl font-semibold tracking-[-0.03em]">
                {metrics ? formatNumber(metrics.inventoryDepth, language) : '—'}
              </p>
            </div>
            <div className="rounded-3xl border border-border/70 bg-card/55 p-4">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                {t('navInventory')}
              </p>
              <p className="mt-2 text-xl font-semibold tracking-[-0.03em]">
                {metrics?.coverage ?? '—'}
              </p>
            </div>
            <div className="rounded-3xl border border-border/70 bg-card/55 p-4">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                {t('navStock')}
              </p>
              <p className="mt-2 text-xl font-semibold tracking-[-0.03em]">
                {runtimeState === 'ready' ? t('stockConfirm') : t('backendStarting')}
              </p>
            </div>
          </div>
        </WorkspacePanel>

        <WorkspacePanel
          action={
            <Button asChild size="sm" variant="ghost">
              <Link to="/inventory/ranking">
                <ListOrdered data-icon="inline-start" />
                {t('navRanking')}
              </Link>
            </Button>
          }
          description={t('dashboardRecentDescription')}
          title={t('dashboardRecent')}
        >
          {recentEntries.length > 0 && snapshot ? (
            <div className="flex flex-col gap-3">
              {recentEntries.map((entry) => (
                <div
                  className="flex items-center justify-between gap-3 rounded-3xl border border-border/80 bg-background/55 px-4 py-3"
                  key={`${entry.entryType}:${entry.entryId}`}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">
                      {rankLabel(entry, snapshot.skus, snapshot.services)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {entry.entryType === 'service' ? t('serviceLabel') : t('skuLabel')}
                    </p>
                  </div>
                  <Badge className="rounded-full" variant="secondary">
                    #{entry.position + 1}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <WorkspaceEmpty
              description={t('inventoryNoResultsDescription')}
              title={t('dashboardRecent')}
              action={
                <Button asChild variant="outline">
                  <Link to="/inventory/ranking">
                    <DatabaseZap data-icon="inline-start" />
                    {t('navRanking')}
                  </Link>
                </Button>
              }
            />
          )}
        </WorkspacePanel>
      </div>
    </WorkspacePage>
  );
}
