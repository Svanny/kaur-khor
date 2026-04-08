import type { AppCurrency, AppLanguage } from '@shared/inventory';
import type {
  SenaCatalog,
  SenaDiagnostics,
  SenaLeadTimePosteriorPoint,
  SenaObservationRecord,
  SenaServiceDetail,
  SenaSkuDetail,
  SenaWorkspaceSummary,
} from '@shared/sena';
import { linkedSkuIdsForService } from '@/lib/sena-catalog';
import type { StatusPillTone } from '@/lib/state-tones';
import { formatWholeNumber } from '@/lib/format';
import { formatSenaReorderQuantity } from '@/lib/sena-reorder-quantity';
import { formatSenaDate, formatSenaDateTime, formatSenaDays, formatSenaPercent, formatSenaQuantity } from '@/routes/sku-detail/format';

export type AnalysisScope = 'all' | 'skus' | 'services';
export type AnalysisSection = 'workbench' | 'pressure' | 'observations' | 'fragility' | 'settings';
export type AnalysisEntityType = 'sku' | 'service';
export type AnalysisSelection =
  | { type: 'overview' }
  | { type: 'interval'; intervalIndex: number }
  | { type: 'entity'; entityId: string; entityType: AnalysisEntityType }
  | { type: 'observation'; observationId: string };

export interface AnalysisDiagnosticReadout {
  key: string;
  label: string;
  value: string;
  detail: string;
  tone: StatusPillTone;
}

export interface AnalysisIntervalRow {
  key: string;
  intervalIndex: number;
  label: string;
  dateLabel: string;
  startAt: string | null;
  endAt: string | null;
  dominantRegime: string;
  priceSignalLabel: string;
  serviceDemandLabel: string;
  retailDemandLabel: string;
  realizedConsumptionLabel: string;
  receiptsLabel: string;
  adjustmentsLabel: string;
  inventoryLabel: string;
  inTransitLabel: string;
  orderProbabilityLabel: string;
  orderQuantityLabel: string;
  receiptQuantityLabel: string;
  ageDaysLabel: string;
  leadTimeMeanLabel: string;
  leadTimeSpreadLabel: string;
  leadTimeVariabilityLabel: string;
  dominantDriver: 'demand-led' | 'receipt-led' | 'adjustment-led' | 'lead-time-led';
  narrative: string;
  observedSignals: string[];
  affectedEntities: string[];
  priceOrStockoutSummary: string;
  serviceDemandMean: number;
  retailDemandMean: number;
  receiptsMean: number;
  adjustmentsMean: number;
  inTransitMean: number;
  leadTimeMeanDays: number;
}

export interface AnalysisEntityPressureRow {
  id: string;
  entityType: AnalysisEntityType;
  name: string;
  href: string;
  pressureScoreValue: number;
  pressureScoreLabel: string;
  pipelineRiskLabel: string;
  leadTimeRiskLabel: string;
  priceSensitivityLabel: string;
  driverLabel: string;
  tone: StatusPillTone;
  summary: string;
  selectedSummary: string[];
  contributorStack: string[];
  activityLabel: string;
  posteriorUnitsLabel: string;
  demandPerDayLabel: string;
  reorderTriggerLabel: string;
  inTransitExposureLabel: string;
  leadTimeMeanLabel: string;
  leadTimeSpreadLabel: string;
  reorderPolicyLabels: {
    needProbability: string;
    recommendedOrder: string;
    likelyRange: string;
    protectionHorizon: string;
    policyBasis: string;
  } | null;
}

export interface AnalysisObservationLedgerRow {
  id: string;
  observedAt: string;
  title: string;
  detail: string;
  stockSnapshotLabel: string;
  serviceRankingLabel: string;
  retailRankingLabel: string;
  stockoutFlagsLabel: string;
  orderPlacedLabel: string;
  receiptArrivedLabel: string;
  servicePriceLabel: string;
  retailPriceLabel: string;
  leadTimeHintLabel: string;
  noteLabel: string;
  channelsPresent: string[];
  affectedEntityLabels: string[];
}

export interface AnalysisFragilityCell {
  key: string;
  skuId: string;
  intensity: number;
  usageLabel: string;
  bottleneckLabel: string;
  pressureLabel: string;
  reliefLabel: string;
  tone: StatusPillTone;
}

export interface AnalysisFragilityRow {
  key: string;
  entityId: string;
  entityType: 'service';
  name: string;
  cells: AnalysisFragilityCell[];
}

export interface AnalysisInspectorOverview {
  dominantRegime: string;
  changePointProbability: string;
  coverageSummary: string;
  strongestChannels: string[];
  affectedEntities: string[];
}

export interface AnalysisSettingsModel {
  runId: string;
  latestObservedAt: string;
  observationsUsed: string;
  intervalCount: string;
  smoothingLabel: string;
  effectiveSampleSize: string;
  predictiveError: string;
  coverageEstimate: string;
  scopeSummary: string;
}

export interface AnalysisWorkbenchRegimeLaneInterval {
  intervalIndex: number;
  intervalPosition: number;
  startAt: string | null;
  endAt: string | null;
  dominantRegime: string;
  priceCueCount: number;
  stockoutCueCount: number;
  cueSummary: string;
}

export interface AnalysisWorkbenchInventoryDemandPoint {
  intervalIndex: number;
  intervalPosition: number;
  startAt: string | null;
  endAt: string | null;
  inventoryMean: number;
  inventoryLow: number;
  inventoryHigh: number;
  serviceDemandMean: number;
  retailDemandMean: number;
  receiptsMean: number;
  adjustmentsMean: number;
  realizedConsumptionMean: number;
}

export interface AnalysisWorkbenchPipelineSpan {
  key: string;
  intervalIndex: number;
  intervalPosition: number;
  startPosition: number;
  endPosition: number;
  row: number;
  inTransitMean: number;
  orderProbability: number;
  orderQuantityMean: number;
  receiptQuantityMean: number;
  ageDaysMean: number;
  leadTimeMeanDays: number;
  overdue: boolean;
}

export interface AnalysisWorkbenchPipelineMarker {
  key: string;
  intervalIndex: number;
  intervalPosition: number;
  row: number;
  kind: 'order' | 'receipt';
  quantityMean: number;
}

export const PIPELINE_PILL_START_OFFSET = 0.14;
export const PIPELINE_PILL_END_OFFSET = 0.86;

export interface AnalysisWorkbenchLeadTimePoint {
  intervalIndex: number;
  intervalPosition: number;
  startAt: string | null;
  endAt: string | null;
  meanDays: number;
  lowDays: number;
  highDays: number;
  variabilityClass: string | null;
}

export interface AnalysisWorkbenchChartModel {
  regimePriceLane: {
    intervals: AnalysisWorkbenchRegimeLaneInterval[];
  };
  inventoryDemandLane: {
    points: AnalysisWorkbenchInventoryDemandPoint[];
    maxFlowMagnitude: number;
  };
  pipelineLane: {
    spans: AnalysisWorkbenchPipelineSpan[];
    markers: AnalysisWorkbenchPipelineMarker[];
    rowCount: number;
  };
  leadTimeLane: {
    points: AnalysisWorkbenchLeadTimePoint[];
  };
}

export interface AnalysisWorkbenchViewModel {
  lastUpdatedLabel: string;
  diagnostics: AnalysisDiagnosticReadout[];
  intervals: AnalysisIntervalRow[];
  workbench: AnalysisWorkbenchChartModel;
  entityRows: AnalysisEntityPressureRow[];
  evidenceRows: AnalysisObservationLedgerRow[];
  fragilityRows: AnalysisFragilityRow[];
  fragilityColumns: Array<{ skuId: string; name: string }>;
  inspectorOverview: AnalysisInspectorOverview;
  settings: AnalysisSettingsModel;
  internalNavSummary: string;
}

type IntervalAggregateSeed = {
  intervalIndex: number;
  startAt: string | null;
  endAt: string | null;
  regime: string;
  changePointProbability: number;
  serviceDemandMean: number;
  retailDemandMean: number;
  realizedConsumptionMean: number;
  receiptsMean: number;
  adjustmentsMean: number;
  inventoryMean: number;
  inventoryLow: number;
  inventoryHigh: number;
  inTransitMean: number;
  orderProbabilitySum: number;
  pipelineCount: number;
  orderQuantityMean: number;
  receiptQuantityMean: number;
  ageDaysMean: number;
  leadTimeMeanDays: number;
  leadTimeStdDays: number;
  leadTimeVariabilityClass: string | null;
  leadTimeCount: number;
  priceShiftCount: number;
  priceDeltaCount: number;
  stockoutCueCount: number;
  orderPlacedCount: number;
  receiptArrivedCount: number;
  observedSignals: Set<string>;
  affectedEntities: Set<string>;
};

function orderedObservations(observations: SenaObservationRecord[]) {
  return [...observations].sort((left, right) => {
    return new Date(left.input.observedAt).getTime() - new Date(right.input.observedAt).getTime();
  });
}

function lastObservedAt(workspaceSummary: SenaWorkspaceSummary | null, observations: SenaObservationRecord[]) {
  return workspaceSummary?.latestObservedAt ?? orderedObservations(observations).at(-1)?.input.observedAt ?? null;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function normalizeRegimeLabel(value: string | null | undefined) {
  if (!value) {
    return 'Normal';
  }
  return value
    .split(/[_\s-]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function coverTone(score: number): StatusPillTone {
  if (score >= 0.72) {
    return 'danger';
  }
  if (score >= 0.48) {
    return 'warning';
  }
  if (score >= 0.24) {
    return 'info';
  }
  return 'success';
}

function labelForLevel(score: number) {
  if (score >= 0.82) {
    return 'critical';
  }
  if (score >= 0.62) {
    return 'high';
  }
  if (score >= 0.38) {
    return 'medium';
  }
  return 'low';
}

function coverageBand(score: number) {
  if (score >= 0.88) {
    return 'high';
  }
  if (score >= 0.72) {
    return 'medium-high';
  }
  if (score >= 0.52) {
    return 'medium';
  }
  return 'low';
}

function scopeSummary(scope: AnalysisScope) {
  switch (scope) {
    case 'skus':
      return 'SKU-only evidence and posterior scan';
    case 'services':
      return 'Service-only system scan';
    default:
      return 'Mixed system scan across SKUs and services';
  }
}

function observationBelongsToScope({
  catalog,
  observation,
  scope,
}: {
  catalog: SenaCatalog;
  observation: SenaObservationRecord;
  scope: AnalysisScope;
}) {
  if (scope === 'all') {
    return true;
  }

  if (scope === 'skus') {
    return (
      observation.input.stockSnapshot.length > 0 ||
      observation.input.retailPrices.length > 0 ||
      observation.input.retailRankings.length > 0 ||
      observation.input.retailStockouts.length > 0 ||
      observation.input.orderSignals.length > 0 ||
      observation.input.leadTimeHints.length > 0
    );
  }

  const scopedServiceIds = new Set(
    catalog.services.filter((service) => !service.bundle).map((service) => service.serviceId),
  );
  const scopedSkuIds = new Set(
    [...scopedServiceIds].flatMap((serviceId) => linkedSkuIdsForService(catalog, serviceId)),
  );

  return (
    observation.input.serviceRankings.some((entry) => scopedServiceIds.has(entry)) ||
    observation.input.servicePrices.some((entry) => scopedServiceIds.has(entry.serviceId)) ||
    observation.input.serviceStockouts.some((entry) => scopedServiceIds.has(entry)) ||
    observation.input.stockSnapshot.some((entry) => scopedSkuIds.has(entry.skuId)) ||
    observation.input.retailPrices.some((entry) => scopedSkuIds.has(entry.skuId)) ||
    observation.input.orderSignals.some((entry) => scopedSkuIds.has(entry.skuId)) ||
    observation.input.leadTimeHints.some((entry) => scopedSkuIds.has(entry.skuId))
  );
}

function filterObservationsForScope({
  catalog,
  observations,
  scope,
}: {
  catalog: SenaCatalog;
  observations: SenaObservationRecord[];
  scope: AnalysisScope;
}) {
  const scopedObservations = orderedObservations(observations).filter((observation) =>
    observationBelongsToScope({ catalog, observation, scope }),
  );

  return scopedObservations;
}

function buildIntervalBounds({
  diagnostics,
  serviceDetailsById,
  skuDetailsById,
}: {
  diagnostics: SenaDiagnostics | null;
  serviceDetailsById: Record<string, SenaServiceDetail | null>;
  skuDetailsById: Record<string, SenaSkuDetail | null>;
}) {
  const loadedIntervals = new Map<number, { intervalIndex: number; startAt: string | null; endAt: string | null; regime: string }>();

  for (const detail of Object.values(serviceDetailsById)) {
    for (const interval of detail?.regimeTimeline ?? []) {
      loadedIntervals.set(interval.intervalIndex, {
        intervalIndex: interval.intervalIndex,
        startAt: interval.startAt,
        endAt: interval.endAt,
        regime: interval.dominantRegime,
      });
    }
  }

  for (const detail of Object.values(skuDetailsById)) {
    for (const interval of detail?.demandPosterior ?? []) {
      const current = loadedIntervals.get(interval.intervalIndex);
      loadedIntervals.set(interval.intervalIndex, {
        intervalIndex: interval.intervalIndex,
        startAt: current?.startAt ?? interval.startAt,
        endAt: current?.endAt ?? interval.endAt,
        regime: current?.regime ?? 'normal',
      });
    }
  }

  if (loadedIntervals.size > 0) {
    for (const interval of diagnostics?.regimeHistory ?? []) {
      const current = loadedIntervals.get(interval.intervalIndex);
      if (!current) {
        continue;
      }
      loadedIntervals.set(interval.intervalIndex, {
        intervalIndex: interval.intervalIndex,
        startAt: current.startAt ?? interval.startAt,
        endAt: current.endAt ?? interval.endAt,
        regime: interval.dominantRegime,
      });
    }

    return [...loadedIntervals.values()].sort((left, right) => left.intervalIndex - right.intervalIndex);
  }

  const entries = new Map<number, { intervalIndex: number; startAt: string | null; endAt: string | null; regime: string }>();

  for (const interval of diagnostics?.regimeHistory ?? []) {
    entries.set(interval.intervalIndex, {
      intervalIndex: interval.intervalIndex,
      startAt: interval.startAt,
      endAt: interval.endAt,
      regime: interval.dominantRegime,
    });
  }

  for (const detail of Object.values(skuDetailsById)) {
    for (const interval of detail?.demandPosterior ?? []) {
      const current = entries.get(interval.intervalIndex);
      entries.set(interval.intervalIndex, {
        intervalIndex: interval.intervalIndex,
        startAt: current?.startAt ?? interval.startAt,
        endAt: current?.endAt ?? interval.endAt,
        regime: current?.regime ?? 'normal',
      });
    }
  }

  return [...entries.values()].sort((left, right) => left.intervalIndex - right.intervalIndex);
}

function filterIntervalsForScope({
  intervals,
}: {
  intervals: Array<{ intervalIndex: number; startAt: string | null; endAt: string | null; regime: string }>;
}) {
  return intervals;
}

function closestInventoryState(detail: SenaSkuDetail | null, endAt: string | null) {
  if (!detail) {
    return { mean: 0, low: 0, high: 0 };
  }
  if (!endAt) {
    return {
      mean: detail.summary.latestPosteriorUnits,
      low: detail.summary.credibleIntervalLow,
      high: detail.summary.credibleIntervalHigh,
    };
  }
  const targetTime = new Date(endAt).getTime();
  const orderedPoints = [...detail.inventoryPosterior].sort((left, right) => new Date(left.at).getTime() - new Date(right.at).getTime());
  const candidate = orderedPoints
    .filter((point) => new Date(point.at).getTime() <= targetTime)
    .at(-1);
  return candidate ?? {
    at: endAt,
    mean: detail.summary.latestPosteriorUnits,
    low: detail.summary.credibleIntervalLow,
    high: detail.summary.credibleIntervalHigh,
  };
}

function averageProbability(value: number, count: number) {
  return count > 0 ? value / count : 0;
}

function variabilityLabel(point: SenaLeadTimePosteriorPoint | null) {
  if (!point?.observedVariabilityClass) {
    return 'No class';
  }
  return point.observedVariabilityClass.replace(/_/g, ' ');
}

function accumulateSignals(observation: SenaObservationRecord) {
  const signals: string[] = [];
  if (observation.input.stockSnapshot.length > 0) {
    signals.push('stock snapshot');
  }
  if (observation.input.serviceRankings.length > 0) {
    signals.push('service ranking');
  }
  if (observation.input.retailRankings.length > 0) {
    signals.push('retail ranking');
  }
  if (observation.input.serviceStockouts.length > 0 || observation.input.retailStockouts.length > 0) {
    signals.push('stockout flags');
  }
  if (observation.input.orderSignals.some((signal) => signal.orderPlaced)) {
    signals.push('order placed');
  }
  if (observation.input.orderSignals.some((signal) => signal.receiptArrived)) {
    signals.push('receipt arrived');
  }
  if (observation.input.servicePrices.length > 0 || observation.input.retailPrices.length > 0) {
    signals.push('price signal');
  }
  if (observation.input.leadTimeHints.length > 0) {
    signals.push('lead-time hint');
  }
  if (observation.input.notes?.trim()) {
    signals.push('note');
  }
  return signals;
}

function observationsInInterval(observations: SenaObservationRecord[], interval: { startAt: string | null; endAt: string | null }) {
  if (!interval.startAt || !interval.endAt) {
    return [];
  }

  const startTime = new Date(interval.startAt).getTime();
  const endTime = new Date(interval.endAt).getTime();

  return observations.filter((observation) => {
    const observedTime = new Date(observation.input.observedAt).getTime();
    return !Number.isNaN(observedTime) && observedTime >= startTime && observedTime <= endTime;
  });
}

function summarizeDriver(seed: IntervalAggregateSeed, previous: IntervalAggregateSeed | null) {
  const demandScore = Math.abs(seed.serviceDemandMean) + Math.abs(seed.retailDemandMean);
  const receiptScore = Math.abs(seed.receiptsMean);
  const adjustmentScore = Math.abs(seed.adjustmentsMean);
  const leadTimeDelta = previous ? Math.abs(seed.leadTimeMeanDays - previous.leadTimeMeanDays) + Math.abs(seed.leadTimeStdDays - previous.leadTimeStdDays) : Math.abs(seed.leadTimeStdDays);

  const ranked = [
    { key: 'demand-led' as const, value: demandScore },
    { key: 'receipt-led' as const, value: receiptScore },
    { key: 'adjustment-led' as const, value: adjustmentScore },
    { key: 'lead-time-led' as const, value: leadTimeDelta },
  ].sort((left, right) => right.value - left.value);

  return ranked[0]?.key ?? 'demand-led';
}

function signalCounter(observations: SenaObservationRecord[]) {
  const counts = new Map<string, number>();
  for (const observation of observations) {
    for (const signal of accumulateSignals(observation)) {
      counts.set(signal, (counts.get(signal) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1]);
}

function topEntityNames(rows: AnalysisEntityPressureRow[], count: number) {
  return uniqueOrderedStrings(rows.map((row) => row.name), count);
}

function uniqueOrderedStrings(values: string[], count?: number) {
  const deduplicated = [...new Set(values)];
  return typeof count === 'number' ? deduplicated.slice(0, count) : deduplicated;
}

function analysisEligibleServices(catalog: SenaCatalog, scope: AnalysisScope) {
  if (scope === 'skus') {
    return [];
  }

  return catalog.services.filter((service) => linkedSkuIdsForService(catalog, service.serviceId).length > 0);
}

function latestRetailPriceCount(skuId: string, observations: SenaObservationRecord[]) {
  return observations.reduce((sum, observation) => {
    return sum + observation.input.retailPrices.filter((entry) => entry.skuId === skuId).length;
  }, 0);
}

function latestServicePriceCount(serviceId: string, observations: SenaObservationRecord[]) {
  return observations.reduce((sum, observation) => {
    return sum + observation.input.servicePrices.filter((entry) => entry.serviceId === serviceId).length;
  }, 0);
}

function latestPipeline(detail: SenaSkuDetail | null) {
  return detail?.pipelinePosterior.at(-1) ?? null;
}

function latestLeadTime(detail: SenaSkuDetail | null) {
  return detail?.leadTimePosterior.at(-1) ?? null;
}

function intervalDurationDays(startAt: string | null, endAt: string | null) {
  if (!startAt || !endAt) {
    return 1;
  }

  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
    return 1;
  }

  return Math.max((end - start) / (1000 * 60 * 60 * 24), 1);
}

function spansOverlap(
  left: { startPosition: number; endPosition: number },
  right: { startPosition: number; endPosition: number },
) {
  const leftVisualStart = left.startPosition + PIPELINE_PILL_START_OFFSET;
  const leftVisualEnd = left.endPosition + PIPELINE_PILL_END_OFFSET;
  const rightVisualStart = right.startPosition + PIPELINE_PILL_START_OFFSET;
  const rightVisualEnd = right.endPosition + PIPELINE_PILL_END_OFFSET;
  const hasGap = leftVisualStart >= rightVisualEnd || leftVisualEnd <= rightVisualStart;
  return !hasGap;
}

function derivePipelineSpanRow({
  span,
  spansByRow,
}: {
  span: { startPosition: number; endPosition: number };
  spansByRow: Map<number, Array<{ startPosition: number; endPosition: number }>>;
}) {
  for (let row = 0; ; row += 1) {
    const rowSpans = spansByRow.get(row) ?? [];
    const hasConflict = rowSpans.some((existingSpan) => spansOverlap(span, existingSpan));
    if (hasConflict) {
      continue;
    }

    rowSpans.push(span);
    spansByRow.set(row, rowSpans);
    return row;
  }
}

function pushSeedEntity(seed: IntervalAggregateSeed, label: string) {
  if (seed.affectedEntities.size < 4) {
    seed.affectedEntities.add(label);
  }
}

export function deriveAnalysisViewModel({
  catalog,
  currency,
  diagnostics,
  language,
  observations,
  scope,
  serviceDetailsById,
  skuDetailsById,
  workspaceSummary,
}: {
  catalog: SenaCatalog;
  currency: AppCurrency;
  diagnostics: SenaDiagnostics | null;
  language: AppLanguage;
  observations: SenaObservationRecord[];
  scope: AnalysisScope;
  serviceDetailsById: Record<string, SenaServiceDetail | null>;
  skuDetailsById: Record<string, SenaSkuDetail | null>;
  workspaceSummary: SenaWorkspaceSummary;
}): AnalysisWorkbenchViewModel {
  const latestObservedAt = lastObservedAt(workspaceSummary, observations);
  const filteredObservations = filterObservationsForScope({
    catalog,
    observations,
    scope,
  });
  const allIntervals = buildIntervalBounds({ diagnostics, serviceDetailsById, skuDetailsById });
  const filteredIntervals = filterIntervalsForScope({
    intervals: allIntervals,
  });
  const eligibleServices = analysisEligibleServices(catalog, scope);
  const activeServiceIds = new Set(
    eligibleServices.map((service) => service.serviceId),
  );
  const activeSkuIds = new Set(
    scope === 'services'
      ? [...activeServiceIds].flatMap((serviceId) => linkedSkuIdsForService(catalog, serviceId))
      : catalog.skus.map((sku) => sku.skuId),
  );

  const intervalSeeds = new Map<number, IntervalAggregateSeed>();
  for (const interval of filteredIntervals) {
    intervalSeeds.set(interval.intervalIndex, {
      intervalIndex: interval.intervalIndex,
      startAt: interval.startAt,
      endAt: interval.endAt,
      regime: interval.regime,
      changePointProbability: diagnostics?.changePointProbability ?? 0,
      serviceDemandMean: 0,
      retailDemandMean: 0,
      realizedConsumptionMean: 0,
      receiptsMean: 0,
      adjustmentsMean: 0,
      inventoryMean: 0,
      inventoryLow: 0,
      inventoryHigh: 0,
      inTransitMean: 0,
      orderProbabilitySum: 0,
      pipelineCount: 0,
      orderQuantityMean: 0,
      receiptQuantityMean: 0,
      ageDaysMean: 0,
      leadTimeMeanDays: 0,
      leadTimeStdDays: 0,
      leadTimeVariabilityClass: null,
      leadTimeCount: 0,
      priceShiftCount: 0,
      priceDeltaCount: 0,
      stockoutCueCount: 0,
      orderPlacedCount: 0,
      receiptArrivedCount: 0,
      observedSignals: new Set<string>(),
      affectedEntities: new Set<string>(),
    });
  }

  const serviceById = new Map(catalog.services.map((service) => [service.serviceId, service]));
  const skuById = new Map(catalog.skus.map((sku) => [sku.skuId, sku]));

  for (const sku of catalog.skus) {
    if (!activeSkuIds.has(sku.skuId)) {
      continue;
    }
    const detail = skuDetailsById[sku.skuId];
    for (const interval of detail?.demandPosterior ?? []) {
      const seed = intervalSeeds.get(interval.intervalIndex);
      if (!seed) {
        continue;
      }
      seed.serviceDemandMean += interval.serviceDemandMean;
      seed.retailDemandMean += interval.retailDemandMean;
      seed.realizedConsumptionMean += interval.realizedConsumptionMean;
      seed.receiptsMean += interval.receiptsMean;
      seed.adjustmentsMean += interval.adjustmentsMean;
      const inventory = closestInventoryState(detail, seed.endAt);
      seed.inventoryMean += inventory.mean;
      seed.inventoryLow += inventory.low;
      seed.inventoryHigh += inventory.high;
      pushSeedEntity(seed, sku.name);
    }
    for (const interval of detail?.pipelinePosterior ?? []) {
      const seed = intervalSeeds.get(interval.intervalIndex);
      if (!seed) {
        continue;
      }
      seed.inTransitMean += interval.inTransitMean;
      seed.orderProbabilitySum += interval.orderProbability;
      seed.pipelineCount += 1;
      seed.orderQuantityMean += interval.orderQuantityMean;
      seed.receiptQuantityMean += interval.receiptQuantityMean;
      seed.ageDaysMean += interval.ageDaysMean;
    }
    for (const interval of detail?.leadTimePosterior ?? []) {
      const seed = intervalSeeds.get(interval.intervalIndex);
      if (!seed) {
        continue;
      }
      seed.leadTimeMeanDays += interval.meanDays;
      seed.leadTimeStdDays += interval.stdDays;
      seed.leadTimeCount += 1;
      if (!seed.leadTimeVariabilityClass && interval.observedVariabilityClass) {
        seed.leadTimeVariabilityClass = interval.observedVariabilityClass;
      }
    }
  }

  for (const interval of filteredIntervals) {
    const seed = intervalSeeds.get(interval.intervalIndex);
    if (!seed) {
      continue;
    }

    const intervalObservations = observationsInInterval(filteredObservations, interval);
    for (const observation of intervalObservations) {
      for (const signal of accumulateSignals(observation)) {
        seed.observedSignals.add(signal);
      }
      seed.priceShiftCount += observation.input.servicePrices.length + observation.input.retailPrices.length;
      seed.priceDeltaCount +=
        observation.input.servicePrices.length +
        observation.input.retailPrices.length +
        observation.input.serviceStockouts.length +
        observation.input.retailStockouts.length;
      seed.stockoutCueCount += observation.input.serviceStockouts.length + observation.input.retailStockouts.length;
      seed.orderPlacedCount += observation.input.orderSignals.filter((signal) => signal.orderPlaced).length;
      seed.receiptArrivedCount += observation.input.orderSignals.filter((signal) => signal.receiptArrived).length;
      for (const serviceId of observation.input.serviceRankings) {
        const label = serviceById.get(serviceId)?.name;
        if (label) {
          pushSeedEntity(seed, label);
        }
      }
      for (const skuId of observation.input.retailRankings) {
        const label = skuById.get(skuId)?.name;
        if (label) {
          pushSeedEntity(seed, label);
        }
      }
    }
  }

  const orderedSeeds = [...intervalSeeds.values()];

  const intervalRows = orderedSeeds.map((seed, index, array) => {
    const previous = array[index - 1] ?? null;
    const dominantDriver = summarizeDriver(seed, previous);
    const averageOrderProbability = averageProbability(seed.orderProbabilitySum, seed.pipelineCount);
    const averageAgeDays = seed.pipelineCount > 0 ? seed.ageDaysMean / seed.pipelineCount : null;
    const averageLeadTimeMeanDays = seed.leadTimeCount > 0 ? seed.leadTimeMeanDays / seed.leadTimeCount : null;
    const averageLeadTimeStdDays = seed.leadTimeCount > 0 ? seed.leadTimeStdDays / seed.leadTimeCount : null;
    const priceOrStockoutSummary =
      seed.priceDeltaCount > 0 || seed.stockoutCueCount > 0
        ? `${formatWholeNumber(seed.priceShiftCount, language)} price cues and ${formatWholeNumber(seed.stockoutCueCount, language)} stockout cues landed.`
        : 'No material price or stockout cue in this interval';

    return {
      key: `interval:${seed.intervalIndex}`,
      intervalIndex: seed.intervalIndex,
      label: `Interval ${seed.intervalIndex + 1}`,
      dateLabel: seed.endAt ? formatSenaDate(seed.endAt, language) : `Interval ${seed.intervalIndex + 1}`,
      startAt: seed.startAt,
      endAt: seed.endAt,
      dominantRegime: normalizeRegimeLabel(seed.regime),
      priceSignalLabel: seed.priceShiftCount > 0 ? `${formatWholeNumber(seed.priceShiftCount, language)} price cues` : 'No price cue',
      serviceDemandLabel: formatSenaQuantity(seed.serviceDemandMean, language),
      retailDemandLabel: formatSenaQuantity(seed.retailDemandMean, language),
      realizedConsumptionLabel: formatSenaQuantity(seed.realizedConsumptionMean, language),
      receiptsLabel: formatSenaQuantity(seed.receiptsMean, language),
      adjustmentsLabel: formatSenaQuantity(seed.adjustmentsMean, language),
      inventoryLabel: formatSenaQuantity(seed.inventoryMean, language),
      inTransitLabel: formatSenaQuantity(seed.inTransitMean, language),
      orderProbabilityLabel: formatSenaPercent(averageOrderProbability, language),
      orderQuantityLabel: formatSenaQuantity(seed.orderQuantityMean, language),
      receiptQuantityLabel: formatSenaQuantity(seed.receiptQuantityMean, language),
      ageDaysLabel: formatSenaDays(averageAgeDays, language),
      leadTimeMeanLabel: formatSenaDays(averageLeadTimeMeanDays, language),
      leadTimeSpreadLabel: formatSenaDays(averageLeadTimeStdDays, language),
      leadTimeVariabilityLabel: seed.leadTimeVariabilityClass ? seed.leadTimeVariabilityClass.replace(/_/g, ' ') : 'No class',
      dominantDriver,
      narrative:
        dominantDriver === 'lead-time-led'
          ? 'Lead-time drift moved faster than the demand or receipt story.'
          : dominantDriver === 'receipt-led'
            ? 'Inbound movement explains most of the operational change in this slice.'
            : dominantDriver === 'adjustment-led'
              ? 'Adjustment noise outweighed clean demand and receipt evidence here.'
              : 'Demand and consumption explain most of the posterior movement here.',
      observedSignals: [...seed.observedSignals],
      affectedEntities: [...seed.affectedEntities],
      priceOrStockoutSummary,
      serviceDemandMean: seed.serviceDemandMean,
      retailDemandMean: seed.retailDemandMean,
      receiptsMean: seed.receiptsMean,
      adjustmentsMean: seed.adjustmentsMean,
      inTransitMean: seed.inTransitMean,
      leadTimeMeanDays: averageLeadTimeMeanDays ?? 0,
    };
  });

  const rawPipelineSpans = orderedSeeds.flatMap((seed, intervalPosition) => {
    const averageLeadTimeMeanDays = seed.leadTimeCount > 0 ? seed.leadTimeMeanDays / seed.leadTimeCount : 0;
    const averageAgeDays = seed.pipelineCount > 0 ? seed.ageDaysMean / seed.pipelineCount : 0;
    const averageIntervalDays = intervalDurationDays(seed.startAt, seed.endAt);

    if (seed.inTransitMean <= 0 && seed.orderQuantityMean <= 0 && seed.receiptQuantityMean <= 0) {
      return [];
    }

    const slotsBack = averageAgeDays > 0 ? averageAgeDays / averageIntervalDays : 0;
    const slotsForward = averageLeadTimeMeanDays > averageAgeDays
      ? (averageLeadTimeMeanDays - averageAgeDays) / averageIntervalDays
      : 0.35;

    return [{
      key: `pipeline:${seed.intervalIndex}`,
      intervalIndex: seed.intervalIndex,
      intervalPosition,
      startPosition: Math.max(-0.25, intervalPosition - slotsBack),
      endPosition: Math.max(intervalPosition + 0.2, intervalPosition + slotsForward),
      inTransitMean: seed.inTransitMean,
      orderProbability: averageProbability(seed.orderProbabilitySum, seed.pipelineCount),
      orderQuantityMean: seed.orderQuantityMean,
      receiptQuantityMean: seed.receiptQuantityMean,
      ageDaysMean: averageAgeDays,
      leadTimeMeanDays: averageLeadTimeMeanDays,
      overdue: averageLeadTimeMeanDays > 0 && averageAgeDays > averageLeadTimeMeanDays,
    }];
  });

  const occupiedPipelineSpansByRow = new Map<number, Array<{ startPosition: number; endPosition: number }>>();
  const pipelineSpans = rawPipelineSpans.map((span) => ({
    ...span,
    row: derivePipelineSpanRow({
      span,
      spansByRow: occupiedPipelineSpansByRow,
    }),
  }));
  const pipelineSpanRowByInterval = new Map(pipelineSpans.map((span) => [span.intervalIndex, span.row]));
  const pipelineRowCount = Math.max(1, ...pipelineSpans.map((span) => span.row + 1));

  const workbench: AnalysisWorkbenchChartModel = {
    regimePriceLane: {
      intervals: orderedSeeds.map((seed, intervalPosition) => ({
        intervalIndex: seed.intervalIndex,
        intervalPosition,
        startAt: seed.startAt,
        endAt: seed.endAt,
        dominantRegime: normalizeRegimeLabel(seed.regime),
        priceCueCount: seed.priceShiftCount,
        stockoutCueCount: seed.stockoutCueCount,
        cueSummary:
          seed.priceDeltaCount > 0
            ? `${formatWholeNumber(seed.priceDeltaCount, language)} price or stockout cues`
            : 'No price or stockout cue',
      })),
    },
    inventoryDemandLane: {
      points: orderedSeeds.map((seed, intervalPosition) => ({
        intervalIndex: seed.intervalIndex,
        intervalPosition,
        startAt: seed.startAt,
        endAt: seed.endAt,
        inventoryMean: seed.inventoryMean,
        inventoryLow: seed.inventoryLow,
        inventoryHigh: seed.inventoryHigh,
        serviceDemandMean: seed.serviceDemandMean,
        retailDemandMean: seed.retailDemandMean,
        receiptsMean: seed.receiptsMean,
        adjustmentsMean: seed.adjustmentsMean,
        realizedConsumptionMean: seed.realizedConsumptionMean,
      })),
      maxFlowMagnitude: Math.max(
        1,
        ...orderedSeeds.flatMap((seed) => [
          Math.abs(seed.serviceDemandMean),
          Math.abs(seed.retailDemandMean),
          Math.abs(seed.receiptsMean),
          Math.abs(seed.adjustmentsMean),
        ]),
      ),
    },
    pipelineLane: {
      spans: pipelineSpans,
      markers: orderedSeeds.flatMap((seed, intervalPosition) => {
        const row = pipelineSpanRowByInterval.get(seed.intervalIndex) ?? 0;
        const markers: AnalysisWorkbenchPipelineMarker[] = [];
        if (seed.orderPlacedCount > 0 || seed.orderQuantityMean > 0) {
          markers.push({
            key: `order:${seed.intervalIndex}`,
            intervalIndex: seed.intervalIndex,
            intervalPosition,
            row,
            kind: 'order',
            quantityMean: seed.orderQuantityMean,
          });
        }
        if (seed.receiptArrivedCount > 0 || seed.receiptQuantityMean > 0) {
          markers.push({
            key: `receipt:${seed.intervalIndex}`,
            intervalIndex: seed.intervalIndex,
            intervalPosition,
            row,
            kind: 'receipt',
            quantityMean: seed.receiptQuantityMean,
          });
        }
        return markers;
      }),
      rowCount: pipelineRowCount,
    },
    leadTimeLane: {
      points: orderedSeeds.map((seed, intervalPosition) => {
        const meanDays = seed.leadTimeCount > 0 ? seed.leadTimeMeanDays / seed.leadTimeCount : 0;
        const stdDays = seed.leadTimeCount > 0 ? seed.leadTimeStdDays / seed.leadTimeCount : 0;
        return {
          intervalIndex: seed.intervalIndex,
          intervalPosition,
          startAt: seed.startAt,
          endAt: seed.endAt,
          meanDays,
          lowDays: Math.max(0, meanDays - stdDays),
          highDays: meanDays + stdDays,
          variabilityClass: seed.leadTimeVariabilityClass,
        };
      }),
    },
  };

  const entityRows: AnalysisEntityPressureRow[] = [];

  for (const sku of catalog.skus) {
    if (!activeSkuIds.has(sku.skuId) || scope === 'services') {
      if (scope !== 'all' && scope !== 'skus') {
        continue;
      }
    }

    const detail = skuDetailsById[sku.skuId];
    const summary = detail?.summary ?? workspaceSummary.skuSummaries.find((entry) => entry.skuId === sku.skuId) ?? null;
    if (!summary) {
      continue;
    }
    const pipeline = latestPipeline(detail);
    const leadTime = latestLeadTime(detail);
    const priceSensitivityScore = clamp(latestRetailPriceCount(sku.skuId, filteredObservations) / Math.max(filteredObservations.length, 1), 0, 1);
    const leadTimeRiskScore = clamp((leadTime?.stdDays ?? summary.leadTimeStdDays) / Math.max(leadTime?.meanDays ?? summary.leadTimeMeanDays, 1), 0, 1);
    const pipelineRiskScore = clamp(summary.reorderTriggerProbability * 0.72 + ((pipeline?.inTransitMean ?? 0) > 0 ? 0.14 : 0), 0, 1);
    const pressureScore = clamp(summary.stockoutRisk * 0.42 + pipelineRiskScore * 0.32 + leadTimeRiskScore * 0.16 + priceSensitivityScore * 0.1, 0, 1);
    const tone = coverTone(pressureScore);
    const reorderRecommendation = formatSenaReorderQuantity(summary.reorderQuantity, language);

    entityRows.push({
      id: sku.skuId,
      entityType: 'sku',
      name: sku.name,
      href: `/catalog/skus/${sku.skuId}`,
      pressureScoreValue: Math.round(pressureScore * 100),
      pressureScoreLabel: `${Math.round(pressureScore * 100)}`,
      pipelineRiskLabel: labelForLevel(pipelineRiskScore),
      leadTimeRiskLabel: labelForLevel(leadTimeRiskScore),
      priceSensitivityLabel: labelForLevel(priceSensitivityScore),
      driverLabel: pipelineRiskScore >= leadTimeRiskScore ? 'pipeline pressure' : 'lead-time drift',
      tone,
      summary: `${formatSenaQuantity(summary.latestPosteriorUnits, language)} posterior units · ${formatSenaPercent(summary.reorderTriggerProbability, language)} reorder trigger`,
      selectedSummary: [
        `${formatSenaQuantity(summary.latestPosteriorUnits, language)} posterior units`,
        `${formatSenaQuantity(summary.demandPerDayMean, language)} demand per day`,
        `${formatSenaPercent(summary.reorderTriggerProbability, language)} reorder trigger probability`,
        `${formatSenaQuantity(pipeline?.inTransitMean ?? 0, language)} in transit`,
      ],
      contributorStack: catalog.services
        .filter((service) => linkedSkuIdsForService(catalog, service.serviceId).includes(sku.skuId))
        .slice(0, 3)
        .map((service) => service.name),
      activityLabel: `${formatSenaQuantity(summary.latestPosteriorUnits, language)} units in posterior`,
      posteriorUnitsLabel: formatSenaQuantity(summary.latestPosteriorUnits, language),
      demandPerDayLabel: formatSenaQuantity(summary.demandPerDayMean, language),
      reorderTriggerLabel: formatSenaPercent(summary.reorderTriggerProbability, language),
      inTransitExposureLabel: formatSenaQuantity(pipeline?.inTransitMean ?? 0, language),
      leadTimeMeanLabel: formatSenaDays(leadTime?.meanDays ?? summary.leadTimeMeanDays, language),
      leadTimeSpreadLabel: formatSenaDays(leadTime?.stdDays ?? summary.leadTimeStdDays, language),
      reorderPolicyLabels: reorderRecommendation.hasBackendRecommendation
        ? {
            needProbability: reorderRecommendation.needProbabilityValueLabel,
            recommendedOrder: reorderRecommendation.recommendationIssued
              ? reorderRecommendation.recommendedUnitsLabel
              : reorderRecommendation.quietLabel,
            likelyRange: reorderRecommendation.likelyRangeValueLabel,
            protectionHorizon: reorderRecommendation.protectionHorizonLabel.replace(/^Protection horizon: /, ''),
            policyBasis: reorderRecommendation.policyBasisLabel.replace(/^Policy basis: /, ''),
          }
        : null,
    });
  }

  for (const service of eligibleServices) {
    const detail = serviceDetailsById[service.serviceId];
    const linkedSkuIds = linkedSkuIdsForService(catalog, service.serviceId);
    const linkedRows = linkedSkuIds
      .map((skuId) => entityRows.find((row) => row.entityType === 'sku' && row.id === skuId))
      .filter((row): row is AnalysisEntityPressureRow => Boolean(row));
    const pipelineRiskScore = linkedRows.reduce((sum, row) => sum + Number.parseInt(row.pressureScoreLabel, 10), 0) / Math.max(linkedRows.length * 100, 1);
    const leadTimeRiskScore =
      linkedRows.reduce((sum, row) => sum + (row.leadTimeRiskLabel === 'critical' ? 1 : row.leadTimeRiskLabel === 'high' ? 0.78 : row.leadTimeRiskLabel === 'medium' ? 0.5 : 0.2), 0) /
      Math.max(linkedRows.length, 1);
    const priceSensitivityScore = clamp(latestServicePriceCount(service.serviceId, filteredObservations) / Math.max(filteredObservations.length, 1), 0, 1);
    const bottleneckScore = detail?.bottleneckProbability ?? 0;
    const pressureScore = clamp(bottleneckScore * 0.48 + pipelineRiskScore * 0.24 + leadTimeRiskScore * 0.18 + priceSensitivityScore * 0.1, 0, 1);
    const tone = coverTone(pressureScore);

    entityRows.push({
      id: service.serviceId,
      entityType: 'service',
      name: service.name,
      href: `/catalog/services/${service.serviceId}`,
      pressureScoreValue: Math.round(pressureScore * 100),
      pressureScoreLabel: `${Math.round(pressureScore * 100)}`,
      pipelineRiskLabel: labelForLevel(pipelineRiskScore),
      leadTimeRiskLabel: labelForLevel(leadTimeRiskScore),
      priceSensitivityLabel: labelForLevel(priceSensitivityScore),
      driverLabel: bottleneckScore >= pipelineRiskScore ? 'contributor bottleneck' : 'linked supply pressure',
      tone,
      summary: `${formatSenaPercent(detail?.bottleneckProbability ?? 0, language)} bottleneck probability · ${formatWholeNumber(linkedSkuIds.length, language)} linked SKUs`,
      selectedSummary: [
        `${formatSenaQuantity(detail?.activityMean ?? 0, language)} activity interval`,
        `${formatSenaPercent(detail?.bottleneckProbability ?? 0, language)} bottleneck probability`,
        `${formatWholeNumber(linkedSkuIds.length, language)} contributors linked`,
      ],
      contributorStack:
        detail?.contributors
          .map((contributor) => skuById.get(contributor.skuId)?.name)
          .filter((value): value is string => Boolean(value))
          .slice(0, 4) ?? [],
      activityLabel: `${formatSenaQuantity(detail?.activityMean ?? 0, language)} activity`,
      posteriorUnitsLabel: '—',
      demandPerDayLabel: formatSenaQuantity(detail?.activityMean ?? 0, language),
      reorderTriggerLabel: '—',
      inTransitExposureLabel: formatSenaQuantity(
        linkedSkuIds.reduce((sum, skuId) => sum + (latestPipeline(skuDetailsById[skuId])?.inTransitMean ?? 0), 0),
        language,
      ),
      leadTimeMeanLabel: formatSenaDays(
        linkedSkuIds.reduce((sum, skuId) => sum + (latestLeadTime(skuDetailsById[skuId])?.meanDays ?? 0), 0) /
          Math.max(linkedSkuIds.length, 1),
        language,
      ),
      leadTimeSpreadLabel: formatSenaDays(
        linkedSkuIds.reduce((sum, skuId) => sum + (latestLeadTime(skuDetailsById[skuId])?.stdDays ?? 0), 0) /
          Math.max(linkedSkuIds.length, 1),
        language,
      ),
      reorderPolicyLabels: null,
    });
  }

  entityRows.sort((left, right) => right.pressureScoreValue - left.pressureScoreValue);

  const evidenceRows = [...filteredObservations]
    .reverse()
    .map((observation, index) => {
      const stockSnapshotCount = observation.input.stockSnapshot.length;
      const serviceRankingCount = observation.input.serviceRankings.length;
      const retailRankingCount = observation.input.retailRankings.length;
      const stockoutCount = observation.input.serviceStockouts.length + observation.input.retailStockouts.length;
      const orderPlacedCount = observation.input.orderSignals.filter((signal) => signal.orderPlaced).length;
      const receiptArrivedCount = observation.input.orderSignals.filter((signal) => signal.receiptArrived).length;
      const servicePriceCount = observation.input.servicePrices.length;
      const retailPriceCount = observation.input.retailPrices.length;
      const leadTimeHintCount = observation.input.leadTimeHints.length;
      const channelsPresent = accumulateSignals(observation);
      const affectedEntityLabels = uniqueOrderedStrings(
        [
          ...observation.input.serviceRankings
            .map((serviceId) => serviceById.get(serviceId)?.name)
            .filter((value): value is string => Boolean(value)),
          ...observation.input.retailRankings
            .map((skuId) => skuById.get(skuId)?.name)
            .filter((value): value is string => Boolean(value)),
        ],
        4,
      );

      return {
        id: observation.observationId,
        observedAt: formatSenaDateTime(observation.input.observedAt, language),
        title: index === 0 ? 'Latest observation' : `Observation ${filteredObservations.length - index}`,
        detail: observation.input.notes?.trim() || 'Sparse evidence update with no operator note attached.',
        stockSnapshotLabel: stockSnapshotCount > 0 ? `${stockSnapshotCount}` : '—',
        serviceRankingLabel: serviceRankingCount > 0 ? `${serviceRankingCount}` : '—',
        retailRankingLabel: retailRankingCount > 0 ? `${retailRankingCount}` : '—',
        stockoutFlagsLabel: stockoutCount > 0 ? `${stockoutCount}` : '—',
        orderPlacedLabel: orderPlacedCount > 0 ? `${orderPlacedCount}` : '—',
        receiptArrivedLabel: receiptArrivedCount > 0 ? `${receiptArrivedCount}` : '—',
        servicePriceLabel: servicePriceCount > 0 ? `${servicePriceCount}` : '—',
        retailPriceLabel: retailPriceCount > 0 ? `${retailPriceCount}` : '—',
        leadTimeHintLabel: leadTimeHintCount > 0 ? `${leadTimeHintCount}` : '—',
        noteLabel: observation.input.notes?.trim() ? 'Yes' : '—',
        channelsPresent,
        affectedEntityLabels,
      };
    });

  const fragilityColumns = catalog.skus
    .filter((sku) => activeSkuIds.has(sku.skuId))
    .map((sku) => ({
      skuId: sku.skuId,
      name: sku.name,
    }));

  const fragilityRows: AnalysisFragilityRow[] = eligibleServices
    .map((service) => {
      const detail = serviceDetailsById[service.serviceId];
      const linkedSkuIds = new Set(linkedSkuIdsForService(catalog, service.serviceId));
      return {
        key: `service:${service.serviceId}`,
        entityId: service.serviceId,
        entityType: 'service' as const,
        name: service.name,
        cells: fragilityColumns.map((column) => {
          const contributor = detail?.contributors.find((entry) => entry.skuId === column.skuId) ?? null;
          const skuDetail = skuDetailsById[column.skuId];
          const pipeline = latestPipeline(skuDetail);
          const leadTime = latestLeadTime(skuDetail);
          const reliefSoon = (pipeline?.inTransitMean ?? 0) > 0 && (pipeline?.ageDaysMean ?? 0) <= (leadTime?.meanDays ?? Number.POSITIVE_INFINITY);
          const intensity = linkedSkuIds.has(column.skuId)
            ? clamp((contributor?.usageProbability ?? 0.45) * 0.55 + (contributor?.bottleneckProbability ?? 0.18) * 0.45, 0, 1)
            : 0;
          return {
            key: `${service.serviceId}:${column.skuId}`,
            skuId: column.skuId,
            intensity,
            usageLabel: contributor ? formatSenaPercent(contributor.usageProbability, language) : linkedSkuIds.has(column.skuId) ? 'linked' : '—',
            bottleneckLabel: contributor ? formatSenaPercent(contributor.bottleneckProbability, language) : linkedSkuIds.has(column.skuId) ? '—' : '—',
            pressureLabel: intensity > 0 ? labelForLevel(intensity) : '—',
            reliefLabel: reliefSoon ? 'inbound soon' : linkedSkuIds.has(column.skuId) ? 'no relief' : '—',
            tone: intensity >= 0.6 ? 'danger' : intensity >= 0.35 ? 'warning' : intensity > 0 ? 'info' : 'neutral',
          };
        }),
      };
    });

  const strongestChannels = signalCounter(filteredObservations).slice(0, 3).map(([label, count]) => {
    return `${label} (${formatWholeNumber(count, language)})`;
  });
  const currentRegime = normalizeRegimeLabel(intervalRows.at(-1)?.dominantRegime ?? workspaceSummary.topRegime);
  const priceShiftCount = filteredObservations.reduce((sum, observation) => {
    return sum + observation.input.servicePrices.length + observation.input.retailPrices.length;
  }, 0);
  const avgPipelinePressure =
    entityRows
      .filter((row) => row.entityType === 'sku')
      .reduce((sum, row) => sum + row.pressureScoreValue, 0) /
    Math.max(entityRows.filter((row) => row.entityType === 'sku').length * 100, 1);
  const avgLeadTimeRisk =
    entityRows
      .filter((row) => row.entityType === 'sku')
      .reduce((sum, row) => sum + (row.leadTimeRiskLabel === 'critical' ? 1 : row.leadTimeRiskLabel === 'high' ? 0.75 : row.leadTimeRiskLabel === 'medium' ? 0.45 : 0.2), 0) /
    Math.max(entityRows.filter((row) => row.entityType === 'sku').length, 1);
  const topEntity = entityRows[0] ?? null;

  const diagnosticsReadouts: AnalysisDiagnosticReadout[] = [
    {
      key: 'regime',
      label: 'Current regime',
      value: currentRegime,
      detail: `${formatWholeNumber(intervalRows.length, language)} intervals in view`,
      tone: 'info',
    },
    {
      key: 'pipeline',
      label: 'Pipeline pressure',
      value: labelForLevel(avgPipelinePressure),
      detail: `${formatWholeNumber(workspaceSummary.pendingReorderCount, language)} pending reorder cues`,
      tone: coverTone(avgPipelinePressure),
    },
    {
      key: 'lead-time',
      label: 'Lead-time stability',
      value: avgLeadTimeRisk >= 0.62 ? 'drifting' : avgLeadTimeRisk >= 0.38 ? 'watching' : 'stable',
      detail: `${formatSenaPercent(avgLeadTimeRisk, language)} composite risk`,
      tone: coverTone(avgLeadTimeRisk),
    },
    {
      key: 'price',
      label: 'Price shift activity',
      value: priceShiftCount >= 4 ? 'active' : priceShiftCount > 0 ? 'watching' : 'quiet',
      detail: `${formatWholeNumber(priceShiftCount, language)} price observations`,
      tone: priceShiftCount >= 4 ? 'price-up' : priceShiftCount > 0 ? 'warning' : 'neutral',
    },
    {
      key: 'coverage',
      label: 'Model coverage',
      value: coverageBand(diagnostics?.coverageEstimate ?? 0),
      detail: `${formatSenaPercent(diagnostics?.coverageEstimate ?? 0, language)} coverage estimate`,
      tone: coverTone(1 - (diagnostics?.coverageEstimate ?? 0)),
    },
    {
      key: 'bottleneck',
      label: 'Top structural bottleneck',
      value: topEntity?.name ?? 'None',
      detail: topEntity ? `${topEntity.pressureScoreLabel} pressure score` : 'No structural bottleneck detected',
      tone: topEntity?.tone ?? 'neutral',
    },
  ];

  return {
    lastUpdatedLabel: latestObservedAt ? `Updated ${formatSenaDateTime(latestObservedAt, language)}` : 'No SENA observation loaded',
    diagnostics: diagnosticsReadouts,
    intervals: intervalRows,
    workbench,
    entityRows,
    evidenceRows,
    fragilityRows,
    fragilityColumns,
    inspectorOverview: {
      dominantRegime: currentRegime,
      changePointProbability: formatSenaPercent(diagnostics?.changePointProbability ?? 0, language),
      coverageSummary: `${formatWholeNumber(Math.round(diagnostics?.effectiveSampleSizeMean ?? 0), language)} ESS · ${coverageBand(diagnostics?.coverageEstimate ?? 0)} coverage`,
      strongestChannels,
      affectedEntities: topEntityNames(entityRows, 4),
    },
    settings: {
      runId: workspaceSummary.runId,
      latestObservedAt: formatSenaDateTime(latestObservedAt, language),
      observationsUsed: formatWholeNumber(filteredObservations.length, language),
      intervalCount: formatWholeNumber(intervalRows.length, language),
      smoothingLabel: diagnostics?.smoothingEnabled ? 'Enabled' : 'Disabled',
      effectiveSampleSize: formatWholeNumber(Math.round(diagnostics?.effectiveSampleSizeMean ?? 0), language),
      predictiveError: formatSenaPercent(diagnostics?.posteriorPredictiveErrorMean ?? 0, language),
      coverageEstimate: formatSenaPercent(diagnostics?.coverageEstimate ?? 0, language),
      scopeSummary: scopeSummary(scope),
    },
    internalNavSummary: `${scopeSummary(scope)} · ${formatWholeNumber(filteredObservations.length, language)} observations · ${formatWholeNumber(intervalRows.length, language)} intervals`,
  };
}
