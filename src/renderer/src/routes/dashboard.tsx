import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { InventorySnapshot, StockReport, SkuRecord, SistSkuInsight } from '@shared/inventory';
import { ArrowRight } from 'lucide-react';
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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { linkedServicesForSku } from '@/lib/catalog';
import { formatCurrency, formatNumber, localeFor } from '@/lib/format';
import {
  rankingSignalCount,
  stockReportSourceKey,
  summarizeCount,
  summarizeNotes,
} from '@/lib/stock-report-summary';
import { cn } from '@/lib/utils';
import { usePreferences } from '@/state/preferences';
import { useInventory } from '@/state/inventory';

const RECENT_REPORT_LIMIT = 3;
const PLANNING_QUEUE_VISIBLE_LIMIT = 4;

type QueueFilter = 'all' | 'reorder-now' | 'high-risk' | 'service-impact';
type QueueSeverity = 'critical' | 'reorder-now' | 'at-risk' | 'watch';

type PlanningQueueItem = {
  skuId: string;
  name: string;
  insight: SistSkuInsight;
  sku: SkuRecord | null;
  affectedServiceCount: number;
  isHighRisk: boolean;
  hasReorderPressure: boolean;
  dueWithin48h: boolean;
  severity: QueueSeverity;
  decisionSentence: string;
  reasonLine: string;
};

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

function reorderPressureActive(insight: SistSkuInsight) {
  return insight.latestPosteriorUnits <= insight.reorderPoint || insight.reorderTriggerProbability >= 0.5;
}

function isQueueCandidate(insight: SistSkuInsight, isHighRisk: boolean) {
  return (
    isHighRisk ||
    reorderPressureActive(insight) ||
    (insight.daysOfCover != null && insight.daysOfCover <= 5) ||
    insight.stockoutRisk >= 0.2
  );
}

function queueSeverity({
  affectedServiceCount,
  insight,
  isHighRisk,
}: {
  affectedServiceCount: number;
  insight: SistSkuInsight;
  isHighRisk: boolean;
}): QueueSeverity {
  const zeroCover =
    insight.latestPosteriorUnits <= 0 || (insight.daysOfCover != null && insight.daysOfCover <= 0);

  if (zeroCover || insight.stockoutRisk >= 0.8) {
    return 'critical';
  }
  if (
    (insight.daysOfCover != null && insight.daysOfCover <= 2) ||
    insight.stockoutRisk >= 0.5 ||
    insight.reorderTriggerProbability >= 0.8
  ) {
    return affectedServiceCount > 0 && insight.stockoutRisk >= 0.45 ? 'critical' : 'reorder-now';
  }
  if (isHighRisk || insight.stockoutRisk >= 0.25 || reorderPressureActive(insight)) {
    return 'at-risk';
  }
  return 'watch';
}

function queueSeverityLabel(severity: QueueSeverity, t: (key: string) => string) {
  if (severity === 'critical') {
    return t('overviewQueueSeverityCritical');
  }
  if (severity === 'reorder-now') {
    return t('overviewQueueSeverityReorderNow');
  }
  if (severity === 'at-risk') {
    return t('overviewQueueSeverityAtRisk');
  }
  return t('overviewQueueSeverityWatch');
}

function queueDecisionSentence({
  hasReorderPressure,
  insight,
  isHighRisk,
  language,
  severity,
  t,
}: {
  hasReorderPressure: boolean;
  insight: SistSkuInsight;
  isHighRisk: boolean;
  language: 'en' | 'km';
  severity: QueueSeverity;
  t: (key: string) => string;
}) {
  if (severity === 'critical' || (insight.daysOfCover != null && insight.daysOfCover <= 2)) {
    if (insight.daysOfCover == null) {
      return t('overviewQueueDecisionImmediateUnknownCover');
    }

    return t('overviewQueueDecisionImmediate').replace(
      '{days}',
      formatNumber(insight.daysOfCover, language),
    );
  }

  if (isHighRisk || severity === 'at-risk') {
    return t('overviewQueueDecisionElevated');
  }

  if (hasReorderPressure) {
    return t('overviewQueueDecisionPressure');
  }

  return t('overviewQueueDecisionWatch');
}

function queueReasonLine({
  affectedServiceCount,
  hasReorderPressure,
  insight,
  language,
  t,
}: {
  affectedServiceCount: number;
  hasReorderPressure: boolean;
  insight: SistSkuInsight;
  language: 'en' | 'km';
  t: (key: string) => string;
}) {
  const reasons = [
    `${formatNumber(insight.stockoutRisk * 100, language)}% ${t('overviewQueueReasonRiskSuffix')}`,
    hasReorderPressure
      ? insight.latestPosteriorUnits <= insight.reorderPoint
        ? t('overviewQueueReasonReorderBreached')
        : t('overviewQueueReasonReorderPressure')
      : null,
    affectedServiceCount > 0
      ? t('overviewQueueReasonServiceImpact')
          .replace('{count}', formatNumber(affectedServiceCount, language))
          .replace(
            '{noun}',
            affectedServiceCount === 1
              ? t('overviewQueueReasonServiceSingular')
              : t('overviewQueueReasonServicePlural'),
          )
      : null,
    insight.confidence === 'low' ? t('overviewQueueReasonLowConfidence') : null,
  ].filter((reason): reason is string => Boolean(reason));

  return reasons.slice(0, 3).join(' · ');
}

function planningQueueSort(left: PlanningQueueItem, right: PlanningQueueItem) {
  const leftZeroCover =
    left.insight.latestPosteriorUnits <= 0 ||
    (left.insight.daysOfCover != null && left.insight.daysOfCover <= 0);
  const rightZeroCover =
    right.insight.latestPosteriorUnits <= 0 ||
    (right.insight.daysOfCover != null && right.insight.daysOfCover <= 0);

  if (leftZeroCover !== rightZeroCover) {
    return leftZeroCover ? -1 : 1;
  }

  const leftDays = left.insight.daysOfCover ?? Number.POSITIVE_INFINITY;
  const rightDays = right.insight.daysOfCover ?? Number.POSITIVE_INFINITY;
  if (leftDays !== rightDays) {
    return leftDays - rightDays;
  }

  if (left.insight.stockoutRisk !== right.insight.stockoutRisk) {
    return right.insight.stockoutRisk - left.insight.stockoutRisk;
  }

  if (left.affectedServiceCount !== right.affectedServiceCount) {
    return right.affectedServiceCount - left.affectedServiceCount;
  }

  return left.name.localeCompare(right.name);
}

function buildPlanningQueue({
  language,
  snapshot,
  t,
}: {
  language: 'en' | 'km';
  snapshot: InventorySnapshot;
  t: (key: string) => string;
}) {
  const highRiskSkuIds = new Set(snapshot.sist.highRiskSkuIds);

  return snapshot.sist.skuInsights
    .map((insight) => {
      const sku = snapshot.skus.find((entry) => entry.skuId === insight.skuId) ?? null;
      const affectedServiceCount = linkedServicesForSku(insight.skuId, snapshot).length;
      const isHighRisk = highRiskSkuIds.has(insight.skuId);
      const hasReorderPressure = reorderPressureActive(insight);

      if (!isQueueCandidate(insight, isHighRisk)) {
        return null;
      }

      const severity = queueSeverity({ affectedServiceCount, insight, isHighRisk });

      return {
        skuId: insight.skuId,
        name: sku?.name ?? insight.skuId,
        insight,
        sku,
        affectedServiceCount,
        isHighRisk,
        hasReorderPressure,
        dueWithin48h: insight.daysOfCover != null && insight.daysOfCover <= 2,
        severity,
        decisionSentence: queueDecisionSentence({
          hasReorderPressure,
          insight,
          isHighRisk,
          language,
          severity,
          t,
        }),
        reasonLine: queueReasonLine({
          affectedServiceCount,
          hasReorderPressure,
          insight,
          language,
          t,
        }),
      } satisfies PlanningQueueItem;
    })
    .filter((item): item is PlanningQueueItem => Boolean(item))
    .sort(planningQueueSort);
}

function queueMatchesFilter(item: PlanningQueueItem, filter: QueueFilter) {
  if (filter === 'all') {
    return true;
  }
  if (filter === 'reorder-now') {
    return item.dueWithin48h || item.severity === 'critical' || item.severity === 'reorder-now';
  }
  if (filter === 'high-risk') {
    return item.isHighRisk;
  }
  return item.affectedServiceCount > 0;
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
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('all');

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
  const hasReorderPressure = snapshot.sist.pendingReorderCount > 0;
  const hasHighRiskSkus = snapshot.sist.highRiskSkuIds.length > 0;
  const planningQueue = buildPlanningQueue({ language, snapshot, t });
  const filteredQueue = planningQueue.filter((item) => queueMatchesFilter(item, queueFilter));
  const visibleQueue = filteredQueue.slice(0, PLANNING_QUEUE_VISIBLE_LIMIT);
  const hiddenQueueCount = Math.max(filteredQueue.length - visibleQueue.length, 0);
  const dueWithin48hCount = planningQueue.filter((item) => item.dueWithin48h).length;
  const hasQueueSignals = hasReorderPressure || hasHighRiskSkus || planningQueue.length > 0;
  const urgentPlanningSignal = hasQueueSignals;
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
          hasQueueSignals ? (
            <Button asChild variant="outline">
              <Link to="/planning">{t('overviewOpenReorderQueue')}</Link>
            </Button>
          ) : (
            <Button asChild variant="outline">
              <Link to={hasCatalog ? '/operations' : '/catalog'}>
                {hasCatalog ? t('overviewOpenOperations') : t('overviewOpenCatalog')}
              </Link>
            </Button>
          )
        }
        description={t('overviewPlanningQueueDescription')}
        title={t('overviewPlanningQueueTitle')}
      >
        {hasQueueSignals ? (
          <div className="grid gap-4">
            <div className="rounded-3xl border border-border/70 bg-background/60 px-4 py-3">
              <p className="text-sm text-foreground">
                {[
                  `${formatNumber(snapshot.sist.pendingReorderCount, language)} ${t('overviewQueueSummaryReorderCandidates')}`,
                  `${formatNumber(snapshot.sist.highRiskSkuIds.length, language)} ${t('overviewQueueSummaryHighRisk')}`,
                  `${formatNumber(dueWithin48hCount, language)} ${t('overviewQueueSummaryDueSoon')}`,
                ].join(' · ')}
              </p>
              {hiddenQueueCount > 0 ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {t('overviewQueueSummaryRemaining').replace(
                    '{count}',
                    formatNumber(hiddenQueueCount, language),
                  )}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <DescriptionText className="max-w-2xl text-sm leading-6 text-muted-foreground">
                {t('overviewQueueFilterDescription')}
              </DescriptionText>
              <ToggleGroup
                aria-label={t('overviewQueueFilterLabel')}
                spacing={1}
                type="single"
                value={queueFilter}
                onValueChange={(nextValue) => {
                  if (!nextValue) {
                    return;
                  }
                  setQueueFilter(nextValue as QueueFilter);
                }}
              >
                <ToggleGroupItem value="all">{t('filterAll')}</ToggleGroupItem>
                <ToggleGroupItem value="reorder-now">{t('overviewQueueFilterReorderNow')}</ToggleGroupItem>
                <ToggleGroupItem value="high-risk">{t('overviewQueueFilterHighRisk')}</ToggleGroupItem>
                <ToggleGroupItem value="service-impact">
                  {t('overviewQueueFilterServiceImpact')}
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            {visibleQueue.length > 0 ? (
              <div className="grid gap-3">
                {visibleQueue.map((item, index) => (
                  <div
                    className={cn(
                      'flex items-start justify-between gap-4 rounded-3xl border px-4 py-4',
                      index === 0
                        ? 'border-amber-300/70 bg-amber-50/80 shadow-[inset_4px_0_0_rgba(217,119,6,0.9)] dark:bg-amber-950/20'
                        : 'border-border/70 bg-card/55',
                    )}
                    data-lead-row={index === 0 ? 'true' : 'false'}
                    data-testid="planning-queue-row"
                    key={item.skuId}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">{item.name}</p>
                      <p
                        className={cn(
                          'mt-1 text-sm text-foreground',
                          index === 0 && 'text-base font-semibold tracking-[-0.02em]',
                        )}
                      >
                        {item.decisionSentence}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">{item.reasonLine}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-3">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Badge
                          className={cn(
                            item.severity === 'critical' &&
                              'border-red-300/80 bg-red-50 text-red-900 dark:bg-red-950/20 dark:text-red-100',
                            item.severity === 'reorder-now' &&
                              'border-amber-300/80 bg-amber-50 text-amber-900 dark:bg-amber-950/20 dark:text-amber-100',
                            item.severity === 'at-risk' &&
                              'border-orange-300/80 bg-orange-50 text-orange-900 dark:bg-orange-950/20 dark:text-orange-100',
                            item.severity === 'watch' &&
                              'border-border/80 bg-background/70 text-foreground',
                          )}
                          variant="outline"
                        >
                          {queueSeverityLabel(item.severity, t)}
                        </Badge>
                        {item.affectedServiceCount > 0 ? (
                          <Badge className="border-border/80 bg-background/70" variant="outline">
                            {t('overviewQueueFilterServiceImpact')}
                          </Badge>
                        ) : null}
                      </div>
                      <Button asChild size="sm" variant="outline">
                        <Link to={`/catalog/skus/${item.skuId}`}>{t('overviewReviewSku')}</Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : planningQueue.length > 0 ? (
              <div className="rounded-3xl border border-dashed border-border/70 bg-card/40 px-4 py-4">
                <p className="font-medium text-foreground">{t('overviewQueueNoFilterMatchesTitle')}</p>
                <DescriptionText className="mt-2 text-sm text-muted-foreground">
                  {t('overviewQueueNoFilterMatchesDescription')}
                </DescriptionText>
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-border/70 bg-card/40 px-4 py-4">
                <p className="font-medium text-foreground">{t('overviewQueueReorderPressureTitle')}</p>
                <DescriptionText className="mt-2 text-sm text-muted-foreground">
                  {t('overviewQueueReorderPressureDescription')}
                </DescriptionText>
              </div>
            )}
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
            description={t('overviewQueueHealthyDescription')}
            title={t('overviewQueueHealthyTitle')}
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
