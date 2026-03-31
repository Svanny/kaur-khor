import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { StockReport } from '@shared/inventory';
import {
  AlertTriangle,
  BadgeDollarSign,
  ClipboardPen,
  CircleHelp,
  ShieldAlert,
  SquarePen,
  Target,
  Boxes,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DescriptionText } from '@/components/system/description-text';
import { RouteBackButton } from '@/components/system/page-navigation';
import { WorkspaceEmpty, WorkspacePage } from '@/components/system/workspace';
import { computeServiceSellableUnits } from '@/lib/catalog';
import { formatCurrency, formatDurationAuto, formatNumber, formatWholeNumber, localeFor } from '@/lib/format';
import { statusPillClassName, type StatusPillTone } from '@/lib/status-pill';
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
import { traceRenderer } from '@/lib/trace';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';

type CockpitTab = 'overview' | 'forecast' | 'dependencies' | 'history' | 'parameters';

type ForecastPoint = {
  day: number;
  remaining: number;
};

type ServiceRecommendation = ReturnType<typeof recommendationForService>;

function reportDateLabel(reportedAt: string, language: 'en' | 'km') {
  return new Intl.DateTimeFormat(localeFor(language), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(reportedAt));
}

function serviceStateTone(state: ReturnType<typeof serviceStateLabel>): StatusPillTone {
  if (state === 'Blocked') {
    return 'danger';
  }
  if (state === 'At risk') {
    return 'warning';
  }
  if (state === 'Unlinked') {
    return 'neutral';
  }
  return 'success';
}

function contributorHealthTone(label: ReturnType<typeof contributorHealthLabel>): StatusPillTone {
  if (label === 'Blocked') {
    return 'danger';
  }
  if (label === 'High risk') {
    return 'warning';
  }
  return 'success';
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

function dependencyToneClass(health: ReturnType<typeof contributorHealthLabel>, isSelected: boolean) {
  if (isSelected) {
    return 'border-primary/35 bg-primary/5';
  }
  if (health === 'Blocked') {
    return 'border-destructive/25 bg-destructive/[0.04]';
  }
  if (health === 'High risk') {
    return 'border-amber-500/30 bg-amber-500/[0.05]';
  }
  return 'border-border/60 bg-background/40';
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
    return `Likely service disruption in ${formatDurationAuto(disruptionWindowDays, 'day', language)}`;
  }
  if (bottleneckSkuId) {
    return `${formatWholeNumber(sellableUnits, language)} sellable units before ${bottleneckSkuId} blocks fulfillment`;
  }
  if (latestEvidence) {
    return latestEvidence;
  }
  return `${formatWholeNumber(sellableUnits, language)} sellable units holding steady`;
}

function serviceHeroDescriptor({
  sellableUnits,
  linkedSkuCount,
  bottleneckName,
  confidenceLabel,
  language,
}: {
  sellableUnits: number;
  linkedSkuCount: number;
  bottleneckName: string | null;
  confidenceLabel: string;
  language: 'en' | 'km';
}) {
  return `${formatWholeNumber(sellableUnits, language)} sellable units · ${formatWholeNumber(
    linkedSkuCount,
    language,
  )} linked SKUs · ${bottleneckName ?? 'No active limiter'} · ${confidenceLabel}`;
}

function disruptionWindowLabel(disruptionWindowDays: number | null, language: 'en' | 'km') {
  if (disruptionWindowDays == null) {
    return 'Unavailable';
  }
  return formatDurationAuto(disruptionWindowDays, 'day', language);
}

function marginStateLabel({
  servicePrice,
  grossMargin,
}: {
  servicePrice: number;
  grossMargin: number;
}) {
  if (servicePrice <= 0) {
    return 'Low margin';
  }

  const marginRatio = grossMargin / servicePrice;
  if (marginRatio <= 0.2) {
    return 'Low margin';
  }
  if (marginRatio <= 0.35) {
    return 'Compressed';
  }
  return 'Healthy';
}

function collapsePathLabel({
  bottleneckName,
  nextLimiterName,
}: {
  bottleneckName: string | null;
  nextLimiterName: string | null;
}) {
  if (bottleneckName && nextLimiterName && bottleneckName !== nextLimiterName) {
    return `${bottleneckName} first, then ${nextLimiterName}`;
  }
  if (bottleneckName) {
    return `${bottleneckName} stays the limiting path`;
  }
  if (nextLimiterName) {
    return `${nextLimiterName} is the first likely handoff`;
  }
  return 'No active collapse path';
}

function recommendationForService({
  state,
  bottleneckName,
  nextLimiterName,
  disruptionWindowDays,
  linkedSkuCount,
  language,
}: {
  state: ReturnType<typeof serviceStateLabel>;
  bottleneckName: string | null;
  nextLimiterName: string | null;
  disruptionWindowDays: number | null;
  linkedSkuCount: number;
  language: 'en' | 'km';
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
          : `${bottleneckName ?? nextLimiterName ?? 'A linked SKU'} is likely to disrupt this service in about ${formatDurationAuto(disruptionWindowDays, 'day', language)}.`,
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

function historyInferenceText({
  eventTypes,
  bottleneckName,
  nextLimiterName,
}: {
  eventTypes: ReturnType<typeof mapServiceTimelineEvents>[number]['types'];
  bottleneckName: string | null;
  nextLimiterName: string | null;
}) {
  if (eventTypes.includes('service-unavailable')) {
    return `${bottleneckName ?? 'The current bottleneck'} pushed the service into an unavailable state.`;
  }
  if (eventTypes.includes('limiter-shift')) {
    return `${nextLimiterName ?? 'The dependency order'} changed enough to move the likely constraint path.`;
  }
  if (eventTypes.includes('price-adjustment')) {
    return 'Economic context changed, but service fragility still comes from linked-SKU coverage.';
  }
  return `${bottleneckName ?? 'The current bottleneck'} remains the first dependency Banji would check from this evidence.`;
}

function historyRecommendationText({
  eventTypes,
  recommendation,
}: {
  eventTypes: ReturnType<typeof mapServiceTimelineEvents>[number]['types'];
  recommendation: ServiceRecommendation;
}) {
  if (eventTypes.includes('service-unavailable')) {
    return 'Review this service in session before changing price or composition.';
  }
  if (eventTypes.includes('price-adjustment')) {
    return 'Confirm price intent against the latest input cost and dependency pressure.';
  }
  return recommendation.suggestion;
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
  bottleneckName,
  nextLimiterName,
  language,
}: {
  sellableUnits: number;
  disruptionWindowDays: number | null;
  bottleneckName: string | null;
  nextLimiterName: string | null;
  language: 'en' | 'km';
}) {
  const points = deriveForecastPoints({ sellableUnits, disruptionWindowDays });
  const maxRemaining = Math.max(...points.map((point) => point.remaining), 1);
  const width = 640;
  const height = 280;
  const plotTop = 36;
  const plotBottom = height - 42;
  const plotLeft = 40;
  const plotRight = width - 18;
  const xForIndex = (index: number) =>
    plotLeft + (index / Math.max(points.length - 1, 1)) * (plotRight - plotLeft);
  const yForRemaining = (remaining: number) =>
    plotBottom - (remaining / maxRemaining) * (plotBottom - plotTop);
  const markerDay =
    disruptionWindowDays == null ? null : Math.max(0, Math.min(Math.ceil(disruptionWindowDays), points.length - 1));
  const path = points
    .map((point, index) => {
      const x = xForIndex(index);
      const y = yForRemaining(point.remaining);
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
            : `${formatDurationAuto(disruptionWindowDays, 'day', language, 'short')} window`}
        </Badge>
      </div>
      <svg
        aria-label="Service forecast chart"
        className="mt-5 h-auto w-full"
        role="img"
        viewBox={`0 0 ${width} ${height}`}
      >
        <text
          fill="currentColor"
          fontSize="13"
          fontWeight="600"
          textAnchor="middle"
          x={width / 2}
          y="18"
        >
          Sellable units forecast
        </text>
        <text
          fill="currentColor"
          fontSize="12"
          opacity="0.7"
          textAnchor="middle"
          transform={`rotate(-90 16 ${height / 2})`}
          x="16"
          y={height / 2}
        >
          Sellable units
        </text>
        <text
          fill="currentColor"
          fontSize="12"
          opacity="0.7"
          textAnchor="middle"
          x={(plotLeft + plotRight) / 2}
          y={height - 8}
        >
          Time (days)
        </text>
        <line
          stroke="currentColor"
          strokeOpacity="0.16"
          strokeWidth="1"
          x1={plotLeft}
          x2={plotRight}
          y1={plotBottom}
          y2={plotBottom}
        />
        <line
          stroke="currentColor"
          strokeOpacity="0.12"
          strokeWidth="1"
          x1={plotLeft}
          x2={plotLeft}
          y1={plotTop}
          y2={plotBottom}
        />
        {[0, maxRemaining].map((remaining) => (
          <text
            fill="currentColor"
            fontSize="11"
            key={remaining}
            opacity="0.65"
            textAnchor="end"
            x={plotLeft - 8}
            y={yForRemaining(remaining) + 4}
          >
            {formatWholeNumber(remaining, language)}
          </text>
        ))}
        {[0, markerDay ?? Math.max(points.length - 1, 1), Math.max(points.length - 1, 1)].filter(
          (value, index, array) => array.indexOf(value) === index,
        ).map((index) => (
          <g key={index}>
            <text
              fill="currentColor"
              fontSize="11"
              opacity="0.65"
              textAnchor="middle"
              x={xForIndex(index)}
              y={plotBottom + 18}
            >
              {formatNumber(points[index]?.day ?? index, language)}
            </text>
          </g>
        ))}
        {markerDay != null ? (
          <line
            stroke="currentColor"
            strokeDasharray="6 6"
            strokeOpacity="0.3"
            strokeWidth="2"
            x1={xForIndex(markerDay)}
            x2={xForIndex(markerDay)}
            y1={plotTop}
            y2={plotBottom}
          />
        ) : null}
        <path d={path} fill="none" stroke="currentColor" strokeWidth="4" />
      </svg>
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
        <p>Day 0: {formatWholeNumber(sellableUnits, language)} sellable units</p>
        <p>
          {disruptionWindowDays == null
            ? 'No disruption window is available from current signals.'
            : `Service crosses the disruption zone around ${formatDurationAuto(disruptionWindowDays, 'day', language)}.`}
        </p>
        <p>Current bottleneck: {bottleneckName ?? 'No active limiter'}</p>
        <p>Likely handoff: {nextLimiterName ?? 'Unavailable'}</p>
      </div>
    </div>
  );
}

function ServiceDependencyMap({
  serviceId,
  serviceName,
  contributors,
  selectedSkuId,
  setSelectedSkuId,
  language,
}: {
  serviceId: string;
  serviceName: string;
  contributors: ReturnType<typeof rankedServiceContributors>;
  selectedSkuId: string | null;
  setSelectedSkuId: (skuId: string) => void;
  language: 'en' | 'km';
}) {
  return (
    <div className="rounded-[1.75rem] border border-border/70 bg-background/70 p-5">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        Dependency map
      </p>
      {contributors.length > 0 ? (
        <div className="mt-5 flex flex-col items-center gap-4">
          <div className="min-w-[220px] rounded-[1.5rem] border border-primary/25 bg-primary/5 px-5 py-4 text-center">
            <p className="text-[0.72rem] uppercase tracking-[0.18em] text-muted-foreground">{serviceId}</p>
            <p className="mt-2 text-lg font-semibold text-foreground">{serviceName}</p>
          </div>
          <div className="grid w-full gap-3">
            {contributors.map((contributor) => {
              const isSelected = contributor.sku.skuId === selectedSkuId;
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
                    className={cn('rounded-[1.5rem] border px-5 py-4', dependencyToneClass(healthLabel, isSelected))}
                    data-selected={isSelected ? 'true' : 'false'}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <button
                        aria-pressed={isSelected}
                        className="min-w-0 flex-1 text-left"
                        onClick={() => setSelectedSkuId(contributor.sku.skuId)}
                        type="button"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-foreground">{contributor.sku.name}</p>
                          <Badge variant="outline">#{contributor.rank}</Badge>
                          <Badge
                            className={cn('rounded-full', statusPillClassName(contributorHealthTone(healthLabel)))}
                            variant="outline"
                          >
                            {healthLabel}
                          </Badge>
                          {contributor.isBottleneck ? <Badge variant="secondary">Bottleneck</Badge> : null}
                          {isSelected ? <Badge variant="outline">Selected</Badge> : null}
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {contributor.sku.skuId} · {formatWholeNumber(contributor.sku.unitsInStock, language)} on hand
                        </p>
                        <p className="mt-3 text-sm text-muted-foreground">{contributor.probabilityLabel}</p>
                      </button>
                      <Button asChild size="sm" variant="ghost">
                        <Link to={`/catalog/skus/${contributor.sku.skuId}`}>Open SKU detail</Link>
                      </Button>
                    </div>
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
  );
}

function ServiceRailFrame({
  icon: Icon,
  label,
  value,
  toneClass,
  valueClassName,
  className,
}: {
  icon: typeof Boxes;
  label: string;
  value: string;
  toneClass: string;
  valueClassName?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-col items-center rounded-[1.45rem] border px-4 py-3 sm:px-4 sm:py-3.5',
        toneClass,
        className,
      )}
    >
      <div className="flex size-16 items-center justify-center rounded-full border border-current/15 bg-white/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]">
        <Icon className="size-9" strokeWidth={1.8} />
      </div>
      <div className="mt-3 flex min-h-0 flex-1 items-center justify-center self-stretch">
        <p
          className={cn(
            'w-full text-center font-semibold leading-[0.92] tracking-[-0.05em] text-foreground text-[clamp(1.65rem,2.7vw,2.85rem)]',
            valueClassName,
          )}
        >
          {value}
        </p>
      </div>
      <p className="mt-2 text-center text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-foreground/70">
        {label}
      </p>
    </div>
  );
}

function ServiceEvidencePanel({
  events,
  recommendation,
  bottleneckName,
  nextLimiterName,
  language,
  t,
  emptyText,
}: {
  events: ReturnType<typeof mapServiceTimelineEvents>;
  recommendation: ServiceRecommendation;
  bottleneckName: string | null;
  nextLimiterName: string | null;
  language: 'en' | 'km';
  t: ReturnType<typeof usePreferences>['t'];
  emptyText: string;
}) {
  const [showAllEvents, setShowAllEvents] = useState(false);
  const visibleEvents = showAllEvents ? events : events.slice(0, 5);

  return (
    <div className="rounded-[1.75rem] border border-border/70 bg-background/65 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Recent changes
          </p>
          <DescriptionText className="mt-1 text-sm text-muted-foreground">
            What changed, what SIST inferred, and what Banji recommends next.
          </DescriptionText>
        </div>
        {events.length > 5 ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => setShowAllEvents((current) => !current)}
          >
            {showAllEvents ? 'Show fewer' : 'Show all'}
          </Button>
        ) : null}
      </div>
      {events.length > 5 && !showAllEvents ? (
        <p className="mt-3 text-sm text-muted-foreground">Showing the 5 most recent related reports.</p>
      ) : null}
      {events.length > 0 ? (
        <div className="mt-4 divide-y divide-border/60">
          {visibleEvents.map((event) => (
            <div className="py-4 first:pt-0 last:pb-0" key={event.report.reportId}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{reportDateLabel(event.report.reportedAt, language)}</Badge>
                {event.types.map((type) => (
                  <Badge key={`${event.report.reportId}-${type}`} variant="outline">
                    {eventTypeLabel(type)}
                  </Badge>
                ))}
              </div>
              <div className="mt-3 grid gap-2">
                <p className="text-sm leading-6 text-foreground">
                  <span className="font-medium">What changed</span>
                  {' -> '}
                  {event.summary}
                </p>
                <p className="text-sm leading-6 text-muted-foreground">
                  <span className="font-medium text-foreground">SIST inferred</span>
                  {' -> '}
                  {historyInferenceText({
                    bottleneckName,
                    eventTypes: event.types,
                    nextLimiterName,
                  })}
                </p>
                <p className="text-sm leading-6 text-muted-foreground">
                  <span className="font-medium text-foreground">Banji recommends</span>
                  {' -> '}
                  {historyRecommendationText({
                    eventTypes: event.types,
                    recommendation,
                  })}
                </p>
                {event.secondary ? (
                  <p className="text-sm leading-6 text-muted-foreground">{event.secondary}</p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">{emptyText}</p>
      )}
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
          }).sort(
            (left, right) =>
              new Date(right.report.reportedAt).getTime() - new Date(left.report.reportedAt).getTime(),
          )
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
      traceRenderer('service-detail', 'activity-effect-skip', {
        serviceId: serviceId ?? null,
        hasService: Boolean(service),
      });
      return;
    }

    traceRenderer('service-detail', 'activity-effect-start', {
      serviceId,
      source: 'ServiceDetailRoute.useEffect',
    });
    setActivityLoading(true);
    setActivityError(null);

    listStockReports()
      .then((reports) => {
        if (!cancelled) {
          traceRenderer('service-detail', 'activity-effect-success', {
            serviceId,
            count: reports.length,
          });
          setActivityReports(reports);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          traceRenderer('service-detail', 'activity-effect-error', {
            serviceId,
            error: error instanceof Error ? error.message : t('apiUnavailable'),
          });
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
      traceRenderer('service-detail', 'activity-effect-cancel', { serviceId });
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
    language,
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
  const prioritizeOperations = stateLabel === 'Blocked' || stateLabel === 'At risk';
  const editPrimary = contributors.length === 0;
  const heroDescriptor = serviceHeroDescriptor({
    sellableUnits,
    linkedSkuCount: contributors.length,
    bottleneckName: bottleneck?.name ?? null,
    confidenceLabel,
    language,
  });
  const collapsePath = collapsePathLabel({
    bottleneckName: bottleneck?.name ?? null,
    nextLimiterName: fragility.nextLikelyLimiter?.sku.name ?? null,
  });
  const coverageMode = stateLabel === 'Unlinked' ? 'Recipe incomplete' : stateLabel;
  const handleViewWhy = () => {
    setActiveTab('forecast');
    window.setTimeout(() => {
      document.getElementById('service-forecast-why')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }, 0);
  };
  const marginState = marginStateLabel({
    grossMargin: economics.grossMargin,
    servicePrice: economics.servicePrice,
  });

  return (
    <WorkspacePage data-testid="service-detail-route">
      <section className="rounded-[2rem] border border-white/70 bg-card/75 p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <RouteBackButton />
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
              <Badge
                className={cn('rounded-full', statusPillClassName(serviceStateTone(stateLabel)))}
                variant="outline"
              >
                {stateLabel}
              </Badge>
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
              {marginUnderPressure ? (
                <div className="mt-3">
                  <Badge variant="secondary">Margin under pressure</Badge>
                </div>
              ) : null}
              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                {heroDescriptor}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button type="button" variant="default" onClick={handleViewWhy}>
                <CircleHelp className="size-4" />
                View why
              </Button>
            </div>
          </div>
        </div>

        <Tabs className="mt-6" value={activeTab} onValueChange={(value) => setActiveTab(value as CockpitTab)}>
          <TabsList className="w-full justify-start overflow-x-auto" variant="line">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="forecast">Forecast</TabsTrigger>
            <TabsTrigger value="dependencies">Dependencies</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="parameters">Parameters</TabsTrigger>
          </TabsList>

          <TabsContent className="mt-6" value="overview">
            <div className="grid items-stretch gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
              <div className="flex h-full flex-col rounded-[1.75rem] bg-transparent">
                <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-6 md:grid-rows-2">
                  <ServiceRailFrame
                    className="md:col-span-2"
                    icon={Boxes}
                    label={t('catalogServiceSellableUnits')}
                    toneClass="border-sky-300/70 bg-sky-100/75 text-sky-950"
                    value={formatWholeNumber(sellableUnits, language)}
                  />
                  <ServiceRailFrame
                    className="md:col-span-2"
                    icon={BadgeDollarSign}
                    label={t('fieldPrice')}
                    toneClass="border-emerald-300/70 bg-emerald-100/75 text-emerald-950"
                    valueClassName="whitespace-nowrap text-[clamp(1.55rem,2.2vw,2.4rem)]"
                    value={formatCurrency(service.price, currency, language)}
                  />
                  <ServiceRailFrame
                    className="md:col-span-2"
                    icon={AlertTriangle}
                    label="Current bottleneck"
                    toneClass="border-amber-300/75 bg-amber-100/80 text-amber-950"
                    valueClassName="text-[clamp(1.3rem,1.55vw,2rem)]"
                    value={bottleneck?.name ?? 'No active limiter'}
                  />
                  <ServiceRailFrame
                    className="md:col-span-3"
                    icon={Target}
                    label="Next likely limiter"
                    toneClass="border-rose-300/75 bg-rose-100/80 text-rose-950"
                    valueClassName="text-[clamp(1.3rem,1.7vw,2.1rem)]"
                    value={fragility.nextLikelyLimiter?.sku.name ?? 'Unavailable'}
                  />
                  <ServiceRailFrame
                    className="md:col-span-3"
                    icon={ShieldAlert}
                    label="Coverage mode"
                    toneClass="border-violet-300/75 bg-violet-100/80 text-violet-950"
                    value={coverageMode}
                  />
                </div>
              </div>

              <div className="flex h-full flex-col rounded-[1.75rem] border border-border/70 bg-background/70 p-4 sm:p-5">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Next move
                </p>
                <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-foreground">
                  {recommendation.headline}
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{recommendation.suggestion}</p>
                <div className="mt-5">
                  <p className="text-sm font-medium text-foreground">Why SIST thinks this</p>
                  <div className="mt-3 grid gap-3 text-sm leading-6 text-muted-foreground">
                    <p>
                      Current bottleneck:{' '}
                      <span className="text-foreground">{bottleneck?.name ?? 'No active limiter'}.</span>
                    </p>
                    <p>
                      Next likely limiter:{' '}
                      <span className="text-foreground">{fragility.nextLikelyLimiter?.sku.name ?? 'Unavailable'}.</span>
                    </p>
                    <p>
                      Collapse path: <span className="text-foreground">{collapsePath}.</span>
                    </p>
                    <p>
                      Disruption window:{' '}
                      <span className="text-foreground">{disruptionWindowLabel(fragility.disruptionWindowDays, language)}.</span>
                    </p>
                    <p>
                      Confidence:{' '}
                      <span className="text-foreground">
                        {confidenceLabel}. If the bottleneck worsens first, service sellable units collapse before other linked SKUs matter.
                      </span>
                    </p>
                    {overviewHint ? (
                      <p>
                        Evidence hint: <span className="text-foreground">{overviewHint}</span>
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent className="mt-6" value="forecast">
            <div className="grid items-stretch gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)]">
              <ServiceForecastChart
                bottleneckName={bottleneck?.name ?? null}
                disruptionWindowDays={fragility.disruptionWindowDays}
                language={language}
                nextLimiterName={fragility.nextLikelyLimiter?.sku.name ?? null}
                sellableUnits={sellableUnits}
              />
              <div className="flex h-full flex-col rounded-[1.75rem] border border-border/70 bg-background/70 p-5" id="service-forecast-why">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Forecast reading
                </p>
                <div className="mt-4 space-y-4 text-sm leading-6 text-muted-foreground">
                  <p>
                    Service sellable-units horizon comes from the current recipe stock floor and the strongest linked-SKU cover signal.
                  </p>
                  <p>
                    {bottleneck?.name ?? 'The current recipe'} drives the first depletion curve, while {fragility.nextLikelyLimiter?.sku.name ?? 'the next ranked SKU'} is the most likely handoff marker if the first limiter is addressed or worsens.
                  </p>
                  <p>
                    Confidence stays {confidenceLabel.toLowerCase()} because the strongest linked SKU controls the service-level forecast.
                  </p>
                </div>
                <div className="mt-5 grid gap-3 border-t border-border/60 pt-4 text-sm text-muted-foreground">
                  <p>Current bottleneck: <span className="text-foreground">{bottleneck?.name ?? 'No active limiter'}</span></p>
                  <p>Limiter handoff: <span className="text-foreground">{fragility.nextLikelyLimiter?.sku.name ?? 'Unavailable'}</span></p>
                  <p>Uncertainty / disruption window: <span className="text-foreground">{disruptionWindowLabel(fragility.disruptionWindowDays, language)}</span></p>
                  <p>Confidence: <span className="text-foreground">{confidenceLabel}</span></p>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent className="mt-6" value="dependencies">
            <ServiceDependencyMap
              contributors={contributors}
              language={language}
              selectedSkuId={selectedSkuId}
              serviceId={service.serviceId}
              serviceName={service.name}
              setSelectedSkuId={setSelectedSkuId}
            />
          </TabsContent>

          <TabsContent className="mt-6" value="history">
            {activityLoading ? (
              <p className="text-sm text-muted-foreground">{t('overviewRecentActivityLoading')}</p>
            ) : activityError ? (
              <p className="text-sm text-muted-foreground">{t('catalogServiceRecentActivityFallback')}</p>
            ) : (
              <ServiceEvidencePanel
                bottleneckName={bottleneck?.name ?? null}
                emptyText={t('catalogServiceRecentActivityEmpty')}
                events={timelineEvents}
                language={language}
                nextLimiterName={fragility.nextLikelyLimiter?.sku.name ?? null}
                recommendation={recommendation}
                t={t}
              />
            )}
          </TabsContent>

          <TabsContent className="mt-6" value="parameters">
            <div className="rounded-[1.75rem] border border-border/70 bg-background/70 p-5">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Economics
              </p>
              <div className="mt-4 grid gap-x-6 gap-y-5 border-t border-border/60 pt-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1fr)]">
                <div className="border-b border-border/50 pb-4 xl:border-b-0 xl:pb-0">
                  <p className="text-[0.72rem] uppercase tracking-[0.18em] text-muted-foreground">
                    Gross margin
                  </p>
                  <p className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-foreground sm:text-4xl">
                    {formatCurrency(economics.grossMargin, currency, language)}
                  </p>
                  <p className="mt-2 text-sm font-medium text-muted-foreground">{marginState}</p>
                </div>
                <div className="border-b border-border/50 pb-4 xl:border-b-0 xl:pb-0">
                  <p className="text-[0.72rem] uppercase tracking-[0.18em] text-muted-foreground">
                    {t('fieldPrice')}
                  </p>
                  <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-foreground">
                    {formatCurrency(economics.servicePrice, currency, language)}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">Current price</p>
                </div>
                <div className="border-b border-border/50 pb-4 xl:border-b-0 xl:pb-0">
                  <p className="text-[0.72rem] uppercase tracking-[0.18em] text-muted-foreground">
                    Estimated input cost
                  </p>
                  <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-foreground">
                    {formatCurrency(economics.estimatedInputCost, currency, language)}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">Current estimate</p>
                </div>
                <div>
                  <p className="text-[0.72rem] uppercase tracking-[0.18em] text-muted-foreground">
                    Last price adjustment
                  </p>
                  <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-foreground">
                    {latestPriceAdjustment
                      ? formatCurrency(latestPriceAdjustment.adjustment.price, currency, language)
                      : 'No recorded adjustment'}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {latestPriceAdjustment
                      ? reportDateLabel(latestPriceAdjustment.reportedAt, language)
                      : 'No timestamp available'}
                  </p>
                </div>
              </div>
              <p className="mt-5 text-sm leading-6 text-muted-foreground">
                Assumption: margin uses current linked-SKU cost basis only. Banji is not modeling stressed replenishment cost in this pass.
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </section>
    </WorkspacePage>
  );
}
