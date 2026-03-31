import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { SistConfidence, SistSkuDetail, SistSkuInsight, StockReport } from '@shared/inventory';
import { ChevronRight, CircleHelp, ClipboardPen, SquarePen } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DescriptionText } from '@/components/system/description-text';
import { RouteBackButton } from '@/components/system/page-navigation';
import { MetricStrip, MetricStripItem, WorkspaceEmpty, WorkspacePage } from '@/components/system/workspace';
import {
  computeServiceSellableUnits,
  linkedServicesForSku,
  serviceCoverageState,
  serviceCoverageStateKey,
  serviceLinkedSkus,
} from '@/lib/catalog';
import {
  formatCurrency,
  formatDurationAuto,
  formatNumber,
  formatQuantityForDisplay,
  formatWholeNumber,
  localeFor,
} from '@/lib/format';
import { buildDemandChartDomain, formatDemandRate, intervalDemandPerDay } from '@/routes/sku-detail-demand';
import { statusPillClassName, type StatusPillTone } from '@/lib/status-pill';
import { summarizeNotes } from '@/lib/stock-report-summary';
import { traceRenderer } from '@/lib/trace';
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

type HistoricalPoint = {
  date: Date;
  units: number;
};

type DemandHistogramBin = {
  start: number;
  end: number;
  count: number;
};

type DemandDensityPoint = {
  x: number;
  y: number;
};

type DomainRange = {
  min: number;
  max: number;
};

function buildLinearAxisTicks(min: number, max: number, count = 4) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return [0];
  }
  if (Math.abs(max - min) < 0.000001) {
    return [min];
  }

  return Array.from({ length: count }, (_, index) => min + ((max - min) * index) / Math.max(count - 1, 1));
}

function estimateSvgTextWidth(text: string, fontSize = 12) {
  return text.length * fontSize * 0.62;
}

function reportDateLabel(reportedAt: string, language: 'en' | 'km') {
  return new Intl.DateTimeFormat(localeFor(language), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(reportedAt));
}

function leadTimeSummary(insight: SistSkuInsight, language: 'en' | 'km') {
  return `${formatDurationAuto(insight.leadTime.meanDays, 'day', language, 'short')} ± ${formatDurationAuto(
    insight.leadTime.stdDays,
    'day',
    language,
    'short',
  )}`;
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
    return `Likely stockout in ${formatDurationAuto(insight.daysOfCover, 'day', language)}`;
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
      insight.daysOfCover == null
        ? 'limited cover visibility'
        : `${formatDurationAuto(insight.daysOfCover, 'day', language)} left`
    }.`,
    `Reorder point is ${formatQuantityForDisplay(insight.reorderPoint, language)} units and lead time centers on ${leadTimeSummary(
      insight,
      language,
    )}.`,
    linkedServiceCount > 0
      ? `${formatWholeNumber(linkedServiceCount, language)} ${
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
        ? `Order ${formatWholeNumber(lowerOrder, language)}–${formatWholeNumber(upperOrder, language)} units today.`
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
      `${t('catalogSkuRecentReportsStockAdjusted')} ${formatWholeNumber(
        currentSku.unitsInStock,
        language,
      )} -> ${formatWholeNumber(observation.unitsInStock, language)}`,
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

function deriveHistoricalPoints({
  skuId,
  currentUnits,
  reports,
}: {
  skuId: string;
  currentUnits: number;
  reports: StockReport[];
}): HistoricalPoint[] {
  const now = new Date();
  const trailingStart = new Date(now);
  trailingStart.setFullYear(now.getFullYear() - 1);

  const reportPoints = reports
    .map((report) => {
      const observation = report.skuObservations.find((entry) => entry.skuId === skuId);
      if (!observation) {
        return null;
      }

      return {
        date: new Date(report.reportedAt),
        units: observation.unitsInStock,
      };
    })
    .filter((point): point is HistoricalPoint => Boolean(point))
    .filter((point) => point.date >= trailingStart)
    .sort((left, right) => left.date.getTime() - right.date.getTime());

  const currentPoint = {
    date: now,
    units: currentUnits,
  };

  return [...reportPoints, currentPoint];
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
  return state;
}

function coverageBadgeTone(state: ImpactRow['coverageState']): StatusPillTone {
  if (state === 'blocked') {
    return 'danger';
  }
  if (state === 'at-risk') {
    return 'warning';
  }
  if (state === 'available') {
    return 'success';
  }
  return 'neutral';
}

function skuDetailStatusTone(state: ReturnType<typeof skuOperationalState>): StatusPillTone {
  if (state === 'at-risk' || state === 'reorder-soon') {
    return 'warning';
  }
  if (state === 'healthy') {
    return 'success';
  }
  if (state === 'overstocked') {
    return 'info';
  }
  return 'neutral';
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
  const height = 332;
  const padding = { top: 16, right: 18, bottom: 58, left: 64 };
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
  const yTicks = buildLinearAxisTicks(paddedMinY, paddedMaxY, 4);
  const yTickLabels = yTicks.map((tick) => formatQuantityForDisplay(tick, language));
  const yTickLabelX = padding.left - 10;
  const yAxisTitleX =
    yTickLabelX - Math.max(...yTickLabels.map((label) => estimateSvgTextWidth(label)), 0) - 26;
  const yAxisTitleY = padding.top + plotHeight / 2;
  const xAxisTitleX = padding.left + plotWidth / 2;
  const xTickLabelY = height - padding.bottom + 22;
  const xAxisTitleY = height - 4;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[1.75rem] border border-border/70 bg-background/85 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            14-day forecast
          </p>
          <DescriptionText className="mt-1 text-sm text-muted-foreground">
            Posterior units, demand band, reorder threshold, and lead-time arrival window.
          </DescriptionText>
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
        {yTicks.map((tick, index) => (
          <g key={`forecast-y-${index}`}>
            <line
              stroke="var(--border)"
              strokeDasharray="3 8"
              strokeWidth="1"
              x1={padding.left}
              x2={width - padding.right}
              y1={yScale(tick)}
              y2={yScale(tick)}
            />
            <text
              fill="var(--muted-foreground)"
              fontSize="12"
              textAnchor="end"
              x={yTickLabelX}
              y={yScale(tick) + 4}
            >
              {yTickLabels[index]}
            </text>
          </g>
        ))}
        <text
          fill="var(--muted-foreground)"
          fontSize="12"
          textAnchor="middle"
          transform={`rotate(-90 ${yAxisTitleX} ${yAxisTitleY})`}
          x={yAxisTitleX}
          y={yAxisTitleY}
        >
          Units
        </text>
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
              y={xTickLabelY}
            >
              {day === 0 ? 'Today' : `Day ${day}`}
            </text>
          </g>
        ))}
        <text fill="var(--muted-foreground)" fontSize="12" x={padding.left + 6} y={reorderY - 8}>
          Reorder point {formatQuantityForDisplay(insight.reorderPoint, language)}
        </text>
        <text
          fill="var(--muted-foreground)"
          fontSize="12"
          textAnchor="middle"
          x={xAxisTitleX}
          y={xAxisTitleY}
        >
          Days ahead
        </text>
        <line
          stroke="black"
          strokeWidth="1"
          x1={padding.left}
          x2={padding.left}
          y1={padding.top}
          y2={height - padding.bottom}
        />
        <line
          stroke="black"
          strokeWidth="1"
          x1={padding.left}
          x2={width - padding.right}
          y1={height - padding.bottom}
          y2={height - padding.bottom}
        />
      </svg>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span>
          Arrival window: {formatDurationAuto(leadWindowStart, 'day', language, 'short')}-
          {formatDurationAuto(leadWindowEnd, 'day', language, 'short')}
        </span>
        <span>
          Posterior units: {formatWholeNumber(insight.latestPosteriorUnits, language)}
        </span>
        <span>
          Expected demand/day: {formatDemandRate(insight.expectedDemandPerDay, language)}
        </span>
      </div>
    </div>
  );
}

function HistoricalOverviewChart({
  points,
  language,
}: {
  points: HistoricalPoint[];
  language: 'en' | 'km';
}) {
  const width = 720;
  const height = 332;
  const padding = { top: 18, right: 18, bottom: 60, left: 64 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const firstDate = points[0]?.date ?? new Date();
  const lastDate = points[points.length - 1]?.date ?? new Date();
  const dateSpan = Math.max(lastDate.getTime() - firstDate.getTime(), 1);
  const maxUnits = Math.max(...points.map((point) => point.units), 1);
  const minUnits = Math.min(...points.map((point) => point.units), 0);
  const paddedMaxUnits = maxUnits * 1.1;
  const paddedMinUnits = Math.max(0, minUnits - Math.max(1, minUnits * 0.1));

  const xScale = (date: Date) =>
    padding.left + ((date.getTime() - firstDate.getTime()) / dateSpan) * plotWidth;
  const yScale = (units: number) =>
    padding.top + ((paddedMaxUnits - units) / Math.max(paddedMaxUnits - paddedMinUnits, 1)) * plotHeight;

  const linePath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${xScale(point.date)} ${yScale(point.units)}`)
    .join(' ');
  const areaPath = `${linePath} L ${xScale(lastDate)} ${yScale(paddedMinUnits)} L ${xScale(firstDate)} ${yScale(
    paddedMinUnits,
  )} Z`;

  const midDate = new Date((firstDate.getTime() + lastDate.getTime()) / 2);
  const xTicks = [
    { date: firstDate, label: '-1y' },
    { date: midDate, label: '-6m' },
    { date: lastDate, label: 'Today' },
  ];
  const yTicks = buildLinearAxisTicks(paddedMinUnits, paddedMaxUnits, 4);
  const yTickLabels = yTicks.map((tick) => formatWholeNumber(tick, language));
  const yTickLabelX = padding.left - 10;
  const yAxisTitleX =
    yTickLabelX - Math.max(...yTickLabels.map((label) => estimateSvgTextWidth(label)), 0) - 26;
  const yAxisTitleY = padding.top + plotHeight / 2;
  const xAxisTitleX = padding.left + plotWidth / 2;
  const xTickLabelY = height - padding.bottom + 22;
  const xAxisTitleY = height - 4;

  return (
    <div className="overflow-hidden rounded-[1.75rem] border border-border/70 bg-background/85 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Trailing 1Y history
          </p>
          <DescriptionText className="mt-1 text-sm text-muted-foreground">
            Historical SKU unit observations across the last year, ending with the current on-hand count.
          </DescriptionText>
        </div>
        <div className="text-xs text-muted-foreground">
          Units now: {formatWholeNumber(points[points.length - 1]?.units ?? 0, language)}
        </div>
      </div>
      <svg aria-label="SKU historical chart" className="mt-4 h-[300px] w-full" viewBox={`0 0 ${width} ${height}`}>
        <rect height={height} rx="24" width={width} fill="transparent" />
        <path d={areaPath} fill="color-mix(in oklab, var(--chart-1) 10%, transparent)" />
        <path
          d={linePath}
          fill="none"
          stroke="var(--chart-1)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="4"
        />
        {yTicks.map((tick, index) => (
          <g key={`history-y-${index}`}>
            <line
              stroke="var(--border)"
              strokeDasharray="3 8"
              strokeWidth="1"
              x1={padding.left}
              x2={width - padding.right}
              y1={yScale(tick)}
              y2={yScale(tick)}
            />
            <text
              fill="var(--muted-foreground)"
              fontSize="12"
              textAnchor="end"
              x={yTickLabelX}
              y={yScale(tick) + 4}
            >
              {yTickLabels[index]}
            </text>
          </g>
        ))}
        <text
          fill="var(--muted-foreground)"
          fontSize="12"
          textAnchor="middle"
          transform={`rotate(-90 ${yAxisTitleX} ${yAxisTitleY})`}
          x={yAxisTitleX}
          y={yAxisTitleY}
        >
          Units
        </text>
        {xTicks.map((tick) => (
          <g key={tick.label}>
            <line
              stroke="var(--border)"
              strokeDasharray="3 8"
              strokeWidth="1"
              x1={xScale(tick.date)}
              x2={xScale(tick.date)}
              y1={padding.top}
              y2={height - padding.bottom}
            />
            <text
              fill="var(--muted-foreground)"
              fontSize="12"
              textAnchor="middle"
              x={xScale(tick.date)}
              y={xTickLabelY}
            >
              {tick.label}
            </text>
          </g>
        ))}
        <text
          fill="var(--muted-foreground)"
          fontSize="12"
          textAnchor="middle"
          x={xAxisTitleX}
          y={xAxisTitleY}
        >
          Time
        </text>
        <line
          stroke="black"
          strokeWidth="1"
          x1={padding.left}
          x2={padding.left}
          y1={padding.top}
          y2={height - padding.bottom}
        />
        <line
          stroke="black"
          strokeWidth="1"
          x1={padding.left}
          x2={width - padding.right}
          y1={height - padding.bottom}
          y2={height - padding.bottom}
        />
      </svg>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span>Window: trailing 12 months</span>
        <span>Observed points: {formatWholeNumber(points.length, language)}</span>
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
          <DescriptionText className="mt-1 text-sm text-muted-foreground">
            Limiting services are pinned first so the operational blast radius is obvious.
          </DescriptionText>
        </div>
        <p className="text-sm text-muted-foreground">
          {formatWholeNumber(impactRows.length, language)} linked
        </p>
      </div>
      {impactRows.length > 0 ? (
        <div className="mt-4 divide-y divide-border/60">
          {impactRows.map((impact) => (
            <Link
              className="group flex flex-wrap items-start justify-between gap-3 py-4 first:pt-0 last:pb-0 hover:text-primary"
              key={impact.serviceId}
              to={`/catalog/services/${impact.serviceId}`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{impact.name}</p>
                  <Badge
                    className={cn(
                      'rounded-full',
                      statusPillClassName(coverageBadgeTone(coverageBadgeVariant(impact.coverageState))),
                    )}
                    variant="outline"
                  >
                    {impact.coverageLabel}
                  </Badge>
                  {impact.isLimitingComponent ? (
                    <Badge variant="secondary">Limiting component</Badge>
                  ) : null}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Sellable units: {formatWholeNumber(impact.sellableUnits, language)}
                </p>
              </div>
              <span className="mt-1 inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 group-hover:bg-secondary group-hover:text-foreground">
                <ChevronRight className="size-4 transition-transform duration-150 group-hover:translate-x-0.5" />
              </span>
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
  const [showAllReports, setShowAllReports] = useState(false);
  const visibleReports = showAllReports ? reports : reports.slice(0, 5);

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
        {reports.length > 5 ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => setShowAllReports((current) => !current)}
          >
            {showAllReports ? 'Show fewer' : 'Show all'}
          </Button>
        ) : null}
      </div>
      {reports.length > 5 && !showAllReports ? (
        <p className="mt-3 text-sm text-muted-foreground">Showing the 5 most recent related reports.</p>
      ) : null}
      {reports.length > 0 ? (
        <div className="mt-4 divide-y divide-border/60">
          {visibleReports.map((report) => {
            const notes = summarizeNotes(report.notes) ?? t('stockHistoryNoNotes');

            return (
              <div className="py-4 first:pt-0 last:pb-0" key={report.reportId}>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{reportDateLabel(report.reportedAt, language)}</Badge>
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

function gaussianDensity(x: number, mean: number, sigma: number) {
  const safeSigma = Math.max(sigma, 0.05);
  const exponent = -((x - mean) ** 2) / (2 * safeSigma ** 2);
  return Math.exp(exponent) / (safeSigma * Math.sqrt(2 * Math.PI));
}

function demandCoverageLabel(daysOfCover: number | null, t: (key: TranslationKey) => string) {
  if (daysOfCover == null || daysOfCover <= 0) {
    return t('catalogSkuParametersNoInventoryRemaining');
  }
  if (daysOfCover <= 2) {
    return t('catalogSkuParametersCriticalCoverRemaining');
  }
  if (daysOfCover <= 5) {
    return t('catalogSkuParametersCoverageThin');
  }
  return t('catalogSkuParametersCoverageStable');
}

function parameterRiskTone(stockoutRisk: number): StatusPillTone {
  if (stockoutRisk >= 0.65) {
    return 'danger';
  }
  if (stockoutRisk >= 0.35) {
    return 'warning';
  }
  if (stockoutRisk >= 0.15) {
    return 'info';
  }
  return 'success';
}

function demandCoverageTone(daysOfCover: number | null): StatusPillTone {
  if (daysOfCover == null || daysOfCover <= 0) {
    return 'danger';
  }
  if (daysOfCover <= 2) {
    return 'warning';
  }
  if (daysOfCover <= 5) {
    return 'info';
  }
  return 'success';
}

function parameterRiskColor(stockoutRisk: number) {
  const tone = parameterRiskTone(stockoutRisk);
  return statusToneColor(tone);
}

function statusToneColor(tone: StatusPillTone) {
  if (tone === 'danger') {
    return 'var(--destructive)';
  }
  if (tone === 'warning') {
    return 'var(--color-chart-3)';
  }
  if (tone === 'info') {
    return 'var(--color-chart-1)';
  }
  return 'var(--color-chart-2)';
}

function buildDemandHistogram(values: number[], binCount = 12): DemandHistogramBin[] {
  return buildDemandHistogramInDomain(values, undefined, binCount);
}

function buildDemandHistogramInDomain(values: number[], domain?: DomainRange, binCount = 12): DemandHistogramBin[] {
  if (values.length === 0 && !domain) {
    return [];
  }

  const minValue = values.length > 0 ? Math.min(...values) : (domain?.min ?? 0);
  const maxValue = values.length > 0 ? Math.max(...values) : (domain?.max ?? 1);
  const rawRange = Math.max((domain?.max ?? maxValue) - (domain?.min ?? minValue), Math.max(Math.abs(maxValue) * 0.1, 1));
  const paddedMin = domain ? domain.min : Math.max(0, minValue - rawRange * 0.08);
  const paddedMax = domain ? domain.max : maxValue + rawRange * 0.08;
  const step = Math.max((paddedMax - paddedMin) / binCount, 0.1);

  const bins = Array.from({ length: binCount }, (_, index) => ({
    start: paddedMin + step * index,
    end: paddedMin + step * (index + 1),
    count: 0,
  }));

  values.forEach((value) => {
    if (value < paddedMin || value > paddedMax) {
      return;
    }
    const normalizedIndex = Math.min(
      bins.length - 1,
      Math.max(0, Math.floor((value - paddedMin) / step)),
    );
    bins[normalizedIndex].count += 1;
  });

  return bins;
}

function buildFittedDemandCurve({
  mean,
  sigma,
  min,
  max,
  points = 48,
}: {
  mean: number;
  sigma: number;
  min: number;
  max: number;
  points?: number;
}) {
  const domainMin = Math.max(0, min);
  const domainMax = Math.max(domainMin + 0.1, max);

  return Array.from({ length: points }, (_, index) => {
    const ratio = index / Math.max(points - 1, 1);
    const x = domainMin + ratio * (domainMax - domainMin);
    return {
      x,
      y: gaussianDensity(x, mean, sigma),
    };
  });
}

function trimDensityCurve(points: DemandDensityPoint[], thresholdRatio = 0.12) {
  if (points.length === 0) {
    return points;
  }

  const maxY = Math.max(...points.map((point) => point.y), 0);
  if (maxY <= 0) {
    return [];
  }

  const threshold = maxY * thresholdRatio;
  const firstVisibleIndex = points.findIndex((point) => point.y >= threshold);
  if (firstVisibleIndex === -1) {
    return [];
  }

  let lastVisibleIndex = points.length - 1;
  while (lastVisibleIndex >= 0 && points[lastVisibleIndex].y < threshold) {
    lastVisibleIndex -= 1;
  }

  const start = Math.max(0, firstVisibleIndex - 1);
  const end = Math.min(points.length, lastVisibleIndex + 2);
  return points.slice(start, end);
}

function quantile(values: number[], ratio: number) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = (sorted.length - 1) * ratio;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) {
    return sorted[lower];
  }
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function buildKernelDensityCurve({
  values,
  min,
  max,
  points = 56,
  bandwidth,
}: {
  values: number[];
  min: number;
  max: number;
  points?: number;
  bandwidth: number;
}) {
  if (values.length === 0) {
    return [];
  }

  const safeBandwidth = Math.max(bandwidth, 0.1);
  return Array.from({ length: points }, (_, index) => {
    const ratio = index / Math.max(points - 1, 1);
    const x = min + ratio * (max - min);
    const y =
      values.reduce((sum, value) => {
        const distance = (x - value) / safeBandwidth;
        return sum + Math.exp(-0.5 * distance * distance);
      }, 0) /
      values.length;

    return { x, y };
  });
}

function ParameterBoardSection({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('min-w-0', className)}>
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        {title}
      </p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ParameterRiskDial({
  stockoutRisk,
  daysOfCover,
  language,
  t,
}: {
  stockoutRisk: number;
  daysOfCover: number | null;
  language: 'en' | 'km';
  t: (key: TranslationKey) => string;
}) {
  const size = 204;
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  const riskPercent = Math.max(0, Math.min(100, stockoutRisk * 100));
  const toneColor = parameterRiskColor(stockoutRisk);
  const dashOffset = circumference * (1 - riskPercent / 100);
  const coverLabel = demandCoverageLabel(daysOfCover, t);
  const coverTone = demandCoverageTone(daysOfCover);
  const coverToneColor = statusToneColor(coverTone);

  return (
    <ParameterBoardSection title={t('catalogStockoutRisk')} className="h-full">
      <div className="flex flex-col items-center text-center">
        <div className="relative">
          <svg aria-label="Stockout risk dial" className="size-[204px]" viewBox={`0 0 ${size} ${size}`}>
            <circle
              cx={center}
              cy={center}
              fill="none"
              r={radius}
              stroke={coverToneColor}
              strokeWidth={strokeWidth}
            />
            <circle
              cx={center}
              cy={center}
              fill="none"
              r={radius}
              stroke={toneColor}
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              strokeWidth={strokeWidth}
              transform={`rotate(-90 ${center} ${center})`}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-[0.72rem] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Risk
            </p>
            <p className="mt-2 text-4xl font-semibold tracking-[-0.05em] text-foreground">
              {formatNumber(riskPercent, language)}%
            </p>
          </div>
        </div>
        <Badge
          className={cn('mt-4 rounded-full', statusPillClassName(coverTone))}
          variant="outline"
        >
          {coverLabel}
        </Badge>
      </div>
    </ParameterBoardSection>
  );
}

function ParameterStatStack({
  insight,
  language,
  t,
}: {
  insight: SistSkuInsight;
  language: 'en' | 'km';
  t: (key: TranslationKey) => string;
}) {
  const rows = [
    {
      label: t('catalogDaysOfCover'),
      value: insight.daysOfCover == null ? '—' : formatDurationAuto(insight.daysOfCover, 'day', language),
    },
    {
      label: t('catalogConfidence'),
      value: confidenceLabel(insight.confidence),
    },
    {
      label: t('catalogSkuDetailPosteriorUnits'),
      value: formatWholeNumber(insight.latestPosteriorUnits, language),
    },
  ];

  return (
    <ParameterBoardSection title="Supporting stats" className="h-full">
      <div className="space-y-4">
        {rows.map((row) => (
          <div key={row.label}>
            <p className="text-[0.72rem] uppercase tracking-[0.16em] text-muted-foreground">{row.label}</p>
            <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-foreground">{row.value}</p>
          </div>
        ))}
      </div>
    </ParameterBoardSection>
  );
}

function DemandDistributionChart({
  insight,
  detail,
  language,
  t,
}: {
  insight: SistSkuInsight;
  detail: SistSkuDetail | null;
  language: 'en' | 'km';
  t: (key: TranslationKey) => string;
}) {
  const intervalPoints = intervalDemandPerDay(detail?.intervalDemand);
  const hasEmpiricalIntervals = intervalPoints.length >= 5;
  const domain = buildDemandChartDomain(
    intervalPoints,
    insight.demandIntervalLow,
    insight.demandIntervalHigh,
  );
  const fittedSigma = Math.max(
    (insight.demandIntervalHigh - insight.demandIntervalLow) / 3.92,
    domain.sigmaFloor,
  );
  const empiricalMean =
    intervalPoints.length > 0
      ? intervalPoints.reduce((sum, value) => sum + value, 0) / intervalPoints.length
      : insight.expectedDemandPerDay;
  const empiricalSigma =
    intervalPoints.length > 1
      ? Math.sqrt(
          intervalPoints.reduce((sum, value) => sum + (value - empiricalMean) ** 2, 0) /
            (intervalPoints.length - 1),
        )
      : fittedSigma;
  const sourceValues = hasEmpiricalIntervals ? intervalPoints : [];
  const domainMin = domain.min;
  const domainMax = domain.max;
  const filteredIntervalPoints = intervalPoints.filter((value) => value >= domainMin && value <= domainMax);
  const histogramBins = hasEmpiricalIntervals
    ? buildDemandHistogramInDomain(filteredIntervalPoints, domain, 12)
    : buildDemandHistogramInDomain(
        buildFittedDemandCurve({
          mean: insight.expectedDemandPerDay,
          sigma: fittedSigma,
          min: domainMin,
          max: domainMax,
          points: 96,
        }).flatMap((point) => Array.from({ length: Math.max(0, Math.round(point.y * 60)) }, () => point.x)),
        domain,
        12,
      );
  const densitySamples = hasEmpiricalIntervals
    ? filteredIntervalPoints
    : buildFittedDemandCurve({
        mean: insight.expectedDemandPerDay,
        sigma: fittedSigma,
        min: domainMin,
        max: domainMax,
        points: 72,
      }).flatMap((point) => Array.from({ length: Math.max(1, Math.round(point.y * 120)) }, () => point.x));
  const rawCurve = buildKernelDensityCurve({
    values: densitySamples,
    min: histogramBins[0]?.start ?? domainMin,
    max: histogramBins[histogramBins.length - 1]?.end ?? domainMax,
    bandwidth: Math.max((domainMax - domainMin) / 10, fittedSigma * 0.8, domain.bandwidthFloor),
  });
  const curve = trimDensityCurve(rawCurve);
  const visibleHistogramBins = histogramBins.filter((bin) => bin.count > 0);

  const width = 760;
  const height = 356;
  const padding = { top: 96, right: 18, bottom: 68, left: 72 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxBinCount = Math.max(...histogramBins.map((bin) => bin.count), 1);
  const maxCurve = Math.max(...curve.map((point) => point.y), 1);
  const domainStart = visibleHistogramBins[0]?.start ?? histogramBins[0]?.start ?? domainMin;
  const domainEnd =
    visibleHistogramBins[visibleHistogramBins.length - 1]?.end ??
    histogramBins[histogramBins.length - 1]?.end ??
    domainMax;
  const domainSpan = Math.max(domainEnd - domainStart, 0.0001);

  const xScale = (value: number) =>
    padding.left + (((value - domainStart) / domainSpan) * plotWidth);
  const yScaleBin = (count: number) => padding.top + (1 - count / maxBinCount) * plotHeight;
  const curveToHistogramHeight = (density: number) => (density / maxCurve) * maxBinCount;
  const yScaleCurve = (density: number) =>
    padding.top + (1 - curveToHistogramHeight(density) / maxBinCount) * plotHeight;
  const histogramLeftEdge =
    visibleHistogramBins.length > 0 ? xScale(visibleHistogramBins[0].start) + 2 : xScale(domainMin);
  const histogramRightEdge =
    visibleHistogramBins.length > 0
      ? xScale(visibleHistogramBins[visibleHistogramBins.length - 1].end) - 2
      : xScale(domainMax);
  const densityBaselineY = height - padding.bottom;
  const clampedCurve = curve.map((point, index) => ({
    ...point,
    screenX:
      index === 0
        ? histogramLeftEdge
        : index === curve.length - 1
          ? histogramRightEdge
          : Math.min(Math.max(xScale(point.x), histogramLeftEdge), histogramRightEdge),
  }));
  const curvePath = clampedCurve
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.screenX} ${yScaleCurve(point.y)}`)
    .join(' ');
  const curveFillPath =
    clampedCurve.length > 1
      ? [
          `M ${histogramLeftEdge} ${densityBaselineY}`,
          ...clampedCurve.map((point) => `L ${point.screenX} ${yScaleCurve(point.y)}`),
          `L ${histogramRightEdge} ${densityBaselineY}`,
          'Z',
        ].join(' ')
      : '';

  const markers = [
    {
      key: 'low',
      value: insight.demandIntervalLow,
      label: 'Low',
      valueLabel: formatDemandRate(insight.demandIntervalLow, language),
      color: 'var(--muted-foreground)',
      dash: '6 6',
    },
    {
      key: 'expected',
      value: insight.expectedDemandPerDay,
      label: t('catalogSkuParametersExpectedDemand'),
      valueLabel: formatDemandRate(insight.expectedDemandPerDay, language),
      color: 'var(--chart-1)',
      dash: undefined,
    },
    {
      key: 'high',
      value: insight.demandIntervalHigh,
      label: 'High',
      valueLabel: formatDemandRate(insight.demandIntervalHigh, language),
      color: 'var(--muted-foreground)',
      dash: '6 6',
    },
  ];
  const markerRows = [
    { labelY: 24, valueY: 38 },
    { labelY: 50, valueY: 64 },
    { labelY: 76, valueY: 90 },
  ];
  const markerBaseLayout = markers.map((marker) => {
    const textWidth = Math.max(marker.label.length * 7.2, marker.valueLabel.length * 7.8);
    const halfWidth = textWidth / 2;
    const minX = padding.left + halfWidth + 4;
    const maxX = width - padding.right - halfWidth - 4;
    const x = xScale(marker.value);

    if (marker.key === 'low') {
      return {
        ...marker,
        x,
        textWidth,
        halfWidth,
        minX,
        maxX,
        labelX: Math.max(minX, x - 18),
        labelY: markerRows[1].labelY,
        valueY: markerRows[1].valueY,
        textAnchor: 'end' as const,
      };
    }

    if (marker.key === 'high') {
      return {
        ...marker,
        x,
        textWidth,
        halfWidth,
        minX,
        maxX,
        labelX: Math.min(maxX, x + 18),
        labelY: markerRows[1].labelY,
        valueY: markerRows[1].valueY,
        textAnchor: 'start' as const,
      };
    }

    return {
      ...marker,
      x,
      textWidth,
      halfWidth,
      minX,
      maxX,
      labelX: Math.min(Math.max(x, minX), maxX),
      labelY: markerRows[1].labelY,
      valueY: markerRows[1].valueY,
      textAnchor: 'middle' as const,
    };
  });
  const lowMarker = markerBaseLayout.find((marker) => marker.key === 'low');
  const expectedMarker = markerBaseLayout.find((marker) => marker.key === 'expected');
  const highMarker = markerBaseLayout.find((marker) => marker.key === 'high');
  const markerCollisionGap = 14;

  if (lowMarker && expectedMarker) {
    const lowRightEdge = lowMarker.labelX;
    const expectedLeftEdge = expectedMarker.labelX - expectedMarker.halfWidth;
    if (expectedLeftEdge - lowRightEdge < markerCollisionGap) {
      lowMarker.labelX = Math.max(lowMarker.minX, expectedLeftEdge - markerCollisionGap);
      expectedMarker.labelY = markerRows[0].labelY;
      expectedMarker.valueY = markerRows[0].valueY;
    }
  }

  if (expectedMarker && highMarker) {
    const expectedRightEdge = expectedMarker.labelX + expectedMarker.halfWidth;
    const highLeftEdge = highMarker.labelX;
    if (highLeftEdge - expectedRightEdge < markerCollisionGap) {
      highMarker.labelX = Math.min(highMarker.maxX, expectedRightEdge + markerCollisionGap);
      expectedMarker.labelY = markerRows[0].labelY;
      expectedMarker.valueY = markerRows[0].valueY;
    }
  }

  if (lowMarker && highMarker) {
    const lowRightEdge = lowMarker.labelX;
    const highLeftEdge = highMarker.labelX;
    if (highLeftEdge - lowRightEdge < markerCollisionGap) {
      lowMarker.labelY = markerRows[2].labelY;
      lowMarker.valueY = markerRows[2].valueY;
      highMarker.labelY = markerRows[1].labelY;
      highMarker.valueY = markerRows[1].valueY;
    }
  }

  const markerLabelLayout = markerBaseLayout;
  const minimumXAxisTickCount = 4;
  const yTicks = buildLinearAxisTicks(0, maxBinCount, 4);
  const yAxisTitleY = padding.top + plotHeight / 2;
  const xAxisTitleX = padding.left + plotWidth / 2;
  const xTickLabelY = height - padding.bottom + 22;
  const xAxisTitleY = height - 6;
  const axisTickValues = Array.from({ length: minimumXAxisTickCount }, (_, index) => {
    const ratio = index / Math.max(minimumXAxisTickCount - 1, 1);
    return domainStart + ratio * (domainEnd - domainStart);
  });
  const axisTicks = axisTickValues.map((value, index) => ({
    key: `axis-${index}`,
    value,
    label: formatDemandRate(value, language),
    x: xScale(value),
  }));
  const axisTickLayout = axisTicks.reduce<
    Array<{
      key: string;
      value: number;
      label: string;
      x: number;
      labelX: number;
      labelY: number;
      textAnchor: 'start' | 'middle' | 'end';
    }>
  >((placed, tick, index) => {
    const previous = placed[placed.length - 1];
    const labelWidth = Math.max(tick.label.length * 7.2, 36);
    let labelX = tick.x;
    let textAnchor: 'start' | 'middle' | 'end' =
      index === 0 ? 'start' : index === axisTicks.length - 1 ? 'end' : 'middle';

    if (textAnchor === 'start') {
      labelX = padding.left;
    } else if (textAnchor === 'end') {
      labelX = width - padding.right;
    }

    if (previous) {
      const previousRightEdge =
        previous.textAnchor === 'start'
          ? previous.labelX + Math.max(previous.label.length * 7.2, 36)
          : previous.textAnchor === 'middle'
            ? previous.labelX + Math.max(previous.label.length * 7.2, 36) / 2
            : previous.labelX;
      const currentLeftEdge =
        textAnchor === 'start'
          ? labelX
          : textAnchor === 'middle'
            ? labelX - labelWidth / 2
            : labelX - labelWidth;

      if (currentLeftEdge - previousRightEdge < 16) {
        labelX = Math.max(previousRightEdge + 16 + labelWidth / 2, labelX);
        textAnchor = 'middle';
      }
    }

    return [
      ...placed,
      {
        ...tick,
        labelX,
        labelY: xTickLabelY,
        textAnchor,
      },
    ];
  }, []);
  const yTickLabels = yTicks.map((tick) => formatWholeNumber(tick, language));
  const yTickLabelX = padding.left - 10;
  const yAxisTitleX =
    yTickLabelX - Math.max(...yTickLabels.map((label) => estimateSvgTextWidth(label)), 0) - 26;

  return (
    <ParameterBoardSection title={t('catalogSkuParametersDemandAnalysis')} className="h-full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DescriptionText className="text-sm text-muted-foreground">
          Observed interval demand with SIST&apos;s current fitted range.
        </DescriptionText>
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="size-2 rounded-full bg-[color-mix(in_oklab,var(--chart-2)_45%,white)]" />
            {t('catalogSkuParametersObservedIntervals')}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-2 rounded-full bg-[var(--chart-1)]" />
            {t('catalogSkuParametersExpectedDemand')}
          </span>
        </div>
      </div>
      <svg aria-label="Demand analysis chart" className="mt-4 h-[320px] w-full" viewBox={`0 0 ${width} ${height}`}>
        {yTicks.map((tick, index) => (
          <g key={`demand-y-${index}`}>
            <line
              stroke="var(--border)"
              strokeDasharray="3 8"
              strokeWidth="1"
              x1={padding.left}
              x2={width - padding.right}
              y1={yScaleBin(tick)}
              y2={yScaleBin(tick)}
            />
            <text
              fill="var(--muted-foreground)"
              fontSize="12"
              textAnchor="end"
              x={yTickLabelX}
              y={yScaleBin(tick) + 4}
            >
              {yTickLabels[index]}
            </text>
          </g>
        ))}
        <text
          fill="var(--muted-foreground)"
          fontSize="12"
          textAnchor="middle"
          transform={`rotate(-90 ${yAxisTitleX} ${yAxisTitleY})`}
          x={yAxisTitleX}
          y={yAxisTitleY}
        >
          Frequency
        </text>
        {histogramBins.map((bin, index) => {
          if (bin.count <= 0) {
            return null;
          }

          const x = index === 0 ? xScale(bin.start) : xScale(bin.start) + 2;
          const nextX =
            index === histogramBins.length - 1 ? xScale(bin.end) : xScale(histogramBins[index + 1].start);
          const y = yScaleBin(bin.count);
          const barHeight = height - padding.bottom - y;

          return (
            <rect
              key={`${bin.start}-${bin.end}`}
              fill="color-mix(in oklab, var(--chart-2) 22%, transparent)"
              height={Math.max(barHeight, 2)}
              rx="8"
              width={Math.max(nextX - x - (index === 0 ? 2 : 4), 8)}
              x={x}
              y={y}
            />
          );
        })}
        {curve.length > 1 ? (
          <>
            <path
              d={curveFillPath}
              fill="color-mix(in oklab, black 8%, transparent)"
            />
            <path
              d={curvePath}
              fill="none"
              stroke="color-mix(in oklab, black 68%, var(--foreground) 32%)"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.5"
            />
          </>
        ) : null}
        {markerLabelLayout.map((marker) => (
          <g key={marker.key}>
            <line
              stroke={marker.color}
              strokeDasharray={marker.dash}
              strokeWidth={marker.key === 'expected' ? 2.5 : 1.5}
              x1={xScale(marker.value)}
              x2={xScale(marker.value)}
              y1={padding.top}
              y2={height - padding.bottom}
            />
            <text
              fill="var(--muted-foreground)"
              fontSize="11"
              textAnchor={marker.textAnchor}
              x={marker.labelX}
              y={marker.labelY}
            >
              {marker.label}
            </text>
            <text
              fill={marker.key === 'expected' ? 'var(--chart-1)' : 'var(--muted-foreground)'}
              fontSize="11"
              fontWeight="600"
              textAnchor={marker.textAnchor}
              x={marker.labelX}
              y={marker.valueY}
            >
              {marker.valueLabel}
            </text>
          </g>
        ))}
        {[insight.demandIntervalLow, insight.demandIntervalHigh].map((value, index) => (
          <line
            key={`axis-marker-${index}`}
            stroke="var(--muted-foreground)"
            strokeWidth="2"
            x1={xScale(value)}
            x2={xScale(value)}
            y1={height - padding.bottom}
            y2={height - padding.bottom + 8}
          />
        ))}
        {axisTickLayout.map((tick) =>
          tick ? (
            <text
              key={tick.key}
              fill="var(--muted-foreground)"
              fontSize="12"
              textAnchor={tick.textAnchor}
              x={tick.labelX}
              y={tick.labelY}
            >
              {tick.label}
            </text>
          ) : null,
        )}
        <text
          fill="var(--muted-foreground)"
          fontSize="12"
          textAnchor="middle"
          x={xAxisTitleX}
          y={xAxisTitleY}
        >
          Demand/day
        </text>
        <line
          stroke="black"
          strokeWidth="1"
          x1={padding.left}
          x2={padding.left}
          y1={padding.top}
          y2={height - padding.bottom}
        />
        <line
          stroke="black"
          strokeWidth="1"
          x1={padding.left}
          x2={width - padding.right}
          y1={height - padding.bottom}
          y2={height - padding.bottom}
        />
      </svg>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <div className="min-w-0 flex-1 space-y-1">
          <p>
            {t('catalogSkuParametersDemandInterval')}: {formatDemandRate(insight.demandIntervalLow, language)}–{formatDemandRate(
              insight.demandIntervalHigh,
              language,
            )}/day
          </p>
          <p>
            {detail?.reorderPolicy
              ? `Target service level ${formatNumber(detail.reorderPolicy.targetServiceLevel * 100, language)}% with expected lead-time demand of ${formatQuantityForDisplay(detail.reorderPolicy.expectedLeadTimeDemand, language)} units.`
              : 'Derived from the current insight and latest SIST detail when available.'}
          </p>
        </div>
        <p>{t('catalogSkuParametersConfidenceInterval')}</p>
      </div>
    </ParameterBoardSection>
  );
}

function ParametersPanel({
  skuId,
  insight,
  detail,
  language,
  t,
}: {
  skuId: string;
  insight: SistSkuInsight | null;
  detail: SistSkuDetail | null;
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

  const leadTimeSourceLabel =
    insight.leadTime.source === 'manual'
      ? 'manual'
      : insight.leadTime.source === 'inferred'
        ? 'inferred'
        : 'fallback';

  return (
    <div className="rounded-[1.75rem] border border-border/70 bg-background/65 p-4 sm:p-5">
      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="min-w-0 xl:border-r xl:border-border/60 xl:pr-5">
          <div className="grid gap-5 xl:grid-rows-[auto_1fr]">
            <ParameterRiskDial
              daysOfCover={insight.daysOfCover}
              language={language}
              stockoutRisk={insight.stockoutRisk}
              t={t}
            />
            <div className="pt-5">
              <ParameterStatStack insight={insight} language={language} t={t} />
            </div>
          </div>
        </div>

        <div className="min-w-0">
          <div className="grid gap-5 xl:grid-rows-[auto_1fr]">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(260px,0.92fr)] xl:self-start">
              <div className="min-w-0">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  {t('catalogSkuLeadTimeSummary')}
                </p>
                <div className="mt-4 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-3xl font-semibold tracking-[-0.05em] text-foreground">
                      {leadTimeSummary(insight, language)}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {t('catalogSkuParametersLeadTimeAverage')}
                    </p>
                  </div>
                  <Badge asChild variant="outline">
                    <Link to={`/catalog/skus/${skuId}/edit`}>{leadTimeSourceLabel}</Link>
                  </Badge>
                </div>
                <div className="mt-3 text-sm text-muted-foreground">
                  <p>
                    {t('catalogSkuParametersCurrentThreshold')}: {formatNumber(insight.reorderTriggerProbability * 100, language)}%
                  </p>
                </div>
              </div>
              <div className="min-w-0 xl:border-l xl:border-border/60 xl:pl-5">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  {t('catalogReorderPoint')}
                </p>
                <div className="mt-4">
                  <p className="text-3xl font-semibold tracking-[-0.05em] text-foreground">
                    {formatQuantityForDisplay(insight.reorderPoint, language)}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t('catalogSkuParametersCurrentThreshold')}
                  </p>
                  {detail?.reorderPolicy ? (
                    <p className="mt-3 text-sm text-muted-foreground">
                      Safety stock: {formatQuantityForDisplay(detail.reorderPolicy.safetyStock, language)}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="border-t border-border/60 pt-5">
              <DemandDistributionChart detail={detail} insight={insight} language={language} t={t} />
            </div>
          </div>
        </div>
      </div>
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
    traceRenderer('sku-detail', 'state-snapshot', {
      skuId: skuId ?? null,
      hasSku: Boolean(sku),
      detailLoading,
      hasDetail: Boolean(skuDetail),
      detailError,
    });
  }, [detailError, detailLoading, sku, skuDetail, skuId]);

  useEffect(() => {
    let cancelled = false;

    if (!skuId || !sku) {
      traceRenderer('sku-detail', 'detail-effect-skip', {
        skuId: skuId ?? null,
        hasSku: Boolean(sku),
      });
      return;
    }

    traceRenderer('sku-detail', 'detail-effect-start', {
      skuId,
      source: 'SkuDetailRoute.useEffect',
    });
    setDetailLoading(true);
    setDetailError(null);

    loadSistSkuDetail(skuId)
      .then((nextDetail) => {
        if (!cancelled) {
          traceRenderer('sku-detail', 'detail-effect-success', {
            skuId,
            forecastPoints: nextDetail.forecastTrajectory.length,
            posteriorPoints: nextDetail.posteriorInventoryTrajectory.length,
          });
          setSkuDetail(nextDetail);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          traceRenderer('sku-detail', 'detail-effect-error', {
            skuId,
            error: error instanceof Error ? error.message : t('apiUnavailable'),
          });
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
      traceRenderer('sku-detail', 'detail-effect-cancel', { skuId });
    };
  }, [loadSistSkuDetail, sku, skuId, t]);

  const historyReports = useMemo(
    () =>
      [...(skuDetail?.reports ?? [])].sort(
        (left, right) => new Date(right.reportedAt).getTime() - new Date(left.reportedAt).getTime(),
      ),
    [skuDetail?.reports],
  );

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
  const historicalPoints = deriveHistoricalPoints({
    skuId: sku.skuId,
    currentUnits: sku.unitsInStock,
    reports: historyReports,
  });
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
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <RouteBackButton />
                <h1 className="min-w-0 font-heading text-base font-medium tracking-[-0.02em] text-foreground">
                  {sku.name}
                </h1>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-3">
                <Button asChild variant={recordStockActionVariant}>
                  <Link to={`/operations/session?step=observations&focusSku=${sku.skuId}`}>
                    <ClipboardPen className="size-4" />
                    {t('catalogSkuStockAction')}
                  </Link>
                </Button>
                <Button asChild variant={editSkuActionVariant}>
                  <Link to={`/catalog/skus/${sku.skuId}/edit`}>
                    <SquarePen className="size-4" />
                    {t('catalogSkuEditAction')}
                  </Link>
                </Button>
              </div>
            </div>
            <div className="mt-3 flex min-w-0 flex-wrap items-center gap-3">
              <Badge variant="outline">{`${t('fieldId')}: ${sku.skuId}`}</Badge>
              <Badge
                className={cn('rounded-full', statusPillClassName(skuDetailStatusTone(state)))}
                variant="outline"
              >
                {riskLabel}
              </Badge>
              <Badge variant="outline">{confidenceLabel(planningInsight?.confidence ?? 'low')} confidence</Badge>
            </div>
            <DescriptionText className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
              {sku.description || t('catalogSkuOverviewIdentityDescription')}
            </DescriptionText>
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
                {`${formatWholeNumber(sku.unitsInStock, language)} on hand · ${
                  planningInsight
                    ? `${formatNumber(planningInsight.stockoutRisk * 100, language)}% stockout risk · ${confidenceLabel(
                        planningInsight.confidence,
                      )} confidence`
                    : 'planning detail pending'
                } · ${formatWholeNumber(linkedServiceCount, language)} ${
                  linkedServiceCount === 1
                    ? t('catalogLinkedServicesAffectedSingular')
                    : t('catalogLinkedServicesAffectedPlural')
                }`}
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
            <TabsTrigger value="parameters">Statistics</TabsTrigger>
            <TabsTrigger value="forecast">Forecast</TabsTrigger>
            <TabsTrigger value="dependencies">Dependencies</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent className="mt-6" value="overview">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
              <div className="space-y-5">
                {historicalPoints.length > 1 ? (
                  <HistoricalOverviewChart language={language} points={historicalPoints} />
                ) : (
                  <div className="rounded-[1.75rem] border border-border/70 bg-background/65 p-5">
                    <p className="text-sm text-muted-foreground">
                      Historical observations are still sparse. Capture more stock updates to fill the trailing view.
                    </p>
                  </div>
                )}
                <div className="rounded-[1.75rem] border border-border/70 bg-background/65 p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                        Stock rail
                      </p>
                      <DescriptionText className="mt-1 text-sm text-muted-foreground">
                        Keep the core decision metrics in one glanceable strip.
                      </DescriptionText>
                    </div>
                    <Badge
                      className={cn(
                        'rounded-full',
                        statusPillClassName(sku.soldAsProduct ? 'success' : 'neutral'),
                      )}
                      variant="outline"
                    >
                      {sku.soldAsProduct ? t('inventorySoldAsProduct') : t('inventoryNotSoldAsProduct')}
                    </Badge>
                  </div>
                  <MetricStrip className="mt-4 rounded-none border-0 bg-transparent xl:grid-cols-5">
                    <MetricStripItem
                      className="px-0 sm:px-0 xl:pl-0 xl:pr-6"
                      detail={undefined}
                      label="On hand"
                      valueClassName="text-[clamp(1.75rem,1.7vw,2.65rem)]"
                      value={formatWholeNumber(sku.unitsInStock, language)}
                    />
                    <MetricStripItem
                      className="px-0 sm:px-0 xl:px-6"
                      detail={undefined}
                      label="Days left"
                      valueClassName="text-[clamp(1.75rem,1.7vw,2.65rem)]"
                      value={
                        planningInsight?.daysOfCover == null
                          ? '—'
                          : formatDurationAuto(planningInsight.daysOfCover, 'day', language, 'short')
                      }
                    />
                    <MetricStripItem
                      className="px-0 sm:px-0 xl:px-6"
                      detail={undefined}
                      label={t('catalogReorderPoint')}
                      valueClassName="text-[clamp(1.75rem,1.7vw,2.65rem)]"
                      value={
                        planningInsight == null
                          ? '—'
                          : formatQuantityForDisplay(planningInsight.reorderPoint, language)
                      }
                    />
                    <MetricStripItem
                      className="px-0 sm:px-0 xl:px-6"
                      detail={undefined}
                      label={t('fieldCostPerUnit')}
                      valueClassName="text-[clamp(1.75rem,1.7vw,2.65rem)]"
                      value={formatCurrency(sku.costPerUnit, currency, language)}
                    />
                    <MetricStripItem
                      className="px-0 sm:px-0 xl:pl-6 xl:pr-0"
                      detail={undefined}
                      label={t('fieldProductPrice')}
                      valueClassName="text-[clamp(1.75rem,1.7vw,2.65rem)]"
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
                <div className="mt-5 border-t border-border/60 pt-4" id="sku-forecast-why">
                  <p className="text-sm font-medium text-foreground">Why SIST thinks this</p>
                  <div className="mt-3 grid gap-3 text-sm leading-6 text-muted-foreground">
                    <p>
                      Posterior units start at {planningInsight ? formatWholeNumber(planningInsight.latestPosteriorUnits, language) : '—'} and drain using the current expected demand range.
                    </p>
                    <p>
                      Lead-time arrivals land around {planningInsight ? leadTimeSummary(planningInsight, language) : '—'}, while the reorder line stays fixed at {planningInsight ? formatQuantityForDisplay(planningInsight.reorderPoint, language) : '—'} units.
                    </p>
                  </div>
                </div>
              </div>
            </div>

          </TabsContent>

          <TabsContent className="mt-6" value="forecast">
            <div className="grid items-stretch gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)]">
              <div>
                {planningInsight ? (
                  <ForecastChart insight={planningInsight} language={language} />
                ) : (
                  <div className="rounded-[1.75rem] border border-border/70 bg-background/65 p-5">
                    <p className="text-sm text-muted-foreground">{t('catalogSkuPlanningSignalsEmpty')}</p>
                  </div>
                )}
              </div>
              <div className="flex h-full flex-col rounded-[1.75rem] border border-border/70 bg-background/70 p-5" id="sku-forecast-why">
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
            <ParametersPanel skuId={sku.skuId} detail={skuDetail} insight={planningInsight} language={language} t={t} />
          </TabsContent>
        </Tabs>
      </section>
    </WorkspacePage>
  );
}
