import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { StockReport } from '@shared/inventory';
import { ArrowRight, TriangleAlert } from 'lucide-react';
import {
  MetricStrip,
  MetricStripItem,
  WorkspaceEmpty,
  WorkspacePage,
  WorkspacePanel,
} from '@/components/system/workspace';
import { DescriptionText } from '@/components/system/description-text';
import { RecentActivityList } from '@/components/system/recent-activity-list';
import { buildDefaultReportRanking } from '@/components/system/merchandising-editor';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatNumber, localeFor } from '@/lib/format';
import {
  rankingSignalCount,
  stockReportSourceKey,
  summarizeCount,
  summarizeNotes,
} from '@/lib/stock-report-summary';
import { usePreferences } from '@/state/preferences';
import { useInventory } from '@/state/inventory';

const RECENT_REPORT_LIMIT = 3;
const URGENT_SKU_LIMIT = 3;

function rankingCoverageDetail(sellableSkuCount: number, serviceCount: number) {
  return `${sellableSkuCount} SKUs + ${serviceCount} services`;
}

function recentActivityDateLabel(reportedAt: string, language: 'en' | 'km') {
  return new Intl.DateTimeFormat(localeFor(language), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(reportedAt));
}

function latestReportSummary(report: StockReport, t: (key: string) => string) {
  const serviceFlagCount = report.serviceSignals.filter((signal) => signal.stockout !== false).length;

  return [
    summarizeCount(
      report.skuObservations.length,
      t('stockHistoryChangedRowSingular'),
      t('stockHistoryChangedRowPlural'),
    ),
    summarizeCount(
      serviceFlagCount,
      t('stockHistoryServiceFlagSingular'),
      t('stockHistoryServiceFlagPlural'),
    ),
    summarizeCount(
      report.servicePriceAdjustments.length,
      t('stockHistoryPriceEditSingular'),
      t('stockHistoryPriceEditPlural'),
    ),
    summarizeCount(
      rankingSignalCount(report),
      t('stockHistoryRankingSignalSingular'),
      t('stockHistoryRankingSignalPlural'),
    ),
  ].join(' · ');
}

function urgentSignalLabel({
  daysOfCover,
  language,
  stockoutRisk,
  t,
}: {
  daysOfCover: number | null;
  language: 'en' | 'km';
  stockoutRisk: number;
  t: (key: string) => string;
}) {
  const risk = `${t('catalogStockoutRisk')}: ${formatNumber(stockoutRisk * 100, language)}%`;
  if (daysOfCover == null) {
    return risk;
  }

  return `${risk} · ${formatNumber(daysOfCover, language)} ${t('overviewDaysOfCoverSuffix')}`;
}

function buildPrimaryActions({
  hasCatalog,
  hasReports,
  reportsLoaded,
  t,
  urgentPlanningSignal,
}: {
  hasCatalog: boolean;
  hasReports: boolean;
  reportsLoaded: boolean;
  t: (key: string) => string;
  urgentPlanningSignal: boolean;
}) {
  if (!hasCatalog) {
    return {
      primary: {
        label: t('overviewPrimaryAddFirstSku'),
        href: '/catalog/skus/new',
        description: t('overviewPrimaryAddFirstSkuDescription'),
      },
      secondary: {
        label: t('overviewOpenCatalog'),
        href: '/catalog',
        description: t('overviewOpenCatalogDescription'),
      },
    };
  }

  if (reportsLoaded && !hasReports) {
    return {
      primary: {
        label: t('overviewPrimaryStartFirstUpdate'),
        href: '/operations/session',
        description: t('overviewPrimaryStartFirstUpdateDescription'),
      },
      secondary: {
        label: t('overviewOpenOperations'),
        href: '/operations',
        description: t('overviewOpenOperationsDescription'),
      },
    };
  }

  if (urgentPlanningSignal) {
    return {
      primary: {
        label: t('overviewPrimaryReviewReorderPriorities'),
        href: '/planning',
        description: t('overviewPrimaryReviewReorderPrioritiesDescription'),
      },
      secondary: {
        label: t('overviewOpenPlanning'),
        href: '/planning',
        description: t('overviewOpenPlanningDescription'),
      },
    };
  }

  return {
    primary: {
      label: t('overviewPrimaryStartUpdateSession'),
      href: '/operations/session',
      description: t('overviewPrimaryStartUpdateSessionDescription'),
    },
    secondary: {
      label: t('overviewReviewRecentActivity'),
      href: '/operations',
      description: t('overviewReviewRecentActivityDescription'),
    },
  };
}

export function DashboardRoute() {
  const { listStockReports, snapshot } = useInventory();
  const { currency, language, t } = usePreferences();
  const [recentReports, setRecentReports] = useState<StockReport[]>([]);
  const [recentReportsError, setRecentReportsError] = useState<string | null>(null);
  const [recentReportsLoading, setRecentReportsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadRecentReports() {
      setRecentReportsLoading(true);
      setRecentReportsError(null);

      try {
        const nextReports = await listStockReports();
        if (!cancelled) {
          setRecentReports(nextReports.slice(0, RECENT_REPORT_LIMIT));
        }
      } catch (error) {
        if (!cancelled) {
          setRecentReportsError(
            error instanceof Error ? error.message : t('overviewRecentActivityFallback'),
          );
        }
      } finally {
        if (!cancelled) {
          setRecentReportsLoading(false);
        }
      }
    }

    void loadRecentReports();

    return () => {
      cancelled = true;
    };
  }, [listStockReports, t]);

  if (!snapshot) {
    return (
      <WorkspacePage data-testid="overview-route">
        <WorkspacePanel description={t('overviewBody')} title={t('overviewHeading')}>
          <p className="text-sm text-muted-foreground">{t('overviewLoading')}</p>
        </WorkspacePanel>
      </WorkspacePage>
    );
  }

  const inventoryValue = snapshot.skus.reduce(
    (sum, sku) => sum + sku.unitsInStock * sku.costPerUnit,
    0,
  );
  const rankableEntryCount = buildDefaultReportRanking(snapshot).length;
  const sellableSkuCount = snapshot.skus.filter((sku) => sku.soldAsProduct).length;
  const hasCatalog = snapshot.skus.length > 0 || snapshot.services.length > 0;
  const highRiskInsights = snapshot.sist.skuInsights
    .filter((insight) => snapshot.sist.highRiskSkuIds.includes(insight.skuId))
    .sort((left, right) => right.stockoutRisk - left.stockoutRisk);
  const urgentSkus = highRiskInsights.slice(0, URGENT_SKU_LIMIT);
  const hasReorderPressure = snapshot.sist.pendingReorderCount > 0;
  const hasHighRiskSkus = snapshot.sist.highRiskSkuIds.length > 0;
  const urgentPlanningSignal = hasReorderPressure || hasHighRiskSkus;
  const reportsLoaded = !recentReportsLoading && recentReportsError == null;
  const primaryActions = buildPrimaryActions({
    hasCatalog,
    hasReports: recentReports.length > 0,
    reportsLoaded,
    t,
    urgentPlanningSignal,
  });
  const latestReport = recentReports[0];
  const heroSupport = (() => {
    if (!hasCatalog) {
      return {
        label: t('overviewDecisionSupportLabel'),
        title: t('overviewDecisionSupportCatalogTitle'),
        body: t('overviewDecisionSupportCatalogBody'),
        detail: null,
      };
    }

    if (hasHighRiskSkus) {
      return {
        label: t('overviewDecisionSupportLabel'),
        title: t('overviewDecisionSupportRiskTitle'),
        body: t('overviewDecisionSupportRiskBody'),
        detail: `${formatNumber(snapshot.sist.highRiskSkuIds.length, language)} ${t('overviewHighRiskSkuCount')} · ${formatNumber(snapshot.sist.pendingReorderCount, language)} ${t('overviewReorderPressure')}`,
      };
    }

    if (hasReorderPressure) {
      return {
        label: t('overviewDecisionSupportLabel'),
        title: t('overviewDecisionSupportReorderTitle'),
        body: t('overviewDecisionSupportReorderBody'),
        detail: `${formatNumber(snapshot.sist.pendingReorderCount, language)} ${t('overviewReorderPressure')}`,
      };
    }

    if (reportsLoaded && !latestReport) {
      return {
        label: t('overviewDecisionSupportLabel'),
        title: t('overviewDecisionSupportFirstReportTitle'),
        body: t('overviewDecisionSupportFirstReportBody'),
        detail: null,
      };
    }

    if (latestReport) {
      return {
        label: t('overviewLatestChangeLabel'),
        title: recentActivityDateLabel(latestReport.reportedAt, language),
        body: summarizeNotes(latestReport.notes) || latestReportSummary(latestReport, t),
        detail: latestReportSummary(latestReport, t),
      };
    }

    return {
      label: t('overviewDecisionSupportLabel'),
      title: t('overviewDecisionSupportSteadyTitle'),
      body: t('overviewDecisionSupportSteadyBody'),
      detail: null,
    };
  })();

  return (
    <WorkspacePage data-testid="overview-route">
      <WorkspacePanel description={t('overviewBody')} title={t('overviewHeading')}>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.9fr)]">
          <div className="rounded-3xl border border-border/70 bg-background/55 p-5">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              {t('overviewPrimaryCardLabel')}
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">
              {primaryActions.primary.label}
            </h2>
            <DescriptionText className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              {primaryActions.primary.description}
            </DescriptionText>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button asChild>
                <Link to={primaryActions.primary.href}>
                  {primaryActions.primary.label}
                  <ArrowRight data-icon="inline-end" />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to={primaryActions.secondary.href}>{primaryActions.secondary.label}</Link>
              </Button>
            </div>
          </div>

          <div className="rounded-3xl border border-border/70 bg-card/55 p-5">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              {heroSupport.label}
            </p>
            <p className="mt-3 text-lg font-semibold tracking-[-0.03em] text-foreground">
              {heroSupport.title}
            </p>
            <DescriptionText className="mt-3 text-sm leading-6 text-muted-foreground">
              {heroSupport.body}
            </DescriptionText>
            {heroSupport.detail ? (
              <p className="mt-4 text-sm text-foreground">{heroSupport.detail}</p>
            ) : null}
          </div>
        </div>
      </WorkspacePanel>

      <WorkspacePanel
        action={
          urgentPlanningSignal ? (
            <Button asChild variant="outline">
              <Link to="/planning">{t('overviewOpenPlanning')}</Link>
            </Button>
          ) : (
            <Button asChild variant="outline">
              <Link to={hasCatalog ? '/operations' : '/catalog'}>
                {hasCatalog ? t('overviewOpenOperations') : t('overviewOpenCatalog')}
              </Link>
            </Button>
          )
        }
        description={t('overviewNeedsAttentionDescription')}
        title={t('overviewNeedsAttentionTitle')}
      >
        {hasHighRiskSkus ? (
          <div className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-3xl border border-border/70 bg-background/55 p-5">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  {t('overviewReorderPressure')}
                </p>
                <p className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
                  {formatNumber(snapshot.sist.pendingReorderCount, language)}
                </p>
              </div>
              <div className="rounded-3xl border border-border/70 bg-background/55 p-5">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  {t('overviewHighRiskSkuCount')}
                </p>
                <p className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
                  {formatNumber(snapshot.sist.highRiskSkuIds.length, language)}
                </p>
              </div>
            </div>

            <div className="grid gap-3">
              {urgentSkus.map((insight) => {
                const sku = snapshot.skus.find((entry) => entry.skuId === insight.skuId);

                return (
                  <div
                    className="flex items-start justify-between gap-3 rounded-3xl border border-border/70 bg-card/55 px-4 py-4"
                    key={insight.skuId}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">
                        {sku?.name ?? insight.skuId}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {urgentSignalLabel({
                          daysOfCover: insight.daysOfCover,
                          language,
                          stockoutRisk: insight.stockoutRisk,
                          t,
                        })}
                      </p>
                    </div>
                    <Badge className="rounded-full" variant="outline">
                      <TriangleAlert className="mr-1 size-3" />
                      {t('overviewUrgentBadge')}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>
        ) : hasReorderPressure ? (
          <div className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-3xl border border-border/70 bg-background/55 p-5">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  {t('overviewReorderPressure')}
                </p>
                <p className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
                  {formatNumber(snapshot.sist.pendingReorderCount, language)}
                </p>
              </div>
              <div className="rounded-3xl border border-border/70 bg-background/55 p-5">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  {t('overviewHighRiskSkuCount')}
                </p>
                <p className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
                  {formatNumber(snapshot.sist.highRiskSkuIds.length, language)}
                </p>
              </div>
            </div>

            <div className="rounded-3xl border border-border/70 bg-card/55 px-4 py-4">
              <p className="font-medium text-foreground">{t('overviewReorderPressureOnlyTitle')}</p>
              <DescriptionText className="mt-2 text-sm text-muted-foreground">
                {t('overviewReorderPressureOnlyDescription')}
              </DescriptionText>
            </div>
          </div>
        ) : (
          <WorkspaceEmpty
            action={
              <Button asChild variant="outline">
                <Link to={hasCatalog ? '/operations' : '/catalog'}>
                  {hasCatalog ? t('overviewOpenOperations') : t('overviewOpenCatalog')}
                </Link>
              </Button>
            }
            description={t('overviewHealthyStateDescription')}
            title={t('overviewHealthyStateTitle')}
          />
        )}
      </WorkspacePanel>

      <WorkspacePanel
        action={
          <Button asChild variant="outline">
            <Link to="/operations">{t('overviewReviewRecentActivity')}</Link>
          </Button>
        }
        description={t('overviewRecentActivityDescription')}
        title={t('overviewRecentActivityTitle')}
      >
        {recentReportsLoading ? (
          <p className="text-sm text-muted-foreground">{t('overviewRecentActivityLoading')}</p>
        ) : recentReportsError ? (
          <p className="text-sm text-muted-foreground">{t('overviewRecentActivityFallback')}</p>
        ) : recentReports.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('overviewRecentActivityEmpty')}</p>
        ) : (
          <RecentActivityList
            items={recentReports}
            renderDateLabel={(report) => recentActivityDateLabel(report.reportedAt, language)}
            renderSourceLabel={(report) => t(stockReportSourceKey(report.reportSource))}
            renderSummary={(report) => latestReportSummary(report, t)}
            renderNotes={(report) => summarizeNotes(report.notes) ?? t('stockHistoryNoNotes')}
          />
        )}
      </WorkspacePanel>

      <WorkspacePanel
        description={t('overviewSupportMetricsDescription')}
        title={t('overviewSupportMetricsTitle')}
      >
        <MetricStrip>
          <MetricStripItem
            detail={t('overviewSupportMetricsValueDetail')}
            label={t('dashboardTotalValue')}
            value={formatCurrency(inventoryValue, currency, language)}
          />
          <MetricStripItem
            detail={t('overviewSupportMetricsSaleReadyDetail')}
            label={t('dashboardSaleReady')}
            value={formatNumber(sellableSkuCount, language)}
          />
          <MetricStripItem
            detail={t('overviewSupportMetricsServicesDetail')}
            label={t('dashboardServices')}
            value={formatNumber(snapshot.services.length, language)}
          />
          <MetricStripItem
            detail={rankingCoverageDetail(sellableSkuCount, snapshot.services.length)}
            label={t('overviewRankingCoverage')}
            value={formatNumber(rankableEntryCount, language)}
          />
        </MetricStrip>
      </WorkspacePanel>
    </WorkspacePage>
  );
}
