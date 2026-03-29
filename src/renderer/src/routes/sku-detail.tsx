import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { SistSkuDetail, SistSkuInsight, StockReport } from '@shared/inventory';
import { ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  MetricStrip,
  MetricStripItem,
  WorkspaceEmpty,
  WorkspacePage,
  WorkspacePanel,
} from '@/components/system/workspace';
import { DescriptionText } from '@/components/system/description-text';
import { RecentActivityList } from '@/components/system/recent-activity-list';
import { formatCurrency, formatNumber, localeFor } from '@/lib/format';
import {
  linkedServicesForSku,
  serviceLinkedSkus,
} from '@/lib/catalog';
import { stockReportSourceKey, summarizeNotes } from '@/lib/stock-report-summary';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';

function SkuSummaryField({
  label,
  value,
  detail,
  divider = true,
}: {
  label: string;
  value: string;
  detail?: string;
  divider?: boolean;
}) {
  return (
    <div
      className={
        divider
          ? 'border-b border-border/60 py-4 last:border-b-0 last:pb-0 first:pt-0'
          : 'py-4 first:pt-0'
      }
    >
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-lg font-semibold tracking-[-0.03em] text-foreground">{value}</p>
      <DescriptionText className="mt-1 text-sm leading-6 text-muted-foreground">{detail}</DescriptionText>
    </div>
  );
}

function reportDateLabel(reportedAt: string, language: 'en' | 'km') {
  return new Intl.DateTimeFormat(localeFor(language), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(reportedAt));
}

function leadTimeSummary(insight: SistSkuInsight, language: 'en' | 'km') {
  return `${formatNumber(insight.leadTime.meanDays, language)} ± ${formatNumber(
    insight.leadTime.stdDays,
    language,
  )}d`;
}

function skuOperationalState(insight: SistSkuInsight | null) {
  if (!insight) {
    return 'unknown';
  }
  if (insight.stockoutRisk >= 0.35) {
    return 'at-risk';
  }
  if (
    insight.reorderTriggerProbability >= 0.5 ||
    (insight.daysOfCover != null && insight.daysOfCover <= 5)
  ) {
    return 'reorder-soon';
  }
  if (insight.daysOfCover != null && insight.daysOfCover >= 14 && insight.stockoutRisk <= 0.1) {
    return 'overstocked';
  }
  return 'healthy';
}

function skuPlanningActionState(insight: SistSkuInsight | null) {
  if (!insight) {
    return null;
  }
  if (insight.stockoutRisk >= 0.35) {
    return 'risk';
  }
  if (insight.confidence === 'low' && insight.stockoutRisk <= 0.15) {
    return 'low-confidence';
  }
  if (
    insight.reorderTriggerProbability >= 0.5 ||
    (insight.daysOfCover != null && insight.daysOfCover <= 5)
  ) {
    return 'pressure';
  }
  return 'steady';
}

function skuReportSummary({
  currentSku,
  report,
  currency,
  language,
  t,
}: {
  currentSku: {
    unitsInStock: number;
    costPerUnit: number;
  };
  report: StockReport;
  currency: 'USD' | 'KHR';
  language: 'en' | 'km';
  t: (key: string) => string;
}) {
  const observation = report.skuObservations[0];
  if (!observation) {
    return t('catalogSkuRecentReportsNoSkuChanges');
  }

  const changes: string[] = [];

  if (observation.unitsInStock !== currentSku.unitsInStock) {
    changes.push(
      `${t('catalogSkuRecentReportsStockAdjusted')} ${formatNumber(
        currentSku.unitsInStock,
        language,
      )} -> ${formatNumber(observation.unitsInStock, language)}`,
    );
  }

  if (observation.costPerUnit !== currentSku.costPerUnit) {
    changes.push(
      `${t('catalogSkuRecentReportsCostUpdated')} ${formatCurrency(
        observation.costPerUnit,
        currency,
        language,
      )}`,
    );
  }

  if (observation.retailStockout) {
    changes.push(t('catalogSkuRecentReportsRetailStockout'));
  }

  if (observation.restockIncluded) {
    changes.push(t('catalogSkuRecentReportsRestockIncluded'));
  }

  return changes.length > 0 ? changes.join(' · ') : t('catalogSkuRecentReportsNoSkuChanges');
}

function RecentReportList({
  currency,
  language,
  sku,
  reports,
  t,
}: {
  currency: 'USD' | 'KHR';
  language: 'en' | 'km';
  sku: {
    unitsInStock: number;
    costPerUnit: number;
  };
  reports: StockReport[];
  t: (key: string) => string;
}) {
  return (
    <RecentActivityList
      items={reports}
      renderDateLabel={(report) => reportDateLabel(report.reportedAt, language)}
      renderSourceLabel={(report) => t(stockReportSourceKey(report.reportSource))}
      renderSummary={(report) =>
        skuReportSummary({
          currentSku: sku,
          report,
          currency,
          language,
          t,
        })
      }
      renderNotes={(report) => summarizeNotes(report.notes) ?? t('stockHistoryNoNotes')}
    />
  );
}

function PlanningMetricsList({
  language,
  planningInsight,
  t,
}: {
  language: 'en' | 'km';
  planningInsight: SistSkuInsight;
  t: (key: string) => string;
}) {
  return (
    <div className="mt-4 grid gap-2 border-t border-border/60 pt-4 sm:grid-cols-2 xl:grid-cols-1">
      <SkuSummaryField
        label={t('catalogDaysOfCover')}
        value={
          planningInsight.daysOfCover == null
            ? '—'
            : formatNumber(planningInsight.daysOfCover, language)
        }
      />
      <SkuSummaryField
        label={t('catalogStockoutRisk')}
        value={`${formatNumber(planningInsight.stockoutRisk * 100, language)}%`}
      />
      <SkuSummaryField
        label={t('catalogReorderPoint')}
        value={formatNumber(planningInsight.reorderPoint, language)}
      />
      <SkuSummaryField
        label={t('catalogConfidence')}
        value={planningInsight.confidence}
      />
      <SkuSummaryField
        label={t('catalogSkuLeadTimeSummary')}
        value={leadTimeSummary(planningInsight, language)}
      />
    </div>
  );
}

export function SkuDetailRoute() {
  const { skuId } = useParams();
  const { loadSistSkuDetail, snapshot } = useInventory();
  const { currency, language, t } = usePreferences();
  const [skuDetail, setSkuDetail] = useState<SistSkuDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [planningMetricsExpanded, setPlanningMetricsExpanded] = useState(true);

  const sku = useMemo(
    () => snapshot?.skus.find((entry) => entry.skuId === skuId) ?? null,
    [skuId, snapshot],
  );

  const snapshotInsight = useMemo(
    () => snapshot?.sist.skuInsights.find((entry) => entry.skuId === skuId) ?? null,
    [skuId, snapshot],
  );

  const linkedServices = useMemo(
    () => (snapshot && skuId ? linkedServicesForSku(skuId, snapshot) : []),
    [skuId, snapshot],
  );

  const planningInsight = skuDetail?.insight ?? snapshotInsight;
  const operationalState = skuOperationalState(planningInsight);
  const planningActionState = skuPlanningActionState(planningInsight);
  const operationalStatusKey =
    operationalState === 'at-risk'
      ? 'catalogSkuOperationalAtRisk'
      : operationalState === 'reorder-soon'
        ? 'catalogSkuOperationalReorderSoon'
        : operationalState === 'overstocked'
          ? 'catalogSkuOperationalOverstocked'
          : operationalState === 'healthy'
            ? 'catalogSkuOperationalHealthy'
            : null;
  const prioritizeSession = operationalState === 'at-risk' || operationalState === 'reorder-soon';
  const recordStockActionVariant = prioritizeSession ? 'default' : 'outline';
  const editSkuActionVariant = prioritizeSession ? 'outline' : 'default';
  const linkedServiceDetail =
    linkedServices.length > 0
      ? `${formatNumber(linkedServices.length, language)} ${
          linkedServices.length === 1
            ? t('catalogSkuOperationalLinkedServiceSingular')
            : t('catalogSkuOperationalLinkedServicePlural')
        }`
      : null;
  const operationalExplanation =
    planningInsight == null
      ? t('catalogSkuOperationalNoPlanning')
      : operationalState === 'at-risk'
        ? `${formatNumber(planningInsight.daysOfCover ?? 0, language)} ${t('overviewDaysOfCoverSuffix')}${
            linkedServiceDetail ? `, ${linkedServiceDetail}` : ''
          }`
        : operationalState === 'reorder-soon'
          ? `${formatNumber(planningInsight.reorderPoint, language)} ${t('catalogReorderPoint').toLowerCase()} · ${
              linkedServiceDetail ??
              `${formatNumber(planningInsight.daysOfCover ?? 0, language)} ${t('overviewDaysOfCoverSuffix')}`
            }`
          : operationalState === 'overstocked'
            ? `${formatNumber(sku.unitsInStock, language)} ${t('fieldUnitsInStock').toLowerCase()}, well above ${t('catalogReorderPoint').toLowerCase()}`
            : `${formatNumber(sku.unitsInStock, language)} ${t('fieldUnitsInStock').toLowerCase()}${
                linkedServiceDetail ? `, ${linkedServiceDetail}` : ''
              }`;
  const planningActionTitleKey =
    planningActionState === 'risk'
      ? 'catalogSkuPlanningActionRisk'
      : planningActionState === 'pressure'
        ? 'catalogSkuPlanningActionPressure'
        : planningActionState === 'low-confidence'
          ? 'catalogSkuPlanningActionLowConfidence'
          : 'catalogSkuPlanningActionSteady';
  const planningActionExplanation =
    planningInsight == null
      ? null
      : planningActionState === 'risk'
        ? `${formatNumber(planningInsight.stockoutRisk * 100, language)}% ${t('catalogStockoutRisk').toLowerCase()} · ${formatNumber(
            planningInsight.daysOfCover ?? 0,
            language,
          )} ${t('overviewDaysOfCoverSuffix')}`
        : planningActionState === 'pressure'
          ? `${formatNumber(planningInsight.reorderPoint, language)} ${t('catalogReorderPoint').toLowerCase()} · ${formatNumber(
              planningInsight.reorderTriggerProbability * 100,
              language,
            )}% trigger probability`
          : planningActionState === 'low-confidence'
            ? `${t('catalogConfidence')}: ${planningInsight.confidence} · ${formatNumber(
                planningInsight.daysOfCover ?? 0,
                language,
              )} ${t('overviewDaysOfCoverSuffix')}`
          : `${formatNumber(planningInsight.daysOfCover ?? 0, language)} ${t('overviewDaysOfCoverSuffix')} · ${formatNumber(
                planningInsight.stockoutRisk * 100,
                language,
              )}% ${t('catalogStockoutRisk').toLowerCase()}`;
  const operationalStatusLabel = operationalStatusKey
    ? t(operationalStatusKey)
    : t('catalogSkuOperationalNoPlanning');
  const operationalStatusBadgeVariant =
    operationalState === 'at-risk'
      ? 'destructive'
      : operationalState === 'reorder-soon'
        ? 'secondary'
        : 'outline';
  const operationalStatusToneClass =
    operationalState === 'at-risk'
      ? 'border-destructive/30 bg-destructive/5'
      : operationalState === 'reorder-soon'
        ? 'border-secondary/60 bg-secondary/25'
        : operationalState === 'overstocked'
          ? 'border-primary/25 bg-primary/5'
          : 'border-border/70 bg-background/45';

  useEffect(() => {
    let cancelled = false;

    if (!skuId || !sku) {
      return;
    }

    setDetailLoading(true);
    setDetailError(null);

    loadSistSkuDetail(skuId)
      .then((nextDetail) => {
        if (!cancelled) {
          setSkuDetail(nextDetail);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setDetailError(error instanceof Error ? error.message : t('apiUnavailable'));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setDetailLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [loadSistSkuDetail, sku, skuId, t]);

  if (!snapshot) {
    return (
      <WorkspacePage>
        <WorkspaceEmpty description={t('apiUnavailable')} title={t('catalogSkuDetailTitle')} />
      </WorkspacePage>
    );
  }

  if (!sku) {
    return (
      <WorkspacePage>
        <WorkspaceEmpty
          action={
            <Button asChild>
              <Link to="/catalog">{t('backToCatalog')}</Link>
            </Button>
          }
          description={t('catalogSkuDetailNotFoundDescription')}
          title={t('catalogSkuDetailNotFoundTitle')}
        />
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage data-testid="sku-detail-route">
      <WorkspacePanel
        action={
          <div className="flex flex-wrap gap-3">
            <Button asChild variant={recordStockActionVariant}>
              <Link to={`/operations/session?step=observations&focusSku=${sku.skuId}`}>
                {t('catalogSkuStockAction')}
              </Link>
            </Button>
            <Button asChild variant={editSkuActionVariant}>
              <Link to={`/catalog/skus/${sku.skuId}/edit`}>{t('catalogSkuEditAction')}</Link>
            </Button>
          </div>
        }
        description={sku.description || t('catalogSkuOverviewIdentityDescription')}
        title={
          <div className="flex items-center gap-3">
            <Button asChild aria-label={t('backToCatalog')} size="icon" variant="ghost">
              <Link to="/catalog">
                <ArrowLeft />
              </Link>
            </Button>
            <span>{sku.name}</span>
          </div>
        }
      >
        <div
          className={`rounded-3xl border px-5 py-5 sm:px-6 ${operationalStatusToneClass}`}
        >
          <div className="min-w-0">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              {t('catalogSkuOperationalStatusTitle')}
            </p>
            <p className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-foreground sm:text-4xl">
              {operationalStatusLabel}
            </p>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              {operationalExplanation}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            {t('fieldId')}: {sku.skuId}
          </Badge>
          <Badge variant={sku.soldAsProduct ? 'secondary' : 'outline'}>
            {sku.soldAsProduct ? t('inventorySoldAsProduct') : t('inventoryNotSoldAsProduct')}
          </Badge>
          {linkedServices.length > 0 ? (
            <Badge variant="outline">
              {formatNumber(linkedServices.length, language)}{' '}
              {linkedServices.length === 1
                ? t('catalogLinkedServicesAffectedSingular')
                : t('catalogLinkedServicesAffectedPlural')}
            </Badge>
          ) : null}
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
          <div className="rounded-3xl border border-border/70 bg-card/55 px-4 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                {t('catalogSkuPlanningActionTitle')}
              </p>
              {planningInsight ? (
                <button
                  aria-controls="sku-planning-metrics"
                  aria-expanded={planningMetricsExpanded}
                  className="inline-flex items-center rounded-full border border-border bg-background px-3 py-1 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  type="button"
                  onClick={() => setPlanningMetricsExpanded((current) => !current)}
                >
                  {t('catalogSkuPlanningMetricsTitle')}
                </button>
              ) : null}
            </div>
            {planningInsight ? (
              <>
                <p className="mt-2 text-lg font-semibold tracking-[-0.03em] text-foreground">
                  {t(planningActionTitleKey)}
                </p>
                {planningActionExplanation ? (
                  <DescriptionText className="mt-2 text-sm leading-6 text-muted-foreground">
                    {planningActionExplanation}
                  </DescriptionText>
                ) : null}
                {detailError ? (
                  <p className="mt-3 text-sm text-muted-foreground">
                    {t('catalogSkuPlanningSignalsFallback')}
                  </p>
                ) : null}
                {planningMetricsExpanded ? (
                  <div id="sku-planning-metrics">
                    <PlanningMetricsList
                      language={language}
                      planningInsight={planningInsight}
                      t={t}
                    />
                  </div>
                ) : null}
              </>
            ) : detailLoading ? (
              <p className="mt-2 text-sm text-muted-foreground">
                {t('catalogSkuDetailLoaderLoading')}
              </p>
            ) : detailError ? (
              <p className="mt-2 text-sm text-muted-foreground">
                {t('catalogSkuPlanningSignalsFallback')}
              </p>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                {t('catalogSkuPlanningSignalsEmpty')}
              </p>
            )}
          </div>

          <div className="rounded-3xl border border-border/70 bg-background/55 px-5 py-5 sm:px-6">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              {t('editorInventoryTitle')}
            </p>
            <MetricStrip className="mt-4 rounded-none border-0 bg-transparent">
              <MetricStripItem
                className="px-0 sm:px-0 xl:pl-0 xl:pr-6"
                detail={undefined}
                label={t('fieldUnitsInStock')}
                value={formatNumber(sku.unitsInStock, language)}
              />
              <MetricStripItem
                className="px-0 sm:px-0 xl:px-6"
                detail={undefined}
                label={t('fieldCostPerUnit')}
                value={formatCurrency(sku.costPerUnit, currency, language)}
              />
              <MetricStripItem
                className="px-0 sm:px-0 xl:px-6"
                detail={undefined}
                label={t('catalogSkuDirectSellStatus')}
                value={
                  sku.soldAsProduct ? t('inventorySoldAsProduct') : t('inventoryNotSoldAsProduct')
                }
              />
              <MetricStripItem
                className="px-0 sm:px-0 xl:pl-6 xl:pr-0"
                detail={undefined}
                label={t('fieldProductPrice')}
                value={
                  sku.soldAsProduct && sku.productPrice !== null
                    ? formatCurrency(sku.productPrice, currency, language)
                    : '—'
                }
              />
            </MetricStrip>
          </div>
        </div>
      </WorkspacePanel>

      <WorkspacePanel
        description={t('catalogLinkedServicesDescription')}
        title={t('catalogLinkedServicesTitle')}
      >
        {linkedServices.length > 0 ? (
          <div className="grid gap-3">
            {linkedServices.map((service) => {
              const linkedServiceSkus = serviceLinkedSkus(service, snapshot);
              const minUnits = linkedServiceSkus.reduce(
                (minimum, entry) => Math.min(minimum, entry.unitsInStock),
                linkedServiceSkus[0]?.unitsInStock ?? 0,
              );
              const isLimitingComponent = linkedServiceSkus.some(
                (entry) => entry.skuId === sku.skuId && entry.unitsInStock === minUnits,
              );

              return (
                <Link
                  className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl px-2 py-2 transition-colors hover:text-primary ${
                    isLimitingComponent ? 'text-primary' : 'text-foreground'
                  }`}
                  key={service.serviceId}
                  to={`/catalog/services/${service.serviceId}`}
                >
                  <p className="font-medium">{service.name}</p>
                  {isLimitingComponent ? (
                    <Badge variant="secondary">{t('catalogLinkedServicesLimiting')}</Badge>
                  ) : null}
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('catalogLinkedServicesEmpty')}</p>
        )}
      </WorkspacePanel>

      <WorkspacePanel
        description={t('catalogSkuRecentReportsDescription')}
        title={t('catalogSkuRecentReportsTitle')}
      >
        {detailLoading && !skuDetail ? (
          <p className="text-sm text-muted-foreground">{t('catalogSkuDetailLoaderLoading')}</p>
        ) : detailError ? (
          <p className="text-sm text-muted-foreground">{t('catalogSkuRecentReportsFallback')}</p>
        ) : skuDetail && skuDetail.reports.length > 0 ? (
          <RecentReportList
            currency={currency}
            language={language}
            reports={skuDetail.reports.slice(0, 5)}
            sku={sku}
            t={t}
          />
        ) : (
          <p className="text-sm text-muted-foreground">{t('catalogSkuRecentReportsEmpty')}</p>
        )}
      </WorkspacePanel>
    </WorkspacePage>
  );
}
