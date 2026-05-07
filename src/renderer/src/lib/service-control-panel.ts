import type {
  AppLanguage,
  InventorySnapshot,
  ServiceRecord,
  SistConfidence,
  SistSkuInsight,
  SkuRecord,
  StockReport,
} from '@shared/inventory';
import { DEFAULT_USD_TO_KHR_EXCHANGE_RATE } from '@shared/ipc';
import { formatCurrency, formatNumber, formatWholeNumber } from '@/lib/format';
import { computeServiceSellableUnits, serviceCoverageState, serviceLinkedSkus } from '@/lib/catalog';
import { translateUiLiteral } from '@/lib/translations';

export type ServiceHeartbeatState = 'available' | 'at-risk' | 'blocked' | 'unlinked';
export type ContributorHealth = 'healthy' | 'at-risk' | 'blocked';
export type TimelineEventType =
  | 'service-unavailable'
  | 'price-adjustment'
  | 'linked-sku-change'
  | 'ranking-update'
  | 'limiter-shift';

export interface RankedContributor {
  sku: SkuRecord;
  insight: SistSkuInsight | null;
  health: ContributorHealth;
  isHighRisk: boolean;
  isBlocked: boolean;
  isBottleneck: boolean;
  rank: number;
  probabilityLabel: string;
}

export interface FragilitySummary {
  currentState: ServiceHeartbeatState;
  nextLikelyLimiter: RankedContributor | null;
  disruptionWindowDays: number | null;
  confidence: SistConfidence;
}

export interface EconomicSummary {
  servicePrice: number;
  estimatedInputCost: number;
  grossMargin: number;
}

export interface TimelineEvent {
  report: StockReport;
  types: TimelineEventType[];
  summary: string;
  secondary: string | null;
}

function confidenceScore(confidence: SistConfidence) {
  if (confidence === 'high') {
    return 3;
  }
  if (confidence === 'medium') {
    return 2;
  }
  return 1;
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

function contributorHealth({
  sku,
  highRiskSkuIds,
}: {
  sku: SkuRecord;
  highRiskSkuIds: Set<string>;
}): ContributorHealth {
  if (sku.unitsInStock <= 0) {
    return 'blocked';
  }
  if (highRiskSkuIds.has(sku.skuId)) {
    return 'at-risk';
  }
  return 'healthy';
}

function rankingScore({
  sku,
  highRiskSkuIds,
}: {
  sku: SkuRecord;
  highRiskSkuIds: Set<string>;
}) {
  if (sku.unitsInStock <= 0) {
    return 0;
  }
  if (highRiskSkuIds.has(sku.skuId)) {
    return 1;
  }
  return 2;
}

function rankSkuSet({
  skus,
  snapshot,
  bottleneckSkuId,
}: {
  skus: SkuRecord[];
  snapshot: InventorySnapshot;
  bottleneckSkuId: string | null;
}): RankedContributor[] {
  const insightBySkuId = new Map(snapshot.sist.skuInsights.map((entry) => [entry.skuId, entry]));
  const highRiskSkuIds = new Set(snapshot.sist.highRiskSkuIds);
  const ranked = [...skus].sort((left, right) => {
    const leftScore = rankingScore({ sku: left, highRiskSkuIds });
    const rightScore = rankingScore({ sku: right, highRiskSkuIds });
    if (leftScore !== rightScore) {
      return leftScore - rightScore;
    }
    if (left.unitsInStock !== right.unitsInStock) {
      return left.unitsInStock - right.unitsInStock;
    }
    const nameDelta = left.name.localeCompare(right.name);
    if (nameDelta !== 0) {
      return nameDelta;
    }
    return left.skuId.localeCompare(right.skuId);
  });

  return ranked.map((sku, index) => {
    const insight = insightBySkuId.get(sku.skuId) ?? null;
    const health = contributorHealth({ sku, highRiskSkuIds });
    const stockoutRisk = insight?.stockoutRisk;
    const probabilityLabel =
      stockoutRisk != null
        ? `${formatNumber(stockoutRisk * 100, 'en')}% constraint risk`
        : `Derived rank #${index + 1}`;

    return {
      sku,
      insight,
      health,
      isHighRisk: highRiskSkuIds.has(sku.skuId),
      isBlocked: sku.unitsInStock <= 0,
      isBottleneck: bottleneckSkuId === sku.skuId,
      rank: index + 1,
      probabilityLabel,
    };
  });
}

export function currentServiceBottleneck(service: ServiceRecord, snapshot: InventorySnapshot) {
  const linkedSkus = serviceLinkedSkus(service, snapshot);
  const highRiskSkuIds = new Set(snapshot.sist.highRiskSkuIds);
  const blockedSku = linkedSkus.find((sku) => sku.unitsInStock <= 0) ?? null;
  if (blockedSku) {
    return blockedSku;
  }
  return linkedSkus.find((sku) => highRiskSkuIds.has(sku.skuId)) ?? null;
}

export function rankedServiceContributors(service: ServiceRecord, snapshot: InventorySnapshot) {
  const linkedSkus = serviceLinkedSkus(service, snapshot);
  const bottleneck = currentServiceBottleneck(service, snapshot);
  return rankSkuSet({
    skus: linkedSkus,
    snapshot,
    bottleneckSkuId: bottleneck?.skuId ?? null,
  });
}

export function latestEvidenceHint(reports: StockReport[], language: AppLanguage) {
  if (reports.length === 0) {
    return null;
  }
  const latest = [...reports].sort(
    (left, right) => new Date(right.reportedAt).getTime() - new Date(left.reportedAt).getTime(),
  )[0];
  return latest?.reportSource === 'manual'
    ? translateUiLiteral(language, 'Reviewed in latest session')
    : translateUiLiteral(language, 'Reviewed in recent update');
}

export function serviceHeartbeatSummary({
  service,
  snapshot,
  reports,
  language,
}: {
  service: ServiceRecord;
  snapshot: InventorySnapshot;
  reports: StockReport[];
  language: AppLanguage;
}) {
  const sellableUnits = computeServiceSellableUnits(service, snapshot);
  const contributors = rankedServiceContributors(service, snapshot);
  const bottleneck = contributors.find((entry) => entry.isBottleneck) ?? null;
  const blockerText = bottleneck ? bottleneck.sku.name : translateUiLiteral(language, 'no active blocker');
  return {
    state: serviceCoverageState(service, snapshot) as ServiceHeartbeatState,
    summary: translateUiLiteral(language, '{sellable} ready to serve across {count} linked SKUs · {blocker}', {
      sellable: formatWholeNumber(sellableUnits, language),
      count: formatWholeNumber(contributors.length, language),
      blocker: blockerText,
    }),
    evidenceHint: latestEvidenceHint(reports, language),
  };
}

export function deriveFragilitySummary(service: ServiceRecord, snapshot: InventorySnapshot): FragilitySummary {
  const contributors = rankedServiceContributors(service, snapshot);
  const currentState = serviceCoverageState(service, snapshot) as ServiceHeartbeatState;
  const currentBottleneck = contributors.find((entry) => entry.isBottleneck) ?? null;
  const nextLikelyLimiter =
    currentState === 'available'
      ? contributors[0] ?? null
      : contributors.find((entry) => !entry.isBottleneck) ?? currentBottleneck;
  const windowSource = currentBottleneck ?? nextLikelyLimiter;
  const strongestConfidence = contributors.reduce<SistConfidence>(
    (best, contributor) =>
      contributor.insight && confidenceScore(contributor.insight.confidence) > confidenceScore(best)
        ? contributor.insight.confidence
        : best,
    'low',
  );

  return {
    currentState,
    nextLikelyLimiter,
    disruptionWindowDays: windowSource?.insight?.daysOfCover ?? null,
    confidence: strongestConfidence,
  };
}

export function deriveEconomicSummary(service: ServiceRecord, snapshot: InventorySnapshot): EconomicSummary {
  const estimatedInputCost = serviceLinkedSkus(service, snapshot).reduce(
    (sum, sku) => sum + sku.costPerUnit,
    0,
  );

  return {
    servicePrice: service.price,
    estimatedInputCost,
    grossMargin: service.price - estimatedInputCost,
  };
}

function reportContributorsForOrdering({
  report,
  service,
  snapshot,
}: {
  report: StockReport;
  service: ServiceRecord;
  snapshot: InventorySnapshot;
}) {
  const overrides = new Map(report.skuObservations.map((observation) => [observation.skuId, observation]));
  const skus = serviceLinkedSkus(service, snapshot).map((sku) => {
    const override = overrides.get(sku.skuId);
    if (!override) {
      return sku;
    }
    return {
      ...sku,
      unitsInStock: override.unitsInStock,
      costPerUnit: override.costPerUnit,
    };
  });
  return rankSkuSet({ skus, snapshot, bottleneckSkuId: currentServiceBottleneck(service, snapshot)?.skuId ?? null });
}

function skuDisplayName(snapshot: InventorySnapshot, skuId: string) {
  return snapshot.skus.find((sku) => sku.skuId === skuId)?.name ?? skuId;
}

export function mapServiceTimelineEvents({
  service,
  snapshot,
  reports,
  currency,
  language,
  usdToKhrExchangeRate = DEFAULT_USD_TO_KHR_EXCHANGE_RATE,
}: {
  service: ServiceRecord;
  snapshot: InventorySnapshot;
  reports: StockReport[];
  currency: 'USD' | 'KHR';
  language: AppLanguage;
  usdToKhrExchangeRate?: number;
}) {
  const relevant = [...reports]
    .filter(
      (report) =>
        report.serviceSignals.some((signal) => signal.serviceId === service.serviceId) ||
        report.servicePriceAdjustments.some((adjustment) => adjustment.serviceId === service.serviceId) ||
        report.topServiceRanking.includes(service.serviceId) ||
        report.skuObservations.some((observation) => service.skuIds.includes(observation.skuId)),
    )
    .sort((left, right) => new Date(right.reportedAt).getTime() - new Date(left.reportedAt).getTime());

  return relevant.map<TimelineEvent>((report, index) => {
    const previous = relevant[index + 1];
    const types: TimelineEventType[] = [];
    const summaries: string[] = [];
    const signal = report.serviceSignals.find((entry) => entry.serviceId === service.serviceId && entry.stockout);
    const priceAdjustment = report.servicePriceAdjustments.find(
      (entry) => entry.serviceId === service.serviceId,
    );
    const linkedSkuObservation = report.skuObservations.find((entry) => service.skuIds.includes(entry.skuId));
    const reportLeader = reportContributorsForOrdering({ report, service, snapshot })[0]?.sku;
    const priorLeader = previous
      ? reportContributorsForOrdering({ report: previous, service, snapshot })[0]?.sku
      : rankedServiceContributors(service, snapshot)[0]?.sku;

    if (signal) {
      types.push('service-unavailable');
      summaries.push(translateUiLiteral(language, 'Service became unavailable'));
    }
    if (priceAdjustment) {
      types.push('price-adjustment');
      summaries.push(
        translateUiLiteral(language, 'Price changed to {price}', {
          price: formatCurrency(priceAdjustment.price, currency, language, usdToKhrExchangeRate),
        }),
      );
    }
    if (linkedSkuObservation) {
      types.push('linked-sku-change');
      summaries.push(
        translateUiLiteral(language, 'Availability changed through {sku}', {
          sku: skuDisplayName(snapshot, linkedSkuObservation.skuId),
        }),
      );
    }
    if (report.topServiceRanking.includes(service.serviceId)) {
      types.push('ranking-update');
      summaries.push(translateUiLiteral(language, 'Selling order updated'));
    }
    if (reportLeader && priorLeader && reportLeader.skuId !== priorLeader.skuId) {
      types.push('limiter-shift');
      summaries.push(
        translateUiLiteral(language, 'Main blocker changed to {sku}', {
          sku: reportLeader.name,
        }),
      );
    }

    return {
      report,
      types,
      summary: summaries.join(' · ') || translateUiLiteral(language, 'Relevant service update recorded'),
      secondary: report.notes?.trim() ? report.notes.trim() : null,
    };
  });
}

export function serviceStateLabel(state: ServiceHeartbeatState) {
  if (state === 'blocked') {
    return 'Blocked';
  }
  if (state === 'at-risk') {
    return 'At risk';
  }
  if (state === 'available') {
    return 'Available';
  }
  return 'Unlinked';
}

export function contributorHealthLabel(health: ContributorHealth) {
  if (health === 'blocked') {
    return 'Blocked';
  }
  if (health === 'at-risk') {
    return 'High risk';
  }
  return 'Healthy';
}

export function confidenceBadgeLabel(confidence: SistConfidence) {
  return `${confidenceLabel(confidence)} confidence`;
}
