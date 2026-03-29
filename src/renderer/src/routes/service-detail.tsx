import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { StockReport } from '@shared/inventory';
import { ArrowLeft, ClipboardPen, Search, SquarePen } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DescriptionText } from '@/components/system/description-text';
import { MetricStrip, MetricStripItem, WorkspaceEmpty, WorkspacePage } from '@/components/system/workspace';
import { computeServiceSellableUnits } from '@/lib/catalog';
import { formatCurrency, formatNumber, localeFor } from '@/lib/format';
import {
  confidenceBadgeLabel,
  contributorHealthLabel,
  currentServiceBottleneck,
  deriveEconomicSummary,
  deriveFragilitySummary,
  latestEvidenceHint,
  mapServiceTimelineEvents,
  rankedServiceContributors,
  serviceStateLabel,
} from '@/lib/service-control-panel';
import { stockReportSourceKey } from '@/lib/stock-report-summary';
import { cn } from '@/lib/utils';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';

type CockpitTab = 'overview' | 'forecast' | 'dependencies' | 'history' | 'parameters';

type ForecastPoint = {
  day: number;
  remaining: number;
};

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

function serviceRiskToneClass(state: ReturnType<typeof serviceStateLabel>) {
  if (state === 'Blocked') {
    return 'border-destructive/30 bg-destructive/[0.04]';
  }
  if (state === 'At risk') {
    return 'border-amber-500/30 bg-amber-500/[0.05]';
  }
  return 'border-border/70 bg-background/65';
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

function serviceHeroMessage({
  sellableUnits,
  disruptionWindowDays,
  bottleneckSkuId,
  linkedSkuCount,
  latestEvidence,
  state,
  language,
}: {
  sellableUnits: number;
  disruptionWindowDays: number | null;
  bottleneckSkuId: string | null;
  linkedSkuCount: number;
  latestEvidence: string | null;
  state: ReturnType<typeof serviceStateLabel>;
  language: 'en' | 'km';
}) {
  if (linkedSkuCount === 0) {
    return 'Link SKUs to model service coverage';
  }
  if (state !== 'Blocked' && disruptionWindowDays != null) {
    return `Likely service disruption in ${formatNumber(disruptionWindowDays, language)} days`;
  }
  if (bottleneckSkuId) {
    return `${formatNumber(sellableUnits, language)} sellable units before ${bottleneckSkuId} blocks fulfillment`;
  }
  if (latestEvidence) {
    return latestEvidence;
  }
  return `${formatNumber(sellableUnits, language)} sellable units holding steady`;
}

function recommendationForService({
  state,
  bottleneckName,
  nextLimiterName,
  disruptionWindowDays,
  linkedSkuCount,
}: {
  state: ReturnType<typeof serviceStateLabel>;
  bottleneckName: string | null;
  nextLimiterName: string | null;
  disruptionWindowDays: number | null;
  linkedSkuCount: number;
}) {
  if (linkedSkuCount === 0) {
    return {
      headline: 'Finish the recipe',
      suggestion: 'Attach the required SKUs before relying on service coverage or operations handoff.',
      reasons: ['Banji cannot derive sellable capacity until the service recipe is linked.'],
    };
  }
  if (state === 'Blocked') {
    return {
      headline: 'Unblock the bottleneck',
      suggestion: `${bottleneckName ?? 'The current limiter'} is already stopping fulfillment. Review stock in session before adjusting anything else.`,
      reasons: [
        'Sellable units have already collapsed to zero.',
        `${bottleneckName ?? 'The bottleneck'} is the first dependency that needs intervention.`,
      ],
    };
  }
  if (state === 'At risk') {
    return {
      headline: 'Stabilize the next limiter',
      suggestion:
        disruptionWindowDays == null
          ? `${bottleneckName ?? nextLimiterName ?? 'A linked SKU'} is under pressure. Review the service in session and confirm replenishment timing.`
          : `${bottleneckName ?? nextLimiterName ?? 'A linked SKU'} is likely to disrupt this service in about ${disruptionWindowDays} days.`,
      reasons: [
        `${bottleneckName ?? 'The bottleneck'} carries the highest current constraint signal.`,
        `${nextLimiterName ?? bottleneckName ?? 'The next linked SKU'} is next in line if pressure continues.`,
      ],
    };
  }
  return {
    headline: 'Keep monitoring the service',
    suggestion: `${nextLimiterName ?? 'The current recipe'} is the next likely limiter, but the service is still sellable from current stock.`,
    reasons: [
      'No dependency is blocking fulfillment yet.',
      `${nextLimiterName ?? 'The top-ranked dependency'} is the next component most likely to tighten coverage.`,
    ],
  };
}

function deriveForecastPoints({
  sellableUnits,
  disruptionWindowDays,
}: {
  sellableUnits: number;
  disruptionWindowDays: number | null;
}) {
  const horizon = Math.max(6, Math.ceil(disruptionWindowDays ?? 8));
  const points: ForecastPoint[] = [];

  for (let day = 0; day <= horizon; day += 1) {
    const decay = disruptionWindowDays == null || disruptionWindowDays <= 0
      ? day * Math.max(1, sellableUnits / horizon)
      : (sellableUnits / disruptionWindowDays) * day;
    points.push({
      day,
      remaining: Math.max(0, sellableUnits - decay),
    });
  }

  return points;
}

function ServiceForecastChart({
  sellableUnits,
  disruptionWindowDays,
  language,
}: {
  sellableUnits: number;
  disruptionWindowDays: number | null;
  language: 'en' | 'km';
}) {
  const points = deriveForecastPoints({ sellableUnits, disruptionWindowDays });
  const maxRemaining = Math.max(...points.map((point) => point.remaining), 1);
  const width = 640;
  const height = 240;
  const path = points
    .map((point, index) => {
      const x = (index / Math.max(points.length - 1, 1)) * width;
      const y = height - (point.remaining / maxRemaining) * (height - 24) - 12;
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');

  return (
    <div className="rounded-[1.75rem] border border-border/70 bg-background/70 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Service forecast
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Derived from current sellable units and the strongest linked-SKU disruption signal.
          </p>
        </div>
        <Badge variant="outline">
          {disruptionWindowDays == null
            ? 'Window unavailable'
            : `${formatNumber(disruptionWindowDays, language)} day window`}
        </Badge>
      </div>
      <svg
        aria-label="Service forecast chart"
        className="mt-5 h-auto w-full"
        role="img"
        viewBox={`0 0 ${width} ${height}`}
      >
        <line stroke="currentColor" strokeOpacity="0.12" strokeWidth="1" x1="0" x2={width} y1={height - 12} y2={height - 12} />
        <path d={path} fill="none" stroke="currentColor" strokeWidth="4" />
      </svg>
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
        <p>Day 0: {formatNumber(sellableUnits, language)} sellable units</p>
        <p>
          {disruptionWindowDays == null
            ? 'No disruption window is available from current signals.'
            : `Service crosses the disruption zone around day ${formatNumber(disruptionWindowDays, language)}.`}
        </p>
      </div>
    </div>
  );
}

export function ServiceDetailRoute() {
  const { serviceId } = useParams();
  const { listStockReports, snapshot } = useInventory();
  const { currency, language, t } = usePreferences();
  const [activeTab, setActiveTab] = useState<CockpitTab>('overview');
  const [selectedSkuId, setSelectedSkuId] = useState<string | null>(null);
  const [activityReports, setActivityReports] = useState<StockReport[]>([]);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [activityLoading, setActivityLoading] = useState(true);

  const service = snapshot?.services.find((entry) => entry.serviceId === serviceId) ?? null;
  const contributors = useMemo(
    () => (snapshot && service ? rankedServiceContributors(service, snapshot) : []),
    [service, snapshot],
  );
  const sellableUnits = useMemo(
    () => (snapshot && service ? computeServiceSellableUnits(service, snapshot) : 0),
    [service, snapshot],
  );
  const bottleneck = useMemo(
    () => (snapshot && service ? currentServiceBottleneck(service, snapshot) : null),
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

  useEffect(() => {
    if (!contributors.length) {
      setSelectedSkuId(null);
      return;
    }

    setSelectedSkuId((current) => current ?? contributors.find((entry) => entry.isBottleneck)?.sku.skuId ?? contributors[0].sku.skuId);
  }, [contributors]);

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

  if (!service || !fragility || !economics) {
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

  const stateLabel = serviceStateLabel(fragility.currentState);
  const confidenceLabel = confidenceBadgeLabel(fragility.confidence);
  const latestEvidence = latestEvidenceHint(timelineEvents.map((event) => event.report));
  const heroMessage = serviceHeroMessage({
    sellableUnits,
    disruptionWindowDays: fragility.disruptionWindowDays,
    bottleneckSkuId: bottleneck?.skuId ?? null,
    linkedSkuCount: contributors.length,
    latestEvidence,
    state: stateLabel,
    language,
  });
  const recommendation = recommendationForService({
    state: stateLabel,
    bottleneckName: bottleneck?.name ?? null,
    nextLimiterName: fragility.nextLikelyLimiter?.sku.name ?? null,
    disruptionWindowDays: fragility.disruptionWindowDays,
    linkedSkuCount: contributors.length,
  });
  const latestPriceAdjustment = [...activityReports]
    .sort((left, right) => new Date(right.reportedAt).getTime() - new Date(left.reportedAt).getTime())
    .flatMap((report) =>
      report.servicePriceAdjustments
        .filter((adjustment) => adjustment.serviceId === service.serviceId)
        .map((adjustment) => ({ adjustment, reportedAt: report.reportedAt })),
    )[0] ?? null;
  const marginUnderPressure =
    economics.servicePrice > 0 && economics.grossMargin / economics.servicePrice <= 0.2;
  const overviewHint = timelineEvents[0]?.summary ?? null;
  const selectedContributor =
    contributors.find((entry) => entry.sku.skuId === selectedSkuId) ?? contributors[0] ?? null;
  const prioritizeOperations = stateLabel === 'Blocked' || stateLabel === 'At risk';
  const editPrimary = contributors.length === 0;
  const handleViewWhy = () => {
    setActiveTab('forecast');
  };

  return (
    <WorkspacePage data-testid="service-detail-route">
      <section className="rounded-[2rem] border border-white/70 bg-card/75 p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Button asChild aria-label={t('backToCatalog')} size="icon" variant="ghost">
                  <Link to="/catalog">
                    <ArrowLeft />
                  </Link>
                </Button>
                <h1 className="min-w-0 font-heading text-base font-medium tracking-[-0.02em] text-foreground">
                  {service.name}
                </h1>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-3">
                <Button asChild variant={prioritizeOperations ? 'default' : 'outline'}>
                  <Link to={`/operations/session?step=services&focusService=${service.serviceId}`}>
                    <ClipboardPen className="size-4" />
                    {t('catalogServiceOperationsAction')}
                  </Link>
                </Button>
                <Button asChild variant={editPrimary ? 'default' : 'outline'}>
                  <Link to={`/catalog/services/${service.serviceId}/edit`}>
                    <SquarePen className="size-4" />
                    {t('catalogServiceEditAction')}
                  </Link>
                </Button>
              </div>
            </div>
            <div className="mt-3 flex min-w-0 flex-wrap items-center gap-3">
              <Badge variant="outline">{`${t('fieldId')}: ${service.serviceId}`}</Badge>
              <Badge variant={badgeVariantForState(stateLabel)}>{stateLabel}</Badge>
              <Badge variant="outline">{latestEvidence ?? confidenceLabel}</Badge>
            </div>
            <DescriptionText className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
              {service.description || 'Track bundle readiness, fragility, and supporting evidence before editing the service.'}
            </DescriptionText>
          </div>
        </div>

        <div className={cn('mt-5 rounded-[1.85rem] border p-5 sm:p-6', serviceRiskToneClass(stateLabel))}>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                SIST cockpit
              </p>
              <p className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-foreground sm:text-4xl">
                {heroMessage}
              </p>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                {`${formatNumber(sellableUnits, language)} sellable units · ${formatNumber(
                  contributors.length,
                  language,
                )} linked SKUs · ${bottleneck?.name ?? 'No active limiter'} · ${confidenceLabel}`}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button type="button" variant="default" onClick={handleViewWhy}>
                <Search className="size-4" />
                View why
              </Button>
            </div>
          </div>
        </div>

        <Tabs className="mt-6" value={activeTab} onValueChange={(value) => setActiveTab(value as CockpitTab)}>
          <TabsList className="w-full justify-start overflow-x-auto" variant="line">
            <TabsTrigger onClick={() => setActiveTab('overview')} value="overview">Overview</TabsTrigger>
            <TabsTrigger onClick={() => setActiveTab('forecast')} value="forecast">Forecast</TabsTrigger>
            <TabsTrigger onClick={() => setActiveTab('dependencies')} value="dependencies">Dependencies</TabsTrigger>
            <TabsTrigger onClick={() => setActiveTab('history')} value="history">History</TabsTrigger>
            <TabsTrigger onClick={() => setActiveTab('parameters')} value="parameters">Parameters</TabsTrigger>
          </TabsList>

          <TabsContent className="mt-6" value="overview">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
              <div className="space-y-5">
                <div className="rounded-[1.75rem] border border-border/70 bg-background/65 p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                        Service rail
                      </p>
                      <DescriptionText className="mt-1 text-sm text-muted-foreground">
                        Keep the operating stats visible without repeating the hero state.
                      </DescriptionText>
                    </div>
                    {marginUnderPressure ? <Badge variant="secondary">Margin under pressure</Badge> : null}
                  </div>
                  <MetricStrip className="mt-4 rounded-none border-0 bg-transparent xl:grid-cols-5">
                    <MetricStripItem
                      className="px-0 sm:px-0 xl:pl-0 xl:pr-6"
                      label={t('catalogServiceSellableUnits')}
                      value={formatNumber(sellableUnits, language)}
                    />
                    <MetricStripItem
                      className="px-0 sm:px-0 xl:px-6"
                      label={t('fieldPrice')}
                      value={formatCurrency(service.price, currency, language)}
                    />
                    <MetricStripItem
                      className="px-0 sm:px-0 xl:px-6"
                      label="Current bottleneck"
                      value={bottleneck?.name ?? 'No active limiter'}
                    />
                    <MetricStripItem
                      className="px-0 sm:px-0 xl:px-6"
                      label="Next likely limiter"
                      value={fragility.nextLikelyLimiter?.sku.name ?? 'Unavailable'}
                    />
                    <MetricStripItem
                      className="px-0 sm:px-0 xl:pl-6 xl:pr-0"
                      label="Coverage mode"
                      value={contributors.length === 0 ? 'Unlinked' : `${formatNumber(contributors.length, language)} linked`}
                    />
                  </MetricStrip>
                </div>
              </div>

              <div className="rounded-[1.75rem] border border-border/70 bg-background/70 p-4 sm:p-5">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Next move
                </p>
                <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-foreground">
                  {recommendation.headline}
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{recommendation.suggestion}</p>
                <div className="mt-5 space-y-3">
                  {recommendation.reasons.map((reason) => (
                    <p className="text-sm leading-6 text-foreground/85" key={reason}>
                      {reason}
                    </p>
                  ))}
                </div>
                <div className="mt-5 border-t border-border/60 pt-4">
                  <p className="text-sm font-medium text-foreground">Why SIST thinks this</p>
                  <div className="mt-3 grid gap-3 text-sm leading-6 text-muted-foreground">
                    <p>Current bottleneck: {bottleneck?.name ?? 'No active limiter'}.</p>
                    <p>Next likely limiter: {fragility.nextLikelyLimiter?.sku.name ?? 'Unavailable'}.</p>
                    <p>
                      {fragility.disruptionWindowDays == null
                        ? 'Disruption timing is unavailable because the limiting SKU does not have days-of-cover detail.'
                        : `The limiting signal implies a disruption window of about ${formatNumber(fragility.disruptionWindowDays, language)} days.`}
                    </p>
                    <p>
                      If the bottleneck worsens first, service sellable units collapse before other linked SKUs matter.
                    </p>
                    {overviewHint ? <p>Latest evidence: {overviewHint}</p> : null}
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent className="mt-6" value="forecast">
            <div className="grid items-stretch gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)]">
              <ServiceForecastChart
                disruptionWindowDays={fragility.disruptionWindowDays}
                language={language}
                sellableUnits={sellableUnits}
              />
              <div className="flex h-full flex-col rounded-[1.75rem] border border-border/70 bg-background/70 p-5">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Why SIST thinks this
                </p>
                <div className="mt-4 space-y-4 text-sm leading-6 text-muted-foreground">
                  <p>
                    Banji derives the service horizon from current linked-SKU stock and the strongest linked-SKU SIST cover signal.
                  </p>
                  <p>
                    {bottleneck?.name ?? 'The current recipe'} drives the first depletion curve, while {fragility.nextLikelyLimiter?.sku.name ?? 'the next ranked SKU'} becomes the next handoff marker if pressure continues.
                  </p>
                  <p>
                    Confidence stays {confidenceLabel.toLowerCase()} because the strongest linked SKU controls the service-level forecast.
                  </p>
                </div>
                <div className="mt-5 border-t border-border/60 pt-4 text-sm text-muted-foreground">
                  <p>Uncertainty / disruption window</p>
                  <p className="mt-2 text-foreground">
                    {fragility.disruptionWindowDays == null
                      ? 'Unavailable from current linked-SKU cover data.'
                      : `${formatNumber(fragility.disruptionWindowDays, language)} days to likely disruption.`}
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent className="mt-6" value="dependencies">
            <div className="grid gap-5">
              <div className="rounded-[1.75rem] border border-border/70 bg-background/70 p-5">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Dependency map
                </p>
                {contributors.length > 0 ? (
                  <div className="mt-5 flex flex-col items-center gap-4">
                    <div className="min-w-[220px] rounded-[1.5rem] border border-primary/25 bg-primary/5 px-5 py-4 text-center">
                      <p className="text-[0.72rem] uppercase tracking-[0.18em] text-muted-foreground">
                        {service.serviceId}
                      </p>
                      <p className="mt-2 text-lg font-semibold text-foreground">{service.name}</p>
                    </div>
                    <div className="grid w-full gap-3">
                      {contributors.map((contributor) => {
                        const isSelected = contributor.sku.skuId === selectedContributor?.sku.skuId;
                        const healthLabel = contributorHealthLabel(contributor.health);
                        return (
                          <div className="grid gap-2 xl:grid-cols-[100px_minmax(0,1fr)]" key={contributor.sku.skuId}>
                            <div className="hidden items-center justify-center xl:flex">
                              <div
                                className={cn(
                                  'h-px w-full',
                                  isSelected
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
                                isSelected ? 'border-primary/35 bg-primary/5' : 'border-border/60 bg-background/40',
                              )}
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-semibold text-foreground">{contributor.sku.name}</p>
                                <Badge variant={badgeVariantForHealth(healthLabel)}>{healthLabel}</Badge>
                                {contributor.isBottleneck ? <Badge variant="secondary">Bottleneck</Badge> : null}
                                {isSelected ? <Badge variant="outline">Selected</Badge> : null}
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
                  <p className="mt-4 text-sm text-muted-foreground">No linked dependencies are available for this service yet.</p>
                )}
              </div>

              <div className="rounded-[1.75rem] border border-border/70 bg-background/70 p-5">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Dependency contributors
                </p>
                {contributors.length > 0 ? (
                  <div className="mt-4 grid gap-3">
                    {contributors.map((contributor) => {
                      const healthLabel = contributorHealthLabel(contributor.health);
                      const isSelected = contributor.sku.skuId === selectedContributor?.sku.skuId;
                      return (
                        <div
                          className={cn(
                            'flex flex-wrap items-start justify-between gap-3 rounded-[1.5rem] border px-4 py-4',
                            isSelected ? 'border-primary/35 bg-primary/5' : 'border-border/70 bg-background/40',
                          )}
                          key={contributor.sku.skuId}
                        >
                          <button
                            className="min-w-0 flex-1 text-left"
                            onClick={() => setSelectedSkuId(contributor.sku.skuId)}
                            type="button"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold text-foreground">{contributor.sku.name}</p>
                              <Badge variant="outline">#{contributor.rank}</Badge>
                              <Badge variant={badgeVariantForHealth(healthLabel)}>{healthLabel}</Badge>
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">{contributor.sku.skuId}</p>
                            <p className="mt-3 text-sm text-muted-foreground">
                              {t('fieldUnitsInStock')}: {formatNumber(contributor.sku.unitsInStock, language)} · {contributor.probabilityLabel}
                            </p>
                          </button>
                          <Button asChild size="sm" variant="ghost">
                            <Link to={`/catalog/skus/${contributor.sku.skuId}`}>Open SKU detail</Link>
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-muted-foreground">{t('catalogServiceLinkedSkusEmpty')}</p>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent className="mt-6" value="history">
            {activityLoading ? (
              <p className="text-sm text-muted-foreground">{t('overviewRecentActivityLoading')}</p>
            ) : activityError ? (
              <p className="text-sm text-muted-foreground">{t('catalogServiceRecentActivityFallback')}</p>
            ) : timelineEvents.length > 0 ? (
              <div className="grid gap-4">
                {timelineEvents.map((event) => (
                  <div className="rounded-[1.75rem] border border-border/70 bg-background/70 p-5" key={event.report.reportId}>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{reportDateLabel(event.report.reportedAt, language)}</Badge>
                      <Badge variant="secondary">{t(stockReportSourceKey(event.report.reportSource))}</Badge>
                      {event.types.map((type) => (
                        <Badge key={`${event.report.reportId}-${type}`} variant="outline">
                          {eventTypeLabel(type)}
                        </Badge>
                      ))}
                    </div>
                    <div className="mt-5 grid gap-4 xl:grid-cols-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">What changed</p>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">{event.summary}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">SIST inferred</p>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          {event.types.includes('service-unavailable')
                            ? `${bottleneck?.name ?? 'The bottleneck'} was driving the service closest to disruption.`
                            : event.types.includes('price-adjustment')
                              ? 'Economic context changed, but service fragility still comes from linked-SKU coverage.'
                              : 'Linked dependency movement shifted the service constraint profile.'}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">Banji recommends</p>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          {event.types.includes('service-unavailable')
                            ? 'Review this service in session before pricing or recipe edits.'
                            : event.types.includes('price-adjustment')
                              ? 'Confirm price intent against the latest input cost and dependency risk.'
                              : 'Check the limiting SKU first, then re-rank the service if pressure changed.'}
                        </p>
                      </div>
                    </div>
                    {event.secondary ? (
                      <details className="mt-4 text-sm text-muted-foreground">
                        <summary className="cursor-pointer">Notes</summary>
                        <p className="mt-2 leading-6">{event.secondary}</p>
                      </details>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t('catalogServiceRecentActivityEmpty')}</p>
            )}
          </TabsContent>

          <TabsContent className="mt-6" value="parameters">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
              <div className="rounded-[1.75rem] border border-border/70 bg-background/70 p-5">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Economics
                </p>
                <div className="mt-4 grid gap-3">
                  <div className="rounded-[1.25rem] border border-border/60 bg-background/35 px-4 py-4">
                    <p className="text-[0.72rem] uppercase tracking-[0.18em] text-muted-foreground">{t('fieldPrice')}</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">
                      {formatCurrency(economics.servicePrice, currency, language)}
                    </p>
                  </div>
                  <div className="rounded-[1.25rem] border border-border/60 bg-background/35 px-4 py-4">
                    <p className="text-[0.72rem] uppercase tracking-[0.18em] text-muted-foreground">Estimated input cost</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">
                      {formatCurrency(economics.estimatedInputCost, currency, language)}
                    </p>
                  </div>
                  <div className="rounded-[1.25rem] border border-border/60 bg-background/35 px-4 py-4">
                    <p className="text-[0.72rem] uppercase tracking-[0.18em] text-muted-foreground">Gross margin</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">
                      {formatCurrency(economics.grossMargin, currency, language)}
                    </p>
                  </div>
                  <div className="rounded-[1.25rem] border border-border/60 bg-background/35 px-4 py-4">
                    <p className="text-[0.72rem] uppercase tracking-[0.18em] text-muted-foreground">Last price adjustment</p>
                    <p className="mt-2 text-lg font-semibold text-foreground">
                      {latestPriceAdjustment
                        ? `${formatCurrency(latestPriceAdjustment.adjustment.price, currency, language)} · ${reportDateLabel(latestPriceAdjustment.reportedAt, language)}`
                        : 'No recorded adjustment'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-[1.75rem] border border-border/70 bg-background/70 p-5">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Recipe composition
                </p>
                {contributors.length > 0 ? (
                  <div className="mt-4 grid gap-3">
                    {contributors.map((contributor) => (
                      <div className="rounded-[1.25rem] border border-border/60 bg-background/35 px-4 py-4" key={contributor.sku.skuId}>
                        <p className="font-medium text-foreground">{contributor.sku.name}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {contributor.sku.skuId} · {formatCurrency(contributor.sku.costPerUnit, currency, language)} input cost · {formatNumber(contributor.sku.unitsInStock, language)} on hand
                        </p>
                      </div>
                    ))}
                    <div className="rounded-[1.25rem] border border-border/60 bg-background/35 px-4 py-4 text-sm leading-6 text-muted-foreground">
                      Derived notes: service margin is calculated from current linked-SKU cost basis only. Banji is not modeling stressed replenishment cost in this pass.
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-muted-foreground">No linked SKUs are attached to this service yet.</p>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </section>
    </WorkspacePage>
  );
}
