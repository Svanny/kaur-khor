import { useMemo, useState } from 'react';
import {
  TriangleAlert,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  WorkspaceEmpty,
  WorkspacePage,
  WorkspacePanel,
} from '@/components/system/workspace';
import { formatCurrency, formatNumber } from '@/lib/format';
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

function regimeLabel(regime: string | null | undefined, t: (key: any) => string) {
  if (!regime) return '—';
  if (regime === 'spike') return t('regimeSpike');
  if (regime === 'lull') return t('regimeLull');
  if (regime === 'stockout_constrained') return t('regimeStockoutConstrained');
  if (regime === 'correction') return t('regimeCorrection');
  return t('regimeNormal');
}

export function DashboardRoute() {
  const { snapshot, error, isLoading } = useInventory();
  const { currency, language, t } = usePreferences();
  const [openMetricTooltip, setOpenMetricTooltip] = useState<string | null>(null);
  const [metricTooltipMode, setMetricTooltipMode] = useState<'pointer' | 'focus' | 'click' | null>(
    null,
  );

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
      reorderCount: snapshot.sist.pendingReorderCount,
      highRisk: snapshot.sist.highRiskSkuIds.length,
    };
  }, [snapshot]);

  const runtimeState = error ? 'failed' : isLoading ? 'starting' : 'ready';
  const runtimeLabel = healthLabel(runtimeState, t);

  const highRiskInsights =
    snapshot?.sist.skuInsights.filter((insight) => snapshot.sist.highRiskSkuIds.includes(insight.skuId)) ??
    [];
  const summaryMetrics = [
    {
      label: t('dashboardTotalValue'),
      tooltip: t('dashboardQuickCreateDescription'),
      value: metrics ? formatCurrency(metrics.totalValue, currency, language) : '—',
    },
    {
      label: t('dashboardSaleReady'),
      tooltip: t('dashboardInventoryDepth'),
      value: metrics ? formatNumber(metrics.saleReady, language) : '—',
    },
    {
      label: t('dashboardServices'),
      tooltip: t('dashboardMarginMix'),
      value: metrics ? formatNumber(metrics.services, language) : '—',
    },
    {
      label: t('dashboardRanked'),
      tooltip: metrics?.coverage ?? '—',
      value: metrics ? formatNumber(metrics.ranked, language) : '—',
    },
    {
      label: t('dashboardReorderCount'),
      tooltip: t('dashboardRiskDescription'),
      value: metrics ? formatNumber(metrics.reorderCount, language) : '—',
    },
  ];

  return (
    <WorkspacePage>
      <TooltipProvider>
        <Card className="border-white/70">
          <CardContent className="flex flex-col gap-0 px-0">
            <div className="grid gap-0 sm:grid-cols-2 xl:grid-cols-5">
              {summaryMetrics.map((metric, index) => (
                <div
                  className={cn(
                    'px-6 py-6',
                    index > 0 && 'border-t border-border/60',
                    index === 1 && 'sm:border-t-0 sm:border-l sm:border-border/60',
                    index === 2 && 'xl:border-t-0 xl:border-l xl:border-border/60',
                    index === 3 &&
                      'sm:border-l sm:border-border/60 xl:border-t-0 xl:border-l xl:border-border/60',
                    index === 4 &&
                      'sm:col-span-2 xl:col-span-1 xl:border-t-0 xl:border-l xl:border-border/60',
                  )}
                  key={metric.label}
                >
                  <Tooltip
                    onOpenChange={(open) => {
                      if (!open && openMetricTooltip === metric.label) {
                        setOpenMetricTooltip(null);
                        setMetricTooltipMode(null);
                      }
                    }}
                    open={openMetricTooltip === metric.label}
                  >
                    <TooltipTrigger asChild>
                      <button
                        aria-expanded={openMetricTooltip === metric.label}
                        className="group/metric block w-full text-left focus-visible:outline-none"
                        onBlur={() => {
                          if (metricTooltipMode === 'focus' && openMetricTooltip === metric.label) {
                            setOpenMetricTooltip(null);
                            setMetricTooltipMode(null);
                          }
                        }}
                        onClick={() => {
                          if (openMetricTooltip === metric.label) {
                            setOpenMetricTooltip(null);
                            setMetricTooltipMode(null);
                            return;
                          }

                          setOpenMetricTooltip(metric.label);
                          setMetricTooltipMode('click');
                        }}
                        onFocus={() => {
                          if (metricTooltipMode === 'click') {
                            return;
                          }

                          setOpenMetricTooltip(metric.label);
                          setMetricTooltipMode('focus');
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape' && openMetricTooltip === metric.label) {
                            setOpenMetricTooltip(null);
                            setMetricTooltipMode(null);
                            event.currentTarget.blur();
                          }
                        }}
                        onPointerEnter={() => {
                          if (metricTooltipMode === 'click') {
                            return;
                          }

                          setOpenMetricTooltip(metric.label);
                          setMetricTooltipMode('pointer');
                        }}
                        onPointerLeave={() => {
                          if (metricTooltipMode === 'pointer' && openMetricTooltip === metric.label) {
                            setOpenMetricTooltip(null);
                            setMetricTooltipMode(null);
                          }
                        }}
                        type="button"
                      >
                        <span className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground transition-colors group-hover/metric:text-foreground group-focus-visible/metric:text-foreground">
                          {metric.label}
                        </span>
                        <span className="mt-3 block text-3xl font-semibold tracking-[-0.04em] transition-colors group-hover/metric:text-primary group-focus-visible/metric:text-primary">
                          {metric.value}
                        </span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-56 leading-5" side="top" sideOffset={8}>
                      {metric.tooltip}
                    </TooltipContent>
                  </Tooltip>
                </div>
              ))}
            </div>

            <div className="border-t border-border/60 px-6 py-5">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-3xl border border-border/70 bg-card/55 p-4">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    {t('dashboardHealthTitle')}
                  </p>
                  <p className="mt-2 text-xl font-semibold tracking-[-0.03em]">
                    {runtimeLabel}
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
            </div>
          </CardContent>
        </Card>
      </TooltipProvider>

      <div className="grid gap-6">
        <WorkspacePanel
          description={t('dashboardRiskDescription')}
          title={t('dashboardRiskTitle')}
        >
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-3xl border border-border/80 bg-background/60 p-5">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                {t('dashboardReportFreshness')}
              </p>
              <p className="mt-3 text-xl font-semibold tracking-[-0.03em]">
                {snapshot?.sist.asOf ? new Date(snapshot.sist.asOf).toLocaleString() : '—'}
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {snapshot?.sist.status.state === 'ready'
                  ? t('sistStateReady')
                  : t('sistStateEmpty')}
              </p>
            </div>
            <div className="rounded-3xl border border-border/80 bg-background/60 p-5">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                {t('dashboardTopRegime')}
              </p>
              <p className="mt-3 text-xl font-semibold tracking-[-0.03em]">
                {regimeLabel(snapshot?.sist.topRegime, t)}
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {snapshot?.sist.status.reason ?? t('dashboardRiskDescription')}
              </p>
            </div>
            <div className="rounded-3xl border border-border/80 bg-background/60 p-5">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                {t('dashboardHighRisk')}
              </p>
              <p className="mt-3 text-xl font-semibold tracking-[-0.03em]">
                {metrics ? formatNumber(metrics.highRisk, language) : '—'}
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {t('dashboardRiskDescription')}
              </p>
            </div>
          </div>

          {highRiskInsights.length > 0 ? (
            <div className="mt-4 flex flex-col gap-3">
              {highRiskInsights.map((insight) => {
                const sku = snapshot?.skus.find((entry) => entry.skuId === insight.skuId);
                return (
                  <div
                    className="flex items-center justify-between gap-3 rounded-3xl border border-border/80 bg-card/55 px-4 py-3"
                    key={insight.skuId}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{sku?.name ?? insight.skuId}</p>
                      <p className="text-sm text-muted-foreground">
                        {t('catalogStockoutRisk')}: {formatNumber(insight.stockoutRisk * 100, language)}%
                      </p>
                    </div>
                    <Badge className="rounded-full" variant="outline">
                      <TriangleAlert className="mr-1 size-3" />
                      {t('dashboardReorderCount')}
                    </Badge>
                  </div>
                );
              })}
            </div>
          ) : (
            <WorkspaceEmpty
              description={t('dashboardNoRisk')}
              title={t('dashboardHighRisk')}
            />
          )}
        </WorkspacePanel>

      </div>
    </WorkspacePage>
  );
}
