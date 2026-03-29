import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { SistConfidence, SistSkuDetail, SistSkuInsight, StockReport } from '@shared/inventory';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DescriptionText } from '@/components/system/description-text';
import { MetricStrip, MetricStripItem, WorkspaceEmpty, WorkspacePage } from '@/components/system/workspace';
import {
  computeServiceSellableUnits,
  linkedServicesForSku,
  serviceCoverageState,
  serviceCoverageStateKey,
  serviceLinkedSkus,
} from '@/lib/catalog';
import { formatCurrency, formatNumber, localeFor } from '@/lib/format';
import { stockReportSourceKey, summarizeNotes } from '@/lib/stock-report-summary';
import type { TranslationKey } from '@/lib/translations';
import { cn } from '@/lib/utils';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';

const FORECAST_HORIZON_DAYS = 14;

type CockpitTab = 'overview' | 'forecast' | 'dependencies' | 'history' | 'parameters';

type ForecastPoint = {
  day: number;
  central: number;
  lower: number;
  upper: number;
};

type Recommendation = {
  headline: string;
  suggestion: string;
  reasons: string[];
};

type ImpactRow = {
  serviceId: string;
  name: string;
  coverageState: 'available' | 'at-risk' | 'blocked' | 'unlinked';
  coverageLabel: string;
  sellableUnits: number;
  isLimitingComponent: boolean;
  severity: number;
};

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

function confidenceLabel(confidence: SistConfidence) {
  if (confidence === 'high') {
    return 'High';
  }
  if (confidence === 'medium') {
    return 'Medium';
  }
  return 'Low';
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

function stateLabel(
  state: ReturnType<typeof skuOperationalState>,
  t: (key: TranslationKey) => string,
) {
  if (state === 'healthy') {
    return t('catalogSkuOperationalHealthy');
  }
  if (state === 'reorder-soon') {
    return t('catalogSkuOperationalReorderSoon');
  }
  if (state === 'at-risk') {
    return t('catalogSkuOperationalAtRisk');
  }
  if (state === 'overstocked') {
    return t('catalogSkuOperationalOverstocked');
  }
  return t('catalogSkuOperationalNoPlanning');
}

function horizonMessage(
  insight: SistSkuInsight | null,
  state: ReturnType<typeof skuOperationalState>,
  language: 'en' | 'km',
) {
  if (!insight) {
    return 'Planning signal unavailable';
  }
  if (state === 'at-risk' && insight.daysOfCover != null) {
    return `Likely stockout in ${formatNumber(insight.daysOfCover, language)} days`;
  }
  if (state === 'reorder-soon') {
    return 'Reorder pressure rising';
  }
  if (state === 'overstocked') {
    return 'Stock is running above target';
  }
  return 'Coverage is holding steady';
}

function actionHeadline(
  insight: SistSkuInsight | null,
  state: ReturnType<typeof skuOperationalState>,
) {
  if (!insight) {
    return 'Review planning inputs';
  }
  if (state === 'at-risk') {
    return 'Order now';
  }
  if (state === 'reorder-soon') {
    return 'Plan the next replenishment';
  }
  if (state === 'overstocked') {
    return 'Hold the next purchase';
  }
  if (insight.confidence === 'low') {
    return 'Validate the assumptions';
  }
  return 'Keep monitoring';
}

function recommendationFromInsight({
  insight,
  linkedServiceCount,
  language,
  t,
}: {
  insight: SistSkuInsight | null;
  linkedServiceCount: number;
  language: 'en' | 'km';
  t: (key: TranslationKey) => string;
}): Recommendation {
  const state = skuOperationalState(insight);

  if (!insight) {
    return {
      headline: 'Review planning inputs',
      suggestion: 'Capture a fresh stock update before acting on this SKU.',
      reasons: ['SIST detail is unavailable, so Banji is using the latest snapshot only.'],
    };
  }

  const minLeadDays = Math.max(insight.leadTime.meanDays - insight.leadTime.stdDays, 1);
  const maxLeadDays = Math.max(insight.leadTime.meanDays + insight.leadTime.stdDays, minLeadDays);
  const lowerOrder = Math.max(
    0,
    Math.ceil(
      insight.reorderPoint +
        insight.demandIntervalLow * minLeadDays +
        insight.safetyStock -
        insight.latestPosteriorUnits,
    ),
  );
  const upperOrder = Math.max(
    lowerOrder,
    Math.ceil(
      insight.reorderPoint +
        insight.demandIntervalHigh * maxLeadDays +
        insight.safetyStock -
        insight.latestPosteriorUnits,
    ),
  );

  const reasons = [
    `${formatNumber(insight.stockoutRisk * 100, language)}% stockout risk with ${
      insight.daysOfCover == null ? 'limited cover visibility' : `${formatNumber(insight.daysOfCover, language)} days left`
    }.`,
    `Reorder point is ${formatNumber(insight.reorderPoint, language)} units and lead time centers on ${leadTimeSummary(
      insight,
      language,
    )}.`,
    linkedServiceCount > 0
      ? `${formatNumber(linkedServiceCount, language)} ${
          linkedServiceCount === 1
            ? t('catalogLinkedServicesAffectedSingular')
            : t('catalogLinkedServicesAffectedPlural')
        } currently depend on this SKU.`
      : 'No linked service is waiting on this SKU right now.',
  ];

  if (state === 'overstocked') {
    return {
      headline: 'Hold the next purchase',
      suggestion: 'No replenishment is needed today.',
      reasons,
    };
  }

  if (state === 'healthy' && upperOrder === 0) {
    return {
      headline: insight.confidence === 'low' ? 'Validate the assumptions' : 'Keep monitoring',
      suggestion:
        insight.confidence === 'low'
          ? 'Check the latest demand inputs before placing the next order.'
          : 'No replenishment is needed today.',
      reasons,
    };
  }

  return {
    headline: actionHeadline(insight, state),
    suggestion:
      upperOrder > 0
        ? `Order ${formatNumber(lowerOrder, language)}–${formatNumber(upperOrder, language)} units today.`
        : 'Reassess after the next stock update.',
    reasons,
  };
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
  t: (key: TranslationKey) => string;
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

function deriveForecastPoints(insight: SistSkuInsight, horizonDays = FORECAST_HORIZON_DAYS): ForecastPoint[] {
  return Array.from({ length: horizonDays + 1 }, (_, day) => ({
    day,
    central: insight.latestPosteriorUnits - insight.expectedDemandPerDay * day,
    lower: insight.latestPosteriorUnits - insight.demandIntervalHigh * day,
    upper: insight.latestPosteriorUnits - insight.demandIntervalLow * day,
  }));
}

function impactRowsFor(
  skuId: string,
  snapshot: NonNullable<ReturnType<typeof useInventory>['snapshot']>,
  t: (key: TranslationKey) => string,
): ImpactRow[] {
  return linkedServicesForSku(skuId, snapshot)
    .map((service) => {
      const coverageState = serviceCoverageState(service, snapshot);
      const coverageLabel = t(serviceCoverageStateKey(service, snapshot));
      const sellableUnits = computeServiceSellableUnits(service, snapshot);
      const linkedSkus = serviceLinkedSkus(service, snapshot);
      const limitingUnits = linkedSkus.reduce(
        (minimum, entry) => Math.min(minimum, entry.unitsInStock),
        linkedSkus[0]?.unitsInStock ?? 0,
      );
      const isLimitingComponent = linkedSkus.some(
        (entry) => entry.skuId === skuId && entry.unitsInStock === limitingUnits,
      );
      const severityBase =
        coverageState === 'blocked'
          ? 1
          : coverageState === 'at-risk'
            ? 2
            : coverageState === 'available'
              ? 3
              : 4;

      return {
        serviceId: service.serviceId,
        name: service.name,
        coverageState,
        coverageLabel,
        sellableUnits,
        isLimitingComponent,
        severity: isLimitingComponent ? 0 : severityBase,
      };
    })
    .sort((left, right) => {
      if (left.severity !== right.severity) {
        return left.severity - right.severity;
      }
      if (left.sellableUnits !== right.sellableUnits) {
        return left.sellableUnits - right.sellableUnits;
      }
      return left.name.localeCompare(right.name);
    });
}

function coverageBadgeVariant(state: ImpactRow['coverageState']) {
  if (state === 'blocked') {
    return 'destructive';
  }
  if (state === 'at-risk') {
    return 'secondary';
  }
  return 'outline';
}

function riskToneClass(state: ReturnType<typeof skuOperationalState>) {
  if (state === 'at-risk') {
    return 'border-destructive/30 bg-destructive/[0.04]';
  }
  if (state === 'reorder-soon') {
    return 'border-secondary/70 bg-secondary/[0.12]';
  }
  if (state === 'overstocked') {
    return 'border-primary/25 bg-primary/[0.04]';
  }
  return 'border-border/70 bg-background/55';
}

function ForecastChart({
  insight,
  language,
}: {
  insight: SistSkuInsight;
  language: 'en' | 'km';
}) {
  const width = 720;
  const height = 300;
  const padding = { top: 16, right: 18, bottom: 28, left: 18 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const points = deriveForecastPoints(insight);
  const maxY = Math.max(
    insight.reorderPoint,
    ...points.map((point) => point.upper),
    insight.latestPosteriorUnits,
    1,
  );
  const minY = Math.min(0, ...points.map((point) => point.lower));
  const paddedMaxY = maxY * 1.1;
  const paddedMinY = minY - Math.max(1, Math.abs(minY) * 0.12);

  const xScale = (day: number) => padding.left + (day / FORECAST_HORIZON_DAYS) * plotWidth;
  const yScale = (value: number) =>
    padding.top + ((paddedMaxY - value) / (paddedMaxY - paddedMinY || 1)) * plotHeight;

  const bandPath = [
    ...points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${xScale(point.day)} ${yScale(point.upper)}`),
    ...[...points]
      .reverse()
      .map((point) => `L ${xScale(point.day)} ${yScale(point.lower)}`),
    'Z',
  ].join(' ');
  const centralPath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${xScale(point.day)} ${yScale(point.central)}`)
    .join(' ');
  const reorderY = yScale(insight.reorderPoint);
  const leadWindowStart = Math.max(0, insight.leadTime.meanDays - insight.leadTime.stdDays);
  const leadWindowEnd = Math.min(
    FORECAST_HORIZON_DAYS,
    insight.leadTime.meanDays + insight.leadTime.stdDays,
  );
  const leadWindowX = xScale(leadWindowStart);
  const leadWindowWidth = Math.max(10, xScale(leadWindowEnd) - xScale(leadWindowStart));
  const stockoutDay =
    insight.expectedDemandPerDay > 0 ? insight.latestPosteriorUnits / insight.expectedDemandPerDay : null;
  const stockoutX =
    stockoutDay != null && stockoutDay <= FORECAST_HORIZON_DAYS ? xScale(stockoutDay) : null;

  return (
    <div className="overflow-hidden rounded-[1.75rem] border border-border/70 bg-background/85 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            14-day forecast
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Posterior units, demand band, reorder threshold, and lead-time arrival window.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="size-2 rounded-full bg-[var(--color-chart-1)]" />
            Central
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-2 rounded-full bg-[var(--color-chart-2)]" />
            Uncertainty
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-2 rounded-full bg-destructive/70" />
            Stockout zone
          </span>
        </div>
      </div>
      <svg
        aria-label="SKU forecast chart"
        className="mt-4 h-[300px] w-full"
        viewBox={`0 0 ${width} ${height}`}
      >
        <rect height={height} rx="24" width={width} fill="transparent" />
        {stockoutX != null ? (
          <rect
            fill="color-mix(in oklab, var(--destructive) 10%, transparent)"
            height={plotHeight}
            width={width - stockoutX - padding.right}
            x={stockoutX}
            y={padding.top}
          />
        ) : null}
        <rect
          fill="color-mix(in oklab, var(--chart-3) 55%, transparent)"
          height={plotHeight}
          rx="12"
          width={leadWindowWidth}
          x={leadWindowX}
          y={padding.top}
        />
        <path d={bandPath} fill="color-mix(in oklab, var(--chart-2) 24%, transparent)" />
        <path
          d={centralPath}
          fill="none"
          stroke="var(--chart-1)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="4"
        />
        <line
          stroke="var(--border)"
          strokeDasharray="8 8"
          strokeWidth="2"
          x1={padding.left}
          x2={width - padding.right}
          y1={reorderY}
          y2={reorderY}
        />
        <line
          stroke="var(--border)"
          strokeWidth="1.5"
          x1={padding.left}
          x2={width - padding.right}
          y1={yScale(0)}
          y2={yScale(0)}
        />
        {[0, 7, 14].map((day) => (
          <g key={day}>
            <line
              stroke="var(--border)"
              strokeDasharray="3 8"
              strokeWidth="1"
              x1={xScale(day)}
              x2={xScale(day)}
              y1={padding.top}
              y2={height - padding.bottom}
            />
            <text
              fill="var(--muted-foreground)"
              fontSize="12"
              textAnchor="middle"
              x={xScale(day)}
              y={height - 8}
            >
              {day === 0 ? 'Today' : `Day ${day}`}
            </text>
          </g>
        ))}
        <text fill="var(--muted-foreground)" fontSize="12" x={padding.left + 6} y={reorderY - 8}>
          Reorder point {formatNumber(insight.reorderPoint, language)}
        </text>
      </svg>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span>
          Arrival window: {formatNumber(leadWindowStart, language)}-{formatNumber(leadWindowEnd, language)} days
        </span>
        <span>
          Posterior units: {formatNumber(insight.latestPosteriorUnits, language)}
        </span>
        <span>
          Expected demand/day: {formatNumber(insight.expectedDemandPerDay, language)}
        </span>
      </div>
    </div>
  );
}

function ImpactPanel({
  impactRows,
  language,
}: {
  impactRows: ImpactRow[];
  language: 'en' | 'km';
}) {
  return (
    <div className="rounded-[1.75rem] border border-border/70 bg-background/65 p-4 sm:p-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Affected services
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Limiting services are pinned first so the operational blast radius is obvious.
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          {formatNumber(impactRows.length, language)} linked
        </p>
      </div>
      {impactRows.length > 0 ? (
        <div className="mt-4 divide-y divide-border/60">
          {impactRows.map((impact) => (
            <Link
              className="flex flex-wrap items-start justify-between gap-3 py-4 first:pt-0 last:pb-0 hover:text-primary"
              key={impact.serviceId}
              to={`/catalog/services/${impact.serviceId}`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{impact.name}</p>
                  <Badge variant={coverageBadgeVariant(impact.coverageState)}>{impact.coverageLabel}</Badge>
                  {impact.isLimitingComponent ? (
                    <Badge variant="secondary">Limiting component</Badge>
                  ) : null}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Sellable units: {formatNumber(impact.sellableUnits, language)}
                </p>
              </div>
              <ChevronRight className="mt-1 size-4 text-muted-foreground" />
            </Link>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          No services currently depend on this SKU.
        </p>
      )}
    </div>
  );
}

function EvidencePanel({
  reports,
  sku,
  planningInsight,
  recommendation,
  currency,
  language,
  t,
  emptyText,
}: {
  reports: StockReport[];
  sku: {
    unitsInStock: number;
    costPerUnit: number;
  };
  planningInsight: SistSkuInsight | null;
  recommendation: Recommendation;
  currency: 'USD' | 'KHR';
  language: 'en' | 'km';
  t: (key: TranslationKey) => string;
  emptyText: string;
}) {
  const state = skuOperationalState(planningInsight);

  return (
    <div className="rounded-[1.75rem] border border-border/70 bg-background/65 p-4 sm:p-5">
      <div>
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          Recent changes
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          What changed, what SIST inferred, and what Banji recommends next.
        </p>
      </div>
      {reports.length > 0 ? (
        <div className="mt-4 divide-y divide-border/60">
          {reports.map((report) => {
            const notes = summarizeNotes(report.notes) ?? t('stockHistoryNoNotes');

            return (
              <div className="py-4 first:pt-0 last:pb-0" key={report.reportId}>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{reportDateLabel(report.reportedAt, language)}</Badge>
                  <Badge variant="secondary">{t(stockReportSourceKey(report.reportSource))}</Badge>
                </div>
                <div className="mt-3 grid gap-2">
                  <p className="text-sm leading-6 text-foreground">
                    <span className="font-medium">What changed</span>
                    {' -> '}
                    {skuReportSummary({ currentSku: sku, report, currency, language, t })}
                  </p>
                  <p className="text-sm leading-6 text-muted-foreground">
                    <span className="font-medium text-foreground">SIST inferred</span>
                    {' -> '}
                    {planningInsight
                      ? `${horizonMessage(planningInsight, state, language)} with ${formatNumber(
                          planningInsight.stockoutRisk * 100,
                          language,
                        )}% stockout risk.`
                      : 'Planning detail is currently unavailable.'}
                  </p>
                  <p className="text-sm leading-6 text-muted-foreground">
                    <span className="font-medium text-foreground">Banji recommends</span>
                    {' -> '}
                    {recommendation.headline}. {recommendation.suggestion}
                  </p>
                  <p className="text-sm leading-6 text-muted-foreground">{notes}</p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">{emptyText}</p>
      )}
    </div>
  );
}

function ParametersPanel({
  insight,
  language,
  t,
}: {
  insight: SistSkuInsight | null;
  language: 'en' | 'km';
  t: (key: TranslationKey) => string;
}) {
  if (!insight) {
    return (
      <p className="text-sm text-muted-foreground">
        {t('catalogSkuPlanningSignalsEmpty')}
      </p>
    );
  }

  return (
    <div className="rounded-[1.75rem] border border-border/70 bg-background/65 p-4 sm:p-5">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        <ParameterField
          label={t('catalogDaysOfCover')}
          value={insight.daysOfCover == null ? '—' : formatNumber(insight.daysOfCover, language)}
        />
        <ParameterField
          label={t('catalogStockoutRisk')}
          value={`${formatNumber(insight.stockoutRisk * 100, language)}%`}
        />
        <ParameterField
          label={t('catalogReorderPoint')}
          value={formatNumber(insight.reorderPoint, language)}
        />
        <ParameterField
          label={t('catalogConfidence')}
          value={confidenceLabel(insight.confidence)}
        />
        <ParameterField
          label={t('catalogSkuLeadTimeSummary')}
          value={leadTimeSummary(insight, language)}
        />
        <ParameterField
          label={t('catalogSkuDetailPosteriorUnits')}
          value={formatNumber(insight.latestPosteriorUnits, language)}
        />
        <ParameterField
          label={t('catalogSkuDetailDemandPerDay')}
          value={formatNumber(insight.expectedDemandPerDay, language)}
        />
        <ParameterField
          label="Demand interval"
          value={`${formatNumber(insight.demandIntervalLow, language)}-${formatNumber(
            insight.demandIntervalHigh,
            language,
          )}/day`}
        />
      </div>
    </div>
  );
}

function ParameterField({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-border/60 py-4 last:border-b-0 sm:last:border-b sm:[&:nth-last-child(-n+2)]:border-b-0 xl:last:border-b xl:[&:nth-last-child(-n+3)]:border-b-0">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-lg font-semibold tracking-[-0.03em] text-foreground">{value}</p>
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
  const [activeTab, setActiveTab] = useState<CockpitTab>('overview');

  const sku = useMemo(
    () => snapshot?.skus.find((entry) => entry.skuId === skuId) ?? null,
    [skuId, snapshot],
  );

  const snapshotInsight = useMemo(
    () => snapshot?.sist.skuInsights.find((entry) => entry.skuId === skuId) ?? null,
    [skuId, snapshot],
  );

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

  const planningInsight = skuDetail?.insight ?? snapshotInsight;
  const state = skuOperationalState(planningInsight);
  const riskLabel = stateLabel(state, t);
  const heroMessage = horizonMessage(planningInsight, state, language);
  const linkedServiceCount = linkedServicesForSku(sku.skuId, snapshot).length;
  const recommendation = recommendationFromInsight({
    insight: planningInsight,
    linkedServiceCount,
    language,
    t,
  });
  const impactRows = impactRowsFor(sku.skuId, snapshot, t);
  const historyReports = skuDetail?.reports ?? [];
  const previewReports = historyReports.slice(0, 3);
  const recordStockActionVariant = state === 'at-risk' || state === 'reorder-soon' ? 'default' : 'outline';
  const editSkuActionVariant = state === 'at-risk' || state === 'reorder-soon' ? 'outline' : 'default';

  const handleViewWhy = () => {
    setActiveTab('forecast');
    window.setTimeout(() => {
      document.getElementById('sku-forecast-why')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }, 0);
  };

  return (
    <WorkspacePage data-testid="sku-detail-route">
      <section className="rounded-[2rem] border border-white/70 bg-card/75 p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <Button asChild aria-label={t('backToCatalog')} size="icon" variant="ghost">
                <Link to="/catalog">
                  <ArrowLeft />
                </Link>
              </Button>
              <h1 className="min-w-0 text-2xl font-semibold tracking-[-0.04em] text-foreground sm:text-3xl">
                {sku.name}
              </h1>
              <Badge variant="outline">{`${t('fieldId')}: ${sku.skuId}`}</Badge>
              <Badge variant={state === 'at-risk' ? 'destructive' : state === 'reorder-soon' ? 'secondary' : 'outline'}>
                {riskLabel}
              </Badge>
              <Badge variant="outline">{confidenceLabel(planningInsight?.confidence ?? 'low')} confidence</Badge>
            </div>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
              {sku.description || t('catalogSkuOverviewIdentityDescription')}
            </p>
          </div>
        </div>

        {detailError ? (
          <p className="mt-4 text-sm text-muted-foreground">{t('catalogSkuPlanningSignalsFallback')}</p>
        ) : null}

        <div className={cn('mt-5 rounded-[1.85rem] border p-5 sm:p-6', riskToneClass(state))}>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                SIST cockpit
              </p>
              <p className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-foreground sm:text-4xl">
                {heroMessage}
              </p>
              <p className="mt-2 text-base font-medium text-foreground/85">{riskLabel}</p>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                {`${formatNumber(sku.unitsInStock, language)} on hand · ${
                  planningInsight
                    ? `${formatNumber(planningInsight.stockoutRisk * 100, language)}% stockout risk · ${confidenceLabel(
                        planningInsight.confidence,
                      )} confidence`
                    : 'planning detail pending'
                } · ${formatNumber(linkedServiceCount, language)} ${
                  linkedServiceCount === 1
                    ? t('catalogLinkedServicesAffectedSingular')
                    : t('catalogLinkedServicesAffectedPlural')
                }`}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button asChild variant={recordStockActionVariant}>
                <Link to={`/operations/session?step=observations&focusSku=${sku.skuId}`}>
                  {t('catalogSkuStockAction')}
                </Link>
              </Button>
              <Button asChild variant={editSkuActionVariant}>
                <Link to={`/catalog/skus/${sku.skuId}/edit`}>{t('catalogSkuEditAction')}</Link>
              </Button>
              <Button type="button" variant="ghost" onClick={handleViewWhy}>
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
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
              <div className="space-y-5">
                {planningInsight ? (
                  <ForecastChart insight={planningInsight} language={language} />
                ) : (
                  <div className="rounded-[1.75rem] border border-border/70 bg-background/65 p-5">
                    <p className="text-sm text-muted-foreground">{t('catalogSkuPlanningSignalsEmpty')}</p>
                  </div>
                )}
                <div className="rounded-[1.75rem] border border-border/70 bg-background/65 p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                        Stock rail
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Keep the core decision metrics in one glanceable strip.
                      </p>
                    </div>
                    <Badge variant={sku.soldAsProduct ? 'secondary' : 'outline'}>
                      {sku.soldAsProduct ? t('inventorySoldAsProduct') : t('inventoryNotSoldAsProduct')}
                    </Badge>
                  </div>
                  <MetricStrip className="mt-4 rounded-none border-0 bg-transparent">
                    <MetricStripItem
                      className="px-0 sm:px-0 xl:pl-0 xl:pr-6"
                      detail={undefined}
                      label="On hand"
                      value={formatNumber(sku.unitsInStock, language)}
                    />
                    <MetricStripItem
                      className="px-0 sm:px-0 xl:px-6"
                      detail={undefined}
                      label="Days left"
                      value={
                        planningInsight?.daysOfCover == null
                          ? '—'
                          : formatNumber(planningInsight.daysOfCover, language)
                      }
                    />
                    <MetricStripItem
                      className="px-0 sm:px-0 xl:px-6"
                      detail={undefined}
                      label={t('catalogReorderPoint')}
                      value={
                        planningInsight == null
                          ? '—'
                          : formatNumber(planningInsight.reorderPoint, language)
                      }
                    />
                    <MetricStripItem
                      className="px-0 sm:px-0 xl:px-6"
                      detail={undefined}
                      label={t('fieldCostPerUnit')}
                      value={formatCurrency(sku.costPerUnit, currency, language)}
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

              <div className="rounded-[1.75rem] border border-border/70 bg-background/70 p-4 sm:p-5">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Next move
                </p>
                <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-foreground">
                  {recommendation.headline}
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {recommendation.suggestion}
                </p>
                <div className="mt-5 space-y-3">
                  {recommendation.reasons.map((reason) => (
                    <p className="text-sm leading-6 text-foreground/85" key={reason}>
                      {reason}
                    </p>
                  ))}
                </div>
                <details className="mt-5 border-t border-border/60 pt-4" id="sku-forecast-why">
                  <summary className="cursor-pointer list-none text-sm font-medium text-foreground">
                    Why SIST thinks this
                  </summary>
                  <div className="mt-3 grid gap-3 text-sm leading-6 text-muted-foreground">
                    <p>
                      Posterior units start at {planningInsight ? formatNumber(planningInsight.latestPosteriorUnits, language) : '—'} and drain using the current expected demand range.
                    </p>
                    <p>
                      Lead-time arrivals land around {planningInsight ? leadTimeSummary(planningInsight, language) : '—'}, while the reorder line stays fixed at {planningInsight ? formatNumber(planningInsight.reorderPoint, language) : '—'} units.
                    </p>
                  </div>
                </details>
              </div>
            </div>

            <div className="mt-5 grid gap-5 xl:grid-cols-2">
              <ImpactPanel impactRows={impactRows} language={language} />
              {detailLoading && !skuDetail ? (
                <div className="rounded-[1.75rem] border border-border/70 bg-background/65 p-5">
                  <p className="text-sm text-muted-foreground">{t('catalogSkuDetailLoaderLoading')}</p>
                </div>
              ) : detailError ? (
                <div className="rounded-[1.75rem] border border-border/70 bg-background/65 p-5">
                  <p className="text-sm text-muted-foreground">{t('catalogSkuRecentReportsFallback')}</p>
                </div>
              ) : (
                <EvidencePanel
                  currency={currency}
                  emptyText={t('catalogSkuRecentReportsEmpty')}
                  language={language}
                  planningInsight={planningInsight}
                  recommendation={recommendation}
                  reports={previewReports}
                  sku={sku}
                  t={t}
                />
              )}
            </div>
          </TabsContent>

          <TabsContent className="mt-6" value="forecast">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)]">
              <div>
                {planningInsight ? (
                  <ForecastChart insight={planningInsight} language={language} />
                ) : (
                  <div className="rounded-[1.75rem] border border-border/70 bg-background/65 p-5">
                    <p className="text-sm text-muted-foreground">{t('catalogSkuPlanningSignalsEmpty')}</p>
                  </div>
                )}
              </div>
              <div className="rounded-[1.75rem] border border-border/70 bg-background/70 p-5" id="sku-forecast-why">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Why SIST thinks this
                </p>
                <div className="mt-4 space-y-4 text-sm leading-6 text-muted-foreground">
                  <p>
                    Banji derives this chart from the current posterior inventory estimate and expected daily demand range. It is a forecast view, not a model-native time-series export.
                  </p>
                  <p>
                    The horizontal reorder line marks the minimum comfort level, while the shaded arrival band shows when replenishment would likely land if you reorder against the current lead-time estimate.
                  </p>
                  <p>
                    Once the central line crosses zero, the forecast enters the stockout zone. The wider the uncertainty band, the more careful the next stock decision should be.
                  </p>
                </div>
                <div className="mt-5 border-t border-border/60 pt-4">
                  <p className="text-sm font-medium text-foreground">{recommendation.headline}</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{recommendation.suggestion}</p>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent className="mt-6" value="dependencies">
            <ImpactPanel impactRows={impactRows} language={language} />
          </TabsContent>

          <TabsContent className="mt-6" value="history">
            {detailLoading && !skuDetail ? (
              <p className="text-sm text-muted-foreground">{t('catalogSkuDetailLoaderLoading')}</p>
            ) : detailError ? (
              <p className="text-sm text-muted-foreground">{t('catalogSkuRecentReportsFallback')}</p>
            ) : (
              <EvidencePanel
                currency={currency}
                emptyText={t('catalogSkuRecentReportsEmpty')}
                language={language}
                planningInsight={planningInsight}
                recommendation={recommendation}
                reports={historyReports}
                sku={sku}
                t={t}
              />
            )}
          </TabsContent>

          <TabsContent className="mt-6" value="parameters">
            <ParametersPanel insight={planningInsight} language={language} t={t} />
          </TabsContent>
        </Tabs>
      </section>
    </WorkspacePage>
  );
}
