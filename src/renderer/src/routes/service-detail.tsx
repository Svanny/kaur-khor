import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { StockReport } from '@shared/inventory';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  WorkspaceEmpty,
  WorkspacePage,
  WorkspacePanel,
} from '@/components/system/workspace';
import {
  computeServiceSellableUnits,
  serviceAvailabilityStatus,
  serviceCoverageState,
  serviceCoverageStateKey,
  serviceLinkedSkus,
} from '@/lib/catalog';
import { formatCurrency, formatNumber, localeFor } from '@/lib/format';
import { stockReportSourceKey, summarizeNotes } from '@/lib/stock-report-summary';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';

const RECENT_ACTIVITY_LIMIT = 3;

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

  const highRiskSkuIds = new Set(snapshot?.sist.highRiskSkuIds ?? []);
  const hasHighRiskSku = linkedSkus.some((sku) => highRiskSkuIds.has(sku.skuId));
  const availability = service && snapshot ? serviceAvailabilityStatus(service, snapshot) : 'unlinked';
  const coverageState = service && snapshot ? serviceCoverageState(service, snapshot) : 'unlinked';
  const availabilityKey =
    availability === 'available'
      ? 'catalogServiceAvailabilityAvailable'
      : availability === 'stockout'
        ? 'catalogServiceAvailabilityStockout'
        : 'catalogServiceAvailabilityUnlinked';
  const coverageStateLabelKey =
    service && snapshot ? serviceCoverageStateKey(service, snapshot) : availabilityKey;
  const coverageDescriptionKey =
    coverageState === 'blocked'
      ? 'catalogServiceCoverageStateBlocked'
      : coverageState === 'at-risk'
        ? 'catalogServiceCoverageStateAtRisk'
        : 'catalogServiceCoverageStateAvailable';

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
            <Button asChild variant="outline">
              <Link to="/catalog">{t('backToCatalog')}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to={`/operations/session?step=services&focusService=${service.serviceId}`}>
                {t('catalogServiceOperationsAction')}
              </Link>
            </Button>
            <Button asChild>
              <Link to={`/catalog/services/${service.serviceId}/edit`}>
                {t('catalogServiceEditAction')}
              </Link>
            </Button>
          </div>
        }
        description={t('catalogServiceDetailIdentityDescription')}
        title={service.name}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            {t('fieldId')}: {service.serviceId}
          </Badge>
          <Badge variant={coverageState === 'available' ? 'secondary' : 'outline'}>
            {t(coverageStateLabelKey)}
          </Badge>
        </div>
      </WorkspacePanel>

      <WorkspacePanel
        description={t('catalogServiceDetailOverviewDescription')}
        title={t('catalogServiceDetailOverviewTitle')}
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
          <div className="rounded-3xl border border-border/70 bg-background/55 p-5">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              {t('fieldDescription')}
            </p>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{service.description}</p>
          </div>
          <div className="rounded-3xl border border-border/70 bg-background/55 p-5">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              {t('fieldId')}
            </p>
            <p className="mt-3 text-xl font-semibold tracking-[-0.03em]">{service.serviceId}</p>
          </div>
        </div>
      </WorkspacePanel>

      <WorkspacePanel
        description={t('catalogServiceCommercialSetupDescription')}
        title={t('catalogServiceCommercialSetupTitle')}
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-3xl border border-border/70 bg-background/55 p-5">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              {t('fieldPrice')}
            </p>
            <p className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
              {formatCurrency(service.price, currency, language)}
            </p>
          </div>
          <div className="rounded-3xl border border-border/70 bg-background/55 p-5">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              {t('fieldLinkedSkus')}
            </p>
            <p className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
              {formatNumber(linkedSkus.length, language)}
            </p>
          </div>
          <div className="rounded-3xl border border-border/70 bg-background/55 p-5">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              {t('catalogServiceAvailabilityTitle')}
            </p>
            <p className="mt-3 text-3xl font-semibold tracking-[-0.04em]">{t(availabilityKey)}</p>
          </div>
        </div>
      </WorkspacePanel>

      <WorkspacePanel
        description={t('catalogServiceFulfillmentDescription')}
        title={t('catalogServiceFulfillmentTitle')}
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-3xl border border-border/70 bg-background/55 p-5">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              {t('catalogServiceSellableUnits')}
            </p>
            <p className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
              {formatNumber(sellableUnits, language)}
            </p>
          </div>
          <div className="rounded-3xl border border-border/70 bg-background/55 p-5">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              {t('catalogServiceCoverageStateTitle')}
            </p>
            <p className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
              {t(coverageStateLabelKey)}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">{t(coverageDescriptionKey)}</p>
          </div>
          <div className="rounded-3xl border border-border/70 bg-background/55 p-5">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              {t('catalogStockoutRisk')}
            </p>
            <p className="mt-3 text-xl font-semibold tracking-[-0.03em]">
              {hasHighRiskSku ? t('catalogServiceAtRiskState') : t(availabilityKey)}
            </p>
          </div>
        </div>
      </WorkspacePanel>

      <WorkspacePanel
        description={t('catalogServiceLinkedSkusDescription')}
        title={t('catalogServiceLinkedSkusTitle')}
      >
        {linkedSkus.length > 0 ? (
          <div className="grid gap-3">
            {linkedSkus.map((sku) => {
              const isHighRisk = highRiskSkuIds.has(sku.skuId);
              const isBlocked = sku.unitsInStock <= 0;

              return (
                <Link
                  className="rounded-3xl border border-border/70 bg-card/55 px-4 py-4 transition-colors hover:border-primary/40 hover:text-primary"
                  key={sku.skuId}
                  to={`/catalog/skus/${sku.skuId}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{sku.name}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{sku.skuId}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{formatNumber(sku.unitsInStock, language)}</Badge>
                      {isBlocked ? (
                        <Badge variant="outline">{t('catalogServiceLinkedSkuBlockedBadge')}</Badge>
                      ) : null}
                      {isHighRisk ? (
                        <Badge variant="outline">{t('catalogServiceLinkedSkuRiskBadge')}</Badge>
                      ) : null}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('catalogServiceLinkedSkusEmpty')}</p>
        )}
      </WorkspacePanel>

      <WorkspacePanel
        description={t('catalogServiceRecentActivityDescription')}
        title={t('catalogServiceRecentActivityTitle')}
      >
        {activityLoading ? (
          <p className="text-sm text-muted-foreground">{t('overviewRecentActivityLoading')}</p>
        ) : activityError ? (
          <p className="text-sm text-muted-foreground">{t('catalogServiceRecentActivityFallback')}</p>
        ) : activityReports.length > 0 ? (
          <div className="grid gap-3">
            {activityReports.map((report) => {
              const notes = summarizeNotes(report.notes);
              const changeSummary = [
                report.serviceSignals.some((signal) => signal.serviceId === service.serviceId)
                  ? t('stockServiceSignalsTitle')
                  : null,
                report.servicePriceAdjustments.some(
                  (adjustment) => adjustment.serviceId === service.serviceId,
                )
                  ? t('stockServicePriceAdjustmentsTitle')
                  : null,
                report.topServiceRanking.includes(service.serviceId)
                  ? t('stockRankingTitle')
                  : null,
              ]
                .filter(Boolean)
                .join(' · ');

              return (
                <div
                  className="rounded-3xl border border-border/70 bg-card/55 px-4 py-4"
                  key={report.reportId}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{reportDateLabel(report.reportedAt, language)}</Badge>
                    <Badge variant="secondary">{t(stockReportSourceKey(report.reportSource))}</Badge>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-foreground">{changeSummary}</p>
                  {notes ? (
                    <p className="mt-2 text-sm text-muted-foreground">{notes}</p>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {t('stockHistoryNoNotes')}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('catalogServiceRecentActivityEmpty')}</p>
        )}
      </WorkspacePanel>
    </WorkspacePage>
  );
}
