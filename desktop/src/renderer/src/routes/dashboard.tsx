import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import { ArrowRight, Boxes, SquareChartGantt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  MetricStrip,
  PageIntro,
  PageSection,
  SectionHeading,
  Surface,
} from '@/components/banji-primitives';
import { formatCurrency, rankLabel } from '@/lib/format';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';
import brandLogo from '@/assets/banji-logo.svg';

export function DashboardRoute() {
  const { snapshot } = useInventory();
  const { currency, language, t } = usePreferences();

  const metrics = useMemo(() => {
    if (!snapshot) {
      return null;
    }

    const totalValue = snapshot.skus.reduce(
      (sum, sku) => sum + sku.unitsInStock * sku.costPerUnit,
      0,
    );

    const readySkus = snapshot.skus.filter((sku) => sku.soldAsProduct).length;
    const rankedEntries = snapshot.ranking.length;
    const inventoryDepth = snapshot.skus.reduce((sum, sku) => sum + sku.unitsInStock, 0);

    return {
      totalValue,
      readySkus,
      rankedEntries,
      inventoryDepth,
      services: snapshot.services.length,
    };
  }, [snapshot]);

  const recentEntries = snapshot?.ranking.slice(0, 5) ?? [];

  return (
    <PageSection className="space-y-6">
      <PageIntro
        actions={
          <>
            <Button asChild className="rounded-full px-5">
              <Link to="/inventory">
                <Boxes className="size-4" />
                <span>{t('navInventory')}</span>
              </Link>
            </Button>
            <Button asChild className="rounded-full px-5" variant="secondary">
              <Link to="/inventory/stock">
                <SquareChartGantt className="size-4" />
                <span>{t('stockFlow')}</span>
              </Link>
            </Button>
          </>
        }
        aside={
          <div className="flex items-center gap-4 rounded-[24px] border border-border/80 bg-background/75 px-4 py-4 shadow-sm">
            <img alt="Banji logo" className="size-14 rounded-2xl border border-border/70 bg-card p-3" src={brandLogo} />
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/80">
                {t('appBrand')}
              </p>
              <p className="text-sm leading-6 text-muted-foreground">{t('settingsStorage')}</p>
            </div>
          </div>
        }
        className="from-card via-card to-primary/10"
        description={t('dashboardBody')}
        eyebrow={t('dashboardEyebrow')}
        title={t('dashboardHeading')}
      />

      <MetricStrip
        items={[
          {
            label: t('dashboardTotalValue'),
            value: metrics ? formatCurrency(metrics.totalValue, currency, language) : '—',
          },
          {
            label: t('dashboardSaleReady'),
            value: metrics?.readySkus ?? '—',
          },
          {
            label: t('dashboardServices'),
            value: metrics?.services ?? '—',
          },
          {
            label: t('dashboardRanked'),
            value: metrics?.rankedEntries ?? '—',
          },
        ]}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.9fr)]">
        <Surface className="space-y-6">
          <SectionHeading title={t('homePerformance')} />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-[24px] border border-border/70 bg-background/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {t('dashboardSaleReady')}
              </p>
              <p className="mt-2 text-3xl font-semibold tracking-tight">
                {metrics?.readySkus ?? '—'}
              </p>
              <div className="mt-4 h-2 rounded-full bg-accent/70">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
                  style={{
                    width: `${metrics ? Math.max(18, Math.min(100, metrics.readySkus * 18)) : 18}%`,
                  }}
                />
              </div>
            </div>
            <div className="rounded-[24px] border border-border/70 bg-background/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {t('fieldUnitsInStock')}
              </p>
              <p className="mt-2 text-3xl font-semibold tracking-tight">
                {metrics?.inventoryDepth ?? '—'}
              </p>
              <div className="mt-4 h-2 rounded-full bg-accent/70">
                <div
                  className="h-full rounded-full bg-primary/75 transition-[width] duration-300 motion-reduce:transition-none"
                  style={{
                    width: `${metrics ? Math.max(20, Math.min(100, metrics.inventoryDepth / 2)) : 20}%`,
                  }}
                />
              </div>
            </div>
          </div>
          <Separator />
          <div className="grid gap-3 text-sm text-muted-foreground">
            <div className="flex items-center justify-between rounded-2xl bg-background/70 px-4 py-3">
              <span>{t('dashboardServices')}</span>
              <span className="font-medium text-foreground">{metrics?.services ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-background/70 px-4 py-3">
              <span>{t('dashboardRanked')}</span>
              <span className="font-medium text-foreground">{metrics?.rankedEntries ?? '—'}</span>
            </div>
          </div>
        </Surface>

        <Surface className="space-y-5">
          <SectionHeading title={t('homeRecentActivity')} />
          <div className="space-y-3">
            {recentEntries.length > 0 ? (
              recentEntries.map((entry) => (
                <div
                  className="flex items-center justify-between gap-3 rounded-[22px] border border-border/70 bg-background/70 px-4 py-3"
                  key={`${entry.entryType}:${entry.entryId}`}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">
                      {rankLabel(entry, snapshot?.skus ?? [], snapshot?.services ?? [])}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {entry.entryType === 'service' ? t('serviceLabel') : t('skuLabel')}
                    </p>
                  </div>
                  <Badge className="rounded-full" variant="secondary">
                    #{entry.position + 1}
                  </Badge>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">—</p>
            )}
          </div>
          <Button asChild className="w-full rounded-full" variant="outline">
            <Link to="/inventory/ranking">
              <span>{t('navRanking')}</span>
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </Surface>
      </div>
    </PageSection>
  );
}
