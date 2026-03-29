import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { StockReport } from '@shared/inventory';
import { ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  WorkspaceEmpty,
  WorkspacePage,
  WorkspacePanel,
} from '@/components/system/workspace';
import { DescriptionText } from '@/components/system/description-text';
import { RecentActivityList } from '@/components/system/recent-activity-list';
import {
  computeServiceSellableUnits,
  serviceCoverageState,
  serviceCoverageStateKey,
  serviceLinkedSkus,
} from '@/lib/catalog';
import { formatCurrency, formatNumber, localeFor } from '@/lib/format';
import { stockReportSourceKey, summarizeNotes } from '@/lib/stock-report-summary';
import type { TranslationKey } from '@/lib/translations';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';

const RECENT_ACTIVITY_LIMIT = 3;

function ServiceSummaryField({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="border-b border-border/60 py-4 last:border-b-0 last:pb-0 first:pt-0 xl:border-b-0 xl:pb-0">
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

function serviceReportsFor(serviceId: string, reports: StockReport[]) {
  return reports.filter(
    (report) =>
      report.serviceSignals.some((signal) => signal.serviceId === serviceId) ||
      report.servicePriceAdjustments.some((adjustment) => adjustment.serviceId === serviceId) ||
      report.topServiceRanking.includes(serviceId),
  );
}

function serviceActivitySummary({
  report,
  serviceId,
  linkedSkuIds,
  currency,
  language,
  t,
}: {
  report: StockReport;
  serviceId: string;
  linkedSkuIds: Set<string>;
  currency: 'USD' | 'KHR';
  language: 'en' | 'km';
  t: (key: TranslationKey) => string;
}) {
  const events: string[] = [];
  const priceAdjustment = report.servicePriceAdjustments.find(
    (adjustment) => adjustment.serviceId === serviceId,
  );
  const linkedSkuObservation = report.skuObservations.find((observation) =>
    linkedSkuIds.has(observation.skuId),
  );

  if (report.serviceSignals.some((signal) => signal.serviceId === serviceId && signal.stockout)) {
    events.push(t('catalogServiceRecentActivityFlaggedUnavailable'));
  }

  if (priceAdjustment) {
    events.push(
      `${t('catalogServiceRecentActivityPriceOverride')} (${formatCurrency(
        priceAdjustment.price,
        currency,
        language,
      )})`,
    );
  }

  if (linkedSkuObservation) {
    events.push(
      `${t('catalogServiceRecentActivityLinkedSkuChange')} (${linkedSkuObservation.skuId})`,
    );
  }

  if (report.topServiceRanking.includes(serviceId)) {
    events.push(t('catalogServiceRecentActivityRanking'));
  }

  return events.join(' · ');
}

export function ServiceDetailRoute() {
  const { serviceId } = useParams();
  const { listStockReports, snapshot } = useInventory();
  const { currency, language, t } = usePreferences();
  const [activityReports, setActivityReports] = useState<StockReport[]>([]);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [activityLoading, setActivityLoading] = useState(true);

  const service = snapshot?.services.find((entry) => entry.serviceId === serviceId) ?? null;

  const linkedSkus = useMemo(
    () => (snapshot && service ? serviceLinkedSkus(service, snapshot) : []),
    [service, snapshot],
  );

  const sellableUnits = useMemo(
    () => (snapshot && service ? computeServiceSellableUnits(service, snapshot) : 0),
    [service, snapshot],
  );
  const linkedSkuIds = useMemo(() => new Set(linkedSkus.map((sku) => sku.skuId)), [linkedSkus]);

  const highRiskSkuIds = new Set(snapshot?.sist.highRiskSkuIds ?? []);
  const coverageState = service && snapshot ? serviceCoverageState(service, snapshot) : 'unlinked';
  const coverageStateLabelKey =
    service && snapshot
      ? serviceCoverageStateKey(service, snapshot)
      : 'catalogServiceAvailabilityUnlinked';
  const blockedSku = linkedSkus.find((sku) => sku.unitsInStock <= 0) ?? null;
  const highRiskSku = linkedSkus.find((sku) => highRiskSkuIds.has(sku.skuId)) ?? null;
  const limitingSku = blockedSku ?? highRiskSku;
  const setupIncomplete = linkedSkus.length === 0;
  const prioritizeOperations = coverageState === 'blocked' || coverageState === 'at-risk';
  const operationsActionVariant = prioritizeOperations ? 'default' : 'outline';
  const editActionVariant = setupIncomplete ? 'default' : 'outline';
  const statusExplanation =
    coverageState === 'unlinked'
      ? t('catalogServiceConstraintUnlinked')
      : coverageState === 'blocked'
        ? t('catalogServiceCoverageStateBlocked')
        : coverageState === 'at-risk'
          ? t('catalogServiceCoverageStateAtRisk')
          : t('catalogServiceCoverageStateAvailable');
  const fulfillmentReason =
    blockedSku
      ? `${t('catalogServiceConstraintBlockedPrefix')} ${blockedSku.skuId}.`
      : highRiskSku
        ? `${t('catalogServiceConstraintRiskPrefix')} ${highRiskSku.skuId}.`
        : coverageState === 'unlinked'
          ? t('catalogServiceConstraintUnlinked')
          : t('catalogServiceConstraintHealthy');

  useEffect(() => {
    let cancelled = false;

    if (!serviceId || !service) {
      return;
    }

    setActivityLoading(true);
    setActivityError(null);

    listStockReports()
      .then((reports) => {
        if (!cancelled) {
          setActivityReports(serviceReportsFor(serviceId, reports).slice(0, RECENT_ACTIVITY_LIMIT));
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setActivityError(error instanceof Error ? error.message : t('apiUnavailable'));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setActivityLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [listStockReports, service, serviceId, t]);

  if (!snapshot) {
    return (
      <WorkspacePage>
        <WorkspaceEmpty description={t('apiUnavailable')} title={t('catalogServiceDetailTitle')} />
      </WorkspacePage>
    );
  }

  if (!service) {
    return (
      <WorkspacePage>
        <WorkspaceEmpty
          action={
            <Button asChild>
              <Link to="/catalog">{t('backToCatalog')}</Link>
            </Button>
          }
          description={t('catalogServiceDetailNotFoundDescription')}
          title={t('catalogServiceDetailNotFoundTitle')}
        />
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage data-testid="service-detail-route">
      <WorkspacePanel
        action={
          <div className="flex flex-wrap gap-3">
            <Button asChild variant={operationsActionVariant}>
              <Link to={`/operations/session?step=services&focusService=${service.serviceId}`}>
                {t('catalogServiceOperationsAction')}
              </Link>
            </Button>
            <Button asChild variant={editActionVariant}>
              <Link to={`/catalog/services/${service.serviceId}/edit`}>
                {t('catalogServiceEditAction')}
              </Link>
            </Button>
          </div>
        }
        description={t('catalogServiceDetailIdentityDescription')}
        title={
          <div className="flex items-center gap-3">
            <Button asChild aria-label={t('backToCatalog')} size="icon" variant="ghost">
              <Link to="/catalog">
                <ArrowLeft />
              </Link>
            </Button>
            <span>{service.name}</span>
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            {t('fieldId')}: {service.serviceId}
          </Badge>
          <Badge variant={coverageState === 'available' ? 'secondary' : 'outline'}>
            {t(coverageStateLabelKey)}
          </Badge>
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(220px,0.65fr)]">
          <div className="rounded-3xl border border-border/70 bg-background/40 px-5 py-5 sm:px-6">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              {t('catalogServiceFulfillmentStatusTitle')}
            </p>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{fulfillmentReason}</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{statusExplanation}</p>
          </div>
        </div>

        <div className="rounded-3xl border border-border/70 bg-background/30 px-5 py-5 sm:px-6">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            {t('catalogServiceViabilityTitle')}
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5 xl:gap-x-6">
            <ServiceSummaryField
              label={t('fieldPrice')}
              value={formatCurrency(service.price, currency, language)}
            />
            <ServiceSummaryField
              label={t('fieldLinkedSkus')}
              value={formatNumber(linkedSkus.length, language)}
            />
            <ServiceSummaryField
              label={t('catalogServiceSellableUnits')}
              value={formatNumber(sellableUnits, language)}
            />
            <ServiceSummaryField
              detail={statusExplanation}
              label={t('catalogServiceCurrentStatusTitle')}
              value={t(coverageStateLabelKey)}
            />
            <ServiceSummaryField
              label={t('catalogServiceLimitingSkuTitle')}
              value={limitingSku?.skuId ?? t('catalogServiceLimitingSkuHealthy')}
            />
          </div>
        </div>

        <div className="rounded-3xl border border-border/70 bg-background/30 px-5 py-5 sm:px-6">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            {t('catalogServiceRecentActivityTitle')}
          </p>
          <DescriptionText className="mt-2 text-sm leading-6 text-muted-foreground">
            {t('catalogServiceRecentActivityDescription')}
          </DescriptionText>
          {activityLoading ? (
            <p className="mt-4 text-sm text-muted-foreground">{t('overviewRecentActivityLoading')}</p>
          ) : activityError ? (
            <p className="mt-4 text-sm text-muted-foreground">
              {t('catalogServiceRecentActivityFallback')}
            </p>
          ) : activityReports.length > 0 ? (
            <RecentActivityList
              className="mt-4"
              items={activityReports}
              renderDateLabel={(report) => reportDateLabel(report.reportedAt, language)}
              renderSourceLabel={(report) => t(stockReportSourceKey(report.reportSource))}
              renderSummary={(report) =>
                serviceActivitySummary({
                  report,
                  serviceId: service.serviceId,
                  linkedSkuIds,
                  currency,
                  language,
                  t,
                })
              }
              renderNotes={(report) => summarizeNotes(report.notes) ?? t('stockHistoryNoNotes')}
            />
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              {t('catalogServiceRecentActivityEmpty')}
            </p>
          )}
        </div>

        <div className="rounded-3xl border border-border/70 bg-background/30 px-5 py-5 sm:px-6">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            {t('catalogServiceLinkedSkusTitle')}
          </p>
          <DescriptionText className="mt-2 text-sm leading-6 text-muted-foreground">
            {t('catalogServiceLinkedSkusDescription')}
          </DescriptionText>
          {linkedSkus.length > 0 ? (
            <div className="mt-4 grid gap-3">
              {linkedSkus.map((sku) => {
                const isHighRisk = highRiskSkuIds.has(sku.skuId);
                const isBlocked = sku.unitsInStock <= 0;
                const isBottleneck =
                  (blockedSku && blockedSku.skuId === sku.skuId) ||
                  (!blockedSku && highRiskSku && highRiskSku.skuId === sku.skuId);
                const statusLabel = isBlocked
                  ? t('catalogServiceLinkedSkuBlockedBadge')
                  : isHighRisk
                    ? t('catalogServiceLinkedSkuRiskBadge')
                    : t('catalogServiceLinkedSkuHealthyBadge');

                return (
                  <Link
                    className={`rounded-3xl border px-4 py-4 transition-colors hover:border-primary/40 hover:text-primary ${
                      isBottleneck
                        ? 'border-primary/50 bg-primary/5'
                        : 'border-border/70 bg-card/55'
                    }`}
                    key={sku.skuId}
                    to={`/catalog/skus/${sku.skuId}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-foreground">{sku.name}</p>
                          {isBottleneck ? (
                            <Badge variant="secondary">
                              {t('catalogServiceLinkedSkuBottleneckBadge')}
                            </Badge>
                          ) : null}
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{sku.skuId}</p>
                        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
                          <p>
                            <span className="font-medium text-foreground">
                              {t('fieldUnitsInStock')}:
                            </span>{' '}
                            {formatNumber(sku.unitsInStock, language)}
                          </p>
                          <p>
                            <span className="font-medium text-foreground">
                              {t('catalogServiceLinkedSkuStatusLabel')}:
                            </span>{' '}
                            {statusLabel}
                          </p>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">{t('catalogServiceLinkedSkusEmpty')}</p>
          )}
        </div>
      </WorkspacePanel>
    </WorkspacePage>
  );
}
