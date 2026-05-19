import type { AppLanguage } from '@shared/inventory';
import type {
  SenaCatalog,
  SenaObservationRecord,
  SenaRecordUpdateContext,
  SenaServiceDetail,
  SenaSkuDetail,
  SenaWorkspaceSummary,
} from '@shared/sena';
import { formatDecimal, formatWholeNumber } from '@/lib/format';
import {
  linkedServiceIdsForSku,
  linkedSkuIdsForService,
  matchesServiceSupplier,
  matchesSkuSupplier,
  type SupplierFilterValue,
} from '@/lib/sena-catalog';
import { translateUiLiteral } from '@/lib/translations';
import { latestObservationAt } from '@/routes/observation-payload';
import { formatSenaDate, formatSenaDays, formatSenaPercent, formatSenaUnits } from '@/routes/sku-detail/format';
import type {
  InventoryProjectionHorizonValue,
  InventoryRangeValue,
  InventoryRowSetValue,
  InventoryScopeValue,
  InventoryViewPresetValue,
} from '@/lib/navigation-state';
import { buildServiceDetailHref, buildSkuDetailHref } from '@/lib/navigation-state';

const INVENTORY_FOCUS_ROW_LIMIT = 5;

export type InventoryRowType = 'sku' | 'service';
export type InventoryColumnKey =
  | 'adjustments'
  | 'cover'
  | 'demand'
  | 'flow'
  | 'freshness'
  | 'inTransit'
  | 'inventoryPosition'
  | 'item'
  | 'leadTime'
  | 'leadTimeUncertainty'
  | 'lostDemand'
  | 'nextReceipt'
  | 'onHand'
  | 'orderProbability'
  | 'pipeline'
  | 'projection'
  | 'receipts'
  | 'serviceExposure'
  | 'stockoutRisk'
  | 'unitsIn'
  | 'unitsOut';

export type ProjectionCell = {
  high: number | null;
  label: string;
  low: number | null;
  mean: number | null;
  risk: number | null;
};

export type InventorySkuRow = {
  adjustments: number | null;
  demandPerDay: number;
  daysOfCover: number | null;
  flowIn: number | null;
  flowOut: number | null;
  focusReasonCodes: string[];
  freshnessAgeDays: number | null;
  freshnessLabel: string;
  href: string;
  id: string;
  imagePath: string | null;
  inTransitMean: number | null;
  inventoryPosition: number | null;
  latestCountAt: string | null;
  leadTimeMeanDays: number | null;
  leadTimeStdDays: number | null;
  linkedServiceSummary: string;
  lostDemand: number | null;
  name: string;
  nextReceiptLabel: string | null;
  onHandHigh: number;
  onHandLow: number;
  onHandMean: number;
  orderProbability: number | null;
  projectedUnitsByHorizon: Record<InventoryProjectionHorizonValue, ProjectionCell>;
  receipts: number | null;
  recommendedOrderHigh: number;
  recommendedOrderLow: number;
  recommendedOrderUnits: number;
  recommendationIssued: boolean;
  reorderPoint: number;
  reorderTriggerProbability: number;
  safetyStock: number;
  serviceExposureSort: number;
  stockoutRisk: number;
  supplierName: string | null;
  type: 'sku';
};

export type InventoryServiceRow = {
  activityMean: number;
  bottleneckProbability: number;
  bottleneckSkuId: string | null;
  bottleneckSkuName: string | null;
  contributorHealthLabel: string;
  focusReasonCodes: string[];
  freshnessLabel: string;
  href: string;
  id: string;
  imagePath: string | null;
  name: string;
  projectedSellableByHorizon: Record<InventoryProjectionHorizonValue, ProjectionCell>;
  recoveryPipelineLabel: string | null;
  sellableUnitsHigh: number | null;
  sellableUnitsLow: number | null;
  sellableUnitsMean: number;
  serviceExposureSort: number;
  type: 'service';
};

export type InventoryGridRow = InventorySkuRow | InventoryServiceRow;

export type InventoryStripMetric = {
  detail: string;
  key: string;
  label: string;
  value: string;
};

export type ProjectionMatrixRow = {
  horizonCells: Record<'today' | InventoryProjectionHorizonValue, ProjectionCell>;
  id: string;
  name: string;
  type: InventoryRowType;
};

export type InventoryViewModel = {
  coverDistribution: Array<{ key: string; label: string; value: number }>;
  focusRows: InventoryGridRow[];
  freshnessSummary: Array<{ key: string; label: string; value: number }>;
  inboundSchedule: Array<{ key: string; label: string; value: number }>;
  lastUpdatedLabel: string;
  projectionMatrix: ProjectionMatrixRow[];
  rows: InventoryGridRow[];
  strip: InventoryStripMetric[];
  visibleRows: InventoryGridRow[];
  windowLabel: string;
};

export type DeriveInventoryViewModelInput = {
  catalog: SenaCatalog;
  customColumns?: string[];
  language: AppLanguage;
  observations: SenaObservationRecord[];
  projectionHorizon: InventoryProjectionHorizonValue;
  range: InventoryRangeValue;
  recordUpdateContext: SenaRecordUpdateContext | null;
  rowSet: InventoryRowSetValue;
  scope: InventoryScopeValue;
  serviceDetailsById: Map<string, SenaServiceDetail>;
  skuDetailsById: Map<string, SenaSkuDetail>;
  supplier: SupplierFilterValue;
  viewPreset: InventoryViewPresetValue;
  workspaceSummary: SenaWorkspaceSummary;
};

const HORIZONS: InventoryProjectionHorizonValue[] = ['7d', '14d', '30d', '60d'];

function horizonDays(horizon: InventoryProjectionHorizonValue) {
  return Number.parseInt(horizon, 10);
}

function rangeDays(range: InventoryRangeValue) {
  if (range === '7d') {
    return 7;
  }
  if (range === '90d') {
    return 90;
  }
  return 30;
}

function latestObservedAt(workspaceSummary: SenaWorkspaceSummary, observations: SenaObservationRecord[]) {
  return workspaceSummary.latestObservedAt ?? latestObservationAt(observations);
}

function ageDays(fromAt: string | null, toAt: string | null) {
  if (!fromAt || !toAt) {
    return null;
  }
  const fromTime = new Date(fromAt).getTime();
  const toTime = new Date(toAt).getTime();
  if (Number.isNaN(fromTime) || Number.isNaN(toTime)) {
    return null;
  }
  return Math.max(0, Math.round((toTime - fromTime) / 86_400_000));
}

function sumOrNull(values: number[]) {
  const finiteValues = values.filter(Number.isFinite);
  if (finiteValues.length === 0) {
    return null;
  }
  return finiteValues.reduce((sum, value) => sum + value, 0);
}

function finiteOrNull(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nonNegativeOrZero(value: number | null | undefined) {
  const finiteValue = finiteOrNull(value);
  return finiteValue == null ? 0 : Math.max(0, finiteValue);
}

function nonNegativeOrNull(value: number | null | undefined) {
  const finiteValue = finiteOrNull(value);
  return finiteValue == null ? null : Math.max(0, finiteValue);
}

function probabilityOrZero(value: number | null | undefined) {
  const finiteValue = finiteOrNull(value);
  return finiteValue == null ? 0 : Math.min(1, Math.max(0, finiteValue));
}

function signedUnits(value: number | null, language: AppLanguage) {
  if (value == null) {
    return '-';
  }
  const formatted = formatWholeNumber(Math.abs(value), language);
  if (value > 0) {
    return `+${formatted}`;
  }
  if (value < 0) {
    return `-${formatted}`;
  }
  return formatted;
}

function countLabel(count: number, singular: string, plural: string, language: AppLanguage) {
  return translateUiLiteral(language, count === 1 ? singular : plural, {
    count: formatWholeNumber(count, language),
  });
}

function formatSenaInterval(low: number | null, high: number | null, language: AppLanguage) {
  return `[${formatSenaUnits(low, language)}, ${formatSenaUnits(high, language)}]`;
}

function formatSenaEstimate(mean: number | null, low: number | null, high: number | null, language: AppLanguage) {
  return `${formatSenaUnits(mean, language)} / ${formatSenaInterval(low, high, language)}`;
}

function formatSenaEstimateParts(mean: number | null, low: number | null, high: number | null, language: AppLanguage, showConfidenceInterval: boolean) {
  return {
    primary: formatSenaUnits(mean, language),
    secondary: showConfidenceInterval ? formatSenaInterval(low, high, language) : null,
  };
}

function formatProjectionParts(cell: ProjectionCell, horizon: InventoryProjectionHorizonValue, language: AppLanguage, showConfidenceInterval: boolean) {
  return {
    primary: `${horizon}: ${formatSenaUnits(cell.mean, language)}`,
    secondary: showConfidenceInterval ? formatSenaInterval(cell.low, cell.high, language) : null,
  };
}

function formatProjectionCell(mean: number | null, low: number | null, high: number | null, language: AppLanguage): ProjectionCell {
  const finiteMean = nonNegativeOrNull(mean);
  if (finiteMean == null) {
    return { high: null, label: '-', low: null, mean: null, risk: null };
  }
  const boundedMean = finiteMean;
  const boundedLow = nonNegativeOrNull(low) ?? boundedMean;
  const boundedHigh = Math.max(boundedLow, nonNegativeOrNull(high) ?? boundedMean);
  return {
    high: boundedHigh,
    label: formatSenaEstimate(boundedMean, boundedLow, boundedHigh, language),
    low: boundedLow,
    mean: boundedMean,
    risk: boundedLow <= 0 ? 1 : boundedMean <= 0 ? 0.8 : 0,
  };
}

function projectedUnitsByHorizon({
  demandPerDay,
  inTransitMean,
  language,
  onHandHigh,
  onHandLow,
  onHandMean,
}: {
  demandPerDay: number;
  inTransitMean: number;
  language: AppLanguage;
  onHandHigh: number;
  onHandLow: number;
  onHandMean: number;
}): Record<InventoryProjectionHorizonValue, ProjectionCell> {
  return Object.fromEntries(
    HORIZONS.map((horizon) => {
      const days = horizonDays(horizon);
      return [
        horizon,
        formatProjectionCell(
          onHandMean + inTransitMean - demandPerDay * days,
          onHandLow + inTransitMean - demandPerDay * days,
          onHandHigh + inTransitMean - demandPerDay * days,
          language,
        ),
      ];
    }),
  ) as Record<InventoryProjectionHorizonValue, ProjectionCell>;
}

function latestFlow(detail: SenaSkuDetail | null, windowDays: number, latestAt: string | null) {
  const intervals = detail?.demandPosterior ?? [];
  const latestTime = latestAt ? new Date(latestAt).getTime() : null;
  const visibleIntervals = intervals.filter((interval) => {
    if (latestTime == null) {
      return true;
    }
    const endTime = new Date(interval.endAt).getTime();
    return Number.isNaN(endTime) ? true : latestTime - endTime <= windowDays * 86_400_000;
  });
  return {
    adjustments: sumOrNull(visibleIntervals.map((interval) => interval.adjustmentsMean)),
    inventoryPosition: finiteOrNull(visibleIntervals.at(-1)?.inventoryPositionMean) ?? finiteOrNull(visibleIntervals.at(-1)?.preClampInventoryMean),
    lostDemand: sumOrNull(visibleIntervals.map((interval) => interval.lostDemandMean ?? 0)),
    receipts: sumOrNull(visibleIntervals.map((interval) => interval.receiptsMean)),
    unitsIn: sumOrNull(visibleIntervals.map((interval) => interval.receiptsMean)),
    unitsOut: sumOrNull(visibleIntervals.map((interval) => interval.realizedConsumptionMean)),
  };
}

function latestCountAnchor(recordUpdateContext: SenaRecordUpdateContext | null, skuId: string) {
  return recordUpdateContext?.latestStockBySku[skuId] ?? null;
}

function freshnessLabel(age: number | null, language: AppLanguage) {
  if (age == null) {
    return translateUiLiteral(language, 'No recent count');
  }
  if (age <= 1) {
    return translateUiLiteral(language, 'counted today');
  }
  return translateUiLiteral(language, 'counted {days}d ago', {
    days: formatWholeNumber(age, language),
  });
}

function isFreshnessStale(age: number | null) {
  return age == null || age > 14;
}

function receiptLabel(latestAt: string | null, leadTimeMeanDays: number | null, language: AppLanguage) {
  if (!latestAt || leadTimeMeanDays == null || !Number.isFinite(leadTimeMeanDays)) {
    return null;
  }
  const base = new Date(latestAt);
  if (Number.isNaN(base.getTime())) {
    return null;
  }
  base.setDate(base.getDate() + Math.max(0, Math.round(leadTimeMeanDays)));
  return translateUiLiteral(language, 'due {date}', { date: formatSenaDate(base.toISOString(), language) });
}

function skuRows(input: DeriveInventoryViewModelInput) {
  const latestAt = latestObservedAt(input.workspaceSummary, input.observations);
  const summaryBySkuId = new Map(input.workspaceSummary.skuSummaries.map((summary) => [summary.skuId, summary]));
  const serviceById = new Map(input.catalog.services.map((service) => [service.serviceId, service]));
  const windowDays = rangeDays(input.range);

  return input.catalog.skus
    .filter((sku) => matchesSkuSupplier(sku, input.supplier))
    .flatMap((sku): InventorySkuRow[] => {
      const summary = summaryBySkuId.get(sku.skuId) ?? null;
      const detail = input.skuDetailsById.get(sku.skuId) ?? null;
      const latestPipeline = detail?.pipelinePosterior.at(-1) ?? null;
      const latestLeadTime = detail?.leadTimePosterior.at(-1) ?? null;
      const inTransitMean = nonNegativeOrZero(latestPipeline?.inTransitMean);
      const flow = latestFlow(detail, windowDays, latestAt);
      const linkedServices = linkedServiceIdsForSku(input.catalog, sku.skuId)
        .map((serviceId) => serviceById.get(serviceId))
        .filter((service): service is NonNullable<typeof service> => Boolean(service));
      const countAnchor = latestCountAnchor(input.recordUpdateContext, sku.skuId);
      const countAge = ageDays(countAnchor?.observedAt ?? null, latestAt);
      const recommendation = summary?.reorderQuantity;
      const leadTimeMeanDays = nonNegativeOrNull(latestLeadTime?.meanDays) ?? nonNegativeOrNull(summary?.leadTimeMeanDays) ?? nonNegativeOrNull(sku.leadTimeMeanDaysHint);
      const leadTimeStdDays = nonNegativeOrNull(latestLeadTime?.stdDays) ?? nonNegativeOrNull(summary?.leadTimeStdDays) ?? nonNegativeOrNull(sku.leadTimeStdDaysHint);
      const daysOfCover = nonNegativeOrNull(summary?.daysOfCover);
      const demandPerDay = nonNegativeOrZero(summary?.demandPerDayMean);
      const onHandHigh = nonNegativeOrZero(summary?.credibleIntervalHigh);
      const onHandLow = Math.min(onHandHigh, nonNegativeOrZero(summary?.credibleIntervalLow));
      const onHandMean = nonNegativeOrZero(summary?.latestPosteriorUnits);
      const reorderPoint = nonNegativeOrZero(summary?.reorderPoint);
      const reorderTriggerProbability = probabilityOrZero(summary?.reorderTriggerProbability);
      const stockoutRisk = probabilityOrZero(summary?.stockoutRisk);
      const projection = projectedUnitsByHorizon({
        demandPerDay,
        inTransitMean,
        language: input.language,
        onHandHigh,
        onHandLow,
        onHandMean,
      });
      const focusReasonCodes = [
        stockoutRisk >= 0.35 ? 'stockout-risk' : null,
        daysOfCover == null ? 'unknown-cover' : null,
        daysOfCover != null && leadTimeMeanDays != null && leadTimeStdDays != null && daysOfCover <= leadTimeMeanDays + leadTimeStdDays
          ? 'low-cover'
          : null,
        reorderTriggerProbability >= 0.5 ? 'reorder-trigger' : null,
        recommendation?.recommendationIssued ? 'recommendation-issued' : null,
        inTransitMean > 0 ? 'in-transit' : null,
        isFreshnessStale(countAge) ? 'stale-count' : null,
      ].filter((value): value is string => Boolean(value));

      return [{
        adjustments: flow.adjustments,
        demandPerDay,
        daysOfCover,
        flowIn: flow.unitsIn,
        flowOut: flow.unitsOut,
        focusReasonCodes,
        freshnessAgeDays: countAge,
        freshnessLabel: freshnessLabel(countAge, input.language),
        href: buildSkuDetailHref(sku.skuId),
        id: sku.skuId,
        imagePath: sku.imagePath ?? null,
        inTransitMean,
        inventoryPosition: flow.inventoryPosition,
        latestCountAt: countAnchor?.observedAt ?? null,
        leadTimeMeanDays,
        leadTimeStdDays,
        linkedServiceSummary: linkedServices.length > 0
          ? countLabel(linkedServices.length, '{count} service', '{count} services', input.language)
          : translateUiLiteral(input.language, 'No linked services'),
        lostDemand: flow.lostDemand,
        name: sku.name,
        nextReceiptLabel: inTransitMean > 0 ? receiptLabel(latestAt, leadTimeMeanDays, input.language) : null,
        onHandHigh,
        onHandLow,
        onHandMean,
        orderProbability: finiteOrNull(latestPipeline?.orderProbability),
        projectedUnitsByHorizon: projection,
        receipts: flow.receipts,
        recommendedOrderHigh: nonNegativeOrZero(recommendation?.likelyRangeHigh),
        recommendedOrderLow: nonNegativeOrZero(recommendation?.likelyRangeLow),
        recommendedOrderUnits: nonNegativeOrZero(recommendation?.recommendedUnits),
        recommendationIssued: Boolean(recommendation?.recommendationIssued),
        reorderPoint,
        reorderTriggerProbability,
        safetyStock: nonNegativeOrZero(summary?.safetyStock),
        serviceExposureSort: linkedServices.length,
        stockoutRisk,
        supplierName: sku.supplierName ?? null,
        type: 'sku',
      }];
    });
}

function serviceRows(input: DeriveInventoryViewModelInput, skus: InventorySkuRow[]) {
  const skuById = new Map(skus.map((row) => [row.id, row]));
  return input.catalog.services
    .filter((service) => matchesServiceSupplier(service, input.catalog, input.supplier))
    .map((service): InventoryServiceRow => {
      const detail = input.serviceDetailsById.get(service.serviceId) ?? null;
      const contributorIds = linkedSkuIdsForService(input.catalog, service.serviceId);
      const contributors = contributorIds.map((skuId) => skuById.get(skuId)).filter((row): row is InventorySkuRow => Boolean(row));
      const sellableMean = contributors.length > 0
        ? Math.max(0, Math.min(...contributors.map((row) => row.onHandMean)))
        : 0;
      const sellableLow = contributors.length > 0 ? Math.max(0, Math.min(...contributors.map((row) => row.onHandLow))) : null;
      const sellableHigh = contributors.length > 0 ? Math.max(0, Math.min(...contributors.map((row) => row.onHandHigh))) : null;
      const detailContributor = [...(detail?.contributors ?? [])].sort((left, right) => probabilityOrZero(right.bottleneckProbability) - probabilityOrZero(left.bottleneckProbability))[0] ?? null;
      const bottleneckSku = detailContributor ? skuById.get(detailContributor.skuId) ?? null : null;
      const bottleneckProbability = probabilityOrZero(detail?.bottleneckProbability ?? detailContributor?.bottleneckProbability ?? bottleneckSku?.stockoutRisk);
      const activityMean = nonNegativeOrNull(detail?.activityMean) ?? Math.max(1, sellableMean);
      const projectedSellableByHorizon = Object.fromEntries(
        HORIZONS.map((horizon) => [
          horizon,
          formatProjectionCell(
            sellableMean - activityMean * (horizonDays(horizon) / 7),
            sellableLow == null ? null : sellableLow - activityMean * (horizonDays(horizon) / 7),
            sellableHigh == null ? null : sellableHigh - activityMean * (horizonDays(horizon) / 7),
            input.language,
          ),
        ]),
      ) as Record<InventoryProjectionHorizonValue, ProjectionCell>;
      const inboundContributor = contributors.find((row) => (row.inTransitMean ?? 0) > 0);
      const focusReasonCodes = [
        bottleneckProbability >= 0.5 ? 'service-bottleneck' : null,
        inboundContributor ? 'recovery-pipeline' : null,
        contributors.some((row) => row.focusReasonCodes.includes('stale-count')) ? 'stale-count' : null,
      ].filter((value): value is string => Boolean(value));

      return {
        activityMean,
        bottleneckProbability,
        bottleneckSkuId: bottleneckSku?.id ?? null,
        bottleneckSkuName: bottleneckSku?.name ?? null,
        contributorHealthLabel: contributors.length > 0
          ? countLabel(contributors.length, '{count} contributor', '{count} contributors', input.language)
          : translateUiLiteral(input.language, 'No linked SKUs'),
        focusReasonCodes,
        freshnessLabel: contributors.length > 0
          ? contributors
              .sort((left, right) => (right.freshnessAgeDays ?? 9999) - (left.freshnessAgeDays ?? 9999))[0]?.freshnessLabel ?? '-'
          : translateUiLiteral(input.language, 'No contributor counts'),
        href: buildServiceDetailHref(service.serviceId),
        id: service.serviceId,
        imagePath: service.imagePath ?? null,
        name: service.name,
        projectedSellableByHorizon,
        recoveryPipelineLabel: inboundContributor?.nextReceiptLabel ?? null,
        sellableUnitsHigh: sellableHigh,
        sellableUnitsLow: sellableLow,
        sellableUnitsMean: sellableMean,
        serviceExposureSort: contributors.length,
        type: 'service',
      };
    });
}

function applyScope(rows: InventoryGridRow[], scope: InventoryScopeValue) {
  if (scope === 'skus') {
    return rows.filter((row) => row.type === 'sku');
  }
  if (scope === 'services') {
    return rows.filter((row) => row.type === 'service');
  }
  return rows;
}

function focusSortValue(row: InventoryGridRow) {
  if (row.type === 'sku') {
    return row.stockoutRisk + row.reorderTriggerProbability + (row.daysOfCover == null ? 0.5 : Math.max(0, 14 - row.daysOfCover) / 14);
  }
  return row.bottleneckProbability + (row.sellableUnitsMean <= 0 ? 1 : 0);
}

function visibleRows(rows: InventoryGridRow[], rowSet: InventoryRowSetValue) {
  const scopedRows = [...rows].sort((left, right) => {
    const focusDelta = focusSortValue(right) - focusSortValue(left);
    if (focusDelta !== 0) {
      return focusDelta;
    }
    if (left.type !== right.type) {
      return left.type === 'sku' ? -1 : 1;
    }
    return left.name.localeCompare(right.name);
  });
  if (rowSet === 'all') {
    return scopedRows;
  }
  return scopedRows.filter((row) => row.focusReasonCodes.length > 0).slice(0, INVENTORY_FOCUS_ROW_LIMIT);
}

function coverDistribution(rows: InventorySkuRow[], language: AppLanguage) {
  const buckets = [
    { key: '0d', label: '0d', value: 0 },
    { key: '1-3d', label: '1-3d', value: 0 },
    { key: '4-7d', label: '4-7d', value: 0 },
    { key: '8-14d', label: '8-14d', value: 0 },
    { key: '15d+', label: '15d+', value: 0 },
  ];
  for (const row of rows) {
    const cover = row.daysOfCover;
    if (cover == null || cover <= 0) {
      buckets[0]!.value += 1;
    } else if (cover <= 3) {
      buckets[1]!.value += 1;
    } else if (cover <= 7) {
      buckets[2]!.value += 1;
    } else if (cover <= 14) {
      buckets[3]!.value += 1;
    } else {
      buckets[4]!.value += 1;
    }
  }
  return buckets.map((bucket) => ({ ...bucket, label: translateUiLiteral(language, bucket.label) }));
}

function freshnessSummary(rows: InventorySkuRow[], language: AppLanguage) {
  const fresh = rows.filter((row) => row.freshnessAgeDays != null && row.freshnessAgeDays <= 3).length;
  const aging = rows.filter((row) => row.freshnessAgeDays != null && row.freshnessAgeDays > 3 && row.freshnessAgeDays <= 14).length;
  const stale = rows.filter((row) => row.freshnessAgeDays != null && row.freshnessAgeDays > 14).length;
  const none = rows.filter((row) => row.freshnessAgeDays == null).length;
  return [
    { key: 'fresh', label: translateUiLiteral(language, 'Fresh'), value: fresh },
    { key: 'aging', label: translateUiLiteral(language, 'Aging'), value: aging },
    { key: 'stale', label: translateUiLiteral(language, 'Stale'), value: stale },
    { key: 'none', label: translateUiLiteral(language, 'No recent count'), value: none },
  ];
}

function inboundSchedule(rows: InventorySkuRow[], language: AppLanguage) {
  const inbound = rows.filter((row) => (row.inTransitMean ?? 0) > 0).length;
  return [
    { key: 'overdue', label: translateUiLiteral(language, 'Overdue'), value: 0 },
    { key: 'today', label: translateUiLiteral(language, 'Today'), value: 0 },
    { key: 'week', label: translateUiLiteral(language, 'This week'), value: inbound },
    { key: 'later', label: translateUiLiteral(language, 'Later'), value: 0 },
  ];
}

function median(values: number[]) {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2 : sorted[middle] ?? null;
}

function projectionMatrix(rows: InventoryGridRow[], language: AppLanguage): ProjectionMatrixRow[] {
  return rows.slice(0, 12).map((row) => {
    const projections = row.type === 'sku' ? row.projectedUnitsByHorizon : row.projectedSellableByHorizon;
    const today = row.type === 'sku'
      ? formatProjectionCell(row.onHandMean, row.onHandLow, row.onHandHigh, language)
      : formatProjectionCell(row.sellableUnitsMean, row.sellableUnitsLow, row.sellableUnitsHigh, language);
    return {
      horizonCells: { today, ...projections },
      id: row.id,
      name: row.name,
      type: row.type,
    };
  });
}

export function deriveInventoryViewModel(input: DeriveInventoryViewModelInput): InventoryViewModel {
  const skus = skuRows(input);
  const services = serviceRows(input, skus);
  const scopedRows = applyScope([...skus, ...services], input.scope);
  const focusRows = scopedRows.filter((row) => row.focusReasonCodes.length > 0);
  const renderedRows = visibleRows(scopedRows, input.rowSet);
  const belowReorder = skus.filter((row) => row.onHandMean <= row.reorderPoint).length;
  const medianCover = median(skus.map((row) => row.daysOfCover).filter((value): value is number => value != null));
  const unitsIn = sumOrNull(skus.map((row) => row.flowIn ?? 0));
  const unitsOut = sumOrNull(skus.map((row) => row.flowOut ?? 0));
  const inTransit = sumOrNull(skus.map((row) => row.inTransitMean ?? 0));

  return {
    coverDistribution: coverDistribution(skus, input.language),
    focusRows,
    freshnessSummary: freshnessSummary(skus, input.language),
    inboundSchedule: inboundSchedule(skus, input.language),
    lastUpdatedLabel: formatSenaDate(latestObservedAt(input.workspaceSummary, input.observations), input.language),
    projectionMatrix: projectionMatrix(renderedRows, input.language),
    rows: scopedRows,
    strip: [
      {
        key: 'below-reorder',
        label: translateUiLiteral(input.language, 'Below reorder'),
        value: formatWholeNumber(belowReorder, input.language),
        detail: countLabel(skus.length, '{count} SKU tracked', '{count} SKUs tracked', input.language),
      },
      {
        key: 'median-cover',
        label: translateUiLiteral(input.language, 'Median cover'),
        value: medianCover == null ? '-' : formatSenaDays(medianCover, input.language),
        detail: translateUiLiteral(input.language, 'SKU days of cover'),
      },
      {
        key: 'units-in',
        label: translateUiLiteral(input.language, 'Units in'),
        value: signedUnits(unitsIn, input.language),
        detail: translateUiLiteral(input.language, 'Selected range receipts'),
      },
      {
        key: 'units-out',
        label: translateUiLiteral(input.language, 'Units out'),
        value: signedUnits(unitsOut == null ? null : -unitsOut, input.language),
        detail: translateUiLiteral(input.language, 'Selected range use'),
      },
      {
        key: 'in-transit',
        label: translateUiLiteral(input.language, 'In transit'),
        value: formatSenaUnits(inTransit, input.language),
        detail: translateUiLiteral(input.language, 'Pipeline units'),
      },
    ],
    visibleRows: renderedRows,
    windowLabel: input.range === 'custom'
      ? translateUiLiteral(input.language, 'custom range')
      : translateUiLiteral(input.language, 'last {days}d', { days: rangeDays(input.range) }),
  };
}

export function formatInventoryCell(row: InventoryGridRow, column: InventoryColumnKey, language: AppLanguage, horizon: InventoryProjectionHorizonValue) {
  if (column === 'item') {
    return row.name;
  }
  if (row.type === 'service') {
    switch (column) {
      case 'onHand':
        return formatSenaEstimate(row.sellableUnitsMean, row.sellableUnitsLow, row.sellableUnitsHigh, language);
      case 'cover':
      case 'serviceExposure':
        return row.contributorHealthLabel;
      case 'projection':
        return `${horizon}: ${row.projectedSellableByHorizon[horizon].label}`;
      case 'pipeline':
      case 'nextReceipt':
        return row.recoveryPipelineLabel ?? '-';
      case 'freshness':
        return row.freshnessLabel;
      case 'stockoutRisk':
        return formatSenaPercent(row.bottleneckProbability, language);
      case 'demand':
        return formatDecimal(row.activityMean, language, 1);
      default:
        return '-';
    }
  }
  switch (column) {
    case 'adjustments':
      return signedUnits(row.adjustments, language);
    case 'cover':
      return `${formatSenaDays(row.daysOfCover, language)} / ROP ${formatSenaUnits(row.reorderPoint, language)}`;
    case 'demand':
      return formatDecimal(row.demandPerDay, language, 1);
    case 'flow':
      return `${signedUnits(row.flowIn, language)} / ${signedUnits(row.flowOut == null ? null : -row.flowOut, language)} / ${signedUnits(row.adjustments, language)}`;
    case 'freshness':
      return row.freshnessLabel;
    case 'inTransit':
      return formatSenaUnits(row.inTransitMean, language);
    case 'inventoryPosition':
      return formatSenaUnits(row.inventoryPosition, language);
    case 'leadTime':
      return formatSenaDays(row.leadTimeMeanDays, language);
    case 'leadTimeUncertainty':
      return formatSenaDays(row.leadTimeStdDays, language);
    case 'lostDemand':
      return formatSenaUnits(row.lostDemand, language);
    case 'nextReceipt':
      return row.nextReceiptLabel ?? '-';
    case 'onHand':
      return formatSenaEstimate(row.onHandMean, row.onHandLow, row.onHandHigh, language);
    case 'orderProbability':
      return formatSenaPercent(row.orderProbability, language);
    case 'pipeline':
      return `${formatSenaUnits(row.inTransitMean, language)} / ${row.nextReceiptLabel ?? '-'}`;
    case 'projection':
      return `${horizon}: ${row.projectedUnitsByHorizon[horizon].label}`;
    case 'receipts':
    case 'unitsIn':
      return signedUnits(row.flowIn, language);
    case 'serviceExposure':
      return row.linkedServiceSummary;
    case 'stockoutRisk':
      return formatSenaPercent(row.stockoutRisk, language);
    case 'unitsOut':
      return signedUnits(row.flowOut == null ? null : -row.flowOut, language);
    default:
      return '-';
  }
}

export function formatInventoryCellParts(row: InventoryGridRow, column: InventoryColumnKey, language: AppLanguage, horizon: InventoryProjectionHorizonValue, showConfidenceInterval: boolean) {
  if (row.type === 'service') {
    switch (column) {
      case 'onHand':
        return formatSenaEstimateParts(row.sellableUnitsMean, row.sellableUnitsLow, row.sellableUnitsHigh, language, showConfidenceInterval);
      case 'projection':
        return formatProjectionParts(row.projectedSellableByHorizon[horizon], horizon, language, showConfidenceInterval);
      default:
        return { primary: formatInventoryCell(row, column, language, horizon), secondary: null };
    }
  }

  switch (column) {
    case 'onHand':
      return formatSenaEstimateParts(row.onHandMean, row.onHandLow, row.onHandHigh, language, showConfidenceInterval);
    case 'cover':
      return {
        primary: formatSenaDays(row.daysOfCover, language),
        secondary: `ROP ${formatSenaUnits(row.reorderPoint, language)}`,
      };
    case 'flow':
      return {
        primary: signedUnits(row.flowIn, language),
        secondary: `${signedUnits(row.flowOut == null ? null : -row.flowOut, language)} / ${signedUnits(row.adjustments, language)}`,
      };
    case 'pipeline':
      return {
        primary: formatSenaUnits(row.inTransitMean, language),
        secondary: row.nextReceiptLabel ?? '-',
      };
    case 'projection':
      return formatProjectionParts(row.projectedUnitsByHorizon[horizon], horizon, language, showConfidenceInterval);
    default:
      return { primary: formatInventoryCell(row, column, language, horizon), secondary: null };
  }
}
