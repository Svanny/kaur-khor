import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { StockReport } from '@shared/inventory';
import { ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { WorkspaceEmpty, WorkspacePage, WorkspacePanel } from '@/components/system/workspace';
import { formatCurrency, formatNumber, localeFor } from '@/lib/format';
import { stockReportSourceKey, summarizeNotes } from '@/lib/stock-report-summary';
import { computeServiceSellableUnits } from '@/lib/catalog';
import {
  confidenceBadgeLabel,
  contributorHealthLabel,
  currentServiceBottleneck,
  deriveEconomicSummary,
  deriveFragilitySummary,
  mapServiceTimelineEvents,
  rankedServiceContributors,
  serviceHeartbeatSummary,
  serviceStateLabel,
} from '@/lib/service-control-panel';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';
import { cn } from '@/lib/utils';

function reportDateLabel(reportedAt: string, language: 'en' | 'km') {
  return new Intl.DateTimeFormat(localeFor(language), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(reportedAt));
}

function badgeVariantForState(state: ReturnType<typeof serviceStateLabel>) {
  if (state === 'Blocked') {
    return 'destructive' as const;
  }
  if (state === 'At risk') {
    return 'secondary' as const;
  }
  return 'outline' as const;
}

function badgeVariantForHealth(label: ReturnType<typeof contributorHealthLabel>) {
  if (label === 'Blocked') {
    return 'destructive' as const;
  }
  if (label === 'High risk') {
    return 'secondary' as const;
  }
  return 'outline' as const;
}

function tileToneClass(isEmphasis: boolean) {
  return isEmphasis
    ? 'bg-primary/8 border-primary/30'
    : 'bg-background/40 border-border/60';
}

function eventTypeLabel(type: ReturnType<typeof mapServiceTimelineEvents>[number]['types'][number]) {
  if (type === 'service-unavailable') {
    return 'Service unavailable';
  }
  if (type === 'price-adjustment') {
    return 'Price adjustment';
  }
  if (type === 'linked-sku-change') {
    return 'Coverage change';
  }
  if (type === 'ranking-update') {
    return 'Ranking update';
  }
  return 'Limiter shift';
}

export function ServiceDetailRoute() {
  const { serviceId } = useParams();
  const { listStockReports, snapshot } = useInventory();
  const { currency, language, t } = usePreferences();
  const [activityReports, setActivityReports] = useState<StockReport[]>([]);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [activityLoading, setActivityLoading] = useState(true);

  const service = snapshot?.services.find((entry) => entry.serviceId === serviceId) ?? null;

  const contributors = useMemo(
    () => (snapshot && service ? rankedServiceContributors(service, snapshot) : []),
    [service, snapshot],
  );
  const bottleneck = useMemo(
    () => (snapshot && service ? currentServiceBottleneck(service, snapshot) : null),
    [service, snapshot],
  );
  const heartbeat = useMemo(
    () =>
      snapshot && service
        ? serviceHeartbeatSummary({
            service,
            snapshot,
            reports: activityReports,
            language,
          })
        : null,
    [activityReports, language, service, snapshot],
  );
  const sellableUnits = useMemo(
    () => (snapshot && service ? computeServiceSellableUnits(service, snapshot) : 0),
    [service, snapshot],
  );
  const fragility = useMemo(
    () => (snapshot && service ? deriveFragilitySummary(service, snapshot) : null),
    [service, snapshot],
  );
  const economics = useMemo(
    () => (snapshot && service ? deriveEconomicSummary(service, snapshot) : null),
    [service, snapshot],
  );
  const timelineEvents = useMemo(
    () =>
      snapshot && service
        ? mapServiceTimelineEvents({
            service,
            snapshot,
            reports: activityReports,
            currency,
            language,
          })
        : [],
    [activityReports, currency, language, service, snapshot],
  );

  const prioritizeOperations = heartbeat?.state === 'blocked' || heartbeat?.state === 'at-risk';
  const setupIncomplete = contributors.length === 0;

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
          setActivityReports(reports);
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

  if (!service || !heartbeat || !fragility || !economics) {
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

  const heartbeatLabel = serviceStateLabel(heartbeat.state);
  const failureModes: string[] = [];
  if (contributors[0]) {
    failureModes.push(`If ${contributors[0].sku.name} drops below 1, service becomes unavailable.`);
  }
  if (bottleneck) {
    failureModes.push(`If the current bottleneck worsens, sellable units collapse through ${bottleneck.skuId} first.`);
  }
  if (economics.grossMargin <= 0) {
    failureModes.push('Current input cost is already consuming the service price.');
  }

  return (
    <WorkspacePage data-testid="service-detail-route">
      <WorkspacePanel
        action={
          <div className="flex flex-wrap gap-3">
            <Button asChild size="icon" variant="ghost">
              <Link aria-label={t('backToCatalog')} to="/catalog">
                <ArrowLeft />
              </Link>
            </Button>
            <Button asChild variant={prioritizeOperations ? 'default' : 'outline'}>
              <Link to={`/operations/session?step=services&focusService=${service.serviceId}`}>
                {t('catalogServiceOperationsAction')}
              </Link>
            </Button>
            <Button asChild variant={setupIncomplete ? 'default' : 'outline'}>
              <Link to={`/catalog/services/${service.serviceId}/edit`}>
                {t('catalogServiceEditAction')}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to={`/catalog/services/${service.serviceId}/edit`}>
                {t('catalogServiceAdjustPriceAction')}
              </Link>
            </Button>
          </div>
        }
        description={t('catalogServiceDetailIdentityDescription')}
        title={service.name}
      >
        <div className="rounded-[2rem] border border-border/70 bg-[radial-gradient(circle_at_top_left,rgba(189,124,81,0.16),transparent_55%),linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">
                  {t('fieldId')}: {service.serviceId}
                </Badge>
                <Badge variant={badgeVariantForState(heartbeatLabel)}>{heartbeatLabel}</Badge>
                {heartbeat.evidenceHint ? <Badge variant="secondary">{heartbeat.evidenceHint}</Badge> : null}
              </div>
              <p className="mt-4 text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                {t('catalogServiceHeartbeatTitle')}
              </p>
              <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-foreground">
                {heartbeatLabel}
              </p>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{heartbeat.summary}</p>
            </div>
            <div className="min-w-[220px] rounded-[1.5rem] border border-border/60 bg-background/55 px-5 py-4">
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                {t('catalogServiceCurrentBottleneckTitle')}
              </p>
              <p className="mt-2 text-lg font-semibold text-foreground">
                {bottleneck ? bottleneck.name : t('catalogServiceNoActiveLimiter')}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {bottleneck ? bottleneck.skuId : t('catalogServiceHeartbeatHealthyHint')}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-[1.75rem] border border-border/70 bg-background/35 p-2">
          <p className="px-4 pt-2 text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            {t('catalogServiceOperationalConditionTitle')}
          </p>
          <div className="mt-2 grid gap-2 xl:grid-cols-5">
            <div className={cn('rounded-[1.25rem] border px-4 py-4', tileToneClass(false))}>
              <p className="text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
                {t('catalogServiceSellableUnits')}
              </p>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {formatNumber(sellableUnits, language)}
              </p>
            </div>
            <div className={cn('rounded-[1.25rem] border px-4 py-4', tileToneClass(false))}>
              <p className="text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
                {t('fieldPrice')}
              </p>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {formatCurrency(service.price, currency, language)}
              </p>
            </div>
            <div className={cn('rounded-[1.25rem] border px-4 py-4', tileToneClass(false))}>
              <p className="text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
                {t('catalogServiceCoverageModeTitle')}
              </p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{heartbeatLabel}</p>
            </div>
            <div className={cn('rounded-[1.25rem] border px-4 py-4', tileToneClass(false))}>
              <p className="text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
                {t('fieldLinkedSkus')}
              </p>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {formatNumber(contributors.length, language)}
              </p>
            </div>
            <div className={cn('rounded-[1.25rem] border px-4 py-4', tileToneClass(Boolean(bottleneck)))}>
              <p className="text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
                {t('catalogServiceCurrentBottleneckTitle')}
              </p>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {bottleneck ? bottleneck.name : t('catalogServiceNoActiveLimiter')}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {bottleneck ? bottleneck.skuId : t('catalogServiceDecisionRibbonHealthy')}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.85fr)]">
          <WorkspacePanel title={t('catalogServiceDependencyMapTitle')}>
            {contributors.length > 0 ? (
              <div className="flex flex-col items-center gap-4">
                <div className="min-w-[220px] rounded-[1.5rem] border border-primary/25 bg-primary/5 px-5 py-4 text-center">
                  <p className="text-[0.72rem] uppercase tracking-[0.18em] text-muted-foreground">
                    {service.serviceId}
                  </p>
                  <p className="mt-2 text-lg font-semibold text-foreground">{service.name}</p>
                </div>
                <div className="grid w-full gap-3">
                  {contributors.map((contributor) => {
                    const healthLabel = contributorHealthLabel(contributor.health);
                    return (
                      <div className="grid gap-2 xl:grid-cols-[100px_minmax(0,1fr)]" key={contributor.sku.skuId}>
                        <div className="hidden items-center justify-center xl:flex">
                          <div
                            className={cn(
                              'h-px w-full',
                              contributor.isBottleneck
                                ? 'bg-primary'
                                : contributor.health === 'blocked'
                                  ? 'bg-destructive/80'
                                  : contributor.health === 'at-risk'
                                    ? 'bg-amber-500/70'
                                    : 'bg-border',
                            )}
                          />
                        </div>
                        <div
                          className={cn(
                            'rounded-[1.5rem] border px-5 py-4',
                            contributor.isBottleneck
                              ? 'border-primary/35 bg-primary/5'
                              : 'border-border/60 bg-background/40',
                          )}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-foreground">{contributor.sku.name}</p>
                            <Badge variant={badgeVariantForHealth(healthLabel)}>{healthLabel}</Badge>
                            {contributor.isBottleneck ? (
                              <Badge variant="secondary">{t('catalogServiceContributorBottleneckBadge')}</Badge>
                            ) : null}
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {contributor.sku.skuId} · {formatNumber(contributor.sku.unitsInStock, language)} on hand
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t('catalogServiceDependencyMapEmpty')}</p>
            )}
          </WorkspacePanel>

          <div className="grid gap-6">
            <WorkspacePanel title={t('catalogServiceFragilityTitle')}>
              <div className="grid gap-3">
                <div className="rounded-[1.25rem] border border-border/60 bg-background/35 px-4 py-4">
                  <p className="text-[0.72rem] uppercase tracking-[0.18em] text-muted-foreground">
                    {t('catalogServiceFragilityCurrentState')}
                  </p>
                  <p className="mt-2 text-lg font-semibold text-foreground">{heartbeatLabel}</p>
                </div>
                <div className="rounded-[1.25rem] border border-border/60 bg-background/35 px-4 py-4">
                  <p className="text-[0.72rem] uppercase tracking-[0.18em] text-muted-foreground">
                    {t('catalogServiceFragilityNextLimiter')}
                  </p>
                  <p className="mt-2 text-lg font-semibold text-foreground">
                    {fragility.nextLikelyLimiter?.sku.name ?? t('catalogServiceFragilityUnavailable')}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {fragility.nextLikelyLimiter?.sku.skuId ?? t('catalogServiceFragilityUnavailable')}
                  </p>
                </div>
                <div className="rounded-[1.25rem] border border-border/60 bg-background/35 px-4 py-4">
                  <p className="text-[0.72rem] uppercase tracking-[0.18em] text-muted-foreground">
                    {t('catalogServiceFragilityDisruptionWindow')}
                  </p>
                  <p className="mt-2 text-lg font-semibold text-foreground">
                    {fragility.disruptionWindowDays == null
                      ? t('catalogServiceFragilityUnavailable')
                      : `${formatNumber(fragility.disruptionWindowDays, language)} days`}
                  </p>
                </div>
                <div className="rounded-[1.25rem] border border-border/60 bg-background/35 px-4 py-4">
                  <p className="text-[0.72rem] uppercase tracking-[0.18em] text-muted-foreground">
                    {t('catalogServiceFragilityConfidence')}
                  </p>
                  <p className="mt-2 text-lg font-semibold text-foreground">
                    {confidenceBadgeLabel(fragility.confidence)}
                  </p>
                </div>
              </div>
            </WorkspacePanel>

            <WorkspacePanel title={t('catalogServiceFailureModesTitle')}>
              {failureModes.length > 0 ? (
                <div className="grid gap-3">
                  {failureModes.map((mode) => (
                    <div
                      className="rounded-[1.25rem] border border-border/60 bg-background/35 px-4 py-3 text-sm leading-6 text-foreground"
                      key={mode}
                    >
                      {mode}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t('catalogServiceFailureModesEmpty')}</p>
              )}
            </WorkspacePanel>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
          <WorkspacePanel title={t('catalogServiceContributorsTitle')}>
            {contributors.length > 0 ? (
              <div className="grid gap-3">
                {contributors.map((contributor) => {
                  const healthLabel = contributorHealthLabel(contributor.health);
                  return (
                    <Link
                      className={cn(
                        'rounded-[1.5rem] border px-4 py-4 transition-colors hover:border-primary/40 hover:text-primary',
                        contributor.isBottleneck
                          ? 'border-primary/35 bg-primary/5'
                          : 'border-border/70 bg-background/40',
                      )}
                      key={contributor.sku.skuId}
                      to={`/catalog/skus/${contributor.sku.skuId}`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-foreground">{contributor.sku.name}</p>
                            <Badge variant="outline">#{contributor.rank}</Badge>
                            <Badge variant={badgeVariantForHealth(healthLabel)}>{healthLabel}</Badge>
                            {contributor.isBottleneck ? (
                              <Badge variant="secondary">{t('catalogServiceContributorBottleneckBadge')}</Badge>
                            ) : null}
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">{contributor.sku.skuId}</p>
                          <p className="mt-3 text-sm text-muted-foreground">
                            {t('fieldUnitsInStock')}: {formatNumber(contributor.sku.unitsInStock, language)}
                          </p>
                        </div>
                        <div className="text-right text-sm text-muted-foreground">
                          <p>{contributor.probabilityLabel}</p>
                          <p className="mt-1">{t('catalogServiceOpenSkuDetailAction')}</p>
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

          <WorkspacePanel title={t('catalogServiceEconomicsTitle')}>
            <div className="grid gap-3">
              <div className="rounded-[1.25rem] border border-border/60 bg-background/35 px-4 py-4">
                <p className="text-[0.72rem] uppercase tracking-[0.18em] text-muted-foreground">
                  {t('fieldPrice')}
                </p>
                <p className="mt-2 text-lg font-semibold text-foreground">
                  {formatCurrency(economics.servicePrice, currency, language)}
                </p>
              </div>
              <div className="rounded-[1.25rem] border border-border/60 bg-background/35 px-4 py-4">
                <p className="text-[0.72rem] uppercase tracking-[0.18em] text-muted-foreground">
                  {t('catalogServiceEstimatedInputCost')}
                </p>
                <p className="mt-2 text-lg font-semibold text-foreground">
                  {formatCurrency(economics.estimatedInputCost, currency, language)}
                </p>
              </div>
              <div className="rounded-[1.25rem] border border-border/60 bg-background/35 px-4 py-4">
                <p className="text-[0.72rem] uppercase tracking-[0.18em] text-muted-foreground">
                  {t('catalogServiceGrossMargin')}
                </p>
                <p className="mt-2 text-lg font-semibold text-foreground">
                  {formatCurrency(economics.grossMargin, currency, language)}
                </p>
              </div>
            </div>
          </WorkspacePanel>
        </div>

        <WorkspacePanel title={t('catalogServiceEvidenceTimelineTitle')}>
          {activityLoading ? (
            <p className="text-sm text-muted-foreground">{t('overviewRecentActivityLoading')}</p>
          ) : activityError ? (
            <p className="text-sm text-muted-foreground">{t('catalogServiceRecentActivityFallback')}</p>
          ) : timelineEvents.length > 0 ? (
            <div className="divide-y divide-border/60">
              {timelineEvents.map((event) => (
                <div className="py-4 first:pt-0 last:pb-0" key={event.report.reportId}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{reportDateLabel(event.report.reportedAt, language)}</Badge>
                    <Badge variant="secondary">{t(stockReportSourceKey(event.report.reportSource))}</Badge>
                    {event.types.map((type) => (
                      <Badge key={`${event.report.reportId}-${type}`} variant="outline">
                        {eventTypeLabel(type)}
                      </Badge>
                    ))}
                  </div>
                  <p className="mt-3 text-sm leading-6 text-foreground">{event.summary}</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {event.secondary ?? summarizeNotes(event.report.notes) ?? t('stockHistoryNoNotes')}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('catalogServiceRecentActivityEmpty')}</p>
          )}
        </WorkspacePanel>
      </WorkspacePanel>
    </WorkspacePage>
  );
}
